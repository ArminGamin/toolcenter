import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { profileDataPath } from './business-profiles.js'
import { CHRISTMAS_PRODUCTS_DIR, getProfileBrand } from './profile-brand.js'
import {
  loadKaleduCatalog,
  productTypePhrase,
  type KaleduCatalogProduct,
} from './ugc-kaledu-catalog.js'

export const SEMANTIC_VERSION = 3

export type ProductSemanticConfidence = 'catalog' | 'derived' | 'model' | 'fallback'

export type ProductSemantic = {
  productId: string
  slug: string
  family: string
  naturalSubject: string
  recipientHints: string[]
  useCases: string[]
  benefits: string[]
  intentKeywords: string[]
  sceneTags: string[]
  giftTags: string[]
  price: number
  confidence: ProductSemanticConfidence
}

export type IndexedKaleduProduct = {
  product: KaleduCatalogProduct
  semantic: ProductSemantic
  productFingerprint: string
  semanticReady: boolean
  visualReady: boolean
  ingestIssues: string[]
}

export type ProductIndexStats = {
  catalog: number
  unchanged: number
  added: number
  changed: number
  removed: number
  enriched: number
  visualReady: number
  semanticReady: number
  cache: 'HIT' | 'MISS'
  durationMs: number
}

type CacheEntry = {
  catalogFingerprint: string
  semanticFingerprint: string
  semantic: ProductSemantic
}

type CacheFile = {
  semanticVersion: number
  catalogFingerprint: string
  generatedAt: string
  products: Record<string, CacheEntry>
}

const FAMILY_BOOSTERS: Array<{
  stem: RegExp
  useCases: string[]
  sceneTags: string[]
  intentKeywords: string[]
}> = [
  { stem: /žvak/iu, useCases: ['jaukus vakaras'], sceneTags: ['cozy', 'evening'], intentKeywords: ['žvakė', 'kvapas'] },
  { stem: /pled/iu, useCases: ['jaukus vakaras'], sceneTags: ['cozy'], intentKeywords: ['pledą'] },
  { stem: /termos/iu, useCases: ['kelionė', 'šiltas gėrimas'], sceneTags: ['travel'], intentKeywords: ['termosas'] },
  { stem: /puodel/iu, useCases: ['ryto kava', 'karšta kakava'], sceneTags: ['morning', 'coffee'], intentKeywords: ['puodelis', 'kava'] },
  { stem: /difuzor/iu, useCases: ['kvapas namams'], sceneTags: ['cozy'], intentKeywords: ['difuzorius'] },
  { stem: /projektor/iu, useCases: ['namų kinas'], sceneTags: ['evening'], intentKeywords: ['projektorius'] },
  { stem: /megztin/iu, useCases: ['kasdienė šiluma'], sceneTags: ['cozy', 'wear'], intentKeywords: ['megztinis', 'vilna'] },
  { stem: /džemper|dzemper/iu, useCases: ['kasdienė šiluma'], sceneTags: ['cozy', 'wear'], intentKeywords: ['džemperis', 'gobtuvas'] },
  { stem: /kardigan/iu, useCases: ['kasdienė šiluma'], sceneTags: ['cozy', 'wear'], intentKeywords: ['kardiganas'] },
  { stem: /pižam/iu, useCases: ['naktis namie'], sceneTags: ['evening', 'wear'], intentKeywords: ['pižama'] },
  { stem: /golf/iu, useCases: ['sluoksnis po megztiniu'], sceneTags: ['wear'], intentKeywords: ['golfas'] },
]

const SCENE_RULES: Array<{ re: RegExp; tag: string }> = [
  { re: /kav|kakav/iu, tag: 'coffee' },
  { re: /ryt/iu, tag: 'morning' },
  { re: /jauk|vakar/iu, tag: 'cozy' },
  { re: /kelion|kely/iu, tag: 'travel' },
  { re: /darb|stal/iu, tag: 'work' },
  { re: /arbat/iu, tag: 'tea' },
]

let memory: { fingerprint: string; items: IndexedKaleduProduct[]; at: number } | null = null
let watchStarted = false
let dirty = false
let watchTimer: NodeJS.Timeout | null = null

function cacheFilePath(override?: string): string {
  return override || path.join(process.cwd(), '.cache', 'ugc-kaledu-product-semantics.json')
}

