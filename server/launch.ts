import { execFile, spawn, type SpawnOptions } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import type { Connect } from 'vite'
import {
  createBackup,
  fireNotify,
  loadVault,
  saveVault,
  VAULT_FIELDS,
} from './cc-services.js'
import {
  appendConsole,
  children,
  clearConsole,
  consoles,
  ensureToolPath,
  getConsole,
  isPidAlive,
  launchedPids,
  loadProfileToolSnapshot,
  profileRuntimeKey,
  resolvePython,
  resolveLaunchEntry,
  SETTINGS_DEFAULTS,
  saveProfileToolSnapshot,
  spawnEnvForTool,
  TOOLSAI_ROOT,
  trackChild,
  type LaunchEntry,
} from './launch-runtime.js'
import { UGC_DEFAULT_OLLAMA_MODEL } from './ugc-env-bridge.js'
import { getAllToolReadiness } from './tool-readiness.js'
import { createDiagnosticPack } from './diagnostic-pack.js'
import { MEDIA_TOOL_CATALOG } from '../src/data/media-tools.js'

export { clearConsole, getConsole } from './launch-runtime.js'
import {
  clearRunErrors,
  deleteRunError,
  getRunError,
  listRunErrors,
} from './run-errors.js'
import { getOrCreateApiToken, requireApiToken } from './cc-auth.js'
import { getAllSourceHealth } from './markets-health.js'
import { ensureMarketsLive } from './markets-live.js'
import { getId, readJsonBody, sendJson } from './middleware/http.js'
import { attachAssistantRoutes } from './routes/assistant-routes.js'
import { attachGroupPosterRoutes } from './routes/group-poster-routes.js'
import { attachRedditCommenterRoutes } from './routes/reddit-commenter-routes.js'
import { attachUgcSlidesRoutes } from './routes/ugc-slides-routes.js'
import { attachOneShotRoutes } from './routes/one-shot-routes.js'
import { attachMediaEmbedRoutes } from './routes/media-embed-routes.js'
import { attachHubRoutes } from './routes/hub-routes.js'
import { attachMarketsRoutes } from './routes/markets-routes.js'
import { attachNotesRoutes } from './routes/notes-routes.js'
import { attachSearchRoutes } from './routes/search-routes.js'
import { pipelineApiMiddleware } from './routes/pipeline-routes.js'
import { attachOutreachRoutes } from './routes/outreach-routes.js'
import { attachSeoBlogRoutes } from './routes/seo-blog-routes.js'
import {
  importPostMakerOllamaToVault,
  resolveUgcVaultSettings,
} from './ugc-env-bridge.js'
import {
  businessProfileFromHeader,
  createBusinessProfile,
  currentBusinessProfile,
  deleteBusinessProfile,
  listBusinessProfiles,
  profileDataPath,
  renameBusinessProfile,
  runWithBusinessProfile,
} from './business-profiles.js'

const execFileAsync = promisify(execFile)

const EBOOK = path.join(
  process.env.USERPROFILE || 'C:\\Users\\kajus',
  'Desktop',
  'Ebook biznis',
  'tavo-knyga-generator',
)
const OLLAMA_EXE =
  process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'Programs', 'Ollama', 'ollama.exe')
    : 'ollama'

let cmdlineCache = { at: 0, text: '' }

const TAVO_KEYS = [
  'LLM_PROVIDER',
  'OLLAMA_URL',
  'OLLAMA_MODEL',
  'SITE_URL',
  'TARGET_MIN_PAGES',
  'MAX_PAGES',
  'PDF_SCALE',
  'OLLAMA_NUM_CTX',
  'OLLAMA_NUM_GPU',
  'OLLAMA_KEEP_ALIVE',
]

const SEO_BLOG_KEYS = [
  'OLLAMA_URL',
  'OLLAMA_MODEL',
  'OLLAMA_NUM_CTX',
  'OLLAMA_NUM_GPU',
  'OLLAMA_KEEP_ALIVE',
  'SITE_URL',
  'POSTS_PER_RUN',
  'AUTO_PUSH',
  'INDEXNOW_KEY',
]

const UGC_SLIDES_KEYS = [
  'OLLAMA_URL',
  'OLLAMA_MODEL',
  'OLLAMA_NUM_GPU',
  'DISCORD_BOT_TOKEN',
  'DISCORD_GUILD_ID',
  'DISCORD_CATEGORY_ID',
  'UGC_BATCH_TEST_MODE',
]

const ONE_SHOT_KEYS = [
  'OLLAMA_URL',
  'OLLAMA_MODEL',
  'OLLAMA_NUM_GPU',
  'DISCORD_BOT_TOKEN',
  'DISCORD_GUILD_ID',
  'DISCORD_CATEGORY_ID',
]

