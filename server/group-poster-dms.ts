/**
 * Friend DM automation — shares worker + Chrome profile with Group Poster.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadVault, TOOLSAI_ROOT } from './cc-services.js'
import {
  bindCurrentProfile,
  currentBusinessProfile,
} from './business-profiles.js'
import { ensureBrowserSessionDir } from './browser-sessions.js'
import {
  facebookAccountDataDir,
  facebookAccountProfileId,
  facebookBrandDataDir,
  sharesFacebookAccountWithTavo,
  withFacebookAccount,
} from './facebook-account-store.js'
import {
  beginFacebookBrandRun,
  clearWorkerLock,
  countImagesByGender,
  endFacebookBrandRun,
  getGroupPosterSettings,
  getWorkerLock,
  idleGroupPosterWorkerState,
  idleFriendDmWorkerState,
  idleProfileShareWorkerState,
  isGroupPosterWorkerRunning,
  writeJsonRobust,
  writeWorkerLock,
  type GroupPosterLogEntry,
  type GroupPosterStatus,
} from './group-poster.js'
import { attachWorkerOutput } from './worker-output.js'
import { readLastNonEmptyLines } from './log-tail.js'

const gpDir = () => facebookAccountDataDir('group-poster')
const DEFAULT_POSTAI_FILE = path.join(os.homedir(), 'Downloads', 'postai1.txt')
const LEGACY_POSTAI_FILE = path.join(os.homedir(), 'Downloads', 'postai.txt')
const dmDir = () => path.join(gpDir(), 'friend-dms')
const brandDmDir = () => path.join(facebookBrandDataDir('group-poster'), 'friend-dms')
const dmSettingsFile = () => path.join(dmDir(), 'settings.json')
const brandDmSettingsFile = () => path.join(brandDmDir(), 'settings.json')
const dmContentRestoreFile = () => path.join(brandDmDir(), 'shared-content-restore.json')
const dmFriendsFile = () => path.join(dmDir(), 'friends.json')
const dmStatusFile = () => path.join(dmDir(), 'status.json')
const dmControlFile = () => path.join(dmDir(), 'control.json')
const dmLogFile = () => path.join(dmDir(), 'log.jsonl')
const dmCurrentFile = () => path.join(dmDir(), 'current.json')
const dmRunConfigFile = () => path.join(dmDir(), 'run-config.json')
const dmSentFile = () => path.join(dmDir(), 'sent.json')
const dmMessagesFile = () => path.join(brandDmDir(), 'messages.txt')
const WORKER_DIR = path.join(TOOLSAI_ROOT, 'facebook-group-poster')
const WORKER_SCRIPT = path.join(WORKER_DIR, 'worker.py')
const GP_SECRETS_KEY = 'GROUP_POSTER_SECRETS'
const MAX_LOG = 500

const dmWorkerChildren = new Map<string, ChildProcess>()
const dmWorkerChild = () => dmWorkerChildren.get(facebookAccountProfileId()) || null
const setDmWorkerChild = (child: ChildProcess | null) => {
  const id = facebookAccountProfileId()
  if (child) dmWorkerChildren.set(id, child)
  else dmWorkerChildren.delete(id)
}

export type FbFriend = {
  id: string
  name: string
  url: string
}

export type IntervalUnit = 'minutes' | 'seconds'

export type FriendDmSettings = {
  message: string
  rotateMessages: boolean
  /** Local .txt file — one message per line */
  postaiPath: string
  intervalUnit: IntervalUnit
  minInterval: number
  maxInterval: number
  minIntervalMin: number
  maxIntervalMin: number
  warmupSec: number
  dailyCap: number
  minTypeDelayMs: number
  maxTypeDelayMs: number
  selectedFriendIds: string[]
  shuffleFriends: boolean
  skipAlreadyMessaged: boolean
  messageIndex: number
  includeImage: boolean
  imageEveryMessage: boolean
}

export type FriendDmRun = {
  id: string
  mode: 'dm-friends' | 'refresh-friends' | null
  status: GroupPosterStatus
  createdAt: string
  updatedAt: string
  message?: string
  error?: string
  sent: number
  failed: number
  skipped?: number
  total: number
  currentFriend?: string | null
  messageIndex: number
  waitEndsAt?: string | null
  waitLabel?: string | null
}

