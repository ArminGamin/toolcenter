import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { appendLog } from './log.js'
import { parseEmailList } from './email-parse.js'
import { readEmailSet } from './json-store.js'
import { readPermanentBlacklist } from './blacklist.js'
import { defaultSettings } from './settings.js'
import { OUTREACH_DIR, LEAD_FINDER } from './paths.js'
import type { OutreachSettings } from './types.js'
import { writeJsonFile } from './json-store.js'
import { rt, gOutreach, recoverStaleFindSpawnLock, releaseFindSpawnLock, syncOutreachRuntime, noteLiveLead, noteVerifiedLiveLead, noteQualifiedLiveLead, noteCampaignHealth, reviveFindIfLive, filterPersonalRejectEmails, persistRun, touchRun, liveFindEpoch, liveFindChild } from './runtime.js'
import {
  resolvePython,
  leadFinderSpawnEnv,
  countHeadlessFindRuns,
  killLeftoverHeadlessFinders,
  sleepSync,
} from './find-process.js'
import { activeProfileSlug, profileLeadsDbPath, sentFile, rejectedFile } from './quota.js'
import {
  effectiveFindLeadTarget,
  effectiveSendsNeeded,
  findCapString,
  scaleFindCapsForTarget,
  scaledFindMaxRounds,
} from './find-scaling.js'

