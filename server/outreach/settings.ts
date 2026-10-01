import { loadVault, saveVault } from '../cc-services.js'
import { SETTINGS_FILE, SEND_PROFILES_FILE, OUTREACH_SECRETS_KEY, OUTREACH_DIR } from './paths.js'
import type { OutreachSendProfile, OutreachSettings } from './types.js'
import { readJsonFile, writeJsonFile } from './json-store.js'
import { brandPromoHtmlPath } from './send-identity.js'
import fs from 'node:fs'

export const DEFAULT_ALLOWLIST = [
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'yahoo.co.uk',
  'ymail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'proton.me',
  'protonmail.com',
  'inbox.lt',
  'mail.lt',
  'one.lt',
  'gmx.com',
  'gmx.net',
  'mail.com',
  'mail.ru',
  'aol.com',
  'fastmail.com',
  'tutanota.com',
  'tuta.io',
]

export const DEFAULT_BLOCK_LOCALS = [
  'info',
  'contact',
  'kontaktai',
  'hello',
  'labas',
  'hi',
  'shop',
  'store',
  'parduotuve',
  'orders',
  'uzsakymai',
  'sales',
  'admin',
  'support',
  'help',
  'pagalba',
  'office',
  'service',
  'noreply',
  'no-reply',
  'donotreply',
  'mailer-daemon',
  'webmaster',
  'postmaster',
  'billing',
  'accounts',
  'hr',
  'jobs',
  'career',
  'careers',
  'marketing',
  'press',
  'media',
  'team',
  'bendra',
  'partneriai',
  'biuras',
  'registracija',
  'prisijungimai',
  'nariai',
  'valdyba',
  'pirmininkas',
  'klientai',
]

export const DEFAULT_BLOCK_DOMAINS = ['uab.', '.gov', '.edu', 'noreply.', 'mail.gmail.com']

/** Keep in sync with ai-lead-finder/personal_email_rules.py */

export function profileKeyId(name: string) {
  return name.trim().toLocaleLowerCase()
}

/** Known saved-name aliases (e.g. typos) → canonical send profile name. */
const SEND_PROFILE_ALIASES: Record<string, string> = {
  vasaroskampelis: 'vasraoskampelis',
}

export function resolveSendProfileName(name: string): string {
  const trimmed = (name || '').trim()
  if (!trimmed) return trimmed
  const data = readSendProfiles()
  if (data.profiles.some((p) => profileKeyId(p.name) === profileKeyId(trimmed))) return trimmed
  const alias = SEND_PROFILE_ALIASES[profileKeyId(trimmed)]
  if (alias && data.profiles.some((p) => profileKeyId(p.name) === profileKeyId(alias))) return alias
  return trimmed
}

type OutreachSecrets = {
  v: 1
  draftResendApiKey: string
  profileKeys: Record<string, string>
}

export function readOutreachSecrets(): OutreachSecrets {
  const raw = loadVault()[OUTREACH_SECRETS_KEY]
  if (!raw) return { v: 1, draftResendApiKey: '', profileKeys: {} }
  try {
    const parsed = JSON.parse(raw) as Partial<OutreachSecrets>
    const profileKeys: Record<string, string> = {}
    if (parsed.profileKeys && typeof parsed.profileKeys === 'object') {
      for (const [name, key] of Object.entries(parsed.profileKeys)) {
        if (typeof key === 'string' && key.trim()) profileKeys[profileKeyId(name)] = key.trim()
      }
    }
    return {
      v: 1,
      draftResendApiKey: typeof parsed.draftResendApiKey === 'string' ? parsed.draftResendApiKey.trim() : '',
      profileKeys,
    }
  } catch {
    // A corrupt internal entry should never prevent an operator using the vault fallback key.
    return { v: 1, draftResendApiKey: '', profileKeys: {} }
  }
}

export function writeOutreachSecrets(secrets: OutreachSecrets) {
  saveVault({ [OUTREACH_SECRETS_KEY]: JSON.stringify(secrets) })
}

