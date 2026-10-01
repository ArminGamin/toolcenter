import type { ChildProcess } from 'node:child_process'
import type { ToolLaunchOption } from '../src/types.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  classifyLogLevel,
  fireNotify,
  loadVault,
  maybeNotifyConsoleError,
  type LogEntry,
  type LogLevel,
} from './cc-services.js'
import { archiveToolRunError } from './run-errors.js'
import {
  bindCurrentProfile,
  currentBusinessProfile,
  currentProfileDataDir,
  profileDataPath,
} from './business-profiles.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const TOOLSAI_ROOT = path.resolve(__dirname, '..', '..')

const MAX_CONSOLE_LINES = 900
const MAX_GLOBAL_LINES = 2000

type ConsoleState = {
  lines: LogEntry[]
  pid?: number
  running: boolean
  exitCode: number | null
  startedAt?: string
}

export const consoles = new Map<string, ConsoleState>()
const globalLogs = new Map<string, LogEntry[]>()
export const children = new Map<string, ChildProcess>()
export const launchedPids = new Map<string, number>()

export function profileRuntimeKey(id: string): string {
  if (id === 'ollama') return id
  return `${currentBusinessProfile().id}:${id}`
}

function currentGlobalLog(): LogEntry[] {
  const profileId = currentBusinessProfile().id
  let log = globalLogs.get(profileId)
  if (!log) {
    log = []
    globalLogs.set(profileId, log)
  }
  return log
}

export type LaunchEntry = {
  id: string
  path: string
  /** Folder shown/opened in Explorer (defaults to path). Use when settings live elsewhere. */
  openPath?: string
  /** Explicit default output folder for tools with nonstandard layouts. */
  outputPath?: string
  launch: string
  launchOptions?: ToolLaunchOption[]
  processMatch?: string
  settingsFile?: string
  settingsKeys?: string[]
  assets?: { key: string; file: string }[]
  /** Open in a visible console window (CLI tools that aren't GUIs). */
  openInWindow?: boolean
}

export function resolveLaunchEntry(tool: LaunchEntry, optionId?: string): LaunchEntry | undefined {
  if (!tool.launchOptions?.length) return optionId === undefined ? tool : undefined
  const option = optionId === undefined
    ? tool.launchOptions[0]
    : tool.launchOptions.find((candidate) => candidate.id === optionId)
  return option ? { ...tool, ...option, id: tool.id, launchOptions: undefined } : undefined
}

/** Sensible defaults shown in UI when the settings file is empty. */
export const SETTINGS_DEFAULTS: Record<string, Record<string, string>> = {
  scraper: {
    MAX_PAGES: '25',
    TIMEOUT: '15',
    RETRIES: '3',
    FETCH_CONCURRENCY: '8',
    MAX_API_PROBES: '15',
  },
  dc_scraper: {},
  gmail_script: {
    SMTP_PORT: '25',
    SMTP_TIMEOUT: '22',
    SKIP_SMTP: '0',
    DNS_TIMEOUT: '12',
  },
  ai_lead_finder: {
    OLLAMA_URL: 'http://127.0.0.1:11434',
    OLLAMA_MODEL: 'llama3.1:8b',
    // Match settings.py SCRAPE.fetch_workers default (was under-provisioned at 10)
    FETCH_WORKERS: '16',
    VERIFY_WORKERS: '4',
    SMTP_TIMEOUT: '6',
    SMTP_PORT: '25',
    SKIP_SMTP: '0',
    MAX_PAGES_DEFAULT: '250',
    PLAYWRIGHT_ENABLED: '0',
  },
  motion_blur: {
    FFMPEG_CRF: '16',
    FFMPEG_PRESET: 'slow',
    CONTRAST: '1.05',
    BRIGHTNESS: '0.02',
    SATURATION: '1.1',
  },
  video_creator: {
    OUTPUT_DIR: '',
    DEFAULT_FONT_SIZE: '54',
  },
  ollama: {
    OLLAMA_HOST: '127.0.0.1:11434',
    OLLAMA_MODEL: 'llama3.1:8b',
    OLLAMA_KEEP_ALIVE: '30m',
    OLLAMA_NUM_PARALLEL: '1',
  },
  ugc_slides: {
    GEMINI_MODEL: 'gemini-3.5-flash',
  },
  one_shot: {
    OLLAMA_MODEL: 'llama3.1:8b',
  },
}

