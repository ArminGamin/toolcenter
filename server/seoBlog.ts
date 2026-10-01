/**
 * SEO Blog Pipeline — Control Center mission board backend.
 * Spawns tavo-knyga-generator/seo_blog/cli_hub.py and streams NDJSON progress.
 * Drafts are staged for human Accept / Reject before live publish.
 */
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { loadVault } from './cc-services.js'
import { readEnvFile } from './launch-runtime.js'
import { currentBusinessProfile, profileDataPath } from './business-profiles.js'
import { currentProfileBrand, KALEDU_SEO_TOPICS } from './profile-brand.js'
import { isKaleduSeo, getKaleduSeoSettings, saveKaleduSeoSettings, getKaleduSeoState, startKaleduSeoRun, acceptKaleduSeo, rejectKaleduSeo, abortKaleduSeo, clearKaleduSeo } from './kaledu-seo.js'
const EBOOK = path.join(
  process.env.USERPROFILE || 'C:\\Users\\kajus',
  'Desktop',
  'Ebook biznis',
  'tavo-knyga-generator',
)
const SITE_CONTENT = path.join(EBOOK, '..', 'content', 'straipsniai')
const DRAFTS_DIR = path.join(EBOOK, 'seo_blog', 'data', 'drafts')
const CLI = path.join(EBOOK, 'seo_blog', 'cli_hub.py')
const CLI_REVIEW = path.join(EBOOK, 'seo_blog', 'cli_review.py')

export type SeoBlogStage =
  | 'idle'
  | 'plan'
  | 'write'
  | 'qa'
  | 'links'
  | 'publish'
  | 'done'
  | 'error'

export type SeoBlogStatus = 'idle' | 'running' | 'done' | 'error'

export type SeoBlogSettings = {
  postsPerRun: number
  mock: boolean
  strict: boolean
  /** Skip review: publish + git push immediately after generate */
  autoPublish: boolean
  /** On Accept (review mode only) — git push to Vercel */
  autoPush: boolean
  indexnowKey: string
  ollamaModel?: string
  topics?: string[]
  /** Kalėdų Kampelis publishing checkout; independent of the development store. */
  siteRoot?: string
}

export type SeoBlogPostPreview = {
  slug: string
  title?: string
  h1?: string
  published?: string
}

export type SeoBlogDraft = {
  slug: string
  title?: string
  h1?: string
  metaDescription?: string
  intro?: string
  published?: string
  keywords?: string[]
  sections?: { heading: string; paragraphs: string[] }[]
  faq?: { q: string; a: string }[]
  relatedBlogSlugs?: string[]
  relatedSeoSlugs?: string[]
}

export type SeoBlogLogEntry = {
  at: string
  level: string
  message: string
}

export type RunState = {
  id: string | null
  status: SeoBlogStatus
  stage: SeoBlogStage
  message: string
  error: string | null
  startedAt: number | null
  finishedAt: number | null
  posts: SeoBlogPostPreview[]
  updatedRelated: string[]
  publish: Record<string, unknown>
  indexnow: Record<string, unknown>
  sitemap?: Record<string, unknown>
  log: SeoBlogLogEntry[]
  progressPct: number
  awaitingReview: boolean
}

const defaultSettings = (): SeoBlogSettings => ({
  postsPerRun: 2,
  mock: false,
  strict: true,
  autoPublish: true,
  autoPush: true,
  indexnowKey: '',
})

let settings: SeoBlogSettings = defaultSettings()
let child: ChildProcessWithoutNullStreams | null = null
let run: RunState = emptyRun()

type SeoSlot = {
  settings: SeoBlogSettings
  child: ChildProcessWithoutNullStreams | null
  run: RunState
}

const seoSlots = new Map<string, SeoSlot>()

function seoSettingsFile() {
  return profileDataPath('seo-blog', 'settings.json')
}

function seoTopicsFile() {
  return profileDataPath('seo-blog', 'topics.json')
}

function christmasSeoRoot() {
  return profileDataPath('seo-blog')
}

function seoContentDir() {
  return currentProfileBrand().seoUsesEbookGenerator
    ? SITE_CONTENT
    : path.join(christmasSeoRoot(), 'content')
}

function seoDraftsDir() {
  return currentProfileBrand().seoUsesEbookGenerator
    ? DRAFTS_DIR
    : path.join(christmasSeoRoot(), 'drafts')
}

