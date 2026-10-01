/** Launching, stopping and status of external tools. (Split out of launch.ts.) */

import { execFile, spawn, type SpawnOptions } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import {
    currentBusinessProfile
} from '../business-profiles.js'
import {
    fireNotify
} from '../cc-services.js'
import {
    appendConsole,
    children,
    consoles,
    isPidAlive,
    launchedPids,
    loadProfileToolSnapshot,
    profileRuntimeKey,
    resolveLaunchEntry,
    resolvePython,
    spawnEnvForTool,
    trackChild
} from '../launch-runtime.js'
import { LAUNCH_CATALOG, resolveOllamaBaseUrl, startOllama } from './ollama.js'

export const execFileAsync = promisify(execFile)

export let cmdlineCache = { at: 0, text: '' }

export async function getProcessCmdlines(): Promise<string> {
  const now = Date.now()
  if (now - cmdlineCache.at < 2500) return cmdlineCache.text
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        "Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'python|ollama|cmd' } | ForEach-Object { $_.CommandLine }",
      ],
      { windowsHide: true, timeout: 8000, maxBuffer: 4 * 1024 * 1024 },
    )
    cmdlineCache = { at: now, text: String(stdout || '').toLowerCase() }
  } catch {
    cmdlineCache = { at: now, text: '' }
  }
  return cmdlineCache.text
}

/** Sticky health — Ollama often stalls briefly while loading/serving a model. */
export const ollamaHealth = {
  up: false,
  fails: 0,
  /** Last raw probe result cache (ms) */
  probedAt: 0,
  probedOk: false,
}

export const OLLAMA_PROBE_CACHE_MS = 2000

export const OLLAMA_FAIL_THRESHOLD = 3

export const OLLAMA_PROBE_TIMEOUT_MS = 4500

export async function probeOllamaHttpRaw(): Promise<boolean> {
  const now = Date.now()
  if (now - ollamaHealth.probedAt < OLLAMA_PROBE_CACHE_MS) {
    return ollamaHealth.probedOk
  }
  const base = resolveOllamaBaseUrl(LAUNCH_CATALOG.find((t) => t.id === 'ollama'))
  // Prefer /api/version — /api/tags can hang while a model is loading into VRAM
  const paths = ['/api/version', '/']
  for (const p of paths) {
    try {
      const res = await fetch(`${base}${p}`, {
        signal: AbortSignal.timeout(OLLAMA_PROBE_TIMEOUT_MS),
      })
      if (res.ok) {
        ollamaHealth.probedAt = Date.now()
        ollamaHealth.probedOk = true
        return true
      }
    } catch {
      /* try next */
    }
  }
  ollamaHealth.probedAt = Date.now()
  ollamaHealth.probedOk = false
  return false
}

export async function isOllamaHttpUp(): Promise<boolean> {
  const rawOk = await probeOllamaHttpRaw()
  if (rawOk) {
    ollamaHealth.up = true
    ollamaHealth.fails = 0
    return true
  }
  ollamaHealth.fails += 1
  // Stay "on" through a few blips (busy inference / pull / cold start)
  if (ollamaHealth.up && ollamaHealth.fails < OLLAMA_FAIL_THRESHOLD) {
    return true
  }
  ollamaHealth.up = false
  return false
}

