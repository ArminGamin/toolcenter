import fs from 'node:fs'
import path from 'node:path'
import { CHRISTMAS_PRODUCTS_DIR } from './profile-brand.js'
import { loadKaleduCatalog, type KaleduCatalogProduct } from './ugc-kaledu-catalog.js'

export type ProductVisualRole = 'hero' | 'lifestyle' | 'angle' | 'detail' | 'closeup' | 'unknown'

export type ProductVisual = {
  src: string
  productId: string
  variantId: string
  role: ProductVisualRole
  priority: number
  usable: boolean
}

export type ProductVisualCause =
  | 'product_id_missing'
  | 'product_not_found'
  | 'visual_ready_false'
  | 'image_src_missing'
  | 'image_load_failed'
  | 'layout_skipped_product'
  | 'product_bounds_invalid'
  | 'renderer_did_not_draw_product'

export type ProductVisualCheck = {
  expected: boolean
  rendered: boolean
  productId: string
  reason?: 'product_visual_missing'
  cause?: ProductVisualCause
  bounds?: { w: number; h: number } | null
}

const PRODUCT_SLIDE_ROLES = new Set(['product', 'solution', 'build'])

/** Product image is required only when the catalog says the selected product can be shown. */
export function checkProductVisual(input: {
  slideRole?: string
  productId?: string
  visualReady?: boolean
  productFound?: boolean
  imageSrc?: string | null
  rendered?: boolean
  bounds?: { w: number; h: number } | null
  copyProductId?: string
  visualProductId?: string
  imageLoadFailed?: boolean
  layoutSkipped?: boolean
}): ProductVisualCheck {
  const productId = String(input.productId || input.copyProductId || '').trim()
  const role = String(input.slideRole || '')
  const productSlide = !role || PRODUCT_SLIDE_ROLES.has(role)
  const expected = Boolean(productSlide && productId && input.visualReady === true)
  const base = { expected, rendered: false, productId, bounds: input.bounds }
  if (!expected) {
    return { ...base, rendered: Boolean(input.rendered), cause: input.visualReady === false ? 'visual_ready_false' : undefined }
  }
  if (input.productFound === false) return { ...base, reason: 'product_visual_missing', cause: 'product_not_found' }
  if (input.imageLoadFailed) return { ...base, reason: 'product_visual_missing', cause: 'image_load_failed' }
  if (!String(input.imageSrc || '').trim()) return { ...base, reason: 'product_visual_missing', cause: 'image_src_missing' }
  if (input.copyProductId && input.visualProductId && input.copyProductId !== input.visualProductId) {
    return { ...base, reason: 'product_visual_missing', cause: 'renderer_did_not_draw_product' }
  }
  if (input.layoutSkipped) return { ...base, reason: 'product_visual_missing', cause: 'layout_skipped_product' }
  if (input.bounds && (input.bounds.w <= 0 || input.bounds.h <= 0)) {
    return { ...base, reason: 'product_visual_missing', cause: 'product_bounds_invalid' }
  }
  if (input.rendered === false) return { ...base, reason: 'product_visual_missing', cause: 'renderer_did_not_draw_product' }
  return { ...base, rendered: true }
}

export type ProductVisualPick = {
  visual: ProductVisual | null
  reused: boolean
  occurrence: number
  eligibleCount: number
  availableVariantCount: number
  unusedVariantCount: number
  selectionReason: string
}

type LedgerRow = { usedVariantIds: Set<string>; usageOrder: string[]; occurrenceCount: number }

const IMAGE_EXT = /\.(?:webp|png|jpe?g)$/iu
const ROLE_FILE = /__(hero|lifestyle|angle|detail|closeup)(?:__|\.)/iu

function hashSeed(input: string): number {
  let hash = 2166136261
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function normalizeProductImages(images: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of images) {
    const src = String(raw || '').trim()
    if (!src) continue
    const key = src.replace(/\\/g, '/').toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(src)
  }
  return out
}

function variantIdFromSrc(src: string, productId: string): string {
  const base = path.basename(src).replace(IMAGE_EXT, '')
  return base || productId
}

function roleFromSrc(src: string): ProductVisualRole {
  const match = path.basename(src).match(ROLE_FILE)
  const role = match?.[1]?.toLowerCase()
  if (role === 'hero' || role === 'lifestyle' || role === 'angle' || role === 'detail' || role === 'closeup') return role
  return 'unknown'
}