export function defaultSettings(): OutreachSettings {
  return {
    find: {
      niche: '',
      model: '',
      lt: true,
      follow: true,
      consumer: true,
      regular: true,
      verify: false,
      smtp: false,
      newOnly: true,
      autoCampaign: true,
      // Match Lead Finder GUI — AI recommended pages/score applied when on
      applyAiSettings: true,
      fastMode: true,
      // 0 means uncapped. The finder still stops as soon as the lead target is met.
      maxPages: '0',
      maxUrls: '0',
      maxQueries: '0',
      // Public goal matches the default daily send cap. Raw discovery buffering is internal.
      leadTarget: '1000',
      minScore: '20',
      source: 'headless',
      runMode: 'full',
      pasteList: '',
      seedUrls: '',
    },
    clean: {
      allowlist: [...DEFAULT_ALLOWLIST],
      blockLocals: [...DEFAULT_BLOCK_LOCALS],
      blockDomains: [...DEFAULT_BLOCK_DOMAINS],
      strictness: 'strict',
    },
    requireApprove: true,
    send: {
      subject: '',
      html: '',
      useAssetHtml: true,
      promoHtmlPaths: [],
      testRecipient: '',
      rotateSubjects: false,
      fromOverride: '',
      dailyCap: 150,
      delayMs: 400,
      autoContinueNextDay: false,
      discordNotify: true,
      activeProfile: '',
      resendApiKey: '',
      resendFrom: '',
    },
    chain: {
      enabled: false,
      profiles: [],
      maxEmptyFills: 2,
      maxDurationMin: 120,
    },
  }
}

function mergeSettings(raw: Partial<OutreachSettings> | null | undefined): OutreachSettings {
  const base = defaultSettings()
  if (!raw || typeof raw !== 'object') return base
  const dailyCap = Math.max(1, Number(raw.send?.dailyCap ?? base.send.dailyCap) || 150)
  const find = { ...base.find, ...(raw.find || {}) }
  // Prefer Lead Finder scrape as the primary path when paste list is empty
  if (find.source === 'paste' && !(find.pasteList || '').trim()) {
    find.source = 'headless'
  }
  if (!find.runMode) find.runMode = 'full'
  if (!find.maxQueries) find.maxQueries = base.find.maxQueries
  if (!find.maxPages) find.maxPages = base.find.maxPages
  if (!find.maxUrls) find.maxUrls = base.find.maxUrls
  if (raw.find?.fastMode === undefined) find.fastMode = base.find.fastMode
  else find.fastMode = Boolean(raw.find.fastMode)
  // Outreach discovery is person/professional-only and persistent-dedupe by
  // contract. Legacy consumer/forum settings are intentionally migrated.
  find.consumer = true
  find.regular = true
  find.newOnly = true
  find.lt = true
  find.follow = true
  find.verify = false
  find.smtp = false
  const requestedLeadTarget = Number(find.leadTarget)
  const allowlist = Array.isArray(raw.clean?.allowlist) ? raw.clean.allowlist.map(String) : [...base.clean.allowlist]
  const oldDefault = DEFAULT_ALLOWLIST.filter(domain => domain !== 'mail.ru')
  if (allowlist.length === oldDefault.length && oldDefault.every(domain => allowlist.includes(domain))) {
    allowlist.push('mail.ru')
  }
  find.leadTarget = String(
    Number.isFinite(requestedLeadTarget) && requestedLeadTarget > 0
      ? Math.floor(requestedLeadTarget)
      : base.find.leadTarget,
  )
  return {
    find,
    clean: {
      ...base.clean,
      ...(raw.clean || {}),
      allowlist,
      blockLocals: Array.isArray(raw.clean?.blockLocals)
        ? raw.clean!.blockLocals.map(String)
        : base.clean.blockLocals,
      blockDomains: Array.isArray(raw.clean?.blockDomains)
        ? raw.clean!.blockDomains.map(String)
        : base.clean.blockDomains,
    },
    requireApprove: raw.requireApprove !== undefined ? Boolean(raw.requireApprove) : base.requireApprove,
    send: {
      ...base.send,
      ...(raw.send || {}),
      dailyCap,
      delayMs: Math.max(0, Number(raw.send?.delayMs ?? base.send.delayMs) || 0),
      autoContinueNextDay: Boolean(raw.send?.autoContinueNextDay ?? base.send.autoContinueNextDay),
      discordNotify:
        raw.send?.discordNotify !== undefined
          ? Boolean(raw.send.discordNotify)
          : base.send.discordNotify,
      activeProfile: String(raw.send?.activeProfile ?? base.send.activeProfile ?? ''),
      resendApiKey: String(raw.send?.resendApiKey ?? base.send.resendApiKey ?? ''),
      resendFrom: String(raw.send?.resendFrom ?? base.send.resendFrom ?? ''),
      testRecipient: String(raw.send?.testRecipient ?? '').trim(),
      promoHtmlPaths: Array.isArray(raw.send?.promoHtmlPaths)
        ? raw.send.promoHtmlPaths.map(String).map(s => s.trim()).filter(Boolean)
        : [],
    },
    chain: {
      enabled: Boolean((raw as OutreachSettings).chain?.enabled ?? base.chain.enabled),
      profiles: Array.isArray((raw as OutreachSettings).chain?.profiles)
        ? (raw as OutreachSettings).chain!.profiles.map(String).map((s) => s.trim()).filter(Boolean)
        : base.chain.profiles,
      maxEmptyFills: Math.max(1, Math.min(5, Number((raw as OutreachSettings).chain?.maxEmptyFills ?? base.chain.maxEmptyFills) || 2)),
      maxDurationMin: Math.max(15, Math.min(480, Number((raw as OutreachSettings).chain?.maxDurationMin ?? base.chain.maxDurationMin) || 120)),
    },
  }
}

