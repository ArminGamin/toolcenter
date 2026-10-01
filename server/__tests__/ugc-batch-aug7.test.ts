import { describe, expect, it } from 'vitest'
import {
  assertShipableLtSlide,
  collectStoryIssues,
  isGibberishLtCopy,
  isShipableLtSlide,
  normalizeLtUgcMultiline,
} from '../ugc-lt-normalize.js'
import {
  buildBatchTemplateCaption,
  normalizeCaptionLt,
  UGC_CAPTION_CTA,
} from '../ugc-caption-format.js'

describe('Aug-7 batch false positives', () => {
  it.each([
    'Karščio bangos atnešė naujų perspektyvų.',
    'Šiemet jauti kitaip. Nori kontrolės ir taupymo.',
  ])('keeps valid LT: %s', (text) => {
    const normalized = normalizeLtUgcMultiline(text)
    expect(isGibberishLtCopy(normalized)).toBe(false)
    expect(() => assertShipableLtSlide({ body: normalized, role: 'build' })).not.toThrow()
  })

  it('normalizes first-person residue to tu register', () => {
    const normalized = normalizeLtUgcMultiline(
      'Šiemet jaučiuosi kitaip. Noriu kontrolės ir suprantu savo pasirinkimą.',
    )
    expect(normalized).toContain('jauti')
    expect(normalized).toContain('Nori')
    expect(normalized).toContain('supranti')
    expect(normalized).not.toMatch(/jaučiuosi|noriu|suprantu/iu)
    expect(isGibberishLtCopy(normalized)).toBe(false)
  })
})

describe('Aug-7 batch hard rejects and repairs', () => {
  it.each([
    'Tu galimi suderinsi visus renginius.',
    'Utėlius laukia pirmosios rudens dienos.',
    'Tavęs apjungia netikėti nuovargio bangos.',
  ])('never ships raw defect: %s', (raw) => {
    const normalized = normalizeLtUgcMultiline(raw)
    expect(
      isGibberishLtCopy(raw) ||
        normalized !== raw ||
        !isShipableLtSlide({ body: normalized, role: 'build' }),
    ).toBe(true)
  })

  it('rejects an incomplete nominal close', () => {
    expect(
      isShipableLtSlide({
        body: 'Dabar supranti, kad kasdieninis balansavimas.',
        role: 'close',
      }),
    ).toBe(false)
  })

  it('detects hook-close echo', () => {
    const issues = collectStoryIssues([
      { role: 'hook', title: 'Ar vėl norisi saldaus?', body: 'Vakare vėl norisi saldaus.' },
      { role: 'build', body: 'Nuovargis sustiprina potraukį saldumynams.' },
      { role: 'close', body: 'Kai vėl norisi saldaus, pirmiausia sustok ir įvertink alkį.' },
    ])
    expect(issues.some((issue) => issue.code === 'hook_close_echo')).toBe(true)
  })

  it('detects critical theme drift', () => {
    const issues = collectStoryIssues(
      [
        { role: 'hook', title: 'Ar vasara išvargino?', body: 'Karštis pakeitė tavo ritmą.' },
        { role: 'build', body: 'Rudenį norisi daugiau tvarkos.' },
        { role: 'close', body: 'Aiškus planas padeda kasdien rinktis ramiau.' },
      ],
      'pirmas maistas kūdikiui',
    )
    expect(issues.some((issue) => issue.code === 'theme_drift')).toBe(true)
  })
})

describe('Aug-7 caption alignment', () => {
  it('uses the actual non-question slide hook and correct case', () => {
    const built = buildBatchTemplateCaption({
      themeHook: 'Bandėte meal kit',
      themeBody: 'Paprastas sprendimas apie mitybos planas.',
      slides: [
        {
          title: 'Maisto rinkinys ne visada sutaupo',
          body: 'Kartais vis tiek lieka nepanaudotų produktų.',
        },
      ],
      defaultCta: 'x',
      theme: 'tried meal kits',
      category: 'planning',
    })
    expect(built.description).toContain('Maisto rinkinys ne visada sutaupo')
    expect(built.description).not.toMatch(/apie mitybos planas/iu)
    expect(built.description).toContain(UGC_CAPTION_CTA)
    expect(UGC_CAPTION_CTA).toContain('🤩')
    expect(UGC_CAPTION_CTA).not.toContain('😊')
  })

  it('repairs common caption case errors', () => {
    expect(normalizeCaptionLt('Taisyklė apie mitybos planas.')).toBe(
      'Taisyklė apie mitybos planą.',
    )
    expect(normalizeCaptionLt('Rinkis pagal savaitės planas.')).toBe(
      'Rinkis pagal savaitės planą.',
    )
  })
})