export type FriendDmState = {
  ok: boolean
  settings: FriendDmSettings
  run: FriendDmRun
  friends: FbFriend[]
  /** DM messages saved in Control Center */
  messages: string
  messagesCount: number
  sentIds: string[]
  log: GroupPosterLogEntry[]
  workerRunning: boolean
  workerPid?: number
  includeText?: boolean
  includeImage?: boolean
  imagesVyrasCount?: number
  imagesMoterisCount?: number
  imagesOtherCount?: number
  imagesDir?: string
  loginEmail?: string
  autoLogin?: boolean
  hasLoginPassword?: boolean
  loginPassword?: string
}

function nowIso() {
  return new Date().toISOString()
}

function ensureDmDir() {
  fs.mkdirSync(dmDir(), { recursive: true })
  fs.mkdirSync(brandDmDir(), { recursive: true })
}

function readJson<T>(file: string, fallback: T): T {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8')) as T
    }
  } catch {
    /* ignore */
  }
  return fallback
}

function writeJson(file: string, data: unknown) {
  writeJsonRobust(file, data)
}

function readDmSecrets(): { loginPassword: string } {
  return withFacebookAccount(() => {
    const raw = loadVault()[GP_SECRETS_KEY]
    if (!raw) return { loginPassword: '' }
    if (typeof raw === 'object' && raw && 'loginPassword' in raw) {
      return { loginPassword: String((raw as { loginPassword?: string }).loginPassword || '') }
    }
    try {
      const parsed = JSON.parse(String(raw)) as { loginPassword?: string }
      return { loginPassword: typeof parsed.loginPassword === 'string' ? parsed.loginPassword : '' }
    } catch {
      return { loginPassword: '' }
    }
  })
}

function defaultDmSettings(): FriendDmSettings {
  return {
    message: '',
    rotateMessages: true,
    postaiPath: DEFAULT_POSTAI_FILE,
    intervalUnit: 'minutes',
    minInterval: 3,
    maxInterval: 8,
    minIntervalMin: 3,
    maxIntervalMin: 8,
    warmupSec: 20,
    dailyCap: 15,
    minTypeDelayMs: 35,
    maxTypeDelayMs: 95,
    selectedFriendIds: [],
    shuffleFriends: false,
    skipAlreadyMessaged: true,
    messageIndex: 0,
    includeImage: false,
    imageEveryMessage: false,
  }
}

