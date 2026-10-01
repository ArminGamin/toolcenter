import { type ChildProcess } from 'node:child_process'
import path from 'node:path'
import { appendLog } from './log.js'
import { isPlaceholderContact, personalRejectReason } from './personal-rules.js'
import { readJsonFile, writeJsonFile, readEmailSet } from './json-store.js'
import { CURRENT_FILE, RUNS_DIR } from './paths.js'
import type { OutreachCampaignHealth, OutreachLeadEvidence, OutreachRun, OutreachSettings } from './types.js'
import { getOutreachSettings, saveOutreachSettings, resolveSendProfileName, readSendProfiles, profileKeyId } from './settings.js'
import { readPermanentBlacklist } from './blacklist.js'
import { sentFilePath, rejectedFilePath } from './profile-data.js'
import { countHeadlessFindRuns } from './find-process.js'
import { cleanEmails } from './clean.js'
import { bindCurrentProfile, currentBusinessProfile } from '../business-profiles.js'

export type OutreachRuntimeSnap = {
  currentRun: OutreachRun
  findChild: ChildProcess | null
  findEpoch: number
  findSpawnLock: boolean
  sendAbort: boolean
  sendPaused: boolean
  sendLoopActive: boolean
  sendEpoch: number
  chainSessionActive: boolean
  chainIndex: number
  chainAdvanceInFlight: boolean
  chainEmptyStreak: number
  chainStartedAt: string | null
  chainFinishedAt: string | null
}

type OutreachGlobal = typeof globalThis & {
  __ccOutreachSessionInit?: boolean
  __ccOutreachRt?: OutreachRuntimeSnap
  __ccOutreachGen?: number
}

const globalRuntimeBags = ((globalThis as typeof globalThis & {
  __ccOutreachProfiles?: Map<string, Record<string, unknown>>
}).__ccOutreachProfiles ??= new Map<string, Record<string, unknown>>())

function activeGlobalBag() {
  const id = currentBusinessProfile().id
  let bag = globalRuntimeBags.get(id)
  if (!bag) {
    bag = {}
    globalRuntimeBags.set(id, bag)
  }
  return bag
}

export const gOutreach = new Proxy(globalThis as OutreachGlobal, {
  get(target, property, receiver) {
    if (typeof property === 'string' && property.startsWith('__ccOutreach')) {
      return activeGlobalBag()[property]
    }
    return Reflect.get(target, property, receiver)
  },
  set(target, property, value, receiver) {
    if (typeof property === 'string' && property.startsWith('__ccOutreach')) {
      activeGlobalBag()[property] = value
      return true
    }
    return Reflect.set(target, property, value, receiver)
  },
}) as OutreachGlobal

export function idleRun(): OutreachRun {
  return {
    id: '', stage: 'idle', status: 'idle', createdAt: '', updatedAt: '',
    found: [], candidates: [], approved: [], pendingSend: [], sent: [], failed: [], sendIndex: 0,
    liveSendActive: false, finderComplete: false, liveProvisional: [], liveEligible: [], leadEvidence: {},
  }
}

function sentFile(settings?: OutreachSettings) {
  return sentFilePath(settings ?? getOutreachSettings())
}
function rejectedFile(settings?: OutreachSettings) {
  return rejectedFilePath(settings ?? getOutreachSettings())
}

function extractFromEmail(fromAddr: string): string {
  const raw = String(fromAddr || '').trim()
  const m = raw.match(/<([^>]+)>/)
  return (m?.[1] || raw).trim().toLowerCase()
}
export const OUTREACH_MODULE_GEN = (gOutreach.__ccOutreachGen = (gOutreach.__ccOutreachGen ?? 0) + 1)

function isCurrentOutreachModule() {
  if (gOutreach.__ccOutreachGen == null) gOutreach.__ccOutreachGen = OUTREACH_MODULE_GEN
  return OUTREACH_MODULE_GEN === gOutreach.__ccOutreachGen
}

function freshRuntime() {
  return {
    chainSessionActive: false,
    chainIndex: 0,
    chainAdvanceInFlight: false,
    chainEmptyStreak: 0,
    chainStartedAt: null as string | null,
    chainFinishedAt: null as string | null,
    currentRun: idleRun(),
    findChild: null as ChildProcess | null,
    sendAbort: false,
    sendPaused: false,
    sendLoopActive: false,
    sendEpoch: 0,
    leadPersistTimer: null as ReturnType<typeof setTimeout> | null,
    findEpoch: 0,
    findSpawnLock: false,
  }
}

