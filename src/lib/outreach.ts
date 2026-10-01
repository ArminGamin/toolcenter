export type OutreachStage = 'idle' | 'find' | 'clean' | 'approve' | 'send' | 'done' | 'error'
export type OutreachStatus =
  | 'idle'
  | 'running'
  | 'waiting'
  | 'sending'
  | 'paused'
  | 'done'
  | 'error'

export type OutreachLogEntry = {
  at: string
  kind: 'info' | 'error' | 'decision' | 'warn'
  stage: OutreachStage
  message: string
}

export type EmailCandidate = {
  email: string
  decision: 'keep' | 'drop'
  reason: string
  selected: boolean
}

export type OutreachLeadEvidence = {
  email: string
  name: string
  sourceUrl: string
  sourceUrls: string[]
  score: number
  sourceType: string
  personEvidence: string[]
  locationEvidence: string[]
  contactEvidence: string[]
  canonicalUrl: string
  identityKey: string
}

export type OutreachCampaignHealth = {
  target: number
  qualifiedPeople: number
  candidatesFound: number
  duplicatesRemoved: number
  rejectedOrganizations: number
  invalidContacts: number
  rejectedNotPerson: number
  discoveryStatus: string
  stage: string
  workersHealthy: number
  workersTotal: number
  queueSize: number
  processedSources: number
  workerHeartbeat?: string
  lastSuccessfulAction?: string
  errorCount: number
  recoveries: number
  currentSources: string[]
}

export type OutreachDiscoveryCandidate = {
  encounters?: number
  email: string
  name: string
  sourceUrl: string
  reason: string
  at: string
  status: 'qualified' | 'rejected' | 'observed'
}

export type OutreachCandidateAudit = {
  candidates: OutreachDiscoveryCandidate[]
  total: number
}

export type FindSettings = {
  niche: string
  model: string
  lt: boolean
  follow: boolean
  consumer: boolean
  regular: boolean
  verify: boolean
  smtp: boolean
  newOnly: boolean
  autoCampaign: boolean
  applyAiSettings: boolean
  fastMode: boolean
  maxPages: string
  maxUrls: string
  maxQueries: string
  leadTarget: string
  minScore: string
  source: 'headless' | 'paste' | 'import'
  runMode: 'full' | 'discover' | 'scrape'
  pasteList: string
  seedUrls: string
}

export type CleanSettings = {
  allowlist: string[]
  blockLocals: string[]
  blockDomains: string[]
  strictness: 'normal' | 'strict'
}

export type SendSettings = {
  subject: string
  html: string
  useAssetHtml: boolean
  promoHtmlPaths?: string[]
  testRecipient?: string
  rotateSubjects: boolean
  fromOverride: string
  dailyCap: number
  delayMs: number
  autoContinueNextDay: boolean
  discordNotify: boolean
  activeProfile: string
  resendApiKey: string
  resendFrom: string
}

export type ChainSettings = {
  enabled: boolean
  profiles: string[]
  maxEmptyFills: number
  maxDurationMin: number
}

export type OutreachSettings = {
  find: FindSettings
  clean: CleanSettings
  requireApprove: boolean
  send: SendSettings
  chain: ChainSettings
}

export type OutreachRun = {
  id: string
  stage: OutreachStage
  status: OutreachStatus
  createdAt: string
  updatedAt: string
  findOutputPath?: string
  found: string[]
  candidates: EmailCandidate[]
  approved: string[]
  pendingSend: string[]
  sent: string[]
  failed: Array<{ email: string; error: string }>
  sendIndex: number
  liveSendActive?: boolean
  finderComplete?: boolean
  liveProvisional?: string[]
  liveEligible?: string[]
  leadEvidence?: Record<string, OutreachLeadEvidence>
  health?: OutreachCampaignHealth
  resumeAttempts?: number
  error?: string
  message?: string
}