export const LAUNCH_CATALOG: LaunchEntry[] = [
  {
    id: 'scraper',
    path: path.join(TOOLSAI_ROOT, 'scraper'),
    launch: 'python gui.py',
    processMatch: 'scraper\\gui.py',
    settingsFile: 'control-center.env',
    settingsKeys: [
      'MAX_PAGES',
      'TIMEOUT',
      'RETRIES',
      'FETCH_CONCURRENCY',
      'MAX_API_PROBES',
      'OUTPUT_DIR',
    ],
  },
  {
    id: 'dc_scraper',
    path: path.join(TOOLSAI_ROOT, 'dc scraper'),
    launch: 'python 1.py',
    processMatch: 'dc scraper\\1.py',
    settingsFile: 'control-center.env',
    settingsKeys: ['DISCORD_BOT_TOKEN', 'DISCORD_CHANNEL_ID'],
  },
  {
    id: 'newsletter_sender',
    path: path.join(TOOLSAI_ROOT, 'newsletter-sender'),
    launch: 'run.bat',
    processMatch: 'newsletter-sender',
    settingsFile: '.env',
    settingsKeys: [
      'RESEND_API_KEY',
      'RESEND_FROM',
      'NEWSLETTER_SUBJECT',
      'ROTATE_SUBJECTS',
      'DISCORD_NEWSLETTER_SEND_WEBHOOK_URL',
    ],
    assets: [
      { key: 'email_html', file: 'promo-email.html' },
      { key: 'subjects', file: 'subjects.txt' },
    ],
  },
  {
    id: 'post_maker',
    path: path.join(TOOLSAI_ROOT, 'post-maker'),
    launch: 'python main.py',
    processMatch: 'post-maker\\main.py',
    settingsFile: '.env',
    settingsKeys: [
      'DISCORD_BOT_TOKEN',
      'DISCORD_GUILD_ID',
      'DISCORD_CATEGORY_ID',
      'OLLAMA_URL',
      'OLLAMA_MODEL',
    ],
  },
  {
    id: 'ugc_slides',
    path: path.join(TOOLSAI_ROOT, 'control-center'),
    launch: '',
    settingsKeys: [...UGC_SLIDES_KEYS],
  },
  {
    id: 'one_shot',
    path: path.join(TOOLSAI_ROOT, 'control-center'),
    launch: '',
    settingsFile: 'assets/one-shot/settings.env',
    settingsKeys: [...ONE_SHOT_KEYS],
  },
  {
    id: 'ai_lead_finder',
    path: path.join(TOOLSAI_ROOT, 'ai-lead-finder'),
    launch: 'run.bat',
    processMatch: 'ai-lead-finder',
    settingsFile: 'control-center.env',
    settingsKeys: [
      'OLLAMA_URL',
      'OLLAMA_MODEL',
      'FETCH_WORKERS',
      'VERIFY_WORKERS',
      'SMTP_TIMEOUT',
      'SMTP_PORT',
      'SKIP_SMTP',
      'MAX_PAGES_DEFAULT',
      'PLAYWRIGHT_ENABLED',
    ],
  },
  {
    id: 'gmail_script',
    path: path.join(TOOLSAI_ROOT, 'gmail script'),
    launch: 'python gmail1_gui.py',
    processMatch: 'gmail1_gui.py',
    settingsFile: 'control-center.env',
    settingsKeys: ['SMTP_PORT', 'SMTP_TIMEOUT', 'SKIP_SMTP', 'DNS_TIMEOUT'],
  },
  {
    id: 'video_creator',
    path: path.join(TOOLSAI_ROOT, 'Video Creator'),
    launch: 'python app.py',
    processMatch: 'app.py',
    settingsFile: 'control-center.env',
    settingsKeys: ['OUTPUT_DIR', 'DEFAULT_FONT_SIZE'],
  },
  {
    id: 'motion_blur',
    path: path.join(TOOLSAI_ROOT, 'motion blur'),
    launch: 'add_blur.bat',
    processMatch: 'motion blur',
    openInWindow: true,
    settingsFile: 'control-center.env',
    settingsKeys: ['FFMPEG_CRF', 'FFMPEG_PRESET', 'CONTRAST', 'BRIGHTNESS', 'SATURATION'],
  },
  {
    id: 'ollama',
    path: path.join(TOOLSAI_ROOT, '.control-center-data', 'ollama'),
    openPath: path.dirname(OLLAMA_EXE),
    launch: 'ollama.exe',
    processMatch: 'ollama',
    settingsFile: 'control-center.env',
    settingsKeys: ['OLLAMA_HOST', 'OLLAMA_MODEL', 'OLLAMA_KEEP_ALIVE', 'OLLAMA_NUM_PARALLEL'],
  },
  {
    id: 'tavo_knyga_ui',
    path: EBOOK,
    launch: 'python run_ui.py',
    processMatch: 'run_ui.py',
    settingsFile: '.env',
    settingsKeys: [...TAVO_KEYS],
  },
  {
    id: 'tavo_factory_ui',
    path: EBOOK,
    launch: 'python run_factory_ui.py',
    processMatch: 'run_factory_ui.py',
    settingsFile: '.env',
    settingsKeys: [...TAVO_KEYS],
  },
  {
    id: 'tavo_health_ui',
    path: EBOOK,
    launch: 'python run_health_ui.py',
    processMatch: 'run_health_ui.py',
    settingsFile: '.env',
    settingsKeys: [...TAVO_KEYS],
  },
  {
    id: 'autoplius_bot',
    path: path.join(TOOLSAI_ROOT, 'autoplius-bot'),
    launch: 'run.bat',
    processMatch: 'streamlit',
    openInWindow: true,
  },
  {
    id: 'tavo_seo_blog',
    path: EBOOK,
    launch: 'python run_seo_blog_ui.py',
    processMatch: 'run_seo_blog_ui.py',
    settingsFile: '.env',
    settingsKeys: [...SEO_BLOG_KEYS],
    openPath: path.join(EBOOK, '..', 'content', 'straipsniai'),
  },
  {
    id: 'reddit_commenter',
    path: path.join(TOOLSAI_ROOT, 'reddit-commenter'),
    launch: 'python worker.py',
    processMatch: 'reddit-commenter\\worker.py',
  },
  ...MEDIA_TOOL_CATALOG.map(({ id, path, launch, launchOptions, processMatch, openInWindow, outputPath }) => ({
    id, path, launch, launchOptions, processMatch, openInWindow, outputPath,
  })),
]