export function resolvePython(cwd: string): string {
  // Prefer a tool-local venv, then system Python. Shared toolsai\.venv is last
  // resort — it often lacks packages other tools need (e.g. Video Creator / numpy).
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

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export function appendConsole(id: string, chunk: string, stream: 'out' | 'err' | 'sys' = 'out') {
  const key = profileRuntimeKey(id)
  let state = consoles.get(key)
  if (!state) {
    state = { lines: [], running: false, exitCode: null }
    consoles.set(key, state)
  }
  const prefix = stream === 'err' ? '[err] ' : stream === 'sys' ? '[cc] ' : ''
  for (const raw of chunk.replace(/\r\n/g, '\n').split('\n')) {
    if (!raw && stream !== 'sys') continue
    const level: LogLevel =
      stream === 'sys' && !/\bexit(?:ed)? code=[1-9]/i.test(raw)
        ? 'info'
        : classifyLogLevel(raw, stream)
    const entry: LogEntry = {
      text: `${prefix}${raw}`,
      level,
      toolId: id,
      at: new Date().toISOString(),
      profileId: currentBusinessProfile().id,
      profileName: currentBusinessProfile().name,
    }
    state.lines.push(entry)
    currentGlobalLog().push(entry)
    if (stream === 'err') maybeNotifyConsoleError(id, raw)
  }
  if (state.lines.length > MAX_CONSOLE_LINES) {
    state.lines = state.lines.slice(-MAX_CONSOLE_LINES)
  }
  const globalLog = currentGlobalLog()
  if (globalLog.length > MAX_GLOBAL_LINES) {
    globalLog.splice(0, globalLog.length - MAX_GLOBAL_LINES)
  }
}

export function trackChild(id: string, child: ChildProcess, label: string, opts?: { sideJob?: boolean }) {
  const key = profileRuntimeKey(id)
  const trackId = opts?.sideJob ? `${key}:job` : key
  children.set(trackId, child)
  if (child.pid && !opts?.sideJob) {
    launchedPids.set(key, child.pid)
  }

  const state: ConsoleState = {
    lines: consoles.get(key)?.lines.slice(-200) || [],
    pid: opts?.sideJob ? consoles.get(key)?.pid : child.pid,
    running: true,
    exitCode: null,
    startedAt: consoles.get(key)?.startedAt || new Date().toISOString(),
  }
  consoles.set(key, state)
  appendConsole(id, `Started ${label}${child.pid ? ` (pid ${child.pid})` : ''}`, 'sys')

  const pending: Record<'out' | 'err', string> = { out: '', err: '' }
  const onData = (buf: Buffer, stream: 'out' | 'err') => {
    pending[stream] += buf.toString('utf8')
    const lines = pending[stream].split(/\r?\n/)
    pending[stream] = lines.pop() || ''
    for (const line of lines) appendConsole(id, line, stream)
  }
  const flush = (stream: 'out' | 'err') => {
    if (pending[stream]) appendConsole(id, pending[stream], stream)
    pending[stream] = ''
  }
  child.stdout?.on('data', (b: Buffer) => onData(b, 'out'))
  child.stderr?.on('data', (b: Buffer) => onData(b, 'err'))
  child.stdout?.on('end', () => flush('out'))
  child.stderr?.on('end', () => flush('err'))
  child.on('error', bindCurrentProfile((err) => {
    appendConsole(id, err.message, 'err')
    fireNotify(`${id} spawn error`, err.message, 'critical', id)
  }))
  child.on('exit', bindCurrentProfile((code, signal) => {
    children.delete(trackId)
    if (!opts?.sideJob) {
      state.running = false
      state.exitCode = code
      if (launchedPids.get(key) === child.pid) launchedPids.delete(key)
    }
    appendConsole(
      id,
      `Exited code=${code ?? 'null'} signal=${signal ?? 'none'}${opts?.sideJob ? ' (job)' : ''}`,
      'sys',
    )
    // Soft notify only — Traceback/Fatal lines already escalate to @everyone
    if (code && code !== 0) {
      fireNotify(`${id} exited`, `Exit code ${code}`, 'err', id)
    }
    // Persist compact error pack only when something actually went wrong
    try {
      const snap = consoles.get(key)
      if (snap) {
        archiveToolRunError({
          toolId: id,
          exitCode: typeof code === 'number' ? code : null,
          entries: snap.lines,
        })
      }
    } catch {
      /* never break launch path */
    }
  }))
}

export function getConsole(id: string): {
  ok: boolean
  lines: string[]
  entries: LogEntry[]
  running: boolean
  pid?: number
  exitCode: number | null
  startedAt?: string
} {
  if (id === '__all__' || id === 'global') {
    const globalLog = currentGlobalLog()
    const prefix = `${currentBusinessProfile().id}:`
    return {
      ok: true,
      lines: globalLog.map((e) => `[${e.toolId}] ${e.text}`),
      entries: [...globalLog],
      running: [...consoles.entries()].some(
        ([key, state]) => (key.startsWith(prefix) || key === 'ollama') && state.running,
      ),
      exitCode: null,
    }
  }
  const state = consoles.get(profileRuntimeKey(id))
  if (!state) {
    return { ok: true, lines: [], entries: [], running: false, exitCode: null }
  }
  return {
    ok: true,
    lines: state.lines.map((e) => e.text),
    entries: state.lines,
    running: state.running,
    pid: state.pid,
    exitCode: state.exitCode,
    startedAt: state.startedAt,
  }
}

export function clearConsole(id: string): { ok: boolean; message: string } {
  if (id === '__all__' || id === 'global') {
    currentGlobalLog().length = 0
    return { ok: true, message: 'Global logs cleared' }
  }
  const key = profileRuntimeKey(id)
  const prev = consoles.get(key)
  consoles.set(key, {
    lines: [],
    running: prev?.running || false,
    pid: prev?.pid,
    exitCode: prev?.exitCode ?? null,
    startedAt: prev?.startedAt,
  })
  return { ok: true, message: 'Console cleared' }
}

export function parseEnv(text: string): Record<string, string> {
  const map: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!m) continue
    let val = m[2].trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    map[m[1]] = val
  }
  return map
}

