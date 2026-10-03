/** Kalėdų Kampelis product-led checks, story gate repairs and ship QA. (Split out of ugc-story-engine.ts.) */

import {
    auditLog
} from '../ugc-batch-audit.js'
import {
    copyNamesProduct,
    copyRevealsProduct,
    enforceKaleduProductSlide,
    kaleduProductReasonLines,
    loadKaleduCatalog,
    kaleduProductSlideVerdict,
    productTypePhrase,
    requiredKaleduProductIds,
    rewriteInventedProductSentence,
    type KaleduCatalogProduct,
    type KaleduStoryMode
} from '../ugc-kaledu-catalog.js'
import {
    isSpellNoteOnly,
    kaleduDeterministicQa,
    repairNativeSemantic,
    type KaleduQaFlag
} from '../ugc-kaledu-final-qa.js'
import {
    pickDebtRepairTarget,
    updateProductDebt
} from '../ugc-kaledu-rewrite-gate.js'
import {
    collectStoryIssues,
    KALEDU_THEME_SUBJECTS,
    kaleduThemeDrift
} from '../ugc-lt-normalize.js'
import { getFallbackCloseBodyCandidates, pickKaleduSubjectHook, pickThemedKaleduFallback, pickValidatedKaleduFallback, UGC_KALEDU_FALLBACK_BUILD_BODIES, UGC_KALEDU_FALLBACK_CONTEXT_BODIES } from './fallbacks.js'
import { findKaleduProductKit } from './kaledu-kits.js'
import { collectParaphraseSlideIssues } from './similarity.js'
import { type UgcStorySlide } from './text.js'

export type KaleduSlideFallback = (
  index: number,
  slides: UgcStorySlide[],
  reason: string,
) => { title: string; body: string } | null

export type KaleduStoryGateRepair = { slide: number; code: string; before: string; after: string }

/**
 * A product slide = the product name + why it fits. Never just „Gali rinktis X.“
 * The reason comes from the product's own catalog lines (never another product's).
 */
export function productRevealWithReason(product: KaleduCatalogProduct, priorText = '', seed = 0): string {
  // Hand-checked reveal lines (name in the right case + a catalog reason) come first.
  const kit = findKaleduProductKit(product.slug)
  const kitLines = (kit?.reveal || []).filter((line) => !priorText.includes(line))
  for (let k = 0; k < kitLines.length; k++) {
    const line = kitLines[(Math.abs(seed) + k) % kitLines.length]
    if (!kaleduDeterministicQa([{ body: line, role: 'build' }], { theme: '', allowed: [product] }).some((f) => !isSpellNoteOnly(f))) {
      return line
    }
  }
  const reveal = rewriteInventedProductSentence('', [product], { priorText })
  const reasons = kaleduProductReasonLines(product).filter((line) => !priorText.includes(line))
  if (!reasons.length) return reveal
  return `${reveal} ${reasons[Math.abs(seed) % reasons.length]}`
}

/** „Gali rinktis X. Tokiam žmogui tiktų X.“ — keep the first sentence that names the product. */
export function dropRepeatedProductSentences(body: string, product: KaleduCatalogProduct): string {
  const sentences = String(body || '').split(/(?<=[.!?…])\s+/u).filter((part) => part.trim())
  let named = false
  const kept = sentences.filter((sentence) => {
    if (!copyRevealsProduct(sentence, product)) return true
    if (named) return false
    named = true
    return true
  })
  return kept.join(' ')
}

/**
 * Last pass on product slides: a slide that carries productId but never names the product
 * loses the productId (no picture under unrelated copy); a named product with a bare one-line
 * reveal gets its reason appended when the result still passes the final QA.
 */
