/**
 * Reddit Commenter — Control Center orchestration.
 * Spawns D:\toolsai\reddit-commenter\worker.py with a shared data dir.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { loadVault, saveVault, TOOLSAI_ROOT } from './cc-services.js'
import { currentProfileBrand } from './profile-brand.js'
import {
  bindCurrentProfile,
  currentBusinessProfile,
  profileDataPath,
} from './business-profiles.js'
import {
  clearBrowserSessionDir,
  ensureBrowserSessionDir,
} from './browser-sessions.js'
import { isGroupPosterWorkerRunning } from './group-poster.js'
import { readLastNonEmptyLines } from './log-tail.js'

const rcDir = () => profileDataPath('reddit-commenter')
const settingsFile = () => path.join(rcDir(), 'settings.json')
const currentFile = () => path.join(rcDir(), 'current.json')
const statusFile = () => path.join(rcDir(), 'status.json')
const controlFile = () => path.join(rcDir(), 'control.json')
const subredditsFile = () => path.join(rcDir(), 'subreddits.json')
const queueFile = () => path.join(rcDir(), 'queue.json')
const blacklistFile = () => path.join(rcDir(), 'subreddit_blacklist.json')
const logFile = () => path.join(rcDir(), 'log.jsonl')
const runConfigFile = () => path.join(rcDir(), 'run-config.json')
const workerLockFile = () => path.join(rcDir(), 'worker.lock')
const WORKER_DIR = path.join(TOOLSAI_ROOT, 'reddit-commenter')
const WORKER_SCRIPT = path.join(WORKER_DIR, 'worker.py')
const MAX_LOG = 500

const RC_SECRETS_KEY = 'REDDIT_COMMENTER_SECRETS'

export type RedditCommenterStatus =
  | 'idle'
  | 'waiting_login'
  | 'running'
  | 'paused'
  | 'done'
  | 'error'

export type Subreddit = {
  id: string
  name: string
  url: string
  source?: 'joined' | 'discovered'
  category?: string
  categoryLabel?: string
}

export type SubredditBlacklistEntry = {
  id: string
  name: string
  reason: string
  removedAt?: string
}

export type QueueItem = {
  id: string
  postId: string
  subreddit: string
  postTitle: string
  postUrl: string
  relevance: number
  reason: string
  draftComment: string
  status: 'pending' | 'approved' | 'posted' | 'skipped' | 'failed'
  createdAt: string
  postedAt?: string | null
  commentUrl?: string | null
  error?: string | null
}

export type RedditCommenterSettings = {
  selectedSubredditIds: string[]
  autoPost: boolean
  relevanceThreshold: number
  siteMention: string
  maxPostAgeHours: number
  sortBy: 'hot' | 'new'
  minIntervalMin: number
  maxIntervalMin: number
  warmupSec: number
  dailyCap: number
  minTypeDelayMs: number
  maxTypeDelayMs: number
  shuffleSubreddits: boolean
  loginUsername: string
  autoLogin: boolean
  loginMethod: 'google' | 'google_passkey' | 'reddit'
  llmProvider: 'gemini_first' | 'gemini_only' | 'ollama_only'
  ollamaUrl: string
  ollamaModel: string
  geminiModel: string
  autoDiscoverLtSubs: boolean
  ltDiscoveryCategories: string[]
}

type RedditCommenterSecrets = {
  v: 1
  loginPassword: string
}

export type RedditCommenterRun = {
  id: string
  mode: 'scan' | 'post' | 'scan-and-post' | 'refresh-subreddits' | 'join-subreddits' | null
  status: RedditCommenterStatus
  createdAt: string
  updatedAt: string
  message?: string
  error?: string
  posted: number
  failed: number
  matched: number
  scanned: number
  total: number
  currentSubreddit?: string | null
  currentPost?: string | null
  waitEndsAt?: string | null
  waitLabel?: string | null
}

export type RedditCommenterLogEntry = {
  at: string
  kind: 'info' | 'error' | string
  message: string
  profileId?: string
  profileName?: string
}

export type RedditCommenterState = {
  ok: boolean
  settings: RedditCommenterSettings
  run: RedditCommenterRun
  subreddits: Subreddit[]
  queue: QueueItem[]
  log: RedditCommenterLogEntry[]
  workerRunning: boolean
  workerPid?: number
  message?: string
  hasLoginPassword: boolean
  loginPassword?: string
  blacklist: SubredditBlacklistEntry[]
}

const workerChildren = new Map<string, ChildProcess>()
const workerChild = () => workerChildren.get(currentBusinessProfile().id) || null
const setWorkerChild = (child: ChildProcess | null) => {
  const id = currentBusinessProfile().id
  if (child) workerChildren.set(id, child)
  else workerChildren.delete(id)
}

type WorkerLock = {
  mode: string
  pid: number
  dataDir: string
  startedAt: string
}

function nowIso() {
  return new Date().toISOString()
}

function ensureDir() {
  fs.mkdirSync(rcDir(), { recursive: true })
}

function readJson<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

export function writeJsonRobust(file: string, data: unknown) {
  ensureDir()
  const dir = path.dirname(file)
  fs.mkdirSync(dir, { recursive: true })
  const body = JSON.stringify(data, null, 2)
  const tmp = `${file}.tmp`
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      fs.writeFileSync(tmp, body, 'utf8')
      fs.renameSync(tmp, file)
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code
      if (attempt < 7 && (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES')) {
        const end = Date.now() + 35 * (attempt + 1)
        while (Date.now() < end) {
          /* spin */
        }
        continue
      }
      fs.writeFileSync(file, body, 'utf8')
      try {
        fs.unlinkSync(tmp)
      } catch {
        /* ignore */
      }
      return
    }
  }
}

