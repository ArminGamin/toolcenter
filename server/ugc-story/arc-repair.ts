/** Applies the story-arc guard: swaps flagged slides for validated fallbacks and logs to the audit. */

import { auditLog, auditWrite } from '../ugc-batch-audit.js'
import { arcSlideText, collectKaleduArcIssues, type ArcIssue } from './arc-guard.js'
import { type UgcStorySlide } from './text.js'

export type ArcRepair = { slide: number; code: string; before: string; after: string }

/**
 * Swap each flagged slide for a validated fallback. A repeated product slide drops its
 * productId first, so the fallback is a tip, not the same product again.
 */
export function repairKaleduArc(
  input: UgcStorySlide[],
  fallbackFor: (index: number, slides: UgcStorySlide[], reason: string) => { title: string; body: string } | null,
  stage: string,
  themeText = '',
): { slides: UgcStorySlide[]; repairs: ArcRepair[]; unresolved: ArcIssue[] } {
  const slides = input.map((slide) => ({ ...slide }))
  const repairs: ArcRepair[] = []
  const touched = new Set<number>()
  const found: ArcIssue[] = []
  // One slide per round, then re-scan: fixing slide 4 can clear the issue on slide 5.
  for (let round = 0; round < slides.length; round++) {
    const issues = collectKaleduArcIssues(slides, themeText).filter((issue) => !touched.has(issue.slide - 1))
    if (!issues.length) break
    const issue = issues[0]
    found.push(issue)
    const i = issue.slide - 1
    touched.add(i)
    const before = arcSlideText(slides[i])
    const base =
      issue.code === 'product_repeat'
        ? { ...slides[i], productId: undefined, productImageSrc: undefined, showProductPrice: false }
        : slides[i]
    const work = slides.map((slide, j) => (j === i ? base : slide))
    const fb = fallbackFor(i, work, issue.code)
    if (!fb || !fb.body.trim()) continue
    slides[i] = { ...base, title: slides[i].role === 'hook' ? fb.title : '', body: fb.body }
    repairs.push({ slide: i + 1, code: issue.code, before, after: arcSlideText(slides[i]) })
  }
  const unresolved = collectKaleduArcIssues(slides, themeText)
  for (const repair of repairs) auditLog('arc_guard_repair', { stage, ...repair })
  if (process.env.UGC_ARC_DEBUG) for (const repair of repairs) console.log(`[arc ${stage}] slide ${repair.slide} ${repair.code}: ${repair.before}`)
  for (const issue of unresolved) auditLog('arc_guard_unresolved', { stage, ...issue })
  if (found.length || unresolved.length) {
    auditWrite(`04g-arc-guard-${stage}.json`, { found, repairs, unresolved })
  }
  return { slides, repairs, unresolved }
}
