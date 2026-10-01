import { describe, expect, it } from 'vitest'
import {
  normalizeLtUgcMultiline,
  isGibberishLtCopy,
  isShipableLtSlide,
  assertShipableLtSlide,
} from '../ugc-lt-normalize.js'
import { isDuplicateSlideCopy } from '../ugc-story-engine.js'
import { buildBatchTemplateCaption, UGC_CAPTION_CTA } from '../ugc-caption-format.js'
import {
  UGC_BRAND_LOGO_HEIGHT,
  ugcFooterReserve,
  UGC_BRAND_LOGO_GAP_RATIO,
  UGC_BRAND_FOOTER_PAD,
  SLIDE_HEIGHT,
} from '../../src/lib/ugc-slides-render.js'

/** Exact inventeds from D:\ugc-batch-vision post-03/05. */
const VISION_INVENTED: Array<{ raw: string; mustNotMatch: RegExp }> = [
  { raw: 'Tu kątį palieki, o paskui prisimeni. Tai tik pinigų švaistymas kasdien.', mustNotMatch: /kątį/i },
  { raw: 'Įtrauk likusį sūrį į virtuvės rutinoją kiekvieną dieną.', mustNotMatch: /rutinoj/i },
  { raw: 'Spėlionės apie odos bėdeles baigiasi frustracija.', mustNotMatch: /bėdel/i },
  { raw: 'Stebi, ką valgoji, ir kaip tai atsiliepia.', mustNotMatch: /valgoji/i },
  { raw: 'Lengvai viršinamas patiekalas padeda poilsio dieną.', mustNotMatch: /viršinamas/i },
  { raw: 'Vasara dar tebesildo, bet jau ruošiesi rudeniui.', mustNotMatch: /tebesildo/i },
]

const VISION_PERSON: string[] = [
  'Tu kątik palieki. Galėčiau kažką pagaminti iš likučių.',
  'Pradėjau dairytis kitaip. Štai kodėl aš planuoju sūrį.',
  'Tu pats(i) tapsi savo kūno eksperimentų vadovas.',
  'Stebėdama, ką valgai, gali suprasti signalus.',
]

describe('vision batch5 — inventeds', () => {
  it.each(VISION_INVENTED)('normalizes: $raw', ({ raw, mustNotMatch }) => {
    const out = normalizeLtUgcMultiline(raw)
    expect(out).not.toMatch(mustNotMatch)
    expect(isGibberishLtCopy(out)).toBe(false)
    expect(isShipableLtSlide({ body: out.includes('.') ? out : `${out}.`, role: 'build' })).toBe(true)
  })
})

describe('vision batch5 — person/gender', () => {
  it.each(VISION_PERSON)('rewrites or rejects: %s', (raw) => {
    const out = normalizeLtUgcMultiline(raw)
    expect(out).not.toMatch(/pats\s*\(\s*i\s*\)|galėčiau|pradėjau|aš planuoju|stebėdama/i)
    // After normalize should be shipable tu-copy
    expect(isGibberishLtCopy(out)).toBe(false)
  })

  it('rejects residual pats(i) if somehow present', () => {
    expect(isGibberishLtCopy('Tu pats(i) tapsi vadovas.')).toBe(true)
  })

  it('rejects stump Taigi, noun', () => {
    expect(isGibberishLtCopy('Galima pridėti į blynus. Taigi, suplanavimas.')).toBe(true)
  })
})

describe('vision batch5 — close vs hook', () => {
  it('flags close that paraphrases hook', () => {
    const hook = {
      title: 'Ar sūris visada baigiasi?',
      body: 'Rugpjūtį spintelėje beliko pusė didelio gabalo, o dabar jau nieko.',
    }
    const close = {
      title: '',
      body: 'Rugpjūtį spintelėje beliko didelis gabalas, dabar jo nebelieka. Štai kodėl dažnai susiduri su maisto atliekomis.',
    }
    expect(isDuplicateSlideCopy(close.title, close.body, [hook])).toBe(true)
  })
})

describe('vision batch5 — captions', () => {
  it('avoids bolted savaitės planas and keeps CTA', () => {
    const built = buildBatchTemplateCaption({
      themeHook: 'Sūrio likučiai.',
      themeBody: 'Produktas suplanuotas keliuose patiekaluose, kad būtų panaudotas iki galo.',
      slides: [{ title: 'Ar sūris visada baigiasi?', body: 'Kai planuoji likučius, mažiau išmeti.' }],
      defaultCta: 'x',
      seed: 1,
      theme: 'cheese ends',
      category: 'waste',
    })
    expect(built.description).not.toMatch(/-\s*savaitės planas\s*$/m)
    expect(built.description).toContain(UGC_CAPTION_CTA)
    const paras = built.description.split(/\n\n/)
    expect(paras[1].length).toBeGreaterThanOrEqual(40)
  })
})

describe('vision batch5 — logo chrome', () => {
  it('logo is 152px and footer covers logo+gap+pad', () => {
    expect(UGC_BRAND_LOGO_HEIGHT).toBe(152)
    const gap = Math.round(SLIDE_HEIGHT * UGC_BRAND_LOGO_GAP_RATIO)
    expect(ugcFooterReserve()).toBe(UGC_BRAND_LOGO_HEIGHT + gap + UGC_BRAND_FOOTER_PAD)
  })
})

describe('vision batch5 — stump shipable', () => {
  it('rejects bare planning stump after normalize miss', () => {
    expect(
      isShipableLtSlide({
        body: 'Taigi, suplanavimas.',
        role: 'build',
      }),
    ).toBe(false)
  })

  it('accepts fixed planning sentence', () => {
    const out = normalizeLtUgcMultiline('Galima pridėti į blynus. Taigi, suplanavimas.')
    expect(out).not.toMatch(/Taigi,\s*suplanavimas/i)
    expect(() => assertShipableLtSlide({ body: out, role: 'build' })).not.toThrow()
  })
})
