import { describe, expect, it } from 'vitest'
import { CHRISTMAS_BUSINESS_PROFILE_ID, DEFAULT_BUSINESS_PROFILE_ID } from './business-profiles'
import { rectsIntersect, kaleduChromeRects, cardRectsFromLayout, chooseKaleduProductRect } from './ugc-kaledu-layout'
import { ugcBrandLogoUrl } from './ugc-slides-render'
import { KALEDU_WATERMARK, ugcWatermarkConfig, watermarkBounds } from './ugc-watermark'

describe('Kalėdų watermark', () => {
  it('is Christmas-only and about 10% of slide width', () => {
    expect(ugcWatermarkConfig(CHRISTMAS_BUSINESS_PROFILE_ID)?.src).toContain('watermark.png')
    expect(ugcWatermarkConfig(DEFAULT_BUSINESS_PROFILE_ID)).toBeNull()
    expect(ugcBrandLogoUrl(CHRISTMAS_BUSINESS_PROFILE_ID)).toContain('kaledu-kampelis/watermark')
    expect(ugcBrandLogoUrl(DEFAULT_BUSINESS_PROFILE_ID)).not.toContain('kaledu-kampelis')
    const { mark, safe } = watermarkBounds(1080, 1920)
    expect(mark.w).toBe(108)
    expect(mark.h).toBe(108)
    expect(mark.x).toBe(Math.round((1080 - 108) / 2))
    expect(KALEDU_WATERMARK.opacity).toBe(0.75)
    expect(safe.y).toBeLessThan(mark.y)
  })

  it('keeps product, text, and the counter out of the watermark zone', () => {
    const chrome = kaleduChromeRects()
    const cards = cardRectsFromLayout(220, [{ width: 912, height: 180 }], 84)
    const product = chooseKaleduProductRect({ layoutId: 'D', cardRects: cards, productAspect: 1 })
    expect(product.productRect).not.toBeNull()
    expect(rectsIntersect(product.productRect!, chrome.watermarkSafe, 0)).toBe(false)
    expect(rectsIntersect(cards[0], chrome.watermarkSafe, 0)).toBe(false)
    expect(rectsIntersect(chrome.logo, chrome.counter, 0)).toBe(false)
    const cta = { x: 84, y: chrome.watermarkSafe.y - 200, w: 912, h: 140 }
    expect(rectsIntersect(cta, chrome.watermarkSafe, 0)).toBe(false)
    const longCard = { x: 84, y: 200, w: 912, h: 1400 }
    expect(longCard.y + longCard.h).toBeLessThanOrEqual(chrome.watermarkSafe.y)
  })
})
