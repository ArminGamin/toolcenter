import { describe, expect, it } from 'vitest'
import { SENSITIVE_GET_PREFIXES } from '../cc-auth'
import { cleanEmails, defaultSettings, parseEmailList } from '../outreach'
import { testEmailSubject } from '../outreach/send-identity.js'
import {
  configuredFindLeadTarget,
  scaleFindCapsForTarget,
  scaledFindMaxRounds,
  inflateFindTargetForCleanDrops,
} from '../outreach/find-scaling.js'

describe('outreach API protection', () => {
  it('keeps the subject emoji first on test emails', () => {
    expect(testEmailSubject('‼️ Dar ne per vėlu, bet...')).toBe('‼️ [TEST] Dar ne per vėlu, bet...')
    expect(testEmailSubject('Subject')).toBe('[TEST] Subject')
  })
  it('requires the local API token before returning outreach settings or credentials', () => {
    expect(SENSITIVE_GET_PREFIXES).toContain('/api/outreach')
  })
})

describe('parseEmailList', () => {
  it('keeps digit-leading locals and strips list prefixes', () => {
    const { emails, skipped } = parseEmailList(
      ['1. good@gmail.com', '123user@gmail.com', 'Name <person@yahoo.com>', 'bad%%email', ''].join(
        '\n',
      ),
    )
    expect(emails).toEqual(['good@gmail.com', '123user@gmail.com', 'person@yahoo.com'])
    expect(skipped).toContain('bad%%email')
  })

  it('does not throw on malformed percent-encoding', () => {
    expect(() => parseEmailList('%zz@gmail.com\nok@gmail.com')).not.toThrow()
    const { emails } = parseEmailList('%zz@gmail.com\nok@gmail.com')
    expect(emails).toContain('ok@gmail.com')
  })

  it('handles mailto and encoded at-sign', () => {
    const { emails } = parseEmailList('mailto:hello%40gmail.com')
    expect(emails).toEqual(['hello@gmail.com'])
  })
})

describe('cleanEmails', () => {
  it('rejects placeholder contacts even with earlier qualification evidence', () => {
    const email = 'pavarde@mail.com'
    const { keep, drop } = cleanEmails([email], defaultSettings().clean, {
      skipSent: false, skipRejected: false,
      evidence: { [email]: { email, name: 'Some Person', sourceUrl: 'https://example.lt',
        sourceUrls: [], score: 100, sourceType: 'web', personEvidence: ['name'],
        locationEvidence: ['Vilnius'], contactEvidence: ['mailto'], canonicalUrl: '', identityKey: '' } },
    })
    expect(keep).toEqual([])
    expect(drop[0].reason).toBe('placeholder-contact')
  })

  it('allows mail.ru personal contacts with the default provider policy', () => {
    const { keep } = cleanEmails(['alionuska87@mail.ru'], defaultSettings().clean,
      { skipSent: false, skipRejected: false })
    expect(keep.map(row => row.email)).toEqual(['alionuska87@mail.ru'])
  })

  it('drops role locals and corporate domains', () => {
    const clean = defaultSettings().clean
    const { keep, drop } = cleanEmails(
      ['alice@gmail.com', 'info@gmail.com', 'bob@acme.com'],
      clean,
      { skipSent: false, skipRejected: false },
    )
    expect(keep.map((c) => c.email)).toEqual(['alice@gmail.com'])
    expect(drop.some((d) => d.email === 'info@gmail.com')).toBe(true)
    expect(drop.some((d) => d.email === 'bob@acme.com')).toBe(true)
  })

  it('strict mode uses logical digit / plus / short rules', () => {
    const clean = { ...defaultSettings().clean, strictness: 'strict' as const }
    const { keep, drop } = cleanEmails(
      [
        'alice@gmail.com',
        'egle1990@gmail.com',
        'jonas2@gmail.com',
        'tom@gmail.com',
        'name+home@gmail.com',
        '914147268.20181116@gmail.com',
        'x9999@gmail.com',
        'a1@gmail.com',
        'user+caf1sb9xyz@gmail.com',
      ],
      clean,
      { skipSent: false, skipRejected: false },
    )
    expect(keep.map((c) => c.email).sort()).toEqual(
      [
        'alice@gmail.com',
        'egle1990@gmail.com',
        'jonas2@gmail.com',
        'name+home@gmail.com',
        'tom@gmail.com',
      ].sort(),
    )
    expect(drop.some((d) => d.email === '914147268.20181116@gmail.com')).toBe(true)
    expect(drop.some((d) => d.email === 'x9999@gmail.com')).toBe(true)
    expect(drop.some((d) => d.email === 'a1@gmail.com')).toBe(true)
    expect(drop.some((d) => d.email === 'user+caf1sb9xyz@gmail.com')).toBe(true)
  })

  it('keeps real consumers but still drops clear institutions', () => {
    const clean = { ...defaultSettings().clean, strictness: 'normal' as const }
    const { keep, drop } = cleanEmails(
      [
        'kameras@gmail.com',
        'egle1990@gmail.com',
        'jonas.vilnius@gmail.com',
        'centras@gmail.com',
        'info@gmail.com',
        'mokykla.kaunas@gmail.com',
        'direktorius@gmail.com',
      ],
      clean,
      { skipSent: false, skipRejected: false },
    )
    expect(keep.map((c) => c.email).sort()).toEqual(
      ['egle1990@gmail.com', 'kameras@gmail.com'].sort(),
    )
    for (const bad of [
      'jonas.vilnius@gmail.com',
      'centras@gmail.com',
      'info@gmail.com',
      'mokykla.kaunas@gmail.com',
      'direktorius@gmail.com',
    ]) {
      expect(drop.some((d) => d.email === bad)).toBe(true)
    }
  })
})

