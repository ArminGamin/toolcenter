/**
 * Share a profile post onto friends' profiles — same worker + Chrome as Group Poster.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { loadVault, TOOLSAI_ROOT } from './cc-services.js'
import {
  bindCurrentProfile,
  currentBusinessProfile,
  profileDataPath,
} from './business-profiles.js'
import { ensureBrowserSessionDir } from './browser-sessions.js'
import {
  facebookAccountDataDir,
  facebookAccountProfileId,
  withFacebookAccount,
} from './facebook-account-store.js'
import { getFriends, isFriendDmWorkerRunning, type FbFriend } from './group-poster-dms.js'
import { readLastNonEmptyLines } from './log-tail.js'
import {
  clearWorkerLock,
  getGroupPosterSettings,
  getWorkerLock,
  idleFriendDmWorkerState,
  idleGroupPosterWorkerState,
  idleProfileShareWorkerState,
  isGroupPosterWorkerRunning,
  writeJsonRobust,
  writeWorkerLock,
  type GroupPosterLogEntry,
  type GroupPosterStatus,
} from './group-poster.js'

const gpDir = () => profileDataPath('group-poster')
const shareDir = () => path.join(gpDir(), 'profile-share')
const settingsFile = () => path.join(shareDir(), 'settings.json')
const statusFile = () => path.join(shareDir(), 'status.json')
const controlFile = () => path.join(shareDir(), 'control.json')
const logFile = () => path.join(shareDir(), 'log.jsonl')
const currentFile = () => path.join(shareDir(), 'current.json')
const runConfigFile = () => path.join(shareDir(), 'run-config.json')
const sentFile = () => path.join(shareDir(), 'sent.json')
const WORKER_DIR = path.join(TOOLSAI_ROOT, 'facebook-group-poster')
const WORKER_SCRIPT = path.join(WORKER_DIR, 'worker.py')
const GP_SECRETS_KEY = 'GROUP_POSTER_SECRETS'
const MAX_LOG = 500

const shareWorkerChildren = new Map<string, ChildProcess>()
const shareWorkerChild = () => shareWorkerChildren.get(facebookAccountProfileId()) || null
const setShareWorkerChild = (child: ChildProcess | null) => {
  const id = facebookAccountProfileId()
  if (child) shareWorkerChildren.set(id, child)
  else shareWorkerChildren.delete(id)
}

export type IntervalUnit = 'minutes' | 'seconds'

export type ProfileShareSettings = {
  postUrl: string
  shareMessage: string
  intervalUnit: IntervalUnit
  minInterval: number
  maxInterval: number
  minIntervalMin: number
  maxIntervalMin: number
  warmupSec: number
  dailyCap: number
  selectedFriendIds: string[]
  shuffleFriends: boolean
  skipAlreadyShared: boolean
}

export type ProfileShareRun = {
  id: string
  mode: 'share-profile' | null
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
  waitEndsAt?: string | null
  waitLabel?: string | null
}

export type ProfileShareState = {
  ok: boolean
  settings: ProfileShareSettings
  run: ProfileShareRun
  friends: FbFriend[]
  sentIds: string[]
  log: GroupPosterLogEntry[]
  workerRunning: boolean
  workerPid?: number
  loginEmail?: string
  autoLogin?: boolean
}

function nowIso() {
  return new Date().toISOString()
}

function ensureShareDir() {
  fs.mkdirSync(shareDir(), { recursive: true })
}

function readJson<T>(file: string, fallback: T): T {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')) as T
  } catch {
    /* ignore */
  }
  return fallback
}

function writeJson(file: string, data: unknown) {
  writeJsonRobust(file, data)
}

function defaultSettings(): ProfileShareSettings {
  return {
    postUrl: '',
    shareMessage: '',
    intervalUnit: 'minutes',
    minInterval: 1,
    maxInterval: 2,
    minIntervalMin: 1,
    maxIntervalMin: 2,
    warmupSec: 15,
    dailyCap: 50,
    selectedFriendIds: [],
    shuffleFriends: false,
    skipAlreadyShared: true,
  }
}