function writeJson(file: string, data: unknown) {
  writeJsonRobust(file, data)
}

function defaultSettings(): RedditCommenterSettings {
  const vault = loadVault()
  return {
    selectedSubredditIds: [],
    autoPost: true,
    relevanceThreshold: 7,
    siteMention: currentProfileBrand().siteHost.replace('.', '. '),
    maxPostAgeHours: 8760,
    sortBy: 'new',
    minIntervalMin: 15,
    maxIntervalMin: 30,
    warmupSec: 30,
    dailyCap: 10,
    minTypeDelayMs: 40,
    maxTypeDelayMs: 120,
    shuffleSubreddits: true,
    loginUsername: '',
    autoLogin: true,
    loginMethod: 'google',
    llmProvider: 'gemini_first',
    ollamaUrl: vault.OLLAMA_URL?.trim() || 'http://127.0.0.1:11434',
    ollamaModel: vault.OLLAMA_MODEL?.trim() || 'llama3.1',
    geminiModel: vault.GEMINI_MODEL?.trim() || 'gemini-2.0-flash',
    autoDiscoverLtSubs: true,
    ltDiscoveryCategories: ['main', 'local', 'health', 'food', 'parenting', 'finance', 'hobbies', 'pets', 'community'],
  }
}

function normalizeSettings(raw: Partial<RedditCommenterSettings> | null | undefined): RedditCommenterSettings {
  const d = defaultSettings()
  const s = raw && typeof raw === 'object' ? raw : {}
  const selectedSubredditIds = Array.isArray(s.selectedSubredditIds)
    ? s.selectedSubredditIds.filter((id): id is string => typeof id === 'string').map((id) => id.trim()).filter(Boolean)
    : d.selectedSubredditIds
  const sortBy = s.sortBy === 'hot' ? 'hot' : 'new'
  const llmProvider =
    s.llmProvider === 'gemini_only' || s.llmProvider === 'ollama_only' ? s.llmProvider : 'gemini_first'
  const validLtCategories = new Set([
    'main',
    'local',
    'health',
    'food',
    'parenting',
    'finance',
    'hobbies',
    'pets',
    'community',
  ])
  const ltDiscoveryCategories = Array.isArray(s.ltDiscoveryCategories)
    ? s.ltDiscoveryCategories
        .filter((id: unknown): id is string => typeof id === 'string')
        .map((id: string) => id.trim().toLowerCase())
        .filter((id: string) => validLtCategories.has(id))
    : d.ltDiscoveryCategories
  return {
    selectedSubredditIds,
    autoPost: s.autoPost !== undefined ? Boolean(s.autoPost) : d.autoPost,
    relevanceThreshold: Math.min(10, Math.max(1, Number(s.relevanceThreshold) || d.relevanceThreshold)),
    siteMention: typeof s.siteMention === 'string' && s.siteMention.trim() ? s.siteMention.trim() : d.siteMention,
    maxPostAgeHours: Math.max(1, Number(s.maxPostAgeHours) || d.maxPostAgeHours),
    sortBy,
    minIntervalMin: Math.max(1, Number(s.minIntervalMin) || d.minIntervalMin),
    maxIntervalMin: Math.max(1, Number(s.maxIntervalMin) || d.maxIntervalMin),
    warmupSec: Math.max(0, Number(s.warmupSec) || 0),
    dailyCap: Math.max(0, Number(s.dailyCap) || 0),
    minTypeDelayMs: Math.max(10, Number(s.minTypeDelayMs) || d.minTypeDelayMs),
    maxTypeDelayMs: Math.max(10, Number(s.maxTypeDelayMs) || d.maxTypeDelayMs),
    shuffleSubreddits: s.shuffleSubreddits !== undefined ? Boolean(s.shuffleSubreddits) : d.shuffleSubreddits,
    loginUsername: typeof s.loginUsername === 'string' ? s.loginUsername.trim() : d.loginUsername,
    autoLogin: s.autoLogin !== undefined ? Boolean(s.autoLogin) : d.autoLogin,
    loginMethod:
      s.loginMethod === 'reddit'
        ? 'reddit'
        : s.loginMethod === 'google_passkey'
          ? 'google_passkey'
          : 'google',
    llmProvider,
    ollamaUrl: typeof s.ollamaUrl === 'string' && s.ollamaUrl.trim() ? s.ollamaUrl.trim() : d.ollamaUrl,
    ollamaModel: typeof s.ollamaModel === 'string' && s.ollamaModel.trim() ? s.ollamaModel.trim() : d.ollamaModel,
    geminiModel: typeof s.geminiModel === 'string' && s.geminiModel.trim() ? s.geminiModel.trim() : d.geminiModel,
    autoDiscoverLtSubs: s.autoDiscoverLtSubs !== undefined ? Boolean(s.autoDiscoverLtSubs) : d.autoDiscoverLtSubs,
    ltDiscoveryCategories: ltDiscoveryCategories.length ? ltDiscoveryCategories : d.ltDiscoveryCategories,
  }
}

