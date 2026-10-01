import path from 'node:path'
import { resolveSendIdentity } from './send-identity.js'
import { readJsonFile, writeJsonFile } from './json-store.js'
import { appendLog } from './log.js'
import {
  profileSlugFromSettings,
  profileDataDir,
  sentFilePath,
  rejectedFilePath,
  quotaFilePath,
} from './profile-data.js'
import type { OutreachSendProfile, OutreachSettings } from './types.js'
import {
  getOutreachSettings,
  readSendProfiles,
  profileKeyId,
  resolveSendProfileName,
  readOutreachSecrets,
} from './settings.js'
import { rt } from './runtime.js'
import { activeChainProfileName } from './chain.js'

export function activeProfileSlug(settings?: OutreachSettings): string {
  return profileSlugFromSettings(settings ?? getOutreachSettings())
}

export function sentFile(settings?: OutreachSettings) {
  return sentFilePath(settings ?? getOutreachSettings())
}

export function rejectedFile(settings?: OutreachSettings) {
  return rejectedFilePath(settings ?? getOutreachSettings())
}

function quotaFile(settings?: OutreachSettings) {
  return quotaFilePath(settings ?? getOutreachSettings())
}

export function profileLeadsDbPath(settings?: OutreachSettings) {
  return path.join(profileDataDir(settings ?? getOutreachSettings()), 'leads.db')
}

function todayKey() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getQuota(settings?: OutreachSettings): { date: string; sent: number; manual?: boolean } {
  const q = readJsonFile<{ date?: string; sent?: number; manual?: boolean }>(quotaFile(settings), {})
  const date = todayKey()
  if (q.date !== date) return { date, sent: 0 }
  return { date, sent: Math.max(0, Number(q.sent) || 0), manual: Boolean(q.manual) }
}

export function setQuotaSent(sent: number, settings?: OutreachSettings, opts?: { manual?: boolean }) {
  const existing = getQuota(settings)
  const manual = opts?.manual ?? existing.manual ?? false
  const payload: { date: string; sent: number; manual?: boolean } = {
    date: todayKey(),
    sent: Math.max(0, sent),
  }
  if (manual) payload.manual = true
  writeJsonFile(quotaFile(settings), payload)
}

export function extractFromEmail(fromAddr: string): string {
  const raw = String(fromAddr || '').trim()
  const m = raw.match(/<([^>]+)>/)
  return (m?.[1] || raw).trim().toLowerCase()
}

