/** Group Poster settings and caption file handling. (Split out of group-poster.ts.) */

import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
    DEFAULT_BUSINESS_PROFILE_ID
} from '../business-profiles.js'
import { loadVault, saveVault, TOOLSAI_ROOT } from '../cc-services.js'
import {
    facebookAccountDataDir,
    facebookBrandDataDir,
    sharesFacebookAccountWithTavo,
    withFacebookAccount
} from '../facebook-account-store.js'
import {
    currentProfileBrand,
    ensureCampaignImagesDir,
    getProfileBrand
} from '../profile-brand.js'



export const gpDir = () => facebookAccountDataDir('group-poster')


export const brandGpDir = () => facebookBrandDataDir('group-poster')


export const settingsFile = () => path.join(gpDir(), 'settings.json')


export const brandSettingsFile = () => path.join(brandGpDir(), 'settings.json')


export const contentRestoreFile = () => path.join(brandGpDir(), 'shared-content-restore.json')


export const captionsFile = () => path.join(brandGpDir(), 'captions.txt')


export const WORKER_DIR = path.join(TOOLSAI_ROOT, 'facebook-group-poster')


export const SEED_CAPTIONS = path.join(WORKER_DIR, 'captions.txt')


export const DEFAULT_IMAGES_DIR = path.join(WORKER_DIR, 'images')



/** Encrypted vault blob — never put the password in settings.json. */
export const GP_SECRETS_KEY = 'GROUP_POSTER_SECRETS'


export const workerLockFile = () => path.join(gpDir(), 'worker.lock')



/** Operator-requested default account (seeded into vault once if empty). */
export const DEFAULT_LOGIN_EMAIL = 'kaleddovanos@gmail.com'


export const DEFAULT_LOGIN_PASSWORD = 'kajuha999'



export type GroupPosterSettings = {
  includeText: boolean
  includeLink: boolean
  includeImage: boolean
  fixedCaption: string
  rotateCaptions: boolean
  linkUrl: string
  imagePaths: string[]
  /** Folder of images; filenames containing VYRAS / MOTERIS are pooled by gender. */
  imagesDir: string
  rotateImages: boolean
  imageIndexVyras: number
  imageIndexMoteris: number
  minIntervalMin: number
  maxIntervalMin: number
  warmupSec: number
  dailyCap: number
  minTypeDelayMs: number
  maxTypeDelayMs: number
  selectedGroupIds: string[]
  shuffleGroups: boolean
  captionIndex: number
  autoJoinBeforePost: boolean
  /** Shown in UI; password lives in vault only. */
  loginEmail: string
  autoLogin: boolean
  /** When true, only enforce saved blacklist — no new auto-blacklists during refresh/post. */
  preserveExistingBlacklist: boolean
}



export type GroupPosterSecrets = {
  v: 1
  loginPassword: string
}



export type WorkerLock = {
  mode: string
  pid: number
  dataDir: string
  startedAt: string
}



export function sleepMs(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}



