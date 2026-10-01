export type RedditCommenterStatus =
  | 'idle'
  | 'waiting_login'
  | 'running'
  | 'paused'
  | 'done'
  | 'error'

export type Subreddit = {
  id: string
  name: string
  url: string
  source?: 'joined' | 'discovered'
  category?: string
  categoryLabel?: string
}

export const LT_DISCOVERY_CATEGORIES = [
  { id: 'main', label: 'Main Lithuanian' },
  { id: 'local', label: 'Cities & regions' },
  { id: 'health', label: 'Health & weight loss' },
  { id: 'food', label: 'Food & cooking' },
  { id: 'parenting', label: 'Parenting & family' },
  { id: 'finance', label: 'Finance & lifestyle' },
  { id: 'hobbies', label: 'Hobbies & interests' },
  { id: 'pets', label: 'Pets & animals' },
  { id: 'community', label: 'Community & Q&A' },
] as const

export type SubredditBlacklistEntry = {
  id: string
  name: string
  reason: string
  removedAt?: string
}

export type QueueItem = {
  id: string
  postId: string
  subreddit: string
  postTitle: string
  postUrl: string
  relevance: number
  reason: string
  draftComment: string
  status: 'pending' | 'approved' | 'posted' | 'skipped' | 'failed'
  createdAt: string
  postedAt?: string | null
  commentUrl?: string | null
  error?: string | null
}

export type RedditCommenterSettings = {
  selectedSubredditIds: string[]
  autoPost: boolean
  relevanceThreshold: number
  siteMention: string
  maxPostAgeHours: number
  sortBy: 'hot' | 'new'
  minIntervalMin: number
  maxIntervalMin: number
  warmupSec: number
  dailyCap: number
  minTypeDelayMs: number
  maxTypeDelayMs: number
  shuffleSubreddits: boolean
  loginUsername: string
  autoLogin: boolean
  loginMethod: 'google' | 'google_passkey' | 'reddit'
  llmProvider: 'gemini_first' | 'gemini_only' | 'ollama_only'
  ollamaUrl: string
  ollamaModel: string
  geminiModel: string
  autoDiscoverLtSubs: boolean
  ltDiscoveryCategories: string[]
}

export type RedditCommenterRun = {
  id: string
  mode: 'scan' | 'post' | 'scan-and-post' | 'refresh-subreddits' | 'join-subreddits' | null
  status: RedditCommenterStatus
  createdAt: string
  updatedAt: string
  message?: string
  error?: string
  posted: number
  failed: number
  matched: number
  scanned: number
  total: number
  currentSubreddit?: string | null
  currentPost?: string | null
  waitEndsAt?: string | null
  waitLabel?: string | null
}

export type RedditCommenterLogEntry = {
  at: string
  kind: 'info' | 'error' | string
  message: string
}

