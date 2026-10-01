import { describe, expect, it } from 'vitest'
import { loadKaleduCatalog } from '../ugc-kaledu-catalog.js'
import { CHRISTMAS_BUSINESS_PROFILE_ID, runWithBusinessProfile } from '../business-profiles.js'
import {
  chunkResultTelemetry,
  commitRewrittenSlide,
  summarizeModelCalls,
  updateProductDebt,
  validateRewrittenSlide,
} from '../ugc-kaledu-rewrite-gate.js'
import { finalKaleduShipQa, kaleduProductLedIssues, makeKaleduSlideFallback, repairKaleduProductLed, repairKaleduStoryGate, repairProductDebt } from '../ugc-story-engine.js'

const catalog = () => loadKaleduCatalog()
const bySku = (sku: string) => catalog().find((row) => row.sku === sku || row.slug === sku)!

describe('validateRewrittenSlide', () => {
  it('rejects Mūsų and keeps the original', () => {
    const original = { role: 'build', title: '', body: 'Tau bus lengviau išrinkti dovaną.' }
    const candidate = { role: 'build', title: '', body: 'Mūsų pasiūlymai padės išrinkti dovaną.' }
    const verdict = validateRewrittenSlide({ originalSlide: original, candidateSlide: candidate })
    expect(verdict.ok).toBe(false)
    expect(verdict.errors.map((error) => error.code)).toContain('register_violation')
    expect(commitRewrittenSlide(original, candidate, verdict).body).toBe(original.body)
  })

  it('rejects a rewrite that drops the required thermos', () => {
    const product = bySku('JK-011')
    const original = {
      role: 'build',
      productId: product.slug,
      title: '',
      body: `${product.name} pravers ilgesnėje kelionėje.`,
    }
    const verdict = validateRewrittenSlide({
      originalSlide: original,
      candidateSlide: { body: 'Praktiška dovana visada praverčia.' },
      requiredProductIds: [product.slug],
      products: [product],
    })
    expect(verdict.ok).toBe(false)
    expect(verdict.errors.map((error) => error.code)).toContain('required_product_dropped')
  })

  it('rejects a rewrite that swaps in another product', () => {
    const thermos = bySku('JK-011')
    const mug = catalog().find((row) => /puodel|kakav/iu.test(row.name)) || catalog().find((row) => row.sku !== 'JK-011')!
    const original = { role: 'build', productId: thermos.slug, title: '', body: `${thermos.name} pravers kelionėje.` }
    const verdict = validateRewrittenSlide({
      originalSlide: original,
      candidateSlide: { body: `${mug.name} tinka rytui.` },
      requiredProductIds: [thermos.slug],
      products: [thermos, mug],
    })
    expect(verdict.ok).toBe(false)
    expect(verdict.errors.some((error) => error.code === 'product_identity' || error.code === 'required_product_dropped')).toBe(true)
  })
})