function stable(value: unknown): string {
  return JSON.stringify(value)
}

function semanticFields(product: KaleduCatalogProduct) {
  return {
    slug: product.slug,
    name: product.name,
    description: product.tagline,
    category: product.ugcFamily || '',
    recipients: product.recipients,
    vibes: product.vibes,
    benefits: product.benefits || [],
    ugcUseCases: product.ugcUseCases || [],
  }
}

/** Fields that change family, use cases, or scene tags. Price and images are excluded. */
export function semanticFingerprint(product: KaleduCatalogProduct): string {
  return crypto.createHash('sha256').update(stable(semanticFields(product))).digest('hex')
}

/** Full catalog identity, including price and images. */
export function fingerprintProduct(product: KaleduCatalogProduct): string {
  return crypto
    .createHash('sha256')
    .update(
      stable({
        ...semanticFields(product),
        id: product.sku || product.productId,
        price: product.priceCents,
        images: product.images,
      }),
    )
    .digest('hex')
}

export function fingerprintCatalog(products: KaleduCatalogProduct[]): string {
  const rows = [...products]
    .map((product) => fingerprintProduct(product))
    .sort()
  return crypto.createHash('sha256').update(rows.join('\n')).digest('hex')
}

function tokens(text: string): string[] {
  return [
    ...new Set(
      text
        .toLocaleLowerCase('lt-LT')
        .split(/[^\p{L}0-9]+/u)
        .filter((word) => word.length >= 4),
    ),
  ]
}

function sceneTagsFrom(text: string): string[] {
  return SCENE_RULES.filter((rule) => rule.re.test(text)).map((rule) => rule.tag)
}

const GENERIC_FAMILY = /^(?:dovana|dovanos|namams|namų|rinkinys|kalėdinis|kalėdinė|kalėdų)$/iu

function familyFromDescription(phrase: string): string {
  const words = phrase
    .toLocaleLowerCase('lt-LT')
    .split(/[^\p{L}0-9]+/u)
    .filter((word) => word.length >= 6 && !GENERIC_FAMILY.test(word) && !/^elektrin/iu.test(word))
  return words[0] || ''
}

function familyFromPhrase(phrase: string): string {
  const words = phrase
    .toLocaleLowerCase('lt-LT')
    .split(/[^\p{L}0-9]+/u)
    .filter((word) => word.length > 2 && !GENERIC_FAMILY.test(word))
  return words[words.length - 1] || ''
}

function fillGaps(target: string[], extras: string[], limit: number): string[] {
  const out = [...target]
  for (const extra of extras) {
    if (out.length >= limit) break
    if (!out.some((item) => item.toLocaleLowerCase('lt-LT') === extra.toLocaleLowerCase('lt-LT'))) out.push(extra)
  }
  return out.slice(0, limit)
}

/**
 * explicit catalog metadata
 * → normalized vibes / benefits
 * → name + description
 * → family gap fillers
 * → generic fallback
 * Gap fillers never replace a field that already has a value.
 */
export function deriveProductSemantic(product: KaleduCatalogProduct): ProductSemantic {
  const phrase = productTypePhrase(product)
  const explicitFamily = product.ugcFamily?.trim()
  const namedFamily = familyFromPhrase(phrase)
  const describedFamily = familyFromDescription(product.tagline)
  const family = explicitFamily || namedFamily || describedFamily || 'dovana'
  const explicitUses = [...(product.ugcUseCases || [])]
  const describedUse = product.tagline ? [product.tagline.replace(/[!?.]+$/u, '').trim()] : []
  let useCases = explicitUses.length ? explicitUses : describedUse
  const booster = FAMILY_BOOSTERS.find((row) => row.stem.test(family))
  if (booster && !explicitUses.length) useCases = fillGaps(useCases, booster.useCases, 4)
  if (!useCases.length) useCases = ['tinka dovanai']
  const metaScenes = sceneTagsFrom([...product.vibes, ...(product.benefits || []), ...explicitUses].join(' '))
  const textScenes = sceneTagsFrom(`${phrase} ${product.tagline} ${product.slug.replace(/-/g, ' ')}`)
  let sceneTags = fillGaps(metaScenes, textScenes, 4)
  if (booster && !product.vibes.length && !explicitUses.length) sceneTags = fillGaps(sceneTags, booster.sceneTags, 4)
  const intentKeywords = fillGaps(
    tokens(`${explicitFamily || phrase} ${product.slug}`),
    explicitFamily || explicitUses.length ? [] : booster?.intentKeywords || [],
    12,
  )
  const benefits = (product.benefits || []).map((item) => item.trim()).filter(Boolean).slice(0, 4)
  const confidence: ProductSemanticConfidence =
    explicitFamily || explicitUses.length ? 'catalog' : family === 'dovana' ? 'fallback' : 'derived'
  return {
    productId: product.sku || product.slug,
    slug: product.slug,
    family,
    naturalSubject: family.toLocaleLowerCase('lt-LT'),
    recipientHints: product.recipients.slice(0, 6),
    useCases: useCases.slice(0, 4),
    benefits,
    intentKeywords,
    sceneTags: sceneTags.slice(0, 4),
    giftTags: product.vibes.slice(0, 4),
    price: product.priceCents,
    confidence,
  }
}

