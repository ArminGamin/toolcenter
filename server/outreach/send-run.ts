import { createHash } from 'node:crypto'
import { appendLog } from './log.js'
import { fireNotify } from '../cc-services.js'
import { personalizeHtml, prepareSendContent, resolveSendIdentity, testEmailSubject } from './send-identity.js'
import { advanceContentRotation, getContentRotationIndex, usesContentRotation } from './content-rotation.js'
import { parseEmailList } from './email-parse.js'
import { readEmailSet, writeEmailSet } from './json-store.js'
import type { OutreachRun } from './types.js'
import { rt, pullOutreachRuntime, recoverZombieSendLoop, publishSendControls, repairActiveSendProfileIfStale, touchRun, syncOutreachRuntime, liveSendEpoch, liveSendAbort, liveSendPaused, liveFindChild, childProcessRunning, waitForLiveQueue } from './runtime.js'
import {
  countHeadlessFindRuns,
  killLeftoverHeadlessFinders,
} from './find-process.js'
import { getOutreachSettings } from './settings.js'
import { notifyOutreachEmailSent, notifyOutreachSendDiscord } from './email-notify.js'
import {
  activeProfileSlug,
  sentFile,
  getRemainingQuota,
  applyQuotaAfterSend,
  reconcileQuotaFromResend,
  parseResendDailyUsedHeader,
} from './quota.js'
import { isChainMode, continueOrAdvanceChain } from './chain.js'
import { shouldOpenSendCircuit } from './reliability-policy.js'
import { writeSendOutcome } from './send-ledger.js'
import { isPlaceholderContact } from './personal-rules.js'

export async function sendOneEmail(
  to: string,
  fromAddr: string,
  subject: string,
  html: string,
  apiKey: string,
  idempotencyKey: string,
): Promise<number | null> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({
      from: fromAddr,
      to: [to],
      subject,
      html: personalizeHtml(html, to),
    }),
    // A stalled provider request used to freeze the whole queue indefinitely.
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const error = new Error(`Resend ${res.status}: ${text.slice(0, 200)}`) as Error & { status?: number }
    error.status = res.status
    throw error
  }
  return parseResendDailyUsedHeader(res)
}

export function sendIdempotencyKey(runId: string, email: string, subject: string): string {
  const hash = createHash('sha256').update(`${runId}\0${email}\0${subject}`).digest('hex')
  return `outreach/${hash}`
}

export function transientSendError(err: unknown): boolean {
  const status = Number((err as { status?: number } | null)?.status || 0)
  if (status === 408 || status === 429 || status >= 500) return true
  const message = err instanceof Error ? `${err.name} ${err.message}` : String(err)
  return /timeout|timed out|aborted|ECONNRESET|ECONNREFUSED|network|fetch failed/i.test(message)
}

export async function sendOneEmailWithRetry(
  to: string,
  fromAddr: string,
  subject: string,
  html: string,
  apiKey: string,
  runId: string,
): Promise<number | null> {
  const idempotencyKey = sendIdempotencyKey(runId, to, subject)
  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await sendOneEmail(to, fromAddr, subject, html, apiKey, idempotencyKey)
    } catch (err) {
      lastError = err
      if (attempt >= 3 || !transientSendError(err)) throw err
      appendLog('info', 'send', `Transient send failure — retrying (${attempt}/2)`)
    }
  }
  throw lastError
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export async function startOutreachLiveSend(selected?: string[]): Promise<{ ok: boolean; message: string; run: OutreachRun }> {
  pullOutreachRuntime()
  const run = rt.currentRun
  const finderActive = childProcessRunning(liveFindChild()) || countHeadlessFindRuns() > 0
  if (!run.id || !['find', 'send'].includes(run.stage) || run.finderComplete || !finderActive) {
    return { ok: false, message: 'Lead Finder is not running — use regular Send after discovery completes', run }
  }
  const allowed = new Set((run.liveEligible || []).map((email) => email.toLowerCase()))
  const chosen = new Set((selected || []).map((email) => email.trim().toLowerCase()).filter((email) => allowed.has(email)))
  const settings = getOutreachSettings()
  const requireApprove = settings.requireApprove !== false && !(settings.chain?.enabled && rt.chainSessionActive)
  const candidates = run.candidates.map((candidate) => {
    if (!chosen.has(candidate.email) || candidate.decision !== 'keep') return candidate
    return { ...candidate, selected: true }
  })
  const approved = [...new Set([
    ...run.approved,
    ...(requireApprove ? [...chosen] : []),
  ])]
  const sent = new Set(run.sent)
  const pendingSend = [...new Set([
    ...run.pendingSend,
    ...(requireApprove ? [...chosen] : (run.liveEligible || [])),
  ])].filter((email) => !sent.has(email))
  touchRun({ candidates, approved, pendingSend, finderComplete: false })
  return startOutreachSend({ live: true })
}

