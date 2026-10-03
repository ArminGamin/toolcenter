/**
 * Live check against the local Ollama model: generate N Kalėdų Kampelis posts (6 slides by
 * default) and print every slide with arc + language QA marks. Does not touch the audit session.
 * Usage:
 *   npx tsx scripts/verify-kaledu-arc-live.ts            # 4 posts × 6 slides
 *   npx tsx scripts/verify-kaledu-arc-live.ts 6 5        # 6 posts × 5 slides
 */
import { CHRISTMAS_BUSINESS_PROFILE_ID, runWithBusinessProfile } from '../server/business-profiles.ts'
import { isSpellNoteOnly, kaleduDeterministicQa } from '../server/ugc-kaledu-final-qa.ts'
import { ensureLtSpeller } from '../server/ugc-lt-spellcheck.ts'
import { collectKaleduArcIssues } from '../server/ugc-story/arc-guard.ts'
import { generateUgcBatchStory, UGC_KALEDU_FALLBACK_BUILD_BODIES, UGC_KALEDU_FALLBACK_CLOSE_BODIES, UGC_KALEDU_FALLBACK_CONTEXT_BODIES } from '../server/ugc-story-engine.ts'
import { pickBatchUgcThemes } from '../server/ugc-theme-pool.ts'

const BANK = new Set([...UGC_KALEDU_FALLBACK_BUILD_BODIES, ...UGC_KALEDU_FALLBACK_CLOSE_BODIES, ...UGC_KALEDU_FALLBACK_CONTEXT_BODIES])
const posts = Number(process.argv[2]) || 4
const slideCount = Number(process.argv[3]) || 6

await runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, async () => {
  await ensureLtSpeller()
  const picked = pickBatchUgcThemes(posts, undefined, { testMode: true })
  if (!picked.ok || !picked.themes?.length) throw new Error(picked.message || 'No themes')
  let total = 0
  let clean = 0
  for (const [i, theme] of picked.themes.entries()) {
    const started = Date.now()
    try {
      const story = await generateUgcBatchStory({
        topic: `${theme.hook}. ${theme.body}`,
        themeHook: theme.hook,
        themeBody: theme.body,
        slideCount,
        seed: Date.now() % 100000,
        skipWarm: i > 0,
        theme: theme.theme,
        category: 'Random theme',
        onProgress: process.env.UGC_ARC_DEBUG ? (msg) => console.log(`[progress] ${msg}`) : undefined,
      })
      const bad = new Map<number, string[]>()
      for (const issue of collectKaleduArcIssues(story.slides, `${theme.theme} ${theme.hook} ${theme.body}`)) {
        bad.set(issue.slide - 1, [...(bad.get(issue.slide - 1) || []), `${issue.code}: ${issue.message}`])
      }
      for (const flag of kaleduDeterministicQa(story.slides, { theme: theme.theme, allowed: [], productTruth: false })) {
        if (isSpellNoteOnly(flag)) continue
        bad.set(flag.index, [...(bad.get(flag.index) || []), ...flag.details])
      }
      console.log(`\n=== Post ${i + 1}: ${theme.theme} (${Math.round((Date.now() - started) / 1000)}s)`)
      story.slides.forEach((slide, j) => {
        total++
        if (!bad.has(j)) clean++
        console.log(`${bad.has(j) ? '✗' : '✓'}${BANK.has(slide.body.replace(/[!.]$/, '.')) || BANK.has(slide.body) ? ' (bank)' : ''} ${j + 1} [${slide.role}] ${slide.title ? `${slide.title} | ` : ''}${slide.body}${slide.cta ? ` || ${slide.cta}` : ''}`)
        for (const row of bad.get(j) || []) console.log(`     → ${row}`)
      })
    } catch (err) {
      console.log(`\n=== Post ${i + 1}: ${theme.theme} FAILED: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  console.log(`\nSlides: ${total} · clean by gates: ${clean}`)
})
