import { describe, expect, it } from 'vitest'
import { ensureUgcWebsiteCta, finalizeCloseSlideCta, UGC_DEFAULT_CTA } from '../ugc-cta-normalize.js'

describe('ugc-cta-normalize', () => {
  it('uses website + test CTA', () => {
    expect(UGC_DEFAULT_CTA).toBe('Apsilankyk tavoknyga.com ir pradėk 5 min. testą! 🤩')
    expect(UGC_DEFAULT_CTA).toContain('tavoknyga.com')
  })

  it('forces canonical CTA', () => {
    expect(ensureUgcWebsiteCta('')).toBe(UGC_DEFAULT_CTA)
    expect(ensureUgcWebsiteCta('Sužinok daugiau')).toBe(UGC_DEFAULT_CTA)
    expect(ensureUgcWebsiteCta('Pradėk 5 min. testą! 🤩')).toBe(UGC_DEFAULT_CTA)
  })

  it('finalizeCloseSlideCta always returns branded line', () => {
    expect(finalizeCloseSlideCta('anything')).toBe(UGC_DEFAULT_CTA)
  })
})