export async function startOutreachSend(opts: { live?: boolean } = {}): Promise<{ ok: boolean; message: string; run: OutreachRun }> {
  const live = Boolean(opts.live)
  pullOutreachRuntime()
  recoverZombieSendLoop()
  if (rt.sendLoopActive) {
    return { ok: true, message: 'Send loop already active', run: rt.currentRun }
  }
  // Regular sending waits for discovery; live sending deliberately shares the finder.
  if (!live && childProcessRunning(liveFindChild())) {
    return {
      ok: false,
      message: 'Lead Finder still running — wait for Find to finish before sending',
      run: rt.currentRun,
    }
  }
  const stray = countHeadlessFindRuns()
  if (!live && stray > 0) {
    const n = killLeftoverHeadlessFinders()
    appendLog('info', 'send', `Cleared ${n} leftover finder(s) before send`)
  }
  // Allow restart after abort/pause when a queue still exists
  const canSend = live
    ? Boolean(rt.currentRun.id && ['find', 'send'].includes(rt.currentRun.stage) &&
        (childProcessRunning(liveFindChild()) || countHeadlessFindRuns() > 0))
    : rt.currentRun.stage === 'send' ||
      rt.currentRun.stage === 'done' ||
      (rt.currentRun.pendingSend.length > 0 &&
        (rt.currentRun.status === 'paused' || rt.currentRun.status === 'waiting' || rt.currentRun.status === 'error'))
  if (!canSend) {
    return { ok: false, message: 'Approve a list before sending', run: rt.currentRun }
  }
  if (!live && !rt.currentRun.pendingSend.length) {
    return { ok: false, message: 'No pending emails to send', run: rt.currentRun }
  }

  const settings = repairActiveSendProfileIfStale(getOutreachSettings())
  const { apiKey, fromAddr } = resolveSendIdentity(settings)
  if (!apiKey) {
    return { ok: false, message: 'Resend API key missing — set it on this profile or in Vault', run: rt.currentRun }
  }
  if (!fromAddr) {
    return { ok: false, message: 'From address missing — set profile From, override, or Vault', run: rt.currentRun }
  }
  let contentAt: ReturnType<typeof prepareSendContent>
  try {
    contentAt = prepareSendContent(settings)
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err), run: rt.currentRun }
  }
  const rotating = usesContentRotation(settings)
  let rotationIndex = rotating ? getContentRotationIndex(settings, rt.currentRun.sendIndex) : rt.currentRun.sendIndex

  rt.sendEpoch++
  const mySendEpoch = rt.sendEpoch
  publishSendControls({ paused: false, abort: false, loopActive: true })
  // Pin the account store for this whole send loop — do not re-resolve mid-send
  // (loading another profile / HMR must not split quota across _default vs named).
  const sendStore = settings
  const storeSlug = activeProfileSlug(sendStore)
  touchRun({
    stage: live ? 'find' : 'send',
    status: 'sending',
    liveSendActive: live ? true : rt.currentRun.liveSendActive,
    error: undefined,
    message: live ? 'Sending eligible leads while finding…' : 'Sending...',
  })
  void reconcileQuotaFromResend(sendStore).catch(() => undefined)
  appendLog(
    'info',
    'send',
    `Send loop started (${rt.currentRun.pendingSend.length} pending) · store=${storeSlug} · quota ${getRemainingQuota(settings.send.dailyCap, sendStore).sent}/${settings.send.dailyCap}`,
  )
  const sentAtWaveStart = rt.currentRun.sent.length

  void (async () => {
    const sentPath = sentFile(sendStore)
    const sentSet = readEmailSet(sentPath)
    let consecutiveTransientFailures = 0
    const loopAlive = () => mySendEpoch === liveSendEpoch() && !liveSendAbort()
    try {
      while (rt.currentRun.pendingSend.length > 0 || (live && !rt.currentRun.finderComplete)) {
        if (!loopAlive()) {
          // Leave queue intact for resume
          if (mySendEpoch === liveSendEpoch()) {
            touchRun({
              stage: 'send',
              status: 'paused',
              message: 'Force aborted — queue kept',
            })
          }
          break
        }
        while (liveSendPaused() && loopAlive()) {
          touchRun({ status: 'paused', message: 'Paused' })
          await sleep(400)
        }
        if (!loopAlive()) {
          if (mySendEpoch === liveSendEpoch()) {
            touchRun({
              stage: 'send',
              status: 'paused',
              message: 'Force aborted — queue kept',
            })
          }
          break
        }

        const quota = getRemainingQuota(settings.send.dailyCap, sendStore)
        if (quota.remaining <= 0) {
          appendLog('info', 'send', `Daily cap hit (${quota.cap}) on store ${storeSlug}`)
          fireNotify(
            'Outreach · Daily cap',
            `${sendStore.send.activeProfile || storeSlug}: ${quota.sent}/${quota.cap} sent today`,
            'warn',
            'outreach',
          )
          touchRun({
            status: 'paused',
            message: settings.send.autoContinueNextDay
              ? 'Quota hit — leftover queue saved for next day'
              : 'Daily cap reached — pause',
          })
          break
        }

        if (!rt.currentRun.pendingSend.length) {
          await waitForLiveQueue(1000)
          continue
        }
        const email = rt.currentRun.pendingSend[0]
        if (isPlaceholderContact(email)) {
          appendLog('decision', 'send', `Skipped placeholder contact ${email}`)
          touchRun({ pendingSend: rt.currentRun.pendingSend.slice(1) })
          continue
        }
        const { subject, html } = contentAt(rotationIndex)
        const idempotencyKey = sendIdempotencyKey(rt.currentRun.id, email, subject)
        try {
          writeSendOutcome(rt.currentRun.id, email, 'sending', idempotencyKey)
          const resendDailyUsed = await sendOneEmailWithRetry(email, fromAddr, subject, html, apiKey, rt.currentRun.id)
          if (rotating) advanceContentRotation(sendStore, rotationIndex)
          rotationIndex++
          consecutiveTransientFailures = 0
          sentSet.add(email)
          writeEmailSet(sentPath, sentSet)
          applyQuotaAfterSend(sendStore, resendDailyUsed)
          writeSendOutcome(rt.currentRun.id, email, 'sent', idempotencyKey)
          const quotaAfter = getRemainingQuota(settings.send.dailyCap, sendStore)
          if (settings.send.discordNotify) {
            notifyOutreachSendDiscord(email, subject, 'promo', {
              profile: sendStore.send.activeProfile || storeSlug,
              quotaSent: quotaAfter.sent,
              quotaCap: quotaAfter.cap,
            })
          }
          const pending = rt.currentRun.pendingSend.slice(1)
          const sent = [...rt.currentRun.sent, email]
          appendLog('info', 'send', `sent ${sent.length} · ${email}`)
          // Never resurrect "sending" after Abort — keep queue progress, stay paused.
          if (!loopAlive()) {
            if (mySendEpoch === liveSendEpoch()) {
              touchRun({
                pendingSend: pending,
                sent,
                sendIndex: rt.currentRun.sendIndex + 1,
                stage: 'send',
                status: 'paused',
                message: 'Force aborted — queue kept',
              })
            }
            break
          }
          touchRun({
            pendingSend: pending,
            sent,
            sendIndex: rt.currentRun.sendIndex + 1,
            status: 'sending',
            message: `Sent ${sent.length}`,
          })
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err)
          appendLog('error', 'send', `fail ${email}: ${error}`)
          if (transientSendError(err)) consecutiveTransientFailures += 1
          else consecutiveTransientFailures = 0
          if (shouldOpenSendCircuit(consecutiveTransientFailures)) {
            const message =
              `Email provider unavailable after ${consecutiveTransientFailures} consecutive failures — ` +
              'send paused and queue preserved'
            appendLog('error', 'send', `${message} [provider_circuit_open]`)
            writeSendOutcome(rt.currentRun.id, email, 'needs_review', idempotencyKey, 'provider_circuit_open')
            touchRun({
              stage: 'send',
              status: 'paused',
              error: 'provider_circuit_open',
              message,
            })
            fireNotify('Outreach · Provider paused', message, 'warn', 'outreach')
            break
          }
          const pending = rt.currentRun.pendingSend.slice(1)
          writeSendOutcome(rt.currentRun.id, email, 'failed', idempotencyKey, 'provider_send_failed')
          if (!loopAlive()) {
            if (mySendEpoch === liveSendEpoch()) {
              touchRun({
                pendingSend: pending,
                failed: [...rt.currentRun.failed, { email, error }],
                stage: 'send',
                status: 'paused',
                message: 'Force aborted — queue kept',
              })
            }
            break
          }
          touchRun({
            pendingSend: pending,
            failed: [...rt.currentRun.failed, { email, error }],
            message: `Failed ${email}`,
          })
        }

        if (!loopAlive()) break
        const delay = Math.max(0, settings.send.delayMs)
        if (delay && rt.currentRun.pendingSend.length) await sleep(delay)
      }

      if (
        loopAlive() &&
        rt.currentRun.pendingSend.length === 0 &&
        rt.currentRun.status !== 'error' &&
        rt.currentRun.status !== 'paused'
      ) {
        touchRun({
          stage: 'done',
          status: 'done',
          liveSendActive: live ? false : rt.currentRun.liveSendActive,
          message: 'All pending emails sent',
        })
        appendLog('info', 'send', 'Run complete')
        void reconcileQuotaFromResend(sendStore)
          .then((remote) => {
            if (remote != null) {
              appendLog('info', 'send', `Quota reconciled from Resend: ${remote}/${settings.send.dailyCap}`)
            }
          })
          .catch(() => undefined)
        fireNotify(
          'Outreach · Complete',
          `Sent ${rt.currentRun.sent.length}, failed ${rt.currentRun.failed.length}`,
          'ok',
          'outreach',
        )
      }
    } finally {
      // Force-abort bumps rt.sendEpoch and clears rt.sendLoopActive already — don't clobber a newer loop.
      if (mySendEpoch === liveSendEpoch()) {
        rt.sendLoopActive = false
        if (live && rt.currentRun.liveSendActive && rt.currentRun.finderComplete && !liveSendAbort()) {
          touchRun({ liveSendActive: false })
        }
        syncOutreachRuntime()
      }
      pullOutreachRuntime()
      // Abort clears rt.chainSessionActive — never refill after user stop.
      if (mySendEpoch === liveSendEpoch() && isChainMode() && !liveSendAbort()) {
        const q = getRemainingQuota(settings.send.dailyCap, sendStore)
        const atCap = q.remaining <= 0
        const queueEmpty = rt.currentRun.pendingSend.length === 0
        if (atCap || queueEmpty || rt.currentRun.status === 'done') {
          // Under cap after a wave → refill same profile until 150; only then advance.
          // Low-yield waves (0–7 sent) count as empty so a 1-email drip cannot loop for hours.
          const sentThisWave = Math.max(0, rt.currentRun.sent.length - sentAtWaveStart)
          void continueOrAdvanceChain(atCap ? 'daily cap reached' : 'send complete', {
            emptyFill: !atCap && sentThisWave < 8,
          })
        }
      }
    }
  })()

  return { ok: true, message: 'Sending...', run: rt.currentRun }
}

