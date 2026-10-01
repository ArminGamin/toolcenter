/**
 * Outreach Autopilot — FIND → CLEAN → APPROVE → SEND orchestration.
 * Data under CC_DATA/outreach/. Secrets from vault only (never logged).
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { loadVault } from './cc-services.js'
import {
  PROFILES_DATA_DIR,
  PERMANENT_BLACKLIST_FILE,
  LEAD_FINDER,
  ensureDirs,
} from './outreach/paths.js'
import type {
  CleanSettings,
  OutreachRun,
  OutreachSendProfile,
  OutreachSettings,
} from './outreach/types.js'

import { initOutreachSession, rt, pullOutreachRuntime, touchRun, resetSessionToIdle, childProcessRunning, liveFindChild } from './outreach/runtime.js'
import {
  killLeftoverHeadlessFinders,
  hardStopAllFinds,
  sleepSync,
  resolvePython,
  leadFinderSpawnEnv,
  countHeadlessFindRuns,
  forceAbortFindsInstant,
} from './outreach/find-process.js'
import {
  activeProfileSlug,
  profileLeadsDbPath,
  getRemainingQuota,
  quotaSettingsForActiveProfile,
  sentFile,
  rejectedFile,
} from './outreach/quota.js'
export {
  activeProfileSlug,
  profileLeadsDbPath,
  getRemainingQuota,
  syncOutreachQuotasFromResend,
  setOutreachProfileQuota,
} from './outreach/quota.js'
import { chainProfileList, activeChainProfileName, markChainFinished, clearChainTimer } from './outreach/chain.js'
import {
  abortOutreach,
  startOutreachRun,
  applyCleanToFound,
  maybeAutoSendAfterClean,
  resumeInterruptedOutreach,
} from './outreach/run-orchestrator.js'
export {
  startOutreachRun,
  abortOutreach,
  pauseOutreachSend,
  resumeOutreachSend,
  approveOutreach,
} from './outreach/run-orchestrator.js'
import { startOutreachSend } from './outreach/send-run.js'
export { startOutreachSend, startOutreachLiveSend, testOutreachSend } from './outreach/send-run.js'
import { configuredFindLeadTarget } from './outreach/find-scaling.js'
import { registerOutreachDelegates } from './outreach/delegates.js'
import { dbgLog } from './outreach/debug-log.js'
import {
  listLeadFinderExportFiles,
  exportEmailsToLeadFinder,
} from './outreach/find-run.js'

import { appendLog } from './outreach/log.js'
import { loadSubjectsFile, resolveSendIdentity, maskKey, brandPromoHtmlPath } from './outreach/send-identity.js'
export { getOutreachLog, clearOutreachLog } from './outreach/log.js'
import { parseEmailList } from './outreach/email-parse.js'
export { parseEmailList } from './outreach/email-parse.js'
import { writeJsonFile, readEmailSet, writeEmailSet } from './outreach/json-store.js'
import {
  profileDataDir,
  migrateLegacyGlobalHistoryOnce,
} from './outreach/profile-data.js'
import { cleanEmails } from './outreach/clean.js'
export { cleanEmails } from './outreach/clean.js'
import {
  readPermanentBlacklist,
} from './outreach/blacklist.js'
export {
  permanentBlacklistPath,
  readPermanentBlacklist,
  writePermanentBlacklist,
  addToPermanentBlacklist,
} from './outreach/blacklist.js'
export { importPermanentBlacklistFromCsvFiles } from './outreach/blacklist-csv.js'
import {
  getOutreachSettings,
  saveOutreachSettings,
  profileKeyId,
  resolveSendProfileName,
  readSendProfiles,
  writeSendProfiles,
  readOutreachSecrets,
  writeOutreachSecrets,
} from './outreach/settings.js'
export { defaultSettings, getOutreachSettings, saveOutreachSettings } from './outreach/settings.js'
export type {
  OutreachStage,
  OutreachStatus,
  LogKind,
  OutreachLogEntry,
  EmailCandidate,
  FindSettings,
  CleanSettings,
  SendSettings,
  ChainSettings,
  OutreachSendProfile,
  OutreachSettings,
  OutreachRun,
  OutreachLeadEvidence,
  OutreachCampaignHealth,
} from './outreach/types.js'



function todayKey() {
  // A daily send cap must reset at the operator's local midnight, not UTC.
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}



export function listOutreachSendProfiles(): {
  ok: boolean
  profiles: { name: string; updatedAt: string; from: string; keyMasked: string }[]
} {
  const { profiles } = readSendProfiles()
  return {
    ok: true,
    profiles: profiles.map((p) => ({
      name: p.name,
      updatedAt: p.updatedAt,
      from: p.resendFrom || '',
      keyMasked: maskKey(p.resendApiKey),
    })),
  }
}

export function saveOutreachSendProfile(name: string): {
  ok: boolean
  message: string
  settings?: OutreachSettings
  profiles?: { name: string; updatedAt: string; from: string; keyMasked: string }[]
} {
  const trimmed = (name || '').trim()
  if (!trimmed) return { ok: false, message: 'Enter a profile name' }
  if (rt.currentRun.status === 'running' || rt.currentRun.status === 'sending' || rt.currentRun.pendingSend.length) {
    return {
      ok: false,
      message: 'Finish, abort, or clear the current run before changing send profile',
    }
  }
  const settings = getOutreachSettings()
  const identity = resolveSendIdentity(settings)
  if (!identity.apiKey) {
    return { ok: false, message: 'Set a Resend API key (profile field or vault) before saving' }
  }
  const snapshot: OutreachSendProfile = {
    name: trimmed,
    updatedAt: new Date().toISOString(),
    resendApiKey: settings.send.resendApiKey.trim() || identity.apiKey,
    resendFrom: settings.send.resendFrom.trim() || identity.fromAddr,
    send: {
      subject: settings.send.subject,
      html: settings.send.html,
      useAssetHtml: settings.send.useAssetHtml,
      promoHtmlPaths: settings.send.promoHtmlPaths,
      testRecipient: settings.send.testRecipient,
      rotateSubjects: settings.send.rotateSubjects,
      fromOverride: settings.send.fromOverride,
      dailyCap: settings.send.dailyCap,
      delayMs: settings.send.delayMs,
      autoContinueNextDay: settings.send.autoContinueNextDay,
      discordNotify: settings.send.discordNotify,
    },
  }
  const data = readSendProfiles()
  const idx = data.profiles.findIndex((p) => p.name.toLowerCase() === trimmed.toLowerCase())
  if (idx >= 0) data.profiles[idx] = snapshot
  else data.profiles.push(snapshot)
  const secrets = readOutreachSecrets()
  secrets.profileKeys[profileKeyId(trimmed)] = snapshot.resendApiKey
  writeOutreachSecrets(secrets)
  writeSendProfiles(data)
  const saved = saveOutreachSettings({
    send: { ...settings.send, activeProfile: trimmed },
  })
  appendLog('info', 'send', `Saved send profile “${trimmed}”`)
  return {
    ok: true,
    message: `Saved profile “${trimmed}”`,
    settings: saved.settings,
    profiles: listOutreachSendProfiles().profiles,
  }
}

export function loadOutreachSendProfile(name: string): {
  ok: boolean
  message: string
  settings?: OutreachSettings
} {
  const trimmed = resolveSendProfileName((name || '').trim())
  if (!trimmed) return { ok: false, message: 'Pick a profile to load' }
  const data = readSendProfiles()
  const profile = data.profiles.find((p) => p.name.toLowerCase() === trimmed.toLowerCase())
  if (!profile) return { ok: false, message: `Profile “${trimmed}” not found` }

  // Never silently retarget a prepared or active campaign to another identity.
  // Scrape DB + sent/rejected/quota follow the loaded profile (separate products).
  if (rt.currentRun.status === 'running' || rt.currentRun.status === 'sending' || rt.currentRun.pendingSend.length) {
    return {
      ok: false,
      message: 'Finish, abort, or clear the current run before changing send profile',
    }
  }

  const saved = saveOutreachSettings({
    send: {
      ...profile.send,
      activeProfile: profile.name,
      resendApiKey: profile.resendApiKey,
      resendFrom: profile.resendFrom,
    },
  })
  appendLog('info', 'send', `Loaded send profile “${profile.name}”`)
  return {
    ok: true,
    message: `Loaded “${profile.name}”`,
    settings: saved.settings,
  }
}

export function deleteOutreachSendProfile(name: string): {
  ok: boolean
  message: string
  profiles?: { name: string; updatedAt: string; from: string; keyMasked: string }[]
  settings?: OutreachSettings
} {
  const trimmed = (name || '').trim()
  if (!trimmed) return { ok: false, message: 'Pick a profile to delete' }
  const data = readSendProfiles()
  const before = data.profiles.length
  data.profiles = data.profiles.filter((p) => p.name.toLowerCase() !== trimmed.toLowerCase())
  if (data.profiles.length === before) return { ok: false, message: `Profile “${trimmed}” not found` }
  const secrets = readOutreachSecrets()
  delete secrets.profileKeys[profileKeyId(trimmed)]
  writeOutreachSecrets(secrets)
  writeSendProfiles(data)
  const settings = getOutreachSettings()
  let nextSettings = settings
  if (settings.send.activeProfile.toLowerCase() === trimmed.toLowerCase()) {
    nextSettings = saveOutreachSettings({
      send: { ...settings.send, activeProfile: '' },
    }).settings
  }
  appendLog('info', 'send', `Deleted send profile “${trimmed}”`)
  return {
    ok: true,
    message: `Deleted “${trimmed}”`,
    profiles: listOutreachSendProfiles().profiles,
    settings: nextSettings,
  }
}

function runCounts(run: OutreachRun) {
  const settings = getOutreachSettings()
  const quotaSettings = quotaSettingsForActiveProfile(settings)
  const quota = getRemainingQuota(undefined, quotaSettings)
  const findTarget = configuredFindLeadTarget(settings)
  return {
    found: run.found.length,
    kept: run.candidates.filter((c) => c.decision === 'keep').length,
    dropped: run.candidates.filter((c) => c.decision === 'drop').length,
    approved: run.approved.length,
    pendingSend: run.pendingSend.length,
    sent: run.sent.length,
    failed: run.failed.length,
    liveProvisional: run.liveProvisional?.length ?? 0,
    liveEligible: run.liveEligible?.length ?? 0,
    liveApprovalPending: Math.max(
      0,
      (run.liveEligible?.length ?? 0) - run.approved.length - run.pendingSend.length - run.sent.length,
    ),
    quotaSent: quota.sent,
    quotaCap: quota.cap,
    quotaRemaining: quota.remaining,
    findTarget,
  }
}

export function getOutreachState(opts?: { light?: boolean }) {
  pullOutreachRuntime()
  const light = Boolean(opts?.light)
  const settings = getOutreachSettings()
  const identity = resolveSendIdentity(settings)
  const vault = loadVault()
  const list = chainProfileList(settings)
  const chainCurrent = activeChainProfileName(settings)
  const displaySettings = quotaSettingsForActiveProfile(settings)
  const displayProfile = displaySettings.send.activeProfile || chainCurrent || ''
  const base = {
    ok: true as const,
    run: rt.currentRun,
    counts: runCounts(rt.currentRun),
    quota: getRemainingQuota(undefined, displaySettings),
    findChildRunning: childProcessRunning(liveFindChild()),
    sendLoopActive: rt.sendLoopActive,
    sendPaused: rt.sendPaused,
    chain: {
      active: rt.chainSessionActive && Boolean(settings.chain?.enabled),
      index: rt.chainIndex,
      total: list.length,
      current: chainCurrent || settings.send.activeProfile || '',
      profiles: list,
      startedAt: rt.chainStartedAt,
      finishedAt: rt.chainFinishedAt,
    },
    profileStore: {
      id: activeProfileSlug(displaySettings),
      name: displayProfile || '(default)',
      leadsDb: profileLeadsDbPath(displaySettings),
      sentCount: readEmailSet(sentFile(displaySettings)).size,
      rejectedCount: readEmailSet(rejectedFile(displaySettings)).size,
      permanentBlacklistCount: readPermanentBlacklist().size,
      permanentBlacklistPath: PERMANENT_BLACKLIST_FILE(),
    },
    vault: {
      hasResendKey: Boolean(identity.apiKey),
      from: identity.fromAddr || vault.RESEND_FROM?.trim() || '',
      keyMasked: identity.keyMasked,
      source: identity.source,
      activeProfile: settings.send.activeProfile || '',
      vaultFrom: vault.RESEND_FROM?.trim() || '',
      vaultKeyMasked: maskKey(vault.RESEND_API_KEY || ''),
    },
  }
  if (light) {
    // Fast poll — no settings/html/profiles (those make remount crawl)
    return base
  }
  const subjects = loadSubjectsFile()
  const promoPath = brandPromoHtmlPath()
  return {
    ...base,
    settings,
    sendProfiles: listOutreachSendProfiles().profiles,
    assets: {
      promoHtmlExists: fs.existsSync(promoPath),
      promoHtmlPath: promoPath,
      subjectsCount: subjects.length,
      subjectsPreview: subjects.slice(0, 5),
    },
  }
}


export function updateCandidatesSelection(selected: string[]): { ok: boolean; run: OutreachRun } {
  pullOutreachRuntime()
  const set = new Set(selected.map((e) => e.toLowerCase()))
  const candidates = rt.currentRun.candidates.map((c) => ({
    ...c,
    selected: c.decision === 'keep' ? set.has(c.email) : false,
  }))
  return { ok: true, run: touchRun({ candidates }) }
}


export function loadPromoHtmlIntoSettings(): {
  ok: boolean
  message: string
  settings?: OutreachSettings
} {
  const asset = brandPromoHtmlPath()
  if (!fs.existsSync(asset)) {
    return { ok: false, message: 'Promo HTML not found for this profile' }
  }
  const html = fs.readFileSync(asset, 'utf8')
  const cur = getOutreachSettings()
  const result = saveOutreachSettings({
    send: { ...cur.send, html, useAssetHtml: false },
  })
  appendLog('info', 'send', 'Loaded promo HTML into editor')
  return { ok: true, message: 'Loaded promo template into HTML editor', settings: result.settings }
}


export function dryRunClean(text: string, clean?: Partial<CleanSettings>) {
  const settings = getOutreachSettings()
  const cleanCfg = { ...settings.clean, ...(clean || {}) }
  const { emails, skipped } = parseEmailList(text)
  const result = cleanEmails(emails, cleanCfg, { settings })
  appendLog('info', 'clean', `Dry-run clean: ${emails.length} in → ${result.keep.length} keep`)
  return { ok: true, skipped, ...result, inputCount: emails.length }
}

/** Re-run Clean on the current scraped leads list (Leads tab → Clean button). */
export function cleanOutreachFound(): { ok: boolean; message: string; run: OutreachRun } {
  if (rt.findChild && !rt.findChild.killed) {
    return { ok: false, message: 'Wait for Find to finish (or Abort) before cleaning', run: rt.currentRun }
  }
  if (rt.currentRun.status === 'sending') {
    return { ok: false, message: 'Stop sending before re-cleaning', run: rt.currentRun }
  }
  const emails = [...(rt.currentRun.found || [])]
  if (!emails.length) {
    return { ok: false, message: 'No scraped leads to clean', run: rt.currentRun }
  }
  const settings = getOutreachSettings()
  appendLog('info', 'clean', `Manual clean of ${emails.length} scraped lead(s)`)
  const run = applyCleanToFound(emails, settings)
  maybeAutoSendAfterClean(settings, run)
  const kept = rt.currentRun.candidates.filter((c) => c.decision === 'keep').length
  const dropped = rt.currentRun.candidates.filter((c) => c.decision === 'drop').length
  const message = `Cleaned ${emails.length}: keep ${kept}, drop ${dropped}`
  return { ok: true, message, run: rt.currentRun }
}

