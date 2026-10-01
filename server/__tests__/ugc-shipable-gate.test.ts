import { describe, expect, it } from 'vitest'
import {
  assertShipableLtSlide,
  isShipableLtSlide,
  normalizeLtUgcMultiline,
  demoteLtTitleCase,
  LT_SCREENSHOT_STEMS,
} from '../ugc-lt-normalize.js'
import { finalizeHookTitle } from '../ugc-hook-templates.js'
import { UGC_DEFAULT_CTA } from '../ugc-cta-normalize.js'
import {
  buildBatchTemplateCaption,
  formatBatchDiscordCaption,
  pickSeoKeyword,
  LT_CAPTION_HASHTAGS,
} from '../ugc-caption-format.js'
import { finalizeBatchSlides } from '../ugc-story-engine.js'

/** Raw bad strings from output/batch metas — must normalize clean + shipable. */
const META_FAILURES: Array<{ raw: string; mustNotMatch: RegExp }> = [
  {
    raw: 'Ar jauti, kad daržovės tiesiog greitai subręsta? Dažnai užmiršti ką nors panaudoti.',
    mustNotMatch: /subręst|užmiršt/i,
  },
  {
    raw: 'Dėl to dažnas jauti varginamas, o maisto atliekos didina rūpestų krūvį. Planuoti kasdien. Nėra lengva.',
    mustNotMatch: /varginamas|rūpestų/i,
  },
  {
    raw: 'Tavo knyga padeda, kad niekas nešlamžtų. Tai reiškia mažiau streso.',
    mustNotMatch: /nešlamž/i,
  },
  {
    raw: 'Svarstyklės irgi įsismuovė. Ieško greito atsvarumo. Priklauso nuo hidratacijąjąjos.',
    mustNotMatch: /įsismuov|atsvarum|hidratacijąj/i,
  },
  {
    raw: 'Štai kodėl koncentruotis į vieną skaitmenį. Tai mažina motyvaciją.',
    mustNotMatch: /kodėl koncentruotis/i,
  },
  {
    raw: 'Lengvų angidratų ir baltymų. Su maistinu galėsi mėgautis.',
    mustNotMatch: /angidrat|maistinu/i,
  },
]

describe('assertShipableLtSlide', () => {
  it('accepts clean LT meal-prep copy', () => {
    expect(() =>
      assertShipableLtSlide({
        title: 'Ar vėl nežinai, ką gaminti?',
        body: 'Kiekvieną vakarą sprendi tą patį. Planas tai išsprendžia be streso.',
        role: 'hook',
      }),
    ).not.toThrow()
  })

  it('rejects known bad stems even if somehow present', () => {
    expect(
      isShipableLtSlide({
        title: '',
        body: 'Daržovės greitai subręsta spintoje.',
        role: 'build',
      }),
    ).toBe(false)
  })

  it('rejects CTA/emoji in body', () => {
    expect(
      isShipableLtSlide({
        body: 'Pradėk planą. Apsilankyk tavoknyga.com ir pradėk 5 min. testą! 🤩',
        role: 'close',
      }),
    ).toBe(false)
  })

  it('demotes Title Case hooks instead of rejecting (avoids LLM retries)', () => {
    expect(
      isShipableLtSlide({
        title: 'Svorio Tikslai Ir Maisto Švaistymas',
        body: 'Kai planuoji savaitę, mažiau švaistai produktų virtuvėje.',
        role: 'hook',
      }),
    ).toBe(true)
  })
})

describe('meta failure normalize → shipable', () => {
  for (const row of META_FAILURES) {
    it(`cleans: ${row.raw.slice(0, 40)}…`, () => {
      const out = normalizeLtUgcMultiline(row.raw)
      expect(out).not.toMatch(row.mustNotMatch)
      expect(LT_SCREENSHOT_STEMS.test(out)).toBe(false)
      // After normalize, body-only should ship if long enough
      if (out.length >= 40) {
        expect(() => assertShipableLtSlide({ body: out, role: 'build' })).not.toThrow()
      }
    })
  }
})

describe('finalizeHookTitle', () => {
  it('forces Question hooks to end with ?', () => {
    const t = finalizeHookTitle('svorio šuoliai kasdien', 'Question', 'svorio tikslas', 0)
    expect(t.endsWith('?')).toBe(true)
    expect(t.length).toBeGreaterThan(8)
  })

  it('demotes junk CTA-like titles', () => {
    const t = finalizeHookTitle('Pradėk 5 min. testą', 'Bold claim', 'planas', 2)
    expect(t).not.toMatch(/pradėk 5 min|🤩/i)
  })
})

describe('demoteLtTitleCase', () => {
  it('demotes Title Case', () => {
    expect(demoteLtTitleCase('Svorio Tikslai Ir Planas')).toMatch(/Svorio tikslai ir planas/i)
  })
})

describe('SEO caption builder', () => {
  it('builds 4 content blocks with keyword, soft CTA, hashtags, no em dashes', () => {
    const built = buildBatchTemplateCaption({
      themeHook: 'Mažiau maisto švaistymo vasarą.',
      themeBody: 'Planas padeda išnaudoti produktus.',
      slides: [{ body: 'Dabar gali planuoti be streso kiekvieną vakarą.' }],
      defaultCta: UGC_DEFAULT_CTA,
      seed: 0,
      theme: 'zero waste mindset',
      category: 'Random theme',
    })
    const paras = built.description.split(/\n\n/)
    expect(paras).toHaveLength(4)
    expect(paras[3]).toContain('tavoknyga.com')
    expect(paras[3]).toMatch(/🤩/)
    expect(pickSeoKeyword('zero waste maisto švaistymas')).toMatch(/švaist/i)
    expect(built.description).not.toMatch(/—|–/)

    const caption = formatBatchDiscordCaption(built.description, {
      opener: built.hook,
      seed: 0,
      themeBlob: 'zero waste maisto švaistymas',
    })
    expect(caption).toContain('tavoknyga.com')
    expect(caption).toContain(LT_CAPTION_HASHTAGS)
    expect(caption.startsWith('📌')).toBe(true)
    expect(caption).toContain('\n•\n•\n•\n')
    expect(caption).not.toMatch(/—|–/)
  })
})

describe('finalizeBatchSlides CTA lock', () => {
  it('forces canonical website CTA on close', () => {
    const out = finalizeBatchSlides(
      [
        {
          id: '1',
          role: 'hook',
          title: 'Ar vėl nežinai, ką gaminti vakare?',
          body: 'Kiekvieną vakarą tas pats klausimas. Planas tai išsprendžia ramiai.',
        },
        {
          id: '2',
          role: 'close',
          title: '',
          body: 'Dabar gali planuoti savaitę be streso ir be švaistymo.',
          cta: 'Sužinok daugiau',
        },
      ],
      'anything',
    )
    expect(out[1].cta).toBe(UGC_DEFAULT_CTA)
    expect(out[1].cta).toContain('tavoknyga.com')
  })
})
