import fs from 'node:fs'
import path from 'node:path'
import {
  DEFAULT_BUSINESS_PROFILE_ID,
  currentBusinessProfile,
  profileDataPath,
} from './business-profiles.js'
import { facebookAccountDataDir } from './facebook-account-store.js'

export type BrowserSessionKind = 'facebook' | 'reddit'

export function browserSessionDir(kind: BrowserSessionKind): string {
  if (kind === 'facebook') return facebookAccountDataDir('browser-sessions', kind)
  return profileDataPath('browser-sessions', kind)
}

export function ensureBrowserSessionDir(
  kind: BrowserSessionKind,
  legacyDir?: string,
): string {
  const target = browserSessionDir(kind)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  if (
    legacyDir &&
    currentBusinessProfile().id === DEFAULT_BUSINESS_PROFILE_ID &&
    fs.existsSync(legacyDir) &&
    (!fs.existsSync(target) || fs.readdirSync(target).length === 0)
  ) {
    fs.cpSync(legacyDir, target, { recursive: true, errorOnExist: false })
  }
  fs.mkdirSync(target, { recursive: true })
  return target
}

export function clearBrowserSessionDir(kind: BrowserSessionKind): void {
  fs.rmSync(browserSessionDir(kind), { recursive: true, force: true })
}
