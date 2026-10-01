import { describe, expect, it } from 'vitest'
import {
  getUgcSeasonContext,
  sanitizeLtSeasonCopy,
  trimCaptionBody,
  UGC_CAPTION_BODY_MAX,
} from '../ugc-season-context.js'

describe('getUgcSeasonContext', () => {
  it('bans all seasonal filler when the theme is not seasonal', () => {
    const ctx = getUgcSeasonContext(new Date(2026, 7, 4), 'gliuteno netoleravimas ir vakarienė')
    expect(ctx).toMatch(/Nerašyk apie mėnesius/i)
    expect(ctx).not.toMatch(/rugpjūtis/i)
  })

  it('allows one mention and names the month only for seasonal themes', () => {
    const ctx = getUgcSeasonContext(new Date(2026, 7, 4), 'vasaros mityba ir karštis')
    expect(ctx).toContain('rugpjūtis')
    expect(ctx).toMatch(/VIENĄ KARTĄ/)
    expect(ctx).toMatch(/rugsėj/)
  })
})

describe('sanitizeLtSeasonCopy', () => {
  it('rewrites pavasario in August', () => {
    const out = sanitizeLtSeasonCopy('Pavasario lengvumas ir pavasario vėjas', new Date(2026, 7, 4))
    expect(out).toMatch(/vasar/i)
    expect(out).not.toMatch(/pavasar/i)
  })
})

describe('trimCaptionBody', () => {
  it('drops extra blocks when over max', () => {
    const body = ['A'.repeat(200), 'B'.repeat(200), 'C'.repeat(200), 'D'.repeat(200), 'E'.repeat(200), 'F'.repeat(200)].join('\n\n')
    const trimmed = trimCaptionBody(body)
    expect(trimmed.length).toBeLessThanOrEqual(UGC_CAPTION_BODY_MAX)
  })
})