export function getOutreachSettings(): OutreachSettings {
  const raw = readJsonFile<Partial<OutreachSettings> | null>(SETTINGS_FILE(), null)
  let secrets = readOutreachSecrets()
  let migrated = false
  const legacyKey = raw?.send?.resendApiKey

  // Move keys from pre-vault versions out of settings.json on first read.
  if (typeof legacyKey === 'string' && legacyKey.trim()) {
    const key = legacyKey.trim()
    secrets.draftResendApiKey = key
    const activeProfile = String(raw?.send?.activeProfile || '').trim()
    if (activeProfile) secrets.profileKeys[profileKeyId(activeProfile)] = key
    if (raw?.send) raw.send.resendApiKey = ''
    migrated = true
  }
  if (migrated) {
    writeOutreachSecrets(secrets)
    writeJsonFile(SETTINGS_FILE(), raw)
  }

  const settings = mergeSettings(raw)
  const profileKey = settings.send.activeProfile
    ? secrets.profileKeys[profileKeyId(settings.send.activeProfile)] || ''
    : ''
  settings.send.resendApiKey = profileKey || secrets.draftResendApiKey
  return seedPromoHtml(settings)
}

function seedPromoHtml(settings: OutreachSettings): OutreachSettings {
  const dir = OUTREACH_DIR()
  fs.mkdirSync(dir, { recursive: true })
  const marker = `${dir}/.promo-seeded`
  if (fs.existsSync(marker)) return settings
  const asset = brandPromoHtmlPath()
  if (!settings.send.html.trim() && fs.existsSync(asset)) {
    settings.send.html = fs.readFileSync(asset, 'utf8')
    settings.send.useAssetHtml = true
    const settingsForDisk: OutreachSettings = {
      ...settings,
      send: { ...settings.send, resendApiKey: '' },
    }
    writeJsonFile(SETTINGS_FILE(), settingsForDisk)
  }
  fs.writeFileSync(marker, '1', 'utf8')
  return settings
}