export function enforceProductSlideContract(
  slides: UgcStorySlide[],
  allowed: KaleduCatalogProduct[],
): { slides: UgcStorySlide[]; repairs: KaleduStoryGateRepair[] } {
  const repairs: KaleduStoryGateRepair[] = []
  const out = slides.map((input, i) => {
    let slide = input
    const id = String(slide.productId || '').trim()
    if (!id) return slide
    const text = `${slide.title || ''} ${slide.body || ''}`.trim()
    const product = [...allowed, ...loadKaleduCatalog()].find((p) => p.slug === id || p.productId === id)
    if (!product || !copyRevealsProduct(text, product)) {
      repairs.push({ slide: i + 1, code: 'product_id_without_product_copy', before: text, after: text })
      return { ...slide, productId: undefined, productVariantId: undefined, productImageSrc: undefined, showProductPrice: false }
    }
    const deduped = dropRepeatedProductSentences(String(slide.body || ''), product)
    if (deduped && deduped !== String(slide.body || '')) {
      repairs.push({ slide: i + 1, code: 'product_sentence_repeated', before: text, after: `${slide.title || ''} ${deduped}`.trim() })
      slide = { ...slide, body: deduped }
    }
    const sentences = String(slide.body || '').split(/(?<=[.!?…])\s+/u).filter((part) => part.trim())
    if (sentences.length !== 1 || slide.role === 'hook') return slide
    const priorText = slides.filter((_, j) => j !== i).map((s) => `${s.title || ''} ${s.body || ''}`).join(' ')
    for (const reason of kaleduProductReasonLines(product)) {
      if (priorText.includes(reason) || String(slide.body).includes(reason)) continue
      const next = { ...slide, body: `${String(slide.body).trim()} ${reason}` }
      if (kaleduDeterministicQa([next], { theme: '', allowed: [product] }).some((flag) => !isSpellNoteOnly(flag))) continue
      repairs.push({ slide: i + 1, code: 'product_reason_added', before: text, after: `${next.title || ''} ${next.body}`.trim() })
      return next
    }
    return slide
  })
  return { slides: out, repairs }
}

/** Close bodies that bridge a revealed product to the store CTA (PRODUCT_LED mode). */
export const KALEDU_PRODUCT_LED_CLOSE_BODIES = [
  'Jei žmogus tuo naudosis kasdien, dovana tikrai neliks pamiršta.',
  'Kai dovana tinka kasdieniam įpročiui, ji nepasimeta stalčiuje.',
  'Tokia dovana primins apie tave kiekvieną kartą, kai ja naudosis.',
]

/** Prompt block that steers PRODUCT_LED / HYBRID stories. */
export function buildKaleduProductLedBrief(mode: KaleduStoryMode): string {
  if (mode.mode === 'GENERIC') return ''
  if (mode.mode === 'HYBRID') {
    const optional = mode.products[0]
      ? `Jei tinka natūraliai, vienoje build skaidrėje gali paminėti ${productTypePhrase(mode.products[0])} [productId=${mode.products[0].slug}].`
      : 'Prekę minėk tik jei ji natūraliai tinka iš PRODUCTS_ALLOWED.'
    return `STORY MODE: HYBRID
Rašyk naudingą patarimą pagal temą. ${optional} Neprievartauk prekės.`
  }
  if (mode.mode !== 'PRODUCT_LED' || !mode.products.length) return ''
  const product = mode.products[0]
  const second = mode.products[1]
  const habit = mode.intent ? ` (${mode.intent.label})` : ''
  const reveal = second
    ? `2 skaidrė: ${productTypePhrase(product)} [productId=${product.slug}].
3 skaidrė: ${productTypePhrase(second)} [productId=${second.slug}].
Viena prekė vienoje skaidrėje. Hook ir close be productId.`
    : `2 skaidrė: tas pats įprotis - kodėl tai užuomina dovanai. NE bendras dovanų pirkimo stresas.
3 skaidrė: pristatyk ${productTypePhrase(product)} [productId=${product.slug}] ir kodėl tinka šiam įpročiui.`
  return `STORY MODE: PRODUCT_LED${habit}
1 skaidrė: žmogaus įprotis ar situacija iš temos.
${reveal}
Paskutinė: konkreti nauda žmogui, be CTA body.`
}

