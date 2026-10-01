export type FriendDmStatus =
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

export type FriendDmSettings = {
  message: string
  rotateMessages: boolean
  postaiPath: string
  intervalUnit: IntervalUnit
  minInterval: number
  maxInterval: number
  /** Kept in sync when intervalUnit is minutes (worker compat). */
  minIntervalMin: number
  maxIntervalMin: number
  warmupSec: number
  dailyCap: number
  minTypeDelayMs: number
  maxTypeDelayMs: number
  selectedFriendIds: string[]
  shuffleFriends: boolean
  skipAlreadyMessaged: boolean
  messageIndex: number
  includeImage: boolean
  /** When true, attach an image on every DM (not every 1–3). */
  imageEveryMessage: boolean
}

export type FriendDmRun = {
  id: string
  mode: 'dm-friends' | 'refresh-friends' | null
  status: FriendDmStatus
  createdAt: string
  updatedAt: string
  message?: string
  error?: string
  sent: number
  failed: number
  skipped?: number
  total: number
  currentFriend?: string | null
  messageIndex: number
  waitEndsAt?: string | null
  waitLabel?: string | null
}

export type FriendDmLogEntry = {
  at: string
  kind: 'info' | 'error' | string
  message: string
}

export type FriendDmState = {
  ok: boolean
  settings: FriendDmSettings
  run: FriendDmRun
  friends: FbFriend[]
  /** DM messages saved in Control Center (friend-dms/messages.txt) */
  messages: string
  messagesCount: number
  sentIds: string[]
  log: FriendDmLogEntry[]
  workerRunning: boolean
  workerPid?: number
  includeText?: boolean
  includeImage?: boolean
  imagesVyrasCount?: number
  imagesMoterisCount?: number
  imagesOtherCount?: number
  imagesDir?: string
  loginEmail?: string
  autoLogin?: boolean
  hasLoginPassword?: boolean
  loginPassword?: string
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

export async function fetchFriendDmState(): Promise<FriendDmState | null> {
  try {
    return await getJson<FriendDmState>('/api/group-poster?action=dm-state')
  } catch {
    return null
  }
}

export async function fetchFriendDmPoll(): Promise<Partial<FriendDmState> | null> {
  try {
    return await getJson<Partial<FriendDmState>>('/api/group-poster?action=dm-poll')
  } catch {
    return null
  }
}

export async function saveFriendDmSettings(partial: Partial<FriendDmSettings>) {
  return postJson<{ ok: boolean; message: string; settings: FriendDmSettings }>(
    '/api/group-poster?action=dm-settings',
    partial,
  )
}

export async function saveFriendDmMessages(text: string) {
  return postJson<{ ok: boolean; message: string; count: number }>(
    '/api/group-poster?action=dm-save-messages',
    { text },
  )
}

export async function refreshFriendDmFriends() {
  return postJson<{ ok: boolean; message: string; state?: FriendDmState }>(
    '/api/group-poster?action=dm-refresh-friends',
  )
}

export async function startFriendDms(settings?: Partial<FriendDmSettings>) {
  return postJson<{ ok: boolean; message: string; state?: FriendDmState }>(
    '/api/group-poster?action=dm-start',
    settings ?? {},
  )
}

export async function pauseFriendDms() {
  return postJson<{ ok: boolean; message: string }>('/api/group-poster?action=dm-pause')
}

export async function resumeFriendDms() {
  return postJson<{ ok: boolean; message: string }>('/api/group-poster?action=dm-resume')
}

export async function abortFriendDms() {
  return postJson<{ ok: boolean; message: string }>('/api/group-poster?action=dm-abort')
}

export async function continueFriendDmLogin() {
  return postJson<{ ok: boolean; message: string }>('/api/group-poster?action=dm-continue-login')
}

export async function showFriendDmBrowser() {
  return postJson<{ ok: boolean; message: string }>('/api/group-poster?action=dm-show-browser')
}

export async function clearFriendDmSent() {
  return postJson<{ ok: boolean; message: string }>('/api/group-poster?action=dm-clear-sent')
}

export async function clearFriendDmLog() {
  return postJson<{ ok: boolean; message: string }>('/api/group-poster?action=dm-clear-log')
}

export async function clearFriendDmRun() {
  return postJson<{ ok: boolean; message: string; state?: FriendDmState }>(
    '/api/group-poster?action=clear-run',
    { scope: 'dm', action: 'clear-run' },
  )
}

function csvEscape(val: string): string {
  const s = String(val ?? '')
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function downloadFriendList(
  friends: FbFriend[],
  opts?: { sentIds?: Iterable<string>; format?: 'csv' | 'json' | 'txt' },
): { ok: boolean; message: string } {
  if (!friends.length) {
    return { ok: false, message: 'No friends to export — refresh friends first' }
  }

  const sent = new Set(opts?.sentIds ?? [])
  const format = opts?.format ?? 'csv'
  const rows = friends.map((f) => ({
    id: f.id,
    name: f.name,
    url: f.url,
    sent: sent.has(f.id) ? 'yes' : 'no',
  }))

  const stamp = new Date().toISOString().slice(0, 10)
  let body: string
  let mime: string
  let ext: string

  if (format === 'json') {
    body = JSON.stringify(rows, null, 2)
    mime = 'application/json;charset=utf-8'
    ext = 'json'
  } else if (format === 'txt') {
    body = rows
      .map((r) => `${r.name}\t${r.id}\t${r.url}\t${r.sent}`)
      .join('\r\n')
    body = `name\tid\turl\tsent\r\n${body}`
    mime = 'text/plain;charset=utf-8'
    ext = 'txt'
  } else {
    body = [
      'id,name,url,sent',
      ...rows.map((r) => [r.id, r.name, r.url, r.sent].map(csvEscape).join(',')),
    ].join('\r\n')
    body = `\uFEFF${body}`
    mime = 'text/csv;charset=utf-8'
    ext = 'csv'
  }

  const blob = new Blob([body], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `facebook-friends-${stamp}.${ext}`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)

  return { ok: true, message: `Exported ${friends.length} friends` }
}