export function resetSentSet(): { ok: boolean; message: string } {
  const slug = activeProfileSlug()
  writeEmailSet(sentFile(), new Set())
  appendLog('info', 'idle', `Sent set cleared (${slug}) — permanent blacklist untouched`)
  return {
    ok: true,
    message: `Sent history cleared (${slug}). Permanent blacklist kept (${readPermanentBlacklist().size}).`,
  }
}

export function resetRejectedSet(): { ok: boolean; message: string } {
  const slug = activeProfileSlug()
  writeEmailSet(rejectedFile(), new Set())
  appendLog('info', 'idle', `Rejected set cleared (${slug}) — permanent blacklist untouched`)
  return {
    ok: true,
    message: `Rejected history cleared (${slug}). Permanent blacklist kept (${readPermanentBlacklist().size}).`,
  }
}


export function clearOutreachRun(): { ok: boolean; message: string } {
  pullOutreachRuntime()
  rt.sendAbort = true
  rt.sendPaused = false
  rt.findEpoch++
  if (rt.chainSessionActive) {
    rt.chainSessionActive = false
    rt.chainAdvanceInFlight = false
    markChainFinished()
    appendLog('info', 'send', 'Profile chain cancelled (clear run)')
  } else {
    clearChainTimer()
  }
  if (rt.findChild && !rt.findChild.killed) {
    try {
      rt.findChild.kill()
    } catch {
      /* ignore */
    }
  }
  // Wait for in-flight sendOneEmail / find close before wiping the run
  const deadline = Date.now() + 2500
  while ((rt.sendLoopActive || rt.findChild) && Date.now() < deadline) {
    sleepSync(100)
  }
  rt.findChild = null
  resetSessionToIdle('Current run cleared')
  return { ok: true, message: 'Current run cleared' }
}

