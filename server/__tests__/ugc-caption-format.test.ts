import { describe, expect, it } from 'vitest'
import {
  formatBatchDiscordCaption,
  buildBatchTemplateCaption,
  stripCaptionEmDashes,
  pickCaptionOpener,
  LT_CAPTION_FOOTER,
  LT_CAPTION_HASHTAGS,
  UGC_CAPTION_CTA,
} from '../ugc-caption-format.js'

describe('formatBatchDiscordCaption', () => {
  it('follows pin opener + 3 content paras + CTA + bullets + hashtags', () => {
    const caption = formatBatchDiscordCaption(
      'Vasarą valgai sveikai, bet vis tiek jautiesi be energijos?\n\nDažniausiai priežastis - viena paprasta mitybos taisyklė.\n\nKai žingsniai aiškūs, kasdien lieka mažiau spėliojimo.',
      { seed: 0 },
    )
    expect(caption.startsWith('📌 Priminimas:')).toBe(true)
    expect(caption).toContain('Vasarą valgai sveikai')
    expect(caption).toContain('Dažniausiai priežastis')
    expect(caption).toContain('Kai žingsniai aiškūs')
    expect(caption).toContain(UGC_CAPTION_CTA)
    expect(caption).toContain('tavoknyga.com')
    expect(caption).toContain(LT_CAPTION_FOOTER)
    expect(caption).toContain(LT_CAPTION_HASHTAGS)
    expect(caption).not.toMatch(/—|–/)
    expect(caption).not.toContain('🍥')
  })

  it('uses seed to rotate opener within the matching pool', () => {
    const a = formatBatchDiscordCaption('Ar duona tampa kietesnė?', { seed: 0 })
    const b = formatBatchDiscordCaption('Ar duona tampa kietesnė?', { seed: 1 })
    expect(a).not.toBe(b)
    expect(a.startsWith('📌')).toBe(true)
    expect(b.startsWith('📌')).toBe(true)
    expect(a).not.toContain('Sunki tiesa')
    expect(b).not.toContain('Sunki tiesa')
  })
})

describe('pickCaptionOpener', () => {
  it('never uses Sunki tiesa for question hooks', () => {
    expect(pickCaptionOpener('Ką veiki, kai viskas atrodo chaotiška?', 1)).not.toContain('Sunki tiesa')
    expect(pickCaptionOpener('Ar mėsiškas maistas išleidžia tavo piniginę?', 2)).not.toContain('Sunki tiesa')
  })

  it('uses insight opener for colon facts', () => {
    expect(pickCaptionOpener('Svyruojantis cukrus: kodėl taip nutinka', 0)).toMatch(/Štai kas svarbu|Skaityk lėtai/)
  })
})

describe('buildBatchTemplateCaption', () => {
  it('returns 3 content paragraphs plus caption CTA', () => {
    const out = buildBatchTemplateCaption({
      themeHook: 'Mažiau maisto švaistymo vasarą.',
      themeBody: 'Planas padeda išnaudoti produktus prieš jiems sugendant.',
      slides: [
        { role: 'hook', title: 'Ar maistas eina per greitai?' },
        { role: 'build', body: 'Aiškus planas padeda mažiau švaistyti ir ramiau planuoti savaitę.' },
      ],
      defaultCta: 'ignored',
      seed: 0,
    })
    const paras = out.description.split(/\n\n/)
    expect(paras).toHaveLength(4)
    expect(paras[3]).toBe(UGC_CAPTION_CTA)
    expect(paras[3]).toContain('tavoknyga.com')
    expect(paras[2].length).toBeGreaterThan(30)
    expect(out.description).not.toMatch(/—|–/)
    expect(out.hook.startsWith('📌')).toBe(true)
    expect(out.hook).not.toContain('Sunki tiesa')
  })

  it('expands bare Mažiau hook titles and uses updated hashtags', () => {
    const out = buildBatchTemplateCaption({
      themeHook: 'Mažiau emocinio',
      themeBody: 'Struktūruotas planas sumažina sprendimų nuovargį.',
      slides: [{ role: 'hook', title: 'Mažiau emocinio' }],
      defaultCta: 'ignored',
      seed: 0,
    })
    expect(out.description).toContain('Mažiau emocinio valgymo')
    expect(LT_CAPTION_HASHTAGS).toBe('#tavoknyga #maistas #sveikamityba #lietuva')
    expect(LT_CAPTION_HASHTAGS).not.toContain('#disciplina')
  })

  it('skips plan-step template for food-waste keyword', () => {
    const out = buildBatchTemplateCaption({
      themeHook: 'Mažiau maisto švaistymo',
      themeBody: 'Planas padeda išnaudoti produktus prieš jiems sugendant.',
      slides: [
        { role: 'hook', title: 'Ar maistas eina per greitai?' },
        { role: 'build', body: 'Aiškus planas padeda mažiau švaistyti ir ramiau planuoti savaitę.' },
      ],
      defaultCta: 'ignored',
      seed: 2,
    })
    expect(out.description).not.toMatch(/aiškų maisto švaistymą žingsnis/i)
  })
})

describe('stripCaptionEmDashes', () => {
  it('replaces em dashes with spaced hyphen', () => {
    expect(stripCaptionEmDashes('sužinok — apsilankyk')).toBe('sužinok - apsilankyk')
    expect(stripCaptionEmDashes('pilnas/-a')).toBe('pilnas/-a')
  })
})
