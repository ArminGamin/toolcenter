import { fireNotify } from '../cc-services.js'
import { archiveManualError } from '../run-errors.js'
import { appendLog } from './log.js'
import { cleanEmails } from './clean.js'
import { parseEmailList } from './email-parse.js'
import { readEmailSet, writeEmailSet } from './json-store.js'
import type { OutreachRun, OutreachSettings } from './types.js'
import { rt, pullOutreachRuntime, touchRun, persistRun, idleRun, publishSendControls, recoverZombieSendLoop, syncOutreachRuntime, recoverStaleFindSpawnLock, wakeLiveQueue } from './runtime.js'
import {
  countHeadlessFindRuns,
  killLeftoverHeadlessFinders,
  sleepSync,
  forceAbortFindsInstant,
} from './find-process.js'
import {
  isChainMode,
  activeChainProfileName,
  effectiveRequireApprove,
  chainProfileList,
  applyChainLeadTarget,
  continueOrAdvanceChain,
  advanceProfileChain,
  markChainStarted,
  clearChainTimer,
  syncChainRuntime,
} from './chain.js'
import {
  runHeadlessFind,
  summarizeFindError,
  isBenignFindAbort,
  importLeadEmailsFromFile,
} from './find-run.js'
import { delegateLoadOutreachSendProfile, delegateStartOutreachSend } from './delegates.js'
import { rejectedFile, getRemainingQuota } from './quota.js'
import { getOutreachSettings, saveOutreachSettings } from './settings.js'

export function applyCleanToFound(emails: string[], settings: OutreachSettings): OutreachRun {
  const { keep, drop } = cleanEmails(emails, settings.clean, {
    settings,
    evidence: rt.currentRun.leadEvidence,
  })
  appendLog('info', 'clean', `cleaned ${emails.length}: keep ${keep.length}, drop ${drop.length}`)
  const candidates = [...keep, ...drop]
  const requireApprove = effectiveRequireApprove(settings)
  if (!requireApprove) {
    const newApproved = keep.map((c) => c.email)
    let pendingSend = newApproved
    if (isChainMode(settings)) {
      const seen = new Set(rt.currentRun.pendingSend.map((e) => e.toLowerCase()))
      pendingSend = [...rt.currentRun.pendingSend]
      for (const email of newApproved) {
        const key = email.toLowerCase()
        if (!seen.has(key)) {
          seen.add(key)
          pendingSend.push(email)
        }
      }
      const q = getRemainingQuota(settings.send.dailyCap, settings)
      if (pendingSend.length > q.remaining) {
        pendingSend = pendingSend.slice(0, q.remaining)
      }
    }
    // Stage must be 'send' so the UI Send button (canSend) unlocks
    return touchRun({
      stage: 'send',
      status: pendingSend.length ? 'waiting' : 'done',
      found: emails,
      candidates,
      approved: pendingSend,
      pendingSend,
      message: pendingSend.length
        ? isChainMode(settings) && pendingSend.length > newApproved.length
          ? `Approve skipped — ${pendingSend.length} queued for send…`
          : 'Approve skipped — starting send automatically…'
        : 'Approve skipped — nothing left to send after clean',
    })
  }
  return touchRun({
    stage: 'approve',
    status: 'waiting',
    found: emails,
    candidates,
    approved: [],
    pendingSend: [],
    message: 'Waiting for your approval',
  })
}

/** When requireApprove is off (or chain autopilot): clean → auto-approve → auto-send. */
export function maybeAutoSendAfterClean(settings: OutreachSettings, run: OutreachRun): void {
  if (effectiveRequireApprove(settings)) return
  if (!run.pendingSend.length) {
    if (isChainMode(settings)) {
      void continueOrAdvanceChain('nothing kept after clean', { emptyFill: true })
    }
    return
  }
  // Always send what we have first. Chain refill to fill daily cap happens after
  // the send wave completes — never rescrape before send (that wiped the queue).
  appendLog('info', 'send', `Auto-send armed (${run.pendingSend.length} after clean)`)
  void delegateStartOutreachSend()
}