export function readEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {}
  try {
    return parseEnv(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return {}
  }
}

/** Merge defaults + .env + control-center.env for spawn / settings UI. */
export function loadToolEnv(tool: LaunchEntry): Record<string, string> {
  const defaults = SETTINGS_DEFAULTS[tool.id] || {}
  const fromDot = readEnvFile(path.join(tool.path, '.env'))
  const fromCc = readEnvFile(path.join(tool.path, 'control-center.env'))
  const primary = tool.settingsFile
    ? readEnvFile(path.join(tool.path, tool.settingsFile))
    : {}
  return { ...defaults, ...fromDot, ...fromCc, ...primary }
}

type ProfileToolSnapshot = {
  version: 1
  values: Record<string, string>
  assets: Record<string, string>
  capturedAt?: string
}

function profileToolDir(tool: LaunchEntry) {
  return profileDataPath('external-tools', tool.id)
}

function profileToolSnapshotFile(tool: LaunchEntry) {
  return path.join(profileToolDir(tool), 'settings.json')
}

function captureLegacyToolSnapshot(tool: LaunchEntry): ProfileToolSnapshot {
  const source = loadToolEnv(tool)
  const values: Record<string, string> = {}
  for (const key of tool.settingsKeys || []) values[key] = source[key] ?? ''
  const assets: Record<string, string> = {}
  for (const asset of tool.assets || []) {
    const file = path.join(tool.path, asset.file)
    assets[asset.key] = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  }
  return { version: 1, values, assets, capturedAt: new Date().toISOString() }
}