export function kaleduProductLedResolved(slides: UgcStorySlide[], mode: KaleduStoryMode): boolean {
  const required = requiredKaleduProductIds(mode)
  if (!required.length) return true
  return required.every((id) =>
    slides.some(
      (slide) =>
        (slide.productId === id || mode.products.some((product) => (product.slug === id || product.productId === id) && (slide.productId === product.productId || slide.productId === product.slug))) &&
        kaleduProductSlideVerdict(slide) === 'ok' &&
        mode.products.some(
          (product) =>
            (slide.productId === product.productId || slide.productId === product.slug) &&
            copyRevealsProduct(`${slide.title || ''} ${slide.body || ''}`, product),
        ),
    ),
  )
}

/** PRODUCT_LED story checks: context must stay on the habit; the selected SKU must be revealed. */
export function kaleduProductLedIssues(
  slides: UgcStorySlide[],
  mode: KaleduStoryMode,
): Array<{ code: 'product_theme_drift' | 'missing_product_resolution'; slide: number }> {
  if (mode.mode !== 'PRODUCT_LED' && mode.mode !== 'HYBRID') return []
  const issues: Array<{ code: 'product_theme_drift' | 'missing_product_resolution'; slide: number }> = []
  const contextIdx = slides.findIndex((s, i) => i > 0 && i < slides.length - 1 && s.role === 'context')
  const idx = contextIdx >= 0 ? contextIdx : 1
  const context = slides[idx]
  if (mode.mode === 'PRODUCT_LED' && mode.intent && context && idx < slides.length - 1) {
    const text = `${context.title} ${context.body}`
    const onProduct = mode.products.some((p) => copyNamesProduct(text, p))
    if (!mode.intent.copy.test(text) && !onProduct) issues.push({ code: 'product_theme_drift', slide: idx + 1 })
  }
  if (!kaleduProductLedResolved(slides, mode)) issues.push({ code: 'missing_product_resolution', slide: 0 })
  return issues
}

/**
 * Deterministic PRODUCT_LED repair: habit context back on topic, and the selected SKU revealed
 * on a build slide (productId + catalog noun + image). If no selected SKU can render, the
 * whole post is downgraded to GENERIC instead of keeping product copy without a picture.
 */