export function visualsFromImages(
  productId: string,
  images: string[],
  usable: (src: string) => boolean = () => true,
): ProductVisual[] {
  return normalizeProductImages(images).map((src, index) => ({
    src,
    productId,
    variantId: variantIdFromSrc(src, productId),
    role: roleFromSrc(src),
    priority: index,
    usable: usable(src),
  }))
}

function fileUsable(abs: string): boolean {
  try {
    if (!fs.existsSync(abs)) return false
    const stat = fs.statSync(abs)
    return stat.isFile() && stat.size > 0 && IMAGE_EXT.test(abs)
  } catch {
    return false
  }
}

function absFromSrc(src: string): string {
  return path.join(CHRISTMAS_PRODUCTS_DIR, path.basename(src))
}

/** JK-001 owns JK-001__02.webp and /JK-001/02.webp. It does not own JK-010__02.webp. */
export function skuOwnsFilename(ownerId: string, filename: string): boolean {
  const id = String(ownerId || '').trim().toLowerCase()
  const normalized = String(filename || '').replace(/\\/g, '/').toLowerCase()
  const name = path.basename(normalized)
  if (!id || !name) return false
  if (name.startsWith(`${id}__`)) return true
  return normalized.split('/').includes(id)
}

/** Catalog images first. Discovered files only append variants the catalog did not name. */
export function discoverProductImages(product: KaleduCatalogProduct): string[] {
  const declared = normalizeProductImages(product.images || [])
  const keys = new Set(declared.map((src) => path.basename(src).toLowerCase()))
  const owners = [product.sku, product.slug].filter(Boolean)
  let extra: string[] = []
  try {
    if (fs.existsSync(CHRISTMAS_PRODUCTS_DIR)) {
      extra = fs.readdirSync(CHRISTMAS_PRODUCTS_DIR).filter((name) => {
        if (!IMAGE_EXT.test(name) || keys.has(name.toLowerCase())) return false
        return owners.some((owner) => skuOwnsFilename(owner, name))
      })
    }
  } catch {
    extra = []
  }
  return [...declared, ...extra.map((name) => `/products/${name}`)]
}

export function resolveProductVisuals(productId: string): ProductVisual[] {
  const id = String(productId || '').trim()
  const product = loadKaleduCatalog().find((row) => row.slug === id || row.productId === id || row.sku === id)
  if (!product) return []
  return visualsFromImages(id, discoverProductImages(product), (src) => fileUsable(absFromSrc(src))).filter(
    (visual) => visual.usable && visual.productId === id,
  )
}

/** Final render gate. Filename parsing is not consulted. */
export function slideVisualMatchesProduct(
  slide: { productId?: string },
  visual: { productId: string } | null,
): boolean {
  if (!slide.productId || !visual) return false
  return visual.productId === slide.productId
}

export function createVisualLedger(): Map<string, LedgerRow> {
  return new Map()
}

function ledgerRow(ledger: Map<string, LedgerRow>, productId: string): LedgerRow {
  let row = ledger.get(productId)
  if (!row) {
    row = { usedVariantIds: new Set(), usageOrder: [], occurrenceCount: 0 }
    ledger.set(productId, row)
  }
  return row
}

function prefer(pool: ProductVisual[], roles: ProductVisualRole[]): ProductVisual[] {
  const matched = pool.filter((visual) => roles.includes(visual.role))
  return matched.length ? matched : pool
}

export function pickProductVisual(opts: {
  productId: string
  variants: ProductVisual[]
  postSeed: string
  ledger: Map<string, LedgerRow>
}): ProductVisualPick {
  const usable = opts.variants.filter((visual) => visual.usable && visual.productId === opts.productId)
  const unique = new Map<string, ProductVisual>()
  for (const visual of usable) {
    if (!unique.has(visual.variantId)) unique.set(visual.variantId, visual)
  }
  const variants = [...unique.values()]
  const row = ledgerRow(opts.ledger, opts.productId)
  const occurrence = row.occurrenceCount + 1
  if (!variants.length) {
    return {
      visual: null,
      reused: false,
      occurrence,
      eligibleCount: 0,
      availableVariantCount: 0,
      unusedVariantCount: 0,
      selectionReason: 'product_visual_unavailable',
    }
  }
  const unused = variants.filter((visual) => !row.usedVariantIds.has(visual.variantId))
  const reused = unused.length === 0
  let pool = unused.length ? unused : variants
  if (!reused && occurrence === 1) pool = prefer(pool, ['hero', 'lifestyle'])
  if (!reused && occurrence > 1) pool = prefer(pool, ['angle', 'detail', 'closeup', 'unknown'])
  let visual: ProductVisual
  let selectionReason = reused ? 'least_recent_reuse' : occurrence === 1 ? 'first_occurrence' : 'unused_alternate'
  if (reused) {
    visual = [...pool].sort((a, b) => {
      const ai = row.usageOrder.lastIndexOf(a.variantId)
      const bi = row.usageOrder.lastIndexOf(b.variantId)
      return ai - bi
    })[0]
  } else {
    const index = hashSeed(`${opts.postSeed}|${opts.productId}|${occurrence}`) % pool.length
    visual = pool[index]
  }
  row.usedVariantIds.add(visual.variantId)
  row.usageOrder.push(visual.variantId)
  row.occurrenceCount = occurrence
  return {
    visual,
    reused,
    occurrence,
    eligibleCount: pool.length,
    availableVariantCount: variants.length,
    unusedVariantCount: unused.length,
    selectionReason,
  }
}