function readRcSecrets(): RedditCommenterSecrets {
  const raw = loadVault()[RC_SECRETS_KEY]
  if (!raw) return { v: 1, loginPassword: '' }
  try {
    const parsed = JSON.parse(raw) as Partial<RedditCommenterSecrets>
    return {
      v: 1,
      loginPassword: typeof parsed.loginPassword === 'string' ? parsed.loginPassword : '',
    }
  } catch {
    return { v: 1, loginPassword: '' }
  }
}

function writeRcSecrets(secrets: RedditCommenterSecrets) {
  saveVault({ [RC_SECRETS_KEY]: JSON.stringify(secrets) })
}

function emptyRun(): RedditCommenterRun {
  const t = nowIso()
  return {
    id: '',
    mode: null,
    status: 'idle',
    createdAt: t,
    updatedAt: t,
    posted: 0,
    failed: 0,
    matched: 0,
    scanned: 0,
    total: 0,
    currentSubreddit: null,
    currentPost: null,
  }
}

function loadRun(): RedditCommenterRun {
  return readJson<RedditCommenterRun>(currentFile(), emptyRun())
}

function saveRun(run: RedditCommenterRun) {
  run.updatedAt = nowIso()
  writeJson(currentFile(), run)
}

function appendHubLog(kind: string, message: string) {
  const profile = currentBusinessProfile()
  const entry = { at: nowIso(), kind, message, profileId: profile.id, profileName: profile.name }
  try {
    ensureDir()
    fs.appendFileSync(logFile(), `${JSON.stringify(entry)}\n`, 'utf8')
  } catch {
    /* ignore */
  }
}

export function getRedditCommenterLog(limit = 80): RedditCommenterLogEntry[] {
  try {
    if (!fs.existsSync(logFile())) return []
    const tail = readLastNonEmptyLines(logFile(), Math.min(MAX_LOG, Math.max(1, limit)))
    return tail.flatMap((line) => {
      try {
        const parsed = JSON.parse(line) as RedditCommenterLogEntry
        return parsed && typeof parsed.message === 'string' ? [parsed] : []
      } catch {
        return []
      }
    })
  } catch {
    return []
  }
}

function writeControl(patch: Record<string, unknown>) {
  const prev = readJson<Record<string, unknown>>(controlFile(), {})
  writeJson(controlFile(), { ...prev, ...patch })
}