export function repairKaleduProductLed(
  input: UgcStorySlide[],
  mode: KaleduStoryMode,
  allowed: KaleduCatalogProduct[],
  seed = 0,
  themeText = '',
): { slides: UgcStorySlide[]; repairs: KaleduStoryGateRepair[]; mode: KaleduStoryMode } {
  const slides = input.map((slide) => ({ ...slide }))
  const repairs: KaleduStoryGateRepair[] = []
  if (mode.mode !== 'PRODUCT_LED' && mode.mode !== 'HYBRID') return { slides, repairs, mode }
  const textOf = (s: UgcStorySlide) => `${s.title || ''} ${s.body || ''}`.trim()
  for (const issue of kaleduProductLedIssues(slides, mode)) {
    if (issue.code !== 'product_theme_drift' || !mode.intent) continue
    const i = issue.slide - 1
    const others = slides.filter((_, j) => j !== i).map((s) => ({ title: s.title, body: s.body }))
    const body = pickThemedKaleduFallback('context', mode.intent.context, others, allowed, themeText)
    if (!body) continue
    repairs.push({ slide: i + 1, code: issue.code, before: textOf(slides[i]), after: body })
    slides[i] = { ...slides[i], title: '', body, productId: undefined, showProductPrice: false }
  }
  if (kaleduProductLedResolved(slides, mode)) return { slides, repairs, mode }

  const inner = slides.map((_, i) => i).filter((i) => i > 0 && i < slides.length - 1)
  const contextIdx = slides.findIndex((s, i) => i > 0 && i < slides.length - 1 && s.role === 'context')
  const targets = [
    ...inner.filter((i) => i !== contextIdx && slides[i].role !== 'context'),
    ...inner.filter((i) => i === contextIdx || slides[i].role === 'context'),
  ]
  for (const product of mode.products) {
    const already = slides.some(
      (slide) =>
        (slide.productId === product.productId || slide.productId === product.slug) &&
        kaleduProductSlideVerdict(slide) === 'ok',
    )
    if (already) continue
    let placed = false
    for (const target of targets) {
      if (slides[target].productId && kaleduProductSlideVerdict(slides[target]) === 'ok') continue
      const priorText = slides.filter((_, j) => j !== target).map(textOf).join(' ')
      const next = {
        ...slides[target],
        title: '',
        body: productRevealWithReason(product, priorText, seed),
        productId: product.productId || product.slug,
        showProductPrice: false,
      }
      if (kaleduProductSlideVerdict(next) !== 'ok') continue
      if (kaleduDeterministicQa([next], { theme: '', allowed: mode.products }).some((f) => !isSpellNoteOnly(f))) continue
      repairs.push({ slide: target + 1, code: 'missing_product_resolution', before: textOf(slides[target]), after: next.body })
      slides[target] = next
      placed = true
      break
    }
    if (!placed) {
      auditLog('product_led_unresolved', { products: mode.products.map((p) => p.slug), mode: mode.mode })
    }
  }
  return { slides, repairs, mode }
}

export function repairProductDebt(
  slides: UgcStorySlide[],
  mode: KaleduStoryMode,
  products: KaleduCatalogProduct[],
  debt: string[],
  seed = 0,
  themeText = '',
): { slides: UgcStorySlide[]; remainingDebt: string[]; attempts: number; repairs: KaleduStoryGateRepair[] } {
  if (!debt.length) return { slides, remainingDebt: debt, attempts: 0, repairs: [] }
  const owed = products.filter((product) => debt.includes(product.slug) || debt.includes(product.productId))
  const narrowed: KaleduStoryMode = { ...mode, products: owed.length ? owed : mode.products }
  const led = repairKaleduProductLed(slides, narrowed, products, seed, themeText)
  const remainingDebt = updateProductDebt(debt, led.slides, products)
  for (const repair of led.repairs) {
    if (repair.code !== 'missing_product_resolution') continue
    const product = owed[0]
    const target = product ? pickDebtRepairTarget(slides, product, repair.slide - 1, debt) : null
    auditLog('product_debt_repair', {
      productId: product?.slug || debt[0],
      targetSlideIndex: target?.index ?? repair.slide - 1,
      originalText: repair.before,
      candidateText: repair.after,
      accepted: !remainingDebt.includes(product?.slug || debt[0]),
    })
  }
  return { slides: led.slides, remainingDebt, attempts: debt.length, repairs: led.repairs }
}

/**
 * Last language check on the exact slides that ship. Any text change after the native pass
 * (product attach, contamination swap, product downgrade, story gate repair) is re-checked here.
 * Spell-only notes were already adjudicated by the judge in the native pass and are skipped.
 * One validated-fallback repair, then a hard failure if anything is still wrong.
 */
