import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { loadVault, TOOLSAI_ROOT } from '../cc-services.js'
import { appendLog } from './log.js'
import { LEAD_FINDER } from './paths.js'
import { rt, gOutreach, pullOutreachRuntime, releaseFindSpawnLock, childProcessRunning, syncOutreachRuntime, liveFindChild } from './runtime.js'

export function resolvePython(cwd: string): string {
  const candidates = [
    path.join(cwd, '.venv312', 'Scripts', 'python.exe'),
    path.join(cwd, '.venv', 'Scripts', 'python.exe'),
    'python',
    path.join(TOOLSAI_ROOT, '.venv', 'Scripts', 'python.exe'),
  ]
  for (const c of candidates) {
    if (c === 'python') return c
    if (fs.existsSync(c)) return c
  }
  return 'python'
}

export function readEnvFileLocal(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {}
  try {
    const out: Record<string, string> = {}
    for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const i = t.indexOf('=')
      if (i <= 0) continue
      const k = t.slice(0, i).trim()
      let v = t.slice(i + 1).trim()
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1)
      }
      if (k) out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

/** Same env merge as launching AI Lead Finder from the Tools tab (defaults + .env + vault). */
export function leadFinderSpawnEnv(): NodeJS.ProcessEnv {
  const defaults: Record<string, string> = {
    OLLAMA_URL: 'http://127.0.0.1:11434',
    OLLAMA_MODEL: 'llama3.1:8b',
    FETCH_WORKERS: '24',
    ON_PAGE_WORKERS: '10',
    VERIFY_WORKERS: '4',
    SMTP_TIMEOUT: '6',
    SMTP_PORT: '25',
    SKIP_SMTP: '0',
    MAX_PAGES_DEFAULT: '120',
    PLAYWRIGHT_ENABLED: '0',
    LEAD_FINDER_FAST: '1',
  }
  const fromDot = readEnvFileLocal(path.join(LEAD_FINDER, '.env'))
  const fromCc = readEnvFileLocal(path.join(LEAD_FINDER, 'control-center.env'))
  const vault = loadVault()
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const [k, v] of Object.entries(defaults)) {
    if (v) env[k] = v
  }
  for (const [k, v] of Object.entries(fromDot)) {
    if (v !== undefined && v !== '') env[k] = v
  }
  for (const [k, v] of Object.entries(fromCc)) {
    if (v !== undefined && v !== '') env[k] = v
  }
  for (const [k, v] of Object.entries(vault)) {
    if (v !== undefined && v !== '' && k !== 'DISCORD_STATUS_WEBHOOK') env[k] = v
  }
  env.PYTHONUNBUFFERED = '1'
  env.PYTHONIOENCODING = 'utf-8'
  env.PYTHONUTF8 = '1'
  // Outreach autopilot always runs the fast scrape profile
  env.LEAD_FINDER_FAST = '1'
  return env
}

/** Count live headless_run.py processes (optional exceptPid). */
export function countHeadlessFindRuns(exceptPid?: number): number {
  if (process.env.VITEST) return 0
  if (process.platform !== 'win32') return 0
  try {
    const py = resolvePython(LEAD_FINDER)
    const script = path.join(LEAD_FINDER, 'lock_clear.py')
    if (!fs.existsSync(script)) return 0
    const args = ['count']
    if (exceptPid && exceptPid > 0) args.push('--except', String(exceptPid))
    const out = execFileSync(py, [script, ...args], {
      cwd: LEAD_FINDER,
      windowsHide: true,
      timeout: 4000,
      encoding: 'utf8',
    })
    return Number(String(out).trim().split(/\r?\n/).pop()) || 0
  } catch {
    return 0
  }
}

/**
 * Kill stray headless_run.py trees (+ dead-parent scrape workers).
 * Pass exceptPid to keep the active find alive. When omitExcept is false (default)
 * and rt.findChild is set, automatically protects the active PID.
 */