export type OutreachState = {
  ok: boolean
  settings: OutreachSettings
  run: OutreachRun
  counts: {
    found: number
    kept: number
    dropped: number
    approved: number
    pendingSend: number
    sent: number
    failed: number
    quotaSent: number
    quotaCap: number
    quotaRemaining: number
    /** Live find target from server (chain-sized to remaining quota). */
    findTarget: number
    liveProvisional: number
    liveEligible: number
    liveApprovalPending: number
  }
  quota: { date: string; sent: number; cap: number; remaining: number }
  chain?: {
    active: boolean
    index: number
    total: number
    current: string
    profiles: string[]
    startedAt?: string | null
    finishedAt?: string | null
  }
  profileStore?: {
    id: string
    name: string
    leadsDb: string
    sentCount: number
    rejectedCount: number
    permanentBlacklistCount?: number
    permanentBlacklistPath?: string
  }
  vault: {
    hasResendKey: boolean
    from: string
    keyMasked: string
    source?: 'profile' | 'vault'
    activeProfile?: string
    vaultFrom?: string
    vaultKeyMasked?: string
  }
  sendProfiles?: { name: string; updatedAt: string; from: string; keyMasked: string }[]
  assets?: {
    promoHtmlExists: boolean
    promoHtmlPath: string
    subjectsCount: number
    subjectsPreview: string[]
  }
  findChildRunning: boolean
  sendLoopActive: boolean
  sendPaused: boolean
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

export async function fetchOutreachState(): Promise<OutreachState | null> {
  try {
    const data = await getJson<OutreachState>('/api/outreach?action=state')
    if (!data || typeof data !== 'object') return null
    return data
  } catch {
    return null
  }
}

/** Light poll — run/counts only (no settings HTML). Use while panel is open. */
export async function fetchOutreachPoll(): Promise<Partial<OutreachState> | null> {
  try {
    const data = await getJson<Partial<OutreachState>>('/api/outreach?action=poll')
    if (!data || typeof data !== 'object') return null
    return data
  } catch {
    return null
  }
}

export async function fetchOutreachLog(
  filter: 'all' | 'error' | 'decision' = 'all',
): Promise<OutreachLogEntry[]> {
  try {
    const res = await getJson<{ ok: boolean; log: OutreachLogEntry[] }>(
      `/api/outreach?action=log&filter=${filter}&limit=80`,
    )
    return res.log || []
  } catch {
    return []
  }
}

export async function fetchOutreachCandidateAudit(limit = 2000): Promise<OutreachCandidateAudit> {
  try {
    const res = await getJson<{ ok: boolean; candidates: OutreachDiscoveryCandidate[]; total?: number }>(
      `/api/outreach?action=candidate-audit&limit=${limit}`,
    )
    if (!res.ok) throw new Error('Candidate audit could not load. Retry shortly.')
    return { candidates: res.candidates || [], total: Number(res.total || 0) }
  } catch (error) {
    throw error instanceof Error ? error : new Error('Candidate audit could not load')
  }
}

export async function saveOutreachSettings(settings: Partial<OutreachSettings>) {
  try {
    return await postJson<{ ok: boolean; message: string; settings: OutreachSettings }>(
      '/api/outreach?action=settings',
      settings,
    )
  } catch (err) {
    return { ok: false as const, message: err instanceof Error ? err.message : 'Save failed', settings: settings as OutreachSettings }
  }
}

export async function startOutreachRun(body?: {
  settings?: Partial<OutreachSettings>
  pasteList?: string
  importFilePath?: string
}) {
  try {
    return await postJson<{ ok: boolean; message: string; run: OutreachRun }>('/api/outreach?action=start', body)
  } catch (err) {
    return {
      ok: false as const,
      message: err instanceof Error ? err.message : 'Start failed',
      run: null as unknown as OutreachRun,
    }
  }
}

export async function approveOutreach(body: { selected?: string[]; keep?: string[]; drop?: string[] }) {
  try {
    return await postJson<{ ok: boolean; message: string; run: OutreachRun }>('/api/outreach?action=approve', body)
  } catch (err) {
    return {
      ok: false as const,
      message: err instanceof Error ? err.message : 'Approve failed',
      run: null as unknown as OutreachRun,
    }
  }
}

export async function startOutreachSend() {
  try {
    return await postJson<{ ok: boolean; message: string; run: OutreachRun }>('/api/outreach?action=send')
  } catch (err) {
    return {
      ok: false as const,
      message: err instanceof Error ? err.message : 'Send failed',
      run: null as unknown as OutreachRun,
    }
  }
}

export async function startOutreachLiveSend(selected?: string[]) {
  try {
    return await postJson<{ ok: boolean; message: string; run: OutreachRun }>(
      '/api/outreach?action=send-live',
      selected?.length ? { selected } : {},
    )
  } catch (err) {
    return {
      ok: false as const,
      message: err instanceof Error ? err.message : 'Live send failed',
      run: null as unknown as OutreachRun,
    }
  }
}

export async function testOutreachSend() {
  try {
    return await postJson<{ ok: boolean; message: string }>('/api/outreach?action=test-send')
  } catch (err) {
    return { ok: false as const, message: err instanceof Error ? err.message : 'Test send failed' }
  }
}

export async function loadPromoHtml() {
  try {
    return await postJson<{ ok: boolean; message: string; settings?: OutreachSettings }>(
      '/api/outreach?action=load-promo',
    )
  } catch (err) {
    return { ok: false as const, message: err instanceof Error ? err.message : 'Load promo failed' }
  }
}

export async function pauseOutreachSend() {
  try {
    return await postJson<{ ok: boolean; message: string; run: OutreachRun }>('/api/outreach?action=pause')
  } catch (err) {
    return {
      ok: false as const,
      message: err instanceof Error ? err.message : 'Pause failed',
      run: null as unknown as OutreachRun,
    }
  }
}

export async function resumeOutreachSend() {
  try {
    return await postJson<{ ok: boolean; message: string; run: OutreachRun }>('/api/outreach?action=resume')
  } catch (err) {
    return {
      ok: false as const,
      message: err instanceof Error ? err.message : 'Resume failed',
      run: null as unknown as OutreachRun,
    }
  }
}

export async function abortOutreach() {
  try {
    return await postJson<{ ok: boolean; message: string; run: OutreachRun }>('/api/outreach?action=abort')
  } catch (err) {
    return {
      ok: false as const,
      message: err instanceof Error ? err.message : 'Abort failed',
      run: null as unknown as OutreachRun,
    }
  }
}

export async function freshStartOutreach() {
  try {
    return await postJson<{ ok: boolean; message: string; run?: OutreachRun }>(
      '/api/outreach?action=fresh-start',
    )
  } catch (err) {
    return { ok: false as const, message: err instanceof Error ? err.message : 'Fresh search failed' }
  }
}

export async function dryRunClean(text: string, clean?: Partial<CleanSettings>) {
  try {
    return await postJson<{
      ok: boolean
      keep: EmailCandidate[]
      drop: EmailCandidate[]
      skipped: string[]
      inputCount: number
      message?: string
    }>('/api/outreach?action=clean', { text, clean })
  } catch (err) {
    return {
      ok: false as const,
      keep: [],
      drop: [],
      skipped: [],
      inputCount: 0,
      message: err instanceof Error ? err.message : 'Clean failed',
    }
  }
}

export async function cleanOutreachFound() {
  try {
    return await postJson<{ ok: boolean; message: string }>('/api/outreach?action=clean-found')
  } catch (err) {
    return { ok: false as const, message: err instanceof Error ? err.message : 'Clean failed' }
  }
}

export async function resetOutreachSent() {
  try {
    return await postJson<{ ok: boolean; message: string }>('/api/outreach?action=reset-sent')
  } catch (err) {
    return { ok: false as const, message: err instanceof Error ? err.message : 'Reset failed' }
  }
}

export async function resetOutreachRejected() {
  try {
    return await postJson<{ ok: boolean; message: string }>('/api/outreach?action=reset-rejected')
  } catch (err) {
    return { ok: false as const, message: err instanceof Error ? err.message : 'Reset failed' }
  }
}

export async function clearOutreachLog() {
  try {
    return await postJson<{ ok: boolean; message: string }>('/api/outreach?action=clear-log')
  } catch (err) {
    return { ok: false as const, message: err instanceof Error ? err.message : 'Clear failed' }
  }
}

export async function clearOutreachRun() {
  try {
    return await postJson<{ ok: boolean; message: string }>('/api/outreach?action=clear-run')
  } catch (err) {
    return { ok: false as const, message: err instanceof Error ? err.message : 'Clear failed' }
  }
}

export async function clearScrapeCache() {
  try {
    return await postJson<{ ok: boolean; message: string }>('/api/outreach?action=clear-scrape-cache')
  } catch (err) {
    return { ok: false as const, message: err instanceof Error ? err.message : 'Clear failed' }
  }
}

export type LeadFinderExportFile = {
  name: string
  path: string
  mtimeMs: number
  emailCount: number
}

export async function fetchLeadFinderExports(): Promise<{
  ok: boolean
  files: LeadFinderExportFile[]
  outputDir?: string
  message?: string
}> {
  try {
    return await getJson<{
      ok: boolean
      files: LeadFinderExportFile[]
      outputDir?: string
    }>('/api/outreach?action=lead-exports')
  } catch (err) {
    return {
      ok: false,
      files: [],
      message: err instanceof Error ? err.message : 'Could not list exports',
    }
  }
}

export async function exportOutreachLeads(): Promise<{
  ok: boolean
  path?: string
  message: string
  count: number
}> {
  try {
    return await postJson<{ ok: boolean; path?: string; message: string; count: number }>(
      '/api/outreach?action=export-leads',
    )
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Export failed',
      count: 0,
    }
  }
}

