/** Slide similarity checks: theme overlap, paraphrase and duplicate detection. (Split out of ugc-story-engine.ts.) */

import {
    isBuildCloseEcho
} from '../ugc-lt-normalize.js'

export const LT_STOPWORDS = new Set([
  'ir', 'su', 'po', 'kad', 'tai', 'yra', 'bet', 'nes', 'jau', 'dar', 'tik', 'kaip', 'kai',
  'tavo', 'tau', 'turi', 'būti', 'bus', 'gali', 'labai', 'daug', 'mažai', 'vis', 'be', 'per',
  'nuo', 'iki', 'apie', 'kas', 'kur', 'kodėl', 'jei', 'tada', 'ten', 'čia', 'todėl',
])

export function ltContentToken(w: string): string {
  const base = w.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  if (base.length <= 3 || LT_STOPWORDS.has(base)) return ''
  if (base.length <= 5) return base
  return base.slice(0, Math.max(4, base.length - 2))
}

export const THEME_PHRASE_RES = [/alk/i, /kelion/i, /vakarien/i, /plan/i, /greit/i, /paprast/i, /bad/i, /nuovarg/i]

/** Fraction of content tokens shared with any prior slide (0–1). High = repetitive theme. */
export function ugcSlideThemeOverlap(newText: string, priorTexts: string[]): number {
  const tokens = (text: string) => {
    const out = new Set<string>()
    for (const w of text.toLowerCase().replace(/[^\p{L}\s]/gu, ' ').split(/\s+/)) {
      const key = ltContentToken(w)
      if (key) out.add(key)
    }
    return out
  }
  const newTokens = tokens(newText)
  let tokenMax = 0
  if (newTokens.size > 0) {
    for (const prior of priorTexts) {
      const priorTokens = tokens(prior)
      let shared = 0
      for (const t of newTokens) if (priorTokens.has(t)) shared++
      tokenMax = Math.max(tokenMax, shared / newTokens.size)
    }
  }
  let themeMax = 0
  for (const prior of priorTexts) {
    const sharedThemes = THEME_PHRASE_RES.filter((re) => re.test(newText) && re.test(prior)).length
    if (sharedThemes >= 2) themeMax = Math.max(themeMax, 0.3 + sharedThemes * 0.12)
  }
  return Math.max(tokenMax, themeMax)
}

export const SLIDE_PARAPHRASE_OVERLAP = 0.35

export const SLIDE_PARAPHRASE_OVERLAP_BUILD = 0.3

export const POST_MEAL_SLEEPINESS_RE = /\b(mieguistum\w*.*po\s+piet|po\s+piet.*mieguistum\w*)\b/iu

/** True when slide copy paraphrases an earlier slide (token overlap or near-dup fingerprint). */
export function isParaphraseSlideCopy(
  title: string,
  body: string,
  prior: Array<{ title?: string; body?: string; text?: string }>,
): boolean {
  if (isDuplicateSlideCopy(title, body, prior)) return true
  const combined = [title, body].filter(Boolean).join(' ').trim()
  if (combined.length < 24) return false
  const priorTexts = prior
    .map((p) => p.text || [p.title, p.body].filter(Boolean).join(' '))
    .filter(Boolean)
  if (
    priorTexts.some(
      (priorText) =>
        POST_MEAL_SLEEPINESS_RE.test(combined) && POST_MEAL_SLEEPINESS_RE.test(priorText),
    )
  ) {
    return true
  }
  const threshold =
    prior.length >= 2 && prior.length <= 5 ? SLIDE_PARAPHRASE_OVERLAP_BUILD : SLIDE_PARAPHRASE_OVERLAP
  return ugcSlideThemeOverlap(combined, priorTexts) >= threshold
}

export function collectParaphraseSlideIssues(
  slides: Array<{ title?: string; body?: string; role?: string }>,
): Array<{ code: string; message: string; slide: number; role?: string; snippet: string }> {
  const failures: Array<{ code: string; message: string; slide: number; role?: string; snippet: string }> = []
  const closeIdx = slides.length - 1
  const closeText = `${slides[closeIdx]?.title || ''} ${slides[closeIdx]?.body || ''}`.trim()
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i]
    const prior = slides.slice(0, i).map((s) => ({ title: s.title, body: s.body }))
    if (isParaphraseSlideCopy(slide.title || '', slide.body || '', prior)) {
      failures.push({
        code: 'duplicate_slide_paraphrase',
        message: 'Slide paraphrases an earlier slide instead of adding a new beat',
        slide: i + 1,
        role: slide.role,
        snippet: `${slide.title || ''} ${slide.body || ''}`.trim().slice(0, 140),
      })
    }
    if (
      i < closeIdx &&
      (slide.role === 'build' || slide.role === 'context') &&
      closeText &&
      isBuildCloseEcho(`${slide.title || ''} ${slide.body || ''}`, closeText)
    ) {
      failures.push({
        code: 'build_close_echo',
        message: 'Build slide previews the close payoff instead of adding a new beat',
        slide: i + 1,
        role: slide.role,
        snippet: `${slide.title || ''} ${slide.body || ''}`.trim().slice(0, 140),
      })
    }
  }
  return failures
}

export function slideCopyFingerprint(title: string, body: string): string {
  return [title, body].filter(Boolean).join(' ').toLowerCase().replace(/\s+/g, ' ').trim()
}

export function slideTokenSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}]+/u)
      .filter((w) => w.length >= 4),
  )
}

export function tokenOverlapRatio(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const w of a) if (b.has(w)) inter++
  return inter / Math.min(a.size, b.size)
}

export function isDuplicateSlideCopy(
  title: string,
  body: string,
  prior: Array<{ title?: string; body?: string; text?: string }>,
): boolean {
  const key = slideCopyFingerprint(title, body)
  if (key.length < 24) return false
  const keyTokens = slideTokenSet(key)
  const keyBody = slideCopyFingerprint('', body)
  for (const p of prior) {
    const pKey = p.text
      ? slideCopyFingerprint('', p.text)
      : slideCopyFingerprint(p.title || '', p.body || '')
    if (!pKey || pKey.length < 24) continue
    if (key === pKey) return true
    const shorter = key.length < pKey.length ? key : pKey
    const longer = key.length < pKey.length ? pKey : key
    if (shorter.length >= 40 && longer.includes(shorter.slice(0, Math.min(50, shorter.length)))) {
      return true
    }
    // Shared opening beat (close echoing hook opener)
    if (shorter.length >= 28 && longer.includes(shorter.slice(0, 28))) {
      return true
    }
    const pBody = p.text ? pKey : slideCopyFingerprint('', p.body || '')
    if (keyBody.length >= 24 && pBody.length >= 24) {
      const headK = keyBody.slice(0, 24)
      const headP = pBody.slice(0, 24)
      if (keyBody.includes(headP) || pBody.includes(headK)) return true
    }
    // Near-paraphrase (close echoing hook / prior slide)
    if (key.length >= 36 && pKey.length >= 36 && tokenOverlapRatio(keyTokens, slideTokenSet(pKey)) >= 0.55) {
      return true
    }
  }
  return false
}