function isProcessAlive(pid: number): boolean {
  if (!pid || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export function getWorkerLock(): WorkerLock | null {
  try {
    if (!fs.existsSync(workerLockFile())) return null
    const raw = JSON.parse(fs.readFileSync(workerLockFile(), 'utf8')) as Partial<WorkerLock>
    if (!raw || typeof raw.mode !== 'string' || typeof raw.pid !== 'number') return null
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

function writeWorkerLock(mode: string, pid: number, dataDir: string) {
  writeJson(workerLockFile(), { mode, pid, dataDir, startedAt: nowIso() })
}

function clearWorkerLock(pid?: number) {
  const cur = getWorkerLock()
  if (!cur) return
  if (pid && cur.pid !== pid) return
  try {
    fs.unlinkSync(workerLockFile())
  } catch {
    /* ignore */
  }
}

const RC_LOCK_MODES = new Set(['scan', 'post', 'scan-and-post', 'refresh-subreddits', 'join-subreddits'])

export function isRedditCommenterWorkerRunning(): boolean {
  if (workerChild() && !workerChild()!.killed && workerChild()!.exitCode == null) return true
  const lock = getWorkerLock()
  return Boolean(lock && RC_LOCK_MODES.has(lock.mode))
}

function mapWorkerStatus(raw: string | undefined): RedditCommenterStatus {
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

function syncRunFromWorkerFiles(run: RedditCommenterRun): RedditCommenterRun {
  const ctrl = readJson<Record<string, unknown>>(controlFile(), {})
  const aborted = Boolean(ctrl.abort) || run.error === 'aborted'
  const next: RedditCommenterRun = { ...run }

  if (aborted) {
    next.status = 'error'
    next.message = run.message || 'Aborted'
    next.error = run.error || 'aborted'
    next.waitEndsAt = undefined
    next.waitLabel = undefined
    return next
  }

  const status = readJson<Record<string, unknown>>(statusFile(), {})
  if (status && typeof status === 'object') {
    if (typeof status.status === 'string') next.status = mapWorkerStatus(status.status)
    if (typeof status.message === 'string') next.message = status.message
    if (typeof status.error === 'string') next.error = status.error
    if (typeof status.posted === 'number') next.posted = status.posted
    if (typeof status.failed === 'number') next.failed = status.failed
    if (typeof status.matched === 'number') next.matched = status.matched
    if (typeof status.scanned === 'number') next.scanned = status.scanned
    if (typeof status.currentSubreddit === 'string') next.currentSubreddit = status.currentSubreddit
    if (typeof status.currentPost === 'string') next.currentPost = status.currentPost
    if (typeof status.waitEndsAt === 'string') next.waitEndsAt = status.waitEndsAt
    if (typeof status.waitLabel === 'string') next.waitLabel = status.waitLabel
    if (typeof status.mode === 'string') {
      const m = status.mode
      if (m === 'scan' || m === 'post' || m === 'scan-and-post' || m === 'refresh-subreddits' || m === 'join-subreddits') {
        next.mode = m
      }
    }
  }
  return next
}

export function getRedditCommenterSettings(): RedditCommenterSettings {
  ensureDir()
  return normalizeSettings(readJson<Partial<RedditCommenterSettings>>(settingsFile(), {}))
}

export function saveRedditCommenterSettings(
  partial: Partial<RedditCommenterSettings> & { loginPassword?: string },
): { ok: boolean; message: string; settings: RedditCommenterSettings } {
  const current = getRedditCommenterSettings()
  const next = normalizeSettings({ ...current, ...partial })
  writeJson(settingsFile(), next)
  if (typeof partial.loginPassword === 'string') {
    const secrets = readRcSecrets()
    secrets.loginPassword = partial.loginPassword
    writeRcSecrets(secrets)
  }
  return { ok: true, message: 'Settings saved', settings: next }
}

export function getSubreddits(): Subreddit[] {
  const raw = readJson<unknown>(subredditsFile(), [])
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item): Subreddit[] => {
    if (!item || typeof item !== 'object') return []
    const o = item as Record<string, unknown>
    const name = typeof o.name === 'string' ? o.name.trim() : ''
    if (!name) return []
    const id = typeof o.id === 'string' && o.id.trim() ? o.id.trim() : name.toLowerCase()
    const url = typeof o.url === 'string' ? o.url : `https://www.reddit.com/r/${name}/`
    return [{ id, name, url }]
  })
}

export function getQueue(): QueueItem[] {
  const raw = readJson<unknown>(queueFile(), [])
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item): QueueItem[] => {
    if (!item || typeof item !== 'object') return []
    const o = item as Record<string, unknown>
    const postId = String(o.postId || o.id || '').trim()
    if (!postId) return []
    const status = o.status
    const validStatus =
      status === 'approved' || status === 'posted' || status === 'skipped' || status === 'failed'
        ? status
        : 'pending'
    return [
      {
        id: postId,
        postId,
        subreddit: String(o.subreddit || ''),
        postTitle: String(o.postTitle || ''),
        postUrl: String(o.postUrl || ''),
        relevance: Number(o.relevance) || 0,
        reason: String(o.reason || ''),
        draftComment: String(o.draftComment || ''),
        status: validStatus,
        createdAt: String(o.createdAt || nowIso()),
        postedAt: typeof o.postedAt === 'string' ? o.postedAt : null,
        commentUrl: typeof o.commentUrl === 'string' ? o.commentUrl : null,
        error: typeof o.error === 'string' ? o.error : null,
      },
    ]
  })
}

function saveQueue(queue: QueueItem[]) {
  writeJson(queueFile(), queue)
}

export function getSubredditBlacklist(): SubredditBlacklistEntry[] {
  const raw = readJson<unknown>(blacklistFile(), [])
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item): SubredditBlacklistEntry[] => {
    if (!item || typeof item !== 'object') return []
    const o = item as Record<string, unknown>
    const id = typeof o.id === 'string' ? o.id.trim() : ''
    if (!id) return []
    return [
      {
        id,
        name: typeof o.name === 'string' ? o.name : id,
        reason: typeof o.reason === 'string' ? o.reason : 'manual',
        removedAt: typeof o.removedAt === 'string' ? o.removedAt : '',
      },
    ]
  })
}

