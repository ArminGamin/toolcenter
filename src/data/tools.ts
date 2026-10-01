import type { Tool } from '../types'
import { MEDIA_TOOL_CATALOG } from './media-tools'

const EBOOK = String.raw`C:\Users\kajus\Desktop\Ebook biznis\tavo-knyga-generator`
const OLLAMA_DIR = String.raw`C:\Users\kajus\AppData\Local\Programs\Ollama`

const OLLAMA_TOOL_SETTINGS = [
  { key: 'OLLAMA_URL', label: 'Ollama URL', type: 'text' as const },
  { key: 'OLLAMA_MODEL', label: 'Ollama model', type: 'select' as const, optionsFrom: 'ollama_models' as const },
  { key: 'OLLAMA_NUM_CTX', label: 'Ollama context', type: 'number' as const },
  { key: 'OLLAMA_NUM_GPU', label: 'Ollama GPU layers', type: 'number' as const },
  { key: 'OLLAMA_KEEP_ALIVE', label: 'Ollama keep alive', type: 'text' as const },
] as const

const UGC_SETTINGS = [
  { key: 'OLLAMA_URL', label: 'Ollama URL', type: 'text' as const },
  { key: 'OLLAMA_MODEL', label: 'Ollama model', type: 'select' as const, optionsFrom: 'ollama_models' as const },
  { key: 'DISCORD_BOT_TOKEN', label: 'Discord bot token', type: 'password' as const },
  { key: 'DISCORD_GUILD_ID', label: 'Guild ID', type: 'text' as const },
  { key: 'DISCORD_CATEGORY_ID', label: 'Category ID', type: 'text' as const },
] as const

const SEO_BLOG_SETTINGS = [
  ...OLLAMA_TOOL_SETTINGS,
  { key: 'SITE_URL', label: 'Site URL', type: 'text' as const },
  { key: 'POSTS_PER_RUN', label: 'Posts per run (1–3)', type: 'number' as const },
  { key: 'AUTO_PUSH', label: 'Auto git push (true/false)', type: 'text' as const },
  { key: 'INDEXNOW_KEY', label: 'IndexNow key', type: 'text' as const },
] as const

const TAVO_SETTINGS = [
  { key: 'LLM_PROVIDER', label: 'LLM provider', type: 'select' as const, options: ['gemini_first', 'gemini_only', 'ollama_only'] },
  { key: 'OLLAMA_URL', label: 'Ollama URL', type: 'text' as const },
  { key: 'OLLAMA_MODEL', label: 'Ollama model', type: 'select' as const, optionsFrom: 'ollama_models' as const },
  { key: 'SITE_URL', label: 'Site URL', type: 'text' as const },
  { key: 'TARGET_MIN_PAGES', label: 'Min pages', type: 'number' as const },
  { key: 'MAX_PAGES', label: 'Max pages', type: 'number' as const },
  { key: 'PDF_SCALE', label: 'PDF scale', type: 'number' as const },
  { key: 'OLLAMA_NUM_CTX', label: 'Ollama context', type: 'number' as const },
  { key: 'OLLAMA_NUM_GPU', label: 'Ollama GPU layers', type: 'number' as const },
  { key: 'OLLAMA_KEEP_ALIVE', label: 'Ollama keep alive', type: 'text' as const },
]