async function getProcessCmdlines(): Promise<string> {
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

function resolveOllamaBaseUrl(tool?: LaunchEntry): string {
  const loaded = tool ? loadProfileToolSnapshot(tool).values : {}
  const vault = loadVault()
  const raw = (
    loaded.OLLAMA_HOST ||
    loaded.OLLAMA_URL ||
    vault.OLLAMA_HOST ||
    vault.OLLAMA_URL ||
    '127.0.0.1:11434'
  ).trim()
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/$/, '')
  return `http://${raw.replace(/\/$/, '')}`
}

/** Sticky health — Ollama often stalls briefly while loading/serving a model. */
const ollamaHealth = {
  up: false,
  fails: 0,
  /** Last raw probe result cache (ms) */
  probedAt: 0,
  probedOk: false,
}

const OLLAMA_PROBE_CACHE_MS = 2000
const OLLAMA_FAIL_THRESHOLD = 3
const OLLAMA_PROBE_TIMEOUT_MS = 4500

async function probeOllamaHttpRaw(): Promise<boolean> {
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

async function isOllamaHttpUp(): Promise<boolean> {
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

function resolveOllamaModel(model?: string): string {
  const tool = LAUNCH_CATALOG.find((t) => t.id === 'ollama')
  return (
    (model && model.trim()) ||
    (tool && (loadProfileToolSnapshot(tool).values.OLLAMA_MODEL || loadVault().OLLAMA_MODEL)) ||
    'llama3.1:8b'
  )
}

function normalizeOllamaModelKey(name: string): string {
  return name.trim().replace(/:latest$/i, '').toLowerCase()
}

/** Models to pull: selected/default tool model + UGC Lithuanian model (deduped). */
export function resolveOllamaPullModels(model?: string): string[] {
  const primary = resolveOllamaModel(model)
  const out: string[] = []
  const seen = new Set<string>()
  for (const name of [primary, UGC_DEFAULT_OLLAMA_MODEL]) {
    const trimmed = name.trim()
    if (!trimmed) continue
    const key = normalizeOllamaModelKey(trimmed)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
  }
  return out
}

function ollamaExePath(): string {
  return fs.existsSync(OLLAMA_EXE) ? OLLAMA_EXE : 'ollama'
}

/** Open interactive CMD: `ollama pull <model>` (progress bars need a real TTY). */
function openOllamaPullWindow(model?: string): {
  ok: boolean
  message: string
  model: string
  models: string[]
} {
  const pullModels = resolveOllamaPullModels(model)
  const pullModel = pullModels[0] || resolveOllamaModel(model)
  const tool = LAUNCH_CATALOG.find((t) => t.id === 'ollama')
  const env = tool ? spawnEnvForTool(tool) : { ...process.env }
  try {
    const exe = ollamaExePath()
    const quotedExe = `"${exe.replace(/"/g, '')}"`
    const pullCmd = pullModels.map((m) => `${quotedExe} pull ${m}`).join(' && ')
    const child = spawn(
      'cmd.exe',
      ['/c', 'start', '""', 'cmd.exe', '/k', pullCmd],
      {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
        env,
      },
    )
    child.unref()
    appendConsole('ollama', pullCmd, 'sys')
    const message =
      pullModels.length > 1
        ? `Pulling ${pullModels.join(' + ')}`
        : `ollama pull ${pullModel}`
    fireNotify('Ollama pull', message, 'info', 'ollama')
    return { ok: true, message, model: pullModel, models: pullModels }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    fireNotify('Ollama pull failed', message, 'err', 'ollama')
    return { ok: false, message, model: pullModel, models: pullModels }
  }
}

function ensureOllamaServeBackground(): void {
  const tool = LAUNCH_CATALOG.find((t) => t.id === 'ollama')
  const env = tool ? spawnEnvForTool(tool) : { ...process.env }
  try {
    const exe = ollamaExePath()
    const child = spawn(exe, ['serve'], {
      stdio: ['ignore', 'ignore', 'ignore'],
      windowsHide: true,
      shell: false,
      detached: true,
      env,
    })
    child.unref()
    appendConsole('ollama', 'Started ollama serve (background)', 'sys')
  } catch {
    // Tray/app may already be serving — pull window still works if so
  }
}

export function startOllama(model?: string): { ok: boolean; message: string } {
  // Start = ensure serve, then open the same pull flow the user expects in CMD
  ensureOllamaServeBackground()
  const result = openOllamaPullWindow(model)
  return { ok: result.ok, message: result.message }
}

export function runOllamaPull(model?: string): { ok: boolean; message: string } {
  const result = openOllamaPullWindow(model)
  return { ok: result.ok, message: result.message }
}

export function runOllamaModel(model?: string): { ok: boolean; message: string } {
  const tool = LAUNCH_CATALOG.find((t) => t.id === 'ollama')
  const selected = resolveOllamaModel(model)
  const env = tool ? spawnEnvForTool(tool) : { ...process.env }
  try {
    const exe = ollamaExePath()
    const child = spawn(
      'cmd.exe',
      ['/c', 'start', '""', 'cmd.exe', '/k', `"${exe.replace(/"/g, '')}" run ${selected}`],
      {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
        env,
      },
    )
    child.unref()
    appendConsole('ollama', `ollama run ${selected}`, 'sys')
    fireNotify('Ollama run', selected, 'ok', 'ollama')
    return { ok: true, message: `ollama run ${selected}` }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    fireNotify('Ollama run failed', message, 'err', 'ollama')
    return { ok: false, message }
  }
}

export async function listOllamaModels(): Promise<{
  ok: boolean
  models: string[]
  message?: string
}> {
  const tool = LAUNCH_CATALOG.find((t) => t.id === 'ollama')
  const base = resolveOllamaBaseUrl(tool)
  try {
    const res = await fetch(`${base}/api/tags`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      return { ok: false, models: [], message: `Ollama HTTP ${res.status}` }
    }
    const data = (await res.json()) as { models?: { name?: string; model?: string }[] }
    const models = (data.models || [])
      .map((m) => m.name || m.model || '')
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
    return { ok: true, models }
  } catch (err) {
    return {
      ok: false,
      models: [],
      message: err instanceof Error ? err.message : 'Ollama offline',
    }
  }
}

export function runToolAction(
  id: string,
  action: string,
  extra?: { model?: string },
): { ok: boolean; message: string } {
  if (action === 'ollama_start') return startOllama(extra?.model)
  if (action === 'ollama_pull') return runOllamaPull(extra?.model)
  if (action === 'ollama_run') return runOllamaModel(extra?.model)
  if (action === 'ollama_setup') {
    const script = path.join(EBOOK, 'scripts', 'setup_ollama.py')
    if (!fs.existsSync(script)) return { ok: false, message: 'setup_ollama.py not found' }
    const py = resolvePython(EBOOK)
    const tool = LAUNCH_CATALOG.find((t) => t.id === 'ollama')
    const child = spawn(py, [script], {
      cwd: EBOOK,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: false,
      env: tool ? spawnEnvForTool(tool) : process.env,
    })
    trackChild('ollama', child, 'setup_ollama.py', { sideJob: true })
    fireNotify('Ollama setup', 'setup_ollama.py', 'info', 'ollama')
    return { ok: true, message: 'Running setup_ollama.py' }
  }

  const tool = LAUNCH_CATALOG.find((t) => t.id === id)
  if (!tool) return { ok: false, message: `Unknown tool: ${id}` }
  if (!fs.existsSync(tool.path)) return { ok: false, message: `Folder missing: ${tool.path}` }

  const py = resolvePython(tool.path)
  const commands: Record<string, string[]> = {
    fetch_seeds: ['scripts/fetch_internet_recipe_seeds.py'],
    build_db: [
      'build_recipe_database.py',
      '--target',
      '5400',
      '--drafter',
      'template',
      '--workers',
      '4',
    ],
    build_report: ['build_recipe_database.py', '--report'],
    strict_readiness: ['build_recipe_database.py', '--strict-readiness'],
  }

  const args = commands[action]
  if (!args) return { ok: false, message: `Unknown action: ${action}` }

  try {
    const child = spawn(py, args, {
      cwd: tool.path,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: false,
      env: spawnEnvForTool(tool),
    })
    trackChild(id, child, `python ${args.join(' ')}`)
    fireNotify(`Action · ${id}`, action, 'info', id)
    return { ok: true, message: `Started: python ${args.join(' ')}` }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    fireNotify(`Action failed · ${id}`, message, 'err', id)
    return { ok: false, message }
  }
}

export function getToolSettings(id: string): {
  ok: boolean
  message?: string
  values?: Record<string, string>
  assets?: Record<string, string>
  file?: string
} {
  const tool = LAUNCH_CATALOG.find((t) => t.id === id)
  if (!tool) return { ok: false, message: 'Unknown tool' }

  const values: Record<string, string> = {}
  if (tool.settingsKeys?.length) {
    const defaults = SETTINGS_DEFAULTS[tool.id] || {}
    if (tool.id === 'ugc_slides') {
      importPostMakerOllamaToVault()
      const merged = resolveUgcVaultSettings()
      for (const key of tool.settingsKeys) {
        values[key] = merged[key as keyof typeof merged] ?? defaults[key] ?? ''
      }
    } else if (tool.settingsFile) {
      const loaded = loadProfileToolSnapshot(tool).values
      for (const key of tool.settingsKeys) {
        if (Object.prototype.hasOwnProperty.call(loaded, key) && loaded[key] !== '') {
          values[key] = loaded[key]
        } else if (defaults[key] !== undefined && defaults[key] !== '') {
          values[key] = defaults[key]
        } else {
          values[key] = loadVault()[key] ?? ''
        }
      }
    } else {
      const vault = loadVault()
      for (const key of tool.settingsKeys) {
        values[key] = vault[key] ?? defaults[key] ?? ''
      }
    }
  }

  const snapshot = loadProfileToolSnapshot(tool)
  const assets: Record<string, string> = {}
  for (const asset of tool.assets || []) assets[asset.key] = snapshot.assets[asset.key] || ''

  return {
    ok: true,
    values,
    assets,
    file: tool.settingsFile ? `${currentBusinessProfile().name} profile` : undefined,
  }
}

export function saveToolSettings(
  id: string,
  updates: Record<string, string>,
  assetUpdates?: Record<string, string>,
): { ok: boolean; message: string } {
  const tool = LAUNCH_CATALOG.find((t) => t.id === id)
  if (!tool) return { ok: false, message: 'Unknown tool' }
  if (!ensureToolPath(tool)) {
    return { ok: false, message: `Folder missing: ${tool.path}` }
  }

  const saved: string[] = []

  if (tool.settingsFile && tool.settingsKeys?.length) {
    saveProfileToolSnapshot(tool, updates, assetUpdates || {})
    saved.push(`${currentBusinessProfile().name} settings`)
  } else if (tool.settingsKeys?.length) {
    const vaultUpdates: Record<string, string> = {}
    for (const key of tool.settingsKeys) {
      if (Object.prototype.hasOwnProperty.call(updates, key)) {
        vaultUpdates[key] = updates[key]
      }
    }
    if (Object.keys(vaultUpdates).length) {
      const res = saveVault(vaultUpdates)
      if (res.ok) saved.push('vault')
    }
  }

  if (assetUpdates && tool.assets?.length && !tool.settingsFile) {
    saveProfileToolSnapshot(tool, {}, assetUpdates)
    saved.push(`${currentBusinessProfile().name} assets`)
  }

  if (!saved.length) {
    return { ok: false, message: 'Nothing to save for this tool' }
  }
  fireNotify(`Settings saved · ${id}`, saved.join(', '), 'info', id)
  return { ok: true, message: `Saved ${saved.join(', ')}` }
}

const PROFILES_LEGACY = 'control-center-profiles.json'

type ProfilesFile = { profiles: Array<{
  name: string
  updatedAt: string
  settings: Record<string, string>
  assets: Record<string, string>
}> }

function profilesPath(toolPath: string, toolId?: string) {
  const name = toolId ? `control-center-profiles-${toolId}.json` : PROFILES_LEGACY
  return profileDataPath('legacy-tool-profiles', path.basename(toolPath), name)
}

function readProfiles(toolPath: string, toolId?: string): ProfilesFile {
  const preferred = profilesPath(toolPath, toolId)
  const legacy = profilesPath(toolPath)
  const file = fs.existsSync(preferred) ? preferred : legacy
  if (!fs.existsSync(file)) return { profiles: [] }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as ProfilesFile
    return { profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [] }
  } catch {
    return { profiles: [] }
  }
}

function writeProfiles(toolPath: string, data: ProfilesFile, toolId?: string) {
  const file = profilesPath(toolPath, toolId)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
}

export function listProfiles(id: string): {
  ok: boolean
  message?: string
  profiles?: { name: string; updatedAt: string }[]
} {
  const tool = LAUNCH_CATALOG.find((t) => t.id === id)
  if (!tool) return { ok: false, message: 'Unknown tool' }
  if (!ensureToolPath(tool)) {
    return { ok: false, message: `Folder missing: ${tool.path}` }
  }
  const data = readProfiles(tool.path, tool.id)
  return {
    ok: true,
    profiles: data.profiles.map((p) => ({ name: p.name, updatedAt: p.updatedAt })),
  }
}

export function saveProfile(
  id: string,
  name: string,
  settings: Record<string, string>,
  assets: Record<string, string>,
): { ok: boolean; message: string } {
  const tool = LAUNCH_CATALOG.find((t) => t.id === id)
  if (!tool) return { ok: false, message: 'Unknown tool' }
  if (!ensureToolPath(tool)) return { ok: false, message: `Folder missing: ${tool.path}` }
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, message: 'Profile name required' }

  const data = readProfiles(tool.path, tool.id)
  const next = {
    name: trimmed,
    updatedAt: new Date().toISOString(),
    settings: settings || {},
    assets: assets || {},
  }
  const idx = data.profiles.findIndex((p) => p.name.toLowerCase() === trimmed.toLowerCase())
  if (idx >= 0) data.profiles[idx] = next
  else data.profiles.push(next)
  writeProfiles(tool.path, data, tool.id)
  return { ok: true, message: `Profile “${trimmed}” saved` }
}

