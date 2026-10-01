/** Ollama start/pull/model listing for the launch bridge. (Split out of launch.ts.) */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { MEDIA_TOOL_CATALOG } from '../../src/data/media-tools.js'
import {
    fireNotify,
    loadVault
} from '../cc-services.js'
import {
    appendConsole,
    loadProfileToolSnapshot,
    spawnEnvForTool,
    TOOLSAI_ROOT,
    type LaunchEntry
} from '../launch-runtime.js'
import { UGC_DEFAULT_OLLAMA_MODEL } from '../ugc-env-bridge.js'

export const EBOOK = path.join(
  process.env.USERPROFILE || 'C:\\Users\\kajus',
  'Desktop',
  'Ebook biznis',
  'tavo-knyga-generator',
)

export const OLLAMA_EXE =
  process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'Programs', 'Ollama', 'ollama.exe')
    : 'ollama'

export const TAVO_KEYS = [
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

export const SEO_BLOG_KEYS = [
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

export const UGC_SLIDES_KEYS = [
  'OLLAMA_URL',
  'OLLAMA_MODEL',
  'OLLAMA_NUM_GPU',
  'DISCORD_BOT_TOKEN',
  'DISCORD_GUILD_ID',
  'DISCORD_CATEGORY_ID',
  'UGC_BATCH_TEST_MODE',
]

export const ONE_SHOT_KEYS = [
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

export function resolveOllamaBaseUrl(tool?: LaunchEntry): string {
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

export function resolveOllamaModel(model?: string): string {
  const tool = LAUNCH_CATALOG.find((t) => t.id === 'ollama')
  return (
    (model && model.trim()) ||
    (tool && (loadProfileToolSnapshot(tool).values.OLLAMA_MODEL || loadVault().OLLAMA_MODEL)) ||
    'llama3.1:8b'
  )
}

export function normalizeOllamaModelKey(name: string): string {
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

export function ollamaExePath(): string {
  return fs.existsSync(OLLAMA_EXE) ? OLLAMA_EXE : 'ollama'
}

/** Open interactive CMD: `ollama pull <model>` (progress bars need a real TTY). */
export function openOllamaPullWindow(model?: string): {
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

export function ensureOllamaServeBackground(): void {
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