function normalizeDmSettings(raw: Partial<FriendDmSettings>): FriendDmSettings {
  const d = defaultDmSettings()
  const gp = getGroupPosterSettings()
  const next: FriendDmSettings = {
    message: typeof raw.message === 'string' ? raw.message : d.message,
    rotateMessages: raw.rotateMessages !== false,
    postaiPath: (() => {
      if (typeof raw.postaiPath === 'string' && raw.postaiPath.trim()) {
        const p = raw.postaiPath.trim()
        const norm = p.replace(/\//g, '\\')
        if (norm === LEGACY_POSTAI_FILE || norm.toLowerCase().endsWith('\\postai.txt')) {
          return DEFAULT_POSTAI_FILE
        }
        return p
      }
      return d.postaiPath
    })(),
    intervalUnit: raw.intervalUnit === 'seconds' ? 'seconds' : 'minutes',
    minInterval: (() => {
      if (typeof raw.minInterval === 'number' && !Number.isNaN(raw.minInterval)) {
        return raw.minInterval
      }
      if (typeof raw.minIntervalMin === 'number' && !Number.isNaN(raw.minIntervalMin)) {
        return raw.minIntervalMin
      }
      return d.minInterval
    })(),
    maxInterval: (() => {
      if (typeof raw.maxInterval === 'number' && !Number.isNaN(raw.maxInterval)) {
        return raw.maxInterval
      }
      if (typeof raw.maxIntervalMin === 'number' && !Number.isNaN(raw.maxIntervalMin)) {
        return raw.maxIntervalMin
      }
      return d.maxInterval
    })(),
    minIntervalMin: 0,
    maxIntervalMin: 0,
    warmupSec: Math.max(0, Number(raw.warmupSec) || d.warmupSec),
    dailyCap: Math.max(0, Number(raw.dailyCap) || d.dailyCap),
    minTypeDelayMs: Math.max(10, Number(raw.minTypeDelayMs) || d.minTypeDelayMs),
    maxTypeDelayMs: Math.max(20, Number(raw.maxTypeDelayMs) || d.maxTypeDelayMs),
    selectedFriendIds: Array.isArray(raw.selectedFriendIds)
      ? raw.selectedFriendIds.map(String)
      : d.selectedFriendIds,
    shuffleFriends: Boolean(raw.shuffleFriends),
    skipAlreadyMessaged: raw.skipAlreadyMessaged !== false,
    messageIndex: Math.max(0, Number(raw.messageIndex) || 0),
    includeImage:
      typeof raw.includeImage === 'boolean' ? raw.includeImage : gp.includeImage,
    imageEveryMessage: Boolean(raw.imageEveryMessage),
  }
  const minFloor = next.intervalUnit === 'seconds' ? 5 : 1
  next.minInterval = Math.max(minFloor, Number(next.minInterval) || minFloor)
  next.maxInterval = Math.max(minFloor, Number(next.maxInterval) || minFloor)
  if (next.maxInterval < next.minInterval) {
    next.maxInterval = next.minInterval
  }
  next.minIntervalMin =
    next.intervalUnit === 'minutes' ? next.minInterval : Math.max(1, Number(raw.minIntervalMin) || d.minIntervalMin)
  next.maxIntervalMin =
    next.intervalUnit === 'minutes' ? next.maxInterval : Math.max(1, Number(raw.maxIntervalMin) || d.maxIntervalMin)
  if (next.maxIntervalMin < next.minIntervalMin) {
    next.maxIntervalMin = next.minIntervalMin
  }
  if (next.maxTypeDelayMs < next.minTypeDelayMs) {
    next.maxTypeDelayMs = next.minTypeDelayMs
  }
  return next
}

function pickDmOps(s: Partial<FriendDmSettings>): Partial<FriendDmSettings> {
  const out: Partial<FriendDmSettings> = {}
  if (s.intervalUnit !== undefined) out.intervalUnit = s.intervalUnit
  if (s.minInterval !== undefined) out.minInterval = s.minInterval
  if (s.maxInterval !== undefined) out.maxInterval = s.maxInterval
  if (s.minIntervalMin !== undefined) out.minIntervalMin = s.minIntervalMin
  if (s.maxIntervalMin !== undefined) out.maxIntervalMin = s.maxIntervalMin
  if (s.warmupSec !== undefined) out.warmupSec = s.warmupSec
  if (s.dailyCap !== undefined) out.dailyCap = s.dailyCap
  if (s.minTypeDelayMs !== undefined) out.minTypeDelayMs = s.minTypeDelayMs
  if (s.maxTypeDelayMs !== undefined) out.maxTypeDelayMs = s.maxTypeDelayMs
  if (s.selectedFriendIds !== undefined) out.selectedFriendIds = s.selectedFriendIds
  if (s.shuffleFriends !== undefined) out.shuffleFriends = s.shuffleFriends
  if (s.skipAlreadyMessaged !== undefined) out.skipAlreadyMessaged = s.skipAlreadyMessaged
  return out
}

function pickDmContent(s: Partial<FriendDmSettings>): Partial<FriendDmSettings> {
  const out: Partial<FriendDmSettings> = {}
  if (s.message !== undefined) out.message = s.message
  if (s.rotateMessages !== undefined) out.rotateMessages = s.rotateMessages
  if (s.postaiPath !== undefined) out.postaiPath = s.postaiPath
  if (s.messageIndex !== undefined) out.messageIndex = s.messageIndex
  if (s.includeImage !== undefined) out.includeImage = s.includeImage
  if (s.imageEveryMessage !== undefined) out.imageEveryMessage = s.imageEveryMessage
  return out
}

function endFriendDmBrandRun() {
  if (!sharesFacebookAccountWithTavo() || !fs.existsSync(dmContentRestoreFile())) return
  const snap = readJson<Partial<FriendDmSettings>>(dmContentRestoreFile(), {})
  const shared = readJson<Record<string, unknown>>(dmSettingsFile(), {})
  const brand = readJson<Record<string, unknown>>(brandDmSettingsFile(), {})
  writeJson(brandDmSettingsFile(), {
    ...brand,
    messageIndex: Number(shared.messageIndex) || 0,
  })
  writeJson(dmSettingsFile(), {
    ...shared,
    messageIndex: Number(snap.messageIndex) || 0,
  })
  try {
    fs.unlinkSync(dmContentRestoreFile())
  } catch {
    /* ignore */
  }
}

function reclaimFriendDmBrandIfIdle() {
  if (!sharesFacebookAccountWithTavo() || !fs.existsSync(dmContentRestoreFile())) return
  if (getWorkerLock()) return
  endFriendDmBrandRun()
}

function beginFriendDmBrandRun() {
  reclaimFriendDmBrandIfIdle()
  beginFacebookBrandRun()
  if (!sharesFacebookAccountWithTavo() || fs.existsSync(dmContentRestoreFile())) return
  const shared = readJson<Record<string, unknown>>(dmSettingsFile(), {})
  const brand = getFriendDmSettings()
  writeJson(dmContentRestoreFile(), { messageIndex: Number(shared.messageIndex) || 0 })
  writeJson(dmSettingsFile(), { ...shared, messageIndex: brand.messageIndex })
}

function finishFriendDmBrandRun() {
  endFriendDmBrandRun()
  endFacebookBrandRun()
}

function emptyDmRun(): FriendDmRun {
  const t = nowIso()
  return {
    id: '',
    mode: null,
    status: 'idle',
    createdAt: t,
    updatedAt: t,
    sent: 0,
    failed: 0,
    total: 0,
    currentFriend: null,
    messageIndex: 0,
  }
}

function loadDmRun(): FriendDmRun {
  const raw = readJson<Partial<FriendDmRun>>(dmCurrentFile(), emptyDmRun())
  return { ...emptyDmRun(), ...raw }
}

function saveDmRun(run: FriendDmRun) {
  writeJson(dmCurrentFile(), { ...run, updatedAt: nowIso() })
}

function writeDmControl(partial: Record<string, unknown>) {
  const prev = readJson<Record<string, unknown>>(dmControlFile(), {
    paused: false,
    abort: false,
    continueLogin: false,
    showBrowser: false,
  })
  writeJson(dmControlFile(), { ...prev, ...partial })
}

function appendDmHubLog(kind: string, message: string) {
  ensureDmDir()
  const profile = currentBusinessProfile()
  const entry = { at: nowIso(), kind, message, profileId: profile.id, profileName: profile.name }
  fs.appendFileSync(dmLogFile(), `${JSON.stringify(entry)}\n`, 'utf8')
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
    default:
      return 'idle'
  }
}

