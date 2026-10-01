export type OutreachStage = 'idle' | 'find' | 'clean' | 'approve' | 'send' | 'done' | 'error'
export type OutreachStatus =
  | 'idle'
  | 'running'
  | 'waiting'
  | 'sending'
  | 'paused'
  | 'done'
  | 'error'

export type LogKind = 'all' | 'info' | 'error' | 'decision'

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
  /** Fast = outreach workers & fewer rounds; off = Lead Finder GUI defaults */
  fastMode: boolean
  maxPages: string
  maxUrls: string
  maxQueries: string
  leadTarget: string
  minScore: string
  /** ingest source */
  source: 'headless' | 'paste' | 'import'
  /** headless pipeline mode (Lead Finder parity) */
  runMode: 'full' | 'discover' | 'scrape'
  pasteList: string
  /** seed URLs for scrape mode — one per line */
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
  /** Ordered promo assets; empty uses the business's original template. */
  promoHtmlPaths?: string[]
  /** Explicit test-only recipient; never added to the campaign queue. */
  testRecipient?: string
  /** Rotate through the business's subjects.txt */
  rotateSubjects: boolean
  /** Override profile/vault from when non-empty */
  fromOverride: string
  dailyCap: number
  delayMs: number
  autoContinueNextDay: boolean
  /** Fire Discord status notify per successful send */
  discordNotify: boolean
  /** Last loaded / saved profile name (display only) */
  activeProfile: string
  /** Profile Resend API key — empty falls back to vault */
  resendApiKey: string
  /** Profile Resend from — empty falls back to vault */
  resendFrom: string
}

/** Ordered multi-profile autopilot: finish A (find→clean→send to cap) then B… */
export type ChainSettings = {
  enabled: boolean
  /** Profile names in run order */
  profiles: string[]
  maxEmptyFills: number
  maxDurationMin: number
}

export type OutreachSendProfile = {
  name: string
  updatedAt: string
  resendApiKey: string
  resendFrom: string
  send: Omit<SendSettings, 'activeProfile' | 'resendApiKey' | 'resendFrom'>
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
  /** Live discovery/send state. Optional for backward-compatible old run files. */
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
