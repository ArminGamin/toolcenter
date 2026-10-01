import { describe, expect, it } from 'vitest'
import {
  cardRectsFromLayout,
  chooseKaleduProductRect,
  kaleduChromeRects,
  pickKaleduProductLayoutId,
  rectsIntersect,
} from './ugc-kaledu-layout'

import { resolveProductSlidePaint } from './ugc-slides-render'

describe('long product copy keeps the product image', () => {
  it('fits text and keeps the product layout when the body is longer than 220 characters', () => {
    const productImage = { width: 800, height: 800 }
    const body = `${'Puodelis tinka rytinei kavai. '.repeat(12)}Tai dovana, kurią naudos kiekvieną rytą.`
    expect(body.length).toBeGreaterThan(220)
    const paint = resolveProductSlidePaint({ body, productImage })
    expect(paint.layoutId).toBe('D')
    expect(paint.layoutId).not.toBe('F')
    expect(paint.productImage).toBe(productImage)
    expect(paint.body.length).toBeLessThan(body.length)
    expect(paint.body.length).toBeLessThanOrEqual(220)
  })
})

describe('Kalėdų product overlay layout', () => {
  it('keeps the product layout when copy is long', () => {
    expect(
      pickKaleduProductLayoutId({
        textLen: 280,
        hasProduct: true,
        role: 'build',
      }),
    ).toBe('D')
  })

  it('keeps product rect off cards, logo, and counter', () => {
    const cards = cardRectsFromLayout(220, [{ width: 912, height: 160 }], 84)
    const placed = chooseKaleduProductRect({
      layoutId: 'A',
      cardRects: cards,
      productAspect: 1,
    })
    expect(placed.productRect).not.toBeNull()
    const chrome = kaleduChromeRects()
    const product = placed.productRect!
    for (const card of cards) {
      expect(rectsIntersect(product, card, 32)).toBe(false)
    }
    expect(rectsIntersect(product, chrome.logo, 32)).toBe(false)
    expect(rectsIntersect(product, chrome.counter, 32)).toBe(false)
    expect(rectsIntersect(product, chrome.footerBand, 0)).toBe(false)
  })

  it('product reveal D uses 25–40% of slide height', () => {
    const cards = cardRectsFromLayout(220, [{ width: 912, height: 160 }], 84)
    const placed = chooseKaleduProductRect({
      layoutId: 'D',
      cardRects: cards,
      productAspect: 1,
    })
    expect(placed.productRect).not.toBeNull()
    const h = placed.productRect!.h
    expect(h).toBeGreaterThanOrEqual(1920 * 0.24)
    expect(h).toBeLessThanOrEqual(1920 * 0.41)
    const chrome = kaleduChromeRects()
    expect(rectsIntersect(placed.productRect!, cards[0], 32)).toBe(false)
    expect(rectsIntersect(placed.productRect!, chrome.logo, 32)).toBe(false)
    expect(rectsIntersect(placed.productRect!, chrome.footerBand, 0)).toBe(false)
  })

  it('omits product when leftover space is too small', () => {
    const cards = cardRectsFromLayout(80, [{ width: 912, height: 1500 }], 84)
    const placed = chooseKaleduProductRect({
      layoutId: 'A',
      cardRects: cards,
      productAspect: 1,
    })
    expect(placed.productRect).toBeNull()
  })
})