function seoQaHistoryPath() {
  return currentProfileBrand().seoUsesEbookGenerator
    ? QA_HISTORY
    : path.join(christmasSeoRoot(), 'qa_history.jsonl')
}

function loadChristmasTopics(): string[] {
  try {
    if (!fs.existsSync(seoTopicsFile())) return [...KALEDU_SEO_TOPICS]
    const raw = JSON.parse(fs.readFileSync(seoTopicsFile(), 'utf8')) as { topics?: string[] }
    return Array.isArray(raw.topics) ? raw.topics.filter((t) => typeof t === 'string') : [...KALEDU_SEO_TOPICS]
  } catch {
    return [...KALEDU_SEO_TOPICS]
  }
}

function initChristmasSeo() {
  const brand = currentProfileBrand()
  if (brand.seoUsesEbookGenerator) return
  const root = christmasSeoRoot()
  fs.mkdirSync(path.join(root, 'drafts'), { recursive: true })
  fs.mkdirSync(path.join(root, 'content'), { recursive: true })
  if (!fs.existsSync(seoTopicsFile())) {
    fs.writeFileSync(seoTopicsFile(), JSON.stringify({ topics: KALEDU_SEO_TOPICS }, null, 2) + '\n', 'utf8')
  }
}

function seoSlot(): SeoSlot {
  const id = currentBusinessProfile().id
  let slot = seoSlots.get(id)
  if (!slot) {
    initChristmasSeo()
    let loaded = defaultSettings()
    if (!currentProfileBrand().seoUsesEbookGenerator && fs.existsSync(seoSettingsFile())) {
      try {
        loaded = { ...defaultSettings(), ...JSON.parse(fs.readFileSync(seoSettingsFile(), 'utf8')) }
      } catch {
        loaded = defaultSettings()
      }
    }
    slot = { settings: loaded, child: null, run: emptyRun() }
    seoSlots.set(id, slot)
  }
  settings = slot.settings
  child = slot.child
  run = slot.run
  return slot
}

function stashSeo(slot: SeoSlot) {
  slot.settings = settings
  slot.child = child
  slot.run = run
  seoSlots.set(currentBusinessProfile().id, slot)
  if (!currentProfileBrand().seoUsesEbookGenerator) {
    fs.mkdirSync(christmasSeoRoot(), { recursive: true })
    fs.writeFileSync(seoSettingsFile(), JSON.stringify(slot.settings, null, 2) + '\n', 'utf8')
  }
}

function emptyRun(): RunState {
  return {
    id: null,
    status: 'idle',
    stage: 'idle',
    message: '',
    error: null,
    startedAt: null,
    finishedAt: null,
    posts: [],
    updatedRelated: [],
    publish: {},
    indexnow: {},
    log: [],
    progressPct: 0,
    awaitingReview: false,
  }
}

function pushLog(level: string, message: string) {
  run.log.push({ at: new Date().toISOString(), level, message })
  if (run.log.length > 400) run.log = run.log.slice(-300)
}

function stagePct(stage: SeoBlogStage): number {
  const order: SeoBlogStage[] = ['plan', 'write', 'qa', 'links', 'publish', 'done']
  const i = order.indexOf(stage)
  if (i < 0) return 0
  return Math.round(((i + 1) / order.length) * 100)
}

const SEO_BLOG_VAULT_SKIP = new Set([
  'DISCORD_STATUS_WEBHOOK',
  'GEMINI_API_KEY',
  'GEMINI_API_KEYS',
  'GEMINI_MODEL',
])

/** SEO blog uses Ollama only — never pass Gemini keys or provider from vault / ebook .env. */
function seoBlogSpawnEnv(): NodeJS.ProcessEnv {
  const fromDot = readEnvFile(path.join(EBOOK, '.env'))
  const vault = loadVault()
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const [k, v] of Object.entries(vault)) {
    if (v !== undefined && v !== '' && !SEO_BLOG_VAULT_SKIP.has(k)) env[k] = v
  }
  for (const [k, v] of Object.entries(fromDot)) {
    if (v !== undefined && v !== '' && k !== 'GEMINI_API_KEY' && k !== 'GEMINI_MODEL' && k !== 'GEMINI_API_KEYS') env[k] = v
  }
  env.LLM_PROVIDER = 'ollama_only'
  delete env.GEMINI_API_KEY
  delete env.GEMINI_API_KEYS
  delete env.GEMINI_MODEL
  env.PYTHONUTF8 = '1'
  env.PYTHONIOENCODING = 'utf-8'
  env.PYTHONUNBUFFERED = '1'
  return env
}

