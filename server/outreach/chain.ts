import { fireNotify } from '../cc-services.js'
import { appendLog } from './log.js'
import { rt, syncOutreachRuntime, persistRun, idleRun, touchRun } from './runtime.js'
import {
  getOutreachSettings,
  saveOutreachSettings,
  resolveSendProfileName,
} from './settings.js'
import type { OutreachSettings } from './types.js'
import {
  countHeadlessFindRuns,
  hardStopAllFinds,
  killLeftoverHeadlessFinders,
  sleepSync,
} from './find-process.js'
import {
  delegateStartOutreachRun,
  delegateStartOutreachSend,
  delegateLoadOutreachSendProfile,
} from './delegates.js'
import { chainDurationExceeded } from './reliability-policy.js'
import { getRemainingQuota } from './quota.js'

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export function syncChainRuntime() {
  syncOutreachRuntime()
}

export function markChainStarted() {
  rt.chainStartedAt = new Date().toISOString()
  rt.chainFinishedAt = null
  syncChainRuntime()
}

export function markChainFinished() {
  if (rt.chainStartedAt && !rt.chainFinishedAt) {
    rt.chainFinishedAt = new Date().toISOString()
  }
  syncChainRuntime()
}

export function clearChainTimer() {
  rt.chainStartedAt = null
  rt.chainFinishedAt = null
  syncChainRuntime()
}

export function chainProfileList(settings?: OutreachSettings): string[] {
  const s = settings || getOutreachSettings()
  return (s.chain?.profiles || [])
    .map((p) => resolveSendProfileName(String(p).trim()))
    .filter(Boolean)
}

export function activeChainProfileName(settings?: OutreachSettings): string {
  const s = settings || getOutreachSettings()
  const list = chainProfileList(s)
  return list[rt.chainIndex] || s.send.activeProfile || ''
}

export function isChainMode(settings?: OutreachSettings): boolean {
  const s = settings || getOutreachSettings()
  return Boolean(rt.chainSessionActive && s.chain?.enabled && chainProfileList(s).length > 0)
}

export function effectiveRequireApprove(settings: OutreachSettings): boolean {
  if (isChainMode(settings)) return false
  return settings.requireApprove !== false
}

/** Keep the visible Find goal aligned with the remaining send quota. */
export function applyChainLeadTarget(pendingQueued = 0): OutreachSettings {
  const settings = getOutreachSettings()
  if (!isChainMode(settings)) return settings
  const q = getRemainingQuota(settings.send.dailyCap, settings)
  const remaining = Math.max(0, q.remaining - Math.max(0, pendingQueued))
  if (remaining <= 0) return settings
  return saveOutreachSettings({
    find: { ...settings.find, leadTarget: String(remaining), source: 'headless' },
  }).settings
}

/**
 * After a find→send wave: if this profile still has daily quota left, scrape+send again.
 * Only advance to the next chain profile once the daily cap is hit (or empty fills give up).
 */
export async function continueOrAdvanceChain(
  reason: string,
  opts?: { emptyFill?: boolean },
): Promise<void> {
  if (!isChainMode() || rt.chainAdvanceInFlight) return
  const settings = getOutreachSettings()
  if (chainDurationExceeded(rt.chainStartedAt, Date.now(), settings.chain.maxDurationMin * 60_000)) {
    const message = `Profile chain stopped after the ${settings.chain.maxDurationMin}-minute safety budget; start again to continue`
    appendLog('error', 'find', `${message} [chain_time_budget]`)
    rt.chainSessionActive = false
    rt.chainEmptyStreak = 0
    markChainFinished()
    touchRun({ stage: 'done', status: 'done', message })
    fireNotify('Outreach · Chain stopped', message, 'warn', 'outreach')
    return
  }
  const q = getRemainingQuota(settings.send.dailyCap, settings)
  const atCap = q.remaining <= 0 || /^daily cap/i.test(reason)

  if (opts?.emptyFill) {
    if (rt.currentRun.pendingSend.length > 0 && q.remaining > 0) {
      rt.chainEmptyStreak = 0
      appendLog(
        'info',
        'send',
        `Chain: find exhausted — sending ${rt.currentRun.pendingSend.length} queued (${q.sent}/${q.cap})`,
      )
      void delegateStartOutreachSend()
      return
    }
    rt.chainEmptyStreak++
    const backoffMs = Math.min(30_000, 2500 * rt.chainEmptyStreak)
    if (backoffMs > 0) {
      appendLog(
        'info',
        'find',
        `Chain: empty find #${rt.chainEmptyStreak} — waiting ${Math.round(backoffMs / 1000)}s before retry`,
      )
      await sleep(backoffMs)
    }
    if (rt.chainEmptyStreak >= settings.chain.maxEmptyFills) {
      appendLog(
        'info',
        'find',
        `Chain: ${rt.chainEmptyStreak} empty fills on “${settings.send.activeProfile || '?'}” — moving on (${q.sent}/${q.cap})`,
      )
      rt.chainEmptyStreak = 0
      await advanceProfileChain(`gave up empty fills (${reason})`)
      return
    }
  } else {
    rt.chainEmptyStreak = 0
  }

  if (!atCap) {
    await refillCurrentChainProfile(reason)
    return
  }
  await advanceProfileChain(reason)
}

