import fs from 'node:fs'
import path from 'node:path'
import { TOOLSAI_ROOT } from '../cc-services.js'
import { profileDataPath } from '../business-profiles.js'

export const OUTREACH_DIR = () => profileDataPath('outreach')
export const SETTINGS_FILE = () => path.join(OUTREACH_DIR(), 'settings.json')
/** Legacy (pre-profile) shared history — migrated once into profiles/_default/ */
export const LEGACY_QUOTA_FILE = () => path.join(OUTREACH_DIR(), 'quota.json')
export const LEGACY_SENT_FILE = () => path.join(OUTREACH_DIR(), 'sent.json')
export const LEGACY_REJECTED_FILE = () => path.join(OUTREACH_DIR(), 'rejected.json')
export const CURRENT_FILE = () => path.join(OUTREACH_DIR(), 'current.json')
export const LOG_FILE = () => path.join(OUTREACH_DIR(), 'log.jsonl')
export const SEND_OUTCOMES_FILE = () => path.join(OUTREACH_DIR(), 'send-outcomes.jsonl')
export const RUNS_DIR = () => path.join(OUTREACH_DIR(), 'runs')
export const PROFILES_DATA_DIR = () => path.join(OUTREACH_DIR(), 'profiles')
export const SEND_PROFILES_FILE = () => path.join(OUTREACH_DIR(), 'send-profiles.json')
/**
 * Global hard bounce / complaint blacklist — NEVER wiped by clear DB, reset sent/rejected,
 * scrape cache, or profile delete. Only remove by deleting this file on disk.
 */
export const PERMANENT_BLACKLIST_FILE = () => path.join(OUTREACH_DIR(), 'permanent-blacklist.json')
/** Encrypted JSON stored in the shared vault; never put Resend keys in outreach files. */
export const OUTREACH_SECRETS_KEY = 'OUTREACH_SECRETS'

export const LEAD_FINDER = path.join(TOOLSAI_ROOT, 'ai-lead-finder')
export const NEWSLETTER = path.join(TOOLSAI_ROOT, 'newsletter-sender')
export const MAX_LOG = 800

export function ensureDirs() {
  fs.mkdirSync(OUTREACH_DIR(), { recursive: true })
  fs.mkdirSync(RUNS_DIR(), { recursive: true })
  fs.mkdirSync(PROFILES_DATA_DIR(), { recursive: true })
}