export function listLeadFinderExportFiles(limit = 12): {
  name: string
  path: string
  mtimeMs: number
  emailCount: number
}[] {
  const outDir = path.join(LEAD_FINDER, 'output')
  if (!fs.existsSync(outDir)) return []
  const files = fs
    .readdirSync(outDir)
    .filter((f) => /^emails.*\.txt$/i.test(f) || /^autopilot-.*\.txt$/i.test(f))
    .map((f) => {
      const full = path.join(outDir, f)
      const mtimeMs = fs.statSync(full).mtimeMs
      let emailCount = 0
      try {
        emailCount = parseEmailList(fs.readFileSync(full, 'utf8')).emails.length
      } catch {
        /* ignore */
      }
      return { name: f, path: full, mtimeMs, emailCount }
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
  return files.slice(0, limit)
}

export function importLeadEmailsFromFile(filePath?: string): {
  emails: string[]
  path?: string
  message: string
} {
  if (filePath) {
    const full = path.isAbsolute(filePath) ? filePath : path.join(LEAD_FINDER, filePath)
    if (!fs.existsSync(full)) {
      return { emails: [], message: 'Export file not found' }
    }
    const text = fs.readFileSync(full, 'utf8')
    const { emails } = parseEmailList(text)
    return {
      emails,
      path: full,
      message: emails.length
        ? `Imported ${emails.length} from ${path.basename(full)}`
        : `No emails in ${path.basename(full)}`,
    }
  }
  return importLatestLeadEmails()
}

export function importLatestLeadEmails(): { emails: string[]; path?: string; message: string } {
  const outDir = path.join(LEAD_FINDER, 'output')
  if (!fs.existsSync(outDir)) {
    return { emails: [], message: 'Lead Finder output folder missing' }
  }
  const files = fs
    .readdirSync(outDir)
    .filter((f) => /^emails.*\.txt$/i.test(f) || /^autopilot-.*\.txt$/i.test(f))
    .map((f) => ({ f, m: fs.statSync(path.join(outDir, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m)
  if (!files.length) {
    // Fallback: pull from SQLite via a tiny one-liner if DB exists
    const dbPath = path.join(LEAD_FINDER, 'data', 'leads.db')
    if (fs.existsSync(dbPath)) {
      return { emails: [], message: 'No email export files — run Find or export from Lead Finder' }
    }
    return { emails: [], message: 'No Lead Finder email exports found' }
  }
  const full = path.join(outDir, files[0].f)
  const text = fs.readFileSync(full, 'utf8')
  const { emails } = parseEmailList(text)
  return { emails, path: full, message: `Imported ${emails.length} from ${files[0].f}` }
}

export function exportEmailsToLeadFinder(emails: string[]): {
  ok: boolean
  path?: string
  message: string
  count: number
} {
  const cleaned = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))]
  if (!cleaned.length) {
    return { ok: false, message: 'No emails to export', count: 0 }
  }
  const outDir = path.join(LEAD_FINDER, 'output')
  fs.mkdirSync(outDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const file = path.join(outDir, `emails-export-${stamp}.txt`)
  fs.writeFileSync(file, `${cleaned.join('\n')}\n`, 'utf8')
  return {
    ok: true,
    path: file,
    message: `Exported ${cleaned.length} to ${path.basename(file)}`,
    count: cleaned.length,
  }
}


export function summarizeFindError(raw: string): string {
  const text = String(raw || '').trim()
  if (!text) return 'Lead Finder failed'
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  let sawError = false
  let sawBootLog = false
  for (const line of lines) {
    if (!line.startsWith('{')) continue
    try {
      const evt = JSON.parse(line) as { type?: string; message?: string }
      if (evt.type === 'error' && evt.message) sawError = true
      if (evt.type === 'log' && evt.message && /Booting|Modules loaded|Caps\s*\|/i.test(evt.message)) {
        sawBootLog = true
      }
    } catch {
      /* ignore */
    }
  }
  // Prefer last JSON error event from headless stdout dump
  for (const line of [...lines].reverse()) {
    if (!line.startsWith('{')) continue
    try {
      const evt = JSON.parse(line) as { type?: string; message?: string }
      if (evt.type === 'error' && evt.message) return String(evt.message).slice(0, 240)
    } catch {
      /* ignore */
    }
  }
  // Boot/log JSON dumps after a kill are not real errors — avoid refill loops
  if (sawBootLog && !sawError) {
    return 'Lead Finder aborted during startup'
  }
  if (
    /"type"\s*:\s*"log"/.test(text) &&
    /Booting|Modules loaded|Caps\s*\|/i.test(text) &&
    !/"type"\s*:\s*"error"/.test(text)
  ) {
    return 'Lead Finder aborted during startup'
  }
  // Collapse noisy dumps
  const oneLine = text.replace(/\s+/g, ' ')
  return oneLine.slice(0, 240)
}

/** Errors that must NOT trigger chain refill (kill/race/abort noise). */
export function isBenignFindAbort(message: string): boolean {
  const m = String(message || '')
  return (
    /^aborted$/i.test(m.trim()) ||
    /aborted during startup/i.test(m) ||
    /leftover process/i.test(m) ||
    /cannot spawn/i.test(m) ||
    /spawn already in progress/i.test(m)
  )
}

/** @deprecated import from find-scaling.js */
export { findCapString } from './find-scaling.js'

export async function runHeadlessFind(
  settings: OutreachSettings,
  runId: string,
  epoch: number,
  opts?: { resume?: boolean },
): Promise<string[]> {
  const script = path.join(LEAD_FINDER, 'headless_run.py')
  if (!fs.existsSync(script)) {
    throw new Error('headless_run.py missing in ai-lead-finder')
  }
  if (rt.findSpawnLock) {
    if (recoverStaleFindSpawnLock()) {
      appendLog('info', 'find', 'Recovered stale Lead Finder start lock')
    } else {
      throw new Error('Lead Finder spawn already in progress')
    }
  }
  rt.findSpawnLock = true
  try {
  // Always wipe stray headless_run trees before spawn — orphans cause send-while-find.
  if (rt.findChild && !rt.findChild.killed) {
    try {
      rt.findChild.kill()
    } catch {
      /* ignore */
    }
    const deadline = Date.now() + 2000
    while (rt.findChild && Date.now() < deadline) sleepSync(100)
    rt.findChild = null
  } else {
    rt.findChild = null
  }
  killLeftoverHeadlessFinders()
  sleepSync(200)
  let afterOrphans = countHeadlessFindRuns()
  if (afterOrphans > 0) {
    appendLog('error', 'find', `Still ${afterOrphans} Lead Finder process(es) after cleanup — forcing again`)
    killLeftoverHeadlessFinders()
    sleepSync(400)
    afterOrphans = countHeadlessFindRuns()
  }
  if (afterOrphans > 0) {
    rt.findSpawnLock = false
    throw new Error(`Cannot spawn Lead Finder — ${afterOrphans} leftover process(es) still alive`)
  }
  const cfgPath = path.join(OUTREACH_DIR(), `find-config-${runId}.json`)
  const leadTarget = effectiveFindLeadTarget(settings)
  const sendsNeeded = effectiveSendsNeeded(settings)
  const caps = scaleFindCapsForTarget(leadTarget, settings)
  const baseFind = defaultSettings().find
  const fastMode = settings.find.fastMode !== false
  const maxPages = caps.maxPages
  const maxUrls = caps.maxUrls
  // 0 is the Lead Finder's documented uncapped value. Fast mode changes
  // worker/pacing settings, not how much of a large lead run may discover.
  const maxQueries = caps.maxQueries
  const minScore = findCapString(settings.find.minScore, baseFind.minScore)
  // Don't count already-sent / rejected / bounce-blacklist toward lead_target
  const excludeEmails = [
    ...readEmailSet(sentFile(settings)),
    ...readEmailSet(rejectedFile(settings)),
    ...readPermanentBlacklist(),
  ]
  const maxRounds = scaledFindMaxRounds(leadTarget, settings)
  const cfg = {
    niche: settings.find.niche,
    model: settings.find.model,
    lt: settings.find.lt,
    follow: settings.find.follow,
    // Outreach always targets named personal-provider mailboxes; keep the
    // serialized config aligned with the headless worker's policy.
    consumer: true,
    regular: settings.find.regular,
    verify: false,
    smtp: false,
    new_only: true,
    auto_campaign: settings.find.autoCampaign,
    // Same as GUI: when on, headless applies AI-recommended pages/score
    apply_ai_settings: Boolean(settings.find.applyAiSettings),
    max_pages: maxPages,
    max_urls: maxUrls,
    max_queries: maxQueries,
    lead_target: String(leadTarget),
    max_rounds: String(maxRounds),
    min_score: minScore,
    fast: fastMode,
    // Keep exhausted-domain memory across runs (do not wipe on every Start)
    clear_exhausted: false,
    mode: settings.find.runMode || 'full',
    seed_urls: (settings.find.seedUrls || '')
      .split(/\r?\n/)
      .map((u) => u.trim())
      .filter(Boolean),
    // Per send-profile leads DB — Account A can scrape emails Account B already used
    db_path: profileLeadsDbPath(settings),
    profile: activeProfileSlug(settings),
    exclude_emails: excludeEmails,
    checkpoint_path: path.join(OUTREACH_DIR(), `find-checkpoint-${runId}.json`),
    resume: Boolean(opts?.resume),
  }
  writeJsonFile(cfgPath, cfg)
  const py = resolvePython(LEAD_FINDER)
  const scaleNote =
    caps.mode === 'down'
      ? ' (scaled down for small batch)'
      : caps.mode === 'up'
        ? ' (scaled up for large batch)'
        : ''
  appendLog(
    'info',
    'find',
    `Starting Lead Finder · profile=${activeProfileSlug(settings)} · mode=${fastMode ? 'fast' : 'original'} · pages=${maxPages} urls=${maxUrls} queries=${maxQueries} · find=${leadTarget} send-need=${sendsNeeded} score=${minScore} rounds=${maxRounds}${scaleNote} · exclude=${excludeEmails.length}`,
  )

  return new Promise((resolve, reject) => {
    if (epoch !== rt.findEpoch) {
      releaseFindSpawnLock()
      reject(new Error('Aborted'))
      return
    }
    const child = spawn(py, [script, '--config', cfgPath], {
      cwd: LEAD_FINDER,
      windowsHide: true,
      env: leadFinderSpawnEnv(),
    })
    rt.findChild = child
    syncOutreachRuntime()
    let stdoutTail = ''
    let stdoutBuf = ''
    let stderr = ''
    let outputPath = ''
    const MAX_TAIL = 48_000

    const handleFindLine = (line: string) => {
      const sharedRunMatches = gOutreach.__ccOutreachRt?.currentRun.id === runId
      if (epoch !== liveFindEpoch() && !sharedRunMatches) return
      const sharedChild = liveFindChild()
      if (sharedChild && sharedChild !== child) return
      const t = line.trim()
      if (!t) return
      const activity = globalThis as typeof globalThis & { __ccOutreachActivity?: Record<string, number> }
      activity.__ccOutreachActivity ??= {}
      activity.__ccOutreachActivity[runId] = Date.now()

      const applyEvt = (evt: {
        type?: string
        message?: string
        path?: string
        count?: number
        email?: string
        health?: Record<string, unknown>
        [key: string]: unknown
      }) => {
        if (evt.type === 'log' && evt.message) {
          reviveFindIfLive()
          appendLog('info', 'find', evt.message)
        }
        if (evt.type === 'lead' && evt.email) noteLiveLead(evt.email)
        if (evt.type === 'qualified_lead' && evt.email) noteQualifiedLiveLead(evt)
        if (evt.type === 'verified_lead' && evt.email) noteVerifiedLiveLead(evt.email)
        if (evt.type === 'health' && evt.health && typeof evt.health === 'object') {
          noteCampaignHealth(evt.health)
        }
        if (evt.type === 'output' && evt.path) {
          outputPath = evt.path
          appendLog('info', 'find', `output ready (${evt.count ?? '?'} emails)`)
        }
        if (evt.type === 'error' && evt.message) appendLog('error', 'find', evt.message)
      }

      // One JSON object
      try {
        applyEvt(JSON.parse(t))
        return
      } catch {
        /* try multi-object / ignore */
      }

      // Two+ JSON objects jammed on one line (Windows pipe quirk)
      if (t.startsWith('{')) {
        const chunks = t.split(/\}\s*\{/).map((part, i, arr) => {
          if (arr.length === 1) return part
          if (i === 0) return part + '}'
          if (i === arr.length - 1) return '{' + part
          return '{' + part + '}'
        })
        let any = false
        for (const chunk of chunks) {
          try {
            applyEvt(JSON.parse(chunk))
            any = true
          } catch {
            /* ignore */
          }
        }
        if (any) return
        return // never dump raw JSON
      }

      if (t.length < 200) appendLog('info', 'find', t)
    }

    child.stdout?.on('data', (buf: Buffer) => {
      const text = buf.toString('utf8')
      stdoutTail = (stdoutTail + text).slice(-MAX_TAIL)
      stdoutBuf += text
      const parts = stdoutBuf.split(/\r?\n/)
      stdoutBuf = parts.pop() ?? ''
      for (const line of parts) handleFindLine(line)
    })
    child.stderr?.on('data', (buf: Buffer) => {
      stderr += buf.toString('utf8')
      if (stderr.length > MAX_TAIL) stderr = stderr.slice(-MAX_TAIL)
    })
    child.on('error', (err) => {
      releaseFindSpawnLock(child)
      if (liveFindChild() === child) {
        rt.findChild = null
        syncOutreachRuntime()
      }
      reject(err)
    })
    child.on('close', (code) => {
      releaseFindSpawnLock(child)
      // Do not re-parse leftover buffer as a log line — causes duplicate/raw JSON spam
      stdoutBuf = ''
      if (liveFindChild() === child) {
        rt.findChild = null
        syncOutreachRuntime()
      }
      if (rt.leadPersistTimer) {
        clearTimeout(rt.leadPersistTimer)
        rt.leadPersistTimer = null
        if (epoch === liveFindEpoch()) persistRun(gOutreach.__ccOutreachRt?.currentRun ?? rt.currentRun)
      }
      // Aborted / superseded — never finishWithEmails on a dead run
      const sharedRunMatches = gOutreach.__ccOutreachRt?.currentRun.id === runId
      if (epoch !== liveFindEpoch() && !sharedRunMatches) {
        reject(new Error('Aborted'))
        return
      }
      if (code !== 0 && !outputPath) {
        reject(new Error(summarizeFindError(stderr.trim() || stdoutTail.trim() || `Lead Finder exited ${code}`)))
        return
      }
      if (!outputPath) {
        for (const line of stdoutTail.split(/\r?\n/).reverse()) {
          try {
            const evt = JSON.parse(line) as { type?: string; path?: string }
            if (evt.type === 'output' && evt.path) {
              outputPath = evt.path
              break
            }
          } catch {
            /* ignore */
          }
        }
      }
      if (!outputPath || !fs.existsSync(outputPath)) {
        reject(new Error('Headless find finished but no output file was produced'))
        return
      }
      touchRun({ findOutputPath: outputPath })
      const { emails } = parseEmailList(fs.readFileSync(outputPath, 'utf8'))
      resolve(filterPersonalRejectEmails(emails))
    })
  })
  } catch (err) {
    releaseFindSpawnLock()
    throw err
  }
}
