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
  autoPublish: boolean
  autoPush: boolean
  indexnowKey: string
  ollamaModel?: string
  topics?: string[]
  siteRoot?: string
}

export type SeoBlogPostPreview = {
  slug: string
  title?: string
  h1?: string
  published?: string
}

export type SeoBlogDraft = {
  mock?: boolean
  editorial?: { version: string; model: string; reviewedAt: string; checks: Record<string, { status: 'pass' | 'revise'; evidence: string; correction: string }> }
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

export type SeoBlogRun = {
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
  awaitingReview?: boolean
}

export type SeoBlogPublishedPost = {
  slug: string
  llmBackend?: string
  llmLabel: string
  published?: string
  publishedMs?: number
}

export type SeoBlogState = {
  siteUrl?: string
  engine?: string
  ok: boolean
  settings: SeoBlogSettings
  run: SeoBlogRun
  contentDir: string
  draftsDir?: string
  postCount: number
  slugs: string[]
  publishedPosts?: SeoBlogPublishedPost[]
  drafts?: SeoBlogDraft[]
  draftCount?: number
  childRunning: boolean
  message?: string
}

function authHeaders(extra?: HeadersInit): HeadersInit {
  const token =
    typeof window !== 'undefined'
      ? (window as unknown as { __CC_AUTH__?: string }).__CC_AUTH__
      : undefined
  return { ...(extra || {}), ...(token ? { 'X-CC-Token': token } : {}) }
}

async function readBody<T>(res: Response): Promise<T> {
  const text = await res.text()
  if (!text) {
    return { ok: false, message: `Empty response (${res.status})` } as T
  }
  try {
    return JSON.parse(text) as T
  } catch {
    const looksHtml = /^\s*</.test(text)
    return {
      ok: false,
      message: looksHtml
        ? `API not loaded (${res.status}). Fully restart Control Center, then open SEO Blog again.`
        : `Bad response (${res.status})`,
    } as T
  }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: authHeaders() })
  return readBody<T>(res)
}

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body ?? {}),
  })
  return readBody<T>(res)
}

export async function fetchSeoBlogState(): Promise<SeoBlogState> {
  try {
    const data = await getJson<SeoBlogState>('/api/seo-blog?action=state')
    if (!data || typeof data !== 'object') {
      return { ok: false, message: 'Invalid state payload' } as SeoBlogState
    }
    return data
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    } as SeoBlogState
  }
}

export async function saveSeoBlogSettings(settings: Partial<SeoBlogSettings>) {
  return postJson<{ ok: boolean; settings?: SeoBlogSettings; message?: string }>(
    '/api/seo-blog?action=settings',
    settings,
  )
}

export async function startSeoBlogRun(settings?: Partial<SeoBlogSettings>) {
  return postJson<{ ok: boolean; message: string }>('/api/seo-blog?action=start', { settings })
}

export async function abortSeoBlogRun() {
  return postJson<{ ok: boolean; message: string }>('/api/seo-blog?action=abort')
}

export async function clearSeoBlogRun() {
  return postJson<{ ok: boolean; message: string }>('/api/seo-blog?action=clear-run')
}

export async function acceptSeoBlogDraft(slug: string) {
  return postJson<{ ok: boolean; message: string }>('/api/seo-blog?action=accept', { slug })
}

export async function rejectSeoBlogDraft(slug: string) {
  return postJson<{ ok: boolean; message: string }>('/api/seo-blog?action=reject', { slug })
}

export async function acceptAllSeoBlogDrafts() {
  return postJson<{ ok: boolean; message: string }>('/api/seo-blog?action=accept-all')
}

export async function rejectAllSeoBlogDrafts() {
  return postJson<{ ok: boolean; message: string }>('/api/seo-blog?action=reject-all')
}
