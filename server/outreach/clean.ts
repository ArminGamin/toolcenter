import { EMAIL_RE } from './email-parse.js'
import { isPlaceholderContact, personalRejectReason } from './personal-rules.js'
import { appendLog } from './log.js'
import { readEmailSet } from './json-store.js'
import { readPermanentBlacklist } from './blacklist.js'
import { sentFilePath, rejectedFilePath } from './profile-data.js'
import type { CleanSettings, EmailCandidate, OutreachLeadEvidence, OutreachSettings } from './types.js'

/** True for numeric/auto-generated locals — not names that merely end in a year. */
function isDigitHeavyLocal(local: string): boolean {
  const digits = [...local].filter((c) => c >= '0' && c <= '9').length
  if (digits === 0) return false
  const letters = [...local].filter((c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')).length
  if (letters === 0 && digits >= 3) return true
  if (digits >= 6 && digits / Math.max(local.length, 1) >= 0.45) return true
  if (local.length <= 8 && digits >= 4 && letters <= 2) return true
  return false
}

/** Tracking-style +aliases only — keep short personal tags (+home, +lt, +work). */
function isSpamPlusAlias(local: string): boolean {
  const i = local.indexOf('+')
  if (i < 0) return false
  const suffix = local.slice(i + 1)
  if (!suffix) return true
  if (/^[a-z0-9]{2,8}\+[a-z0-9]{6,}$/i.test(local)) return true
  if (suffix.length >= 6) return true
  if (/\d/.test(suffix) && suffix.length >= 3) return true
  return false
}

/** Drop tiny junk, keep real 3-letter names (tom@, max@). */
function isTooShortLocal(local: string): boolean {
  if (local.length >= 4) return false
  if (/^[a-z]{3}$/i.test(local)) return false
  return true
}

export function cleanEmails(
  emails: string[],
  clean: CleanSettings,
  opts?: {
    skipSent?: boolean
    skipRejected?: boolean
    settings?: OutreachSettings
    evidence?: Record<string, OutreachLeadEvidence>
  },
): { keep: EmailCandidate[]; drop: EmailCandidate[] } {
  const settings = opts?.settings
  const allow = new Set(clean.allowlist.map((d) => d.toLowerCase().trim()).filter(Boolean))
  const blockLocals = new Set(clean.blockLocals.map((d) => d.toLowerCase().trim()).filter(Boolean))
  const blockDomains = clean.blockDomains.map((d) => d.toLowerCase().trim()).filter(Boolean)
  const sent =
    opts?.skipSent === false
      ? new Set<string>()
      : settings
        ? readEmailSet(sentFilePath(settings))
        : new Set<string>()
  const rejected =
    opts?.skipRejected === false
      ? new Set<string>()
      : settings
        ? readEmailSet(rejectedFilePath(settings))
        : new Set<string>()
  const permanent = readPermanentBlacklist()
  const keep: EmailCandidate[] = []
  const drop: EmailCandidate[] = []
  const seen = new Set<string>()

  for (const raw of emails) {
    const email = raw.trim().toLowerCase()
    if (!EMAIL_RE.test(email)) {
      drop.push({ email: raw, decision: 'drop', reason: 'invalid', selected: false })
      continue
    }
    if (seen.has(email)) {
      drop.push({ email, decision: 'drop', reason: 'duplicate', selected: false })
      continue
    }
    seen.add(email)
    const [local, domain] = email.split('@')
    const evidence = opts?.evidence?.[email]
    const validatedProfessional = Boolean(
      evidence?.name &&
      evidence.personEvidence.length &&
      evidence.locationEvidence.length &&
      evidence.contactEvidence.length &&
      evidence.sourceUrl,
    )
    if (!local || !domain) {
      drop.push({ email, decision: 'drop', reason: 'invalid', selected: false })
      continue
    }
    if (permanent.has(email)) {
      drop.push({ email, decision: 'drop', reason: 'permanent-blacklist', selected: false })
      appendLog('decision', 'clean', `skipped permanent-blacklist ${email}`)
      continue
    }
    if (sent.has(email)) {
      drop.push({ email, decision: 'drop', reason: 'already-sent', selected: false })
      appendLog('decision', 'clean', `skipped already-sent ${email}`)
      continue
    }
    if (rejected.has(email)) {
      drop.push({ email, decision: 'drop', reason: 'already-rejected', selected: false })
      continue
    }
    if (blockLocals.has(local) || blockLocals.has(local.replace(/[._-]/g, ''))) {
      drop.push({ email, decision: 'drop', reason: `role-local:${local}`, selected: false })
      appendLog('decision', 'clean', `dropped ${email} (${local}@)`)
      continue
    }
    if (
      /^(info|office|sales|noreply|no-reply|admin|support|contact|partneriai|biuras|registracija|nariai|valdyba|pirmininkas)[\d._-]*$/i.test(
        local,
      )
    ) {
      drop.push({ email, decision: 'drop', reason: `role-pattern:${local}`, selected: false })
      appendLog('decision', 'clean', `dropped ${email} (role pattern)`)
      continue
    }
    const personalHit = isPlaceholderContact(email) ? 'placeholder-contact' : validatedProfessional ? null : personalRejectReason(email)
    if (personalHit) {
      drop.push({ email, decision: 'drop', reason: personalHit, selected: false })
      appendLog('decision', 'clean', `dropped ${email} (${personalHit})`)
      continue
    }
    const domainHit = blockDomains.find((b) => domain.includes(b) || domain.startsWith(b.replace(/^\./, '')))
    if (domainHit) {
      drop.push({ email, decision: 'drop', reason: `block-domain:${domainHit}`, selected: false })
      appendLog('decision', 'clean', `dropped ${email} (domain ${domainHit})`)
      continue
    }
    if (!allow.has(domain) && !validatedProfessional) {
      drop.push({ email, decision: 'drop', reason: `not-personal-provider:${domain}`, selected: false })
      appendLog('decision', 'clean', `dropped ${email} (corporate/other domain)`)
      continue
    }
    if (clean.strictness === 'strict') {
      if (isDigitHeavyLocal(local)) {
        drop.push({ email, decision: 'drop', reason: 'strict:digit-heavy-local', selected: false })
        appendLog('decision', 'clean', `dropped ${email} (strict: digit-heavy)`)
        continue
      }
      if (isSpamPlusAlias(local)) {
        drop.push({ email, decision: 'drop', reason: 'strict:plus-alias', selected: false })
        appendLog('decision', 'clean', `dropped ${email} (strict: spam plus-alias)`)
        continue
      }
      if (isTooShortLocal(local)) {
        drop.push({ email, decision: 'drop', reason: 'strict:short-local', selected: false })
        appendLog('decision', 'clean', `dropped ${email} (strict: short junk)`)
        continue
      }
    }
    keep.push({
      email,
      decision: 'keep',
      reason: validatedProfessional ? 'validated-public-professional' : 'personal-provider',
      selected: true,
    })
  }

  return { keep, drop }
}