/** Canonical catalog — UI + launch bridge share this list. */
export const TOOL_CATALOG: Tool[] = [
  {
    id: 'scraper',
    name: 'Scraper',
    icon: 'scraper',
    accent: '#5ec4b4',
    status: 'active',
    removed: false,
    path: String.raw`D:\toolsai\scraper`,
    launch: 'python gui.py',
    blurb: 'Web email scraper desktop GUI',
    category: 'Scraping',
    processMatch: 'scraper\\gui.py',
    settingsFile: 'control-center.env',
    settings: [
      { key: 'MAX_PAGES', label: 'Max pages', type: 'number' },
      { key: 'TIMEOUT', label: 'Request timeout (s)', type: 'number' },
      { key: 'RETRIES', label: 'HTTP retries', type: 'number' },
      { key: 'FETCH_CONCURRENCY', label: 'Parallel fetches', type: 'number' },
      { key: 'MAX_API_PROBES', label: 'API JSON probes / page', type: 'number' },
      { key: 'OUTPUT_DIR', label: 'Save folder', type: 'text' },
    ],
  },
  {
    id: 'dc_scraper',
    name: 'DC Scraper',
    icon: 'discord',
    accent: '#7b8cff',
    status: 'active',
    removed: false,
    path: String.raw`D:\toolsai\dc scraper`,
    launch: 'python 1.py',
    blurb: 'Discord channel email scraper',
    category: 'Scraping',
    processMatch: 'dc scraper\\1.py',
    settingsFile: 'control-center.env',
    settings: [
      { key: 'DISCORD_BOT_TOKEN', label: 'Discord bot token', type: 'password' },
      { key: 'DISCORD_CHANNEL_ID', label: 'Default channel ID', type: 'text' },
    ],
  },
  {
    id: 'newsletter_sender',
    name: 'Newsletter Sender',
    icon: 'mail',
    accent: '#d4a35c',
    status: 'active',
    removed: false,
    path: String.raw`D:\toolsai\newsletter-sender`,
    launch: 'run.bat',
    blurb: 'Vasaros Kampelis bulk mailer',
    category: 'Email',
    processMatch: 'newsletter-sender',
    settingsFile: '.env',
    settings: [
      { key: 'RESEND_API_KEY', label: 'Resend API key', type: 'password' },
      { key: 'RESEND_FROM', label: 'From address', type: 'text' },
      { key: 'NEWSLETTER_SUBJECT', label: 'Default subject', type: 'text' },
      {
        key: 'ROTATE_SUBJECTS',
        label: 'Rotate subjects from subjects.txt (one line per recipient, optional)',
        type: 'checkbox',
      },
      { key: 'DISCORD_NEWSLETTER_SEND_WEBHOOK_URL', label: 'Discord webhook', type: 'password' },
    ],
    assets: [
      {
        key: 'email_html',
        label: 'Email HTML',
        file: 'promo-email.html',
        type: 'html',
      },
      {
        key: 'subjects',
        label: 'Subjects list',
        file: 'subjects.txt',
        type: 'text',
      },
    ],
  },
  {
    id: 'post_maker',
    name: 'PostMaker',
    icon: 'carousel',
    accent: '#e08a6a',
    status: 'active',
    removed: false,
    path: String.raw`D:\toolsai\post-maker`,
    launch: 'python main.py',
    blurb: 'Motivational carousel studio',
    category: 'Content',
    processMatch: 'post-maker\\main.py',
    settingsFile: '.env',
    settings: [
      { key: 'DISCORD_BOT_TOKEN', label: 'Discord bot token', type: 'password' },
      { key: 'DISCORD_GUILD_ID', label: 'Guild ID', type: 'text' },
      { key: 'DISCORD_CATEGORY_ID', label: 'Category ID', type: 'text' },
      { key: 'OLLAMA_URL', label: 'Ollama URL', type: 'text' },
      { key: 'OLLAMA_MODEL', label: 'Ollama model', type: 'select', optionsFrom: 'ollama_models' },
    ],
  },
  {
    id: 'ugc_slides',
    name: 'UGC Slides',
    icon: 'ugcSlides',
    accent: '#f472b6',
    status: 'active',
    removed: false,
    path: String.raw`D:\toolsai\control-center`,
    launch: '',
    blurb: 'Photo slideshow creator with Ollama Lithuanian copy for Reels / TikTok',
    category: 'Content',
    settings: [...UGC_SETTINGS],
  },
  {
    id: 'one_shot',
    name: 'One-Shot',
    icon: 'oneShot',
    accent: '#c9b896',
    status: 'active',
    removed: false,
    path: String.raw`D:\toolsai\control-center`,
    launch: '',
    settingsFile: 'assets/one-shot/settings.env',
    blurb: 'iPhone Notes-style one-slide stories for TikTok and Instagram',
    category: 'Content',
    settings: [
      { key: 'OLLAMA_URL', label: 'Ollama URL', type: 'text' },
      { key: 'OLLAMA_MODEL', label: 'Ollama model', type: 'select', optionsFrom: 'ollama_models' },
      { key: 'OLLAMA_NUM_GPU', label: 'Ollama GPU layers', type: 'number' },
      { key: 'DISCORD_BOT_TOKEN', label: 'Discord bot token', type: 'password' },
      { key: 'DISCORD_GUILD_ID', label: 'Guild ID', type: 'text' },
      { key: 'DISCORD_CATEGORY_ID', label: 'Category ID', type: 'text' },
    ],
  },
  {
    id: 'ai_lead_finder',
    name: 'AI Lead Finder',
    icon: 'leads',
    accent: '#c4b05e',
    status: 'active',
    removed: false,
    path: String.raw`D:\toolsai\ai-lead-finder`,
    launch: 'run.bat',
    blurb: 'Lead discovery + enrichment',
    category: 'Leads',
    processMatch: 'ai-lead-finder',
    settingsFile: 'control-center.env',
    settings: [
      { key: 'OLLAMA_URL', label: 'Ollama URL', type: 'text' },
      { key: 'OLLAMA_MODEL', label: 'Ollama model', type: 'select', optionsFrom: 'ollama_models' },
      { key: 'FETCH_WORKERS', label: 'Fetch workers', type: 'number' },
      { key: 'VERIFY_WORKERS', label: 'Verify workers', type: 'number' },
      { key: 'SMTP_TIMEOUT', label: 'SMTP timeout (s)', type: 'number' },
      { key: 'SMTP_PORT', label: 'SMTP port', type: 'number' },
      { key: 'SKIP_SMTP', label: 'Skip SMTP (MX only)', type: 'select', options: ['0', '1'] },
      { key: 'MAX_PAGES_DEFAULT', label: 'Max pages default', type: 'number' },
      { key: 'PLAYWRIGHT_ENABLED', label: 'Playwright enabled', type: 'select', options: ['0', '1'] },
    ],
  },
  {
    id: 'gmail_script',
    name: 'Gmail Script',
    icon: 'gmail',
    accent: '#e06a55',
    status: 'paused',
    removed: false,
    path: String.raw`D:\toolsai\gmail script`,
    launch: 'python gmail1_gui.py',
    blurb: 'Gmail automation GUI',
    category: 'Email',
    processMatch: 'gmail1_gui.py',
    settingsFile: 'control-center.env',
    settings: [
      { key: 'SMTP_PORT', label: 'SMTP port', type: 'number' },
      { key: 'SMTP_TIMEOUT', label: 'SMTP timeout (s)', type: 'number' },
      { key: 'SKIP_SMTP', label: 'MX only (skip SMTP)', type: 'select', options: ['0', '1'] },
      { key: 'DNS_TIMEOUT', label: 'DNS timeout (s)', type: 'number' },
    ],
  },
  {
    id: 'motion_blur',
    name: 'Motion Blur',
    icon: 'blur',
    accent: '#6ab0e0',
    status: 'paused',
    removed: false,
    path: String.raw`D:\toolsai\motion blur`,
    launch: 'add_blur.bat',
    blurb: 'Batch motion-blur videos',
    category: 'Video',
    processMatch: 'motion blur',
    settingsFile: 'control-center.env',
    settings: [
      { key: 'FFMPEG_CRF', label: 'FFmpeg CRF', type: 'number' },
      { key: 'FFMPEG_PRESET', label: 'FFmpeg preset', type: 'select', options: ['ultrafast', 'fast', 'medium', 'slow', 'veryslow'] },
      { key: 'CONTRAST', label: 'Contrast', type: 'number' },
      { key: 'BRIGHTNESS', label: 'Brightness', type: 'number' },
      { key: 'SATURATION', label: 'Saturation', type: 'number' },
    ],
  },
  {
    id: 'video_creator',
    name: 'Video Creator',
    icon: 'video',
    accent: '#e2a24c',
    status: 'active',
    removed: false,
    path: String.raw`D:\toolsai\Video Creator`,
    launch: 'python app.py',
    blurb: 'Promo video GUI',
    category: 'Video',
    processMatch: 'app.py',
    settingsFile: 'control-center.env',
    settings: [
      { key: 'OUTPUT_DIR', label: 'Output folder', type: 'text' },
      { key: 'DEFAULT_FONT_SIZE', label: 'Default font size', type: 'number' },
    ],
  },
  {
    id: 'ollama',
    name: 'Ollama',
    icon: 'ollama',
    accent: '#86efac',
    status: 'paused',
    removed: false,
    path: OLLAMA_DIR,
    launch: 'ollama.exe',
    blurb: 'Local LLM runtime — start server & pull models',
    category: 'AI',
    processMatch: 'ollama',
    settingsFile: 'control-center.env',
    settings: [
      { key: 'OLLAMA_HOST', label: 'Ollama host', type: 'text' },
      { key: 'OLLAMA_MODEL', label: 'Default model', type: 'select', optionsFrom: 'ollama_models' },
      { key: 'OLLAMA_KEEP_ALIVE', label: 'Keep alive', type: 'text' },
      { key: 'OLLAMA_NUM_PARALLEL', label: 'Num parallel', type: 'number' },
    ],
    actions: [
      { id: 'ollama_start', label: 'Start / pull model' },
      { id: 'ollama_run', label: 'Run selected model' },
      { id: 'ollama_pull', label: 'Pull model' },
      { id: 'ollama_setup', label: 'Run setup_ollama.py' },
    ],
  },
  {
    id: 'tavo_knyga_ui',
    name: 'Tavo Knyga UI',
    icon: 'book',
    accent: '#34d399',
    status: 'paused',
    removed: false,
    path: EBOOK,
    launch: 'python run_ui.py',
    blurb: 'Ebook generator main UI',
    category: 'Ebook',
    processMatch: 'run_ui.py',
    settingsFile: '.env',
    settings: TAVO_SETTINGS,
  },
  {
    id: 'tavo_factory_ui',
    name: 'Recipe Factory',
    icon: 'factory',
    accent: '#f59e0b',
    status: 'paused',
    removed: false,
    path: EBOOK,
    launch: 'python run_factory_ui.py',
    blurb: 'Recipe factory desktop UI',
    category: 'Ebook',
    processMatch: 'run_factory_ui.py',
    settingsFile: '.env',
    settings: TAVO_SETTINGS,
    actions: [
      { id: 'fetch_seeds', label: 'Fetch internet seeds' },
      { id: 'build_db', label: 'Build library (5400)' },
      { id: 'build_report', label: 'Recipe DB report' },
    ],
  },
  {
    id: 'tavo_health_ui',
    name: 'Recipe Health',
    icon: 'health',
    accent: '#22d3ee',
    status: 'paused',
    removed: false,
    path: EBOOK,
    launch: 'python run_health_ui.py',
    blurb: 'Recipe health checker UI',
    category: 'Ebook',
    processMatch: 'run_health_ui.py',
    settingsFile: '.env',
    settings: TAVO_SETTINGS,
  },
  {
    id: 'tavo_seo_blog',
    name: 'SEO Blog Pipeline',
    icon: 'seoBlog',
    accent: '#a78bfa',
    status: 'paused',
    removed: false,
    path: EBOOK,
    launch: 'python run_seo_blog_ui.py',
    blurb: 'LT SEO straipsniai → /straipsniai → Vercel + outreach drafts',
    category: 'Ebook',
    processMatch: 'run_seo_blog_ui.py',
    settingsFile: '.env',
    settings: [...SEO_BLOG_SETTINGS],
  },
  {
    id: 'autoplius_bot',
    name: 'Autoplius Tracker',
    icon: 'car',
    accent: '#38bdf8',
    status: 'paused',
    removed: false,
    path: String.raw`D:\toolsai\autoplius-bot`,
    launch: 'run.bat',
    blurb: 'LT used-car tracker — Autoplius + Autogidas new ads, market median, alerts',
    category: 'Scraping',
    processMatch: 'streamlit',
  },
  {
    id: 'reddit_commenter',
    name: 'Reddit',
    icon: 'redditCommenter',
    accent: '#ff5700',
    status: 'active',
    removed: false,
    path: String.raw`D:\toolsai\reddit-commenter`,
    launch: 'python worker.py',
    blurb: 'Lithuanian subreddit scanner + comment automation',
    category: 'Automation',
    processMatch: 'reddit-commenter\\worker.py',
  },
  ...MEDIA_TOOL_CATALOG,
]