function normalizeSettings(raw: Partial<ProfileShareSettings> | null | undefined): ProfileShareSettings {
  const d = defaultSettings()
  const src = raw && typeof raw === 'object' ? raw : {}
  const unit = src.intervalUnit === 'seconds' ? 'seconds' : 'minutes'
  const minInterval = Math.max(unit === 'seconds' ? 5 : 1, Number(src.minInterval) || d.minInterval)
  const maxInterval = Math.max(minInterval, Number(src.maxInterval) || d.maxInterval)
  return {
    postUrl: typeof src.postUrl === 'string' ? src.postUrl.trim() : d.postUrl,
    shareMessage: typeof src.shareMessage === 'string' ? src.shareMessage : d.shareMessage,
    intervalUnit: unit,
    minInterval,
    maxInterval,
    minIntervalMin: unit === 'minutes' ? minInterval : d.minIntervalMin,
    maxIntervalMin: unit === 'minutes' ? maxInterval : d.maxIntervalMin,
    warmupSec: Math.max(0, Number(src.warmupSec) || 0),
    dailyCap: Math.max(0, Number(src.dailyCap) || 0),
    selectedFriendIds: Array.isArray(src.selectedFriendIds)
      ? src.selectedFriendIds.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
      : [],
    shuffleFriends: Boolean(src.shuffleFriends),
    skipAlreadyShared: src.skipAlreadyShared !== false,
  }
}

function emptyRun(): ProfileShareRun {
  const t = nowIso()
  return {
    id: '',
    mode: null,
    status: 'idle',
    createdAt: t,
    updatedAt: t,
    sent: 0,
    failed: 0,
    skipped: 0,
    total: 0,
  }
}

function loadRun(): ProfileShareRun {
  const raw = readJson<Partial<ProfileShareRun>>(currentFile(), emptyRun())
  return {
    ...emptyRun(),
    ...raw,
    status: (raw.status as GroupPosterStatus) || 'idle',
    sent: Number(raw.sent) || 0,
    failed: Number(raw.failed) || 0,
    skipped: Number(raw.skipped) || 0,
    total: Number(raw.total) || 0,
  }
}

function saveRun(run: ProfileShareRun) {
  writeJson(currentFile(), { ...run, updatedAt: nowIso() })
}

function writeShareControl(partial: Record<string, unknown>) {
  ensureShareDir()
  const prev = readJson<Record<string, unknown>>(controlFile(), {})
  writeJson(controlFile(), { ...prev, ...partial })
}

function getSentIds(): string[] {
  const raw = readJson<{ ids?: unknown }>(sentFile(), { ids: [] })
  if (!Array.isArray(raw.ids)) return []
  return [...new Set(raw.ids.map((x) => String(x || '').trim()).filter(Boolean))]
}