function resolvePython(): string {
  const candidates = [
    path.join(EBOOK, '.venv312', 'Scripts', 'python.exe'),
    path.join(EBOOK, '.venv', 'Scripts', 'python.exe'),
    'python',
  ]
  for (const c of candidates) {
    if (c === 'python') return c
    if (fs.existsSync(c)) return c
  }
  return 'python'
}

/** Kill leftover seo_blog/cli_hub.py processes (common after UI restart / double-start). */
function killOrphanCliHub(): number {
  if (process.platform !== 'win32') return 0
  try {
    const listed = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        [
          "$procs = Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" |",
          "  Where-Object { $_.CommandLine -like '*seo_blog*cli_hub.py*' };",
          "$n = 0;",
          "foreach ($p in $procs) { try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop; $n++ } catch {} };",
          "Write-Output $n",
        ].join(' '),
      ],
      { encoding: 'utf8', windowsHide: true, timeout: 15000 },
    )
    const n = Number.parseInt(String(listed.stdout || '').trim(), 10)
    return Number.isFinite(n) ? n : 0
  } catch {
    return 0
  }
}

function listContentSlugs(): string[] {
  return listContentPosts().map((p) => p.slug)
}

type ContentPostMeta = {
  slug: string
  llmBackend?: string
  llmLabel: string
  published?: string
  publishedMs: number
}

function parsePublishedMs(published?: string, fallbackMs = 0): number {
  const raw = String(published || '').trim()
  if (raw) {
    const ms = Date.parse(raw)
    if (Number.isFinite(ms)) return ms
  }
  return fallbackMs
}

const QA_HISTORY = path.join(EBOOK, 'seo_blog', 'data', 'qa_history.jsonl')

function loadLlmBackendHistoryMap(): Record<string, string> {
  const out: Record<string, string> = {}
  const historyFile = seoQaHistoryPath()
  if (!fs.existsSync(historyFile)) return out
  const lines = fs.readFileSync(historyFile, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const event = JSON.parse(trimmed) as {
        slug?: string
        topicSlug?: string
        outcome?: string
        llmBackend?: string
      }
      const slug = String(event.slug || event.topicSlug || '').trim()
      const backend = String(event.llmBackend || '').trim().toLowerCase()
      if (!slug || !backend) continue
      if (event.outcome === 'qa_pass' || event.outcome === 'auto_skipped') {
        out[slug] = backend
      }
    } catch {
      /* skip bad line */
    }
  }
  return out
}

function llmBackendLabel(value?: string): string {
  const key = String(value || '').trim().toLowerCase()
  if (key === 'gemini') return 'GEMINI'
  if (key === 'ollama') return 'OLLAMA'
  if (key === 'composer') return 'COMPOSER'
  if (key === 'mock') return 'MOCK'
  return '—'
}

function listContentPosts(): ContentPostMeta[] {
  const dir = seoContentDir()
  if (!fs.existsSync(dir)) return []
  const history = loadLlmBackendHistoryMap()
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const filePath = path.join(dir, f)
      const mtimeMs = fs.statSync(filePath).mtimeMs
      const slug = f.replace(/\.json$/, '')
      let llmBackend = history[slug] || ''
      let published = ''
      try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
          slug?: string
          llmBackend?: string
          published?: string
        }
        if (raw.llmBackend) llmBackend = String(raw.llmBackend).trim().toLowerCase()
        published = String(raw.published || '').trim()
        const resolvedSlug = raw.slug ? String(raw.slug) : slug
        return {
          slug: resolvedSlug,
          llmBackend,
          llmLabel: llmBackendLabel(llmBackend),
          published: published || undefined,
          publishedMs: parsePublishedMs(published, mtimeMs),
        }
      } catch {
        /* keep slug from filename */
      }
      return {
        slug,
        llmBackend,
        llmLabel: llmBackendLabel(llmBackend),
        published: undefined,
        publishedMs: mtimeMs,
      }
    })
    .sort((a, b) => b.publishedMs - a.publishedMs || a.slug.localeCompare(b.slug))
}

function loadDraftsFromDisk(): SeoBlogDraft[] {
  const dir = seoDraftsDir()
  if (!fs.existsSync(dir)) return []
  const drafts: SeoBlogDraft[] = []
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as SeoBlogDraft
      if (raw?.slug) drafts.push(raw)
    } catch {
      /* skip bad file */
    }
  }
  return drafts
}