export function createSeedTools(): Tool[] {
  return TOOL_CATALOG.map((t) => ({ ...t }))
}

/** Tools that were soft-hidden in v8 — force them visible again in v9. */
const RESTORE_VISIBLE = new Set([
  'gmail_script',
  'motion_blur',
  'tavo_factory_ui',
  'tavo_health_ui',
  'tavo_seo_blog',
  'reddit_commenter',
  'ugc_slides',
  'one_shot',
])

export function mergePersistedTools(stored: unknown): Tool[] {
  const byId = new Map<string, Partial<Tool>>()
  if (Array.isArray(stored)) {
    for (const row of stored) {
      if (row && typeof row === 'object' && 'id' in row && typeof (row as Tool).id === 'string') {
        byId.set((row as Tool).id, row as Tool)
      }
    }
  }

  return TOOL_CATALOG.map((base) => {
    const prev = byId.get(base.id)
    if (!prev) return { ...base }
    const removed = RESTORE_VISIBLE.has(base.id)
      ? false
      : typeof prev.removed === 'boolean'
        ? prev.removed
        : base.removed
    return {
      ...base,
      name: typeof prev.name === 'string' && prev.name.trim() ? prev.name : base.name,
      status: prev.status === 'paused' || prev.status === 'active' ? prev.status : base.status,
      removed,
    }
  })
}