export async function clearProfileDatabases(scope: 'active' | 'all' = 'active') {
  try {
    return await postJson<{ ok: boolean; message: string; cleared?: string[] }>(
      '/api/outreach?action=clear-profile-db',
      { scope },
    )
  } catch (err) {
    return { ok: false as const, message: err instanceof Error ? err.message : 'Clear failed' }
  }
}

export async function listOutreachSendProfiles() {
  return getJson<{
    ok: boolean
    profiles: { name: string; updatedAt: string; from: string; keyMasked: string }[]
  }>('/api/outreach?action=send-profiles')
}

export async function saveOutreachSendProfile(name: string) {
  try {
    return await postJson<{
      ok: boolean
      message: string
      settings?: OutreachSettings
      profiles?: { name: string; updatedAt: string; from: string; keyMasked: string }[]
    }>('/api/outreach?action=send-profile-save', { name })
  } catch (err) {
    return { ok: false as const, message: err instanceof Error ? err.message : 'Save profile failed' }
  }
}

export async function loadOutreachSendProfile(name: string) {
  try {
    return await postJson<{ ok: boolean; message: string; settings?: OutreachSettings }>(
      '/api/outreach?action=send-profile-load',
      { name },
    )
  } catch (err) {
    return { ok: false as const, message: err instanceof Error ? err.message : 'Load profile failed' }
  }
}

export async function deleteOutreachSendProfile(name: string) {
  try {
    return await postJson<{
      ok: boolean
      message: string
      settings?: OutreachSettings
      profiles?: { name: string; updatedAt: string; from: string; keyMasked: string }[]
    }>('/api/outreach?action=send-profile-delete', { name })
  } catch (err) {
    return { ok: false as const, message: err instanceof Error ? err.message : 'Delete profile failed' }
  }
}