export function blacklistSubreddits(ids: string[]): { ok: boolean; message: string; state: RedditCommenterState } {
  const wanted = ids.map((x) => x.trim().toLowerCase()).filter(Boolean)
  if (!wanted.length) return { ok: false, message: 'No subreddits selected', state: getRedditCommenterState() }
  const subs = getSubreddits()
  const byId = new Map(getSubredditBlacklist().map((s) => [s.id.toLowerCase(), s]))
  for (const id of wanted) {
    const sub = subs.find((s) => s.id.toLowerCase() === id || s.name.toLowerCase() === id)
    byId.set(id, {
      id: sub?.id || id,
      name: sub?.name || id,
      reason: 'manual',
      removedAt: nowIso(),
    })
  }
  writeJson(blacklistFile(), [...byId.values()])
  return { ok: true, message: `Blacklisted ${wanted.length} subreddit(s)`, state: getRedditCommenterState() }
}

export function unblacklistSubreddit(id: string): { ok: boolean; message: string; state: RedditCommenterState } {
  const gid = id.trim().toLowerCase()
  const next = getSubredditBlacklist().filter((s) => s.id.toLowerCase() !== gid && s.name.toLowerCase() !== gid)
  writeJson(blacklistFile(), next)
  return { ok: true, message: 'Removed from blacklist', state: getRedditCommenterState() }
}

export function approveQueueItem(id: string): { ok: boolean; message: string; state: RedditCommenterState } {
  const queue = getQueue()
  const item = queue.find((q) => q.postId === id)
  if (!item) return { ok: false, message: 'Queue item not found', state: getRedditCommenterState() }
  item.status = 'approved'
  saveQueue(queue)
  return { ok: true, message: 'Approved', state: getRedditCommenterState() }
}

export function skipQueueItem(id: string): { ok: boolean; message: string; state: RedditCommenterState } {
  const queue = getQueue()
  const item = queue.find((q) => q.postId === id)
  if (!item) return { ok: false, message: 'Queue item not found', state: getRedditCommenterState() }
  item.status = 'skipped'
  saveQueue(queue)
  return { ok: true, message: 'Skipped', state: getRedditCommenterState() }
}

export function updateQueueComment(
  id: string,
  comment: string,
): { ok: boolean; message: string; state: RedditCommenterState } {
  const queue = getQueue()
  const item = queue.find((q) => q.postId === id)
  if (!item) return { ok: false, message: 'Queue item not found', state: getRedditCommenterState() }
  item.draftComment = comment.trim()
  saveQueue(queue)
  return { ok: true, message: 'Comment updated', state: getRedditCommenterState() }
}

export function approveAllPending(): { ok: boolean; message: string; state: RedditCommenterState } {
  const queue = getQueue()
  let count = 0
  for (const item of queue) {
    if (item.status === 'pending') {
      item.status = 'approved'
      count += 1
    }
  }
  saveQueue(queue)
  return { ok: true, message: `Approved ${count} item(s)`, state: getRedditCommenterState() }
}

export function clearQueue(clearPosted = false): { ok: boolean; message: string; state: RedditCommenterState } {
  const queue = getQueue()
  const next = clearPosted ? [] : queue.filter((q) => q.status === 'posted' || q.status === 'approved')
  saveQueue(next)
  return { ok: true, message: 'Queue cleared', state: getRedditCommenterState() }
}

export function getRedditCommenterState(opts?: { light?: boolean }): RedditCommenterState {
  ensureDir()
  const settings = getRedditCommenterSettings()
  const secrets = readRcSecrets()
  let run = syncRunFromWorkerFiles(loadRun())
  if (!run.id) run = emptyRun()

  const state: RedditCommenterState = {
    ok: true,
    settings,
    run,
    subreddits: getSubreddits(),
    queue: getQueue(),
    log: opts?.light ? [] : getRedditCommenterLog(80),
    workerRunning: isRedditCommenterWorkerRunning(),
    hasLoginPassword: Boolean(secrets.loginPassword.trim()),
    loginPassword: secrets.loginPassword,
    blacklist: getSubredditBlacklist(),
  }

  const lock = getWorkerLock()
  if (lock) state.workerPid = lock.pid
  return state
}

function resolvePython(cwd: string): string {
  const candidates = [
    path.join(cwd, '.venv', 'Scripts', 'pythonw.exe'),
    path.join(cwd, '.venv312', 'Scripts', 'pythonw.exe'),
    path.join(TOOLSAI_ROOT, '.venv', 'Scripts', 'pythonw.exe'),
    path.join(cwd, '.venv', 'Scripts', 'python.exe'),
    path.join(cwd, '.venv312', 'Scripts', 'python.exe'),
    path.join(TOOLSAI_ROOT, '.venv', 'Scripts', 'python.exe'),
    'pythonw',
    'python',
  ]
  for (const c of candidates) {
    if (c === 'python' || c === 'pythonw') return c
    if (fs.existsSync(c)) return c
  }
  return 'pythonw'
}

function killWorker() {
  if (workerChild() && !workerChild()!.killed) {
    try {
      workerChild()!.kill('SIGTERM')
    } catch {
      /* ignore */
    }
  }
  const lock = getWorkerLock()
  if (lock?.pid) {
    try {
      process.kill(lock.pid, 'SIGTERM')
    } catch {
      /* ignore */
    }
    clearWorkerLock(lock.pid)
  }
  setWorkerChild(null)
}