export function loadProfile(
  id: string,
  name: string,
): {
  ok: boolean
  message: string
  settings?: Record<string, string>
  assets?: Record<string, string>
} {
  const tool = LAUNCH_CATALOG.find((t) => t.id === id)
  if (!tool) return { ok: false, message: 'Unknown tool' }
  const data = readProfiles(tool.path, tool.id)
  const profile = data.profiles.find((p) => p.name.toLowerCase() === name.trim().toLowerCase())
  if (!profile) return { ok: false, message: `Profile “${name}” not found` }

  // Apply into tool files immediately
  const apply = saveToolSettings(id, profile.settings || {}, profile.assets || {})
  if (!apply.ok && (Object.keys(profile.settings || {}).length || Object.keys(profile.assets || {}).length)) {
    // still return values even if nothing configured to write
  }

  return {
    ok: true,
    message: `Loaded “${profile.name}”${apply.ok ? ` — ${apply.message}` : ''}`,
    settings: profile.settings || {},
    assets: profile.assets || {},
  }
}

export function deleteProfile(id: string, name: string): { ok: boolean; message: string } {
  const tool = LAUNCH_CATALOG.find((t) => t.id === id)
  if (!tool) return { ok: false, message: 'Unknown tool' }
  const data = readProfiles(tool.path, tool.id)
  const before = data.profiles.length
  data.profiles = data.profiles.filter((p) => p.name.toLowerCase() !== name.trim().toLowerCase())
  if (data.profiles.length === before) return { ok: false, message: `Profile “${name}” not found` }
  writeProfiles(tool.path, data, tool.id)
  return { ok: true, message: `Deleted “${name}”` }
}




