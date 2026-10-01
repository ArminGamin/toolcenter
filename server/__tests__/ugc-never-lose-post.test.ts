import { describe, expect, it } from 'vitest'
import {
  buildFallbackChunkSlides,
  buildFallbackHook,
  ugcSlideRoles,
} from '../ugc-story-engine.js'
import { assertShipableStory, isShipableLtSlide } from '../ugc-lt-normalize.js'
import { UGC_DEFAULT_CTA } from '../ugc-cta-normalize.js'
import { scanSlideQuality } from '../ugc-batch-audit.js'

const THEMES: Array<{ hook: string; body: string; topic: string }> = [
  {
    hook: 'Ar sūris visada baigiasi per greitai?',
    body: 'Didelis gabalas spintelėje dingsta anksčiau, nei spėji jį panaudoti.',
    topic: 'cheese leftovers',
  },
  {
    hook: 'Po sunkaus rugpjūčio karščio sporto salėje',
    body: 'Rugpjūčio karštis palieka tave išsekusį, o mintys apie maisto gaminimą atstumia.',
    topic: 'post workout meals',
  },
  {
    hook: 'Šeimos rutina grįžta',
    body: 'Patiekalai suplanuoti pagal užimtą šeimos grafiką, kai laiko virtuvėje lieka mažiau.',
    topic: 'back to school family routine',
  },
  { hook: '', body: '', topic: 'gluten free dinners' },
]

describe('programmatic rescue always ships a usable post', () => {
  it.each(THEMES)('builds a shipable hook for "$topic"', (theme) => {
    const hook = buildFallbackHook(theme.hook, theme.body)
    expect(hook.title.length).toBeGreaterThan(0)
    expect(isShipableLtSlide({ title: hook.title, body: hook.body, role: 'hook' })).toBe(true)
  })

  it.each([3, 4, 5, 6, 7])('builds a clean %i-slide fallback story', (slideCount) => {
    const roles = ugcSlideRoles(slideCount)
    const slides = buildFallbackChunkSlides({
      roles,
      slideStart: 1,
      topic: 'weekly meal planning',
      themeHook: 'Ar savaitės vakarai vis dar prasideda tuo pačiu klausimu?',
      themeBody: 'Kiekvieną vakarą svarstai iš naujo, ką gaminti.',
      defaultCta: UGC_DEFAULT_CTA,
      prior: [],
    })

    expect(slides).toHaveLength(slideCount)
    for (const slide of slides) {
      expect(isShipableLtSlide({ title: slide.title, body: slide.body, role: slide.role })).toBe(
        true,
      )
    }

    const close = slides[slides.length - 1]
    expect(close.cta).toBe(UGC_DEFAULT_CTA)

    const scan = scanSlideQuality(slides, 'weekly meal planning')
    expect(scan.flatMap((s) => s.issues)).toEqual([])
  })

  it('never repeats a body across fallback slides', () => {
    const slides = buildFallbackChunkSlides({
      roles: ugcSlideRoles(7),
      slideStart: 1,
      topic: 'weekly meal planning',
      themeHook: 'Ar savaitės vakarai vis dar prasideda tuo pačiu klausimu?',
      themeBody: 'Kiekvieną vakarą svarstai iš naujo, ką gaminti.',
      defaultCta: UGC_DEFAULT_CTA,
      prior: [],
    })
    const bodies = slides.map((s) => s.body)
    expect(new Set(bodies).size).toBe(bodies.length)
  })

  // Themes the story gate requires an anchor for — a fully rescued post must keep it.
  it.each([
    ['sūrio likučiai šaldytuve', 'Ar sūris visada baigiasi per greitai?'],
    ['diabetas ir gliukozė', 'Ar gliukozė vis dar šokinėja po vakarienės?'],
    ['ištvermės sportas', 'Ar treniruotė išsemia tave iki galo?'],
    ['kūdikio pirmas maistas', 'Ar žinai, nuo ko pradėti?'],
    ['meal kit patogumas', 'Ar maisto rinkinys tikrai sutaupo laiko?'],
    ['stresinis valgymas vakare', 'Ar stresas nuveda tave prie šaldytuvo?'],
  ])('a fully rescued post keeps the theme anchor: %s', (topic, themeHook) => {
    const slides = buildFallbackChunkSlides({
      roles: ugcSlideRoles(5),
      slideStart: 1,
      topic,
      themeHook,
      themeBody: 'Tokia situacija kartojasi kiekvieną savaitę.',
      defaultCta: UGC_DEFAULT_CTA,
      prior: [],
    })
    expect(() => assertShipableStory(slides, `${topic} ${themeHook}`)).not.toThrow()
  })

  it('strips seasonal filler out of a rescued hook', () => {
    const hook = buildFallbackHook(
      'Po sunkaus rugpjūčio karščio, ar vakarienė vis dar atrodo kaip užduotis?',
      'Rugpjūčio karštis vargina.',
    )
    expect(hook.title).not.toMatch(/rugpjū|karšt/i)
  })
})