function buildRunConfigPayload(
  settings: RedditCommenterSettings,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  const secrets = readRcSecrets()
  const vault = loadVault()
  return {
    ...settings,
    loginUsername: settings.loginUsername,
    loginPassword: secrets.loginPassword,
    autoLogin: settings.autoLogin,
    geminiApiKey: vault.GEMINI_API_KEY || '',
    ...(extra || {}),
  }
}

function spawnWorker(mode: 'scan' | 'post' | 'scan-and-post' | 'refresh-subreddits' | 'join-subreddits'): {
  ok: boolean
  message: string
} {
  if (!fs.existsSync(WORKER_SCRIPT)) {
    return { ok: false, message: `Worker missing: ${WORKER_SCRIPT}` }
  }
  const lock = getWorkerLock()
  if (lock) {
    return { ok: false, message: 'Reddit worker already running — abort first' }
  }
  if (isGroupPosterWorkerRunning()) {
    return { ok: false, message: 'Facebook Group Poster is running — abort it first' }
  }
  if (workerChild() && !workerChild()!.killed && workerChild()!.exitCode == null) {
    return { ok: false, message: 'Worker already running — abort first' }
  }

  ensureDir()
  writeControl({ paused: false, abort: false, continueLogin: false, showBrowser: false })
  writeJson(statusFile(), {
    status: 'running',
    message: 'Starting…',
    mode,
    posted: 0,
    failed: 0,
    matched: 0,
    scanned: 0,
    updatedAt: nowIso(),
  })

  const py = resolvePython(WORKER_DIR)
  const browserProfileDir = ensureBrowserSessionDir(
    'reddit',
    path.join(WORKER_DIR, 'browser_profile'),
  )
  const child = spawn(py, [WORKER_SCRIPT, '--data-dir', rcDir(), '--mode', mode], {
    cwd: WORKER_DIR,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      TOOLSAI_BROWSER_PROFILE_DIR: browserProfileDir,
    },
  })
  setWorkerChild(child)
  if (child.pid) writeWorkerLock(mode, child.pid, rcDir())

  child.stdout?.on('data', (buf: Buffer) => {
    const t = buf.toString('utf8').trim()
    if (t) appendHubLog('info', t.slice(0, 400))
  })
  child.stderr?.on('data', (buf: Buffer) => {
    const t = buf.toString('utf8').trim()
    if (!t) return
    const level = /\b(ERROR|CRITICAL)\b/i.test(t) ? 'error' : 'info'
    appendHubLog(level, t.slice(0, 400))
  })
  child.on('close', bindCurrentProfile((code) => {
    if (child.pid) clearWorkerLock(child.pid)
    if (workerChild() === child) setWorkerChild(null)
    appendHubLog('info', `Worker exited (code ${code ?? '?'})`)
    const run = syncRunFromWorkerFiles(loadRun())
    if (run.status === 'running' || run.status === 'waiting_login' || run.status === 'paused') {
      run.status = code === 0 ? 'done' : 'error'
      run.message = code === 0 ? 'Worker finished' : `Worker exited with code ${code}`
    }
    saveRun(run)
  }))

  const labels: Record<string, string> = {
    scan: 'Scan started',
    post: 'Posting started',
    'scan-and-post': 'Scan & post started',
    'refresh-subreddits': 'Refreshing subreddits…',
    'join-subreddits': 'Joining subreddits…',
  }
  return { ok: true, message: labels[mode] || 'Started' }
}

function failRunAfterSpawnError(
  run: RedditCommenterRun,
  message: string,
): { ok: boolean; message: string; state: RedditCommenterState } {
  run.status = 'error'
  run.message = message
  run.error = message
  run.updatedAt = nowIso()
  saveRun(run)
  return { ok: false, message, state: getRedditCommenterState() }
}

export function refreshRedditSubreddits(
  partial?: Partial<RedditCommenterSettings> & { loginPassword?: string },
): { ok: boolean; message: string; state?: RedditCommenterState } {
  if (partial && Object.keys(partial).length) saveRedditCommenterSettings(partial)
  const runId = `rc-refresh-${Date.now().toString(36)}`
  const run: RedditCommenterRun = {
    id: runId,
    mode: 'refresh-subreddits',
    status: 'running',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    message: 'Refreshing subreddits…',
    posted: 0,
    failed: 0,
    matched: 0,
    scanned: 0,
    total: 0,
    currentSubreddit: null,
    currentPost: null,
  }
  saveRun(run)
  writeJson(runConfigFile(), buildRunConfigPayload(getRedditCommenterSettings()))
  appendHubLog('info', 'Start refresh-subreddits')
  const spawned = spawnWorker('refresh-subreddits')
  if (!spawned.ok) return failRunAfterSpawnError(run, spawned.message)
  return { ok: true, message: spawned.message, state: getRedditCommenterState() }
}