export function killLeftoverHeadlessFinders(exceptPid?: number): number {
  if (process.env.VITEST) return 0
  if (process.platform !== 'win32') return 0
  try {
    const py = resolvePython(LEAD_FINDER)
    const script = path.join(LEAD_FINDER, 'lock_clear.py')
    if (!fs.existsSync(script)) return 0
    const protect =
      exceptPid && exceptPid > 0
        ? exceptPid
        : rt.findChild && !rt.findChild.killed && rt.findChild.pid
          ? rt.findChild.pid
          : undefined
    const args = ['all']
    if (protect) args.push('--except', String(protect))
    const out = execFileSync(py, [script, ...args], {
      cwd: LEAD_FINDER,
      windowsHide: true,
      timeout: 8000,
      encoding: 'utf8',
    })
    const n = Number(String(out).trim().split(/\r?\n/).pop()) || 0
    if (n > 0) appendLog('info', 'find', `Cleared ${n} leftover Lead Finder process(es)`)
    return n
  } catch {
    return 0
  }
}

/** Windows: kill process tree immediately. Non-blocking enough for Abort UX. */
export function forceKillPidTree(pid: number | undefined | null): void {
  if (process.env.VITEST) return
  const n = Number(pid)
  if (!Number.isFinite(n) || n <= 0) return
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/F', '/T', '/PID', String(n)], {
        windowsHide: true,
        timeout: 1200,
      })
    } catch {
      /* already dead */
    }
    return
  }
  try {
    process.kill(-n, 'SIGKILL')
  } catch {
    try {
      process.kill(n, 'SIGKILL')
    } catch {
      /* ignore */
    }
  }
}

/**
 * Instant find kill for Abort — no sleep loops, no 8s lock_clear wait on the request path.
 * Stray cleanup runs in the background.
 */
export function forceAbortFindsInstant(_reason: string): { killedChild: boolean; pid: number | null } {
  pullOutreachRuntime()
  rt.findEpoch++
  const child = liveFindChild() || rt.findChild
  const pid = child?.pid ?? null
  const killedChild = Boolean(child && childProcessRunning(child))
  try {
    if (child && childProcessRunning(child)) child.kill()
  } catch {
    /* ignore */
  }
  forceKillPidTree(pid)
  rt.findChild = null
  if (gOutreach.__ccOutreachRt) gOutreach.__ccOutreachRt.findChild = null
  releaseFindSpawnLock()
  syncOutreachRuntime()
  // The captured PID tree was stopped above. A delayed kill-all can kill a
  // replacement worker already started by checkpoint recovery.
  return { killedChild, pid }
}

/** Stop tracked child + every stray headless_run before starting a new find/send/refill. */
export function hardStopAllFinds(_reason: string): { killedChild: boolean; cleared: number; remaining: number } {
  pullOutreachRuntime()
  rt.findEpoch++
  // Prefer HMR-surviving child — module `let` can be null while the bag still owns the process.
  const child = liveFindChild() || rt.findChild
  rt.findChild = child
  let killedChild = false
  const pid = child?.pid ?? null
  if (child) {
    killedChild = childProcessRunning(child)
    try {
      if (childProcessRunning(child)) child.kill()
    } catch {
      /* ignore */
    }
    forceKillPidTree(pid)
    rt.findChild = null
    if (gOutreach.__ccOutreachRt?.findChild === child) {
      gOutreach.__ccOutreachRt.findChild = null
    }
  }
  const cleared = killLeftoverHeadlessFinders()
  const remaining = countHeadlessFindRuns()
  releaseFindSpawnLock()
  syncOutreachRuntime()
  return { killedChild, cleared, remaining }
}

export function sleepSync(ms: number): void {
  try {
    execFileSync(
      'powershell.exe',
      ['-NoProfile', '-Command', `Start-Sleep -Milliseconds ${Math.max(0, ms)}`],
      { windowsHide: true, timeout: ms + 3000 },
    )
  } catch {
    /* ignore */
  }
}
