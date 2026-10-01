import crypto from 'node:crypto'
import fs from 'node:fs'
import { currentProfileDataDir, profileDataPath } from './business-profiles.js'
import { readPermanentBlacklist } from './outreach/blacklist.js'
import { readEmailSet } from './outreach/json-store.js'
import { sentFile } from './outreach/quota.js'
import { getOutreachSettings } from './outreach/settings.js'

export type PipelineStage = 'active' | 'bought' | 'dead'

export type PipelineTouch = {
  at: string
  note: string
}

export type StageHistoryEntry = {
  at: string
  stage: PipelineStage
}

export type PipelineContact = {
  id: string
  email: string
  name: string
  source: string
  stage: PipelineStage
  tags: string[]
  promoStep: number
  nextActionAt: string | null
  action: string
  value?: number
  noteId?: string
  touches: PipelineTouch[]
  stageHistory: StageHistoryEntry[]
  createdAt: string
  updatedAt: string
}

export type PipelineData = {
  contacts: PipelineContact[]
}

export type PipelineSummary = {
  total: number
  active: number
  bought: number
  dead: number
  engaged: number
  replied: number
  followUpsDue: number
  outreachSent: number
}

const pipelineFile = () => profileDataPath('pipeline.json')
const STAGES: PipelineStage[] = ['active', 'bought', 'dead']

function emptyPipeline(): PipelineData {
  return { contacts: [] }
}

function normalizeStage(value: unknown): PipelineStage {
  const s = String(value || '').toLowerCase()
  return STAGES.includes(s as PipelineStage) ? (s as PipelineStage) : 'active'
}

function normalizeContact(raw: unknown): PipelineContact | null {
  if (!raw || typeof raw !== 'object' || typeof (raw as { id?: string }).id !== 'string') return null
  const value = raw as Partial<PipelineContact>
  const id = String(value.id)
  const email = typeof value.email === 'string' ? value.email.trim().toLowerCase().slice(0, 200) : ''
  if (!email || !email.includes('@')) return null
  const now = new Date().toISOString()
  const tags = Array.isArray(value.tags)
    ? value.tags
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.trim().slice(0, 40))
        .filter(Boolean)
        .slice(0, 20)
    : []
  const touches = Array.isArray(value.touches)
    ? value.touches.flatMap((touch): PipelineTouch[] => {
        if (!touch || typeof touch !== 'object') return []
        const t = touch as Partial<PipelineTouch>
        if (typeof t.note !== 'string') return []
        return [{ at: typeof t.at === 'string' ? t.at : now, note: t.note.slice(0, 500) }]
      })
    : []
  const stageHistory = Array.isArray(value.stageHistory)
    ? value.stageHistory.flatMap((entry): StageHistoryEntry[] => {
        if (!entry || typeof entry !== 'object') return []
        const e = entry as Partial<StageHistoryEntry>
        return [{ at: typeof e.at === 'string' ? e.at : now, stage: normalizeStage(e.stage) }]
      })
    : []
  const stage = normalizeStage(value.stage)
  return {
    id,
    email,
    name: typeof value.name === 'string' ? value.name.slice(0, 120) : '',
    source: typeof value.source === 'string' ? value.source.slice(0, 80) : 'manual',
    stage,
    tags,
    promoStep: Math.max(0, Math.min(20, Number(value.promoStep) || 0)),
    nextActionAt: typeof value.nextActionAt === 'string' ? value.nextActionAt : null,
    action: typeof value.action === 'string' ? value.action.slice(0, 120) : '',
    ...(typeof value.value === 'number' && Number.isFinite(value.value) ? { value: value.value } : {}),
    ...(typeof value.noteId === 'string' && value.noteId.trim() ? { noteId: value.noteId.slice(0, 80) } : {}),
    touches,
    stageHistory: stageHistory.length ? stageHistory : [{ at: now, stage }],
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : now,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : now,
  }
}

function normalizePipeline(raw: Partial<PipelineData>): PipelineData {
  const seen = new Set<string>()
  const contacts = Array.isArray(raw.contacts)
    ? raw.contacts.flatMap((contact): PipelineContact[] => {
        const normalized = normalizeContact(contact)
        if (!normalized) return []
        if (seen.has(normalized.email)) return []
        seen.add(normalized.email)
        return [normalized]
      })
    : []
  return { contacts }
}