function getShareLog(limit = 80): GroupPosterLogEntry[] {
  ensureShareDir()
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

function appendShareHubLog(kind: string, message: string) {
  ensureShareDir()
  const profile = currentBusinessProfile()
  const entry = { at: nowIso(), kind, message, profileId: profile.id, profileName: profile.name }
  fs.appendFileSync(logFile(), `${JSON.stringify(entry)}\n`, 'utf8')
}

function syncRunFromWorker(run: ProfileShareRun): ProfileShareRun {
  const st = readJson<Record<string, unknown>>(statusFile(), {})
  const next = { ...run }
  if (typeof st.status === 'string') next.status = st.status as GroupPosterStatus
  if (typeof st.message === 'string') next.message = st.message
  if (typeof st.error === 'string') next.error = st.error
  if (typeof st.sent === 'number') next.sent = st.sent
  if (typeof st.failed === 'number') next.failed = st.failed
  if (typeof st.skipped === 'number') next.skipped = st.skipped
  if (typeof st.total === 'number') next.total = st.total
  if (typeof st.currentFriend === 'string' || st.currentFriend === null) {
    next.currentFriend = (st.currentFriend as string | null) ?? null
  }
  if (typeof st.waitEndsAt === 'string' || st.waitEndsAt === null) {
    next.waitEndsAt = (st.waitEndsAt as string | null) ?? null
  }
  if (typeof st.waitLabel === 'string' || st.waitLabel === null) {
    next.waitLabel = (st.waitLabel as string | null) ?? null
  }
  const alive = isProfileShareWorkerRunning()
  if (
    !alive &&
    (next.status === 'running' || next.status === 'waiting_login' || next.status === 'paused')
  ) {
    if (st.status !== 'done' && st.status !== 'error') {
      next.status = 'error'
      next.message = next.message || 'Worker exited unexpectedly'
    }
  }
  return next
}

export function isProfileShareWorkerRunning(): boolean {
  if (shareWorkerChild() && !shareWorkerChild()!.killed && shareWorkerChild()!.exitCode == null) return true
  const lock = getWorkerLock()
  return Boolean(lock && lock.mode === 'share-profile')
}

export function getProfileShareSettings(): ProfileShareSettings {
  ensureShareDir()
  return normalizeSettings(readJson(settingsFile(), defaultSettings()))
}

export function saveProfileShareSettings(
  partial: Partial<ProfileShareSettings>,
): { ok: boolean; message: string; settings: ProfileShareSettings } {
  ensureShareDir()
  const next = normalizeSettings({ ...getProfileShareSettings(), ...partial })
  writeJson(settingsFile(), next)
  return { ok: true, message: 'Share settings saved', settings: next }
}

export function getProfileShareState(): ProfileShareState {
  ensureShareDir()
  let run = loadRun()
  run = syncRunFromWorker(run)
  if (run.id) saveRun(run)
  const gp = getGroupPosterSettings()
  const alive = isProfileShareWorkerRunning()
  return {
    ok: true,
    settings: getProfileShareSettings(),
    run,
    friends: getFriends(),
    sentIds: getSentIds(),
    log: getShareLog(80),
    workerRunning: alive,
    workerPid: alive && shareWorkerChild()?.pid ? shareWorkerChild()!.pid : undefined,
    loginEmail: gp.loginEmail,
    autoLogin: gp.autoLogin,
  }
}

function spawnShareWorker(): { ok: boolean; message: string } {
  if (!fs.existsSync(WORKER_SCRIPT)) {
    return { ok: false, message: `Worker missing: ${WORKER_SCRIPT}` }
  }
  const lock = getWorkerLock()
  if (lock) {
    if (lock.mode === 'share-profile') {
      return { ok: false, message: 'Profile share already running — abort first' }
    }
    return { ok: false, message: 'Another Facebook worker is running — abort it first' }
  }
  if (isGroupPosterWorkerRunning()) {
    return { ok: false, message: 'Group poster worker is running — abort it first' }
  }
  if (isFriendDmWorkerRunning()) {
    return { ok: false, message: 'Friend DM worker is running — abort it first' }
  }
  if (isProfileShareWorkerRunning()) {
    return { ok: false, message: 'Profile share already running — abort first' }
  }

  ensureShareDir()
  idleGroupPosterWorkerState()
  idleFriendDmWorkerState()
  writeShareControl({ paused: false, abort: false, continueLogin: false, showBrowser: false })
  writeJson(statusFile(), {
    status: 'running',
    message: 'Starting…',
    mode: 'share-profile',
    sent: 0,
    failed: 0,
    updatedAt: nowIso(),
  })

  const py = resolvePython(WORKER_DIR)
  const browserProfileDir = ensureBrowserSessionDir(
    'facebook',
    path.join(WORKER_DIR, 'browser_profile'),
  )
  const child = spawn(py, [WORKER_SCRIPT, '--data-dir', shareDir(), '--mode', 'share-profile'], {
    cwd: WORKER_DIR,
    windowsHide: false,
    env: {
      ...process.env,
      TOOLSAI_BROWSER_PROFILE_DIR: browserProfileDir,
    },
  })
  setShareWorkerChild(child)
  if (child.pid) writeWorkerLock('share-profile', child.pid, shareDir())

  child.stdout?.on('data', (buf: Buffer) => {
    const t = buf.toString('utf8').trim()
    if (t) appendShareHubLog('info', t.slice(0, 400))
  })
  child.stderr?.on('data', (buf: Buffer) => {
    const t = buf.toString('utf8').trim()
    if (t) appendShareHubLog('error', t.slice(0, 400))
  })
  child.on('close', bindCurrentProfile((code) => {
    if (child.pid) clearWorkerLock(child.pid)
    if (shareWorkerChild() === child) setShareWorkerChild(null)
    appendShareHubLog('info', `Share worker exited (code ${code ?? '?'})`)
    const synced = syncRunFromWorker(loadRun())
    if (synced.status === 'running' || synced.status === 'waiting_login' || synced.status === 'paused') {
      synced.status = code === 0 ? 'done' : 'error'
      synced.message = code === 0 ? 'Worker finished' : `Worker exited with code ${code}`
    }
    saveRun(synced)
  }))

  return { ok: true, message: 'Profile share started' }
}

function readGpSecrets(): { loginPassword: string } {
  return withFacebookAccount(() => {
    const raw = loadVault()[GP_SECRETS_KEY]
    if (!raw) return { loginPassword: '' }
    try {
      const parsed = JSON.parse(raw) as { loginPassword?: string }
      return { loginPassword: typeof parsed.loginPassword === 'string' ? parsed.loginPassword : '' }
    } catch {
      return { loginPassword: '' }
    }
  })
}

export function startProfileShare(
  partial?: Partial<ProfileShareSettings>,
): { ok: boolean; message: string; state?: ProfileShareState } {
  if (partial && Object.keys(partial).length) {
    saveProfileShareSettings(partial)
  }
  const settings = getProfileShareSettings()
  const friends = getFriends()
  if (!friends.length) {
    return { ok: false, message: 'No friends loaded — refresh friends on the Friend DMs tab first' }
  }
  const ids = settings.selectedFriendIds.length
    ? settings.selectedFriendIds
    : friends.map((f) => f.id)
  const selected = friends.filter((f) => ids.includes(f.id))
  if (!selected.length) {
    return { ok: false, message: 'No friends selected' }
  }

  const gp = getGroupPosterSettings()
  const secrets = readGpSecrets()
  const runId = `share-${Date.now()}`
  saveRun({
    ...emptyRun(),
    id: runId,
    mode: 'share-profile',
    status: 'running',
    message: 'Starting…',
    total: selected.length,
  })
  writeJson(runConfigFile(), {
    ...settings,
    selectedFriends: selected,
    friendsPath: path.join(facebookAccountDataDir('group-poster', 'friend-dms'), 'friends.json'),
    loginEmail: gp.loginEmail,
    loginPassword: secrets.loginPassword,
    autoLogin: gp.autoLogin,
  })
  const spawned = spawnShareWorker()
  if (!spawned.ok) return spawned
  return { ok: true, message: spawned.message, state: getProfileShareState() }
}

export function pauseProfileShare(): { ok: boolean; message: string } {
  writeShareControl({ paused: true })
  const run = loadRun()
  run.status = 'paused'
  run.message = 'Paused'
  saveRun(run)
  return { ok: true, message: 'Paused' }
}

export function resumeProfileShare(): { ok: boolean; message: string } {
  writeShareControl({ paused: false })
  const run = loadRun()
  if (run.status === 'paused') {
    run.status = 'running'
    run.message = 'Resumed'
    saveRun(run)
  }
  return { ok: true, message: 'Resumed' }
}

export function abortProfileShare(): { ok: boolean; message: string } {
  writeShareControl({ abort: true, paused: false })
  setTimeout(bindCurrentProfile(() => {
    if (shareWorkerChild() && !shareWorkerChild()!.killed) {
      try {
        shareWorkerChild()!.kill()
      } catch {
        /* ignore */
      }
    }
    setShareWorkerChild(null)
  }), 1500)
  const run = loadRun()
  run.status = 'error'
  run.message = 'Aborted'
  run.error = 'aborted'
  saveRun(run)
  return { ok: true, message: 'Abort sent' }
}

export function clearProfileShareRun(): { ok: boolean; message: string; state: ProfileShareState } {
  if (shareWorkerChild() && !shareWorkerChild()!.killed) {
    const pid = shareWorkerChild()!.pid
    writeShareControl({ abort: true })
    try {
      shareWorkerChild()!.kill()
    } catch {
      /* ignore */
    }
    setShareWorkerChild(null)
    if (pid) clearWorkerLock(pid)
  } else {
    clearWorkerLock()
  }
  saveRun(emptyRun())
  idleProfileShareWorkerState()
  writeShareControl({ paused: false, abort: false, continueLogin: false, showBrowser: false })
  return { ok: true, message: 'Run cleared', state: getProfileShareState() }
}

export function clearProfileShareSent(): { ok: boolean; message: string } {
  ensureShareDir()
  writeJson(sentFile(), { ids: [], updatedAt: nowIso() })
  return { ok: true, message: 'Shared history cleared' }
}

export function clearProfileShareLog(): { ok: boolean; message: string } {
  ensureShareDir()
  fs.writeFileSync(logFile(), '', 'utf8')
  return { ok: true, message: 'Share log cleared' }
}

export function continueProfileShareLogin(): { ok: boolean; message: string } {
  writeShareControl({ continueLogin: true })
  return { ok: true, message: 'Continue sent — worker will proceed' }
}

export function showProfileShareBrowser(): { ok: boolean; message: string } {
  writeShareControl({ showBrowser: true })
  return { ok: true, message: 'Chrome will move on-screen within ~1s (if the worker is running)' }
}

export function normalizeProfileShareSettingsForTest(
  raw: Partial<ProfileShareSettings> | null | undefined,
): ProfileShareSettings {
  return normalizeSettings(raw)
}
