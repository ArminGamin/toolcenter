import fs from 'node:fs'
import path from 'node:path'
import {
  PROFILES_DATA_DIR,
  LEGACY_SENT_FILE,
  LEGACY_REJECTED_FILE,
  LEGACY_QUOTA_FILE,
  LEAD_FINDER,
  ensureDirs,
} from './paths.js'
import type { OutreachSettings } from './types.js'
import { currentBusinessProfile, DEFAULT_BUSINESS_PROFILE_ID } from '../business-profiles.js'

function profileKeyId(name: string) {
  return name.trim().toLocaleLowerCase()
}

export function profileSlugFromSettings(settings: OutreachSettings): string {
  const name = settings.send.activeProfile?.trim() || ''
  if (!name) return '_default'
  const slug = profileKeyId(name)
    .replace(/[^a-z0-9._-]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
  return slug || '_default'
}

export function migrateLegacyGlobalHistoryOnce() {
  const marker = path.join(PROFILES_DATA_DIR(), '.migrated-global-v1')
  if (fs.existsSync(marker)) return
  ensureDirs()
  const dest = path.join(PROFILES_DATA_DIR(), '_default')
  fs.mkdirSync(dest, { recursive: true })
  const copies: [string, string][] = [
    [LEGACY_SENT_FILE(), 'sent.json'],
    [LEGACY_REJECTED_FILE(), 'rejected.json'],
    [LEGACY_QUOTA_FILE(), 'quota.json'],
  ]
  for (const [src, name] of copies) {
    const target = path.join(dest, name)
    if (fs.existsSync(src) && !fs.existsSync(target)) {
      try {
        fs.copyFileSync(src, target)
      } catch {
        /* ignore */
      }
    }
  }
  const legacyDb = path.join(LEAD_FINDER, 'data', 'leads.db')
  const destDb = path.join(dest, 'leads.db')
  if (currentBusinessProfile().id === DEFAULT_BUSINESS_PROFILE_ID && fs.existsSync(legacyDb) && !fs.existsSync(destDb)) {
    try {
      fs.copyFileSync(legacyDb, destDb)
      for (const ext of ['-wal', '-shm'] as const) {
        const srcSide = `${legacyDb}${ext}`
        const dstSide = `${destDb}${ext}`
        if (fs.existsSync(srcSide) && !fs.existsSync(dstSide)) {
          fs.copyFileSync(srcSide, dstSide)
        }
      }
    } catch {
      /* ignore */
    }
  }
  try {
    fs.writeFileSync(marker, new Date().toISOString(), 'utf8')
  } catch {
    /* ignore */
  }
}

export function profileDataDirForSlug(slug: string): string {
  migrateLegacyGlobalHistoryOnce()
  const dir = path.join(PROFILES_DATA_DIR(), slug)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function profileDataDir(settings: OutreachSettings): string {
  return profileDataDirForSlug(profileSlugFromSettings(settings))
}

export function sentFilePath(settings: OutreachSettings) {
  return path.join(profileDataDir(settings), 'sent.json')
}

export function rejectedFilePath(settings: OutreachSettings) {
  return path.join(profileDataDir(settings), 'rejected.json')
}

export function quotaFilePath(settings: OutreachSettings) {
  return path.join(profileDataDir(settings), 'quota.json')
}