function runReviewCli(args: string[]): { ok: boolean; message: string; [k: string]: unknown } {
  const py = resolvePython()
  const result = spawnSync(py, [CLI_REVIEW, ...args], {
    cwd: EBOOK,
    encoding: 'utf8',
    windowsHide: true,
    env: seoBlogSpawnEnv(),
  })
  const text = (result.stdout || '').trim() || (result.stderr || '').trim()
  try {
    const parsed = JSON.parse(text.split(/\r?\n/).filter(Boolean).pop() || '{}') as {
      ok?: boolean
      message?: string
      [k: string]: unknown
    }
    return {
      ok: Boolean(parsed.ok),
      message: String(parsed.message || (parsed.ok ? 'OK' : 'Failed')),
      ...parsed,
    }
  } catch {
    return {
      ok: false,
      message: text || result.error?.message || `Review CLI exit ${result.status}`,
    }
  }
}

export function getSeoBlogSettings(): SeoBlogSettings {
  if (isKaleduSeo()) return getKaleduSeoSettings()
  seoSlot()
  return { ...settings }
}

export function saveSeoBlogSettings(partial: Partial<SeoBlogSettings>): {
  ok: boolean
  settings: SeoBlogSettings
} {
  if (isKaleduSeo()) return saveKaleduSeoSettings(partial)
  const slot = seoSlot()
  settings = {
    postsPerRun: Math.max(1, Math.min(10, Number(partial.postsPerRun ?? settings.postsPerRun) || 2)),
    mock: Boolean(partial.mock ?? settings.mock),
    strict: partial.strict === undefined ? settings.strict : Boolean(partial.strict),
    autoPublish: Boolean(partial.autoPublish ?? settings.autoPublish),
    autoPush: Boolean(partial.autoPush ?? settings.autoPush),
    indexnowKey: String(partial.indexnowKey ?? settings.indexnowKey ?? ''),
  }
  if (settings.autoPublish) settings.autoPush = true
  stashSeo(slot)
  return { ok: true, settings: getSeoBlogSettings() }
}

export function getSeoBlogState() {
  if (isKaleduSeo()) return getKaleduSeoState()
  const slot = seoSlot()
  const brand = currentProfileBrand()
  const drafts = loadDraftsFromDisk()
  return {
    ok: true,
    settings: getSeoBlogSettings(),
    run: {
      ...slot.run,
      log: slot.run.log.slice(-120),
      awaitingReview: slot.run.awaitingReview || drafts.length > 0,
    },
    contentDir: seoContentDir(),
    draftsDir: seoDraftsDir(),
    siteRoot: brand.seoSiteRoot,
    siteUrl: `https://${brand.siteHost}`,
    engine: 'tavo',
    seoEngine: brand.seoUsesEbookGenerator,
    topics: brand.seoUsesEbookGenerator ? [] : loadChristmasTopics(),
    postCount: listContentSlugs().length,
    slugs: listContentSlugs(),
    publishedPosts: listContentPosts(),
    drafts,
    draftCount: drafts.length,
    childRunning: Boolean(slot.child && !slot.child.killed),
  }
}