export function applySemanticContextRepairs(slides: UgcStorySlide[]): {
  slides: UgcStorySlide[]
  repairs: KaleduStoryGateRepair[]
  semanticHits: number
  semanticSentences: number
  semanticRepairGroups: number
} {
  const repairs: KaleduStoryGateRepair[] = []
  let semanticHits = 0
  let semanticSentences = 0
  let semanticRepairGroups = 0
  const next = slides.map((slide, index) => {
    const prior = index > 0 ? `${slides[index - 1].title || ''} ${slides[index - 1].body || ''}` : ''
    const semanticOpts = { role: slide.role, productId: slide.productId, prior }
    const title = repairNativeSemantic(slide.title || '', semanticOpts)
    const body = repairNativeSemantic(slide.body || '', semanticOpts)
    const hits = [...title.hits, ...body.hits]
    const groups = [...title.groups, ...body.groups]
    const sentences = new Set([
      ...title.groups.flatMap((group) => group.sentenceIndexes.map((i) => `title:${i}`)),
      ...body.groups.flatMap((group) => group.sentenceIndexes.map((i) => `body:${i}`)),
    ])
    semanticHits += hits.length
    semanticSentences += sentences.size
    semanticRepairGroups += groups.length
    if (!groups.length) {
      if (title.changed || body.changed) return { ...slide, title: title.text, body: body.text }
      return slide
    }
    const before = `${slide.title || ''} ${slide.body || ''}`.trim()
    const afterSlide = title.changed || body.changed ? { ...slide, title: title.text, body: body.text } : slide
    const after = `${afterSlide.title} ${afterSlide.body}`.trim()
    const recheckResult = title.recheckResult === 'reverted' || body.recheckResult === 'reverted' ? 'reverted' : 'pass'
    for (const group of groups) {
      auditLog('ugc-copy-qa', {
        profile: 'kaledu',
        slide: index + 1,
        reason: group.codes.join(','),
        original: before,
        replacement: group.replacement,
        attempt: 1,
      })
      auditLog('semantic_repair', {
        slide: index + 1,
        category: group.codes.join(','),
        confidence: group.confidence,
        sentenceIndex: group.sentenceIndexes.join(','),
        role: slide.role || '',
        productId: slide.productId || '',
        repairStrategy: group.strategy,
        repair: group.replacement,
        recheckResult,
        semanticHits: hits.length,
        semanticSentences: sentences.size,
        semanticRepairGroups: groups.length,
      })
    }
    if (!title.changed && !body.changed) return slide
    repairs.push({
      slide: index + 1,
      code: [...new Set(hits.map((hit) => hit.code))].join(','),
      before,
      after,
    })
    return afterSlide
  })
  return { slides: next, repairs, semanticHits, semanticSentences, semanticRepairGroups }
}

export function applyKaleduFallbackCopy(slide: UgcStorySlide, copy: { title: string; body: string }): UgcStorySlide {
  const next = { ...slide, ...copy }
  return kaleduProductSlideVerdict(next) === 'ok'
    ? next
    : { ...next, productId: undefined, showProductPrice: false }
}

export function finalKaleduShipQa(
  input: UgcStorySlide[],
  ctx: { theme: string; allowed: KaleduCatalogProduct[] },
  fallbackFor: KaleduSlideFallback,
): {
  slides: UgcStorySlide[]
  repairs: KaleduStoryGateRepair[]
  remaining: KaleduQaFlag[]
  semanticHits: number
  semanticSentences: number
  semanticRepairGroups: number
} {
  const semantic = applySemanticContextRepairs(input.map((slide) => ({ ...slide })))
  const slides = semantic.slides
  const repairs: KaleduStoryGateRepair[] = [...semantic.repairs]
  const blocking = (rows: UgcStorySlide[]) =>
    kaleduDeterministicQa(rows, ctx).filter((flag) => !isSpellNoteOnly(flag))
  for (const flag of blocking(slides)) {
    const i = flag.index
    const before = `${slides[i].title} ${slides[i].body}`.trim()
    const others = slides.filter((_, j) => j !== i).map((s) => ({ title: s.title, body: s.body }))
    const fb =
      slides[i].role === 'hook' || i === 0
        ? pickKaleduSubjectHook(ctx.theme, others, ctx.allowed)
        : fallbackFor(i, slides, flag.details.join('; '))
    if (!fb) continue
    slides[i] = applyKaleduFallbackCopy(slides[i], {
      title: slides[i].role === 'hook' || i === 0 ? fb.title : '',
      body: fb.body,
    })
    repairs.push({ slide: i + 1, code: flag.codes.join(','), before, after: `${slides[i].title} ${slides[i].body}`.trim() })
  }
  return {
    slides,
    repairs,
    remaining: blocking(slides),
    semanticHits: semantic.semanticHits,
    semanticSentences: semantic.semanticSentences,
    semanticRepairGroups: semantic.semanticRepairGroups,
  }
}