export async function getRuntimeStatus(): Promise<{
  ollama: boolean
  tools: Record<string, boolean>
}> {
  // Parallel — PowerShell scan + HTTP probe shouldn't block each other
  const [cmdlines, ollamaHttp] = await Promise.all([getProcessCmdlines(), isOllamaHttpUp()])
  const tools: Record<string, boolean> = {}

  for (const tool of LAUNCH_CATALOG) {
    const runtimeKey = profileRuntimeKey(tool.id)
    const pid = launchedPids.get(runtimeKey)
    const pidAlive = typeof pid === 'number' && isPidAlive(pid)
    if (!pidAlive && pid) launchedPids.delete(runtimeKey)

    const matches = tool.launchOptions?.map((option) => option.processMatch || option.launch)
      || [tool.processMatch || tool.id]
    const matched = matches.some((match) => cmdlines.includes(match.toLowerCase().replace(/\//g, '\\')))

    if (tool.id === 'ollama') {
      // Process alive counts as on even if HTTP blipped
      tools[tool.id] = ollamaHttp || matched || pidAlive
    } else {
      tools[tool.id] = pidAlive || matched
    }
  }

  // Topbar badge: same truth as the Ollama tool card (HTTP sticky OR process)
  return { ollama: Boolean(tools.ollama), tools }
}

export async function stopToolById(
  id: string,
  opts?: { quiet?: boolean },
): Promise<{ ok: boolean; message: string }> {
  const tool = LAUNCH_CATALOG.find((t) => t.id === id)
  if (!tool) return { ok: false, message: `Unknown tool: ${id}` }

  const killed: string[] = []
  const runtimeKey = profileRuntimeKey(id)
  const child = children.get(runtimeKey) || children.get(`${runtimeKey}:job`)
  const pid = child?.pid || launchedPids.get(runtimeKey) || consoles.get(runtimeKey)?.pid

  if (pid) {
    try {
      await execFileAsync('taskkill', ['/T', '/F', '/PID', String(pid)], {
        windowsHide: true,
        timeout: 8000,
      })
      killed.push(`pid ${pid}`)
    } catch {
      /* may already be dead */
    }
  }

  // Also stop any side job (pull/setup) tracked separately
  const side = children.get(`${runtimeKey}:job`)
  if (side?.pid && side.pid !== pid) {
    try {
      await execFileAsync('taskkill', ['/T', '/F', '/PID', String(side.pid)], {
        windowsHide: true,
        timeout: 8000,
      })
      killed.push(`job ${side.pid}`)
    } catch {
      /* ignore */
    }
  }

  children.delete(runtimeKey)
  children.delete(`${runtimeKey}:job`)
  launchedPids.delete(runtimeKey)
  const state = consoles.get(runtimeKey)
  if (state) state.running = false
  appendConsole(id, `Stop requested${killed.length ? ` — ${killed.join(', ')}` : ''}`, 'sys')
  if (!opts?.quiet) {
    fireNotify(`Stopped ${tool.id}`, killed.length ? killed.join(', ') : 'No tracked process', 'stop', id)
  }

  return {
    ok: true,
    message: killed.length ? `Stopped (${killed.join(', ')})` : 'Stop sent (no tracked PID)',
  }
}

export async function stopAllTools(): Promise<{
  ok: boolean
  message: string
  stopped: string[]
}> {
  const stopped: string[] = []
  const pids = new Set<number>()
  const profilePrefix = `${currentBusinessProfile().id}:`

  const mark = (id: string) => {
    if (!stopped.includes(id)) stopped.push(id)
  }

  for (const [key, child] of children) {
    if (!key.startsWith(profilePrefix) && key !== 'ollama' && key !== 'ollama:job') continue
    const id = key.replace(profilePrefix, '').replace(/:job$/, '')
    mark(id)
    if (child.pid) pids.add(child.pid)
  }
  for (const [id, pid] of launchedPids) {
    if (!id.startsWith(profilePrefix) && id !== 'ollama') continue
    mark(id.replace(profilePrefix, ''))
    pids.add(pid)
  }
  for (const [id, st] of consoles) {
    if (!id.startsWith(profilePrefix) && id !== 'ollama') continue
    if (st.running) {
      mark(id.replace(profilePrefix, ''))
      if (st.pid) pids.add(st.pid)
    }
  }

  // Only stop PIDs tracked for the selected profile. Process-name sweeps would
  // terminate matching tools that belong to another business workspace.
  const jobs: Promise<unknown>[] = []

  if (pids.size > 0) {
    const args = ['/T', '/F']
    for (const pid of pids) {
      args.push('/PID', String(pid))
    }
    jobs.push(
      execFileAsync('taskkill', args, { windowsHide: true, timeout: 4000 }).catch(() => null),
    )
  }

  await Promise.all(jobs)

  for (const key of [...children.keys()]) {
    if (key.startsWith(profilePrefix) || key === 'ollama' || key === 'ollama:job') children.delete(key)
  }
  for (const key of [...launchedPids.keys()]) {
    if (key.startsWith(profilePrefix) || key === 'ollama') launchedPids.delete(key)
  }
  for (const id of stopped) {
    const st = consoles.get(profileRuntimeKey(id))
    if (st) st.running = false
    appendConsole(id, 'Stop all', 'sys')
  }
  // Also clear running flags for catalog tools we swept
  for (const tool of LAUNCH_CATALOG) {
    const st = consoles.get(profileRuntimeKey(tool.id))
    if (st?.running) {
      st.running = false
      if (!stopped.includes(tool.id)) {
        stopped.push(tool.id)
        appendConsole(tool.id, 'Stop all', 'sys')
      }
    }
  }

  const msg =
    pids.size > 0
      ? stopped.length > 0
        ? `Closed ${stopped.length}: ${stopped.join(', ')}`
        : 'Closed all matching tool processes'
      : 'Nothing to stop for this profile'
  fireNotify('Stop all', msg, 'stop')
  return { ok: true, message: msg, stopped }
}

export function launchToolById(id: string, optionId?: string): { ok: boolean; message: string } {
  const base = LAUNCH_CATALOG.find((t) => t.id === id)
  if (!base) return { ok: false, message: `Unknown tool: ${id}` }
  const tool = resolveLaunchEntry(base, optionId)
  if (!tool) return { ok: false, message: 'Unknown download platform' }
  const existingPid = launchedPids.get(profileRuntimeKey(id))
  if (base.launchOptions?.length && existingPid && isPidAlive(existingPid)) {
    return { ok: false, message: 'Stop the running downloader before launching another platform' }
  }

  if (id === 'ollama') {
    return startOllama()
  }

  if (!fs.existsSync(tool.path)) {
    const msg = `Folder missing: ${tool.path}`
    fireNotify(`Launch failed · ${id}`, msg, 'critical', id)
    return { ok: false, message: msg }
  }

  const cmd = tool.launch.trim()
  const commandFingerprint = createHash('sha256')
    .update(`${tool.path}\n${cmd}`)
    .digest('hex')
    .slice(0, 12)
  appendConsole(id, `Preflight cwd=${tool.path} command=${commandFingerprint}`, 'sys')
  const isBat = /\.bat$/i.test(cmd) || /\.cmd$/i.test(cmd)
  const env = spawnEnvForTool(tool)

  try {
    if (isBat) {
      const batPath = path.isAbsolute(cmd) ? cmd : path.join(tool.path, cmd)
      if (!fs.existsSync(batPath)) {
        const msg = `Missing launcher: ${batPath}`
        fireNotify(`Launch failed · ${id}`, msg, 'critical', id)
        return { ok: false, message: msg }
      }

      if (tool.openInWindow) {
        // Open a visible console without `start` — empty title breaks as `\\` on Windows.
        const spawnOpts = {
          cwd: tool.path,
          detached: true,
          stdio: 'ignore' as const,
          windowsHide: false,
          env,
          creationFlags: 0x00000010, // CREATE_NEW_CONSOLE
        }
        const child = spawn('cmd.exe', ['/c', batPath], spawnOpts as SpawnOptions)
        trackChild(id, child, path.basename(batPath))
        child.unref()
        appendConsole(id, `Opened ${path.basename(batPath)} in a new window`, 'sys')
        fireNotify(`Launched ${id}`, `${path.basename(batPath)} (window)`, 'ok', id)
        return { ok: true, message: `Opened ${path.basename(batPath)} in a new window` }
      }

      const child = spawn('cmd.exe', ['/c', batPath], {
        cwd: tool.path,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: false,
        env,
      })
      trackChild(id, child, path.basename(batPath))
      fireNotify(`Launched ${id}`, path.basename(batPath), 'ok', id)
      return { ok: true, message: `Started ${path.basename(batPath)}` }
    }

    if (id === 'ollama' || /^ollama(\.exe)?$/i.test(cmd)) {
      return startOllama()
    }

    const parts = cmd.split(/\s+/)
    let exe = parts[0]
    const args = parts.slice(1)
    if (/^python(w)?(\.exe)?$/i.test(exe)) {
      exe = resolvePython(tool.path)
    }

    const child = spawn(exe, args, {
      cwd: tool.path,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      windowsHide: false,
      env,
    })
    const label = `${path.basename(exe)} ${args.join(' ')}`.trim()
    trackChild(id, child, label)
    fireNotify(`Launched ${id}`, label, 'ok', id)
    return { ok: true, message: `Started ${label}` }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    fireNotify(`Launch failed · ${id}`, message, 'critical', id)
    return { ok: false, message }
  }
}

export function openPathOnDisk(folder: string): { ok: boolean; message: string } {
  if (!fs.existsSync(folder)) {
    try {
      fs.mkdirSync(folder, { recursive: true })
    } catch {
      return { ok: false, message: `Folder missing: ${folder}` }
    }
  }
  try {
    const child = spawn('cmd.exe', ['/c', 'start', '""', 'explorer.exe', folder], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.unref()
    return { ok: true, message: `Opened ${folder}` }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}

export function openFolderById(
  id: string,
  opts?: { which?: 'tool' | 'output'; optionId?: string },
): { ok: boolean; message: string } {
  const base = LAUNCH_CATALOG.find((t) => t.id === id)
  if (!base) return { ok: false, message: `Unknown tool: ${id}` }
  const tool = resolveLaunchEntry(base, opts?.optionId)
  if (!tool) return { ok: false, message: 'Unknown download platform' }

  let folder = tool.openPath || tool.path
  if (opts?.which === 'output') {
    const env = loadProfileToolSnapshot(tool).values
    const out = (env.OUTPUT_DIR || env.OUTPUT_PATH || env.SAVE_DIR || '').trim()
    if (out) {
      folder = path.isAbsolute(out) ? out : path.resolve(tool.path, out)
    } else if (tool.outputPath) {
      folder = tool.outputPath
    } else {
      // Common defaults next to the tool
      for (const candidate of ['output', 'outputs', 'out', 'exports', 'export', 'renders']) {
        const p = path.join(tool.path, candidate)
        if (fs.existsSync(p)) {
          folder = p
          break
        }
      }
    }
  }

  return openPathOnDisk(folder)
}
