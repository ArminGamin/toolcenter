/**
 * Reddit Commenter — Control Center orchestration.
 * Spawns D:\toolsai\reddit-commenter\worker.py with a shared data dir.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {
    clearBrowserSessionDir,
    ensureBrowserSessionDir,
} from './browser-sessions.js'
import {
    bindCurrentProfile,
    currentBusinessProfile
} from './business-profiles.js'
import { loadVault, saveVault, TOOLSAI_ROOT } from './cc-services.js'
import { isGroupPosterWorkerRunning } from './group-poster.js'
import { controlFile, currentFile, emptyRun, ensureDir, getQueue, getRedditCommenterSettings, getRedditCommenterState, getSubredditBlacklist, getSubreddits, getWorkerLock, loadRun, logFile, normalizeSettings, nowIso, RC_SECRETS_KEY, rcDir, readJson, readRcSecrets, settingsFile, statusFile, syncRunFromWorkerFiles, workerChild, workerChildren, workerLockFile, writeJson, type RedditCommenterRun, type RedditCommenterSecrets, type RedditCommenterSettings, type RedditCommenterState, type Subreddit } from './reddit-commenter/queue.js'
export { approveAllPending, approveQueueItem, blacklistSubreddits, clearQueue, getQueue, getRedditCommenterLog, getRedditCommenterSettings, getRedditCommenterState, getSubredditBlacklist, getSubreddits, getWorkerLock, isRedditCommenterWorkerRunning, skipQueueItem, unblacklistSubreddit, updateQueueComment, writeJsonRobust } from './reddit-commenter/queue.js'
export type { QueueItem, RedditCommenterLogEntry, RedditCommenterRun, RedditCommenterSettings, RedditCommenterState, RedditCommenterStatus, Subreddit, SubredditBlacklistEntry } from './reddit-commenter/queue.js'
const runConfigFile = () => path.join(rcDir(), 'run-config.json')
const WORKER_DIR = path.join(TOOLSAI_ROOT, 'reddit-commenter')
const WORKER_SCRIPT = path.join(WORKER_DIR, 'worker.py')
const setWorkerChild = (child: ChildProcess | null) => {
  const id = currentBusinessProfile().id
  if (child) workerChildren.set(id, child)
  else workerChildren.delete(id)
}

function writeRcSecrets(secrets: RedditCommenterSecrets) {
  saveVault({ [RC_SECRETS_KEY]: JSON.stringify(secrets) })
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

function writeControl(patch: Record<string, unknown>) {
  const prev = readJson<Record<string, unknown>>(controlFile(), {})
  writeJson(controlFile(), { ...prev, ...patch })
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