function resolveJoinTargets(
  settings: RedditCommenterSettings,
  scope: 'selected' | 'all',
): Subreddit[] {
  const subs = getSubreddits()
  const blacklist = new Set(getSubredditBlacklist().map((b) => b.id.toLowerCase()))
  const notBlocked = subs.filter(
    (s) => !blacklist.has(s.id.toLowerCase()) && !blacklist.has(s.name.toLowerCase()),
  )
  if (scope === 'all') return notBlocked
  const selectedIds = new Set(settings.selectedSubredditIds.map((x) => x.toLowerCase()))
  if (!selectedIds.size) return []
  return notBlocked.filter(
    (s) => selectedIds.has(s.id.toLowerCase()) || selectedIds.has(s.name.toLowerCase()),
  )
}

export function joinRedditSubreddits(
  scope: 'selected' | 'all',
  partial?: Partial<RedditCommenterSettings> & { loginPassword?: string },
): { ok: boolean; message: string; state?: RedditCommenterState } {
  if (partial && Object.keys(partial).length) saveRedditCommenterSettings(partial)
  const settings = getRedditCommenterSettings()
  const targets = resolveJoinTargets(settings, scope)

  if (!targets.length) {
    return {
      ok: false,
      message:
        scope === 'all'
          ? 'No subreddits in list — click Refresh & discover first'
          : 'Select at least one subreddit to join',
    }
  }

  const runId = `rc-join-${Date.now().toString(36)}`
  const run: RedditCommenterRun = {
    id: runId,
    mode: 'join-subreddits',
    status: 'running',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    message: 'Joining subreddits…',
    posted: 0,
    failed: 0,
    matched: 0,
    scanned: 0,
    total: targets.length,
    currentSubreddit: null,
    currentPost: null,
  }
  saveRun(run)
  writeJson(
    runConfigFile(),
    buildRunConfigPayload(settings, {
      joinSubredditScope: scope,
      joinSubredditNames: targets.map((t) => t.name),
      selectedSubredditIds: settings.selectedSubredditIds,
    }),
  )
  appendHubLog('info', `Start join-subreddits · ${targets.length} subs (${scope})`)
  const spawned = spawnWorker('join-subreddits')
  if (!spawned.ok) return failRunAfterSpawnError(run, spawned.message)
  return { ok: true, message: spawned.message, state: getRedditCommenterState() }
}

export function startRedditScan(
  partial?: Partial<RedditCommenterSettings> & { loginPassword?: string },
): { ok: boolean; message: string; state?: RedditCommenterState } {
  if (partial && Object.keys(partial).length) saveRedditCommenterSettings(partial)
  const settings = getRedditCommenterSettings()
  const subs = getSubreddits()
  const selectedIds = new Set(settings.selectedSubredditIds.map((x) => x.toLowerCase()))
  const selected =
    selectedIds.size > 0
      ? subs.filter((s) => selectedIds.has(s.id.toLowerCase()) || selectedIds.has(s.name.toLowerCase()))
      : subs.slice()

  if (!selected.length) {
    return {
      ok: false,
      message: subs.length
        ? 'Select at least one subreddit (or refresh subreddits first)'
        : 'No subreddits yet — click Refresh subreddits first',
    }
  }

  const runId = `rc-scan-${Date.now().toString(36)}`
  const run: RedditCommenterRun = {
    id: runId,
    mode: 'scan',
    status: 'running',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    message: 'Scanning…',
    posted: 0,
    failed: 0,
    matched: 0,
    scanned: 0,
    total: selected.length,
    currentSubreddit: null,
    currentPost: null,
  }
  saveRun(run)
  writeJson(runConfigFile(), buildRunConfigPayload(settings))
  appendHubLog('info', `Start scan · ${selected.length} subreddits`)
  const spawned = spawnWorker('scan')
  if (!spawned.ok) return failRunAfterSpawnError(run, spawned.message)
  return { ok: true, message: spawned.message, state: getRedditCommenterState() }
}

export function startRedditPost(
  partial?: Partial<RedditCommenterSettings> & { loginPassword?: string },
): { ok: boolean; message: string; state?: RedditCommenterState } {
  if (partial && Object.keys(partial).length) saveRedditCommenterSettings(partial)
  const settings = getRedditCommenterSettings()
  const queue = getQueue()
  const targets = settings.autoPost
    ? queue.filter((q) => q.status === 'pending' || q.status === 'approved')
    : queue.filter((q) => q.status === 'approved')

  if (!targets.length) {
    return {
      ok: false,
      message: settings.autoPost
        ? 'No pending comments in queue'
        : 'Approve comments in the queue first',
    }
  }

  const runId = `rc-post-${Date.now().toString(36)}`
  const run: RedditCommenterRun = {
    id: runId,
    mode: 'post',
    status: 'running',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    message: 'Posting…',
    posted: 0,
    failed: 0,
    matched: 0,
    scanned: 0,
    total: targets.length,
    currentSubreddit: null,
    currentPost: null,
  }
  saveRun(run)
  writeJson(runConfigFile(), buildRunConfigPayload(settings))
  appendHubLog('info', `Start post · ${targets.length} comments`)
  const spawned = spawnWorker('post')
  if (!spawned.ok) return failRunAfterSpawnError(run, spawned.message)
  return { ok: true, message: spawned.message, state: getRedditCommenterState() }
}