const runtimeByProfile = new Map<string, ReturnType<typeof freshRuntime>>()
function activeRuntime() {
  const id = currentBusinessProfile().id
  let runtime = runtimeByProfile.get(id)
  if (!runtime) {
    runtime = freshRuntime()
    runtimeByProfile.set(id, runtime)
  }
  return runtime
}

export const rt = new Proxy(freshRuntime(), {
  get(_target, property) {
    return Reflect.get(activeRuntime(), property)
  },
  set(_target, property, value) {
    return Reflect.set(activeRuntime(), property, value)
  },
}) as ReturnType<typeof freshRuntime>

export function syncOutreachRuntime() {
  const existing = gOutreach.__ccOutreachRt
  const staleModule = !isCurrentOutreachModule()
  if (staleModule) {
    // A ChildProcess/send-loop created before Vite HMR is still the owner of this
    // run. Let it publish progress only while both run id and epoch still match.
    // Abort/new-run bumps the epoch, so genuinely stale closures cannot resurrect.
    const sameRun = Boolean(
      existing &&
        existing.currentRun.id &&
        rt.currentRun.id &&
        existing.currentRun.id === rt.currentRun.id,
    )
    const sameEpoch = Boolean(existing && existing.findEpoch === rt.findEpoch)
    const ownsOnlyLiveChild = Boolean(
      childProcessRunning(rt.findChild) &&
        !childProcessRunning(existing?.findChild),
    )
    if (ownsOnlyLiveChild) {
      // A chain callback created before HMR can legitimately launch the next
      // wave. If it owns the only live ChildProcess, adopt that new run/epoch.
      gOutreach.__ccOutreachRt = {
        currentRun: rt.currentRun,
        findChild: rt.findChild,
        findEpoch: rt.findEpoch,
        findSpawnLock: rt.findSpawnLock,
        sendAbort: rt.sendAbort,
        sendPaused: rt.sendPaused,
        sendLoopActive: rt.sendLoopActive,
        sendEpoch: rt.sendEpoch,
        chainSessionActive: rt.chainSessionActive,
        chainIndex: rt.chainIndex,
        chainAdvanceInFlight: rt.chainAdvanceInFlight,
        chainEmptyStreak: rt.chainEmptyStreak,
        chainStartedAt: rt.chainStartedAt,
        chainFinishedAt: rt.chainFinishedAt,
      }
      return
    }
    if (!existing || !sameRun || !sameEpoch) return
    gOutreach.__ccOutreachRt = {
      currentRun: rt.currentRun,
      findChild: rt.findChild,
      findEpoch: rt.findEpoch,
      findSpawnLock: rt.findSpawnLock,
      // Preserve controls set by the newest module (Pause/Abort after HMR).
      sendAbort: existing.sendAbort,
      sendPaused: existing.sendPaused,
      sendLoopActive: rt.sendLoopActive,
      sendEpoch: existing.sendEpoch ?? rt.sendEpoch,
      chainSessionActive: rt.chainSessionActive,
      chainIndex: rt.chainIndex,
      chainAdvanceInFlight: rt.chainAdvanceInFlight,
      chainEmptyStreak: rt.chainEmptyStreak,
      chainStartedAt: rt.chainStartedAt,
      chainFinishedAt: rt.chainFinishedAt,
    }
    return
  }
  gOutreach.__ccOutreachRt = {
    currentRun: rt.currentRun,
    findChild: rt.findChild,
    findEpoch: rt.findEpoch,
    findSpawnLock: rt.findSpawnLock,
    sendAbort: rt.sendAbort,
    sendPaused: rt.sendPaused,
    sendLoopActive: rt.sendLoopActive,
    sendEpoch: rt.sendEpoch,
    chainSessionActive: rt.chainSessionActive,
    chainIndex: rt.chainIndex,
    chainAdvanceInFlight: rt.chainAdvanceInFlight,
    chainEmptyStreak: rt.chainEmptyStreak,
    chainStartedAt: rt.chainStartedAt,
    chainFinishedAt: rt.chainFinishedAt,
  }
}

