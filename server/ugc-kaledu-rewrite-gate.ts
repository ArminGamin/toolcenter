/**
 * Shared rewrite gate and authoritative product-debt updates.
 * A candidate is committed only after this returns ok.
 */

import {
  copyNamesProduct,
  kaleduProductSlideVerdict,
  type KaleduCatalogProduct,
} from './ugc-kaledu-catalog.js'
import { findRegisterErrors, repairProductSceneContinuity } from './ugc-kaledu-final-qa.js'

export type RewriteSlide = {
  title?: string
  body?: string
  cta?: string
  role?: string
  productId?: string
}

export type RewriteIssue = { code: string; detail: string }

export type RewriteValidation = {
  ok: boolean
  errors: RewriteIssue[]
  normalizedSlide?: RewriteSlide
}

const CTA_TAIL_RE = /kaledukampelis\.com\s*🎁\s*$/iu
const TAVO_CTA_TAIL_RE = /tavoknyga\.com/i

export function validateRewrittenSlide(opts: {
  originalSlide: RewriteSlide
  candidateSlide: RewriteSlide
  theme?: string
  requiredProductIds?: string[]
  products?: KaleduCatalogProduct[]
  /** Christmas catalog mode. Default: true when products provided. */
  productTruth?: boolean
}): RewriteValidation {
  const original = opts.originalSlide
  const candidate: RewriteSlide = {
    ...original,
    title: opts.candidateSlide.title ?? original.title,
    body: opts.candidateSlide.body ?? original.body,
    cta: opts.candidateSlide.cta ?? original.cta,
    role: original.role,
    productId: original.productId,
  }
  const errors: RewriteIssue[] = []
  const productTruth = opts.productTruth !== false && Boolean(opts.products?.length || opts.requiredProductIds?.length)
  if (productTruth) {
    const scene = repairProductSceneContinuity(String(candidate.body || ''), opts.theme || '')
    candidate.body = scene.text
  }
  const text = `${candidate.title || ''} ${candidate.body || ''}`
  const register = findRegisterErrors(text)
  if (register.length) errors.push({ code: 'register_violation', detail: register[0] })
  if (opts.candidateSlide.role && opts.candidateSlide.role !== original.role) {
    errors.push({ code: 'role_changed', detail: `${original.role || ''} → ${opts.candidateSlide.role}` })
  }
  if (original.role === 'close' && original.cta) {
    const cta = String(candidate.cta || '')
    const ctaOk = productTruth ? CTA_TAIL_RE.test(cta) : TAVO_CTA_TAIL_RE.test(cta) || cta.includes('5 min')
    if (!ctaOk && productTruth) {
      errors.push({ code: 'cta_tail', detail: cta })
    }
  }
  if (!productTruth) {
    return errors.length ? { ok: false, errors } : { ok: true, errors: [], normalizedSlide: candidate }
  }
  const ownedId = String(original.productId || '')
  const required = new Set(opts.requiredProductIds || [])
  const products = opts.products || []
  const owned = products.find((product) => product.slug === ownedId || product.productId === ownedId)
  if (owned && required.has(owned.slug || owned.productId)) {
    const before = `${original.title || ''} ${original.body || ''}`
    if (copyNamesProduct(before, owned) && !copyNamesProduct(text, owned)) {
      errors.push({ code: 'required_product_dropped', detail: owned.slug || owned.productId })
    }
  }
  if (opts.candidateSlide.productId && ownedId && opts.candidateSlide.productId !== ownedId) {
    errors.push({ code: 'product_identity', detail: `${ownedId} → ${opts.candidateSlide.productId}` })
  }
  for (const product of products) {
    const id = product.slug || product.productId
    if (!copyNamesProduct(text, product)) continue
    if (owned && (id === owned.slug || id === owned.productId)) continue
    if (!copyNamesProduct(`${original.title || ''} ${original.body || ''}`, product)) {
      errors.push({ code: 'product_identity', detail: id })
      break
    }
  }
  if (/termos/iu.test(text) && /virtuv/iu.test(text) && /kelion|kelyj|kelyje/iu.test(opts.theme || '')) {
    errors.push({ code: 'product_scene_drift', detail: 'virtuvėje' })
  }
  return errors.length ? { ok: false, errors } : { ok: true, errors: [], normalizedSlide: candidate }
}

export function commitRewrittenSlide<T extends RewriteSlide>(
  original: T,
  _candidate: RewriteSlide,
  validation: RewriteValidation,
): T {
  if (!validation.ok || !validation.normalizedSlide) return original
  return {
    ...original,
    title: validation.normalizedSlide.title ?? original.title,
    body: validation.normalizedSlide.body ?? original.body,
    cta: validation.normalizedSlide.cta ?? original.cta,
    productId: original.productId,
    role: original.role,
  }
}