/**
 * Christmas story gate repair: each failing slide is replaced once (validated fallback,
 * subject hook, or the picked product the theme names). Two rounds max, then the hard gate decides.
 */
export function repairKaleduStoryGate(
  input: UgcStorySlide[],
  themeText: string,
  fallbackFor: KaleduSlideFallback,
  picked: KaleduCatalogProduct[] = [],
): { slides: UgcStorySlide[]; repairs: KaleduStoryGateRepair[] } {
  const slides = input.map((slide) => ({ ...slide }))
  const repairs: KaleduStoryGateRepair[] = []
  const touched = new Set<number>()
  const textOf = (s: UgcStorySlide) => `${s.title || ''} ${s.body || ''}`.trim()
  for (let round = 0; round < 2; round++) {
    const failures = [...collectStoryIssues(slides, themeText), ...collectParaphraseSlideIssues(slides)]
    if (!failures.length) break
    let changed = false
    for (const failure of failures) {
      if (failure.code === 'theme_drift') {
        const lost = kaleduThemeDrift(themeText, slides.slice(0, 3).map(textOf).join(' '))
        if (!lost) continue
        const subject = KALEDU_THEME_SUBJECTS.find((row) => row.label === lost.split(' / ')[0])
        const product = subject
          ? picked.find((p) => subject.copy.test(`${productTypePhrase(p)} ${p.slug}`))
          : undefined
        const target = product
          ? [1, 2].find((i) => i < slides.length - 1 && !touched.has(i) && !slides[i].productId)
          : undefined
        if (product && target != null) {
          const priorText = slides.filter((_, j) => j !== target).map(textOf).join(' ')
          const before = textOf(slides[target])
          const next = enforceKaleduProductSlide(
            {
              ...slides[target],
              title: '',
              body: productRevealWithReason(product, priorText),
              productId: product.productId || product.slug,
            },
            { priorText },
          )
          if (next.productId) {
            slides[target] = next
            touched.add(target)
            repairs.push({ slide: target + 1, code: failure.code, before, after: textOf(next) })
            changed = true
            continue
          }
        }
        if (touched.has(0)) continue
        const before = textOf(slides[0])
        const others = slides.slice(1).map((s) => ({ title: s.title, body: s.body }))
        const hook = pickKaleduSubjectHook(themeText, others, picked)
        slides[0] = { ...slides[0], ...hook, productId: undefined, showProductPrice: false }
        touched.add(0)
        repairs.push({ slide: 1, code: failure.code, before, after: textOf(slides[0]) })
        changed = true
        continue
      }
      const idx = failure.slide - 1
      if (idx < 0 || idx >= slides.length || touched.has(idx)) continue
      const before = textOf(slides[idx])
      const fb =
        idx === 0
          ? pickKaleduSubjectHook(
              themeText,
              slides.slice(1).map((s) => ({ title: s.title, body: s.body })),
              picked,
            )
          : fallbackFor(idx, slides, failure.code)
      if (!fb) continue
      slides[idx] = applyKaleduFallbackCopy(slides[idx], {
        title: idx === 0 ? fb.title : '',
        body: fb.body,
      })
      touched.add(idx)
      repairs.push({ slide: idx + 1, code: failure.code, before, after: textOf(slides[idx]) })
      changed = true
    }
    if (!changed) break
  }
  return { slides, repairs }
}