export function startSeoBlogRun(opts?: {
  settings?: Partial<SeoBlogSettings>
}): { ok: boolean; message: string } {
  if (isKaleduSeo()) return startKaleduSeoRun(opts)
  const slot = seoSlot()
  if (!currentProfileBrand().seoUsesEbookGenerator) {
    return {
      ok: false,
      message: `SEO article engine is not enabled for ${currentProfileBrand().name} yet. Site root is ${currentProfileBrand().seoSiteRoot}.`,
    }
  }
  if (slot.child && !slot.child.killed) {
    return { ok: false, message: 'Run already in progress' }
  }
  const killed = killOrphanCliHub()
  if (opts?.settings) saveSeoBlogSettings(opts.settings)
  if (!fs.existsSync(CLI)) {
    return { ok: false, message: `Missing CLI: ${CLI}` }
  }

  run = emptyRun()
  run.id = `seo-${Date.now()}`
  run.status = 'running'
  run.stage = 'plan'
  run.message = 'Starting…'
  run.startedAt = Date.now()
  run.progressPct = 5
  pushLog('INFO', 'SEO Blog Run started')
  if (killed > 0) {
    pushLog('WARN', `Cleared ${killed} stuck cli_hub process(es) before start`)
  }
  stashSeo(slot)

  const py = resolvePython()
  const args = [
    CLI,
    '--posts',
    String(settings.postsPerRun),
    ...(settings.mock ? ['--mock'] : []),
    ...(settings.strict ? ['--strict'] : ['--no-strict']),
    ...(settings.autoPublish ? ['--auto-publish'] : []),
    ...(settings.autoPush || settings.autoPublish ? ['--auto-push'] : []),
    ...(settings.indexnowKey ? ['--indexnow-key', settings.indexnowKey] : []),
  ]

  try {
    child = spawn(py, args, {
      cwd: EBOOK,
      windowsHide: true,
      env: seoBlogSpawnEnv(),
    })
  } catch (err) {
    run.status = 'error'
    run.stage = 'error'
    run.error = err instanceof Error ? err.message : String(err)
    pushLog('ERROR', run.error)
    stashSeo(slot)
    return { ok: false, message: run.error }
  }

  stashSeo(slot)
  const mine = slot
  let buf = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')

  child.stdout.on('data', (chunk: string) => {
    run = mine.run
    settings = mine.settings
    child = mine.child
    buf += chunk
    const lines = buf.split(/\r?\n/)
    buf = lines.pop() || ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const evt = JSON.parse(trimmed) as Record<string, unknown>
        handleEvent(evt)
      } catch {
        pushLog('INFO', trimmed)
      }
    }
    stashSeo(mine)
  })

  child.stderr.on('data', (chunk: string) => {
    run = mine.run
    const text = String(chunk).trim()
    if (text) pushLog('WARN', text.slice(0, 800))
    stashSeo(mine)
  })

  child.on('close', (code) => {
    run = mine.run
    mine.child = null
    child = null
    run.finishedAt = Date.now()
    if (run.status === 'running') {
      if (code === 0 && run.posts.length > 0) {
        run.status = 'done'
        run.stage = 'done'
        run.awaitingReview = Boolean(run.awaitingReview)
        run.message = run.awaitingReview
          ? `${run.posts.length} draft(s) ready for review`
          : `Published ${run.posts.length} post(s)`
        run.progressPct = 100
      } else if (code === 0) {
        run.status = 'done'
        run.stage = 'done'
        run.message = 'Done'
        run.progressPct = 100
      } else {
        run.status = 'error'
        run.stage = 'error'
        run.error = run.error || `Exit code ${code}`
        run.message = run.error
      }
    }
    pushLog('INFO', `Process exited (${code})`)
    stashSeo(mine)
  })

  return { ok: true, message: 'Run started' }
}

function handleEvent(evt: Record<string, unknown>) {
  const type = String(evt.type || '')
  if (type === 'stage') {
    const stage = String(evt.stage || 'write') as SeoBlogStage
    run.stage = stage
    run.message = String(evt.message || '')
    run.progressPct = Math.max(run.progressPct, stagePct(run.stage))
    // Don't pushLog here — cli also emits type=log for the same message
    return
  }
  if (type === 'log') {
    pushLog(String(evt.level || 'INFO'), String(evt.message || ''))
    return
  }
  if (type === 'post') {
    const slug = String(evt.slug || '')
    if (slug) {
      const preview = {
        slug,
        title: evt.title ? String(evt.title) : undefined,
        h1: evt.h1 ? String(evt.h1) : undefined,
        published: evt.published ? String(evt.published) : undefined,
      }
      if (!run.posts.some((p) => p.slug === slug)) {
        run.posts = [...run.posts, preview]
      }
    }
    const done = Number(evt.done || run.posts.length) || 0
    const total = Number(evt.total || settings.postsPerRun) || settings.postsPerRun
    run.stage = 'write'
    run.message = `Wrote ${done}/${total}${slug ? `: ${slug}` : ''}`
    run.progressPct = Math.max(
      run.progressPct,
      Math.min(85, 25 + Math.round((done / Math.max(1, total)) * 55)),
    )
    pushLog('INFO', run.message)
    return
  }
  if (type === 'done') {
    run.posts = Array.isArray(evt.posts) ? (evt.posts as SeoBlogPostPreview[]) : []
    run.updatedRelated = Array.isArray(evt.updated_related)
      ? (evt.updated_related as string[])
      : []
    run.publish = (evt.publish as Record<string, unknown>) || {}
    run.indexnow = (evt.indexnow as Record<string, unknown>) || {}
    run.awaitingReview = Boolean(evt.awaiting_review)
    const errors = Array.isArray(evt.errors) ? (evt.errors as string[]) : []
    if ((errors.length && !run.posts.length) || evt.ok === false) {
      run.status = 'error'
      run.stage = 'error'
      run.error = errors.join('; ') || 'Run failed'
      run.message = run.error
      pushLog('ERROR', run.error)
    } else {
      run.status = 'done'
      run.stage = 'done'
      run.message = run.awaitingReview
        ? `${run.posts.length} draft(s) ready — Accept to publish`
        : `Published ${run.posts.length} post(s)`
      run.progressPct = 100
      if (errors.length) pushLog('WARN', errors.join('; '))
      pushLog('INFO', run.message)
    }
  }
}