export function loadProfileToolSnapshot(tool: LaunchEntry): ProfileToolSnapshot {
  const file = profileToolSnapshotFile(tool)
  if (fs.existsSync(file)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<ProfileToolSnapshot>
      return {
        version: 1,
        values: parsed.values && typeof parsed.values === 'object' ? parsed.values : {},
        assets: parsed.assets && typeof parsed.assets === 'object' ? parsed.assets : {},
        ...(typeof parsed.capturedAt === 'string' ? { capturedAt: parsed.capturedAt } : {}),
      }
    } catch {
      // Recreate a safe snapshot below.
    }
  }
  const profile = currentBusinessProfile()
  const snapshot = profile.migrated
    ? captureLegacyToolSnapshot(tool)
    : { version: 1 as const, values: {}, assets: {} }
  fs.mkdirSync(profileToolDir(tool), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(snapshot, null, 2), 'utf8')
  return snapshot
}

export function saveProfileToolSnapshot(
  tool: LaunchEntry,
  valueUpdates: Record<string, string>,
  assetUpdates: Record<string, string> = {},
): ProfileToolSnapshot {
  const current = loadProfileToolSnapshot(tool)
  const allowedValues = new Set(tool.settingsKeys || [])
  const allowedAssets = new Set((tool.assets || []).map((asset) => asset.key))
  const next: ProfileToolSnapshot = {
    version: 1,
    values: { ...current.values },
    assets: { ...current.assets },
    capturedAt: current.capturedAt,
  }
  for (const [key, value] of Object.entries(valueUpdates)) {
    if (allowedValues.has(key)) next.values[key] = String(value ?? '')
  }
  for (const [key, value] of Object.entries(assetUpdates)) {
    if (allowedAssets.has(key)) next.assets[key] = String(value ?? '')
  }
  fs.mkdirSync(profileToolDir(tool), { recursive: true })
  fs.writeFileSync(profileToolSnapshotFile(tool), JSON.stringify(next, null, 2), 'utf8')
  return next
}

function materializeProfileToolAssets(tool: LaunchEntry, snapshot: ProfileToolSnapshot) {
  const assetDir = path.join(profileToolDir(tool), 'assets')
  fs.mkdirSync(assetDir, { recursive: true })
  const paths: Record<string, string> = {}
  for (const asset of tool.assets || []) {
    const target = path.join(assetDir, path.basename(asset.file))
    fs.writeFileSync(target, snapshot.assets[asset.key] || '', 'utf8')
    paths[asset.key] = target
  }
  return paths
}

export function spawnEnvForTool(tool: LaunchEntry): NodeJS.ProcessEnv {
  const vault = loadVault()
  const snapshot = loadProfileToolSnapshot(tool)
  const defaults = SETTINGS_DEFAULTS[tool.id] || {}
  const loaded = { ...defaults, ...snapshot.values }
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const [k, v] of Object.entries(vault)) {
    if (v !== undefined && v !== '' && k !== 'DISCORD_STATUS_WEBHOOK') env[k] = v
  }
  for (const [k, v] of Object.entries(loaded)) {
    if (v !== undefined && v !== '') env[k] = v
  }
  const outputDir = path.join(profileToolDir(tool), 'output')
  fs.mkdirSync(outputDir, { recursive: true })
  env.TOOLSAI_PROFILE_ID = currentBusinessProfile().id
  env.TOOLSAI_PROFILE_NAME = currentBusinessProfile().name
  env.TOOLSAI_PROFILE_DIR = currentProfileDataDir()
  env.CC_DATA_DIR = currentProfileDataDir()
  env.TOOLSAI_OUTPUT_DIR = outputDir
  if (tool.settingsKeys?.includes('OUTPUT_DIR') && !env.OUTPUT_DIR) env.OUTPUT_DIR = outputDir
  const assetPaths = materializeProfileToolAssets(tool, snapshot)
  for (const [key, value] of Object.entries(assetPaths)) {
    env[`TOOLSAI_ASSET_${key.toUpperCase()}`] = value
  }
  // Windows pipes default Python stdout to cp1252. Several tools print
  // Lithuanian text / Unicode symbols and crashed before their server started.
  env.PYTHONIOENCODING = 'utf-8'
  env.PYTHONUTF8 = '1'
  return env
}

export function ensureToolPath(tool: LaunchEntry): boolean {
  if (fs.existsSync(tool.path)) return true
  try {
    fs.mkdirSync(tool.path, { recursive: true })
    return true
  } catch {
    return false
  }
}
