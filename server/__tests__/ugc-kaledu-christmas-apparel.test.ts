import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CHRISTMAS_BUSINESS_PROFILE_ID, runWithBusinessProfile } from '../business-profiles.js'
import { copyNamesProduct, loadKaleduCatalog, resolveProductAssets, routeKaleduStory } from '../ugc-kaledu-catalog.js'
import { deriveProductSemantic } from '../ugc-kaledu-product-index.js'
import { resolveProductVisuals } from '../ugc-kaledu-visuals.js'
import { getUgcThemesForCategory, pickBatchUgcThemes } from '../ugc-theme-pool.js'

type Theme = {
  theme: string
  hook: string
  body: string
  kind?: string
  modeHint?: string
  productHints?: string[]
}

const pool = JSON.parse(
  fs.readFileSync(new URL('../../assets/ugc-slides/theme_pool_kaledu.json', import.meta.url), 'utf8'),
) as { total: number; categories: Record<string, Theme[]> }

const apparel = [
  { sku: 'JK-057', slug: 'kaledinis-megztinis-sventinis-rastas', motif: /eglučių.*elnių/iu },
  { sku: 'JK-058', slug: 'seimos-megztiniai-kaledu-dziaugsmas', motif: /Kalėdų Senelio.*snaigių/iu },
  { sku: 'JK-059', slug: 'kalediniai-megztiniai-sniego-duetas', motif: /sniego senio/iu },
  { sku: 'JK-060', slug: 'seimos-megztiniai-siaures-rastas', motif: /elnių.*snaigių/iu },
] as const

describe('new Christmas apparel in Kalėdų UGC', () => {
  it('keeps the theme pool count accurate', () => {
    expect(pool.total).toBe(Object.values(pool.categories).reduce((count, themes) => count + themes.length, 0))
  })

  it.each(apparel)('$sku resolves to its own product, images and product-led theme', ({ sku, slug, motif }) => {
    const product = loadKaleduCatalog().find((row) => row.sku === sku)
    expect(product?.slug).toBe(slug)
    expect(typeof product?.inStock).toBe('boolean')
    expect(product?.images.length).toBeGreaterThan(0)

    const theme = pool.categories['Prekės'].find((row) => row.productHints?.includes(slug))
    expect(theme).toBeDefined()
    expect(theme?.kind).toBe('product')
    expect(theme?.modeHint).toBe('product_led')
    expect(theme?.body).toMatch(motif)
    expect(`${theme?.hook} ${theme?.body}`).not.toMatch(/merinos|medviln|poliester|trijų dalių|rinkinyje/iu)
    expect(copyNamesProduct(`${theme?.hook} ${theme?.body}`, product!)).toBe(true)

    // Out-of-stock products must never be routed into a story; in-stock ones may be.
    const routed = routeKaleduStory({ ...theme!, category: 'Prekės' })
    if (!product!.inStock) expect(routed.products.map((row) => row.sku)).not.toContain(sku)
    expect(deriveProductSemantic(product!).family).toMatch(/megztin/iu)

    expect(resolveProductAssets(slug)?.url).toBe(product?.images[0])
    const visuals = resolveProductVisuals(slug)
    expect(visuals.length).toBeGreaterThan(0)
    expect(visuals.every((visual) => product?.images.includes(visual.src))).toBe(true)
  })

  it('keeps unavailable product themes visible for preview but out of automatic batches', () => {
    runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, () => {
      const all = getUgcThemesForCategory('Prekės')
      const picked = pickBatchUgcThemes(500, 'Prekės', { testMode: true })
      expect(picked.ok).toBe(true)
      const catalog = loadKaleduCatalog()
      for (const { slug } of apparel) {
        expect(all.some((theme) => theme.productHints?.includes(slug))).toBe(true)
        // Stock comes from the live store catalog, so only assert exclusion while out of stock.
        if (catalog.find((row) => row.slug === slug)?.inStock === false) {
          expect(picked.themes?.some((theme) => theme.productHints?.includes(slug))).toBe(false)
        }
      }
    })
  })
})