export function attachLaunchMiddleware(middlewares: Connect.Server) {
  ensureMarketsLive()
  // Ensure API token exists (encrypted vault) before serving
  getOrCreateApiToken()

  // Gate mutating /api/* + sensitive GETs (vault/settings/profiles)
  middlewares.use((req, res, next) => {
    const url = req.url || ''
    if (!url.startsWith('/api/')) {
      next()
      return
    }
    if (!requireApiToken(req, res)) return
    next()
  })

  middlewares.use('/api/business-profiles', async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    try {
      if (req.method === 'GET') {
        sendJson(res, 200, { ok: true, profiles: listBusinessProfiles() })
        return
      }
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, message: 'GET or POST only' })
        return
      }
      const parsed = await readJsonBody(req)
      const action = String(parsed.action || '')
      if (action === 'create') {
        const profile = createBusinessProfile(String(parsed.name || ''))
        sendJson(res, 201, { ok: true, profile, profiles: listBusinessProfiles() })
        return
      }
      if (action === 'rename') {
        const profile = renameBusinessProfile(String(parsed.id || ''), String(parsed.name || ''))
        sendJson(res, 200, { ok: true, profile, profiles: listBusinessProfiles() })
        return
      }
      if (action === 'delete') {
        const result = deleteBusinessProfile(String(parsed.id || ''))
        sendJson(res, 200, {
          ok: true,
          deleted: result.deleted,
          recoverable: true,
          profiles: listBusinessProfiles(),
        })
        return
      }
      sendJson(res, 400, { ok: false, message: 'action must be create|rename|delete' })
    } catch (err) {
      sendJson(res, 400, {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  })

  middlewares.use('/api', (req, res, next) => {
    try {
      const queryProfile = new URL(req.url || '/', 'http://localhost').searchParams.get('profile')
      const profile = businessProfileFromHeader(req.headers['x-cc-profile'] || queryProfile)
      res.setHeader('X-CC-Profile', profile.id)
      runWithBusinessProfile(profile.id, next)
    } catch (err) {
      sendJson(res, 400, {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  })

  middlewares.use('/api/health', (_req, res) => {
    sendJson(res, 200, {
      ok: true,
      tools: LAUNCH_CATALOG.length,
      profile: currentBusinessProfile(),
    })
  })

  middlewares.use('/api/source-health', (_req, res) => {
    sendJson(res, 200, { ok: true, sources: getAllSourceHealth() })
  })

  middlewares.use('/api/runtime-status', async (_req, res) => {
    try {
      const status = await getRuntimeStatus()
      sendJson(res, 200, { ok: true, ...status })
    } catch (err) {
      sendJson(res, 500, {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  })

  middlewares.use('/api/readiness', (_req, res) => {
    const tools = getAllToolReadiness(LAUNCH_CATALOG)
    sendJson(res, 200, {
      ok: true,
      ready: tools.filter((tool) => tool.ready).length,
      total: tools.length,
      tools,
    })
  })

  middlewares.use('/api/diagnostic-pack', (_req, res) => {
    const body = createDiagnosticPack(getAllToolReadiness(LAUNCH_CATALOG))
    res.setHeader('Content-Disposition', `attachment; filename="toolsai-diagnostics-${Date.now()}.json"`)
    sendJson(res, 200, body)
  })

  attachHubRoutes(middlewares)
  attachAssistantRoutes(middlewares)
  attachNotesRoutes(middlewares)
  attachSearchRoutes(middlewares)
  middlewares.use('/api/pipeline', pipelineApiMiddleware)
  attachMarketsRoutes(middlewares)
  attachOutreachRoutes(middlewares)
  attachSeoBlogRoutes(middlewares)
  attachGroupPosterRoutes(middlewares)
  attachRedditCommenterRoutes(middlewares)
  attachUgcSlidesRoutes(middlewares)
  attachOneShotRoutes(middlewares)
  attachMediaEmbedRoutes(middlewares)

  middlewares.use('/api/launch', async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, message: 'POST only' })
      return
    }
    try {
      const parsed = await readJsonBody(req)
      const result = launchToolById(getId(req, parsed), typeof parsed.optionId === 'string' ? parsed.optionId : undefined)
      sendJson(res, result.ok ? 200 : 400, result)
    } catch {
      sendJson(res, 400, { ok: false, message: 'Invalid JSON' })
    }
  })

  middlewares.use('/api/open-folder', async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, message: 'POST only' })
      return
    }
    try {
      const parsed = await readJsonBody(req)
      if (typeof parsed.path === 'string' && parsed.path.trim()) {
        const result = openPathOnDisk(parsed.path.trim())
        sendJson(res, result.ok ? 200 : 400, result)
        return
      }
      const which = parsed.which === 'output' ? 'output' : 'tool'
      const result = openFolderById(getId(req, parsed), {
        which,
        optionId: typeof parsed.optionId === 'string' ? parsed.optionId : undefined,
      })
      sendJson(res, result.ok ? 200 : 400, result)
    } catch {
      sendJson(res, 400, { ok: false, message: 'Invalid JSON' })
    }
  })

  middlewares.use('/api/action', async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, message: 'POST only' })
      return
    }
    try {
      const parsed = await readJsonBody(req)
      const id = getId(req, parsed)
      const action = String(parsed.action || '')
      const model = typeof parsed.model === 'string' ? parsed.model : undefined
      const result = runToolAction(id, action, { model })
      sendJson(res, result.ok ? 200 : 400, result)
    } catch {
      sendJson(res, 400, { ok: false, message: 'Invalid JSON' })
    }
  })

  middlewares.use('/api/settings', async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    try {
      if (req.method === 'GET') {
        const id = getId(req, {})
        const result = getToolSettings(id)
        sendJson(res, result.ok ? 200 : 400, result)
        return
      }
      if (req.method === 'POST') {
        const parsed = await readJsonBody(req)
        const id = getId(req, parsed)
        const values = (parsed.values || {}) as Record<string, string>
        const assets = (parsed.assets || {}) as Record<string, string>
        const result = saveToolSettings(id, values, assets)
        sendJson(res, result.ok ? 200 : 400, result)
        return
      }
      sendJson(res, 405, { ok: false, message: 'GET or POST only' })
    } catch {
      sendJson(res, 400, { ok: false, message: 'Invalid request' })
    }
  })

  middlewares.use('/api/profiles', async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    try {
      if (req.method === 'GET') {
        const id = getId(req, {})
        const result = listProfiles(id)
        sendJson(res, result.ok ? 200 : 400, result)
        return
      }
      if (req.method === 'POST') {
        const parsed = await readJsonBody(req)
        const id = getId(req, parsed)
        const action = String(parsed.action || '')
        const name = String(parsed.name || '')
        if (action === 'save') {
          const result = saveProfile(
            id,
            name,
            (parsed.settings || {}) as Record<string, string>,
            (parsed.assets || {}) as Record<string, string>,
          )
          sendJson(res, result.ok ? 200 : 400, result)
          return
        }
        if (action === 'load') {
          const result = loadProfile(id, name)
          sendJson(res, result.ok ? 200 : 400, result)
          return
        }
        if (action === 'delete') {
          const result = deleteProfile(id, name)
          sendJson(res, result.ok ? 200 : 400, result)
          return
        }
        sendJson(res, 400, { ok: false, message: 'action must be save|load|delete' })
        return
      }
      sendJson(res, 405, { ok: false, message: 'GET or POST only' })
    } catch {
      sendJson(res, 400, { ok: false, message: 'Invalid request' })
    }
  })

  middlewares.use('/api/ollama-models', async (_req, res) => {
    try {
      const result = await listOllamaModels()
      sendJson(res, result.ok ? 200 : 503, result)
    } catch (err) {
      sendJson(res, 500, {
        ok: false,
        models: [],
        message: err instanceof Error ? err.message : String(err),
      })
    }
  })

  middlewares.use('/api/stop', async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, message: 'POST only' })
      return
    }
    try {
      const parsed = await readJsonBody(req)
      const result = await stopToolById(getId(req, parsed))
      sendJson(res, result.ok ? 200 : 400, result)
    } catch {
      sendJson(res, 400, { ok: false, message: 'Invalid JSON' })
    }
  })

  middlewares.use('/api/stop-all', async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, message: 'POST only' })
      return
    }
    try {
      const result = await stopAllTools()
      sendJson(res, 200, result)
    } catch (err) {
      sendJson(res, 500, {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  })

  middlewares.use('/api/console', async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    try {
      if (req.method === 'GET') {
        const id = getId(req, {})
        sendJson(res, 200, getConsole(id))
        return
      }
      if (req.method === 'POST') {
        const parsed = await readJsonBody(req)
        const id = getId(req, parsed)
        const action = String(parsed.action || 'clear')
        if (action === 'clear') {
          sendJson(res, 200, clearConsole(id))
          return
        }
        sendJson(res, 400, { ok: false, message: 'Unknown console action' })
        return
      }
      sendJson(res, 405, { ok: false, message: 'GET or POST only' })
    } catch {
      sendJson(res, 400, { ok: false, message: 'Invalid request' })
    }
  })

  middlewares.use('/api/run-errors', async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    try {
      if (req.method === 'GET') {
        const url = new URL(req.url || '/', 'http://127.0.0.1')
        const id = url.searchParams.get('id') || ''
        if (id) {
          sendJson(res, 200, getRunError(id))
          return
        }
        sendJson(res, 200, { ok: true, errors: listRunErrors() })
        return
      }
      if (req.method === 'POST') {
        const parsed = await readJsonBody(req)
        const action = String(parsed.action || '')
        if (action === 'clear') {
          sendJson(res, 200, clearRunErrors())
          return
        }
        if (action === 'delete') {
          sendJson(res, 200, deleteRunError(String(parsed.id || '')))
          return
        }
        sendJson(res, 400, { ok: false, message: 'Unknown run-errors action' })
        return
      }
      sendJson(res, 405, { ok: false, message: 'GET or POST only' })
    } catch (err) {
      sendJson(res, 500, {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  })

  middlewares.use('/api/vault', async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    try {
      if (req.method === 'GET') {
        const values = { ...loadVault() }
        delete values.CC_API_TOKEN
        delete values.OUTREACH_SECRETS
        sendJson(res, 200, { ok: true, values, fields: VAULT_FIELDS })
        return
      }
      if (req.method === 'POST') {
        const parsed = await readJsonBody(req)
        const values = (parsed.values || {}) as Record<string, string>
        const result = saveVault(values)
        if (result.ok) fireNotify('Vault updated', 'Shared secrets saved', 'info')
        sendJson(res, result.ok ? 200 : 400, result)
        return
      }
      sendJson(res, 405, { ok: false, message: 'GET or POST only' })
    } catch {
      sendJson(res, 400, { ok: false, message: 'Invalid request' })
    }
  })

  middlewares.use('/api/backup', async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, message: 'POST only' })
      return
    }
    try {
      const result = await createBackup()
      sendJson(res, result.ok ? 200 : 400, result)
    } catch (err) {
      sendJson(res, 500, {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  })

}