/** Epoch that survives HMR — old ChildProcess listeners must use this, not a stale `let`. */
export function liveFindEpoch(): number {
  return gOutreach.__ccOutreachRt?.findEpoch ?? rt.findEpoch
}

export function liveFindChild(): ChildProcess | null {
  return gOutreach.__ccOutreachRt?.findChild ?? rt.findChild
}

export function liveSendAbort(): boolean {
  return gOutreach.__ccOutreachRt?.sendAbort ?? rt.sendAbort
}

export function liveSendEpoch(): number {
  return gOutreach.__ccOutreachRt?.sendEpoch ?? rt.sendEpoch
}

export function liveSendPaused(): boolean {
  return gOutreach.__ccOutreachRt?.sendPaused ?? rt.sendPaused
}

export function childProcessRunning(child: ChildProcess | null | undefined): child is ChildProcess {
  return Boolean(
    child &&
      !child.killed &&
      child.exitCode === null &&
      child.signalCode === null,
  )
}

/** Release a spawn lock without letting an old HMR callback unlock a newer child. */
export function releaseFindSpawnLock(owner?: ChildProcess | null): void {
  rt.findSpawnLock = false
  const snap = gOutreach.__ccOutreachRt
  if (!snap) return
  const sharedChild = snap.findChild
  const mayReleaseShared =
    owner != null
      ? sharedChild === owner || !childProcessRunning(sharedChild)
      : !childProcessRunning(sharedChild)
  if (!mayReleaseShared) return
  snap.findSpawnLock = false
  if (owner && sharedChild === owner) snap.findChild = null
}

/** Recover a lock left behind after Abort/HMR when no finder actually exists. */
export function recoverStaleFindSpawnLock(): boolean {
  if (!rt.findSpawnLock) return false
  const sharedChild = gOutreach.__ccOutreachRt?.findChild
  if (
    childProcessRunning(rt.findChild) ||
    childProcessRunning(sharedChild) ||
    countHeadlessFindRuns() > 0
  ) {
    return false
  }
  releaseFindSpawnLock()
  return true
}

/** Pull progress published by a pre-HMR owner into the current module instance. */
export function publishSendControls(overrides?: { paused?: boolean; abort?: boolean; loopActive?: boolean }) {
  if (overrides?.paused !== undefined) rt.sendPaused = overrides.paused
  if (overrides?.abort !== undefined) rt.sendAbort = overrides.abort
  if (overrides?.loopActive !== undefined) rt.sendLoopActive = overrides.loopActive
  const snap = gOutreach.__ccOutreachRt
  if (snap) {
    snap.sendPaused = rt.sendPaused
    snap.sendAbort = rt.sendAbort
    snap.sendLoopActive = rt.sendLoopActive
    snap.sendEpoch = rt.sendEpoch
  }
  syncOutreachRuntime()
}

/** Prior send loop died (HMR/restart) but rt.sendLoopActive stayed true — unblock Resume/Start. */
export function recoverZombieSendLoop(): boolean {
  if (!rt.sendLoopActive) return false
  if (rt.currentRun.status === 'sending') return false
  if (!rt.currentRun.pendingSend.length) return false
  rt.sendLoopActive = false
  rt.sendEpoch++
  publishSendControls({ loopActive: false })
  appendLog('info', 'send', 'Recovered stale send loop — restarting send')
  return true
}

export function repairActiveSendProfileIfStale(settings: OutreachSettings): OutreachSettings {
  const name = resolveSendProfileName(settings.send.activeProfile?.trim() || '')
  if (!name) return settings
  const profile = readSendProfiles().profiles.find(
    (p) => profileKeyId(p.name) === profileKeyId(name),
  )
  if (!profile) return settings
  const expectedFrom = extractFromEmail(profile.resendFrom)
  const currentFrom = extractFromEmail(settings.send.resendFrom)
  const wrongBrand =
    expectedFrom.includes('tavoknyga') && settings.send.html.includes('vasaroskampelis.com')
  if (expectedFrom && currentFrom === expectedFrom && !wrongBrand) return settings
  appendLog(
    'info',
    'send',
    `Repaired send settings for “${profile.name}” (From/HTML were from another profile)`,
  )
  const saved = saveOutreachSettings({
    send: {
      ...settings.send,
      ...profile.send,
      activeProfile: profile.name,
      resendFrom: profile.resendFrom,
      resendApiKey: profile.resendApiKey,
    },
  })
  return saved.settings ?? settings
}

