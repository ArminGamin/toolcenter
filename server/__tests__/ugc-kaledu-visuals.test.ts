import { describe, expect, it } from 'vitest'
import {
  assignSlideVisuals,
  createVisualLedger,
  normalizeProductImages,
  pickProductVisual,
  skuOwnsFilename,
  slideVisualMatchesProduct,
  visualsFromImages,
  visualRepeatVerdict,
  type ProductVisual,
} from '../ugc-kaledu-visuals.js'

function shots(productId: string, ids: string[], roles: ProductVisual['role'][] = []): ProductVisual[] {
  return visualsFromImages(
    productId,
    ids.map((id) => `/products/${id}.webp`),
  ).map((visual, index) => ({ ...visual, role: roles[index] || 'unknown', usable: true }))
}

function sequence(productId: string, variants: ProductVisual[], times: number, postSeed: string) {
  const ledger = createVisualLedger()
  const picks = []
  for (let i = 0; i < times; i++) {
    picks.push(pickProductVisual({ productId, variants, postSeed, ledger }))
  }
  return picks
}

describe('product visual selector', () => {
  it('uses a different angle for the second appearance', () => {
    const variants = shots('JK-001', ['A', 'B', 'C'])
    const picks = sequence('JK-001', variants, 2, 'post-a')
    expect(picks[0].visual?.variantId).not.toBe(picks[1].visual?.variantId)
    expect(picks.every((pick) => pick.reused === false)).toBe(true)
  })

  it('uses three distinct variants before any repeat', () => {
    const picks = sequence('JK-001', shots('JK-001', ['A', 'B', 'C']), 3, 'post-a')
    expect(new Set(picks.map((pick) => pick.visual?.variantId)).size).toBe(3)
  })

  it('reuses only after every variant has been used', () => {
    const picks = sequence('JK-001', shots('JK-001', ['A', 'B']), 3, 'post-a')
    expect(picks[0].visual?.variantId).not.toBe(picks[1].visual?.variantId)
    expect(picks[2].reused).toBe(true)
    expect(visualRepeatVerdict(picks.map((pick) => pick.visual!.variantId), 2)).toBe('unavoidable')
  })

  it('repeats the only image without failing', () => {
    const picks = sequence('JK-001', shots('JK-001', ['A']), 2, 'post-a')
    expect(picks.map((pick) => pick.visual?.variantId)).toEqual(['A', 'A'])
    expect(visualRepeatVerdict(['A', 'A'], 1)).toBe('unavoidable')
  })

  it('skips a broken image', () => {
    const variants = shots('JK-001', ['A', 'B', 'C']).map((visual) =>
      visual.variantId === 'B' ? { ...visual, usable: false } : visual,
    )
    const picks = sequence('JK-001', variants, 2, 'post-a')
    expect(picks.map((pick) => pick.visual?.variantId)).not.toContain('B')
    expect(new Set(picks.map((pick) => pick.visual?.variantId)).size).toBe(2)
  })

  it('treats a duplicated path as one variant', () => {
    const variants = visualsFromImages('JK-001', ['/products/A.webp', '/products/A.webp', '/products/B.webp'])
    expect(variants.map((visual) => visual.variantId)).toEqual(['A', 'B'])
    const picks = sequence('JK-001', variants, 2, 'post-a')
    expect(new Set(picks.map((pick) => pick.visual?.variantId)).size).toBe(2)
  })

  it('picks the same sequence when the post is rendered again', () => {
    const variants = shots('JK-001', ['A', 'B', 'C'])
    const first = sequence('JK-001', variants, 3, 'post-16').map((pick) => pick.visual?.variantId)
    const second = sequence('JK-001', variants, 3, 'post-16').map((pick) => pick.visual?.variantId)
    expect(second).toEqual(first)
  })

  it('can start a different post on a different angle', () => {
    const variants = shots('JK-001', ['A', 'B', 'C', 'D', 'E'])
    const starts = ['post-a', 'post-b', 'post-c', 'post-d', 'post-e'].map(
      (seed) => sequence('JK-001', variants, 1, seed)[0].visual?.variantId,
    )
    expect(new Set(starts).size).toBeGreaterThan(1)
  })

  it('never uses another SKU', () => {
    const own = shots('JK-001', ['A', 'B'])
    const other = shots('JK-002', ['C', 'D'])
    const picks = sequence('JK-001', [...own, ...other], 2, 'post-a')
    expect(picks.map((pick) => pick.visual?.variantId).every((id) => id === 'A' || id === 'B')).toBe(true)
  })

  it('prefers a hero first and an unused alternate second when roles exist', () => {
    const variants = shots('JK-001', ['A', 'B', 'C'], ['hero', 'detail', 'lifestyle'])
    const picks = sequence('JK-001', variants, 2, 'post-a')
    expect(['A', 'C']).toContain(picks[0].visual?.variantId)
    expect(picks[1].visual?.variantId).not.toBe(picks[0].visual?.variantId)
  })

  it('rotates a brand new product without a special case', () => {
    const assigned = assignSlideVisuals(
      [
        { productId: 'JK-999' },
        { productId: 'JK-999' },
      ],
      {
        postSeed: 'synthetic',
        quiet: true,
        visualsFor: () => shots('JK-999', ['X', 'Y', 'Z']),
      },
    )
    expect(assigned.slides[0].productVariantId).not.toBe(assigned.slides[1].productVariantId)
    expect(assigned.avoidableVisualRepeats).toBe(0)
  })

  it('rejects a visual whose productId is not the slide productId', () => {
    const foreign: ProductVisual = {
      src: '/products/JK-011__01.webp',
      productId: 'JK-011',
      variantId: 'JK-011__01',
      role: 'unknown',
      priority: 0,
      usable: true,
    }
    const assigned = assignSlideVisuals([{ productId: 'JK-001' }], {
      postSeed: 'gate',
      quiet: true,
      visualsFor: () => [foreign, ...shots('JK-001', ['JK-001__01'])],
    })
    expect(slideVisualMatchesProduct({ productId: 'JK-001' }, foreign)).toBe(false)
    expect(assigned.slides[0].productVariantId).toBe('JK-001__01')
    expect(assigned.picks[0]?.visual?.productId).toBe('JK-001')
  })

  it('does not let JK-01 discover JK-010 files', () => {
    expect(skuOwnsFilename('JK-01', 'JK-010__02.webp')).toBe(false)
    expect(skuOwnsFilename('JK-001', 'JK-001__02.webp')).toBe(true)
    expect(skuOwnsFilename('JK-001', '/products/JK-001/02.webp')).toBe(true)
  })

  it('clears a stored variant when the product changes', () => {
    const assigned = assignSlideVisuals(
      [{ productId: 'JK-011', productVariantId: 'JK-001__02' }],
      {
        postSeed: 'repair',
        quiet: true,
        visualsFor: (productId) => shots(productId, productId === 'JK-011' ? ['JK-011__01', 'JK-011__02'] : ['JK-001__02']),
      },
    )
    expect(assigned.slides[0].productVariantId).not.toBe('JK-001__02')
    expect(assigned.slides[0].productVariantId).toMatch(/^JK-011__/)
  })

  it('reselects when the stored variant file is gone', () => {
    const assigned = assignSlideVisuals([{ productId: 'JK-001', productVariantId: 'JK-001__deleted' }], {
      postSeed: 'missing',
      quiet: true,
      visualsFor: () => shots('JK-001', ['JK-001__01', 'JK-001__02']),
    })
    expect(['JK-001__01', 'JK-001__02']).toContain(assigned.slides[0].productVariantId)
  })

  it('keeps a valid stored variant on rerender', () => {
    const variants = shots('JK-001', ['JK-001__01', 'JK-001__02', 'JK-001__03'])
    const assigned = assignSlideVisuals([{ productId: 'JK-001', productVariantId: 'JK-001__02' }], {
      postSeed: 'stable',
      quiet: true,
      visualsFor: () => variants,
    })
    expect(assigned.slides[0].productVariantId).toBe('JK-001__02')
    expect(assigned.picks[0]?.selectionReason).toBe('stored_variant')
  })

  it('dedupes catalog paths', () => {
    expect(normalizeProductImages(['/products/A.webp', '/products/A.webp', '/products/B.webp'])).toEqual([
      '/products/A.webp',
      '/products/B.webp',
    ])
  })
})