export function defaultImageExists(product: KaleduCatalogProduct): boolean {
  const rel = product.images[0] || ''
  if (!rel) return false
  return fs.existsSync(path.join(CHRISTMAS_PRODUCTS_DIR, path.basename(rel)))
}

export function productVisualReady(
  product: KaleduCatalogProduct,
  imageExists: (product: KaleduCatalogProduct) => boolean,
): boolean {
  const image = product.images.find((item) => item.trim())
  return Boolean(image && imageExists(product))
}

function ingest(product: KaleduCatalogProduct, imageExists: (product: KaleduCatalogProduct) => boolean): IndexedKaleduProduct {
  const issues: string[] = []
  if (!product.slug || !product.sku) issues.push('missing_id')
  if (!product.name.trim()) issues.push('missing_name')
  if (!(product.priceCents > 0)) issues.push('missing_price')
  const visualReady = productVisualReady(product, imageExists)
  if (!visualReady) issues.push('product_ingest_missing_image')
  const semantic = deriveProductSemantic(product)
  return {
    product,
    semantic,
    productFingerprint: fingerprintProduct(product),
    semanticReady: Boolean(semantic.family && semantic.naturalSubject),
    visualReady,
    ingestIssues: issues,
  }
}

function withLivePrice(semantic: ProductSemantic, product: KaleduCatalogProduct): ProductSemantic {
  return { ...semantic, price: product.priceCents, productId: product.sku || product.slug, slug: product.slug }
}

function readCache(file: string): CacheFile | null {
  try {
    if (!fs.existsSync(file)) return null
    return JSON.parse(fs.readFileSync(file, 'utf8')) as CacheFile
  } catch {
    return null
  }
}

function writeCache(file: string, data: CacheFile): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

export function rankCatalogProducts(
  blob: string,
  products: KaleduCatalogProduct[],
): Array<{ product: KaleduCatalogProduct; score: number; semantic: ProductSemantic }> {
  const theme = blob.toLocaleLowerCase('lt-LT')
  return products
    .map((product) => {
      const semantic = deriveProductSemantic(product)
      let score = 0
      const family = semantic.family.toLocaleLowerCase('lt-LT')
      if (family.length >= 4 && theme.includes(family)) score += 50
      for (const word of semantic.intentKeywords) {
        if (word.length >= 4 && theme.includes(word.toLocaleLowerCase('lt-LT'))) score += 8
      }
      for (const use of semantic.useCases) {
        const key = use.toLocaleLowerCase('lt-LT')
        if (key.length >= 4 && theme.includes(key)) score += 6
      }
      for (const tag of semantic.sceneTags) {
        if (tag === 'coffee' && /kav|kakav/iu.test(theme)) score += 2
        if (tag === 'cozy' && /jauk/iu.test(theme)) score += 2
      }
      return { product, score, semantic }
    })
    .filter((row) => row.score >= 40)
    .sort((a, b) => b.score - a.score)
}

export type RefreshIndexOpts = {
  products?: KaleduCatalogProduct[]
  cacheFile?: string
  imageExists?: (product: KaleduCatalogProduct) => boolean
  quiet?: boolean
}