export function startRedditScanAndPost(
  partial?: Partial<RedditCommenterSettings> & { loginPassword?: string },
): { ok: boolean; message: string; state?: RedditCommenterState } {
  if (partial && Object.keys(partial).length) saveRedditCommenterSettings(partial)
  const settings = getRedditCommenterSettings()
  const subs = getSubreddits()
  const selectedIds = new Set(settings.selectedSubredditIds.map((x) => x.toLowerCase()))
  const selected =
    selectedIds.size > 0
      ? subs.filter((s) => selectedIds.has(s.id.toLowerCase()) || selectedIds.has(s.name.toLowerCase()))
      : subs.slice()

  if (!selected.length) {
    return { ok: false, message: 'Select subreddits or refresh first' }
  }

  const runId = `rc-full-${Date.now().toString(36)}`
  const run: RedditCommenterRun = {
    id: runId,
    mode: 'scan-and-post',
    status: 'running',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    message: 'Scan & post…',
    posted: 0,
    failed: 0,
    matched: 0,
    scanned: 0,
    total: selected.length,
    currentSubreddit: null,
    currentPost: null,
  }
  saveRun(run)
  writeJson(runConfigFile(), buildRunConfigPayload(settings))
  appendHubLog('info', `Start scan-and-post · ${selected.length} subreddits`)
  const spawned = spawnWorker('scan-and-post')
  if (!spawned.ok) return failRunAfterSpawnError(run, spawned.message)
  return { ok: true, message: spawned.message, state: getRedditCommenterState() }
}

export function continueRedditCommenterLogin(): { ok: boolean; message: string } {
  writeControl({ continueLogin: true })
  appendHubLog('info', 'Continue login signaled')
  return { ok: true, message: 'Continue sent — worker will proceed' }
}

export function clearRedditCommenterLoginSession(): { ok: boolean; message: string } {
  writeControl({ clearLoginSession: true })
  if (!workerChild()) clearBrowserSessionDir('reddit')
  appendHubLog('info', 'Clear Reddit login session signaled')
  return {
    ok: true,
    message: 'Saved login will be cleared — start a run or wait if the worker is already open',
  }
}

export function showRedditCommenterBrowser(): { ok: boolean; message: string } {
  writeControl({ showBrowser: true })
  return { ok: true, message: 'Chrome will move on-screen within ~1s' }
}

export function pauseRedditCommenter(): { ok: boolean; message: string } {
  writeControl({ paused: true })
  const run = loadRun()
  run.status = 'paused'
  run.message = 'Paused'
  saveRun(run)
  return { ok: true, message: 'Paused' }
}

export function resumeRedditCommenter(): { ok: boolean; message: string } {
  writeControl({ paused: false })
  const run = loadRun()
  if (run.status === 'paused') {
    run.status = 'running'
    run.message = 'Resumed'
    saveRun(run)
  }
  return { ok: true, message: 'Resumed' }
}

export function abortRedditCommenter(): { ok: boolean; message: string } {
  writeControl({ abort: true, paused: false })
  appendHubLog('info', 'Abort signaled')
  writeJson(statusFile(), {
    status: 'error',
    message: 'Aborted',
    error: 'aborted',
    updatedAt: nowIso(),
  })
  setTimeout(bindCurrentProfile(() => killWorker()), 1500)
  const run = loadRun()
  run.status = 'error'
  run.message = 'Aborted'
  run.error = 'aborted'
  run.waitEndsAt = undefined
  run.waitLabel = undefined
  run.updatedAt = nowIso()
  saveRun(run)
  return { ok: true, message: 'Abort sent' }
}

export function clearRedditCommenterLog(): { ok: boolean; message: string } {
  try {
    if (fs.existsSync(logFile())) fs.writeFileSync(logFile(), '', 'utf8')
  } catch {
    /* ignore */
  }
  return { ok: true, message: 'Log cleared' }
}

export function clearRedditCommenterRun(): { ok: boolean; message: string; state: RedditCommenterState } {
  if (workerChild() && !workerChild()!.killed) {
    writeControl({ abort: true })
    killWorker()
  }
  saveRun(emptyRun())
  writeJson(statusFile(), { status: 'idle', updatedAt: nowIso() })
  writeControl({ paused: false, abort: false, continueLogin: false, showBrowser: false })
  return { ok: true, message: 'Run cleared', state: getRedditCommenterState() }
}
