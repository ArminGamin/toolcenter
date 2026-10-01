import { describe, expect, it, vi } from 'vitest'
import { CHRISTMAS_BUSINESS_PROFILE_ID, runWithBusinessProfile } from '../business-profiles.js'
import { loadKaleduCatalog } from '../ugc-kaledu-catalog.js'
import { generateUgcBatchStory, kaleduProductLedIssues } from '../ugc-story-engine.js'

vi.mock('../ugc-qa-client.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../ugc-qa-client.js')>(),
  isUgcQaEnabled: () => false,
}))

vi.mock('../ugc-kaledu-product-index.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../ugc-kaledu-product-index.js')>(),
  watchKaleduCatalog: () => {},
  ensureKaleduProductIndexFresh: async () => {},
}))

vi.mock('../ollama-client.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../ollama-client.js')>(),
  ollamaGenerateJson: vi.fn(async (_prompt, options) => {
    if (options.callType === 'final_qa_judge' || options.callType === 'final_qa_rejudge') return '{"bad":[]}'
    if (options.callType === 'final_qa_rewrite') return '{"slides":[]}'
    const product = loadKaleduCatalog().find((row) => row.sku === 'JK-011')!
    return JSON.stringify({ slides: [
      { role: 'hook', title: 'Daug laiko kelyje?', text: 'Išvažiuoji anksti ryte. Kava greitai atšąla.' },
      { role: 'context', text: 'Sustoti naujos kavos ne visada yra kada. Pakeliui dažnai skubi.' },
      { role: 'build', text: `${product.name} pravers ilgesnėje kelionėje. Gėrimą pasiimsi su savimi.`, productId: product.slug },
      { role: 'close', text: 'Kai dovana tinka kasdieniam įpročiui, ji nepasimeta stalčiuje. Tokį pasirinkimą lengviau prisiminti.' },
    ] })
  }),
}))

describe('batch story completion regressions', () => {
  it('completes structural QA, product resolution and success telemetry with LLM QA disabled', async () => {
    await runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, async () => {
      const product = loadKaleduCatalog().find((row) => row.sku === 'JK-011')!
      const progress: string[] = []
      const logs = vi.spyOn(console, 'log').mockImplementation(() => {})
      try {
        const result = await generateUgcBatchStory({
          topic: 'Termosas kelionei', theme: 'Termosas kelionei',
          themeHook: 'Daug laiko kelyje?', themeBody: 'Sustoti naujos kavos ne visada yra kada.',
          slideCount: 4, seed: 7, skipWarm: true, modeHint: 'product_led', productHints: [product.slug],
          onProgress: (message) => progress.push(message),
        })
        expect(result.slides).toHaveLength(4)
        expect(kaleduProductLedIssues(result.slides, { mode: 'PRODUCT_LED', reason: 'explicit_product', confidence: 'HIGH', intent: null, products: [product] })).toEqual([])
        expect(result.slides.find((slide) => slide.productId === product.slug)?.productImageSrc).toBeTruthy()
        expect(progress).toContain('Shipable gate (structural)…')
        expect(progress.some((message) => message.startsWith('Story ready'))).toBe(true)
        expect(logs.mock.calls.some(([message]) => String(message).includes('[Perf]'))).toBe(true)
      } finally {
        logs.mockRestore()
      }
    })
  }, 30_000)
})