export async function testOutreachSend(): Promise<{ ok: boolean; message: string }> {
  const settings = getOutreachSettings()
  const { apiKey, fromAddr } = resolveSendIdentity(settings)
  if (!apiKey) return { ok: false, message: 'Resend API key missing — set it on this profile or in Vault' }
  if (!fromAddr) return { ok: false, message: 'From address missing' }
  const rotating = usesContentRotation(settings)
  const rotationIndex = rotating ? getContentRotationIndex(settings) : 0
  let content: { subject: string; html: string }
  try {
    content = prepareSendContent(settings)(rotationIndex)
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
  const { subject, html } = content
  const testSubject = testEmailSubject(subject)

  const testRecipient = settings.send.testRecipient?.trim().toLowerCase() || ''
  if (testRecipient && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(testRecipient)) {
    return { ok: false, message: 'Test recipient must be a valid email address' }
  }
  const candidate =
    testRecipient || rt.currentRun.pendingSend[0] ||
    rt.currentRun.approved[0] ||
    rt.currentRun.candidates.find((c) => c.decision === 'keep')?.email ||
    parseEmailList(settings.find.pasteList).emails[0]
  if (!candidate) return { ok: false, message: 'Set a test recipient or approve/paste a list' }

  try {
    await sendOneEmailWithRetry(
      candidate,
      fromAddr,
      testSubject,
      html,
      apiKey,
      `test-${crypto.randomUUID()}`,
    )
    if (rotating) advanceContentRotation(settings, rotationIndex)
    appendLog('info', 'send', `Test send OK → ${candidate}`)
    if (settings.send.discordNotify) {
      const quota = getRemainingQuota(settings.send.dailyCap, settings)
      const profile = settings.send.activeProfile || activeProfileSlug(settings)
      fireNotify(
        'Outreach · Test send',
        `${candidate} · ${profile} · ${quota.sent}/${quota.cap}`,
        'ok',
        'outreach',
      )
      void notifyOutreachEmailSent(candidate, testSubject, 'promo', {
        profile,
        quotaSent: quota.sent,
        quotaCap: quota.cap,
      })
    }
    return { ok: true, message: `Test sent to ${candidate}` }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    appendLog('error', 'send', `Test send failed: ${message}`)
    return { ok: false, message }
  }
}
