import fs from 'node:fs'
import { addToPermanentBlacklist } from './blacklist.js'

/** Minimal CSV line parser (handles quoted fields). */
function parseCsvLine(line: string): string[] {
  const cols: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === ',') {
      cols.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  cols.push(cur)
  return cols
}

function extractEmailsFromResendCsv(text: string): string[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim())
  if (!lines.length) return []
  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase())
  const toIdx = header.indexOf('to')
  const eventIdx = header.indexOf('last_event')
  const out: string[] = []
  const badEvents = new Set(['bounced', 'complained', 'failed', 'suppressed'])

  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line)
    const to = (toIdx >= 0 ? cols[toIdx] : '').trim().toLowerCase()
    const event = (eventIdx >= 0 ? cols[eventIdx] : '').trim().toLowerCase()
    if (!to || !to.includes('@')) continue
    if (event && !badEvents.has(event)) continue
    out.push(to)
  }
  return out
}

/**
 * Import Resend “emails sent” CSV export(s). Uses the `to` column; prefers rows whose
 * last_event is bounced/complained/failed/suppressed, but still takes `to` if present.
 */
export function importPermanentBlacklistFromCsvFiles(filePaths: string[]): {
  ok: boolean
  message: string
  added: number
  total: number
  fromFiles: number
} {
  const collected = new Set<string>()
  let filesOk = 0
  for (const filePath of filePaths) {
    if (!filePath || !fs.existsSync(filePath)) continue
    try {
      const text = fs.readFileSync(filePath, 'utf8')
      for (const email of extractEmailsFromResendCsv(text)) collected.add(email)
      filesOk++
    } catch {
      /* skip unreadable */
    }
  }
  const result = addToPermanentBlacklist([...collected])
  return {
    ...result,
    fromFiles: filesOk,
    message: `${result.message} · from ${filesOk} CSV file(s)`,
  }
}
