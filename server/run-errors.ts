/**
 * Compact error-only run archives.
 * Saved only when a tool exits with failure and/or warn/critical console lines.
 * Space bounds: short lines, few lines per pack, capped retention.
 */
import fs from 'node:fs'
import path from 'node:path'
import { type LogEntry } from './cc-services.js'
import { profileDataPath } from './business-profiles.js'

const runErrorsDir = () => profileDataPath('run-errors')
const indexFile = () => path.join(runErrorsDir(), 'index.json')

const MAX_PACKS = 40
const MAX_LINES_PER_PACK = 60
const MAX_LINE_CHARS = 280
const MAX_PACK_BYTES = 24_000
const CONTEXT_BEFORE = 1

export type RunErrorMeta = {
  id: string
  toolId: string
  at: string
  exitCode: number | null
  summary: string
  lineCount: number
  bytes: number
  file: string
}

function ensureDir() {
  fs.mkdirSync(runErrorsDir(), { recursive: true })
}

function readIndex(): RunErrorMeta[] {
  ensureDir()
  try {
    if (!fs.existsSync(indexFile())) return []
    const raw = JSON.parse(fs.readFileSync(indexFile(), 'utf8')) as RunErrorMeta[]
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

function writeIndex(list: RunErrorMeta[]) {
  ensureDir()
  fs.writeFileSync(indexFile(), JSON.stringify(list, null, 0), 'utf8')
}

function prune(list: RunErrorMeta[]): RunErrorMeta[] {
  const sorted = [...list].sort((a, b) => (a.at < b.at ? 1 : -1))
  const keep = sorted.slice(0, MAX_PACKS)
  const drop = sorted.slice(MAX_PACKS)
  for (const d of drop) {
    try {
      fs.unlinkSync(path.join(runErrorsDir(), d.file))
    } catch {
      /* ignore */
    }
  }
  return keep
}

function trimLine(text: string): string {
  const t = String(text || '')
    .replace(/\r/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (t.length <= MAX_LINE_CHARS) return t
  return `${t.slice(0, MAX_LINE_CHARS - 1)}…`
}

/** Keep only warn/critical + tiny context; drop success chatter. */
function compactEntries(entries: LogEntry[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    if (e.level !== 'warn' && e.level !== 'critical') continue
    for (let j = Math.max(0, i - CONTEXT_BEFORE); j <= i; j++) {
      const line = trimLine(entries[j].text)
      if (!line || seen.has(line)) continue
      seen.add(line)
      out.push(line)
      if (out.length >= MAX_LINES_PER_PACK) return out
    }
  }
  return out
}

function stampId(toolId: string): { id: string; file: string } {
  const at = new Date().toISOString().replace(/[:.]/g, '-')
  const safe = toolId.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40)
  const id = `${at}_${safe}`
  return { id, file: `${id}.txt` }
}

function writePack(meta: Omit<RunErrorMeta, 'bytes' | 'lineCount'>, bodyLines: string[]): RunErrorMeta | null {
  if (!bodyLines.length && meta.exitCode == null) return null
  ensureDir()
  const header = [
    `tool=${meta.toolId}`,
    `at=${meta.at}`,
    `exit=${meta.exitCode ?? 'n/a'}`,
    `summary=${trimLine(meta.summary)}`,
    '---',
  ]
  let body = [...header, ...(bodyLines.length ? bodyLines : ['(no console detail — non-zero exit only)'])].join(
    '\n',
  )
  if (Buffer.byteLength(body, 'utf8') > MAX_PACK_BYTES) {
    body = body.slice(0, MAX_PACK_BYTES) + '\n…[truncated]'
  }
  const full = path.join(runErrorsDir(), meta.file)
  fs.writeFileSync(full, body, 'utf8')
  const record: RunErrorMeta = {
    ...meta,
    lineCount: bodyLines.length,
    bytes: Buffer.byteLength(body, 'utf8'),
  }
  const next = prune([record, ...readIndex().filter((x) => x.id !== record.id)])
  writeIndex(next)
  return record
}

/**
 * Archive a finished tool run if it failed or logged warn/critical lines.
 * No-op on clean success.
 */
export function archiveToolRunError(opts: {
  toolId: string
  exitCode: number | null
  entries: LogEntry[]
}): RunErrorMeta | null {
  const failedExit = opts.exitCode != null && opts.exitCode !== 0
  const compact = compactEntries(opts.entries)
  if (!failedExit && compact.length === 0) return null

  const first =
    opts.entries.find((e) => e.level === 'critical') ||
    opts.entries.find((e) => e.level === 'warn') ||
    opts.entries[opts.entries.length - 1]
  const summary = trimLine(
    first?.text || (failedExit ? `Exited with code ${opts.exitCode}` : 'Error'),
  )
  const { id, file } = stampId(opts.toolId)
  return writePack(
    {
      id,
      toolId: opts.toolId,
      at: new Date().toISOString(),
      exitCode: opts.exitCode,
      summary,
      file,
    },
    compact,
  )
}

/** Manual archive (e.g. Outreach find failure) — only if there is real error text. */
export function archiveManualError(opts: {
  toolId: string
  summary: string
  lines?: string[]
}): RunErrorMeta | null {
  const summary = trimLine(opts.summary)
  if (!summary) return null
  const lines = (opts.lines || [])
    .map(trimLine)
    .filter(Boolean)
    .slice(0, MAX_LINES_PER_PACK)
  const body = lines.length ? lines : [summary]
  const { id, file } = stampId(opts.toolId)
  return writePack(
    {
      id,
      toolId: opts.toolId,
      at: new Date().toISOString(),
      exitCode: null,
      summary,
      file,
    },
    body,
  )
}

export function listRunErrors(limit = 40): RunErrorMeta[] {
  return prune(readIndex()).slice(0, Math.max(1, Math.min(limit, MAX_PACKS)))
}

export function getRunError(id: string): { ok: boolean; meta?: RunErrorMeta; body?: string; message?: string } {
  const meta = readIndex().find((x) => x.id === id)
  if (!meta) return { ok: false, message: 'Not found' }
  const full = path.join(runErrorsDir(), meta.file)
  if (!fs.existsSync(full)) return { ok: false, message: 'Log file missing' }
  try {
    return { ok: true, meta, body: fs.readFileSync(full, 'utf8') }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}

export function clearRunErrors(): { ok: boolean; message: string } {
  const list = readIndex()
  for (const item of list) {
    try {
      fs.unlinkSync(path.join(runErrorsDir(), item.file))
    } catch {
      /* ignore */
    }
  }
  writeIndex([])
  return { ok: true, message: `Cleared ${list.length} error log(s)` }
}

export function deleteRunError(id: string): { ok: boolean; message: string } {
  const list = readIndex()
  const hit = list.find((x) => x.id === id)
  if (!hit) return { ok: false, message: 'Not found' }
  try {
    fs.unlinkSync(path.join(runErrorsDir(), hit.file))
  } catch {
    /* ignore */
  }
  writeIndex(list.filter((x) => x.id !== id))
  return { ok: true, message: 'Deleted' }
}
