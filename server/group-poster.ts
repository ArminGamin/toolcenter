/**
 * Facebook Group Poster — Control Center orchestration.
 * Spawns D:\toolsai\facebook-group-poster\worker.py with a shared data dir.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { loadVault, saveVault, TOOLSAI_ROOT } from './cc-services.js'
import {
  bindCurrentProfile,
  currentBusinessProfile,
  DEFAULT_BUSINESS_PROFILE_ID,
} from './business-profiles.js'
import {
  currentProfileBrand,
  ensureCampaignImagesDir,
  getProfileBrand,
  getProfileImages,
} from './profile-brand.js'
import {
  clearBrowserSessionDir,
  ensureBrowserSessionDir,
} from './browser-sessions.js'
import {
  facebookAccountDataDir,
  facebookAccountProfileId,
  facebookBrandDataDir,
  sharesFacebookAccountWithTavo,
  withFacebookAccount,
} from './facebook-account-store.js'
import {
  isFriendDmWorkerRunning,
  killFriendDmWorker,
  prepareFriendDmLoginClear,
  resetFriendDmAfterLoginClear,
} from './group-poster-dms.js'
import { attachWorkerOutput } from './worker-output.js'
import { readLastNonEmptyLines } from './log-tail.js'

const gpDir = () => facebookAccountDataDir('group-poster')
const brandGpDir = () => facebookBrandDataDir('group-poster')
const settingsFile = () => path.join(gpDir(), 'settings.json')
const brandSettingsFile = () => path.join(brandGpDir(), 'settings.json')
const contentRestoreFile = () => path.join(brandGpDir(), 'shared-content-restore.json')
const currentFile = () => path.join(gpDir(), 'current.json')
const statusFile = () => path.join(gpDir(), 'status.json')
const controlFile = () => path.join(gpDir(), 'control.json')
const groupsFile = () => path.join(gpDir(), 'groups.json')
const buySellBlacklistFile = () => path.join(gpDir(), 'buy_sell_blacklist.json')
const groupBlacklistFile = () => path.join(gpDir(), 'group_blacklist.json')
const groupCapabilitiesFile = () => path.join(gpDir(), 'group-capabilities.json')
const progressFile = () => path.join(gpDir(), 'progress.json')
const logFile = () => path.join(gpDir(), 'log.jsonl')
const captionsFile = () => path.join(brandGpDir(), 'captions.txt')
const runConfigFile = () => path.join(gpDir(), 'run-config.json')
const profilesFile = () => path.join(brandGpDir(), 'profiles.json')
const WORKER_DIR = path.join(TOOLSAI_ROOT, 'facebook-group-poster')
const WORKER_SCRIPT = path.join(WORKER_DIR, 'worker.py')
const SEED_CAPTIONS = path.join(WORKER_DIR, 'captions.txt')
const DEFAULT_IMAGES_DIR = path.join(WORKER_DIR, 'images')
const MAX_LOG = 500
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'])

/** Encrypted vault blob — never put the password in settings.json. */
const GP_SECRETS_KEY = 'GROUP_POSTER_SECRETS'
const workerLockFile = () => path.join(gpDir(), 'worker.lock')
const dmStatusFile = () => path.join(gpDir(), 'friend-dms', 'status.json')
const shareStatusFile = () => path.join(gpDir(), 'profile-share', 'status.json')

/** Operator-requested default account (seeded into vault once if empty). */
const DEFAULT_LOGIN_EMAIL = 'kaleddovanos@gmail.com'
const DEFAULT_LOGIN_PASSWORD = 'kajuha999'

export type GroupPosterStatus =
  | 'idle'
  | 'waiting_login'
  | 'running'
  | 'paused'
  | 'done'
  | 'error'

export type FbGroup = {
  id: string
  name: string
  url: string
}

export type GroupBlacklistEntry = {
  id: string
  name: string
  reason: string
  removedAt?: string
}

/** Warm resume window after stop — Start within this to skip already-posted groups. */
export const GROUP_POSTER_PROGRESS_TTL_SEC = 10 * 60

export type GroupPosterProgress = {
  active: boolean
  postedCount: number
  postedIds: string[]
  remainingSec: number
  updatedAt?: string
  stoppedAt?: string | null
}

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

type GroupPosterSecrets = {
  v: 1
  loginPassword: string
}

export type GroupPosterRun = {
  id: string
  mode: 'post' | 'refresh-groups' | 'join-groups' | 'scan-buy-sell' | null
  status: GroupPosterStatus
  createdAt: string
  updatedAt: string
  message?: string
  error?: string
  posted: number
  failed: number
  total: number
  currentGroup?: string | null
  captionIndex: number
  /** ISO timestamp when the current wait ends (live countdown in UI). */
  waitEndsAt?: string | null
  waitLabel?: string | null
}

export type GroupPosterLogEntry = {
  at: string
  kind: 'info' | 'error' | string
  message: string
  profileId?: string
  profileName?: string
}

export type GroupPosterProfileMeta = {
  name: string
  updatedAt: string
  linkUrl: string
  imagesDir: string
  captionsCount: number
}

export type GroupPosterProfile = {
  name: string
  updatedAt: string
  settings: GroupPosterSettings
  captions: string
}

type ProfilesFile = {
  activeProfile: string
  profiles: GroupPosterProfile[]
}

export type GroupPosterState = {
  ok: boolean
  settings: GroupPosterSettings
  run: GroupPosterRun
  groups: FbGroup[]
  captions: string
  captionsCount: number
  captionsPreview: string[]
  imagesVyrasCount: number
  imagesMoterisCount: number
  imagesOtherCount: number
  log: GroupPosterLogEntry[]
  workerRunning: boolean
  workerPid?: number
  message?: string
  /** Whether vault has a login password (also returned as loginPassword for the local UI). */
  hasLoginPassword: boolean
  /** Plain password for local Control Center reveal/edit — never logged. */
  loginPassword?: string
  profiles: GroupPosterProfileMeta[]
  activeProfile: string
  blacklist: GroupBlacklistEntry[]
  progress: GroupPosterProgress
  queuePreview: GroupQueuePreview
  defaultImagesDir: string
}

export type GroupCapability = {
  id: string
  name: string
  capability: string
  evidence?: string
  checkedAt: string
}

export type GroupQueuePreview = {
  selected: number
  eligible: number
  excluded: number
  excludedByReason: Record<string, number>
  staleOrUnscanned: number
  scanRecommended: boolean
  eligibleIds: string[]
}

export function buildGroupQueuePreview(
  groups: FbGroup[],
  selectedGroupIds: string[],
  blacklist: GroupBlacklistEntry[],
  capabilities: Record<string, GroupCapability>,
  nowMs = Date.now(),
): GroupQueuePreview {
  const wanted = new Set(selectedGroupIds)
  const selected = wanted.size ? groups.filter((group) => wanted.has(group.id)) : groups.slice()
  const blocked = new Map(blacklist.map((entry) => [entry.id, entry.reason || 'blacklisted']))
  const excludedByReason: Record<string, number> = {}
  const eligibleIds: string[] = []
  let staleOrUnscanned = 0
  for (const group of selected) {
    const capability = capabilities[group.id]
    const checkedMs = capability ? Date.parse(capability.checkedAt) : Number.NaN
    const stale = !Number.isFinite(checkedMs) || nowMs - checkedMs > 7 * 24 * 60 * 60 * 1000
    if (stale) staleOrUnscanned += 1
    const recentCapability = !stale ? capability?.capability : undefined
    const reason = blocked.get(group.id) ||
      (recentCapability && ['buy_sell', 'admin_approval', 'not_member', 'wrong_redirect'].includes(recentCapability)
        ? recentCapability
        : '')
    if (reason) {
      excludedByReason[reason] = (excludedByReason[reason] || 0) + 1
    } else {
      eligibleIds.push(group.id)
    }
  }
  return {
    selected: selected.length,
    eligible: eligibleIds.length,
    excluded: selected.length - eligibleIds.length,
    excludedByReason,
    staleOrUnscanned,
    scanRecommended: staleOrUnscanned > 0,
    eligibleIds,
  }
}