export async function ensureKaleduProductIndexFresh(opts: RefreshIndexOpts = {}): Promise<{
  items: IndexedKaleduProduct[]
  stats: ProductIndexStats
}> {
  const started = Date.now()
  const products = opts.products || loadKaleduCatalog()
  const file = cacheFilePath(opts.cacheFile)
  const imageExists = opts.imageExists || defaultImageExists
  const fingerprint = fingerprintCatalog(products)
  const cached = readCache(file)
  const versionOk = cached?.semanticVersion === SEMANTIC_VERSION
  if (!dirty && versionOk && cached && cached.catalogFingerprint === fingerprint) {
    const items = products.map((product) => {
      const key = product.sku || product.slug
      const hit = cached.products[key]
      const row = ingest(product, imageExists)
      if (hit && hit.semanticFingerprint === semanticFingerprint(product)) row.semantic = withLivePrice(hit.semantic, product)
      return row
    })
    const stats: ProductIndexStats = {
      catalog: products.length,
      unchanged: products.length,
      added: 0,
      changed: 0,
      removed: 0,
      enriched: 0,
      visualReady: items.filter((row) => row.visualReady).length,
      semanticReady: items.filter((row) => row.semanticReady).length,
      cache: 'HIT',
      durationMs: Date.now() - started,
    }
    memory = { fingerprint, items, at: Date.now() }
    if (!opts.quiet) console.log(`[ProductIndex] catalog=${stats.catalog} cache=HIT duration=${stats.durationMs}ms`)
    return { items, stats }
  }
  const previous = versionOk && cached ? cached.products : {}
  const seen = new Set<string>()
  let added = 0
  let changed = 0
  let unchanged = 0
  let enriched = 0
  const nextProducts: CacheFile['products'] = {}
  const items = products.map((product) => {
    const key = product.sku || product.slug
    seen.add(key)
    const row = ingest(product, imageExists)
    const semanticFp = semanticFingerprint(product)
    const prev = previous[key]
    if (prev && prev.semanticFingerprint === semanticFp && prev.catalogFingerprint === row.productFingerprint) {
      unchanged += 1
      row.semantic = withLivePrice(prev.semantic, product)
    } else if (prev && prev.semanticFingerprint === semanticFp) {
      changed += 1
      row.semantic = withLivePrice(prev.semantic, product)
    } else if (prev) {
      changed += 1
      enriched += 1
    } else {
      added += 1
      enriched += 1
    }
    nextProducts[key] = {
      catalogFingerprint: row.productFingerprint,
      semanticFingerprint: semanticFp,
      semantic: row.semantic,
    }
    return row
  })
  const removed = Object.keys(previous).filter((key) => !seen.has(key)).length
  writeCache(file, {
    semanticVersion: SEMANTIC_VERSION,
    catalogFingerprint: fingerprint,
    generatedAt: new Date().toISOString(),
    products: nextProducts,
  })
  dirty = false
  const stats: ProductIndexStats = {
    catalog: products.length,
    unchanged,
    added,
    changed,
    removed,
    enriched,
    visualReady: items.filter((row) => row.visualReady).length,
    semanticReady: items.filter((row) => row.semanticReady).length,
    cache: 'MISS',
    durationMs: Date.now() - started,
  }
  memory = { fingerprint, items, at: Date.now() }
  if (!opts.quiet) {
    console.log(
      `[ProductIndex] catalog=${stats.catalog} unchanged=${stats.unchanged} added=${stats.added} changed=${stats.changed} removed=${stats.removed} enriched=${stats.enriched} visualReady=${stats.visualReady} semanticReady=${stats.semanticReady} duration=${stats.durationMs}ms`,
    )
  }
  return { items, stats }
}

export function getKaleduProductIndex(): IndexedKaleduProduct[] {
  return memory?.items || []
}

export function watchKaleduCatalog(): void {
  if (watchStarted || process.env.VITEST) return
  const file = getProfileBrand('christmas-gifts').productCatalogFile
  if (!file || !fs.existsSync(file)) return
  watchStarted = true
  fs.watch(file, () => {
    if (watchTimer) clearTimeout(watchTimer)
    watchTimer = setTimeout(() => {
      dirty = true
    }, 500)
  })
}

export function kaleduIndexCachePath(): string {
  return profileDataPath('ugc-slides', 'kaledu-product-semantics.json')
}
