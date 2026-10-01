/** Catalog of launchable tools (paths, launch commands, settings keys). Folder overrides come from paths-config. */

import path from 'node:path'
import { MEDIA_TOOL_CATALOG } from '../../src/data/media-tools.js'
import {
    TOOLSAI_ROOT,
    type LaunchEntry
} from '../launch-runtime.js'
import { toolPathOverride } from '../paths-config.js'

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

/* ------------------------------------------------------------------ folders */

type DefaultPaths = Pick<LaunchEntry, 'path' | 'openPath' | 'outputPath' | 'processMatch' | 'launchOptions'>
const DEFAULT_PATHS = new Map<string, DefaultPaths>(
  LAUNCH_CATALOG.map((t) => [
    t.id,
    { path: t.path, openPath: t.openPath, outputPath: t.outputPath, processMatch: t.processMatch, launchOptions: t.launchOptions },
  ]),
)

/** Re-point a path that lived inside the default tool folder to the new folder. */
function rebase(value: string | undefined, from: string, to: string): string | undefined {
  if (!value || from === to) return value
  const lower = value.toLowerCase()
  const base = from.toLowerCase()
  if (lower === base) return to
  if (lower.startsWith(base + path.sep) || lower.startsWith(base + '/')) return to + value.slice(from.length)
  return value
}

export function defaultToolPath(id: string): string | undefined {
  return DEFAULT_PATHS.get(id)?.path
}

/** Apply saved folder overrides (paths.json) to the live catalog. */
export function applyToolPathOverrides(): void {
  for (const tool of LAUNCH_CATALOG) {
    const d = DEFAULT_PATHS.get(tool.id)
    if (!d) continue
    const next = toolPathOverride(tool.id) || d.path
    tool.path = next
    tool.openPath = rebase(d.openPath, d.path, next)
    tool.outputPath = rebase(d.outputPath, d.path, next)
    tool.processMatch = rebase(d.processMatch, d.path, next)
    tool.launchOptions = d.launchOptions?.map((o) => ({
      ...o,
      outputPath: rebase(o.outputPath, d.path, next),
      processMatch: rebase(o.processMatch, d.path, next),
    }))
  }
}

applyToolPathOverrides()
