/**
 * Narrow Christmas card leaks: rhetorical continuation, orphan comparisons, emphatic payoff.
 * Does not rewrite sentences that are already natural.
 */

import { findLithuanianCoherenceIssues } from './ugc-lt-sentence-qa.js'

export type CardPunctuationKind = 'question' | 'statement' | 'rhetorical_continuation' | 'emphatic_payoff'

export type OrphanComparison = {
  pass: false
  reason: 'orphan_comparison_fragment'
  original: string
  mergeWithPrevious: true
}

function bare(sentence: string): string {
  return String(sentence || '')
    .trim()
    .replace(/[.!?…]+$/u, '')
    .trim()
}

function sentences(text: string): string[] {
  return String(text || '')
    .split(/(?<=[.!?…])\s+/u)
    .map((part) => part.trim())
    .filter(Boolean)
}

const ADVICE_RE = /\b(?:turėtų|turi|verta|reikia|gali|galima|paprasčiau|pradėk|rinkis|pagalvok|pažiūrėk|ieškok|imk)\b/iu
const CONTINUATION_RE = /\b(?:bet|o)\b/iu
const CONTINUATION_GAP_RE = /\b(?:netinka|neatitinka|nepatinka|nė\s+viena|nėra)\b/iu
const ORPHAN_START_RE = /^(?:panašiai kaip|visai kaip|kaip|tarsi|lyg)\b/iu
const STANDALONE_KAIP_RE = /^kaip ir\b|\b(?:išrinkti|padovanoti|suplanuoti|verta|reikia|turi|gali|planuoti)\b/iu

export function isOrphanComparisonFragment(sentence: string): boolean {
  const text = bare(sentence)
  if (!text || STANDALONE_KAIP_RE.test(text)) return false
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length < 2 || words.length > 3) return false
  return ORPHAN_START_RE.test(text)
}

export function findOrphanComparisons(text: string): OrphanComparison[] {
  return sentences(text)
    .filter(isOrphanComparisonFragment)
    .map((original) => ({
      pass: false as const,
      reason: 'orphan_comparison_fragment' as const,
      original,
      mergeWithPrevious: true as const,
    }))
}

function mergedOk(sentence: string): boolean {
  if (isOrphanComparisonFragment(sentence)) return false
  return !findLithuanianCoherenceIssues(sentence).some((issue) => issue.repairType === 'full_sentence')
}

/** Join a dependent "Kaip / Tarsi / Lyg" fragment onto the previous sentence. */
export function mergeOrphanComparisons(text: string): { text: string; merges: number } {
  const parts = sentences(text)
  const out: string[] = []
  let merges = 0
  for (const part of parts) {
    if (out.length && isOrphanComparisonFragment(part)) {
      const prev = out[out.length - 1]
      const frag = bare(part).replace(/^(\p{Lu})/u, (letter) => letter.toLocaleLowerCase('lt-LT'))
      const merged = `${bare(prev)}, ${frag}.`
      if (mergedOk(merged)) {
        out[out.length - 1] = merged
        merges += 1
        continue
      }
    }
    out.push(part)
  }
  return { text: out.join(' '), merges }
}

export function isRhetoricalContinuation(title: string, body: string): boolean {
  if (!/\?\s*$/u.test(String(title || '').trim())) return false
  const line = bare(body)
  if (!line || ADVICE_RE.test(line)) return false
  return CONTINUATION_RE.test(line) && CONTINUATION_GAP_RE.test(line)
}

function lockQuestionTitle(title: string): string {
  const trimmed = String(title || '').trim()
  if (!/\?\s*$/u.test(trimmed)) return trimmed
  return trimmed.replace(/[.!?…]+$/u, '') + '?'
}

const DANGLING_HURRY_RE =
  /((?:net\s+)?jei|nors|kai|kol)\s+((?:labai|visai|tikrai)\s+)?skubiai(?=\s*[.!?…]|$)/giu

/** Adverb where the subordinate clause still needs a finite verb. "skubiai" elsewhere stays. */
export function repairHurriedClauses(text: string): { text: string; grammarRepair: boolean } {
  let grammarRepair = false
  let next = String(text || '').replace(DANGLING_HURRY_RE, (_full, conj: string, intens: string | undefined) => {
    grammarRepair = true
    return `${conj} ${intens || ''}skubi`.replace(/\s+/g, ' ')
  })
  if (grammarRepair && /atrasi\s+puikius\s+variantus/iu.test(next)) {
    next = next.replace(/atrasi\s+puikius\s+variantus/giu, 'rasi puikių variantų')
  }
  return { text: next, grammarRepair }
}

export function classifyCardPunctuation(input: {
  title?: string
  body?: string
  slideRole?: string
}): { kind: CardPunctuationKind; title: string; body: string; changed: boolean; merges: number } {
  const title = lockQuestionTitle(String(input.title || ''))
  const hurried = repairHurriedClauses(String(input.body || ''))
  const merged = mergeOrphanComparisons(hurried.text)
  let body = merged.text
  let changed = hurried.grammarRepair || merged.merges > 0 || title !== String(input.title || '').trim()
  if (isRhetoricalContinuation(title, body)) {
    // Recognised but left alone: a statement after a question title stays a statement.
    // Forcing „…netinka iki galo?“ made ordinary sentences read as fake questions.
    return { kind: 'rhetorical_continuation', title, body, changed, merges: merged.merges }
  }
  return { kind: 'statement', title, body, changed, merges: merged.merges }
}

const EMPHATIC_CLOSE_RE = /prisimenam\p{L}*\s+ilgiau/iu
const REASSURING_RE = /net jei skubi|dar spėsi|rasi\s+(?:puikių|gerų)\s+variant|paskutinę minutę galima rasti/iu
const ADVICE_PAYOFF_RE = /\b(?:pradėk|biudžet)\b/iu

export function applyEmphaticPayoffPunctuation<T extends { title?: string; body?: string; role?: string }>(
  slides: T[],
): { slides: T[]; repairs: number } {
  let repairs = 0
  const next = slides.map((slide) => {
    const role = slide.role || ''
    const body = String(slide.body || '')
    const reassuring = role === 'build' || role === 'close' || role === 'punch' || role === 'payoff'
    if (!reassuring) return slide
    if (role === 'build' && !REASSURING_RE.test(body)) return slide
    if ((body.match(/!/gu) || []).length >= 1) return slide
    const parts = sentences(body)
    if (!parts.length) return slide
    const last = parts[parts.length - 1]
    const emphatic = role !== 'build' && EMPHATIC_CLOSE_RE.test(last)
    const reassuringLine = REASSURING_RE.test(last) && !ADVICE_PAYOFF_RE.test(last)
    if (/\?\s*$/u.test(last) || (!emphatic && !reassuringLine)) return slide
    parts[parts.length - 1] = `${bare(last)}!`
    repairs += 1
    return { ...slide, body: parts.join(' ') }
  })
  return { slides: next, repairs }
}
