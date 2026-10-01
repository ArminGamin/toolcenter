export type GroupPosterStatus =
  | 'idle'
  | 'waiting_login'
  | 'running'
  | 'paused'
  | 'done'
  | 'error'

export type FbGroup = {
  id: string
  name: string
  url: string
}

export type GroupBlacklistEntry = {
  id: string
  name: string
  reason: string
  removedAt?: string
}

export type GroupPosterProgress = {
  active: boolean
  postedCount: number
  postedIds: string[]
  remainingSec: number
  updatedAt?: string
  stoppedAt?: string | null
}

export type GroupPosterSettings = {
  includeText: boolean
  includeLink: boolean
  includeImage: boolean
  fixedCaption: string
  rotateCaptions: boolean
  linkUrl: string
  imagePaths: string[]
  imagesDir: string
  rotateImages: boolean
  imageIndexVyras: number
  imageIndexMoteris: number
  minIntervalMin: number
  maxIntervalMin: number
  warmupSec: number
  dailyCap: number
  minTypeDelayMs: number
  maxTypeDelayMs: number
  selectedGroupIds: string[]
  shuffleGroups: boolean
  captionIndex: number
  autoJoinBeforePost: boolean
  loginEmail: string
  autoLogin: boolean
  preserveExistingBlacklist: boolean
}

export type GroupPosterRun = {
  id: string
  mode: 'post' | 'refresh-groups' | null
  status: GroupPosterStatus
  createdAt: string
  updatedAt: string
  message?: string
  error?: string
  posted: number
  failed: number
  total: number
  currentGroup?: string | null
  captionIndex: number
  waitEndsAt?: string | null
  waitLabel?: string | null
}

export type GroupPosterLogEntry = {
  at: string
  kind: 'info' | 'error' | string
  message: string
}

export type GroupPosterProfileMeta = {
  name: string
  updatedAt: string
  linkUrl: string
  imagesDir: string
  captionsCount: number
}

export type GroupPosterState = {
  ok: boolean
  settings: GroupPosterSettings
  run: GroupPosterRun
  groups: FbGroup[]
  captions: string
  captionsCount: number
  captionsPreview: string[]
  imagesVyrasCount?: number
  imagesMoterisCount?: number
  imagesOtherCount?: number
  log: GroupPosterLogEntry[]
  workerRunning: boolean
  workerPid?: number
  message?: string
  hasLoginPassword?: boolean
  loginPassword?: string
  profiles?: GroupPosterProfileMeta[]
  activeProfile?: string
  blacklist?: GroupBlacklistEntry[]
  progress?: GroupPosterProgress
  queuePreview?: {
    selected: number
    eligible: number
    excluded: number
    excludedByReason: Record<string, number>
    staleOrUnscanned: number
    scanRecommended: boolean
    eligibleIds: string[]
  }
  defaultImagesDir?: string
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

export async function fetchGroupPosterState(): Promise<GroupPosterState | null> {
  try {
    const data = await getJson<GroupPosterState>('/api/group-poster?action=state')
    if (!data || typeof data !== 'object') return null
    return data
  } catch {
    return null
  }
}

export async function fetchGroupPosterPoll(): Promise<Partial<GroupPosterState> | null> {
  try {
    const data = await getJson<Partial<GroupPosterState>>('/api/group-poster?action=poll')
    if (!data || typeof data !== 'object') return null
    return data
  } catch {
    return null
  }
}

export async function saveGroupPosterSettings(
  settings: Partial<GroupPosterSettings> & { loginPassword?: string },
) {
  try {
    return await postJson<{ ok: boolean; message: string; settings: GroupPosterSettings }>(
      '/api/group-poster?action=settings',
      settings,
    )
  } catch {
    return { ok: false, message: 'Failed to save settings', settings: settings as GroupPosterSettings }
  }
}

export async function saveGroupPosterCaptions(captions: string) {
  try {
    return await postJson<{ ok: boolean; message: string; captions: string; count: number }>(
      '/api/group-poster?action=save-captions',
      { captions },
    )
  } catch {
    return { ok: false, message: 'Failed to save captions', captions, count: 0 }
  }
}

export async function startGroupPoster(settings?: Partial<GroupPosterSettings>) {
  return postJson<{ ok: boolean; message: string; state?: GroupPosterState }>(
    '/api/group-poster?action=start',
    { settings },
  )
}

export async function refreshGroupPosterGroups() {
  return postJson<{ ok: boolean; message: string; state?: GroupPosterState }>(
    '/api/group-poster?action=refresh-groups',
  )
}

export async function continueGroupPosterLogin() {
  return postJson<{ ok: boolean; message: string }>('/api/group-poster?action=continue-login')
}

export async function clearGroupPosterLoginSession() {
  return postJson<{ ok: boolean; message: string }>('/api/group-poster?action=clear-login')
}

export async function pauseGroupPoster() {
  return postJson<{ ok: boolean; message: string }>('/api/group-poster?action=pause')
}

export async function resumeGroupPoster() {
  return postJson<{ ok: boolean; message: string }>('/api/group-poster?action=resume')
}

export async function showGroupPosterBrowser() {
  return postJson<{ ok: boolean; message: string }>('/api/group-poster?action=show-browser')
}

export async function abortGroupPoster() {
  return postJson<{ ok: boolean; message: string }>('/api/group-poster?action=abort')
}

export async function clearGroupPosterLog() {
  return postJson<{ ok: boolean; message: string }>('/api/group-poster?action=clear-log')
}

export async function clearGroupPosterRun() {
  return postJson<{ ok: boolean; message: string; state?: GroupPosterState }>(
    '/api/group-poster?action=clear-run',
  )
}

export async function clearGroupPosterWarmProgress() {
  return postJson<{ ok: boolean; message: string; state?: GroupPosterState }>(
    '/api/group-poster?action=clear-warm',
    { action: 'clear-warm' },
  )
}

export async function blacklistGroupPosterGroups(ids: string[]) {
  return postJson<{ ok: boolean; message: string; state?: GroupPosterState }>(
    '/api/group-poster?action=blacklist',
    { ids, action: 'blacklist' },
  )
}

export async function unblacklistGroupPosterGroup(id: string) {
  return postJson<{ ok: boolean; message: string; state?: GroupPosterState }>(
    '/api/group-poster?action=unblacklist',
    { id, action: 'unblacklist' },
  )
}

export async function saveGroupPosterProfile(name: string) {
  return postJson<{
    ok: boolean
    message: string
    profiles?: GroupPosterProfileMeta[]
    activeProfile?: string
    state?: GroupPosterState
  }>('/api/group-poster?action=profile-save', { name, action: 'profile-save' })
}

export async function loadGroupPosterProfile(name: string) {
  return postJson<{
    ok: boolean
    message: string
    settings?: GroupPosterSettings
    captions?: string
    profiles?: GroupPosterProfileMeta[]
    activeProfile?: string
    state?: GroupPosterState
  }>('/api/group-poster?action=profile-load', { name, action: 'profile-load' })
}

export async function deleteGroupPosterProfile(name: string) {
  return postJson<{
    ok: boolean
    message: string
    profiles?: GroupPosterProfileMeta[]
    activeProfile?: string
    state?: GroupPosterState
  }>('/api/group-poster?action=profile-delete', { name, action: 'profile-delete' })
}

export async function loadGroupPosterCaptionsFile(filePath: string) {
  return postJson<{
    ok: boolean
    message: string
    captions?: string
    count?: number
  }>('/api/group-poster?action=load-captions-file', { path: filePath, action: 'load-captions-file' })
}
