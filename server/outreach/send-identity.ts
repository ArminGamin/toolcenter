import fs from 'node:fs'
import path from 'node:path'
import { loadVault } from '../cc-services.js'
import { NEWSLETTER } from './paths.js'
import type { OutreachSettings } from './types.js'
import { currentProfileBrand } from '../profile-brand.js'
import { currentBusinessProfile, DEFAULT_BUSINESS_PROFILE_ID, profileDataPath } from '../business-profiles.js'

export function brandPromoHtmlPath(): string {
  return currentProfileBrand().outreachPromoHtml
}

export function resolveHtml(settings: OutreachSettings, index = 0): string {
  if (!settings.send.useAssetHtml && settings.send.html.trim()) {
    return settings.send.html
  }
  const rotation = settings.send.promoHtmlPaths || []
  if (settings.send.useAssetHtml && rotation.length) {
    return fs.readFileSync(rotation[index % rotation.length], 'utf8')
  }
  const asset = brandPromoHtmlPath()
  if (fs.existsSync(asset)) {
    return fs.readFileSync(asset, 'utf8')
  }
  return settings.send.html
}

export function loadSubjectsFile(): string[] {
  const file = currentBusinessProfile().id === DEFAULT_BUSINESS_PROFILE_ID
    ? path.join(NEWSLETTER, 'subjects.txt')
    : profileDataPath('outreach', 'subjects.txt')
  if (!fs.existsSync(file)) return []
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
}

export function resolveSendSubject(settings: OutreachSettings, index: number): string {
  if (settings.send.rotateSubjects) {
    const lines = loadSubjectsFile()
    if (lines.length) return lines[index % lines.length]
  }
  return settings.send.subject.trim()
}

export function testEmailSubject(subject: string): string {
  return subject.startsWith('‼️')
    ? `‼️ [TEST] ${subject.slice('‼️'.length).trimStart()}`
    : `[TEST] ${subject}`
}

/** Snapshot all assets once, before sending anything; retries keep the same content. */
export function prepareSendContent(settings: OutreachSettings) {
  const subjects = settings.send.rotateSubjects ? loadSubjectsFile() : []
  if (!subjects.length) subjects.push(settings.send.subject.trim())
  const paths = settings.send.useAssetHtml ? settings.send.promoHtmlPaths || [] : []
  const templates = paths.length
    ? paths.map(file => fs.readFileSync(file, 'utf8'))
    : [resolveHtml(settings)]
  if (subjects.some(subject => !subject.trim())) throw new Error('Subject is required')
  if (templates.some(html => !html.trim())) throw new Error('Promo HTML is empty')
  return (index: number) => ({
    subject: subjects[index % subjects.length],
    html: templates[index % templates.length],
  })
}

export function resolveFromAddress(settings: OutreachSettings, vaultFrom: string): string {
  return (
    settings.send.resendFrom.trim() ||
    settings.send.fromOverride.trim() ||
    vaultFrom.trim()
  )
}

export function maskKey(key: string): string {
  const k = key.trim()
  if (!k) return ''
  if (k.length <= 10) return `${k.slice(0, 3)}…`
  return `${k.slice(0, 5)}…${k.slice(-4)}`
}

/** Profile key/from win over vault when set. */
export function resolveSendIdentity(settings: OutreachSettings): {
  apiKey: string
  fromAddr: string
  source: 'profile' | 'vault'
  keyMasked: string
} {
  const vault = loadVault()
  const profileKey = settings.send.resendApiKey.trim()
  const vaultKey = vault.RESEND_API_KEY?.trim() || ''
  const apiKey = profileKey || vaultKey
  const fromAddr = resolveFromAddress(settings, vault.RESEND_FROM || '')
  return {
    apiKey,
    fromAddr,
    source: profileKey ? 'profile' : 'vault',
    keyMasked: maskKey(apiKey),
  }
}

export function personalizeHtml(html: string, email: string): string {
  return html
    .replaceAll('{{{EMAIL}}}', email)
    .replaceAll('{{{contact.email}}}', email)
    .replaceAll('{{contact.email}}', email)
}
