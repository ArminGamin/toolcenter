/** Reddit Commenter run state, comment queue and subreddit blacklist. (Split out of reddit-commenter.ts.) */

import { type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {
    currentBusinessProfile,
    profileDataPath
} from '../business-profiles.js'
import { loadVault } from '../cc-services.js'
import { readLastNonEmptyLines } from '../log-tail.js'
import { currentProfileBrand } from '../profile-brand.js'



export const rcDir = () => profileDataPath('reddit-commenter')


export const settingsFile = () => path.join(rcDir(), 'settings.json')


export const currentFile = () => path.join(rcDir(), 'current.json')


export const statusFile = () => path.join(rcDir(), 'status.json')


export const controlFile = () => path.join(rcDir(), 'control.json')


export const subredditsFile = () => path.join(rcDir(), 'subreddits.json')


export const queueFile = () => path.join(rcDir(), 'queue.json')


export const blacklistFile = () => path.join(rcDir(), 'subreddit_blacklist.json')


export const logFile = () => path.join(rcDir(), 'log.jsonl')


export const workerLockFile = () => path.join(rcDir(), 'worker.lock')


export const MAX_LOG = 500



export const RC_SECRETS_KEY = 'REDDIT_COMMENTER_SECRETS'



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



export type RedditCommenterSecrets = {
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



export const workerChildren = new Map<string, ChildProcess>()


export const workerChild = () => workerChildren.get(currentBusinessProfile().id) || null



export type WorkerLock = {
  mode: string
  pid: number
  dataDir: string
  startedAt: string
}



export function nowIso() {
  return new Date().toISOString()
}



export function ensureDir() {
  fs.mkdirSync(rcDir(), { recursive: true })
}



export function readJson<T>(file: string, fallback: T): T {
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



export function writeJson(file: string, data: unknown) {
  writeJsonRobust(file, data)
}



export function defaultSettings(): RedditCommenterSettings {
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



export function normalizeSettings(raw: Partial<RedditCommenterSettings> | null | undefined): RedditCommenterSettings {
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



export function readRcSecrets(): RedditCommenterSecrets {
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



export function emptyRun(): RedditCommenterRun {
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



export function loadRun(): RedditCommenterRun {
  return readJson<RedditCommenterRun>(currentFile(), emptyRun())
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



export function isProcessAlive(pid: number): boolean {
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



export const RC_LOCK_MODES = new Set(['scan', 'post', 'scan-and-post', 'refresh-subreddits', 'join-subreddits'])



export function isRedditCommenterWorkerRunning(): boolean {
  if (workerChild() && !workerChild()!.killed && workerChild()!.exitCode == null) return true
  const lock = getWorkerLock()
  return Boolean(lock && RC_LOCK_MODES.has(lock.mode))
}



export function mapWorkerStatus(raw: string | undefined): RedditCommenterStatus {
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



export function syncRunFromWorkerFiles(run: RedditCommenterRun): RedditCommenterRun {
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



export function saveQueue(queue: QueueItem[]) {
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