export function productIdOf(product: KaleduCatalogProduct): string {
  return product.slug || product.productId
}

export function slideResolvesProduct(slide: RewriteSlide, product: KaleduCatalogProduct): boolean {
  const id = productIdOf(product)
  if (slide.productId !== id && slide.productId !== product.productId && slide.productId !== product.slug) return false
  if (!copyNamesProduct(`${slide.title || ''} ${slide.body || ''}`, product)) return false
  const verdict = kaleduProductSlideVerdict({ ...slide, productId: id })
  return verdict === 'ok'
}

export function updateProductDebt(debt: string[], slides: RewriteSlide[], products: KaleduCatalogProduct[]): string[] {
  return debt.filter((id) => {
    const product = products.find((row) => productIdOf(row) === id || row.productId === id || row.slug === id)
    if (!product) return true
    return !slides.some((slide) => slideResolvesProduct(slide, product))
  })
}

export type DebtRepairTarget = { index: number; reason: string }

export function pickDebtRepairTarget(
  slides: Array<RewriteSlide & { role?: string }>,
  product: KaleduCatalogProduct,
  preferredIndex: number,
  reservedIds: string[],
): DebtRepairTarget | null {
  const owned = new Set(reservedIds.filter((id) => id !== productIdOf(product)))
  const inner = slides
    .map((slide, index) => ({ slide, index }))
    .filter(({ slide, index }) => index > 0 && index < slides.length - 1 && slide.role !== 'hook' && slide.role !== 'close')
    .filter(({ slide }) => !slide.productId || !owned.has(slide.productId))
  if (!inner.length) return null
  const related = inner.find(({ slide }) => /kelion|kelyje|kav|žvak|pled|termos/iu.test(`${slide.title || ''} ${slide.body || ''}`))
  if (related) return { index: related.index, reason: 'related_build' }
  const near = [...inner].sort((a, b) => Math.abs(a.index - preferredIndex) - Math.abs(b.index - preferredIndex))[0]
  return near ? { index: near.index, reason: 'nearest_build' } : null
}

export type ModelCallRecord = {
  callType: string
  durationMs: number
  success: boolean
  requestedSlides?: number
  parsedSlides?: number
  builtSlides?: number
  acceptedSlides?: number
  stopReason?: string
  numPredict?: number
  outputTokens?: number
}

const modelCalls: ModelCallRecord[] = []

export function resetModelCallLog(): void {
  modelCalls.splice(0, modelCalls.length)
}

export function recordModelCall(row: ModelCallRecord): void {
  modelCalls.push(row)
}

export function modelCallLog(): ModelCallRecord[] {
  return [...modelCalls]
}

export function summarizeModelCalls(rows: ModelCallRecord[] = modelCalls) {
  const count = (type: string) => rows.filter((row) => row.callType === type).length
  const finalQaJudgeCalls = count('final_qa_judge')
  const finalQaRewriteCalls = count('final_qa_rewrite')
  const finalQaRejudgeCalls = count('final_qa_rejudge')
  return {
    storyGenerationCalls: count('story_generation') + count('draft'),
    storyRepairCalls: count('story_repair'),
    productRepairCalls: count('product_debt_repair'),
    finalQaJudgeCalls,
    finalQaRewriteCalls,
    finalQaRejudgeCalls,
    captionCalls: count('caption'),
    qaCalls: finalQaJudgeCalls + finalQaRewriteCalls + finalQaRejudgeCalls,
    totalModelCalls: rows.length,
  }
}

export function normalizeStopReason(raw: string): 'length' | 'eos' | 'stop' | 'timeout' | 'parse_error' | 'unknown' {
  const text = raw.toLowerCase()
  if (/timeout|aborted/.test(text)) return 'timeout'
  if (/truncat|length|parse failed/.test(text)) return 'length'
  if (/parse|json/.test(text)) return 'parse_error'
  if (/eos/.test(text)) return 'eos'
  if (/stop/.test(text)) return 'stop'
  return 'unknown'
}

export function chunkResultTelemetry(opts: {
  requested: number
  parsed: number
  built: number
  durationMs: number
  numPredict: number
  truncated: boolean
}): ModelCallRecord {
  return {
    callType: 'story_generation',
    durationMs: opts.durationMs,
    success: true,
    requestedSlides: opts.requested,
    parsedSlides: opts.parsed,
    builtSlides: opts.built,
    acceptedSlides: opts.built,
    numPredict: opts.numPredict,
    stopReason: opts.truncated ? 'length' : 'stop',
  }
}