export function resendEmailLocalDate(createdAt: string): string {
  const raw = String(createdAt || '').trim()
  if (!raw) return ''
  const normalized = raw.replace(' ', 'T').replace(/\+00$/, 'Z')
  const d = new Date(normalized)
  if (Number.isNaN(d.getTime())) {
    const m = raw.match(/^(\d{4}-\d{2}-\d{2})/)
    return m?.[1] || ''
  }
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Account-wide daily sends from Resend response headers (matches dashboard Usage). */
export function parseResendDailyUsedHeader(res: Response): number | null {
  const headerUsed = res.headers.get('x-resend-daily-quota')
  if (headerUsed == null || headerUsed === '') return null
  const n = Number(headerUsed)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null
}

export function applyQuotaAfterSend(sendStore: OutreachSettings, resendDailyUsed: number | null) {
  const manual = getQuota(sendStore).manual
  if (resendDailyUsed != null) {
    setQuotaSent(resendDailyUsed, sendStore, { manual })
    return
  }
  setQuotaSent(getQuota(sendStore).sent + 1, sendStore, { manual })
}

export async function reconcileQuotaFromResend(settings: OutreachSettings): Promise<number | null> {
  if (getQuota(settings).manual) return null
  const { apiKey, fromAddr } = resolveSendIdentity(settings)
  if (!apiKey) return null
  try {
    const remote = await fetchResendDailyUsed(apiKey, fromAddr)
    setQuotaSent(remote, settings, { manual: false })
    return remote
  } catch {
    return null
  }
}

export async function fetchResendDailyUsed(apiKey: string, fromAddr?: string): Promise<number> {
  const res = await fetch('https://api.resend.com/emails?limit=1', {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Resend list ${res.status}: ${text.slice(0, 160)}`)
  }
  const headerUsed = parseResendDailyUsedHeader(res)
  if (headerUsed != null) return headerUsed
  if (fromAddr) return fetchResendSentTodayCount(apiKey, fromAddr)
  return 0
}

export async function fetchResendSentTodayCount(apiKey: string, fromAddr: string): Promise<number> {
  const fromEmail = extractFromEmail(fromAddr)
  if (!fromEmail) return 0
  const today = todayKey()
  let count = 0
  let after: string | undefined
  for (let page = 0; page < 50; page++) {
    const qs = new URLSearchParams({ limit: '100' })
    if (after) qs.set('after', after)
    const res = await fetch(`https://api.resend.com/emails?${qs}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Resend list ${res.status}: ${text.slice(0, 160)}`)
    }
    const body = (await res.json()) as {
      has_more?: boolean
      data?: Array<{ id?: string; from?: string; created_at?: string }>
    }
    const rows = body.data || []
    if (!rows.length) break
    let reachedOlder = false
    for (const row of rows) {
      const day = resendEmailLocalDate(String(row.created_at || ''))
      if (!day) continue
      if (day < today) {
        reachedOlder = true
        break
      }
      if (day !== today) continue
      const rowFrom = extractFromEmail(String(row.from || ''))
      if (rowFrom === fromEmail) count++
    }
    if (reachedOlder || !body.has_more) break
    after = rows[rows.length - 1]?.id
    if (!after) break
  }
  return count
}

export function profileSettingsForQuota(profile: OutreachSendProfile, base?: OutreachSettings): OutreachSettings {
  const settings = base ?? getOutreachSettings()
  return {
    ...settings,
    send: {
      ...settings.send,
      ...profile.send,
      activeProfile: profile.name,
      resendFrom: profile.resendFrom,
      resendApiKey: profile.resendApiKey,
    },
  }
}

/** Quota + store reads always follow the named send profile, not stale send fields. */
export function quotaSettingsForActiveProfile(settings?: OutreachSettings): OutreachSettings {
  const s = settings ?? getOutreachSettings()
  if (rt.chainSessionActive && s.chain?.enabled) {
    const name = activeChainProfileName(s)
    if (name) {
      const profile = readSendProfiles().profiles.find(
        (p) => profileKeyId(p.name) === profileKeyId(name),
      )
      if (profile) return profileSettingsForQuota(profile, s)
    }
  }
  const name = resolveSendProfileName(s.send.activeProfile?.trim() || '')
  if (!name) return s
  const profile = readSendProfiles().profiles.find(
    (p) => profileKeyId(p.name) === profileKeyId(name),
  )
  if (!profile) return s
  return profileSettingsForQuota(profile, s)
}

/** Pull today's sent count from Resend per profile account and rewrite quota.json. */
export async function syncOutreachQuotasFromResend(opts?: {
  profile?: string
  force?: boolean
}): Promise<{
  ok: boolean
  message: string
  profiles: Array<{
    name: string
    sent: number
    cap: number
    remaining: number
    previous: number
  }>
}> {
  const data = readSendProfiles()
  const names = opts?.profile?.trim()
    ? [resolveSendProfileName(opts.profile.trim())]
    : data.profiles.map((p) => p.name)
  const base = getOutreachSettings()
  const profiles: Array<{
    name: string
    sent: number
    cap: number
    remaining: number
    previous: number
  }> = []

  for (const name of names) {
    const profile = data.profiles.find((p) => profileKeyId(p.name) === profileKeyId(name))
    if (!profile) continue
    const secrets = readOutreachSecrets()
    const dedicatedKey = secrets.profileKeys[profileKeyId(profile.name)]?.trim() || ''
    const profileSettings = profileSettingsForQuota(profile, base)
    const syncSettings = dedicatedKey
      ? {
          ...profileSettings,
          send: { ...profileSettings.send, resendApiKey: dedicatedKey },
        }
      : profileSettings
    const { apiKey, fromAddr, source } = resolveSendIdentity(syncSettings)
    if (!apiKey) {
      appendLog('error', 'send', `Quota sync “${profile.name}”: missing Resend API key`)
      continue
    }
    if (data.profiles.length > 1 && source !== 'profile') {
      appendLog(
        'warn',
        'send',
        `Quota sync “${profile.name}”: save this profile's Resend API key in Send Profiles (each Resend account needs its own key)`,
      )
      continue
    }
    if (!fromAddr) {
      appendLog('error', 'send', `Quota sync “${profile.name}”: missing From address`)
      continue
    }
    const previous = getQuota(profileSettings).sent
    const cap = Math.max(1, Number(profile.send.dailyCap) || Number(base.send.dailyCap) || 150)
    const locked = Boolean(getQuota(profileSettings).manual)
    if (locked && !opts?.force) {
      profiles.push({
        name: profile.name,
        sent: previous,
        cap,
        remaining: Math.max(0, cap - previous),
        previous,
      })
      appendLog(
        'info',
        'send',
        `Quota sync “${profile.name}”: skipped (manual override ${previous}/${cap})`,
      )
      continue
    }
    const remote = await fetchResendDailyUsed(apiKey, fromAddr)
    const sent = Math.min(remote, cap)
    setQuotaSent(sent, profileSettings, { manual: false })
    profiles.push({
      name: profile.name,
      sent,
      cap,
      remaining: Math.max(0, cap - sent),
      previous,
    })
    appendLog(
      'info',
      'send',
      `Quota sync “${profile.name}”: Resend ${remote} today → ${sent}/${cap} (was ${previous}/${cap})`,
    )
  }

  return {
    ok: profiles.length > 0,
    message:
      profiles.length > 0
        ? `Synced ${profiles.length} profile quota(s) from Resend`
        : 'No profiles could be synced (check API keys / From addresses)',
    profiles,
  }
}

/** Set today's sent count for a profile (locks against Resend sync unless force sync). */
export function setOutreachProfileQuota(
  name: string,
  sent: number,
  opts?: { manual?: boolean },
): { ok: boolean; message: string; quota?: ReturnType<typeof getRemainingQuota> } {
  const trimmed = resolveSendProfileName((name || '').trim())
  if (!trimmed) return { ok: false, message: 'Profile name required' }
  const profile = readSendProfiles().profiles.find(
    (p) => profileKeyId(p.name) === profileKeyId(trimmed),
  )
  if (!profile) return { ok: false, message: `Profile “${trimmed}” not found` }
  const profileSettings = profileSettingsForQuota(profile)
  const cap = Math.max(1, Number(profile.send.dailyCap) || 150)
  const clamped = Math.min(Math.max(0, Math.floor(sent)), cap)
  setQuotaSent(clamped, profileSettings, { manual: opts?.manual ?? true })
  const quota = getRemainingQuota(undefined, profileSettings)
  appendLog('info', 'send', `Quota set “${profile.name}”: ${clamped}/${cap} (manual)`)
  return { ok: true, message: `Quota for “${profile.name}” set to ${clamped}/${cap}`, quota }
}

export function getRemainingQuota(
  cap?: number,
  settings?: OutreachSettings,
): { date: string; sent: number; cap: number; remaining: number } {
  const s = settings ?? getOutreachSettings()
  const dailyCap = Math.max(1, cap ?? s.send.dailyCap)
  const q = getQuota(s)
  return { date: q.date, sent: q.sent, cap: dailyCap, remaining: Math.max(0, dailyCap - q.sent) }
}