export function pullOutreachRuntime() {
  if (!isCurrentOutreachModule()) return
  const snap = gOutreach.__ccOutreachRt
  if (!snap) return
  rt.currentRun = snap.currentRun
  rt.findChild = snap.findChild
  rt.findEpoch = snap.findEpoch
  rt.findSpawnLock = snap.findSpawnLock
  rt.sendAbort = snap.sendAbort
  rt.sendPaused = snap.sendPaused
  rt.sendLoopActive = snap.sendLoopActive
  rt.sendEpoch = snap.sendEpoch ?? 0
  rt.chainSessionActive = snap.chainSessionActive
  rt.chainIndex = snap.chainIndex
  rt.chainAdvanceInFlight = snap.chainAdvanceInFlight
  rt.chainEmptyStreak = snap.chainEmptyStreak
  rt.chainStartedAt = snap.chainStartedAt
  rt.chainFinishedAt = snap.chainFinishedAt

  // `ChildProcess.killed` stays false after a normal exit. Use exit/signal codes
  // so an HMR-restored, naturally-closed child cannot leave the UI "running".
  if (rt.findChild && !childProcessRunning(rt.findChild)) {
    rt.findChild = null
    rt.findSpawnLock = false
    snap.findChild = null
    snap.findSpawnLock = false
  }

  // A callback created before HMR always persists to disk before it can publish
  // to the new module. Reconcile a newer same-run snapshot here.
  const disk = readJsonFile<OutreachRun | null>(CURRENT_FILE(), null)
  if (
    disk?.id &&
    disk.id === rt.currentRun.id &&
    Date.parse(disk.updatedAt || '') > Date.parse(rt.currentRun.updatedAt || '')
  ) {
    rt.currentRun = disk
    snap.currentRun = disk
  }
}

/** Stream live scrape emails into the current run (throttled disk write). */
export function noteLiveLead(email: string) {
  noteLiveLeadWithState(email, { verified: false })
}

export function noteVerifiedLiveLead(email: string) {
  noteLiveLeadWithState(email, { verified: true })
}

export function noteQualifiedLiveLead(raw: Record<string, unknown>) {
  const email = String(raw.email || '').trim().toLowerCase()
  if (!email) return
  const evidence: OutreachLeadEvidence = {
    email,
    name: String(raw.display_name || ''),
    sourceUrl: String(raw.source_url || ''),
    sourceUrls: [String(raw.source_url || '')].filter(Boolean),
    score: Number(raw.score || 0),
    sourceType: String(raw.source_type || 'web'),
    personEvidence: Array.isArray(raw.person_evidence) ? raw.person_evidence.map(String) : [],
    locationEvidence: Array.isArray(raw.location_evidence) ? raw.location_evidence.map(String) : [],
    contactEvidence: Array.isArray(raw.contact_evidence) ? raw.contact_evidence.map(String) : [],
    canonicalUrl: String(raw.canonical_url || raw.source_url || ''),
    identityKey: String(raw.identity_key || ''),
  }
  noteLiveLeadWithState(email, { verified: false, evidence })
}