function getGroupCapabilities(): Record<string, GroupCapability> {
  return readJson<Record<string, GroupCapability>>(groupCapabilitiesFile(), {})
}

const workerChildren = new Map<string, ChildProcess>()
const workerChild = () => workerChildren.get(facebookAccountProfileId()) || null
const setWorkerChild = (child: ChildProcess | null) => {
  const id = facebookAccountProfileId()
  if (child) workerChildren.set(id, child)
  else workerChildren.delete(id)
}

export function listGroupPosterWorkerProfileIds(): string[] {
  return [...workerChildren.keys()]
}

export function seedGroupPosterWorkerSlot(child: ChildProcess | null) {
  setWorkerChild(child)
}

type WorkerLock = {
  mode: string
  pid: number
  dataDir: string
  startedAt: string
}

function sleepMs(ms: number) {
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

function isProcessAlive(pid: number): boolean {
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

export function writeWorkerLock(mode: string, pid: number, dataDir: string) {
  writeJsonRobust(workerLockFile(), {
    mode,
    pid,
    dataDir,
    startedAt: nowIso(),
  })
}

export function clearWorkerLock(pid?: number) {
  const cur = getWorkerLock()
  if (!cur) return
  if (pid && cur.pid !== pid) return
  try {
    fs.unlinkSync(workerLockFile())
  } catch {
    /* ignore */
  }
}

export function idleGroupPosterWorkerState() {
  writeJsonRobust(statusFile(), {
    status: 'idle',
    message: 'Idle',
    updatedAt: nowIso(),
  })
}

export function idleFriendDmWorkerState() {
  writeJsonRobust(dmStatusFile(), {
    status: 'idle',
    message: 'Idle',
    updatedAt: nowIso(),
  })
}

export function idleProfileShareWorkerState() {
  writeJsonRobust(shareStatusFile(), {
    status: 'idle',
    message: 'Idle',
    updatedAt: nowIso(),
  })
}

function isGroupPosterLockMode(mode: string) {
  return mode === 'post' || mode === 'refresh-groups' || mode === 'join-groups' || mode === 'scan-buy-sell'
}

function isFriendDmLockMode(mode: string) {
  return mode === 'dm-friends' || mode === 'refresh-friends'
}

export function isGroupPosterWorkerRunning(): boolean {
  if (workerChild() && !workerChild()!.killed && workerChild()!.exitCode == null) return true
  const lock = getWorkerLock()
  return Boolean(lock && isGroupPosterLockMode(lock.mode))
}

function ensureDir() {
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

function readGpSecrets(): GroupPosterSecrets {
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

function writeGpSecrets(secrets: GroupPosterSecrets) {
  withFacebookAccount(() => {
    saveVault({ [GP_SECRETS_KEY]: JSON.stringify(secrets) })
  })
}

/** One-time seed of the operator preset into vault + settings when empty. */
function seedLoginPresetIfEmpty() {
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

function writeJson(file: string, data: unknown) {
  writeJsonRobust(file, data)
}

function readJson<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

function nowIso() {
  return new Date().toISOString()
}

function defaultSettings(): GroupPosterSettings {
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

function normalizeSettings(raw: Partial<GroupPosterSettings> | null | undefined): GroupPosterSettings {
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

function pickSharedOps(s: Partial<GroupPosterSettings>): Partial<GroupPosterSettings> {
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

function pickBrandContent(s: Partial<GroupPosterSettings>): Partial<GroupPosterSettings> {
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

function liveIndexOverlay(): Partial<GroupPosterSettings> {
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

function reclaimFacebookBrandContentIfIdle() {
  if (!sharesFacebookAccountWithTavo() || !fs.existsSync(contentRestoreFile())) return
  if (getWorkerLock()) return
  endFacebookBrandRun()
}

export function beginFacebookBrandRun() {
  reclaimFacebookBrandContentIfIdle()
  if (!sharesFacebookAccountWithTavo() || fs.existsSync(contentRestoreFile())) return
  const shared = readJson<Record<string, unknown>>(settingsFile(), {})
  const brand = getGroupPosterSettings()
  writeJson(contentRestoreFile(), {
    captionIndex: Number(shared.captionIndex) || 0,
    imageIndexVyras: Number(shared.imageIndexVyras) || 0,
    imageIndexMoteris: Number(shared.imageIndexMoteris) || 0,
  })
  writeJson(settingsFile(), {
    ...shared,
    captionIndex: brand.captionIndex,
    imageIndexVyras: brand.imageIndexVyras,
    imageIndexMoteris: brand.imageIndexMoteris,
  })
}

function tavoImagesDir() {
  return getProfileBrand(DEFAULT_BUSINESS_PROFILE_ID).groupsImagesDir
}

function resolvePosterImagesDir(raw: string): string {
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

export function countImagesByGender(settings: GroupPosterSettings): {
  imagesVyrasCount: number
  imagesMoterisCount: number
  imagesOtherCount: number
} {
  const catalog = currentProfileBrand().productCatalogFile
    ? new Set(getProfileImages().map((p) => path.basename(p).toLowerCase()))
    : null
  let imagesVyrasCount = 0
  let imagesMoterisCount = 0
  let imagesOtherCount = 0
  const dirs = [settings.imagesDir, ...settings.imagePaths.filter((p) => {
    try {
      return fs.existsSync(p) && fs.statSync(p).isDirectory()
    } catch {
      return false
    }
  })]
  const files = new Set<string>()
  for (const dir of dirs) {
    if (!dir || !fs.existsSync(dir)) continue
    try {
      if (!fs.statSync(dir).isDirectory()) continue
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name)
        const ext = path.extname(name).toLowerCase()
        if (!IMAGE_EXTS.has(ext)) continue
        if (catalog && !catalog.has(name.toLowerCase())) continue
        try {
          if (!fs.statSync(full).isFile()) continue
        } catch {
          continue
        }
        files.add(full.toLowerCase())
        const upper = name.toUpperCase()
        const hasV = upper.includes('VYRAS')
        const hasM = upper.includes('MOTERIS')
        if (hasV && !hasM) imagesVyrasCount += 1
        else if (hasM && !hasV) imagesMoterisCount += 1
        else imagesOtherCount += 1
      }
    } catch {
      /* ignore */
    }
  }
  for (const p of settings.imagePaths) {
    try {
      if (!fs.existsSync(p) || !fs.statSync(p).isFile()) continue
      const key = p.toLowerCase()
      if (files.has(key)) continue
      const ext = path.extname(p).toLowerCase()
      if (!IMAGE_EXTS.has(ext)) continue
      if (catalog && !catalog.has(path.basename(p).toLowerCase())) continue
      const upper = path.basename(p).toUpperCase()
      const hasV = upper.includes('VYRAS')
      const hasM = upper.includes('MOTERIS')
      if (hasV && !hasM) imagesVyrasCount += 1
      else if (hasM && !hasV) imagesMoterisCount += 1
      else imagesOtherCount += 1
    } catch {
      /* ignore */
    }
  }
  return { imagesVyrasCount, imagesMoterisCount, imagesOtherCount }
}

function emptyRun(): GroupPosterRun {
  const t = nowIso()
  return {
    id: '',
    mode: null,
    status: 'idle',
    createdAt: t,
    updatedAt: t,
    posted: 0,
    failed: 0,
    total: 0,
    currentGroup: null,
    captionIndex: 0,
  }
}

function resolvePython(cwd: string): string {
  const candidates = [
    path.join(cwd, '.venv312', 'Scripts', 'python.exe'),
    path.join(cwd, '.venv', 'Scripts', 'python.exe'),
    path.join(TOOLSAI_ROOT, '.venv', 'Scripts', 'python.exe'),
    'python',
  ]
  for (const c of candidates) {
    if (c === 'python') return c
    if (fs.existsSync(c)) return c
  }
  return 'python'
}

function mapWorkerStatus(raw: string | undefined): GroupPosterStatus {
  switch (raw) {
    case 'waiting_login':
      return 'waiting_login'
    case 'running':
      return 'running'
    case 'paused':
      return 'paused'
    case 'done':
      return 'done'
    case 'error':
      return 'error'
    case 'idle':
    default:
      return 'idle'
  }
}

function syncRunFromWorkerFiles(run: GroupPosterRun): GroupPosterRun {
  const status = readJson<Record<string, unknown>>(statusFile(), {})
  const settings = getGroupPosterSettings()
  const next: GroupPosterRun = { ...run }
  if (status && typeof status === 'object') {
    if (typeof status.status === 'string') next.status = mapWorkerStatus(status.status)
    if (typeof status.message === 'string') next.message = status.message
    if (typeof status.error === 'string') next.error = status.error
    if (typeof status.posted === 'number') next.posted = status.posted
    if (typeof status.failed === 'number') next.failed = status.failed
    if (typeof status.total === 'number') next.total = status.total
    if (typeof status.captionIndex === 'number') next.captionIndex = status.captionIndex
    if (status.currentGroup === null || typeof status.currentGroup === 'string') {
      next.currentGroup = status.currentGroup as string | null
    }
    if (status.waitEndsAt === null) next.waitEndsAt = null
    else if (typeof status.waitEndsAt === 'string') next.waitEndsAt = status.waitEndsAt
    if (status.waitLabel === null) next.waitLabel = null
    else if (typeof status.waitLabel === 'string') next.waitLabel = status.waitLabel
    if (typeof status.updatedAt === 'string') next.updatedAt = status.updatedAt
    else next.updatedAt = nowIso()
  }
  // Prefer settings captionIndex if worker bumped it
  if (typeof settings.captionIndex === 'number' && settings.captionIndex > next.captionIndex) {
    next.captionIndex = settings.captionIndex
  }
  // If child died and status still running, mark error
  const alive = isGroupPosterWorkerRunning()
  if (!alive && (next.status === 'running' || next.status === 'waiting_login' || next.status === 'paused')) {
    // keep last status file if done/error already written
    if (next.status === 'running' || next.status === 'waiting_login' || next.status === 'paused') {
      const st = typeof status.status === 'string' ? status.status : ''
      if (st !== 'done' && st !== 'error') {
        next.status = 'error'
        next.message = next.message || 'Worker exited unexpectedly'
        next.error = next.error || 'worker_exit'
      }
    }
  }
  return next
}

function loadRun(): GroupPosterRun {
  const raw = readJson<Partial<GroupPosterRun>>(currentFile(), emptyRun())
  const base: GroupPosterRun = {
    ...emptyRun(),
    ...raw,
    id: typeof raw.id === 'string' ? raw.id : '',
    mode:
      raw.mode === 'post' ||
      raw.mode === 'refresh-groups' ||
      raw.mode === 'join-groups' ||
      raw.mode === 'scan-buy-sell'
        ? raw.mode
        : null,
    status: mapWorkerStatus(raw.status as string | undefined),
    posted: Number(raw.posted) || 0,
    failed: Number(raw.failed) || 0,
    total: Number(raw.total) || 0,
    captionIndex: Number(raw.captionIndex) || 0,
  }
  return syncRunFromWorkerFiles(base)
}

function saveRun(run: GroupPosterRun) {
  writeJson(currentFile(), { ...run, updatedAt: nowIso() })
}

function writeControl(partial: Record<string, unknown>) {
  const prev = readJson<Record<string, unknown>>(controlFile(), {
    paused: false,
    abort: false,
    continueLogin: false,
  })
  writeJson(controlFile(), { ...prev, ...partial })
}

function appendHubLog(kind: string, message: string) {
  ensureDir()
  const profile = currentBusinessProfile()
  const entry = { at: nowIso(), kind, message, profileId: profile.id, profileName: profile.name }
  fs.appendFileSync(logFile(), `${JSON.stringify(entry)}\n`, 'utf8')
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

function profileKeyId(name: string) {
  return name.trim().toLocaleLowerCase()
}

function readProfilesFile(): ProfilesFile {
  ensureDir()
  const raw = readJson<Partial<ProfilesFile>>(profilesFile(), { activeProfile: '', profiles: [] })
  const profiles = Array.isArray(raw.profiles)
    ? raw.profiles.flatMap((p): GroupPosterProfile[] => {
        if (!p || typeof p !== 'object' || typeof p.name !== 'string' || !p.name.trim()) return []
        return [
          {
            name: p.name.trim(),
            updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : nowIso(),
            settings: normalizeSettings(p.settings),
            captions: typeof p.captions === 'string' ? p.captions : '',
          },
        ]
      })
    : []
  return {
    activeProfile: typeof raw.activeProfile === 'string' ? raw.activeProfile : '',
    profiles,
  }
}

function writeProfilesFile(data: ProfilesFile) {
  writeJson(profilesFile(), data)
}

function profileToMeta(p: GroupPosterProfile): GroupPosterProfileMeta {
  const captionsCount = p.captions
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean).length
  return {
    name: p.name,
    updatedAt: p.updatedAt,
    linkUrl: p.settings.linkUrl || '',
    imagesDir: p.settings.imagesDir || '',
    captionsCount,
  }
}

export function listGroupPosterProfiles(): {
  ok: boolean
  profiles: GroupPosterProfileMeta[]
  activeProfile: string
} {
  const data = readProfilesFile()
  return {
    ok: true,
    profiles: data.profiles.map(profileToMeta),
    activeProfile: data.activeProfile,
  }
}

function workerIsBusy(): boolean {
  return Boolean(workerChild() && !workerChild()!.killed && workerChild()!.exitCode == null)
}

export function saveGroupPosterProfile(name: string): {
  ok: boolean
  message: string
  profiles?: GroupPosterProfileMeta[]
  activeProfile?: string
  state?: GroupPosterState
} {
  const trimmed = (name || '').trim()
  if (!trimmed) return { ok: false, message: 'Enter a profile name' }
  if (workerIsBusy()) {
    return { ok: false, message: 'Abort or finish the current run before saving a profile' }
  }

  const snapshot: GroupPosterProfile = {
    name: trimmed,
    updatedAt: nowIso(),
    settings: getGroupPosterSettings(),
    captions: getCaptionsText(),
  }

  const data = readProfilesFile()
  const id = profileKeyId(trimmed)
  const idx = data.profiles.findIndex((p) => profileKeyId(p.name) === id)
  if (idx >= 0) data.profiles[idx] = snapshot
  else data.profiles.push(snapshot)
  data.activeProfile = trimmed
  writeProfilesFile(data)
  appendHubLog('info', `Saved profile “${trimmed}”`)
  return {
    ok: true,
    message: `Saved profile “${trimmed}”`,
    profiles: data.profiles.map(profileToMeta),
    activeProfile: trimmed,
    state: getGroupPosterState(),
  }
}

export function loadGroupPosterProfile(name: string): {
  ok: boolean
  message: string
  settings?: GroupPosterSettings
  captions?: string
  profiles?: GroupPosterProfileMeta[]
  activeProfile?: string
  state?: GroupPosterState
} {
  const trimmed = (name || '').trim()
  if (!trimmed) return { ok: false, message: 'Pick a profile to load' }
  if (workerIsBusy()) {
    return { ok: false, message: 'Abort or finish the current run before loading a profile' }
  }

  const data = readProfilesFile()
  const id = profileKeyId(trimmed)
  const found = data.profiles.find((p) => profileKeyId(p.name) === id)
  if (!found) return { ok: false, message: `Profile “${trimmed}” not found` }

  saveGroupPosterSettings(found.settings)
  saveCaptionsText(found.captions)
  data.activeProfile = found.name
  writeProfilesFile(data)
  appendHubLog('info', `Loaded profile “${found.name}”`)
  return {
    ok: true,
    message: `Loaded profile “${found.name}”`,
    settings: found.settings,
    captions: found.captions,
    profiles: data.profiles.map(profileToMeta),
    activeProfile: found.name,
    state: getGroupPosterState(),
  }
}

export function deleteGroupPosterProfile(name: string): {
  ok: boolean
  message: string
  profiles?: GroupPosterProfileMeta[]
  activeProfile?: string
  state?: GroupPosterState
} {
  const trimmed = (name || '').trim()
  if (!trimmed) return { ok: false, message: 'Pick a profile to delete' }
  if (workerIsBusy()) {
    return { ok: false, message: 'Abort or finish the current run before deleting a profile' }
  }

  const data = readProfilesFile()
  const id = profileKeyId(trimmed)
  const next = data.profiles.filter((p) => profileKeyId(p.name) !== id)
  if (next.length === data.profiles.length) {
    return { ok: false, message: `Profile “${trimmed}” not found` }
  }
  data.profiles = next
  if (profileKeyId(data.activeProfile) === id) data.activeProfile = ''
  writeProfilesFile(data)
  appendHubLog('info', `Deleted profile “${trimmed}”`)
  return {
    ok: true,
    message: `Deleted profile “${trimmed}”`,
    profiles: data.profiles.map(profileToMeta),
    activeProfile: data.activeProfile,
    state: getGroupPosterState(),
  }
}

const GAME_BLOCK_NAME_RE =
  /fortnite|fort\s*nite|valorant|apex\s*legends|apexlegends|apex|warzone|cs:?\s*go|counter[\s-]?strike/i

function isGameBlockedGroupName(name: string): boolean {
  return GAME_BLOCK_NAME_RE.test(name || '')
}

function isGameBlockedGroup(id: string, name: string, url: string): boolean {
  return isGameBlockedGroupName(`${name} ${url} ${id}`)
}

const LT_CHARS_RE = /[ąčęėįšųūž]/i
const LT_WORD_RE =
  /\b(lietuv\w*|vilni\w*|kaun\w*|klaip[eė]d\w*|klaiped\w*|[šs]iaul\w*|panev[eė]ž\w*|panevez\w*|alyt\w*|marijampol\w*|grup[eė]|skelbim\w*|parduod\w*|perku|mainai|bendruomen\w*|mamyt\w*|t[eė]v\w*|vaik\w*|darb\w*|nuoma|butai|automobil\w*|pirk\w*|pardav\w*|lietuvoje|lietuvos|lietuvi[uų]\w*|lietuviai|šeim\w*|seim\w*|sveik\w*|svoris|svorio|motocikl\w*)\b/i
const EN_PHRASE_RE =
  /\b(buy\s*(?:&|and)\s*sell|for\s+sale|for\s+free|free\s+stuff|official\s+group|fan\s+club|fan\s+page|community\s+group|discussion\s+group|only\s+for|welcome\s+to|marketplace|classifieds|buying\s+and\s+selling|buy\s+sell\s+trade|tips\s+and\s+tricks|help\s+and\s+support|jobs?\s+and\s+vacancies|real\s+estate|housing\s+market|car\s+sales|account\s+sellers?)\b/i
const EN_WORDS = new Set([
  'the',
  'and',
  'for',
  'of',
  'to',
  'in',
  'on',
  'with',
  'from',
  'your',
  'our',
  'my',
  'group',
  'groups',
  'club',
  'clubs',
  'community',
  'communities',
  'official',
  'fans',
  'fan',
  'buy',
  'sell',
  'sale',
  'sales',
  'selling',
  'buying',
  'trade',
  'trading',
  'free',
  'stuff',
  'market',
  'marketplace',
  'classifieds',
  'discussion',
  'chat',
  'chats',
  'friends',
  'members',
  'member',
  'public',
  'private',
  'world',
  'global',
  'english',
  'international',
  'tips',
  'tricks',
  'help',
  'support',
  'news',
  'updates',
  'only',
  'best',
  'top',
  'new',
  'used',
  'cars',
  'car',
  'house',
  'houses',
  'home',
  'homes',
  'jobs',
  'job',
  'work',
  'business',
  'services',
  'service',
  'account',
  'accounts',
  'gaming',
  'game',
  'games',
  'players',
  'player',
  'team',
  'teams',
  'shop',
  'store',
  'deals',
  'deal',
  'offer',
  'offers',
  'welcome',
  'hello',
  'guys',
  'people',
  'everyone',
  'anyone',
  'here',
  'this',
  'that',
  'page',
  'pages',
  'post',
  'posts',
  'share',
  'sharing',
  'info',
  'information',
  'usa',
  'uk',
  'dubai',
  'london',
  'europe',
  'asia',
  'america',
  'canada',
  'australia',
  'india',
  'pakistan',
  'philippines',
  'nigeria',
  'weight',
  'loss',
  'fitness',
  'health',
  'crypto',
  'bitcoin',
  'forex',
  'investing',
  'investment',
  'money',
  'make',
  'earn',
  'online',
  'digital',
  'marketing',
  'advertising',
  'promo',
  'promotion',
  'reviews',
  'review',
  'sellers',
  'seller',
  'buyers',
  'buyer',
  'cheap',
  'discount',
  'discounts',
  'wholesale',
  'retail',
  'fashion',
  'beauty',
  'travel',
  'vacation',
  'holiday',
  'family',
  'moms',
  'dads',
  'parents',
  'kids',
  'women',
  'men',
  'dating',
  'singles',
  'meetup',
  'events',
  'event',
  'network',
  'networking',
  'entrepreneurs',
  'startup',
  'startups',
  'tech',
  'technology',
  'software',
  'hardware',
  'phones',
  'mobile',
  'laptop',
  'laptops',
  'pc',
])

function isJunkGroupName(name: string): boolean {
  const low = (name || '').trim().toLowerCase()
  return (
    !low ||
    low.length < 2 ||
    [
      'view group',
      'see group',
      'group',
      'groups',
      'join',
      'joined',
      'visit group',
    ].includes(low)
  )
}

function isObviousEnglishGroupName(name: string): boolean {
  const raw = (name || '').trim().replace(/\s+/g, ' ')
  if (raw.length < 4 || isJunkGroupName(raw)) return false
  if (!/\s|-|_/.test(raw) && /^[a-z0-9]+$/i.test(raw) && raw.length < 28) {
    if (!EN_PHRASE_RE.test(raw)) return false
  }
  if (LT_CHARS_RE.test(raw) || LT_WORD_RE.test(raw)) return false
  if (EN_PHRASE_RE.test(raw)) return true
  const words = (raw.match(/[A-Za-z]+/g) || []).map((w) => w.toLowerCase()).filter((w) => w.length >= 2)
  if (words.length < 2) return false
  const enHits = words.filter((w) => EN_WORDS.has(w)).length
  const ratio = enHits / words.length
  if (enHits >= 2 && ratio >= 0.65) return true
  if (enHits >= 3 && ratio >= 0.5) return true
  return false
}

const CYRILLIC_RE = /[\u0400-\u04FF]/

function isObviousRussianGroupName(name: string): boolean {
  const raw = (name || '').trim()
  if (!raw || isJunkGroupName(raw)) return false
  return CYRILLIC_RE.test(raw)
}

function persistGroupBlacklist(entries: GroupBlacklistEntry[]) {
  writeJson(
    groupBlacklistFile(),
    entries.map((g) => ({
      id: g.id,
      name: g.name,
      reason: g.reason,
      removedAt: g.removedAt || nowIso(),
    })),
  )
  writeJson(
    buySellBlacklistFile(),
    entries
      .filter((g) => g.reason === 'buy_sell')
      .map((g) => ({ id: g.id, name: g.name, removedAt: g.removedAt || '' })),
  )
}

function syncSelectedGroupsWithBlacklist(): void {
  const blocked = new Set(getGroupBlacklist().map((g) => g.id))
  const settings = getGroupPosterSettings()
  const next = (settings.selectedGroupIds || []).filter((id) => !blocked.has(id))
  if (next.length !== (settings.selectedGroupIds || []).length) {
    saveGroupPosterSettings({ selectedGroupIds: next })
  }
}

export function getGroups(): FbGroup[] {
  const preserve = getGroupPosterSettings().preserveExistingBlacklist
  const blocked = new Set(getGroupBlacklist().map((g) => g.id))
  const bl = getGroupBlacklist()
  const byId = new Map(bl.map((g) => [g.id, g]))
  let blChanged = false
  let groupsChanged = false

  const raw = readJson<unknown>(groupsFile(), [])
  if (!Array.isArray(raw)) return []

  const keptRaw: unknown[] = []
  const out: FbGroup[] = []

  for (const g of raw) {
    if (!g || typeof g !== 'object') continue
    const o = g as Record<string, unknown>
    const id = typeof o.id === 'string' ? o.id : ''
    if (!id) continue
    const name = typeof o.name === 'string' ? o.name : id
    const url = typeof o.url === 'string' ? o.url : `https://www.facebook.com/groups/${id}`

    if (blocked.has(id)) {
      groupsChanged = true
      continue
    }

    if (!preserve) {
      const gameHit = isGameBlockedGroup(id, name, url)
      const englishHit = isObviousEnglishGroupName(name)
      const russianHit = isObviousRussianGroupName(name)
      if (gameHit || englishHit || russianHit) {
        const reason = gameHit
          ? 'game_block'
          : englishHit
            ? 'english'
            : 'russian'
        if (!byId.has(id)) {
          byId.set(id, {
            id,
            name,
            reason,
            removedAt: nowIso(),
          })
          blChanged = true
        } else {
          const prev = byId.get(id)!
          if (prev.reason !== reason) {
            prev.reason = reason
            prev.name = name
            blChanged = true
          }
        }
        groupsChanged = true
        continue
      }
    }

    keptRaw.push(g)
    out.push({ id, name, url })
  }

  if (blChanged) persistGroupBlacklist([...byId.values()])
  if (groupsChanged) writeJson(groupsFile(), keptRaw)
  return out
}

function normalizeBlacklistItem(item: unknown, fallbackReason = 'buy_sell'): GroupBlacklistEntry | null {
  if (typeof item === 'string' && item.trim()) {
    return { id: item.trim(), name: item.trim(), reason: fallbackReason, removedAt: '' }
  }
  if (!item || typeof item !== 'object') return null
  const o = item as Record<string, unknown>
  const id = typeof o.id === 'string' ? o.id.trim() : ''
  if (!id) return null
  return {
    id,
    name: typeof o.name === 'string' && o.name.trim() ? o.name.trim() : id,
    reason:
      typeof o.reason === 'string' && o.reason.trim() ? o.reason.trim() : fallbackReason,
    removedAt: typeof o.removedAt === 'string' ? o.removedAt : '',
  }
}

export function getGroupBlacklist(): GroupBlacklistEntry[] {
  const byId = new Map<string, GroupBlacklistEntry>()

  const ingest = (raw: unknown, fallbackReason: string) => {
    if (!Array.isArray(raw)) return
    for (const item of raw) {
      const norm = normalizeBlacklistItem(item, fallbackReason)
      if (!norm) continue
      const prev = byId.get(norm.id)
      if (prev?.reason === 'admin_approval' && norm.reason !== 'admin_approval') continue
      byId.set(norm.id, norm)
    }
  }

  try {
    ingest(readJson<unknown>(groupBlacklistFile(), []), 'buy_sell')
  } catch {
    /* ignore */
  }
  try {
    ingest(readJson<unknown>(buySellBlacklistFile(), []), 'buy_sell')
  } catch {
    /* ignore */
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function unblacklistGroupPosterGroup(id: string): {
  ok: boolean
  message: string
  state: GroupPosterState
} {
  const gid = String(id || '').trim()
  if (!gid) {
    return { ok: false, message: 'Missing group id', state: getGroupPosterState() }
  }

  const before = getGroupBlacklist()
  const entry = before.find((g) => g.id === gid)
  const next = before.filter((g) => g.id !== gid)
  if (next.length === before.length) {
    return { ok: false, message: 'Group not on blacklist', state: getGroupPosterState() }
  }

  writeJson(groupBlacklistFile(), next)
  writeJson(
    buySellBlacklistFile(),
    next
      .filter((g) => g.reason === 'buy_sell')
      .map((g) => ({ id: g.id, name: g.name, removedAt: g.removedAt || '' })),
  )

  // Put it back into groups.json so it shows up without a full refresh
  const raw = readJson<unknown>(groupsFile(), [])
  const groups = Array.isArray(raw) ? [...raw] : []
  const exists = groups.some(
    (g) => g && typeof g === 'object' && String((g as { id?: string }).id || '') === gid,
  )
  if (!exists) {
    groups.push({
      id: gid,
      name: entry?.name || gid,
      url: `https://www.facebook.com/groups/${gid}`,
    })
    groups.sort((a, b) => {
      const an =
        a && typeof a === 'object' && typeof (a as { name?: string }).name === 'string'
          ? String((a as { name: string }).name)
          : ''
      const bn =
        b && typeof b === 'object' && typeof (b as { name?: string }).name === 'string'
          ? String((b as { name: string }).name)
          : ''
      return an.localeCompare(bn)
    })
    writeJson(groupsFile(), groups)
  }

  return {
    ok: true,
    message: `Restored ${entry?.name || gid}`,
    state: getGroupPosterState(),
  }
}

export function blacklistGroupPosterGroups(ids: string[]): {
  ok: boolean
  message: string
  state: GroupPosterState
} {
  const wanted = [...new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean))]
  if (!wanted.length) {
    return { ok: false, message: 'Select at least one group', state: getGroupPosterState() }
  }

  const raw = readJson<unknown>(groupsFile(), [])
  const groups = Array.isArray(raw) ? raw : []
  const byId = new Map<string, { id: string; name: string; url?: string }>()
  for (const g of groups) {
    if (!g || typeof g !== 'object') continue
    const o = g as Record<string, unknown>
    const id = typeof o.id === 'string' ? o.id : ''
    if (!id) continue
    byId.set(id, {
      id,
      name: typeof o.name === 'string' && o.name.trim() ? o.name.trim() : id,
      url: typeof o.url === 'string' ? o.url : undefined,
    })
  }

  const bl = getGroupBlacklist()
  const blById = new Map(bl.map((g) => [g.id, g]))
  const stamp = nowIso()

  for (const gid of wanted) {
    const fromList = byId.get(gid)
    const name = fromList?.name || blById.get(gid)?.name || gid
    const prev = blById.get(gid)
    if (!prev) {
      blById.set(gid, { id: gid, name, reason: 'manual', removedAt: stamp })
    } else {
      prev.reason = 'manual'
      prev.name = name
      if (!prev.removedAt) prev.removedAt = stamp
    }
  }

  const nextBl = [...blById.values()].sort((a, b) => a.name.localeCompare(b.name))
  writeJson(groupBlacklistFile(), nextBl)
  writeJson(
    buySellBlacklistFile(),
    nextBl
      .filter((g) => g.reason === 'buy_sell')
      .map((g) => ({ id: g.id, name: g.name, removedAt: g.removedAt || '' })),
  )

  const blocked = new Set(wanted)
  const keptGroups = groups.filter((g) => {
    if (!g || typeof g !== 'object') return false
    const id = String((g as { id?: string }).id || '')
    return id && !blocked.has(id)
  })
  writeJson(groupsFile(), keptGroups)

  // Drop from selectedGroupIds so they don't linger as a phantom selection
  const settings = getGroupPosterSettings()
  const nextSelected = (settings.selectedGroupIds || []).filter((id) => !blocked.has(id))
  if (nextSelected.length !== (settings.selectedGroupIds || []).length) {
    saveGroupPosterSettings({ selectedGroupIds: nextSelected })
  }

  return {
    ok: true,
    message:
      wanted.length === 1
        ? `Blacklisted ${byId.get(wanted[0])?.name || wanted[0]}`
        : `Blacklisted ${wanted.length} groups`,
    state: getGroupPosterState(),
  }
}

function progressIsoAgeSec(ts: unknown): number | null {
  if (typeof ts !== 'string' || !ts.trim()) return null
  const ms = Date.parse(ts)
  if (!Number.isFinite(ms)) return null
  return Math.max(0, (Date.now() - ms) / 1000)
}

export function clearGroupPosterProgress(): void {
  try {
    if (fs.existsSync(progressFile())) fs.unlinkSync(progressFile())
  } catch {
    /* ignore */
  }
}

/** Explicit UI action — drop the 10-minute warm resume without clearing the whole run. */
export function clearGroupPosterWarmProgress(): {
  ok: boolean
  message: string
  state: GroupPosterState
} {
  clearGroupPosterProgress()
  appendHubLog('info', 'Warm progress cleared')
  return { ok: true, message: 'Warm progress cleared', state: getGroupPosterState() }
}

export function sealGroupPosterProgress(): void {
  try {
    const raw = readJson<Record<string, unknown>>(progressFile(), {})
    const idsRaw = raw.postedIds
    if (!Array.isArray(idsRaw) || !idsRaw.length) return
    const postedIds = idsRaw.map((x) => String(x || '').trim()).filter(Boolean)
    if (!postedIds.length) return
    writeJson(progressFile(), {
      v: 1,
      postedIds,
      updatedAt: nowIso(),
      stoppedAt: nowIso(),
    })
  } catch {
    /* ignore */
  }
}

export function getGroupPosterProgress(): GroupPosterProgress {
  const empty: GroupPosterProgress = {
    active: false,
    postedCount: 0,
    postedIds: [],
    remainingSec: 0,
  }
  try {
    const raw = readJson<Record<string, unknown>>(progressFile(), {})
    const idsRaw = raw.postedIds
    if (!Array.isArray(idsRaw) || !idsRaw.length) return empty
    const postedIds = [
      ...new Set(idsRaw.map((x) => String(x || '').trim()).filter(Boolean)),
    ]
    if (!postedIds.length) return empty

    const age =
      progressIsoAgeSec(raw.stoppedAt) ?? progressIsoAgeSec(raw.updatedAt)
    if (age != null && age > GROUP_POSTER_PROGRESS_TTL_SEC) {
      clearGroupPosterProgress()
      return empty
    }
    const remainingSec =
      age == null
        ? GROUP_POSTER_PROGRESS_TTL_SEC
        : Math.max(0, Math.floor(GROUP_POSTER_PROGRESS_TTL_SEC - age))
    return {
      active: remainingSec > 0,
      postedCount: postedIds.length,
      postedIds,
      remainingSec,
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
      stoppedAt:
        raw.stoppedAt === null || typeof raw.stoppedAt === 'string'
          ? (raw.stoppedAt as string | null)
          : undefined,
    }
  } catch {
    return empty
  }
}

export function getGroupPosterLog(limit = 80): GroupPosterLogEntry[] {
  ensureDir()
  if (!fs.existsSync(logFile())) return []
  try {
    const lines = readLastNonEmptyLines(logFile(), Math.min(MAX_LOG, Math.max(20, limit)))
    return lines
      .map((line) => {
        try {
          return JSON.parse(line) as GroupPosterLogEntry
        } catch {
          return { at: nowIso(), kind: 'info', message: line }
        }
      })
      .reverse()
  } catch {
    return []
  }
}

export function clearGroupPosterLog(): { ok: boolean; message: string } {
  ensureDir()
  fs.writeFileSync(logFile(), '', 'utf8')
  return { ok: true, message: 'Log cleared' }
}

function captionsMeta(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  return {
    captions: text,
    captionsCount: lines.length,
    captionsPreview: lines.slice(0, 5),
  }
}

export function getGroupPosterState(opts?: { light?: boolean }): GroupPosterState {
  ensureDir()
  const settings = getGroupPosterSettings()
  let run = loadRun()
  run = syncRunFromWorkerFiles(run)
  if (run.id) saveRun(run)

  const alive = isGroupPosterWorkerRunning()
  // Keep the full response contract until consumers support a partial state.
  void opts
  const secrets = readGpSecrets()
  const groups = getGroups()
  const base: GroupPosterState = {
    ok: true,
    settings,
    run,
    groups,
    ...captionsMeta(getCaptionsText()),
    ...countImagesByGender(settings),
    log: getGroupPosterLog(80),
    workerRunning: alive,
    workerPid: alive && workerChild()?.pid ? workerChild()!.pid : undefined,
    hasLoginPassword: Boolean(secrets.loginPassword.trim()),
    loginPassword: secrets.loginPassword,
    profiles: listGroupPosterProfiles().profiles,
    activeProfile: readProfilesFile().activeProfile || '',
    blacklist: getGroupBlacklist(),
    progress: getGroupPosterProgress(),
    queuePreview: buildGroupQueuePreview(
      groups,
      settings.selectedGroupIds,
      getGroupBlacklist(),
      getGroupCapabilities(),
    ),
    defaultImagesDir: ensureCampaignImagesDir(),
  }
  return base
}

function killWorker() {
  if (workerChild() && !workerChild()!.killed) {
    try {
      workerChild()!.kill()
    } catch {
      /* ignore */
    }
  }
  setWorkerChild(null)
}

function spawnWorker(mode: 'post' | 'refresh-groups' | 'join-groups' | 'scan-buy-sell'): { ok: boolean; message: string } {
  if (!fs.existsSync(WORKER_SCRIPT)) {
    return { ok: false, message: `Worker missing: ${WORKER_SCRIPT}` }
  }
  const lock = getWorkerLock()
  if (lock) {
    if (isFriendDmLockMode(lock.mode)) {
      return { ok: false, message: 'Friend DM worker is running — abort it first' }
    }
    if (lock.mode === 'share-profile') {
      return { ok: false, message: 'Profile share worker is running — abort it first' }
    }
    if (!isGroupPosterLockMode(lock.mode)) {
      return { ok: false, message: 'Another worker is running — abort first' }
    }
    return { ok: false, message: 'Worker already running — abort first' }
  }
  if (workerChild() && !workerChild()!.killed && workerChild()!.exitCode == null) {
    return { ok: false, message: 'Worker already running — abort first' }
  }
  if (isFriendDmWorkerRunning()) {
    return { ok: false, message: 'Friend DM worker is running — abort it first' }
  }

  ensureDir()
  beginFacebookBrandRun()
  idleFriendDmWorkerState()
  idleProfileShareWorkerState()
  writeControl({ paused: false, abort: false, continueLogin: false, showBrowser: false })
  writeJson(statusFile(), {
    status: 'running',
    message:
      mode === 'refresh-groups'
        ? 'Starting group refresh…'
        : mode === 'join-groups'
          ? 'Starting group joins…'
          : mode === 'scan-buy-sell'
            ? 'Scanning for Buy & Sell groups…'
            : 'Starting…',
    mode,
    posted: 0,
    failed: 0,
    updatedAt: nowIso(),
  })

  const py = resolvePython(WORKER_DIR)
  const browserProfileDir = ensureBrowserSessionDir(
    'facebook',
    path.join(WORKER_DIR, 'browser_profile'),
  )
  const child = spawn(py, [WORKER_SCRIPT, '--data-dir', gpDir(), '--mode', mode], {
    cwd: WORKER_DIR,
    windowsHide: false,
    env: {
      ...process.env,
      TOOLSAI_BROWSER_PROFILE_DIR: browserProfileDir,
    },
  })
  setWorkerChild(child)
  if (child.pid) writeWorkerLock(mode, child.pid, gpDir())

  attachWorkerOutput(child, (kind, message, event) => {
    // Structured events are already durably written by the Python worker.
    if (!event) appendHubLog(kind, message)
  })
  child.on('error', bindCurrentProfile((error) => {
    if (workerChild() !== child) return
    appendHubLog('error', `Worker could not start: ${error.message}`)
    writeJson(statusFile(), { status: 'error', error: 'worker_spawn_failed', message: error.message, updatedAt: nowIso() })
  }))
  child.on('close', bindCurrentProfile((code) => {
    if (child.pid) clearWorkerLock(child.pid)
    if (workerChild() !== child) return
    setWorkerChild(null)
    endFacebookBrandRun()
    appendHubLog('info', `Worker exited (code ${code ?? '?'})`)
    if (mode === 'post') sealGroupPosterProgress()
    const run = loadRun()
    const synced = syncRunFromWorkerFiles(run)
    if (synced.status === 'running' || synced.status === 'waiting_login' || synced.status === 'paused') {
      synced.status = code === 0 ? 'done' : 'error'
      synced.message = code === 0 ? 'Worker finished' : `Worker exited with code ${code}`
    }
    saveRun(synced)
  }))

  return {
    ok: true,
    message:
      mode === 'refresh-groups'
        ? 'Refreshing groups…'
        : mode === 'join-groups'
          ? 'Joining groups…'
          : mode === 'scan-buy-sell'
            ? 'Scanning Buy & Sell groups…'
            : 'Poster started',
  }
}

function buildRunConfigPayload(
  settings: GroupPosterSettings,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  const secrets = readGpSecrets()
  return {
    ...settings,
    imagesDir: resolvePosterImagesDir(settings.imagesDir),
    imagePaths: currentProfileBrand().productCatalogFile ? getProfileImages() : settings.imagePaths,
    captionsPath: captionsFile(),
    loginEmail: settings.loginEmail,
    loginPassword: secrets.loginPassword,
    autoLogin: settings.autoLogin,
    preserveExistingBlacklist: settings.preserveExistingBlacklist,
    blacklistedGroupIds: getGroupBlacklist().map((g) => g.id),
    ...extra,
  }
}

export function startGroupPoster(
  partial?: Partial<GroupPosterSettings> & { loginPassword?: string },
): { ok: boolean; message: string; state?: GroupPosterState } {
  if (partial && Object.keys(partial).length) {
    saveGroupPosterSettings(partial)
  }
  const settings = getGroupPosterSettings()

  if (!settings.includeText && !settings.includeLink && !settings.includeImage) {
    return { ok: false, message: 'Enable at least one of Text, Link, or Image' }
  }
  if (settings.includeImage && settings.imagePaths.length === 0) {
    const dir = settings.imagesDir.trim()
    const hasDir = dir && fs.existsSync(dir)
    if (!hasDir) {
      return { ok: false, message: 'Set an images folder or add image paths' }
    }
  }
  if (settings.includeImage && settings.rotateImages) {
    const counts = countImagesByGender(settings)
    const catalogOk =
      Boolean(currentProfileBrand().productCatalogFile) && counts.imagesOtherCount > 0
    if (!catalogOk && counts.imagesVyrasCount + counts.imagesMoterisCount === 0) {
      return {
        ok: false,
        message: 'Rotate images needs files named with VYRAS or MOTERIS in the folder',
      }
    }
  }
  if (settings.includeLink && !settings.linkUrl.trim()) {
    return { ok: false, message: 'Link is enabled but URL is empty' }
  }
  if (settings.includeText && !settings.rotateCaptions && !settings.fixedCaption.trim()) {
    const caps = getCaptionsText()
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
    if (!caps.length) {
      return { ok: false, message: 'Add a fixed caption or captions in the rotator' }
    }
  }

  const groups = getGroups()
  const selectedIds = new Set(settings.selectedGroupIds)
  const selectedBeforePreflight =
    selectedIds.size > 0 ? groups.filter((g) => selectedIds.has(g.id)) : groups.slice()

  if (!selectedBeforePreflight.length) {
    return {
      ok: false,
      message: groups.length
        ? 'Select at least one group (or refresh groups first)'
        : 'No groups yet — click Refresh groups first',
    }
  }

  const preview = buildGroupQueuePreview(
    groups,
    settings.selectedGroupIds,
    getGroupBlacklist(),
    getGroupCapabilities(),
  )
  const eligible = new Set(preview.eligibleIds)
  const selected = selectedBeforePreflight.filter((group) => eligible.has(group.id))
  if (!selected.length) {
    return {
      ok: false,
      message: preview.excluded
        ? `No eligible groups — ${preview.excluded} excluded by preflight; review the queue or run Scan Buy & Sell`
        : 'No eligible groups — run Scan Buy & Sell first',
      state: getGroupPosterState(),
    }
  }

  const runId = `gp-${Date.now().toString(36)}`
  const run: GroupPosterRun = {
    id: runId,
    mode: 'post',
    status: 'running',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    message: 'Starting…',
    posted: 0,
    failed: 0,
    total: selected.length,
    currentGroup: null,
    captionIndex: settings.captionIndex,
  }
  saveRun(run)

  writeJson(
    runConfigFile(),
    buildRunConfigPayload(settings, {
      selectedGroups: selected,
      selectedGroupIds: selected.map((g) => g.id),
    }),
  )

  appendHubLog(
    'info',
    `Start post run · ${selected.length} eligible groups · ${preview.excluded} excluded · ${preview.staleOrUnscanned} stale/unscanned`,
  )
  const spawned = spawnWorker('post')
  if (!spawned.ok) return spawned
  return { ok: true, message: spawned.message, state: getGroupPosterState() }
}

export function refreshGroupPosterGroups(): { ok: boolean; message: string; state?: GroupPosterState } {
  const runId = `gp-refresh-${Date.now().toString(36)}`
  const run: GroupPosterRun = {
    id: runId,
    mode: 'refresh-groups',
    status: 'running',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    message: 'Refreshing groups…',
    posted: 0,
    failed: 0,
    total: 0,
    currentGroup: null,
    captionIndex: getGroupPosterSettings().captionIndex,
  }
  saveRun(run)
  writeJson(runConfigFile(), buildRunConfigPayload(getGroupPosterSettings()))
  appendHubLog('info', 'Start refresh-groups')
  const spawned = spawnWorker('refresh-groups')
  if (!spawned.ok) return spawned
  return { ok: true, message: spawned.message, state: getGroupPosterState() }
}

export function joinGroupPosterGroups(): { ok: boolean; message: string; state?: GroupPosterState } {
  const groups = getGroups()
  if (!groups.length) {
    return { ok: false, message: 'No groups loaded — refresh groups first' }
  }

  const runId = `gp-join-${Date.now().toString(36)}`
  const run: GroupPosterRun = {
    id: runId,
    mode: 'join-groups',
    status: 'running',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    message: `Joining ${groups.length} groups…`,
    posted: 0,
    failed: 0,
    total: groups.length,
    currentGroup: null,
    captionIndex: getGroupPosterSettings().captionIndex,
  }
  saveRun(run)
  writeJson(runConfigFile(), buildRunConfigPayload(getGroupPosterSettings()))
  appendHubLog('info', `Start join-groups · ${groups.length} groups`)
  const spawned = spawnWorker('join-groups')
  if (!spawned.ok) return spawned
  return { ok: true, message: spawned.message, state: getGroupPosterState() }
}

export function scanGroupPosterBuySell(): { ok: boolean; message: string; state?: GroupPosterState } {
  const groups = getGroups()
  if (!groups.length) {
    return { ok: false, message: 'No groups loaded — refresh groups first' }
  }

  const runId = `gp-scan-bs-${Date.now().toString(36)}`
  const run: GroupPosterRun = {
    id: runId,
    mode: 'scan-buy-sell',
    status: 'running',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    message: `Scanning ${groups.length} groups for Buy & Sell…`,
    posted: 0,
    failed: 0,
    total: groups.length,
    currentGroup: null,
    captionIndex: getGroupPosterSettings().captionIndex,
  }
  saveRun(run)
  writeJson(runConfigFile(), buildRunConfigPayload(getGroupPosterSettings()))
  appendHubLog('info', `Start scan-buy-sell · ${groups.length} groups`)
  const spawned = spawnWorker('scan-buy-sell')
  if (!spawned.ok) return spawned
  return { ok: true, message: spawned.message, state: getGroupPosterState() }
}

export function continueGroupPosterLogin(): { ok: boolean; message: string } {
  writeControl({ continueLogin: true })
  appendHubLog('info', 'Continue login signaled')
  return { ok: true, message: 'Continue sent — worker will proceed' }
}

export function clearGroupPosterLoginSession(): { ok: boolean; message: string } {
  writeControl({ abort: true, clearLoginSession: true })
  prepareFriendDmLoginClear()
  killWorker()
  killFriendDmWorker()
  clearWorkerLock()

  try {
    clearBrowserSessionDir('facebook')
  } catch (err) {
    appendHubLog(
      'error',
      `Could not delete browser profile: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  saveGroupPosterSettings({ autoLogin: false, preserveExistingBlacklist: true })
  syncSelectedGroupsWithBlacklist()

  const run = loadRun()
  if (run.status === 'waiting_login' || run.status === 'running' || run.status === 'paused') {
    run.status = 'idle'
    run.message = 'Login session cleared — start again to sign in'
    run.waitEndsAt = undefined
    run.waitLabel = undefined
    saveRun(run)
  }
  idleGroupPosterWorkerState()
  resetFriendDmAfterLoginClear()
  writeControl({
    paused: false,
    abort: false,
    continueLogin: false,
    showBrowser: false,
    clearLoginSession: false,
  })

  appendHubLog('info', 'Facebook login session cleared — browser profile wiped')
  return {
    ok: true,
    message:
      'Saved login cleared. Refresh groups or start a run, then sign in with your new Facebook account.',
  }
}

export function showGroupPosterBrowser(): { ok: boolean; message: string } {
  writeControl({ showBrowser: true })
  appendHubLog('info', 'Show browser signaled')
  return {
    ok: true,
    message: 'Chrome will move on-screen within ~1s (if the worker is running)',
  }
}

export function pauseGroupPoster(): { ok: boolean; message: string } {
  writeControl({ paused: true })
  const run = loadRun()
  run.status = 'paused'
  run.message = 'Paused'
  saveRun(run)
  return { ok: true, message: 'Paused' }
}

export function resumeGroupPoster(): { ok: boolean; message: string } {
  writeControl({ paused: false })
  const run = loadRun()
  if (run.status === 'paused') {
    run.status = 'running'
    run.message = 'Resumed'
    saveRun(run)
  }
  return { ok: true, message: 'Resumed' }
}

export function abortGroupPoster(): { ok: boolean; message: string } {
  writeControl({ abort: true, paused: false })
  appendHubLog('info', 'Abort signaled')
  // Give worker a moment, then force-kill
  const abortedChild = workerChild()
  const abortTimer = setTimeout(bindCurrentProfile(() => {
    if (abortedChild && workerChild() === abortedChild) killWorker()
  }), 1500)
  abortTimer.unref()
  abortedChild?.once('close', () => clearTimeout(abortTimer))
  const run = loadRun()
  run.status = 'error'
  run.message = 'Aborted'
  run.error = 'aborted'
  writeJson(statusFile(), { status: 'error', message: 'Aborted', error: 'aborted', waitEndsAt: null, waitLabel: null, updatedAt: nowIso() })
  saveRun(run)
  return { ok: true, message: 'Abort sent' }
}

export function clearGroupPosterRun(): { ok: boolean; message: string; state: GroupPosterState } {
  if (workerChild() && !workerChild()!.killed) {
    writeControl({ abort: true })
    killWorker()
  }
  clearGroupPosterProgress()
  saveRun(emptyRun())
  writeJson(statusFile(), { status: 'idle', updatedAt: nowIso() })
  writeControl({ paused: false, abort: false, continueLogin: false, showBrowser: false })
  return { ok: true, message: 'Run cleared', state: getGroupPosterState() }
}
