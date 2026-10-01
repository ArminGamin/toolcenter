import fs from 'node:fs'
import { LOG_FILE, MAX_LOG, ensureDirs } from './paths.js'
import type { LogKind, OutreachLogEntry, OutreachStage } from './types.js'
import { readLastNonEmptyLines } from '../log-tail.js'
import { currentBusinessProfile } from '../business-profiles.js'

const logCaches = new Map<string, OutreachLogEntry[]>()
const getCachedLog = () => logCaches.get(currentBusinessProfile().id)
const setCachedLog = (entries: OutreachLogEntry[]) => {
  logCaches.set(currentBusinessProfile().id, entries)
  return entries
}
const MAX_LOG_FILE_BYTES = 5 * 1024 * 1024

function rotateLogIfNeeded() {
  try {
    if (!fs.existsSync(LOG_FILE()) || fs.statSync(LOG_FILE()).size < MAX_LOG_FILE_BYTES) return
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const archived = LOG_FILE().replace(/\.jsonl$/i, `.${stamp}.jsonl`)
    fs.renameSync(LOG_FILE(), archived)
  } catch {
    // Logging must never take down an outreach run.
  }
}

export function loadLog(): OutreachLogEntry[] {
  const cached = getCachedLog()
  if (cached) return cached
  ensureDirs()
  if (!fs.existsSync(LOG_FILE())) {
    return setCachedLog([])
  }
  try {
    const lines = readLastNonEmptyLines(LOG_FILE(), MAX_LOG)
    return setCachedLog(lines.flatMap((line) => {
      try {
        return [JSON.parse(line) as OutreachLogEntry]
      } catch {
        return []
      }
    }))
  } catch {
    return setCachedLog([])
  }
}

export function appendLog(
  kind: OutreachLogEntry['kind'],
  stage: OutreachStage,
  message: string,
): OutreachLogEntry | null {
  let raw = String(message).trim()
  // Never store raw JSON protocol lines in the UI feed
  if (raw.startsWith('{')) {
    const extracted: string[] = []
    const chunks = raw.split(/\}\s*\{/).map((part, i, arr) => {
      if (arr.length === 1) return part
      if (i === 0) return part + '}'
      if (i === arr.length - 1) return '{' + part
      return '{' + part + '}'
    })
    for (const chunk of chunks) {
      try {
        const evt = JSON.parse(chunk) as { type?: string; message?: string }
        if (evt.type === 'log' && evt.message) extracted.push(String(evt.message))
        else if (evt.type === 'error' && evt.message) extracted.push(String(evt.message))
      } catch {
        /* ignore */
      }
    }
    if (!extracted.length) return null
    let last: OutreachLogEntry | null = null
    for (const msg of extracted) {
      last = appendLog(kind, stage, msg)
    }
    return last
  }
  const entry: OutreachLogEntry = {
    at: new Date().toISOString(),
    kind,
    stage,
    message: raw.slice(0, 500),
  }
  const list = loadLog()
  list.push(entry)
  while (list.length > MAX_LOG) list.shift()
  ensureDirs()
  rotateLogIfNeeded()
  fs.appendFileSync(LOG_FILE(), `${JSON.stringify(entry)}\n`, 'utf8')
  return entry
}

export function getOutreachLog(filter: LogKind = 'all', limit = 200): OutreachLogEntry[] {
  const list = loadLog()
  const filtered =
    filter === 'all' ? list : list.filter((e) => e.kind === filter || (filter === 'error' && e.kind === 'error'))
  return filtered.slice(-Math.max(1, Math.min(limit, MAX_LOG)))
}

export function clearOutreachLog(): { ok: boolean; message: string } {
  ensureDirs()
  setCachedLog([])
  try {
    fs.writeFileSync(LOG_FILE(), '', 'utf8')
  } catch {
    /* ignore */
  }
  return { ok: true, message: 'Live feed cleared' }
}
