import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { KaleduCatalogProduct } from '../ugc-kaledu-catalog.js'
import {
  deriveProductSemantic,
  ensureKaleduProductIndexFresh,
  fingerprintCatalog,
  rankCatalogProducts,
  SEMANTIC_VERSION,
} from '../ugc-kaledu-product-index.js'

function heater(overrides: Partial<KaleduCatalogProduct> = {}): KaleduCatalogProduct {
  return {
    productId: 'elektrinis-puodelio-sildytuvas',
    slug: 'elektrinis-puodelio-sildytuvas',
    sku: 'JK-999',
    name: 'Elektrinis puodelio šildytuvas',
    tagline: 'Šildo puodelį ant darbo stalo, kol geri kavą ar arbatą.',
    priceCents: 1990,
    recipients: ['kolegai'],
    vibes: ['praktiskas'],
    benefits: ['Palaiko puodelį šiltą darbo metu'],
    images: ['/products/sildytuvas.png'],
    inStock: true,
    ...overrides,
  }
}

function cachePath(name: string): string {
  return path.join(os.tmpdir(), `ugc-index-${name}-${Date.now()}.json`)
}

describe('Kalėdų product index', () => {
  it('discovers a new product and can rank it without a SKU branch', async () => {
    const file = cachePath('add')
    const product = heater()
    const first = await ensureKaleduProductIndexFresh({
      products: [product],
      cacheFile: file,
      imageExists: () => true,
      quiet: true,
    })
    const row = first.items.find((item) => item.semantic.productId === 'JK-999')
    expect(row?.semantic.family).toBe('šildytuvas')
    expect(row?.semanticReady).toBe(true)
    expect(row?.visualReady).toBe(true)
    expect(row?.semantic.useCases.join(' ')).toMatch(/kavą|darbo/iu)
    expect(row?.semantic.sceneTags).toEqual(expect.arrayContaining(['coffee', 'work']))
    const ranked = rankCatalogProducts('Elektrinis puodelio šildytuvas ant darbo stalo', [product])
    expect(ranked[0]?.product.sku).toBe('JK-999')
    expect(ranked[0]?.score).toBeGreaterThanOrEqual(50)
    fs.rmSync(file, { force: true })
  })

  it('updates price without reclassifying semantics', async () => {
    const file = cachePath('price')
    const imageExists = () => true
    const first = await ensureKaleduProductIndexFresh({ products: [heater()], cacheFile: file, imageExists, quiet: true })
    const family = first.items[0]?.semantic.family
    const next = heater({ priceCents: 2490 })
    const refreshed = await ensureKaleduProductIndexFresh({ products: [next], cacheFile: file, imageExists, quiet: true })
    expect(refreshed.stats.changed).toBe(1)
    expect(refreshed.stats.enriched).toBe(0)
    expect(refreshed.items[0]?.semantic.price).toBe(2490)
    expect(refreshed.items[0]?.semantic.family).toBe(family)
    fs.rmSync(file, { force: true })
  })

  it('reclassifies a rename, a description change, and an image change separately', async () => {
    const file = cachePath('deltas')
    const imageExists = (product: KaleduCatalogProduct) => product.images[0]?.includes('sildytuvas') === true
    await ensureKaleduProductIndexFresh({ products: [heater()], cacheFile: file, imageExists, quiet: true })
    const renamed = await ensureKaleduProductIndexFresh({
      products: [heater({ name: 'Kelioninis termosas' })],
      cacheFile: file,
      imageExists,
      quiet: true,
    })
    expect(renamed.stats.enriched).toBe(1)
    expect(renamed.items[0]?.semantic.family).toBe('termosas')
    const described = await ensureKaleduProductIndexFresh({
      products: [heater({ name: 'Kelioninis termosas', tagline: 'Naujas aprašymas apie arbatą kelionėje.' })],
      cacheFile: file,
      imageExists,
      quiet: true,
    })
    expect(described.stats.enriched).toBe(1)
    expect(described.items[0]?.semantic.useCases.join(' ')).toMatch(/arbatą/iu)
    const image = await ensureKaleduProductIndexFresh({
      products: [heater({ name: 'Kelioninis termosas', tagline: 'Naujas aprašymas apie arbatą kelionėje.', images: ['/products/missing.png'] })],
      cacheFile: file,
      imageExists,
      quiet: true,
    })
    expect(image.stats.enriched).toBe(0)
    expect(image.items[0]?.visualReady).toBe(false)
    expect(image.items[0]?.semantic.family).toBe('termosas')
    fs.rmSync(file, { force: true })
  })

  it('treats a reused SKU with new content as a new product meaning', async () => {
    const file = cachePath('reuse')
    const imageExists = () => true
    await ensureKaleduProductIndexFresh({ products: [heater()], cacheFile: file, imageExists, quiet: true })
    const reused = await ensureKaleduProductIndexFresh({
      products: [heater({ name: 'Vilnonis pledas', slug: 'vilnonis-pledas', tagline: 'Šiltas pledas vakarui.' })],
      cacheFile: file,
      imageExists,
      quiet: true,
    })
    expect(reused.stats.enriched).toBe(1)
    expect(reused.items[0]?.semantic.family).toBe('pledas')
    expect(reused.items[0]?.semantic.family).not.toBe('šildytuvas')
    fs.rmSync(file, { force: true })
  })

  it('reads a vague name from the description and keeps explicit family over the name', () => {
    const vague = deriveProductSemantic(
      heater({
        name: 'Dovana namams',
        tagline: 'Elektrinis šildytuvas kavai ant darbo stalo.',
        vibes: [],
        benefits: [],
      }),
    )
    expect(vague.family).toBe('šildytuvas')
    expect(vague.sceneTags).toEqual(expect.arrayContaining(['coffee', 'work']))
    const contradicted = deriveProductSemantic(
      heater({
        name: 'Termosas „Kelionė“',
        ugcFamily: 'puodelis',
        ugcUseCases: ['kelionė'],
        vibes: [],
        benefits: [],
        tagline: 'Termosas kelionėms.',
      }),
    )
    expect(contradicted.family).toBe('puodelis')
    expect(contradicted.confidence).toBe('catalog')
    expect(contradicted.useCases).toEqual(['kelionė'])
  })

  it('rebuilds semantics when the enrichment version changes', async () => {
    const file = cachePath('version')
    const imageExists = () => true
    await ensureKaleduProductIndexFresh({ products: [heater()], cacheFile: file, imageExists, quiet: true })
    const cached = JSON.parse(fs.readFileSync(file, 'utf8')) as { semanticVersion: number }
    cached.semanticVersion = SEMANTIC_VERSION - 1
    fs.writeFileSync(file, JSON.stringify(cached))
    const refreshed = await ensureKaleduProductIndexFresh({ products: [heater()], cacheFile: file, imageExists, quiet: true })
    expect(refreshed.stats.enriched).toBe(1)
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).semanticVersion).toBe(SEMANTIC_VERSION)
    fs.rmSync(file, { force: true })
  })

  it('drops a removed product from the index', async () => {
    const file = cachePath('delete')
    const imageExists = () => true
    await ensureKaleduProductIndexFresh({ products: [heater()], cacheFile: file, imageExists, quiet: true })
    const removed = await ensureKaleduProductIndexFresh({ products: [], cacheFile: file, imageExists, quiet: true })
    expect(removed.stats.removed).toBe(1)
    expect(removed.items.map((item) => item.semantic.productId)).not.toContain('JK-999')
    expect(rankCatalogProducts('šildytuvas', []).map((row) => row.product.sku)).not.toContain('JK-999')
    fs.rmSync(file, { force: true })
  })

  it('keeps a product without an image out of visual routing', async () => {
    const file = cachePath('image')
    const indexed = await ensureKaleduProductIndexFresh({
      products: [heater()],
      cacheFile: file,
      imageExists: () => false,
      quiet: true,
    })
    const row = indexed.items[0]
    expect(row?.semanticReady).toBe(true)
    expect(row?.visualReady).toBe(false)
    expect(row?.ingestIssues).toContain('product_ingest_missing_image')
    fs.rmSync(file, { force: true })
  })

  it('does not let a family booster override catalog vibes', () => {
    const semantic = deriveProductSemantic(
      heater({
        name: 'Termosas „Kelionė“',
        sku: 'JK-011',
        slug: 'termosas-kelione',
        vibes: ['praktiskas'],
        benefits: ['Karšta arbata kelionėje'],
        tagline: 'Termosas kelionėms.',
      }),
    )
    expect(semantic.family).toBe('termosas')
    expect(semantic.sceneTags).not.toContain('cozy')
    expect(semantic.benefits.join(' ')).not.toMatch(/6 valand/)
  })
})