describe('find scaling', () => {
  it('shrinks caps when only a few sends remain', () => {
    const settings = {
      ...defaultSettings(),
      send: { ...defaultSettings().send, dailyCap: 150 },
      find: {
        ...defaultSettings().find,
        leadTarget: '3',
        maxPages: '120',
        maxUrls: '280',
        maxQueries: '64',
      },
    }
    const caps = scaleFindCapsForTarget(4, settings)
    expect(Number(caps.maxPages)).toBeLessThan(120)
    expect(Number(caps.maxUrls)).toBeLessThan(280)
    expect(caps.mode).toBe('down')
  })

  it('uses broad crawling with a focused query set for large batches', () => {
    const settings = {
      ...defaultSettings(),
      send: { ...defaultSettings().send, dailyCap: 150 },
      find: {
        ...defaultSettings().find,
        leadTarget: '150',
        maxPages: '120',
        maxUrls: '280',
        maxQueries: '64',
      },
    }
    const findTarget = inflateFindTargetForCleanDrops(150, 150)
    expect(findTarget).toBeGreaterThan(150)
    const caps = scaleFindCapsForTarget(findTarget, settings)
    expect(Number(caps.maxPages)).toBeGreaterThan(120)
    expect(Number(caps.maxUrls)).toBeLessThanOrEqual(280)
    expect(Number(caps.maxQueries)).toBeLessThanOrEqual(64)
    expect(caps.mode).toBe('up')
    expect(scaledFindMaxRounds(findTarget, { ...settings, find: { ...settings.find, fastMode: false } })).toBeGreaterThanOrEqual(4)
    expect(scaledFindMaxRounds(findTarget, settings)).toBeGreaterThanOrEqual(4)
  })

  it('keeps collection target independent from the daily send cap', () => {
    const settings = {
      ...defaultSettings(),
      send: { ...defaultSettings().send, dailyCap: 150 },
      find: { ...defaultSettings().find, leadTarget: '237' },
    }
    expect(configuredFindLeadTarget(settings)).toBe(237)
  })

  it('keeps a minimum no-progress recovery budget for tiny targets', () => {
    const settings = {
      ...defaultSettings(),
      send: { ...defaultSettings().send, dailyCap: 150 },
      find: { ...defaultSettings().find, leadTarget: '2' },
      chain: { ...defaultSettings().chain, enabled: true },
    }
    expect(scaledFindMaxRounds(3, settings)).toBeGreaterThanOrEqual(4)
  })

  it('keeps a validated solo professional on a custom domain', () => {
    const settings = defaultSettings()
    const email = 'ruta@rutafoto.lt'
    const { keep } = cleanEmails([email], settings.clean, {
      skipSent: false,
      skipRejected: false,
      evidence: {
        [email]: {
          email,
          name: 'Rūta Petrauskaitė',
          sourceUrl: 'https://rutafoto.lt/kontaktai',
          sourceUrls: ['https://rutafoto.lt/kontaktai'],
          score: 90,
          sourceType: 'contact',
          personEvidence: ['published-name:Rūta Petrauskaitė'],
          locationEvidence: ['lithuanian-context:Vilnius'],
          contactEvidence: ['public-mailto'],
          canonicalUrl: 'https://rutafoto.lt/kontaktai',
          identityKey: 'ruta-petrauskaite',
        },
      },
    })
    expect(keep).toEqual([
      expect.objectContaining({ email, reason: 'validated-public-professional' }),
    ])
  })
})

describe('summarizeFindError', () => {
  it('treats boot-only JSON dumps as startup abort noise', async () => {
    const { summarizeFindError } = await import('../outreach/find-run.js')
    const bootOnly =
      '{"type":"log","message":"Booting Lead Finder…"}\n{"type":"log","message":"Modules loaded"}'
    expect(summarizeFindError(bootOnly)).toBe('Lead Finder aborted during startup')
  })

  it('prefers real JSON error events over boot logs', async () => {
    const { summarizeFindError } = await import('../outreach/find-run.js')
    const mixed =
      '{"type":"log","message":"Booting…"}\n{"type":"error","message":"SMTP timeout on verify"}'
    expect(summarizeFindError(mixed)).toBe('SMTP timeout on verify')
  })
})

describe('isBenignFindAbort', () => {
  it('flags spawn-lock and startup abort messages as benign', async () => {
    const { isBenignFindAbort } = await import('../outreach/find-run.js')
    expect(isBenignFindAbort('Lead Finder aborted during startup')).toBe(true)
    expect(isBenignFindAbort('Cannot spawn Lead Finder — 2 leftover process(es) still alive')).toBe(
      true,
    )
    expect(isBenignFindAbort('Headless find returned 0 emails')).toBe(false)
  })
})