describe('product debt repair', () => {
  const thermosStory = () => {
    const product = bySku('JK-011')
    const mode = { mode: 'PRODUCT_LED' as const, reason: 'explicit_product' as const, confidence: 'HIGH' as const, intent: null, products: [product] }
    const slides = [
      { role: 'hook', title: 'Daug laiko kelyje?', body: 'Kava greitai atšąla.' },
      { role: 'context', title: '', body: 'Sustoti naujos kavos ne visada yra kada.' },
      { role: 'build', title: '', body: `${product.name} pravers ilgesnėje kelionėje.`, productId: product.slug },
      { role: 'close', title: '', body: 'Taip išrinkti tampa paprasčiau.' },
    ]
    return { product, mode, slides }
  }

  it('repairs a malformed reveal even when it already owns the only build slot', () => {
    const { product, mode, slides } = thermosStory()
    slides.splice(1, 1)
    slides[1].body = 'Praktiška dovana visada praverčia.'
    const repaired = repairKaleduProductLed(slides, mode, [product])
    expect(repaired.repairs.some((repair) => repair.code === 'missing_product_resolution')).toBe(true)
    expect(kaleduProductLedIssues(repaired.slides, mode)).toEqual([])
  })

  it('keeps the selected product through final language and duplicate-story repairs', () => {
    runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, () => {
      const { product, mode, slides } = thermosStory()
      const theme = 'Termosas kelionei'
      const fallback = makeKaleduSlideFallback({ themeHook: theme, themeBody: '', topic: theme, allowed: [product], getStoryMode: () => mode })
      slides[2].body = `Mūsų ${product.name} pravers ilgesnėje kelionėje.`
      const qa = finalKaleduShipQa(slides, { theme, allowed: [product] }, fallback)
      expect(qa.repairs.some((repair) => repair.slide === 3)).toBe(true)
      expect(qa.remaining).toEqual([])
      expect(kaleduProductLedIssues(qa.slides, mode)).toEqual([])
      // A later story repair must not erase the validated catalog identity again.
      const duplicated = qa.slides.map((slide, index) => index === 1 ? { ...slide, body: qa.slides[2].body } : slide)
      const gate = repairKaleduStoryGate(duplicated, theme, fallback, [product])
      expect(gate.repairs.length).toBeGreaterThan(0)
      expect(kaleduProductLedIssues(gate.slides, mode)).toEqual([])
    })
  })

  it('rewrites one build slide when debt survives generation', () => {
    const product = bySku('JK-011')
    const slides = [
      { role: 'hook', title: 'Daug laiko kelyje?', body: 'Kava greitai atšąla.' },
      { role: 'context', title: '', body: 'Sustoti naujos kavos ne visada yra kada.' },
      { role: 'build', title: '', body: 'Praktiška dovana praverčia kasdien.' },
      { role: 'build', title: '', body: 'Kartais geriausia dovana yra kasdienė.' },
      { role: 'close', title: '', body: 'Taip išrinkti tampa paprasčiau.', cta: 'Rask dovaną kaledukampelis.com 🎁' },
    ]
    const repaired = repairProductDebt(
      slides,
      { mode: 'PRODUCT_LED', reason: 'explicit_product', confidence: 'HIGH', intent: null, products: [product] },
      [product],
      [product.slug],
      1,
    )
    expect(repaired.attempts).toBe(1)
    expect(repaired.remainingDebt).toEqual([])
    expect(repaired.slides.some((slide) => slide.productId === product.slug && slide.role !== 'close' && slide.role !== 'hook')).toBe(true)
  })

  it('clears debt only after a real product mention', () => {
    const product = bySku('JK-011')
    const open = updateProductDebt([product.slug], [{ role: 'build', body: 'Pagalvok, ką žmogus mėgsta.' }], [product])
    expect(open).toEqual([product.slug])
    const closed = updateProductDebt(
      [product.slug],
      [{ role: 'build', productId: product.slug, body: `${product.name} pravers kelionėje.` }],
      [product],
    )
    expect(closed).toEqual([])
  })
})

describe('model call telemetry', () => {
  it('counts judge and rewrite as separate QA calls', () => {
    const summary = summarizeModelCalls([
      { callType: 'final_qa_judge', durationMs: 10, success: true },
      { callType: 'final_qa_rewrite', durationMs: 20, success: true },
      { callType: 'final_qa_rejudge', durationMs: 5, success: true },
      { callType: 'story_generation', durationMs: 30, success: true, requestedSlides: 3, parsedSlides: 2 },
    ])
    expect(summary.qaCalls).toBe(3)
    expect(summary.finalQaJudgeCalls).toBe(1)
    expect(summary.finalQaRewriteCalls).toBe(1)
    expect(summary.finalQaRejudgeCalls).toBe(1)
    expect(summary.totalModelCalls).toBe(4)
  })

  it('records truncation fields', () => {
    const row = chunkResultTelemetry({ requested: 3, parsed: 2, built: 2, durationMs: 40, numPredict: 700, truncated: true })
    expect(row.requestedSlides).toBe(3)
    expect(row.parsedSlides).toBe(2)
    expect(row.acceptedSlides).toBe(2)
    expect(row.stopReason).toBe('length')
  })
})