export type RedditCommenterState = {
  ok: boolean
  settings: RedditCommenterSettings
  run: RedditCommenterRun
  subreddits: Subreddit[]
  queue: QueueItem[]
  log: RedditCommenterLogEntry[]
  workerRunning: boolean
  workerPid?: number
  message?: string
  hasLoginPassword: boolean
  loginPassword?: string
  blacklist: SubredditBlacklistEntry[]
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
  if (!text) return { ok: false, message: `Empty response (${res.status})` } as T
  try {
    return JSON.parse(text) as T
  } catch {
    return { ok: false, message: `Bad response (${res.status})` } as T
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

export async function fetchRedditCommenterState(): Promise<RedditCommenterState | null> {
  try {
    const data = await getJson<RedditCommenterState>('/api/reddit-commenter?action=state')
    if (!data || typeof data !== 'object') return null
    return data
  } catch {
    return null
  }
}

export async function fetchRedditCommenterPoll(): Promise<Partial<RedditCommenterState> | null> {
  try {
    const data = await getJson<Partial<RedditCommenterState>>('/api/reddit-commenter?action=poll')
    if (!data || typeof data !== 'object') return null
    return data
  } catch {
    return null
  }
}

export async function saveRedditCommenterSettings(
  settings: Partial<RedditCommenterSettings> & { loginPassword?: string },
) {
  return postJson<{ ok: boolean; message: string; settings: RedditCommenterSettings }>(
    '/api/reddit-commenter?action=settings',
    settings,
  )
}

export async function refreshRedditSubreddits(
  settings?: Partial<RedditCommenterSettings> & { loginPassword?: string },
) {
  return postJson<{ ok: boolean; message: string; state?: RedditCommenterState }>(
    '/api/reddit-commenter?action=refresh-subreddits',
    { settings },
  )
}

export async function joinRedditSubreddits(
  scope: 'selected' | 'all',
  settings?: Partial<RedditCommenterSettings> & { loginPassword?: string },
) {
  return postJson<{ ok: boolean; message: string; state?: RedditCommenterState }>(
    '/api/reddit-commenter?action=join-subreddits',
    { scope, settings },
  )
}

export async function startRedditScan(settings?: Partial<RedditCommenterSettings>) {
  return postJson<{ ok: boolean; message: string; state?: RedditCommenterState }>(
    '/api/reddit-commenter?action=scan',
    { settings },
  )
}

export async function startRedditPost(settings?: Partial<RedditCommenterSettings>) {
  return postJson<{ ok: boolean; message: string; state?: RedditCommenterState }>(
    '/api/reddit-commenter?action=post',
    { settings },
  )
}

export async function startRedditScanAndPost(settings?: Partial<RedditCommenterSettings>) {
  return postJson<{ ok: boolean; message: string; state?: RedditCommenterState }>(
    '/api/reddit-commenter?action=scan-and-post',
    { settings },
  )
}

export async function continueRedditCommenterLogin() {
  return postJson<{ ok: boolean; message: string }>('/api/reddit-commenter?action=continue-login')
}

export async function clearRedditCommenterLoginSession() {
  return postJson<{ ok: boolean; message: string }>('/api/reddit-commenter?action=clear-login')
}

export async function pauseRedditCommenter() {
  return postJson<{ ok: boolean; message: string }>('/api/reddit-commenter?action=pause')
}

export async function resumeRedditCommenter() {
  return postJson<{ ok: boolean; message: string }>('/api/reddit-commenter?action=resume')
}

export async function showRedditCommenterBrowser() {
  return postJson<{ ok: boolean; message: string }>('/api/reddit-commenter?action=show-browser')
}

export async function abortRedditCommenter() {
  return postJson<{ ok: boolean; message: string }>('/api/reddit-commenter?action=abort')
}

export async function clearRedditCommenterRun() {
  return postJson<{ ok: boolean; message: string; state: RedditCommenterState }>(
    '/api/reddit-commenter?action=clear-run',
  )
}

export async function approveQueueItem(id: string) {
  return postJson<{ ok: boolean; message: string; state?: RedditCommenterState }>(
    '/api/reddit-commenter?action=approve',
    { id },
  )
}

export async function approveAllPending() {
  return postJson<{ ok: boolean; message: string; state?: RedditCommenterState }>(
    '/api/reddit-commenter?action=approve-all',
  )
}

export async function skipQueueItem(id: string) {
  return postJson<{ ok: boolean; message: string; state?: RedditCommenterState }>(
    '/api/reddit-commenter?action=skip',
    { id },
  )
}

export async function updateQueueComment(id: string, comment: string) {
  return postJson<{ ok: boolean; message: string; state?: RedditCommenterState }>(
    '/api/reddit-commenter?action=update-comment',
    { id, comment },
  )
}

export async function clearQueue(clearPosted = false) {
  return postJson<{ ok: boolean; message: string; state?: RedditCommenterState }>(
    '/api/reddit-commenter?action=clear-queue',
    { clearPosted },
  )
}

export async function blacklistSubreddits(ids: string[]) {
  return postJson<{ ok: boolean; message: string; state?: RedditCommenterState }>(
    '/api/reddit-commenter?action=blacklist',
    { ids },
  )
}

export async function unblacklistSubreddit(id: string) {
  return postJson<{ ok: boolean; message: string; state?: RedditCommenterState }>(
    '/api/reddit-commenter?action=unblacklist',
    { id },
  )
}
