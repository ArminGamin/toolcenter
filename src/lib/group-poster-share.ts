export type ProfileShareStatus =
  | 'idle'
  | 'waiting_login'
  | 'running'
  | 'paused'
  | 'done'
  | 'error'

export type FbFriend = {
  id: string
  name: string
  url: string
}

export type IntervalUnit = 'minutes' | 'seconds'

export type ProfileShareSettings = {
  postUrl: string
  shareMessage: string
  intervalUnit: IntervalUnit
  minInterval: number
  maxInterval: number
  minIntervalMin: number
  maxIntervalMin: number
  warmupSec: number
  dailyCap: number
  selectedFriendIds: string[]
  shuffleFriends: boolean
  skipAlreadyShared: boolean
}

export type ProfileShareRun = {
  id: string
  mode: 'share-profile' | null
  status: ProfileShareStatus
  createdAt: string
  updatedAt: string
  message?: string
  error?: string
  sent: number
  failed: number
  skipped?: number
  total: number
  currentFriend?: string | null
  waitEndsAt?: string | null
  waitLabel?: string | null
}

export type ProfileShareLogEntry = {
  at: string
  kind: 'info' | 'error' | string
  message: string
}

export type ProfileShareState = {
  ok: boolean
  settings: ProfileShareSettings
  run: ProfileShareRun
  friends: FbFriend[]
  sentIds: string[]
  log: ProfileShareLogEntry[]
  workerRunning: boolean
  workerPid?: number
  loginEmail?: string
  autoLogin?: boolean
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

export async function fetchProfileShareState(): Promise<ProfileShareState | null> {
  try {
    return await getJson<ProfileShareState>('/api/group-poster?action=share-state')
  } catch {
    return null
  }
}

export async function fetchProfileSharePoll(): Promise<Partial<ProfileShareState> | null> {
  try {
    return await getJson<Partial<ProfileShareState>>('/api/group-poster?action=share-poll')
  } catch {
    return null
  }
}

export async function saveProfileShareSettings(partial: Partial<ProfileShareSettings>) {
  return postJson<{ ok: boolean; message: string; settings: ProfileShareSettings }>(
    '/api/group-poster?action=share-settings',
    partial,
  )
}

export async function startProfileShare(settings?: Partial<ProfileShareSettings>) {
  return postJson<{ ok: boolean; message: string; state?: ProfileShareState }>(
    '/api/group-poster?action=share-start',
    settings ?? {},
  )
}

export async function pauseProfileShare() {
  return postJson<{ ok: boolean; message: string }>('/api/group-poster?action=share-pause')
}

export async function resumeProfileShare() {
  return postJson<{ ok: boolean; message: string }>('/api/group-poster?action=share-resume')
}

export async function abortProfileShare() {
  return postJson<{ ok: boolean; message: string }>('/api/group-poster?action=share-abort')
}

export async function continueProfileShareLogin() {
  return postJson<{ ok: boolean; message: string }>('/api/group-poster?action=share-continue-login')
}

export async function showProfileShareBrowser() {
  return postJson<{ ok: boolean; message: string }>('/api/group-poster?action=share-show-browser')
}

export async function clearProfileShareSent() {
  return postJson<{ ok: boolean; message: string }>('/api/group-poster?action=share-clear-sent')
}

export async function clearProfileShareLog() {
  return postJson<{ ok: boolean; message: string }>('/api/group-poster?action=share-clear-log')
}

export async function clearProfileShareRun() {
  return postJson<{ ok: boolean; message: string; state?: ProfileShareState }>(
    '/api/group-poster?action=share-clear-run',
  )
}