export function noteCampaignHealth(raw: Record<string, unknown>) {
  const run = gOutreach.__ccOutreachRt?.currentRun ?? rt.currentRun
  if (!run.id) return
  const previous = run.health
  const now = new Date().toISOString()
  const next: OutreachCampaignHealth = {
    target: Number(raw.target ?? previous?.target ?? 0),
    qualifiedPeople: Number(raw.qualifiedPeople ?? previous?.qualifiedPeople ?? run.found.length),
    candidatesFound: Number(raw.candidatesFound ?? previous?.candidatesFound ?? 0),
    duplicatesRemoved: Number(raw.duplicatesRemoved ?? previous?.duplicatesRemoved ?? 0),
    rejectedOrganizations: Number(raw.rejectedOrganizations ?? previous?.rejectedOrganizations ?? 0),
    invalidContacts: Number(raw.invalidContacts ?? previous?.invalidContacts ?? 0),
    rejectedNotPerson: Number(raw.rejectedNotPerson ?? previous?.rejectedNotPerson ?? 0),
    discoveryStatus: String(raw.discoveryStatus ?? previous?.discoveryStatus ?? 'RUNNING'),
    stage: String(raw.stage ?? previous?.stage ?? 'DISCOVERY'),
    workersHealthy: Number(raw.workersHealthy ?? previous?.workersHealthy ?? 1),
    workersTotal: Number(raw.workersTotal ?? previous?.workersTotal ?? 0),
    queueSize: Number(raw.queueSize ?? raw.queue ?? previous?.queueSize ?? 0),
    processedSources: Number(raw.processedSources ?? raw.pages ?? previous?.processedSources ?? 0),
    // Every health event proves the worker is alive. Keeping the old heartbeat
    // here caused the watchdog to kill healthy long scrapes after three minutes.
    workerHeartbeat: String(raw.workerHeartbeat ?? now),
    lastSuccessfulAction: String(raw.lastSuccessfulAction ?? now),
    errorCount: Number(raw.errorCount ?? previous?.errorCount ?? 0),
    recoveries: Number(raw.recoveries ?? previous?.recoveries ?? 0),
    currentSources: Array.isArray(raw.currentSources)
      ? raw.currentSources.map(String).slice(0, 16)
      : previous?.currentSources || [],
  }
  rt.currentRun = { ...run, health: next, updatedAt: new Date().toISOString() }
  syncOutreachRuntime()
  if (rt.leadPersistTimer) clearTimeout(rt.leadPersistTimer)
  rt.leadPersistTimer = setTimeout(bindCurrentProfile(() => {
    rt.leadPersistTimer = null
    persistRun(gOutreach.__ccOutreachRt?.currentRun ?? rt.currentRun)
  }), 500)
}

function noteLiveLeadWithState(email: string, opts: { verified: boolean; evidence?: OutreachLeadEvidence }) {
  const e = String(email || '').trim().toLowerCase()
  if (!e) return
  // Prefer HMR-surviving run bag so pre-reload ChildProcess listeners still update UI
  const run = gOutreach.__ccOutreachRt?.currentRun ?? rt.currentRun
  if (!run.id) return
  // Drop institutional / keyword-blocked locals before they appear in Leads
  if (isPlaceholderContact(e) || (!opts.evidence && personalRejectReason(e))) return
  // Never show already-sent / rejected / bounce-blacklist as “found”
  if (readEmailSet(sentFile()).has(e)) return
  if (readEmailSet(rejectedFile()).has(e)) return
  if (readPermanentBlacklist().has(e)) return
  const foundAlready = run.found.includes(e)
  if (foundAlready && !opts.verified) return

  const settings = getOutreachSettings()
  const autoApprove = settings.requireApprove === false || Boolean(settings.chain?.enabled && rt.chainSessionActive)
  const provisional = new Set(run.liveProvisional || [])
  const eligible = new Set(run.liveEligible || [])
  const evidenceMap = { ...(run.leadEvidence || {}) }
  if (opts.evidence) {
    const identityDuplicate = opts.evidence.identityKey
      ? Object.values(evidenceMap).find(
          (item) => item.identityKey === opts.evidence!.identityKey && item.email !== e,
        )
      : undefined
    if (identityDuplicate) {
      evidenceMap[identityDuplicate.email] = {
        ...identityDuplicate,
        sourceUrls: [...new Set([...identityDuplicate.sourceUrls, ...opts.evidence.sourceUrls])],
      }
      rt.currentRun = { ...run, leadEvidence: evidenceMap, updatedAt: new Date().toISOString() }
      syncOutreachRuntime()
      if (rt.leadPersistTimer) clearTimeout(rt.leadPersistTimer)
      rt.leadPersistTimer = setTimeout(bindCurrentProfile(() => {
        rt.leadPersistTimer = null
        persistRun(gOutreach.__ccOutreachRt?.currentRun ?? rt.currentRun)
      }), 900)
      return
    }
    const existing = evidenceMap[e]
    evidenceMap[e] = existing
      ? { ...opts.evidence, sourceUrls: [...new Set([...existing.sourceUrls, ...opts.evidence.sourceUrls])] }
      : opts.evidence
  }
  provisional.delete(e)

  // Finder emits provisional leads before the final MX/SMTP phase. Do not
  // expose them to a live sender when verification was requested.
  if (settings.find.verify && !opts.verified) {
    provisional.add(e)
  } else {
    const cleaned = cleanEmails([e], settings.clean, { settings, evidence: evidenceMap })
    const candidate = cleaned.keep[0] || cleaned.drop[0]
    if (candidate && !run.candidates.some((row) => row.email === candidate.email)) {
      const keep = candidate.decision === 'keep'
      run.candidates = [
        ...run.candidates,
        {
          ...candidate,
          selected: keep && autoApprove,
        },
      ]
      if (keep) {
        eligible.add(candidate.email)
        if (autoApprove && !run.approved.includes(candidate.email)) {
          run.approved = [...run.approved, candidate.email]
          run.pendingSend = run.pendingSend.includes(candidate.email)
            ? run.pendingSend
            : [...run.pendingSend, candidate.email]
        }
      }
    }
  }

  // Vite HMR / disk rehydrate can stamp “Interrupted” while the finder is still live —
  // revive the run so the UI matches reality.
  const child = liveFindChild()
  const reviveFind =
    run.stage === 'find' &&
    (run.status === 'error' || run.status === 'idle') &&
    Boolean(child && !child.killed)

  const found = foundAlready ? run.found : [...run.found, e]
  const next: OutreachRun = {
    ...run,
    found,
    candidates: [...run.candidates],
    approved: [...run.approved],
    pendingSend: [...run.pendingSend],
    liveProvisional: [...provisional],
    liveEligible: [...eligible],
    leadEvidence: evidenceMap,
    ...(reviveFind
      ? { status: 'running' as const, error: undefined, stage: 'find' as const }
      : {}),
    updatedAt: new Date().toISOString(),
    message: `Scraping… ${found.length} leads`,
  }
  rt.currentRun = next
  syncOutreachRuntime()
  wakeLiveQueue()
  if (rt.leadPersistTimer) clearTimeout(rt.leadPersistTimer)
  rt.leadPersistTimer = setTimeout(bindCurrentProfile(() => {
    rt.leadPersistTimer = null
    persistRun(gOutreach.__ccOutreachRt?.currentRun ?? rt.currentRun)
  }), 900)
}