export function saveOutreachSettings(raw: Partial<OutreachSettings>): {
  ok: boolean
  message: string
  settings: OutreachSettings
} {
  const cur = getOutreachSettings()
  const hasIncomingKey = Boolean(
    raw.send && Object.prototype.hasOwnProperty.call(raw.send, 'resendApiKey'),
  )
  const incomingKey = hasIncomingKey ? String(raw.send?.resendApiKey ?? '').trim() : undefined
  const next = mergeSettings({
    find: { ...cur.find, ...(raw.find || {}) },
    clean: { ...cur.clean, ...(raw.clean || {}) },
    requireApprove: raw.requireApprove !== undefined ? raw.requireApprove : cur.requireApprove,
    send: { ...cur.send, ...(raw.send || {}) },
    chain: raw.chain
      ? {
          enabled:
            raw.chain.enabled !== undefined ? Boolean(raw.chain.enabled) : cur.chain.enabled,
          profiles: Array.isArray(raw.chain.profiles)
            ? raw.chain.profiles
                .map(String)
                .map((s) => resolveSendProfileName(s.trim()))
                .filter(Boolean)
            : cur.chain.profiles,
          maxEmptyFills: Math.max(1, Math.min(5, Number(raw.chain.maxEmptyFills ?? cur.chain.maxEmptyFills) || 2)),
          maxDurationMin: Math.max(15, Math.min(480, Number(raw.chain.maxDurationMin ?? cur.chain.maxDurationMin) || 120)),
        }
      : cur.chain,
  })

  if (hasIncomingKey) {
    const secrets = readOutreachSecrets()
    if (next.send.activeProfile) {
      secrets.profileKeys[profileKeyId(next.send.activeProfile)] = incomingKey || ''
    } else {
      secrets.draftResendApiKey = incomingKey || ''
    }
    writeOutreachSecrets(secrets)
  }

  // Keep the in-memory/API representation so an operator can edit the field,
  // but write a redacted version to disk. The real key lives in the encrypted vault.
  const settingsForDisk: OutreachSettings = {
    ...next,
    send: { ...next.send, resendApiKey: '' },
  }
  writeJsonFile(SETTINGS_FILE(), settingsForDisk)
  return { ok: true, message: 'Settings saved', settings: next }
}

type SendProfilesFile = { profiles: OutreachSendProfile[] }

export function readSendProfiles(): SendProfilesFile {
  const raw = readJsonFile<SendProfilesFile | null>(SEND_PROFILES_FILE(), null)
  if (!raw || !Array.isArray(raw.profiles)) return { profiles: [] }
  const secrets = readOutreachSecrets()
  let secretsChanged = false
  let profilesChanged = false
  const profiles = raw.profiles
    .filter((p) => p && typeof p.name === 'string' && p.name.trim())
    .map((p) => {
      const name = String(p.name).trim()
      const id = profileKeyId(name)
      const legacyKey = typeof p.resendApiKey === 'string' ? p.resendApiKey.trim() : ''
      if (legacyKey) {
        secrets.profileKeys[id] = legacyKey
        secretsChanged = true
        profilesChanged = true
      }
      return {
        name,
        updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : new Date().toISOString(),
        resendApiKey: secrets.profileKeys[id] || '',
        resendFrom: typeof p.resendFrom === 'string' ? p.resendFrom : '',
        send: {
          subject: String(p.send?.subject ?? ''),
          html: String(p.send?.html ?? ''),
          testRecipient: String(p.send?.testRecipient ?? '').trim(),
          // Default true when omitted — Boolean(undefined) was wrongly false
          useAssetHtml: p.send?.useAssetHtml === undefined ? true : Boolean(p.send.useAssetHtml),
          promoHtmlPaths: Array.isArray(p.send?.promoHtmlPaths)
            ? p.send.promoHtmlPaths.map(String).map(s => s.trim()).filter(Boolean)
            : [],
          rotateSubjects: Boolean(p.send?.rotateSubjects),
          fromOverride: String(p.send?.fromOverride ?? ''),
          dailyCap: Math.max(1, Number(p.send?.dailyCap) || 130),
          delayMs: Math.max(0, Number(p.send?.delayMs) || 0),
          autoContinueNextDay: Boolean(p.send?.autoContinueNextDay),
          discordNotify: p.send?.discordNotify !== false,
        },
      }
    })

  if (secretsChanged) writeOutreachSecrets(secrets)
  if (profilesChanged) {
    writeJsonFile(SEND_PROFILES_FILE(), {
      profiles: profiles.map((profile) => ({ ...profile, resendApiKey: '' })),
    })
  }
  return { profiles }
}

export function writeSendProfiles(data: SendProfilesFile) {
  // Profile credentials are kept separately in OUTREACH_SECRETS (encrypted vault).
  writeJsonFile(SEND_PROFILES_FILE(), {
    profiles: data.profiles.map((profile) => ({ ...profile, resendApiKey: '' })),
  })
}