export function abortSeoBlogRun(): { ok: boolean; message: string } {
  if (isKaleduSeo()) return abortKaleduSeo()
  const slot = seoSlot()
  if (slot.child?.pid) {
    try {
      slot.child.kill()
    } catch {
      /* ignore */
    }
    child = null
  }
  if (run.status === 'running') {
    run.status = 'idle'
    run.stage = 'idle'
    run.message = 'Aborted'
    run.finishedAt = Date.now()
    pushLog('INFO', 'Aborted by user')
  }
  stashSeo(slot)
  return { ok: true, message: 'Aborted' }
}

export function clearSeoBlogRun(): { ok: boolean; message: string } {
  if (isKaleduSeo()) return clearKaleduSeo()
  const slot = seoSlot()
  if (slot.child && !slot.child.killed) {
    return { ok: false, message: 'Stop the run first' }
  }
  run = emptyRun()
  stashSeo(slot)
  return { ok: true, message: 'Cleared' }
}

export function acceptSeoBlogDraft(slug: string): { ok: boolean; message: string } | Promise<{ ok: boolean; message: string }> {
  if (isKaleduSeo()) return acceptKaleduSeo(slug)
  const slot = seoSlot()
  if (!currentProfileBrand().seoUsesEbookGenerator) {
    return { ok: false, message: 'SEO article engine is not enabled for this profile yet' }
  }
  const args = ['accept', '--slug', slug]
  if (settings.autoPush) args.push('--auto-push')
  if (settings.indexnowKey) args.push('--indexnow-key', settings.indexnowKey)
  const result = runReviewCli(args)
  pushLog(result.ok ? 'INFO' : 'ERROR', result.message)
  stashSeo(slot)
  return { ok: result.ok, message: result.message }
}

export function rejectSeoBlogDraft(slug: string): { ok: boolean; message: string } {
  if (isKaleduSeo()) return rejectKaleduSeo(slug)
  const slot = seoSlot()
  if (!currentProfileBrand().seoUsesEbookGenerator) {
    return { ok: false, message: 'SEO article engine is not enabled for this profile yet' }
  }
  const result = runReviewCli(['reject', '--slug', slug])
  pushLog(result.ok ? 'INFO' : 'ERROR', result.message)
  stashSeo(slot)
  return { ok: result.ok, message: result.message }
}

export function acceptAllSeoBlogDrafts(): { ok: boolean; message: string } | Promise<{ ok: boolean; message: string }> {
  if (isKaleduSeo()) return acceptKaleduSeo()
  const slot = seoSlot()
  if (!currentProfileBrand().seoUsesEbookGenerator) {
    return { ok: false, message: 'SEO article engine is not enabled for this profile yet' }
  }
  const args = ['accept-all']
  if (settings.autoPush) args.push('--auto-push')
  if (settings.indexnowKey) args.push('--indexnow-key', settings.indexnowKey)
  const result = runReviewCli(args)
  pushLog(result.ok ? 'INFO' : 'ERROR', result.message)
  stashSeo(slot)
  return { ok: result.ok, message: result.message }
}

export function rejectAllSeoBlogDrafts(): { ok: boolean; message: string } {
  if (isKaleduSeo()) return rejectKaleduSeo()
  const slot = seoSlot()
  if (!currentProfileBrand().seoUsesEbookGenerator) {
    return { ok: false, message: 'SEO article engine is not enabled for this profile yet' }
  }
  const result = runReviewCli(['reject-all'])
  pushLog(result.ok ? 'INFO' : 'ERROR', result.message)
  stashSeo(slot)
  return { ok: result.ok, message: result.message }
}