/** Called on boot — leftover pending only exists after HMR rehydrate (fresh launch clears the run). */
export function outreachBootCheck() {
  const settings = getOutreachSettings()
  if (!settings.send.autoContinueNextDay) return
  if (rt.currentRun.pendingSend?.length && getRemainingQuota().remaining > 0) {
    appendLog('info', 'send', `Leftover queue: ${rt.currentRun.pendingSend.length} (auto-continue available)`)
  }
}

outreachBootCheck()

export function getLeadFinderExportFiles() {
  return {
    ok: true,
    files: listLeadFinderExportFiles(),
    outputDir: path.join(LEAD_FINDER, 'output'),
  }
}

export function exportOutreachFoundLeads(): {
  ok: boolean
  path?: string
  message: string
  count: number
} {
  pullOutreachRuntime()
  const result = exportEmailsToLeadFinder(rt.currentRun.found || [])
  if (result.ok && result.path) {
    touchRun({ findOutputPath: result.path })
  }
  return result
}

/** Desktop launcher: clear run when reopening while the bridge is already up. */
export function freshLaunchSession(): { ok: boolean; message: string } {
  pullOutreachRuntime()
  rt.sendAbort = true
  rt.sendPaused = false
  rt.findEpoch++
  rt.chainSessionActive = false
  rt.chainAdvanceInFlight = false
  rt.chainEmptyStreak = 0
  clearChainTimer()
  if (rt.findChild && !rt.findChild.killed) {
    try {
      rt.findChild.kill()
    } catch {
      /* ignore */
    }
  }
  const deadline = Date.now() + 2500
  while ((rt.sendLoopActive || rt.findChild) && Date.now() < deadline) {
    sleepSync(100)
  }
  rt.findChild = null
  resetSessionToIdle('Desktop launch — session reset (profiles & settings kept)')
  return { ok: true, message: 'Session reset for fresh launch' }
}