export function writeJsonRobust(file: string, data: unknown) {
  const dir = path.dirname(file)
  fs.mkdirSync(dir, { recursive: true })
  const body = JSON.stringify(data, null, 2)
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`
  try {
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        fs.writeFileSync(tmp, body, 'utf8')
        fs.renameSync(tmp, file)
        return
      } catch (err) {
        const code = (err as NodeJS.ErrnoException)?.code
        const retryable = code === 'EBUSY' || code === 'EPERM' || code === 'EACCES'
        if (attempt < 7 && retryable) {
          sleepMs(35 * (attempt + 1))
          continue
        }
        throw err
      }
    }
  } finally {
    try {
      fs.unlinkSync(tmp)
    } catch {
      // A successful rename has already consumed the temporary file.
    }
  }
}



export function isProcessAlive(pid: number): boolean {
  if (!pid || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}



export function getWorkerLock(): WorkerLock | null {
  try {
    if (!fs.existsSync(workerLockFile())) return null
    const raw = JSON.parse(fs.readFileSync(workerLockFile(), 'utf8')) as Partial<WorkerLock>
    if (!raw || typeof raw.mode !== 'string' || typeof raw.pid !== 'number') {
      return null
    }
    if (!isProcessAlive(raw.pid)) {
      try {
        fs.unlinkSync(workerLockFile())
      } catch {
        /* ignore */
      }
      return null
    }
    return {
      mode: raw.mode,
      pid: raw.pid,
      dataDir: typeof raw.dataDir === 'string' ? raw.dataDir : '',
      startedAt: typeof raw.startedAt === 'string' ? raw.startedAt : '',
    }
  } catch {
    return null
  }
}



export function ensureDir() {
  fs.mkdirSync(gpDir(), { recursive: true })
  fs.mkdirSync(brandGpDir(), { recursive: true })
  fs.mkdirSync(DEFAULT_IMAGES_DIR, { recursive: true })
  if (!fs.existsSync(captionsFile())) {
    try {
      if (!sharesFacebookAccountWithTavo() && fs.existsSync(SEED_CAPTIONS)) {
        fs.copyFileSync(SEED_CAPTIONS, captionsFile())
      } else {
        fs.writeFileSync(captionsFile(), '', 'utf8')
      }
    } catch {
      fs.writeFileSync(captionsFile(), '', 'utf8')
    }
  }
  seedLoginPresetIfEmpty()
}



export function readGpSecrets(): GroupPosterSecrets {
  return withFacebookAccount(() => {
    const raw = loadVault()[GP_SECRETS_KEY]
    if (!raw) return { v: 1, loginPassword: '' }
    try {
      const parsed = JSON.parse(raw) as Partial<GroupPosterSecrets>
      return {
        v: 1,
        loginPassword: typeof parsed.loginPassword === 'string' ? parsed.loginPassword : '',
      }
    } catch {
      return { v: 1, loginPassword: '' }
    }
  })
}



export function writeGpSecrets(secrets: GroupPosterSecrets) {
  withFacebookAccount(() => {
    saveVault({ [GP_SECRETS_KEY]: JSON.stringify(secrets) })
  })
}



/** One-time seed of the operator preset into vault + settings when empty. */
export function seedLoginPresetIfEmpty() {
  const raw = readJson<Partial<GroupPosterSettings>>(settingsFile(), {})
  const secrets = readGpSecrets()
  const next = normalizeSettings(raw)
  let changedSettings = false
  let changedSecrets = false

  const rawEmail = typeof raw.loginEmail === 'string' ? raw.loginEmail.trim() : ''
  if (!rawEmail) {
    next.loginEmail = DEFAULT_LOGIN_EMAIL
    changedSettings = true
  }
  if (!Object.prototype.hasOwnProperty.call(raw, 'autoLogin')) {
    next.autoLogin = true
    changedSettings = true
  }
  if (!secrets.loginPassword.trim()) {
    secrets.loginPassword = DEFAULT_LOGIN_PASSWORD
    changedSecrets = true
  }
  if (changedSettings) {
    if (sharesFacebookAccountWithTavo()) {
      writeJson(settingsFile(), {
        ...raw,
        loginEmail: next.loginEmail,
        autoLogin: next.autoLogin,
      })
    } else {
      writeJson(settingsFile(), next)
    }
  }
  if (changedSecrets) writeGpSecrets(secrets)
}



export function writeJson(file: string, data: unknown) {
  writeJsonRobust(file, data)
}



export function readJson<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}



export function defaultSettings(): GroupPosterSettings {
  return {
    includeText: true,
    includeLink: false,
    includeImage: false,
    fixedCaption: '',
    rotateCaptions: true,
    linkUrl: '',
    imagePaths: [],
    imagesDir: ensureCampaignImagesDir(),
    rotateImages: true,
    imageIndexVyras: 0,
    imageIndexMoteris: 0,
    minIntervalMin: 8,
    maxIntervalMin: 20,
    warmupSec: 60,
    dailyCap: 20,
    minTypeDelayMs: 80,
    maxTypeDelayMs: 250,
    selectedGroupIds: [],
    shuffleGroups: true,
    captionIndex: 0,
    autoJoinBeforePost: true,
    loginEmail: DEFAULT_LOGIN_EMAIL,
    autoLogin: true,
    preserveExistingBlacklist: true,
  }
}



export function normalizeSettings(raw: Partial<GroupPosterSettings> | null | undefined): GroupPosterSettings {
  const d = defaultSettings()
  const s = raw && typeof raw === 'object' ? raw : {}
  const imagePaths = Array.isArray(s.imagePaths)
    ? s.imagePaths.filter((p): p is string => typeof p === 'string').map((p) => p.trim()).filter(Boolean)
    : d.imagePaths
  const selectedGroupIds = Array.isArray(s.selectedGroupIds)
    ? s.selectedGroupIds.filter((id): id is string => typeof id === 'string').map((id) => id.trim()).filter(Boolean)
    : d.selectedGroupIds
  return {
    includeText: s.includeText !== undefined ? Boolean(s.includeText) : d.includeText,
    includeLink: s.includeLink !== undefined ? Boolean(s.includeLink) : d.includeLink,
    includeImage: s.includeImage !== undefined ? Boolean(s.includeImage) : d.includeImage,
    fixedCaption: typeof s.fixedCaption === 'string' ? s.fixedCaption : d.fixedCaption,
    rotateCaptions: s.rotateCaptions !== undefined ? Boolean(s.rotateCaptions) : d.rotateCaptions,
    linkUrl: typeof s.linkUrl === 'string' ? s.linkUrl.trim() : d.linkUrl,
    imagePaths,
    imagesDir: resolvePosterImagesDir(
      typeof s.imagesDir === 'string' && s.imagesDir.trim() ? s.imagesDir.trim() : '',
    ),
    rotateImages: s.rotateImages !== undefined ? Boolean(s.rotateImages) : d.rotateImages,
    imageIndexVyras: Math.max(0, Number(s.imageIndexVyras) || 0),
    imageIndexMoteris: Math.max(0, Number(s.imageIndexMoteris) || 0),
    minIntervalMin: Math.max(1, Number(s.minIntervalMin) || d.minIntervalMin),
    maxIntervalMin: Math.max(1, Number(s.maxIntervalMin) || d.maxIntervalMin),
    warmupSec: Math.max(0, Number(s.warmupSec) || 0),
    dailyCap: Math.max(0, Number(s.dailyCap) || 0),
    minTypeDelayMs: Math.max(20, Number(s.minTypeDelayMs) || d.minTypeDelayMs),
    maxTypeDelayMs: Math.max(20, Number(s.maxTypeDelayMs) || d.maxTypeDelayMs),
    selectedGroupIds,
    shuffleGroups: s.shuffleGroups !== undefined ? Boolean(s.shuffleGroups) : d.shuffleGroups,
    captionIndex: Math.max(0, Number(s.captionIndex) || 0),
    autoJoinBeforePost:
      s.autoJoinBeforePost !== undefined ? Boolean(s.autoJoinBeforePost) : d.autoJoinBeforePost,
    loginEmail:
      typeof s.loginEmail === 'string' && s.loginEmail.trim()
        ? s.loginEmail.trim()
        : d.loginEmail,
    autoLogin: s.autoLogin !== undefined ? Boolean(s.autoLogin) : d.autoLogin,
    preserveExistingBlacklist:
      s.preserveExistingBlacklist !== undefined
        ? Boolean(s.preserveExistingBlacklist)
        : d.preserveExistingBlacklist,
  }
}



export function pickSharedOps(s: Partial<GroupPosterSettings>): Partial<GroupPosterSettings> {
  const out: Partial<GroupPosterSettings> = {}
  if (s.minIntervalMin !== undefined) out.minIntervalMin = s.minIntervalMin
  if (s.maxIntervalMin !== undefined) out.maxIntervalMin = s.maxIntervalMin
  if (s.warmupSec !== undefined) out.warmupSec = s.warmupSec
  if (s.dailyCap !== undefined) out.dailyCap = s.dailyCap
  if (s.minTypeDelayMs !== undefined) out.minTypeDelayMs = s.minTypeDelayMs
  if (s.maxTypeDelayMs !== undefined) out.maxTypeDelayMs = s.maxTypeDelayMs
  if (s.selectedGroupIds !== undefined) out.selectedGroupIds = s.selectedGroupIds
  if (s.shuffleGroups !== undefined) out.shuffleGroups = s.shuffleGroups
  if (s.autoJoinBeforePost !== undefined) out.autoJoinBeforePost = s.autoJoinBeforePost
  if (s.loginEmail !== undefined) out.loginEmail = s.loginEmail
  if (s.autoLogin !== undefined) out.autoLogin = s.autoLogin
  if (s.preserveExistingBlacklist !== undefined) {
    out.preserveExistingBlacklist = s.preserveExistingBlacklist
  }
  return out
}



export function pickBrandContent(s: Partial<GroupPosterSettings>): Partial<GroupPosterSettings> {
  const out: Partial<GroupPosterSettings> = {}
  if (s.includeText !== undefined) out.includeText = s.includeText
  if (s.includeLink !== undefined) out.includeLink = s.includeLink
  if (s.includeImage !== undefined) out.includeImage = s.includeImage
  if (s.fixedCaption !== undefined) out.fixedCaption = s.fixedCaption
  if (s.rotateCaptions !== undefined) out.rotateCaptions = s.rotateCaptions
  if (s.linkUrl !== undefined) out.linkUrl = s.linkUrl
  if (s.imagePaths !== undefined) out.imagePaths = s.imagePaths
  if (s.imagesDir !== undefined) out.imagesDir = s.imagesDir
  if (s.rotateImages !== undefined) out.rotateImages = s.rotateImages
  if (s.imageIndexVyras !== undefined) out.imageIndexVyras = s.imageIndexVyras
  if (s.imageIndexMoteris !== undefined) out.imageIndexMoteris = s.imageIndexMoteris
  if (s.captionIndex !== undefined) out.captionIndex = s.captionIndex
  return out
}



export function liveIndexOverlay(): Partial<GroupPosterSettings> {
  if (!sharesFacebookAccountWithTavo() || !fs.existsSync(contentRestoreFile())) return {}
  const shared = readJson<Partial<GroupPosterSettings>>(settingsFile(), {})
  return {
    captionIndex: Math.max(0, Number(shared.captionIndex) || 0),
    imageIndexVyras: Math.max(0, Number(shared.imageIndexVyras) || 0),
    imageIndexMoteris: Math.max(0, Number(shared.imageIndexMoteris) || 0),
  }
}



export function endFacebookBrandRun() {
  if (!sharesFacebookAccountWithTavo() || !fs.existsSync(contentRestoreFile())) return
  const snap = readJson<Partial<GroupPosterSettings>>(contentRestoreFile(), {})
  const shared = readJson<Record<string, unknown>>(settingsFile(), {})
  const brand = readJson<Record<string, unknown>>(brandSettingsFile(), {})
  writeJson(brandSettingsFile(), {
    ...brand,
    captionIndex: Number(shared.captionIndex) || 0,
    imageIndexVyras: Number(shared.imageIndexVyras) || 0,
    imageIndexMoteris: Number(shared.imageIndexMoteris) || 0,
  })
  writeJson(settingsFile(), {
    ...shared,
    captionIndex: Number(snap.captionIndex) || 0,
    imageIndexVyras: Number(snap.imageIndexVyras) || 0,
    imageIndexMoteris: Number(snap.imageIndexMoteris) || 0,
  })
  try {
    fs.unlinkSync(contentRestoreFile())
  } catch {
    /* ignore */
  }
}



export function reclaimFacebookBrandContentIfIdle() {
  if (!sharesFacebookAccountWithTavo() || !fs.existsSync(contentRestoreFile())) return
  if (getWorkerLock()) return
  endFacebookBrandRun()
}



export function tavoImagesDir() {
  return getProfileBrand(DEFAULT_BUSINESS_PROFILE_ID).groupsImagesDir
}



export function resolvePosterImagesDir(raw: string): string {
  const brand = currentProfileBrand()
  const trimmed = raw.trim()
  if (brand.productCatalogFile) {
    const tavo = path.normalize(tavoImagesDir()).toLowerCase()
    if (!trimmed || path.normalize(trimmed).toLowerCase() === tavo) {
      return ensureCampaignImagesDir()
    }
  }
  return trimmed || ensureCampaignImagesDir()
}



export function getGroupPosterSettings(): GroupPosterSettings {
  ensureDir()
  reclaimFacebookBrandContentIfIdle()
  const shared = normalizeSettings(readJson(settingsFile(), defaultSettings()))
  if (!sharesFacebookAccountWithTavo()) return shared
  const brandRaw = readJson<Partial<GroupPosterSettings>>(brandSettingsFile(), {})
  const content = {
    ...pickBrandContent(defaultSettings()),
    ...pickBrandContent(brandRaw),
  }
  return normalizeSettings({ ...shared, ...content, ...liveIndexOverlay() })
}



export function saveGroupPosterSettings(
  partial: Partial<GroupPosterSettings> & { loginPassword?: string },
): { ok: boolean; message: string; settings: GroupPosterSettings } {
  const current = getGroupPosterSettings()
  const { loginPassword, ...rest } = partial
  const next = normalizeSettings({ ...current, ...rest })
  if (next.maxIntervalMin < next.minIntervalMin) {
    next.maxIntervalMin = next.minIntervalMin
  }
  if (next.maxTypeDelayMs < next.minTypeDelayMs) {
    next.maxTypeDelayMs = next.minTypeDelayMs
  }
  if (sharesFacebookAccountWithTavo()) {
    const sharedRaw = readJson<Record<string, unknown>>(settingsFile(), {})
    const live = fs.existsSync(contentRestoreFile())
    writeJson(settingsFile(), {
      ...sharedRaw,
      ...pickSharedOps(next),
      ...(live
        ? {
            captionIndex: next.captionIndex,
            imageIndexVyras: next.imageIndexVyras,
            imageIndexMoteris: next.imageIndexMoteris,
          }
        : {}),
    })
    const brandRaw = readJson<Record<string, unknown>>(brandSettingsFile(), {})
    writeJson(brandSettingsFile(), { ...brandRaw, ...pickBrandContent(next) })
  } else {
    writeJson(settingsFile(), next)
  }
  if (typeof loginPassword === 'string') {
    const secrets = readGpSecrets()
    // Empty string means "keep existing"; non-empty replaces. Use explicit clear via spaces-only trimmed empty after intentional clear — require at least 1 char to update.
    if (loginPassword.length > 0) {
      secrets.loginPassword = loginPassword
      writeGpSecrets(secrets)
    }
  }
  return { ok: true, message: 'Settings saved', settings: next }
}



export function getCaptionsText(): string {
  ensureDir()
  try {
    return fs.readFileSync(captionsFile(), 'utf8')
  } catch {
    return ''
  }
}



export function saveCaptionsText(text: string): { ok: boolean; message: string; captions: string; count: number } {
  ensureDir()
  const body = typeof text === 'string' ? text : ''
  fs.writeFileSync(captionsFile(), body, 'utf8')
  const count = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean).length
  return { ok: true, message: `Saved ${count} captions`, captions: body, count }
}



/** Load a local .txt into captions.txt (one caption per line). */
export function loadCaptionsFromPath(filePath: string): {
  ok: boolean
  message: string
  captions?: string
  count?: number
} {
  const trimmed = (filePath || '').trim().replace(/^["']|["']$/g, '')
  if (!trimmed) return { ok: false, message: 'Enter a .txt file path' }
  if (!fs.existsSync(trimmed)) return { ok: false, message: `File not found: ${trimmed}` }
  try {
    if (!fs.statSync(trimmed).isFile()) return { ok: false, message: 'Path is not a file' }
    const text = fs.readFileSync(trimmed, 'utf8')
    const saved = saveCaptionsText(text)
    return {
      ok: true,
      message: `Loaded ${saved.count} captions from ${path.basename(trimmed)}`,
      captions: saved.captions,
      count: saved.count,
    }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}