export function assignSlideVisuals<T extends { productId?: string; productVariantId?: string; productImageSrc?: string }>(
  slides: T[],
  opts: { postSeed: string; visualsFor: (productId: string) => ProductVisual[]; quiet?: boolean },
): { slides: T[]; picks: ProductVisualPick[]; avoidableVisualRepeats: number; unavoidableVisualRepeats: number } {
  const ledger = createVisualLedger()
  const picks: ProductVisualPick[] = []
  const grouped = new Map<string, string[]>()
  const available = new Map<string, number>()
  const next = slides.map((slide, index) => {
    if (!slide.productId) {
      return { ...slide, productVariantId: undefined, productImageSrc: undefined }
    }
    const variants = opts.visualsFor(slide.productId).filter((visual) => visual.productId === slide.productId)
    const stored = variants.find((visual) => visual.usable && visual.variantId === slide.productVariantId)
    if (stored) {
      const row = ledgerRow(ledger, slide.productId)
      row.usedVariantIds.add(stored.variantId)
      row.usageOrder.push(stored.variantId)
      row.occurrenceCount += 1
      if (!available.has(slide.productId)) available.set(slide.productId, variants.filter((visual) => visual.usable).length)
      const list = grouped.get(slide.productId) || []
      list.push(stored.variantId)
      grouped.set(slide.productId, list)
      picks.push({
        visual: stored,
        reused: false,
        occurrence: row.occurrenceCount,
        eligibleCount: 1,
        availableVariantCount: variants.filter((visual) => visual.usable).length,
        unusedVariantCount: Math.max(0, variants.filter((visual) => visual.usable).length - 1),
        selectionReason: 'stored_variant',
      })
      if (!slideVisualMatchesProduct(slide, stored)) {
        return { ...slide, productVariantId: undefined, productImageSrc: undefined }
      }
      return { ...slide, productVariantId: stored.variantId, productImageSrc: stored.src }
    }
    const pick = pickProductVisual({
      productId: slide.productId,
      variants,
      postSeed: opts.postSeed,
      ledger,
    })
    picks.push(pick)
    if (!available.has(slide.productId)) available.set(slide.productId, pick.availableVariantCount)
    if (pick.visual) {
      const list = grouped.get(slide.productId) || []
      list.push(pick.visual.variantId)
      grouped.set(slide.productId, list)
    }
    if (!opts.quiet && pick.visual) {
      console.log(
        `[Visual] slide=${index + 1} product=${slide.productId} occurrence=${pick.occurrence} variant=${pick.visual.variantId} available=${pick.availableVariantCount} unused=${pick.unusedVariantCount} reused=${pick.reused}`,
      )
    }
    if (!pick.visual || !slideVisualMatchesProduct(slide, pick.visual)) {
      return { ...slide, productVariantId: undefined, productImageSrc: undefined }
    }
    return { ...slide, productVariantId: pick.visual.variantId, productImageSrc: pick.visual.src }
  })
  let avoidableVisualRepeats = 0
  let unavoidableVisualRepeats = 0
  for (const [productId, sequence] of grouped) {
    const verdict = visualRepeatVerdict(sequence, available.get(productId) || sequence.length)
    if (verdict === 'avoidable') avoidableVisualRepeats += 1
    if (verdict === 'unavoidable') unavoidableVisualRepeats += 1
  }
  return { slides: next, picks, avoidableVisualRepeats, unavoidableVisualRepeats }
}

export function visualRepeatVerdict(sequence: string[], available: number): 'ok' | 'avoidable' | 'unavoidable' {
  const unique = new Set(sequence)
  if (unique.size === sequence.length) return 'ok'
  if (available <= 1) return 'unavoidable'
  if (unique.size < Math.min(available, sequence.length)) return 'avoidable'
  return 'unavoidable'
}