/** Role-aware validated fallback for one Christmas slide (never repeats another slide in the post). */
export function makeKaleduSlideFallback(ctx: {
  themeHook: string
  themeBody: string
  topic: string
  allowed: KaleduCatalogProduct[]
  getStoryMode?: () => KaleduStoryMode
}): KaleduSlideFallback {
  return (index, slides) => {
    const slide = slides[index]
    const role =
      slide.role || (index === 0 ? 'hook' : index === slides.length - 1 ? 'close' : 'build')
    const others = slides
      .filter((_, j) => j !== index)
      .map((s) => ({ title: s.title, body: s.body }))
    const themeText = `${ctx.topic} ${ctx.themeHook} ${ctx.themeBody}`
    const storyMode = ctx.getStoryMode?.()
    const productLed = storyMode?.mode === 'PRODUCT_LED'
    if (role === 'hook') {
      return pickKaleduSubjectHook(`${ctx.topic} ${ctx.themeHook} ${ctx.themeBody}`, others, ctx.allowed)
    }
    // The product revealed earlier in the post (if any): its own hand-checked follow-up lines
    // keep the story on the product instead of restarting the gift search.
    const revealedAt = slides.findIndex((s, j) => j < index && Boolean(s.productId))
    const revealedId = revealedAt >= 0 ? String(slides[revealedAt].productId || '') : ''
    const revealedKit = revealedId
      ? findKaleduProductKit(
          [...ctx.allowed, ...loadKaleduCatalog()].find((p) => p.productId === revealedId || p.slug === revealedId)?.slug || revealedId,
        )
      : null
    if (role === 'close' || role === 'punch') {
      if (revealedKit?.close.length) {
        const body = pickValidatedKaleduFallback('close', revealedKit.close, others, ctx.allowed)
        if (body) return { title: '', body }
      }
      // Once a product is on screen, close on using it — not on „net maža dovana…“ advice.
      const pool = productLed || revealedAt >= 0
        ? [...KALEDU_PRODUCT_LED_CLOSE_BODIES, ...getFallbackCloseBodyCandidates(ctx.topic)]
        : getFallbackCloseBodyCandidates(ctx.topic)
      const body = pickThemedKaleduFallback('close', pool, others, ctx.allowed, themeText)
      return body ? { title: '', body } : null
    }
    if (role === 'build' && revealedKit?.use.length && revealedAt === index - 1 && !slide.productId) {
      const body = pickValidatedKaleduFallback('build', revealedKit.use, others, ctx.allowed)
      if (body) return { title: '', body }
    }
    if (role === 'context' && productLed && storyMode?.intent) {
      const body = pickThemedKaleduFallback('context', storyMode.intent.context, others, ctx.allowed, themeText)
      if (body) return { title: '', body }
    }
    const pid = String(slide.productId || '').trim()
    const product = pid ? ctx.allowed.find((p) => p.productId === pid || p.slug === pid) : undefined
    if (product) {
      const priorText = others.map((s) => `${s.title} ${s.body}`).join(' ')
      return { title: '', body: productRevealWithReason(product, priorText) }
    }
    const stock = role === 'context' ? UGC_KALEDU_FALLBACK_CONTEXT_BODIES : UGC_KALEDU_FALLBACK_BUILD_BODIES
    // After the reveal the story moves forward: no „how to search for a gift“ tips.
    const afterReveal = revealedAt >= 0 && index > revealedAt
    const pool = afterReveal ? stock.filter((line) => !KALEDU_SEARCH_TIP_RE.test(line)) : stock
    const body = pickThemedKaleduFallback(role, pool, others, ctx.allowed, themeText)
    return body ? { title: '', body } : null
  }
}

/** Stock build lines that coach the gift search — they belong before a product reveal. */
export const KALEDU_SEARCH_TIP_RE =
  /paiešk|ieškoti|ieškai|pradėk nuo|užsirašyk|pagalvok|prisimink|pažiūrėk|kai žinai, k|nusistatyk|rinktis tenka|dvejoji/iu