/**
 * Manual wipe of Lead Finder scrape caches (domains, known emails, page HTML, yield).
 * Does not touch profiles, settings, notes, or Outreach sent/rejected history.
 */
export function clearScrapeCache(): { ok: boolean; message: string; details?: Record<string, unknown> } {
  pullOutreachRuntime()
  // Stop an active find so DBs aren't locked
  rt.sendAbort = true
  const stop = hardStopAllFinds('clear scrape cache')
  // #region agent log
  dbgLog('C', 'outreach.ts:clearScrapeCache', 'clear scrape after hard-stop', stop)
  // #endregion

  const script = path.join(LEAD_FINDER, 'clear_scrape_cache.py')
  if (!fs.existsSync(script)) {
    return { ok: false, message: 'clear_scrape_cache.py missing in ai-lead-finder' }
  }
  try {
    const py = resolvePython(LEAD_FINDER)
    const dbPath = profileLeadsDbPath()
    const slug = activeProfileSlug()
    const out = execFileSync(py, [script, '--db-path', dbPath], {
      cwd: LEAD_FINDER,
      windowsHide: true,
      timeout: 120_000,
      encoding: 'utf8',
      env: leadFinderSpawnEnv(),
    })
    const line = String(out)
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .pop()
    let parsed: { ok?: boolean; message?: string; details?: Record<string, unknown> } = {}
    try {
      parsed = line ? (JSON.parse(line) as typeof parsed) : {}
    } catch {
      parsed = { ok: false, message: line || 'Invalid clear response' }
    }
    // Also wipe this profile's sent history so those addresses can be re-scraped
    // and re-sent. Rejected + permanent bounce/complaint blacklist are NEVER touched.
    const sentBefore = readEmailSet(sentFile()).size
    const rejectedKept = readEmailSet(rejectedFile()).size
    const blacklistKept = readPermanentBlacklist().size
    if (parsed.ok) {
      writeEmailSet(sentFile(), new Set())
      appendLog(
        'info',
        'idle',
        `Sent history cleared (${sentBefore}) for “${slug}” — rejected kept (${rejectedKept}), permanent blacklist kept (${blacklistKept})`,
      )
    }
    // #region agent log
    dbgLog('C', 'outreach.ts:clearScrapeCache:sent', parsed.ok ? 'sent cleared, exclusions kept' : 'clear failed, histories kept', {
      ok: Boolean(parsed.ok),
      profile: slug,
      sentBefore,
      sentAfter: readEmailSet(sentFile()).size,
      rejectedKept,
      blacklistKept,
    })
    // #endregion

    const message =
      (parsed.message || (parsed.ok ? 'Scrape cache cleared' : 'Clear failed')) +
      (parsed.ok
        ? ` — sent reset; rejected (${rejectedKept}) + blacklist (${blacklistKept}) kept`
        : ' — sent/rejected/blacklist unchanged') +
      ` [profile ${slug}]`
    // #region agent log
    dbgLog('C', 'outreach.ts:clearScrapeCache:result', 'clear scrape result', {
      ok: Boolean(parsed.ok),
      profile: slug,
      details: parsed.details || {},
    })
    // #endregion
    appendLog(parsed.ok ? 'info' : 'error', 'find', message)
    return {
      ok: Boolean(parsed.ok),
      message,
      details: {
        ...(parsed.details || {}),
        profile: slug,
        dbPath,
        sentCleared: parsed.ok ? sentBefore : 0,
        rejectedKept,
        blacklistKept,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    appendLog('error', 'find', `Scrape cache clear failed: ${message.slice(0, 200)}`)
    return { ok: false, message: `Scrape cache clear failed: ${message.slice(0, 200)}` }
  }
}

function unlinkSqliteFamily(dbPath: string) {
  for (const p of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`, `${dbPath}-journal`]) {
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p)
    } catch {
      /* ignore */
    }
  }
}

function wipeProfileStoreDir(dir: string): { id: string; ok: boolean } {
  const id = path.basename(dir)
  try {
    fs.mkdirSync(dir, { recursive: true })
    unlinkSqliteFamily(path.join(dir, 'leads.db'))
    writeJsonFile(path.join(dir, 'sent.json'), { emails: [] })
    writeJsonFile(path.join(dir, 'rejected.json'), { emails: [] })
    writeJsonFile(path.join(dir, 'quota.json'), { date: todayKey(), sent: 0 })
    return { id, ok: true }
  } catch {
    return { id, ok: false }
  }
}

function listProfileStoreDirs(): string[] {
  ensureDirs()
  migrateLegacyGlobalHistoryOnce()
  if (!fs.existsSync(PROFILES_DATA_DIR())) return []
  return fs
    .readdirSync(PROFILES_DATA_DIR(), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(PROFILES_DATA_DIR(), d.name))
}

/**
 * Wipe per-account scrape/send databases.
 * scope=active → loaded profile only; scope=all → every profile store folder.
 * Does not delete send-profile definitions, vault keys, settings, notes,
 * or the global permanent-blacklist.json.
 */
export function clearProfileDatabases(scope: 'active' | 'all' = 'active'): {
  ok: boolean
  message: string
  cleared?: string[]
} {
  pullOutreachRuntime()
  rt.sendAbort = true
  rt.findEpoch++
  if (rt.findChild && !rt.findChild.killed) {
    try {
      rt.findChild.kill()
    } catch {
      /* ignore */
    }
  }
  const deadline = Date.now() + 2500
  while (rt.findChild && Date.now() < deadline) {
    sleepSync(100)
  }
  rt.findChild = null
  killLeftoverHeadlessFinders()
  sleepSync(100)

  const targets =
    scope === 'all' ? listProfileStoreDirs() : [profileDataDir(getOutreachSettings())]

  const cleared: string[] = []
  const failed: string[] = []
  for (const dir of targets) {
    const result = wipeProfileStoreDir(dir)
    if (result.ok) cleared.push(result.id)
    else failed.push(result.id)
  }

  const message =
    (scope === 'all'
      ? `Cleared ${cleared.length} account database(s)${failed.length ? ` (${failed.length} failed)` : ''}`
      : `Cleared account database “${cleared[0] || activeProfileSlug()}”`) +
    ` · permanent blacklist kept (${readPermanentBlacklist().size})`

  appendLog(failed.length ? 'error' : 'info', 'idle', message)
  return {
    ok: failed.length === 0,
    message,
    cleared,
  }
}

// Do NOT kill headless on module load / Vite HMR. findChild is reset to null on
// re-import, so a kill-all here murdered live finds mid-boot and triggered the
// start→kill→error→refill loop. Orphans are cleared only on explicit start/stop.


registerOutreachDelegates({
  startOutreachRun,
  startOutreachSend,
  loadOutreachSendProfile,
})

initOutreachSession(killLeftoverHeadlessFinders)

type OutreachWatchdogGlobal = typeof globalThis & {
  __ccOutreachWatchdog?: ReturnType<typeof setInterval>
  __ccOutreachAutoResumeQueued?: boolean
  __ccOutreachActivity?: Record<string, number>
}

export function getOutreachCandidateAudit(limit = 2000) {
  pullOutreachRuntime()
  const script = path.join(LEAD_FINDER, 'candidate_audit.py')
  if (!fs.existsSync(script)) return { ok: false, message: 'candidate_audit.py missing', candidates: [] }
  try {
    const out = execFileSync(
      resolvePython(LEAD_FINDER),
      [
        script,
        '--db-path', profileLeadsDbPath(),
        '--since', rt.currentRun.createdAt || '1970-01-01T00:00:00Z',
        '--limit', String(Math.max(1, Math.min(limit, 5000))),
      ],
      { cwd: LEAD_FINDER, windowsHide: true, timeout: 10_000, encoding: 'utf8', env: leadFinderSpawnEnv() },
    )
    return JSON.parse(String(out).trim()) as { ok: boolean; candidates: unknown[] }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Candidate audit failed', candidates: [] }
  }
}

/** Clear the active profile and shared scrape cache, then begin a new find. */
export async function freshStartOutreach() {
  abortOutreach()
  const cache = clearScrapeCache()
  if (!cache.ok) return { ok: false, message: `Fresh search stopped; cache clear failed: ${cache.message}`, run: rt.currentRun }
  const db = clearProfileDatabases('active')
  if (!db.ok) return { ok: false, message: `Cache cleared; profile reset failed: ${db.message}`, run: rt.currentRun }
  clearOutreachRun()
  const started = await startOutreachRun()
  return { ...started, message: started.ok ? `Fresh search started · ${cache.message} · ${db.message}` : started.message }
}

const watchdogGlobal = globalThis as OutreachWatchdogGlobal

export async function restartOutreachFinder() {
  pullOutreachRuntime()
  if (!rt.currentRun.id || rt.currentRun.stage !== 'find' || rt.currentRun.liveSendActive) {
    return { ok: false, message: 'Only an existing discovery run can be restarted', run: rt.currentRun }
  }
  forceAbortFindsInstant('apply discovery updates')
  touchRun({ status: 'paused', resumeAttempts: 0, error: undefined, message: 'Loading discovery updates from checkpoint' })
  return resumeInterruptedOutreach()
}

async function inspectOutreachWatchdog() {
  pullOutreachRuntime()
  const run = rt.currentRun
  if (!run.id || run.stage !== 'find') return
  const live = childProcessRunning(liveFindChild()) || countHeadlessFindRuns() > 0
  if (run.status === 'paused' && !live) {
    await resumeInterruptedOutreach()
    return
  }
  if (run.status !== 'running') return
  const heartbeat = Math.max(
    Date.parse(run.health?.workerHeartbeat || run.updatedAt || '') || 0,
    watchdogGlobal.__ccOutreachActivity?.[run.id] || 0,
  )
  const workerMissing = !live
  const heartbeatStale = Number.isFinite(heartbeat) && Date.now() - heartbeat >= 3 * 60_000
  if (!workerMissing && !heartbeatStale) return
  const recoveries = (run.health?.recoveries || 0) + 1
  const reason = workerMissing ? 'worker process exited' : 'no progress for 3 minutes'
  appendLog('error', 'find', `Watchdog: ${reason} — recovery ${recoveries}/3`)
  forceAbortFindsInstant(`watchdog ${reason}`)
  touchRun({
    status: 'paused',
    message: 'Worker stalled — resuming from checkpoint',
    health: {
      ...(run.health || {
        target: configuredFindLeadTarget(getOutreachSettings()),
        qualifiedPeople: run.found.length,
        candidatesFound: 0,
        duplicatesRemoved: 0,
        rejectedOrganizations: 0,
        invalidContacts: 0,
        rejectedNotPerson: 0,
        discoveryStatus: 'RECOVERING',
        stage: 'DISCOVERY',
        workersHealthy: 0,
        workersTotal: 1,
        queueSize: 0,
        processedSources: 0,
        errorCount: 0,
        recoveries: 0,
        currentSources: [],
      }),
      discoveryStatus: 'RECOVERING',
      workersHealthy: 0,
      recoveries,
      workerHeartbeat: new Date().toISOString(),
    },
  })
  await resumeInterruptedOutreach()
}

if (!process.env.VITEST) {
  if (watchdogGlobal.__ccOutreachWatchdog) clearInterval(watchdogGlobal.__ccOutreachWatchdog)
  watchdogGlobal.__ccOutreachWatchdog = setInterval(() => {
    void inspectOutreachWatchdog()
  }, 30_000)
  watchdogGlobal.__ccOutreachWatchdog.unref?.()
}

if (!process.env.VITEST && !watchdogGlobal.__ccOutreachAutoResumeQueued) {
  watchdogGlobal.__ccOutreachAutoResumeQueued = true
  const timer = setTimeout(() => {
    void inspectOutreachWatchdog()
  }, 1_500)
  timer.unref?.()
}