const liveQueueWaiters = new Set<() => void>()

export function wakeLiveQueue() {
  for (const wake of liveQueueWaiters) wake()
  liveQueueWaiters.clear()
}

export function waitForLiveQueue(timeoutMs = 1000): Promise<void> {
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      liveQueueWaiters.delete(finish)
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(finish, timeoutMs)
    liveQueueWaiters.add(finish)
  })
}

/** Filter keyword/role rejects from a scraped email list (defense in depth). */
export function filterPersonalRejectEmails(emails: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of emails) {
    const e = String(raw || '').trim().toLowerCase()
    if (!e || seen.has(e)) continue
    if (personalRejectReason(e)) continue
    seen.add(e)
    out.push(e)
  }
  return out
}

export function reviveFindIfLive() {
  const child = liveFindChild()
  if (!(child && !child.killed)) return
  const run = gOutreach.__ccOutreachRt?.currentRun ?? rt.currentRun
  if (run.stage !== 'find') return
  if (run.status === 'running') return
  if (run.status !== 'error' && run.status !== 'idle') return
  touchRun({
    status: 'running',
    error: undefined,
    message: run.message || 'Scraping…',
  })
}

export function persistRun(run: OutreachRun) {
  rt.currentRun = run
  writeJsonFile(CURRENT_FILE(), run)
  if (run.id) {
    writeJsonFile(path.join(RUNS_DIR(), `${run.id}.json`), run)
  }
  syncOutreachRuntime()
}

export function touchRun(patch: Partial<OutreachRun>): OutreachRun {
  const next: OutreachRun = {
    ...rt.currentRun,
    ...patch,
    updatedAt: new Date().toISOString(),
  }
  persistRun(next)
  maybeReleaseFindLockForTerminalRun(next)
  return next
}

function maybeReleaseFindLockForTerminalRun(run: OutreachRun) {
  const terminal =
    run.status === 'error' || run.status === 'idle' || run.status === 'done' || run.status === 'waiting'
  if (!terminal) return
  if (childProcessRunning(liveFindChild())) return
  if (countHeadlessFindRuns() > 0) return
  releaseFindSpawnLock()
}

