/**
 * Score an audit run against the Fortress V2 success criteria.
 *   npx tsx scripts/mine-fortress-v2.ts [auditRoot]
 */
import fs from 'node:fs'
import path from 'node:path'
import { CHRISTMAS_BUSINESS_PROFILE_ID, runWithBusinessProfile } from '../server/business-profiles.ts'
import {
  kaleduInventedProductMentions,
  kaleduProductSlideVerdict,
  loadKaleduCatalog,
} from '../server/ugc-kaledu-catalog.ts'
import { kaleduDeterministicQa } from '../server/ugc-kaledu-final-qa.ts'
import { UGC_KALEDU_DIET_LEAK_RE } from '../server/ugc-lt-normalize.ts'
import { isIncompleteSubordinateHook } from '../server/ugc-kaledu-native.ts'
import { checkLtSpelling, ensureLtSpeller } from '../server/ugc-lt-spellcheck.ts'

await ensureLtSpeller()

const ROOT = process.argv[2] || 'D:\\ugc-batch-vision\\audit'

type Slide = { role?: string; title?: string; body?: string; cta?: string; productId?: string }

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T
  } catch {
    return null
  }
}

runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, () => {
  const catalog = loadKaleduCatalog()
  const posts = fs
    .readdirSync(ROOT)
    .filter((n) => /^post-\d+$/.test(n))
    .sort()
  const report = {
    posts: posts.length,
    shipped: 0,
    failed: [] as Array<{ post: string; error: string }>,
    inventedProducts: [] as string[],
    concreteWithNoPicks: [] as string[],
    skuMismatch: [] as string[],
    productNoImage: [] as string[],
    contamination: [] as string[],
    qaFlagsOnShipped: [] as string[],
    spellUnknownOnShipped: [] as string[],
    hardTypoOnShipped: [] as string[],
    spellHardFailsCaught: [] as Array<{ post: string; slide: number; hardFail: string; rewrite: boolean; fixedByRewrite: boolean }>,
    spellNotes: [] as Array<{ post: string; slide: number; note: string; judgeFlagged: boolean }>,
    qaCategories: {
      round1: { spell_hard_fail: 0, spell_note: 0, grammar_qa: 0, register_violation: 0, structural: 0 } as Record<string, number>,
      round2: { spell_hard_fail: 0, spell_note: 0, grammar_qa: 0, register_violation: 0, structural: 0 } as Record<string, number>,
    },
    finalShipQaRepairs: 0,
    incompleteHooks: [] as string[],
    fallbackSentences: new Map<string, number>(),
    shippedSentences: new Map<string, number>(),
    ollama: {} as Record<string, { calls: number; ok: number; partial: number; timeouts: number; errors: number; totalMs: number }>,
    draftFallbackChunks: 0,
    qaRewrites: 0,
    qaFallbackSlides: 0,
  }

  for (const post of posts) {
    const dir = path.join(ROOT, post)
    const summary = readJson<{ ok: boolean; error?: string }>(path.join(dir, '10-summary.json'))
    const exportMeta = readJson<{ story_slides?: Slide[]; picked_products?: string[] }>(path.join(dir, '11-export-meta.json'))
    const exportErr = readJson<{ error?: string }>(path.join(dir, '09-error.json'))
    const slides = exportMeta?.story_slides || readJson<Slide[]>(path.join(dir, '06-final-slides.json')) || []
    const picked = catalog.filter((p) => (exportMeta?.picked_products || []).includes(p.slug))
    const stats = readJson<{ byType?: Record<string, { calls: number; ok: number; partial?: number; timeouts: number; errors: number; totalMs: number }> }>(
      path.join(dir, '17-ollama-stats.json'),
    )
    for (const [type, row] of Object.entries(stats?.byType || {})) {
      const bucket = (report.ollama[type] ||= { calls: 0, ok: 0, partial: 0, timeouts: 0, errors: 0, totalMs: 0 })
      bucket.calls += row.calls
      bucket.ok += row.ok
      bucket.partial += row.partial || 0
      bucket.timeouts += row.timeouts
      bucket.errors += row.errors
      bucket.totalMs += row.totalMs
    }
    const timeline = fs.existsSync(path.join(dir, '01-timeline.jsonl'))
      ? fs.readFileSync(path.join(dir, '01-timeline.jsonl'), 'utf8').split('\n').filter(Boolean)
      : []
    report.draftFallbackChunks += timeline.filter((l) => l.includes('"chunk_programmatic_fallback"')).length
    const fallbacks = readJson<Array<{ text: string }>>(path.join(dir, '18-fallbacks.json')) || []
    const finalQa = readJson<{ fallbackSlides?: Array<{ mode: string }> }>(path.join(dir, '05d-final-qa.json'))
    report.qaFallbackSlides += (finalQa?.fallbackSlides || []).filter((f) => f.mode === 'fallback').length
    const native = readJson<{ attemptCount?: number }>(path.join(dir, '05b-native-rewrite.json'))
    report.qaRewrites += native?.attemptCount || 0
    const spellLog = readJson<{
      slides?: Array<{
        slide: number
        beforeHardFail: string | null
        beforeNote: string | null
        afterHardFail: string | null
        rewrite: boolean
        judgeFlaggedAfter: boolean
      }>
    }>(path.join(dir, '05f-spellcheck.json'))
    for (const row of spellLog?.slides || []) {
      if (row.beforeHardFail) {
        report.spellHardFailsCaught.push({
          post,
          slide: row.slide,
          hardFail: row.beforeHardFail,
          rewrite: row.rewrite,
          fixedByRewrite: row.rewrite && !row.afterHardFail,
        })
      }
      if (row.beforeNote) {
        report.spellNotes.push({ post, slide: row.slide, note: row.beforeNote, judgeFlagged: row.judgeFlaggedAfter })
      }
    }
    const qaCats = readJson<{ categories?: { round1?: Record<string, number>; round2?: Record<string, number> } }>(
      path.join(dir, '05d-final-qa.json'),
    )?.categories
    for (const round of ['round1', 'round2'] as const) {
      for (const [cat, n] of Object.entries(qaCats?.[round] || {})) {
        report.qaCategories[round][cat] = (report.qaCategories[round][cat] || 0) + n
      }
    }
    const shipQa = readJson<{ repairs?: unknown[] }>(path.join(dir, '05e-final-ship-qa.json'))
    report.finalShipQaRepairs += shipQa?.repairs?.length || 0

    const ok = Boolean(summary?.ok) && !exportErr?.error
    if (!ok) {
      report.failed.push({ post, error: exportErr?.error || summary?.error || 'unknown' })
    } else {
      report.shipped += 1
    }
    if (!slides.length) continue

    const attached = catalog.filter((p) => picked.includes(p) || slides.some((s) => s.productId === p.productId))
    slides.forEach((slide, i) => {
      const tag = `${post}#${i + 1}`
      const text = `${slide.title || ''} ${slide.body || ''}`
      const invented = kaleduInventedProductMentions(text, attached)
      if (invented.length) report.inventedProducts.push(`${tag}: ${invented.join(', ')}`)
      if (!picked.length && !attached.length) {
        const concrete = kaleduInventedProductMentions(text, [])
        if (concrete.length) report.concreteWithNoPicks.push(`${tag}: ${concrete.join(', ')}`)
      }
      const verdict = kaleduProductSlideVerdict(slide)
      if (verdict === 'copy_mismatch') report.skuMismatch.push(`${tag}: ${slide.productId}`)
      if (verdict === 'image_missing' || verdict === 'unknown_product') report.productNoImage.push(`${tag}: ${slide.productId}`)
      if (UGC_KALEDU_DIET_LEAK_RE.test(`${text} ${slide.cta || ''}`)) report.contamination.push(tag)
      if (ok) {
        const spell = checkLtSpelling(text)
        for (const u of spell.unknown) {
          report.spellUnknownOnShipped.push(`${tag}: ${u.token} [${u.confidence}] → ${u.suggestions.slice(0, 3).join(', ')}`)
        }
        if (spell.hardFail) report.hardTypoOnShipped.push(`${tag}: ${spell.hardFail}`)
      }
      if ((slide.role === 'hook' || i === 0) && isIncompleteSubordinateHook(slide.title || '')) {
        report.incompleteHooks.push(`${tag}: ${slide.title}`)
      }
      if (ok) {
        for (const sentence of (slide.body || '').split(/(?<=[.!?…])\s+/).filter((s) => s.split(' ').length >= 4)) {
          report.shippedSentences.set(sentence, (report.shippedSentences.get(sentence) || 0) + 1)
        }
      }
    })
    if (ok) {
      for (const flag of kaleduDeterministicQa(slides, { theme: '', allowed: attached })) {
        report.qaFlagsOnShipped.push(`${post}#${flag.index + 1}: ${flag.details.join('; ')}`)
      }
    }
    for (const fb of fallbacks) {
      for (const sentence of fb.text.split(/(?<=[.!?…])\s+/).filter((s) => s.split(' ').length >= 4)) {
        report.fallbackSentences.set(sentence, (report.fallbackSentences.get(sentence) || 0) + 1)
      }
    }
  }

  const repeatedShipped = [...report.shippedSentences.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1])
  const out = {
    ...report,
    fallbackSentences: Object.fromEntries(report.fallbackSentences),
    shippedSentences: undefined,
    repeatedShippedSentences: repeatedShipped.map(([s, n]) => `${n}× ${s}`),
  }
  const file = path.join(ROOT, 'FORTRESS-V2-SCORE.json')
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n', 'utf8')
  console.log(JSON.stringify(out, null, 2))
  console.log(`→ ${file}`)
})