export function getPipeline(): PipelineData {
  fs.mkdirSync(currentProfileDataDir(), { recursive: true })
  if (!fs.existsSync(pipelineFile())) return emptyPipeline()
  try {
    return normalizePipeline(JSON.parse(fs.readFileSync(pipelineFile(), 'utf8')) as Partial<PipelineData>)
  } catch {
    return emptyPipeline()
  }
}

export function savePipeline(data: Partial<PipelineData>): { ok: boolean; message: string; data: PipelineData } {
  const next = normalizePipeline(data)
  fs.mkdirSync(currentProfileDataDir(), { recursive: true })
  fs.writeFileSync(pipelineFile(), JSON.stringify(next, null, 2), 'utf8')
  return { ok: true, message: 'Pipeline saved', data: next }
}

export function countFollowUpsDue(contacts: PipelineContact[], at = Date.now()): number {
  return contacts.filter((contact) => {
    if (contact.stage !== 'active' || !contact.nextActionAt) return false
    const when = new Date(contact.nextActionAt).getTime()
    return Number.isFinite(when) && when <= at
  }).length
}

export function getPipelineSummary(): PipelineSummary {
  const data = getPipeline()
  const contacts = data.contacts
  let outreachSent = 0
  try {
    outreachSent = readEmailSet(sentFile(getOutreachSettings())).size
  } catch {
    outreachSent = 0
  }
  return {
    total: contacts.length,
    active: contacts.filter((c) => c.stage === 'active').length,
    bought: contacts.filter((c) => c.stage === 'bought').length,
    dead: contacts.filter((c) => c.stage === 'dead').length,
    engaged: contacts.filter((c) => c.tags.includes('engaged')).length,
    replied: contacts.filter((c) => c.tags.includes('replied')).length,
    followUpsDue: countFollowUpsDue(contacts),
    outreachSent,
  }
}

export function importFromOutreach(): {
  ok: boolean
  message: string
  added: number
  skipped: number
  data: PipelineData
} {
  const settings = getOutreachSettings()
  const sentEmails = readEmailSet(sentFile(settings))
  const blacklist = readPermanentBlacklist()
  const current = getPipeline()
  const existing = new Set(current.contacts.map((c) => c.email.toLowerCase()))
  const now = new Date()
  const nextAction = new Date(now)
  nextAction.setDate(nextAction.getDate() + 3)

  let added = 0
  let skipped = 0
  for (const email of sentEmails) {
    if (blacklist.has(email) || existing.has(email)) {
      skipped += 1
      continue
    }
    current.contacts.push({
      id: crypto.randomUUID(),
      email,
      name: '',
      source: 'outreach',
      stage: 'active',
      tags: [],
      promoStep: 1,
      nextActionAt: nextAction.toISOString(),
      action: 'Promo bump #1',
      touches: [],
      stageHistory: [{ at: now.toISOString(), stage: 'active' }],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    })
    existing.add(email)
    added += 1
  }

  const result = savePipeline({ contacts: current.contacts })
  return {
    ok: true,
    message: `Imported ${added} contact(s) (${skipped} skipped)`,
    added,
    skipped,
    data: result.data,
  }
}

export type PipelineExportSegment = 'engaged' | 'replied' | 'due-today' | 'active'

export function exportPipelineSegment(segment: PipelineExportSegment): { ok: boolean; text: string; count: number } {
  const contacts = getPipeline().contacts
  const now = Date.now()
  let filtered: PipelineContact[] = []
  if (segment === 'engaged') {
    filtered = contacts.filter((c) => c.tags.includes('engaged'))
  } else if (segment === 'replied') {
    filtered = contacts.filter((c) => c.tags.includes('replied'))
  } else if (segment === 'due-today') {
    filtered = contacts.filter((c) => c.stage === 'active' && c.nextActionAt && new Date(c.nextActionAt).getTime() <= now)
  } else {
    filtered = contacts.filter((c) => c.stage === 'active')
  }
  const lines = filtered.map((c) => c.email).sort()
  return { ok: true, text: lines.join('\n'), count: lines.length }
}