export function loadCurrentFromDisk() {
  const raw = readJsonFile<OutreachRun | null>(CURRENT_FILE(), null)
  if (!raw || !raw.id) return

  // Vite HMR re-imports this module with rt.findChild=null. NEVER kill headless here —
  // that was murdering live finds mid-search ("Cleared N leftover") and resetting Idle.
  const liveChild = Boolean(rt.findChild && !rt.findChild.killed)
  const liveOs = countHeadlessFindRuns()
  if (raw.status === 'sending' || raw.status === 'running') {
    if (liveChild || liveOs > 0) {
      // The in-memory owner is authoritative while work is live. Disk can lag by
      // the 900ms lead debounce and must not erase fresh progress during HMR.
      if (rt.currentRun.id === raw.id) {
        writeJsonFile(CURRENT_FILE(), rt.currentRun)
        syncOutreachRuntime()
        return
      }
    } else {
      raw.status = raw.stage === 'send' ? 'paused' : raw.stage === 'approve' ? 'waiting' : 'paused'
      if (raw.stage === 'find') {
        raw.error = undefined
        raw.message = 'Interrupted — queued to resume from the last checkpoint'
      }
      releaseFindSpawnLock()
    }
  }

  // Empty failed find with stale "Starting…" — treat as idle (refresh shouldn't resurrect it)
  const empty =
    !(raw.found?.length || raw.candidates?.length || raw.approved?.length || raw.pendingSend?.length)
  if (raw.status === 'error' && empty) {
    rt.currentRun = idleRun()
    writeJsonFile(CURRENT_FILE(), rt.currentRun)
    syncOutreachRuntime()
    return
  }

  // Prefer real error text over leftover "Starting…"
  if (raw.status === 'error' && raw.error) {
    raw.message = String(raw.error).slice(0, 200)
  }

  // Drop blocked locals that may have been scraped before keyword rules existed
  if (Array.isArray(raw.found) && raw.found.length) {
    raw.found = filterPersonalRejectEmails(raw.found)
  }

  rt.currentRun = raw
  writeJsonFile(CURRENT_FILE(), raw)
  syncOutreachRuntime()
}

/** Wipe active run. Keeps profiles, settings, notes, sent/rejected history, and live feed log. */
export function resetSessionToIdle(reason: string) {
  rt.currentRun = idleRun()
  writeJsonFile(CURRENT_FILE(), rt.currentRun)
  releaseFindSpawnLock()
  appendLog('info', 'idle', reason)
  syncOutreachRuntime()
}

export function restoreOutreachRuntimeFromGlobal(): boolean {
  const snap = gOutreach.__ccOutreachRt
  if (!snap) return false
  rt.currentRun = snap.currentRun || idleRun()
  rt.findChild = snap.findChild ?? null
  rt.findEpoch = snap.findEpoch ?? 0
  rt.findSpawnLock = snap.findSpawnLock ?? false
  rt.sendAbort = snap.sendAbort ?? false
  rt.sendPaused = snap.sendPaused ?? false
  rt.sendLoopActive = snap.sendLoopActive ?? false
  rt.sendEpoch = snap.sendEpoch ?? 0
  rt.chainSessionActive = snap.chainSessionActive ?? false
  rt.chainIndex = snap.chainIndex ?? 0
  rt.chainAdvanceInFlight = snap.chainAdvanceInFlight ?? false
  rt.chainEmptyStreak = snap.chainEmptyStreak ?? 0
  rt.chainStartedAt = snap.chainStartedAt ?? null
  rt.chainFinishedAt = snap.chainFinishedAt ?? null
  return true
}

export function initOutreachSession(killOrphans: () => void) {
  if (!gOutreach.__ccOutreachSessionInit) {
    gOutreach.__ccOutreachSessionInit = true
    try { killOrphans() } catch { /* ignore */ }
    loadCurrentFromDisk()
    if (!rt.currentRun.id) {
      rt.currentRun = idleRun()
      writeJsonFile(CURRENT_FILE(), rt.currentRun)
    }
    syncOutreachRuntime()
  } else {
    restoreOutreachRuntimeFromGlobal()
    loadCurrentFromDisk()
  }
}