export async function startOutreachRun(body?: {
  settings?: Partial<OutreachSettings>
  pasteList?: string
  importFilePath?: string
  /** Internal: continue multi-profile chain without resetting index */
  chainAdvance?: boolean
  /** Internal watchdog path: reuse run id + durable finder checkpoint. */
  resumeInterrupted?: boolean
}): Promise<{ ok: boolean; message: string; run: OutreachRun }> {
  pullOutreachRuntime()
  const resuming = Boolean(
    body?.resumeInterrupted &&
      rt.currentRun.id &&
      rt.currentRun.stage === 'find' &&
      (rt.currentRun.status === 'paused' || rt.currentRun.status === 'error'),
  )
  if (recoverStaleFindSpawnLock()) {
    appendLog('info', 'find', 'Recovered stale Lead Finder start lock')
  }
  // Chain refill may mark status=running while preparing the next wave — allow that path.
  if (!body?.chainAdvance && !resuming) {
    if (rt.currentRun.status === 'running' || rt.currentRun.status === 'sending') {
      return { ok: false, message: 'A run is already in progress', run: rt.currentRun }
    }
    if (rt.currentRun.status === 'waiting' || rt.currentRun.status === 'paused') {
      return {
        ok: false,
        message: 'Finish, abort, or clear the current run before starting a new one',
        run: rt.currentRun,
      }
    }
  } else if (rt.findChild && !rt.findChild.killed) {
    return { ok: false, message: 'Lead Finder still running', run: rt.currentRun }
  }
  if (rt.findChild && !rt.findChild.killed) {
    return { ok: false, message: 'Lead Finder still running', run: rt.currentRun }
  }
  // Zombie child after kill — wait briefly then force-clear so Start isn't stuck
  if (rt.findChild) {
    sleepSync(500)
    rt.findChild = null
  }
  // HMR / crashed waves leave stray headless_run.py — never stack another
  const strayBefore = countHeadlessFindRuns()
  if (strayBefore > 0) {
    killLeftoverHeadlessFinders()
    sleepSync(300)
  }
  const strayAfter = countHeadlessFindRuns()
  if (strayAfter > 0) {
    return {
      ok: false,
      message: `Cannot start — ${strayAfter} leftover Lead Finder process(es). Press Abort, then Start.`,
      run: rt.currentRun,
    }
  }

  if (body?.settings && !body.chainAdvance) {
    saveOutreachSettings(body.settings)
  }
  let settings = getOutreachSettings()
  if (typeof body?.pasteList === 'string') {
    settings.find.pasteList = body.pasteList
    settings.find.source = 'paste'
    saveOutreachSettings({ find: settings.find })
    settings = getOutreachSettings()
  }

  // Profile chain: Start loads profile 1, find→clean→send to cap, then auto-advance.
  const chainList = chainProfileList(settings)
  if (settings.chain?.enabled && chainList.length > 0) {
    if (resuming) {
      rt.chainSessionActive = true
      syncChainRuntime()
      if (!rt.chainStartedAt) markChainStarted()
    }
    if (!body?.chainAdvance && !resuming) {
      rt.chainSessionActive = true
      rt.chainIndex = 0
      rt.chainEmptyStreak = 0
      syncChainRuntime()
      markChainStarted()
      if (rt.currentRun.pendingSend.length) {
        persistRun(idleRun())
      }
      const first = chainList[0]
      const loaded = delegateLoadOutreachSendProfile(first)
      if (!loaded.ok) {
        rt.chainSessionActive = false
        clearChainTimer()
        return { ok: false, message: `Chain: ${loaded.message}`, run: rt.currentRun }
      }
      settings = getOutreachSettings()
      appendLog(
        'info',
        'find',
        `Chain started · 1/${chainList.length} “${first}” · daily cap ${settings.send.dailyCap}`,
      )
      fireNotify(
        'Outreach · Chain started',
        `1/${chainList.length} · ${first}`,
        'ok',
        'outreach',
      )
    }
    settings = applyChainLeadTarget()
    if (getRemainingQuota(settings.send.dailyCap, settings).remaining <= 0) {
      appendLog('info', 'send', `“${settings.send.activeProfile}” at daily cap — advancing`)
      if (body?.chainAdvance) {
        // Caller holds rt.chainAdvanceInFlight — return so its loop can skip ahead
        return {
          ok: false,
          message: 'PROFILE_AT_CAP',
          run: rt.currentRun,
        }
      }
      void advanceProfileChain('already at cap on start')
      return { ok: true, message: 'Profile at daily cap — advancing chain', run: rt.currentRun }
    }
  } else if (!body?.chainAdvance) {
    rt.chainSessionActive = false
    rt.chainIndex = 0
  }

  const previousRun = rt.currentRun
  const id = resuming ? previousRun.id : crypto.randomUUID()
  const now = new Date().toISOString()
  const epoch = ++rt.findEpoch
  rt.sendAbort = false
  const chainLabel =
    isChainMode(settings) && chainList.length
      ? ` · chain ${rt.chainIndex + 1}/${chainList.length} “${settings.send.activeProfile || chainList[rt.chainIndex]}”`
      : ''
  // Chain refill must never drop a prepared send queue (safety if accumulate is reintroduced).
  const carryQueue = body?.chainAdvance
    ? {
        pendingSend: [...rt.currentRun.pendingSend],
        approved: [...rt.currentRun.approved],
        sent: [...rt.currentRun.sent],
        failed: [...rt.currentRun.failed],
        sendIndex: rt.currentRun.sendIndex,
      }
    : {
        pendingSend: [] as string[],
        approved: [] as string[],
        sent: [] as string[],
        failed: [] as OutreachRun['failed'],
        sendIndex: 0,
      }
  persistRun({
    ...(resuming ? previousRun : {}),
    id,
    stage: 'find',
    status: 'running',
    createdAt: resuming ? previousRun.createdAt : now,
    updatedAt: now,
    found: resuming ? [...previousRun.found] : [],
    candidates: resuming ? [...previousRun.candidates] : [],
    approved: carryQueue.approved,
    pendingSend: carryQueue.pendingSend,
    sent: carryQueue.sent,
    failed: carryQueue.failed,
    sendIndex: carryQueue.sendIndex,
    liveSendActive: false,
    finderComplete: false,
    liveProvisional: resuming ? [...(previousRun.liveProvisional || [])] : [],
    liveEligible: resuming ? [...(previousRun.liveEligible || [])] : [],
    leadEvidence: resuming ? { ...(previousRun.leadEvidence || {}) } : {},
    health: {
      target: Number(settings.find.leadTarget) || 0,
      qualifiedPeople: resuming ? previousRun.found.length : 0,
      candidatesFound: previousRun.health?.candidatesFound || 0,
      duplicatesRemoved: previousRun.health?.duplicatesRemoved || 0,
      rejectedOrganizations: previousRun.health?.rejectedOrganizations || 0,
      invalidContacts: previousRun.health?.invalidContacts || 0,
      rejectedNotPerson: previousRun.health?.rejectedNotPerson || 0,
      discoveryStatus: 'RUNNING',
      stage: 'DISCOVERY',
      workersHealthy: 0,
      workersTotal: 1,
      queueSize: previousRun.health?.queueSize || 0,
      processedSources: previousRun.health?.processedSources || 0,
      workerHeartbeat: new Date().toISOString(),
      lastSuccessfulAction: previousRun.health?.lastSuccessfulAction,
      errorCount: previousRun.health?.errorCount || 0,
      recoveries: previousRun.health?.recoveries || 0,
      currentSources: previousRun.health?.currentSources || [],
    },
    resumeAttempts: resuming ? (previousRun.resumeAttempts || 0) + 1 : 0,
    message: resuming
      ? `Resuming from checkpoint · ${previousRun.found.length} qualified saved`
      : carryQueue.pendingSend.length
      ? `Finding more · ${carryQueue.pendingSend.length} already queued${chainLabel}`
      : `Starting…${chainLabel}`,
  })
  appendLog(
    'info',
    'find',
    `Run ${id.slice(0, 8)} started (source=${settings.find.source}${chainLabel}) · target ${settings.find.leadTarget}`,
  )

  const finishWithEmails = (emails: string[]) => {
    if (epoch !== rt.findEpoch || rt.currentRun.id !== id) return rt.currentRun
    const settingsNow = getOutreachSettings()
    const current = rt.currentRun
    const liveMode = Boolean(current.liveSendActive || current.liveEligible?.length || current.liveProvisional?.length)
    if (liveMode) {
      const { keep, drop } = cleanEmails(emails, settingsNow.clean, {
        settings: settingsNow,
        evidence: current.leadEvidence,
      })
      const byEmail = new Map(current.candidates.map((candidate) => [candidate.email, candidate]))
      for (const candidate of [...keep, ...drop]) {
        const previous = byEmail.get(candidate.email)
        byEmail.set(candidate.email, previous
          ? { ...candidate, selected: previous.selected, decision: previous.decision, reason: previous.reason || candidate.reason }
          : candidate)
      }
      const candidates = [...byEmail.values()]
      const finalKeep = candidates.filter((candidate) => candidate.decision === 'keep').map((candidate) => candidate.email)
      const approved = [...new Set([...current.approved, ...(effectiveRequireApprove(settingsNow) ? [] : finalKeep)])]
      const sent = new Set(current.sent)
      const pendingSend = [...new Set([...current.pendingSend, ...(effectiveRequireApprove(settingsNow) ? [] : finalKeep)])]
        .filter((email) => !sent.has(email))
      const nextStage = current.liveSendActive
        ? (pendingSend.length || !effectiveRequireApprove(settingsNow) ? 'find' : 'find')
        : effectiveRequireApprove(settingsNow) ? 'approve' : 'send'
      const run = touchRun({
        stage: nextStage,
        status: current.liveSendActive ? 'sending' : effectiveRequireApprove(settingsNow) ? 'waiting' : pendingSend.length ? 'waiting' : 'done',
        found: [...new Set([...current.found, ...emails])],
        candidates,
        approved,
        pendingSend,
        finderComplete: true,
        liveProvisional: [],
        liveEligible: finalKeep.filter((email) => !sent.has(email)),
        message: current.liveSendActive ? 'Finder complete — finishing live queue' : effectiveRequireApprove(settingsNow) ? 'Waiting for your approval' : 'Ready to send',
      })
      wakeLiveQueue()
      if (!current.liveSendActive && !effectiveRequireApprove(settingsNow)) maybeAutoSendAfterClean(settingsNow, run)
      return run
    }
    touchRun({ stage: 'clean', status: 'running', found: emails, message: 'Cleaning…' })
    const run = applyCleanToFound(emails, settingsNow)
    const kept = run.candidates.filter((c) => c.decision === 'keep').length
    if (!effectiveRequireApprove(settingsNow)) {
      fireNotify(
        kept ? 'Outreach · Auto-sending' : 'Outreach · Clean done',
        kept
          ? `Found ${emails.length}, kept ${kept} — sending automatically`
          : `Found ${emails.length}, kept 0 after clean`,
        kept ? 'ok' : 'warn',
        'outreach',
      )
      maybeAutoSendAfterClean(settingsNow, run)
    } else {
      fireNotify(
        'Outreach · Ready to approve',
        `Found ${emails.length}, kept ${kept}`,
        'ok',
        'outreach',
      )
    }
    return rt.currentRun
  }

  try {
    if (settings.find.source === 'paste') {
      const list = body?.pasteList ?? settings.find.pasteList
      const parsed = parseEmailList(list)
      const emails = parsed.emails
      appendLog('info', 'find', `Paste ingest: ${emails.length} emails (${parsed.skipped.length} skipped)`)
      if (!emails.length) {
        const run = touchRun({
          stage: 'error',
          status: 'error',
          error: 'No valid emails in paste list',
          message: 'No valid emails in paste list',
        })
        fireNotify('Outreach · Find failed', run.error || '', 'err', 'outreach')
        if (isChainMode()) void continueOrAdvanceChain('paste empty', { emptyFill: true })
        return { ok: false, message: run.error || 'No emails', run }
      }
      const run = finishWithEmails(emails)
      return {
        ok: true,
        message: !effectiveRequireApprove(getOutreachSettings())
          ? run.message || 'Auto-sending…'
          : run.message || 'Waiting for approval',
        run: rt.currentRun,
      }
    }

    if (settings.find.source === 'import') {
      const imp = importLeadEmailsFromFile(body?.importFilePath)
      appendLog('info', 'find', imp.message)
      if (imp.path) touchRun({ findOutputPath: imp.path })
      if (!imp.emails.length) {
        const run = touchRun({
          stage: 'error',
          status: 'error',
          error: imp.message,
          message: imp.message,
        })
        if (isChainMode()) void continueOrAdvanceChain('import empty', { emptyFill: true })
        return { ok: false, message: imp.message, run }
      }
      const run = finishWithEmails(imp.emails)
      return {
        ok: true,
        message: !effectiveRequireApprove(getOutreachSettings())
          ? run.message || 'Auto-sending…'
          : run.message || 'Waiting for approval',
        run: rt.currentRun,
      }
    }

    // Headless: run in background so the HTTP request returns immediately
    void (async () => {
      try {
        const settingsNow = getOutreachSettings()
        const emails = await runHeadlessFind(settingsNow, id, epoch, { resume: resuming })
        if (epoch !== rt.findEpoch || rt.currentRun.id !== id) return
        appendLog('info', 'find', `Headless found ${emails.length} emails`)
        // Discover mode is seed-URL only — 0 emails is success, not a Find failure
        if (!emails.length && settingsNow.find.runMode === 'discover') {
          touchRun({
            stage: 'done',
            status: 'done',
            found: [],
            finderComplete: true,
            message: 'Discover-only complete — seed URLs saved in Lead Finder output (no scrape)',
          })
          wakeLiveQueue()
          fireNotify('Outreach · Discover done', 'Seed URLs saved (no emails in this mode)', 'ok', 'outreach')
          if (isChainMode()) void continueOrAdvanceChain('discover-only (no emails)', { emptyFill: true })
          return
        }
        if (!emails.length) {
          const profile = settingsNow.send.activeProfile || activeChainProfileName(settingsNow) || '?'
          const emptyMsg = `Headless find returned 0 emails for “${profile}” — niche may be exhausted; try the next chain profile or widen find settings`
          touchRun({
            stage: 'error',
            status: 'error',
            error: emptyMsg,
            message: emptyMsg,
            finderComplete: true,
          })
          wakeLiveQueue()
          fireNotify('Outreach · Find empty', emptyMsg, 'warn', 'outreach')
          archiveManualError({
            toolId: 'outreach',
            summary: emptyMsg,
            lines: [emptyMsg],
          })
          if (isChainMode()) void continueOrAdvanceChain('find empty', { emptyFill: true })
          return
        }
        finishWithEmails(emails)
      } catch (err) {
        if (epoch !== rt.findEpoch || rt.currentRun.id !== id) return
        const message = err instanceof Error ? err.message : String(err)
        if (/^aborted$/i.test(message.trim()) || isBenignFindAbort(message)) {
          return
        }
        const short = summarizeFindError(message)
        if (isBenignFindAbort(short)) {
          appendLog('info', 'find', short)
          return
        }
        appendLog('error', 'find', short)
        touchRun({ stage: 'error', status: 'error', error: short, message: short, finderComplete: true })
        wakeLiveQueue()
        fireNotify('Outreach · Error', short, 'err', 'outreach')
        archiveManualError({
          toolId: 'outreach',
          summary: short,
          lines: [short, ...(rt.currentRun.found?.length ? [`found=${rt.currentRun.found.length}`] : [])],
        })
        if (isChainMode()) void continueOrAdvanceChain(`find error: ${short}`, { emptyFill: true })
      }
    })()

    return {
      ok: true,
      message: isChainMode(settings)
        ? `Chain ${rt.chainIndex + 1}/${chainList.length} — Lead Finder started`
        : 'Lead Finder started — watch the live feed',
      run: rt.currentRun,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (isBenignFindAbort(message)) {
      appendLog('info', 'find', summarizeFindError(message))
      return { ok: false, message: summarizeFindError(message), run: rt.currentRun }
    }
    const short = summarizeFindError(message)
    appendLog('error', 'find', short)
    const run = touchRun({ stage: 'error', status: 'error', error: short, message: short, finderComplete: true })
    wakeLiveQueue()
    fireNotify('Outreach · Error', short, 'err', 'outreach')
    archiveManualError({ toolId: 'outreach', summary: short, lines: [short] })
    if (isChainMode() && !isBenignFindAbort(short)) {
      void continueOrAdvanceChain(`find error: ${short}`, { emptyFill: true })
    }
    return { ok: false, message: short, run }
  }
}

export async function resumeInterruptedOutreach(): Promise<{
  ok: boolean
  message: string
  run: OutreachRun
}> {
  pullOutreachRuntime()
  if (!rt.currentRun.id || rt.currentRun.stage !== 'find') {
    return { ok: false, message: 'No interrupted find to resume', run: rt.currentRun }
  }
  if (rt.currentRun.status !== 'paused' && rt.currentRun.status !== 'error') {
    return { ok: false, message: 'Find is not paused', run: rt.currentRun }
  }
  if ((rt.currentRun.resumeAttempts || 0) >= 3) {
    const run = touchRun({
      status: 'error',
      error: 'Watchdog stopped after 3 recovery attempts',
      message: 'Needs review — repeated worker recovery failed',
    })
    return { ok: false, message: run.message || 'Recovery limit reached', run }
  }
  appendLog('info', 'find', 'Watchdog resuming interrupted finder from checkpoint')
  return startOutreachRun({ resumeInterrupted: true })
}

export function abortOutreach(): { ok: boolean; message: string; run: OutreachRun } {
  pullOutreachRuntime()
  const stoppingFind = rt.currentRun.stage === 'find'
  rt.sendAbort = true
  rt.sendPaused = false
  rt.sendEpoch++
  rt.sendLoopActive = false
  rt.chainSessionActive = false
  rt.chainAdvanceInFlight = false
  rt.chainEmptyStreak = 0
  clearChainTimer()
  rt.findSpawnLock = false
  syncOutreachRuntime()

  if (stoppingFind) forceAbortFindsInstant('user abort')
  const kept = rt.currentRun.found.length
  const message = stoppingFind ? `Search stopped · ${kept} lead(s) kept` : 'Outreach stopped · queued leads kept'
  const run = touchRun({
    status: stoppingFind ? 'done' : 'paused',
    message,
    error: undefined,
    finderComplete: stoppingFind ? true : rt.currentRun.finderComplete,
    health: rt.currentRun.health
      ? { ...rt.currentRun.health, discoveryStatus: stoppingFind ? 'STOPPED' : rt.currentRun.health.discoveryStatus, workersHealthy: 0 }
      : rt.currentRun.health,
  })
  appendLog('info', stoppingFind ? 'find' : 'send', message)
  wakeLiveQueue()
  fireNotify('Outreach · Stopped', message, 'stop', 'outreach')
  return { ok: true, message, run }
}

export function pauseOutreachSend(): { ok: boolean; message: string; run: OutreachRun } {
  pullOutreachRuntime()
  if (rt.currentRun.status !== 'sending') {
    return { ok: false, message: 'Not sending', run: rt.currentRun }
  }
  rt.sendPaused = true
  appendLog('info', 'send', 'Paused')
  const run = touchRun({ status: 'paused', message: 'Paused' })
  return { ok: true, message: 'Paused', run }
}

export function resumeOutreachSend(): { ok: boolean; message: string; run: OutreachRun } {
  pullOutreachRuntime()
  recoverZombieSendLoop()
  const canResume =
    rt.currentRun.status === 'paused' ||
    (rt.currentRun.stage === 'send' && rt.currentRun.pendingSend.length > 0 && rt.currentRun.status !== 'sending')
  if (!canResume) {
    return { ok: false, message: 'Nothing to resume', run: rt.currentRun }
  }
  publishSendControls({ paused: false, abort: false })
  if (rt.sendLoopActive && rt.currentRun.status === 'paused') {
    appendLog('info', 'send', 'Resuming')
    const run = touchRun({ status: 'sending', message: 'Sending...' })
    return { ok: true, message: 'Resuming', run }
  }
  if (rt.sendLoopActive) {
    recoverZombieSendLoop()
  }
  appendLog('info', 'send', 'Resuming')
  void delegateStartOutreachSend()
  return { ok: true, message: 'Resuming', run: rt.currentRun }
}

export function approveOutreach(body: {
  keep?: string[]
  drop?: string[]
  selected?: string[]
}): { ok: boolean; message: string; run: OutreachRun } {
  pullOutreachRuntime()
  const canApprove =
    rt.currentRun.stage === 'approve' ||
    (rt.currentRun.stage === 'send' &&
      (rt.currentRun.status === 'waiting' || rt.currentRun.status === 'paused') &&
      rt.currentRun.sent.length === 0)
  if (!canApprove) {
    return { ok: false, message: 'Not waiting for approval', run: rt.currentRun }
  }

  const rejected = readEmailSet(rejectedFile())
  let keepList: string[]

  if (Array.isArray(body.selected)) {
    keepList = body.selected.map((e) => e.toLowerCase())
  } else if (Array.isArray(body.keep)) {
    keepList = body.keep.map((e) => e.toLowerCase())
  } else {
    keepList = rt.currentRun.candidates.filter((c) => c.selected && c.decision === 'keep').map((c) => c.email)
  }

  const selectable = new Set(
    rt.currentRun.candidates.filter((c) => c.decision === 'keep').map((c) => c.email),
  )
  keepList = [...new Set(keepList)].filter((email) => selectable.has(email))
  const selectedSet = new Set(keepList)
  const dropExplicit = new Set((body.drop || []).map((e) => e.toLowerCase()))
  const nextCandidates = rt.currentRun.candidates.map((c) => {
    if (selectedSet.has(c.email)) {
      return { ...c, decision: 'keep' as const, selected: true }
    }
    if (dropExplicit.has(c.email) || c.decision === 'drop') {
      rejected.add(c.email)
      return { ...c, decision: 'drop' as const, selected: false }
    }
    // Unselected keeps become drop + rejected
    if (c.decision === 'keep' && !selectedSet.has(c.email)) {
      rejected.add(c.email)
      return { ...c, decision: 'drop' as const, selected: false, reason: 'user-rejected' }
    }
    return c
  })

  writeEmailSet(rejectedFile(), rejected)
  appendLog('decision', 'approve', `Approved ${keepList.length} emails`)

  const run = touchRun({
    stage: keepList.length ? 'send' : 'done',
    status: keepList.length ? 'waiting' : 'done',
    candidates: nextCandidates,
    approved: keepList,
    pendingSend: [...keepList],
    sendIndex: 0,
    message: keepList.length ? `Approved ${keepList.length} — ready to send` : 'No recipients approved',
  })
  if (keepList.length) void delegateStartOutreachSend()
  return { ok: true, message: run.message || 'Approved', run }
}