function syncDmRunFromWorkerFiles(run: FriendDmRun): FriendDmRun {
  const status = readJson<Record<string, unknown>>(dmStatusFile(), {})
  const next: FriendDmRun = { ...run }
  if (status && typeof status === 'object') {
    if (typeof status.status === 'string') next.status = mapWorkerStatus(status.status)
    if (typeof status.message === 'string') next.message = status.message
    if (typeof status.error === 'string') next.error = status.error
    if (typeof status.sent === 'number') next.sent = status.sent
    if (typeof status.failed === 'number') next.failed = status.failed
    if (typeof status.skipped === 'number') next.skipped = status.skipped
    if (typeof status.total === 'number') next.total = status.total
    if (typeof status.messageIndex === 'number') next.messageIndex = status.messageIndex
    if (status.currentFriend === null || typeof status.currentFriend === 'string') {
      next.currentFriend = status.currentFriend as string | null
    }
    const statusMsg = typeof status.message === 'string' ? status.message : ''
    const waitingInMsg = /\b(waiting|warm-up|short wait)\b/i.test(statusMsg)
    if ('waitEndsAt' in status) {
      if (status.waitEndsAt === null) next.waitEndsAt = null
      else if (typeof status.waitEndsAt === 'string') next.waitEndsAt = status.waitEndsAt
    } else if (!waitingInMsg) {
      next.waitEndsAt = null
    }
    if ('waitLabel' in status) {
      if (status.waitLabel === null) next.waitLabel = null
      else if (typeof status.waitLabel === 'string') next.waitLabel = status.waitLabel
    } else if (!waitingInMsg) {
      next.waitLabel = null
    }
    if (typeof status.updatedAt === 'string') next.updatedAt = status.updatedAt
    else next.updatedAt = nowIso()
  }
  const alive = isFriendDmWorkerRunning()
  if (!alive && (next.status === 'running' || next.status === 'waiting_login' || next.status === 'paused')) {
    const st = readJson<Record<string, unknown>>(dmStatusFile(), {})
    if (st.status !== 'done' && st.status !== 'error') {
      next.status = 'error'
      next.message = next.message || 'Worker exited unexpectedly'
    }
  }
  return next
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

export function isFriendDmWorkerRunning(): boolean {
  if (dmWorkerChild() && !dmWorkerChild()!.killed && dmWorkerChild()!.exitCode == null) return true
  const lock = getWorkerLock()
  return Boolean(lock && (lock.mode === 'dm-friends' || lock.mode === 'refresh-friends'))
}

function killDmWorker() {
  if (dmWorkerChild() && !dmWorkerChild()!.killed) {
    try {
      dmWorkerChild()!.kill()
    } catch {
      /* ignore */
    }
  }
  setDmWorkerChild(null)
}

export function killFriendDmWorker() {
  killDmWorker()
}

export function prepareFriendDmLoginClear() {
  writeDmControl({ abort: true, clearLoginSession: true })
}

export function resetFriendDmControlFlags() {
  writeDmControl({
    paused: false,
    abort: false,
    continueLogin: false,
    showBrowser: false,
    clearLoginSession: false,
  })
}

export function resetFriendDmAfterLoginClear() {
  const run = loadDmRun()
  if (run.status === 'waiting_login' || run.status === 'running' || run.status === 'paused') {
    run.status = 'idle'
    run.message = 'Login session cleared — start again to sign in'
    run.waitEndsAt = undefined
    run.waitLabel = undefined
    saveDmRun(run)
  }
  idleFriendDmWorkerState()
  resetFriendDmControlFlags()
}

export function getFriends(): FbFriend[] {
  const raw = readJson<unknown>(dmFriendsFile(), [])
  if (!Array.isArray(raw)) return []
  const out: FbFriend[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const id = typeof o.id === 'string' ? o.id : ''
    if (!id) continue
    out.push({
      id,
      name: typeof o.name === 'string' ? o.name : id,
      url: typeof o.url === 'string' ? o.url : `https://www.facebook.com/${id}`,
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

function getSentIds(): string[] {
  const raw = readJson<{ ids?: unknown }>(dmSentFile(), { ids: [] })
  if (!Array.isArray(raw.ids)) return []
  return [...new Set(raw.ids.map((x) => String(x || '').trim()).filter(Boolean))]
}

export function getFriendDmLog(limit = 80): GroupPosterLogEntry[] {
  ensureDmDir()
  if (!fs.existsSync(dmLogFile())) return []
  try {
    const lines = readLastNonEmptyLines(dmLogFile(), Math.min(MAX_LOG, Math.max(20, limit)))
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

export function getFriendDmSettings(): FriendDmSettings {
  ensureDmDir()
  reclaimFriendDmBrandIfIdle()
  const shared = normalizeDmSettings(readJson(dmSettingsFile(), defaultDmSettings()))
  if (!sharesFacebookAccountWithTavo()) return shared
  const brandRaw = readJson<Partial<FriendDmSettings>>(brandDmSettingsFile(), {})
  const content = { ...pickDmContent(defaultDmSettings()), ...pickDmContent(brandRaw) }
  const merged = normalizeDmSettings({ ...shared, ...content })
  if (fs.existsSync(dmContentRestoreFile())) {
    merged.messageIndex = Math.max(0, Number(shared.messageIndex) || 0)
  }
  return merged
}

function resolvePostaiFile(settings?: Partial<FriendDmSettings>): string {
  const raw = (settings?.postaiPath ?? getFriendDmSettings().postaiPath ?? '').trim()
  if (!raw) return DEFAULT_POSTAI_FILE
  const norm = raw.replace(/\//g, '\\')
  if (norm === LEGACY_POSTAI_FILE || norm.toLowerCase().endsWith('\\postai.txt')) {
    return DEFAULT_POSTAI_FILE
  }
  return raw
}

function migrateLegacyMessagesIfNeeded(settings?: Partial<FriendDmSettings>) {
  if (sharesFacebookAccountWithTavo()) return
  ensureDmDir()
  try {
    if (fs.existsSync(dmMessagesFile()) && fs.readFileSync(dmMessagesFile(), 'utf8').trim()) {
      return
    }
    const legacy = resolvePostaiFile(settings)
    if (!fs.existsSync(legacy)) return
    const text = fs.readFileSync(legacy, 'utf8')
    if (!text.trim()) return
    fs.writeFileSync(dmMessagesFile(), text, 'utf8')
  } catch {
    /* ignore */
  }
}

function resolveDmMessagesFile(): string {
  return dmMessagesFile()
}

/** Split saved DM text into individual messages (paragraphs or lines). */
export function splitDmMessages(text: string): string[] {
  const trimmed = (text || '').trim()
  if (!trimmed) return []
  const blocks = trimmed
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
  if (blocks.length > 1) return blocks
  return trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
}

export function countDmMessages(text: string): number {
  return splitDmMessages(text).length
}

export function getPostaiMessages(settings?: Partial<FriendDmSettings>): string {
  migrateLegacyMessagesIfNeeded(settings)
  try {
    if (fs.existsSync(dmMessagesFile())) {
      return fs.readFileSync(dmMessagesFile(), 'utf8')
    }
  } catch {
    /* ignore */
  }
  return ''
}

export function savePostaiMessages(text: string): {
  ok: boolean
  message: string
  messages: string
  count: number
  path: string
} {
  const file = resolveDmMessagesFile()
  const body = typeof text === 'string' ? text : ''
  try {
    ensureDmDir()
    fs.writeFileSync(file, body, 'utf8')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, message: `Could not save messages: ${msg}`, messages: body, count: 0, path: file }
  }
  const count = countDmMessages(body)
  return {
    ok: true,
    message: count ? `Saved ${count} message${count === 1 ? '' : 's'}` : 'Saved (empty)',
    messages: body,
    count,
    path: file,
  }
}

export function saveFriendDmSettings(
  partial: Partial<FriendDmSettings>,
): { ok: boolean; message: string; settings: FriendDmSettings } {
  ensureDmDir()
  const next = normalizeDmSettings({ ...getFriendDmSettings(), ...partial })
  if (sharesFacebookAccountWithTavo()) {
    const sharedRaw = readJson<Record<string, unknown>>(dmSettingsFile(), {})
    const live = fs.existsSync(dmContentRestoreFile())
    writeJson(dmSettingsFile(), {
      ...sharedRaw,
      ...pickDmOps(next),
      ...(live ? { messageIndex: next.messageIndex } : {}),
    })
    const brandRaw = readJson<Record<string, unknown>>(brandDmSettingsFile(), {})
    writeJson(brandDmSettingsFile(), { ...brandRaw, ...pickDmContent(next) })
  } else {
    writeJson(dmSettingsFile(), next)
  }
  return { ok: true, message: 'DM settings saved', settings: next }
}

export function saveFriendDmMessages(text: string): {
  ok: boolean
  message: string
  count: number
} {
  const saved = savePostaiMessages(text)
  return { ok: saved.ok, message: saved.message, count: saved.count }
}

export function clearFriendDmSent(): { ok: boolean; message: string } {
  ensureDmDir()
  writeJson(dmSentFile(), { ids: [], updatedAt: nowIso() })
  return { ok: true, message: 'Sent history cleared — friends can be messaged again' }
}

export function clearFriendDmLog(): { ok: boolean; message: string } {
  ensureDmDir()
  fs.writeFileSync(dmLogFile(), '', 'utf8')
  return { ok: true, message: 'DM log cleared' }
}

export function getFriendDmState(opts?: { light?: boolean }): FriendDmState {
  ensureDmDir()
  void opts
  const settings = getFriendDmSettings()
  let run = loadDmRun()
  run = syncDmRunFromWorkerFiles(run)
  if (run.id) saveDmRun(run)
  const messages = getPostaiMessages(settings)
  const messageLines = splitDmMessages(messages)
  const gp = getGroupPosterSettings()
  const secrets = readDmSecrets()
  const imgCounts = countImagesByGender(gp)
  const alive = isFriendDmWorkerRunning()
  return {
    ok: true,
    settings,
    run,
    friends: getFriends(),
    messages,
    messagesCount: messageLines.length,
    sentIds: getSentIds(),
    log: getFriendDmLog(80),
    workerRunning: alive,
    workerPid: alive && dmWorkerChild()?.pid ? dmWorkerChild()!.pid : undefined,
    includeText: true,
    includeImage: settings.includeImage,
    imagesDir: gp.imagesDir,
    loginEmail: gp.loginEmail,
    autoLogin: gp.autoLogin,
    hasLoginPassword: Boolean(secrets.loginPassword.trim()),
    loginPassword: secrets.loginPassword,
    ...imgCounts,
  }
}

function spawnDmWorker(mode: 'dm-friends' | 'refresh-friends'): { ok: boolean; message: string } {
  if (!fs.existsSync(WORKER_SCRIPT)) {
    return { ok: false, message: `Worker missing: ${WORKER_SCRIPT}` }
  }
  const lock = getWorkerLock()
  if (lock) {
    if (lock.mode === 'post' || lock.mode === 'refresh-groups') {
      return { ok: false, message: 'Group poster worker is running — abort it first' }
    }
    if (lock.mode === 'share-profile') {
      return { ok: false, message: 'Profile share worker is running — abort it first' }
    }
    if (lock.mode !== 'dm-friends' && lock.mode !== 'refresh-friends') {
      return { ok: false, message: 'Another worker is running — abort first' }
    }
  }
  if (isGroupPosterWorkerRunning()) {
    return { ok: false, message: 'Group poster worker is running — abort it first' }
  }
  if (isFriendDmWorkerRunning()) {
    return { ok: false, message: 'DM worker already running — abort first' }
  }

  ensureDmDir()
  beginFriendDmBrandRun()
  idleGroupPosterWorkerState()
  idleProfileShareWorkerState()
  const gpCurrentPath = path.join(gpDir(), 'current.json')
  const gpRun = readJson<Record<string, unknown>>(gpCurrentPath, {})
  if (
    gpRun &&
    (gpRun.status === 'running' || gpRun.status === 'waiting_login' || gpRun.status === 'paused')
  ) {
    writeJson(gpCurrentPath, {
      ...gpRun,
      status: 'idle',
      message: 'Idle',
      currentGroup: null,
      updatedAt: nowIso(),
    })
  }
  writeDmControl({ paused: false, abort: false, continueLogin: false, showBrowser: false })
  writeJson(dmStatusFile(), {
    status: 'running',
    message: mode === 'refresh-friends' ? 'Starting friend refresh…' : 'Starting…',
    mode,
    sent: 0,
    failed: 0,
    updatedAt: nowIso(),
  })

  const py = resolvePython(WORKER_DIR)
  const browserProfileDir = ensureBrowserSessionDir(
    'facebook',
    path.join(WORKER_DIR, 'browser_profile'),
  )
  const child = spawn(py, [WORKER_SCRIPT, '--data-dir', dmDir(), '--mode', mode], {
    cwd: WORKER_DIR,
    windowsHide: false,
    env: {
      ...process.env,
      TOOLSAI_BROWSER_PROFILE_DIR: browserProfileDir,
    },
  })
  setDmWorkerChild(child)
  if (child.pid) writeWorkerLock(mode, child.pid, dmDir())

  attachWorkerOutput(child, (kind, message, event) => {
    // Structured events are already durably written by the Python worker.
    if (!event) appendDmHubLog(kind, message)
  })
  child.on('error', bindCurrentProfile((error) => {
    if (dmWorkerChild() !== child) return
    appendDmHubLog('error', `DM worker could not start: ${error.message}`)
    writeJson(dmStatusFile(), { status: 'error', error: 'worker_spawn_failed', message: error.message, updatedAt: nowIso() })
  }))
  child.on('close', bindCurrentProfile((code) => {
    if (child.pid) clearWorkerLock(child.pid)
    if (dmWorkerChild() !== child) return
    setDmWorkerChild(null)
    finishFriendDmBrandRun()
    appendDmHubLog('info', `DM worker exited (code ${code ?? '?'})`)
    const run = loadDmRun()
    const synced = syncDmRunFromWorkerFiles(run)
    if (synced.status === 'running' || synced.status === 'waiting_login' || synced.status === 'paused') {
      synced.status = code === 0 ? 'done' : 'error'
      synced.message = code === 0 ? 'Worker finished' : `Worker exited with code ${code}`
    }
    saveDmRun(synced)
  }))

  return {
    ok: true,
    message: mode === 'refresh-friends' ? 'Refreshing friends…' : 'Friend DM run started',
  }
}

function buildDmRunConfig(settings: FriendDmSettings, extra?: Record<string, unknown>) {
  const gp = getGroupPosterSettings()
  const secrets = readDmSecrets()
  migrateLegacyMessagesIfNeeded(settings)
  return {
    ...settings,
    messagesPath: resolveDmMessagesFile(),
    includeText: true,
    includeImage: settings.includeImage,
    rotateImages: gp.rotateImages,
    imagesDir: gp.imagesDir,
    imagePaths: gp.imagePaths,
    imageIndexVyras: gp.imageIndexVyras,
    imageIndexMoteris: gp.imageIndexMoteris,
    loginEmail: gp.loginEmail,
    loginPassword: secrets.loginPassword,
    autoLogin: gp.autoLogin,
    ...extra,
  }
}

export function refreshFriendDmFriends(): {
  ok: boolean
  message: string
  state?: FriendDmState
} {
  const runId = `dm-${Date.now()}`
  saveDmRun({
    ...emptyDmRun(),
    id: runId,
    mode: 'refresh-friends',
    status: 'running',
    message: 'Refreshing friends…',
  })
  writeJson(dmRunConfigFile(), buildDmRunConfig(getFriendDmSettings()))
  const spawned = spawnDmWorker('refresh-friends')
  if (!spawned.ok) return spawned
  return { ok: true, message: spawned.message, state: getFriendDmState() }
}

export function startFriendDms(
  partial?: Partial<FriendDmSettings>,
): { ok: boolean; message: string; state?: FriendDmState } {
  if (partial && Object.keys(partial).length) {
    saveFriendDmSettings(partial)
  }
  const settings = getFriendDmSettings()
  const friends = getFriends()
  if (!friends.length) {
    return { ok: false, message: 'No friends loaded — click Refresh friends first' }
  }

  const gp = getGroupPosterSettings()
  const postaiLines = splitDmMessages(getPostaiMessages(settings))
  const hasText = postaiLines.length > 0
  if (!settings.includeImage && !hasText) {
    return {
      ok: false,
      message: 'Add messages in the box and click Save, or enable Image',
    }
  }
  if (settings.includeImage) {
    const counts = countImagesByGender(gp)
    if (counts.imagesVyrasCount + counts.imagesMoterisCount === 0) {
      return {
        ok: false,
        message: 'Image enabled but no VYRAS/MOTERIS files in the images folder (Groups tab)',
      }
    }
  }

  const ids = settings.selectedFriendIds.length
    ? settings.selectedFriendIds
    : friends.map((f) => f.id)
  const sent = new Set(getSentIds())
  const selected = friends.filter(
    (f) => ids.includes(f.id) && (!settings.skipAlreadyMessaged || !sent.has(f.id)),
  )
  if (!selected.length) {
    return { ok: false, message: 'No friends selected' }
  }

  const runId = `dm-${Date.now()}`
  saveDmRun({
    ...emptyDmRun(),
    id: runId,
    mode: 'dm-friends',
    status: 'running',
    message: 'Starting…',
    total: selected.length,
  })

  writeJson(dmRunConfigFile(), buildDmRunConfig(settings, { selectedFriends: selected }))
  const spawned = spawnDmWorker('dm-friends')
  if (!spawned.ok) return spawned
  return { ok: true, message: spawned.message, state: getFriendDmState() }
}

export function pauseFriendDms(): { ok: boolean; message: string } {
  writeDmControl({ paused: true })
  const run = loadDmRun()
  run.status = 'paused'
  run.message = 'Paused'
  saveDmRun(run)
  return { ok: true, message: 'Paused' }
}

export function resumeFriendDms(): { ok: boolean; message: string } {
  writeDmControl({ paused: false })
  const run = loadDmRun()
  if (run.status === 'paused') {
    run.status = 'running'
    run.message = 'Resumed'
    saveDmRun(run)
  }
  return { ok: true, message: 'Resumed' }
}

export function abortFriendDms(): { ok: boolean; message: string } {
  writeDmControl({ abort: true, paused: false })
  const abortedChild = dmWorkerChild()
  const abortTimer = setTimeout(bindCurrentProfile(() => {
    if (abortedChild && dmWorkerChild() === abortedChild) killDmWorker()
  }), 1500)
  abortTimer.unref()
  abortedChild?.once('close', () => clearTimeout(abortTimer))
  const run = loadDmRun()
  run.status = 'error'
  run.message = 'Aborted'
  run.error = 'aborted'
  writeJson(dmStatusFile(), { status: 'error', message: 'Aborted', error: 'aborted', waitEndsAt: null, waitLabel: null, updatedAt: nowIso() })
  saveDmRun(run)
  return { ok: true, message: 'Abort sent' }
}

export function clearFriendDmRun(): { ok: boolean; message: string; state: FriendDmState } {
  if (dmWorkerChild() && !dmWorkerChild()!.killed) {
    const pid = dmWorkerChild()!.pid
    writeDmControl({ abort: true })
    killDmWorker()
    if (pid) clearWorkerLock(pid)
  } else {
    const lock = getWorkerLock()
    if (lock && (lock.mode === 'dm-friends' || lock.mode === 'refresh-friends')) {
      return { ok: false, message: 'DM worker still owns the session — abort it first', state: getFriendDmState() }
    }
  }
  saveDmRun(emptyDmRun())
  idleFriendDmWorkerState()
  writeDmControl({ paused: false, abort: false, continueLogin: false, showBrowser: false })
  return { ok: true, message: 'Run cleared', state: getFriendDmState() }
}

export function continueFriendDmLogin(): { ok: boolean; message: string } {
  writeDmControl({ continueLogin: true })
  return { ok: true, message: 'Continue sent — worker will proceed' }
}

export function showFriendDmBrowser(): { ok: boolean; message: string } {
  writeDmControl({ showBrowser: true })
  return { ok: true, message: 'Chrome will move on-screen within ~1s (if the worker is running)' }
}