/** Same profile, new find→clean→send wave sized to remaining quota. */
export async function refillCurrentChainProfile(
  reason: string,
  opts?: { accumulate?: boolean },
): Promise<void> {
  if (!rt.chainSessionActive || rt.chainAdvanceInFlight) return
  // Never start a refill while a find/send wave is still marked active
  if (rt.currentRun.status === 'running' || rt.currentRun.status === 'sending') {
    return
  }
  if (rt.findChild && !rt.findChild.killed) return
  rt.chainAdvanceInFlight = true
  try {
    const settings = getOutreachSettings()
    const q = getRemainingQuota(settings.send.dailyCap, settings)
    if (q.remaining <= 0) {
      rt.chainAdvanceInFlight = false
      await advanceProfileChain('daily cap reached')
      return
    }
    const list = chainProfileList(settings)
    const name = settings.send.activeProfile || list[rt.chainIndex] || '?'
    appendLog(
      'info',
      'find',
      `Chain refill “${name}” (${rt.chainIndex + 1}/${list.length}) · ${q.sent}/${q.cap} · ${q.remaining} to go — ${reason}`,
    )
    fireNotify(
      'Outreach · Filling quota',
      `${name}: ${q.remaining} left to hit ${q.cap}`,
      'ok',
      'outreach',
    )
    // Kill any leftover finds before starting the next wave (prevents send/find overlap)
    hardStopAllFinds(`chain refill: ${reason}`)
    if (countHeadlessFindRuns() > 0) {
      killLeftoverHeadlessFinders()
      sleepSync(400)
    }
    if (countHeadlessFindRuns() > 0) {
      appendLog('error', 'find', 'Chain refill aborted — could not clear leftover Lead Finder processes')
      rt.chainAdvanceInFlight = false
      return
    }
    // Keep status non-idle so a concurrent Start cannot sneak in during sleep.
    // Accumulate mode keeps the pending queue so we can fill to daily cap before sending.
    if (opts?.accumulate && rt.currentRun.pendingSend.length > 0) {
      persistRun({
        ...rt.currentRun,
        status: 'running',
        stage: 'find',
        found: [],
        candidates: [],
        error: undefined,
        message: `Chain accumulate “${name}” · ${rt.currentRun.pendingSend.length} queued…`,
      })
    } else {
      persistRun({
        ...idleRun(),
        status: 'running',
        stage: 'find',
        message: `Chain refill “${name}”…`,
      })
    }
    rt.sendAbort = false
    rt.sendPaused = false
    applyChainLeadTarget(opts?.accumulate ? rt.currentRun.pendingSend.length : 0)
    await sleep(400)
    const started = await delegateStartOutreachRun({ chainAdvance: true })
    if (!started.ok) {
      if (started.message === 'PROFILE_AT_CAP') {
        rt.chainAdvanceInFlight = false
        await advanceProfileChain('daily cap reached')
        return
      }
      appendLog('error', 'find', `Chain refill could not start: ${started.message}`)
      rt.chainAdvanceInFlight = false
      await continueOrAdvanceChain(`refill start failed: ${started.message}`, { emptyFill: true })
    }
  } finally {
    rt.chainAdvanceInFlight = false
  }
}

export async function advanceProfileChain(reason: string): Promise<void> {
  if (!rt.chainSessionActive || rt.chainAdvanceInFlight) return
  rt.chainAdvanceInFlight = true
  let stepReason = reason
  try {
    while (rt.chainSessionActive) {
      const settings = getOutreachSettings()
      if (!settings.chain?.enabled) {
        rt.chainSessionActive = false
        return
      }
      const list = chainProfileList(settings)
      if (!list.length) {
        rt.chainSessionActive = false
        return
      }

      const next = rt.chainIndex + 1
      if (next >= list.length) {
        appendLog('info', 'send', `Profile chain complete (${list.length} profiles) — ${stepReason}`)
        fireNotify('Outreach · Chain complete', `Finished ${list.length} profiles`, 'ok', 'outreach')
        rt.chainSessionActive = false
        rt.chainEmptyStreak = 0
        markChainFinished()
        touchRun({
          stage: 'done',
          status: 'done',
          message: `Chain complete (${list.length} profiles)`,
          pendingSend: [],
        })
        return
      }

      const name = list[next]
      appendLog('info', 'find', `Chain → “${name}” (${next + 1}/${list.length}) — ${stepReason}`)

      // Drop leftover queue from previous identity; each profile scrapes its own DB.
      hardStopAllFinds(`chain advance → ${name}`)
      persistRun(idleRun())
      rt.sendAbort = false
      rt.sendPaused = false
      rt.chainIndex = next
      rt.chainEmptyStreak = 0
      syncChainRuntime()

      const loaded = delegateLoadOutreachSendProfile(name)
      if (!loaded.ok) {
        appendLog('error', 'send', `Chain stopped — load “${name}”: ${loaded.message}`)
        rt.chainSessionActive = false
        markChainFinished()
        touchRun({
          stage: 'error',
          status: 'error',
          error: loaded.message,
          message: `Chain stopped — could not load “${name}”`,
        })
        fireNotify('Outreach · Chain stopped', loaded.message, 'err', 'outreach')
        return
      }

      const after = getOutreachSettings()
      const q = getRemainingQuota(after.send.dailyCap, after)
      if (q.remaining <= 0) {
        appendLog('info', 'send', `“${name}” already at daily cap — skipping`)
        stepReason = `skip capped ${name}`
        continue
      }

      await sleep(500)
      const started = await delegateStartOutreachRun({ chainAdvance: true })
      if (!started.ok) {
        if (started.message === 'PROFILE_AT_CAP') {
          stepReason = `skip capped ${name}`
          continue
        }
        appendLog('error', 'find', `Chain could not start “${name}”: ${started.message}`)
        stepReason = `start failed for ${name}`
        continue
      }
      // New find/send is running for this profile
      return
    }
  } finally {
    rt.chainAdvanceInFlight = false
  }
}
