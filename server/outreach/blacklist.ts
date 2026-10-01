import { PERMANENT_BLACKLIST_FILE } from './paths.js'
import { readEmailSet, writeJsonFile } from './json-store.js'
import { ensureDirs } from './paths.js'
import { appendLog } from './log.js'

/** Permanent global bounce blacklist (survives every UI clear / DB wipe). */
export function permanentBlacklistPath() {
  return PERMANENT_BLACKLIST_FILE()
}

export function readPermanentBlacklist(): Set<string> {
  return readEmailSet(PERMANENT_BLACKLIST_FILE())
}

export function writePermanentBlacklist(set: Set<string>) {
  ensureDirs()
  writeJsonFile(PERMANENT_BLACKLIST_FILE(), {
    note: 'Permanent bounce/complaint blacklist. Not cleared by Clear DB, Reset sent/rejected, or scrape cache. Delete this file manually to wipe.',
    updatedAt: new Date().toISOString(),
    emails: [...set].sort(),
  })
}

/** Merge emails into the permanent blacklist. Returns how many were newly added. */
export function addToPermanentBlacklist(emails: string[]): {
  ok: boolean
  message: string
  added: number
  total: number
} {
  const set = readPermanentBlacklist()
  const before = set.size
  for (const raw of emails) {
    const email = String(raw || '').trim().toLowerCase()
    if (!email || !email.includes('@')) continue
    set.add(email)
  }
  writePermanentBlacklist(set)
  const added = set.size - before
  appendLog('info', 'clean', `Permanent blacklist +${added} (total ${set.size})`)
  return {
    ok: true,
    message: `Added ${added} to permanent blacklist (${set.size} total)`,
    added,
    total: set.size,
  }
}
