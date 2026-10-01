/** Lithuanian copy normalisation: phrase passes, register, punctuation and sentence repairs. (Split out of ugc-lt-normalize.ts.) */

import { isChristmasGiftsNiche } from '../profile-brand.js'
import { ugcActiveCta } from '../ugc-cta-normalize.js'
import { isAllowedKaleduCta } from '../ugc-kaledu-cta.js'
import { repairLtCaseAgreement } from '../ugc-lt-case-check.js'
import { applyUniversalLtClassRepairs } from '../ugc-lt-classes.js'
import { sanitizeLtSeasonCopy } from '../ugc-season-context.js'
import { FORMAL_TO_TU, PHRASE_FIXES } from './phrase-fixes.js'
export { FORMAL_TO_TU, PHRASE_FIXES } from './phrase-fixes.js'

/**
 * Canonical LT sentence-initial interrogative words — single source of truth for
 * "does this title/sentence need a trailing '?'" checks across the codebase.
 */
export const LT_QUESTION_STARTER_RE = /^(Ar|Kodėl|Kaip|Argi)\b/iu

/** Final clause question words (colon-hook titles: „Label: kodėl …?"). */
export const LT_QUESTION_WORD_START_RE = /^(Ar|Kodėl|Kaip|Ką|Kas|Kur|Kada|Kiek|Ko|Argi)\b/iu

/** Rhetorical yes/no without „Ar" — valid hook/body questions (declarative-? exemption). */
export const LT_RHETORICAL_QUESTION_VERB_RE =
  /^(jauti|nori|žinai|supranti|galvoji|jautiesi|stengiesi|planuoji|esi|gali|negali|įsisavini)\b/iu

/** Direct tu-form rhetorical questions — repair + ship gate (not declarative „Supranti, kad…"). */
export const LT_RHETORICAL_DIRECT_QUESTION_RE =
  /^(?:tu\s+)?(?:galbūt\s+)?(jauti|nori|norėtum|jautiesi|stengiesi|planuoji|įsisavini|matai|bijoji|drįsti|pasiruoši|galvoji)\b/iu

/** Declarative insight — keep trailing „." (build/close payoff). */
export const LT_DECLARATIVE_INSIGHT_RE = /^(prisimink|žinai|žinoji)\s*,\s*(kad|jog)\b/iu

export const LT_RHETORICAL_PARTICIPLE_HOOK_RE = /^(pavargęs|pavargusi|įstrigęs|įstrigusi)\b/iu

/**
 * Apply [RegExp, replacement] rewrites while preserving matched text casing on output.
 * Case-insensitive rules no longer capitalize mid-sentence lowercase matches.
 */
export function applyCasePreserving(text: string, re: RegExp, replacement: string): string {
  if (!re.flags.includes('i')) return text.replace(re, replacement)
  return text.replace(re, (matched: string, ...rest: unknown[]) => {
    const groups = rest.slice(0, rest.length - 2) as string[]
    const substituted = replacement.replace(/\$(\d)/g, (_m, digit: string) => {
      const idx = Number(digit) - 1
      return groups[idx] ?? ''
    })
    const letters = matched.match(/\p{L}/gu)
    if (!letters || !letters.length) return substituted
    const firstLetterIdx = substituted.search(/\p{L}/u)
    if (firstLetterIdx === -1) return substituted
    const isAllCaps = letters.length > 1 && letters.every((c) => c === c.toUpperCase() && c !== c.toLowerCase())
    if (isAllCaps) return substituted.toUpperCase()
    const firstIsUpper = letters[0] === letters[0].toUpperCase() && letters[0] !== letters[0].toLowerCase()
    const targetCase =
      firstIsUpper ? substituted.charAt(firstLetterIdx).toUpperCase() : substituted.charAt(firstLetterIdx).toLowerCase()
    return substituted.slice(0, firstLetterIdx) + targetCase + substituted.slice(firstLetterIdx + 1)
  })
}

/** Convert residual first-person copy to the required reader-facing „tu" register. */
export function normalizePersonRegister(text: string): string {
  return text
    .replace(/(?<!\p{L})jaučiu(?!\p{L})/giu, 'jauti')
    .replace(/(?<!\p{L})jaučiuosi(?!\p{L})/giu, 'jauti')
    .replace(/(?<!\p{L})noriu(?!\p{L})/giu, 'nori')
    .replace(/(?<!\p{L})suprantu(?!\p{L})/giu, 'supranti')
    .replace(/(?<!\p{L})įsitikinau(?!\p{L})/giu, 'įsitikinai')
    .replace(/(?<!\p{L})pastebėjau(?!\p{L})/giu, 'pastebėjai')
    .replace(/(?<!\p{L})pradėjau(?!\p{L})/giu, 'pradėjai')
    .replace(/(?<!\p{L})galėčiau(?!\p{L})/giu, 'galėtum')
    .replace(/(?<!\p{L})patenkinčiau(?!\p{L})/giu, 'patenkintum')
    .replace(/(?<!\p{L})planuoju(?!\p{L})/giu, 'planuoji')
    .replace(/(?<!\p{L})randu(?!\p{L})/giu, 'randi')
    .replace(/(?<!\p{L})užsisakiau(?!\p{L})/giu, 'užsisakei')
    .replace(/(?<!\p{L})norėjau(?!\p{L})/giu, 'norėjai')
    .replace(/(?<!\p{L})atsisakiau(?!\p{L})/giu, 'atsisakei')
    .replace(/(?<!\p{L})planavau(?!\p{L})/giu, 'planavai')
    .replace(/(?<!\p{L})nusprendžiau(?!\p{L})/giu, 'nusprendei')
    .replace(/(?<!\p{L})nežinojau(?!\p{L})/giu, 'nežinojai')
    .replace(/(?<!\p{L})žinojau(?!\p{L})/giu, 'žinojai')
    .replace(/(?<!\p{L})maniau(?!\p{L})/giu, 'manei')
    .replace(/(?<!\p{L})bandžiau(?!\p{L})/giu, 'bandei')
    .replace(/(?<!\p{L})supratau(?!\p{L})/giu, 'supratai')
    .replace(/(?<!\p{L})jaučiau(?!\p{L})/giu, 'jautei')
    .replace(/(?<!\p{L})suprantame(?!\p{L})/giu, 'supranti')
    .replace(/(?<!\p{L})galime(?!\p{L})/giu, 'gali')
    .replace(/(?<!\p{L})galėsime(?!\p{L})/giu, 'galėsi')
    .replace(/(?<!\p{L})norėjome(?!\p{L})/giu, 'norėjai')
    .replace(/(?<!\p{L})turime(?!\p{L})/giu, 'turi')
    .replace(/(?<!\p{L})mums(?!\p{L})/giu, 'tau')
    .replace(/(?<!\p{L})mūsų(?!\p{L})/giu, 'tavo')
    .replace(/(?<!\p{L})aš\s+/giu, '')
}

export function repairRhetoricalTuQuestionMarks(text: string): string {
  const parts = String(text || '')
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (!parts.length) return text
  return parts
    .map((sentence) => {
      if (!sentence.endsWith('.')) return sentence
      const bare = sentence.replace(/\.\s*$/u, '').trim()
      if (!bare) return sentence
      if (LT_QUESTION_WORD_START_RE.test(bare) || LT_QUESTION_STARTER_RE.test(bare)) return sentence
      if (LT_DECLARATIVE_INSIGHT_RE.test(bare)) return sentence
      if (LT_RHETORICAL_DIRECT_QUESTION_RE.test(bare) || LT_RHETORICAL_PARTICIPLE_HOOK_RE.test(bare)) {
        return `${bare}?`
      }
      return sentence
    })
    .join(' ')
}

export function applyLtPhrasePasses(text: string): string {
  let out = text
  for (const [re, rep] of FORMAL_TO_TU) out = applyCasePreserving(out, re, rep)
  for (let pass = 0; pass < 2; pass++) {
    for (const [re, rep] of PHRASE_FIXES) out = applyCasePreserving(out, re, rep)
    out = out.replace(/\bŠtai kodėl(?:\s+neverta)+\s+/giu, 'Štai kodėl neverta ')
  }
  out = repairLtCaseAgreement(out)
  out = repairRhetoricalTuQuestionMarks(out)
  out = applyUniversalLtClassRepairs(out)
  out = repairDeclarativeQuestionMarks(out)
  return normalizePersonRegister(out)
}

/** Strip stray „?" from declarative sentences (rule 13 backup after PHRASE_FIXES). */
export function repairDeclarativeQuestionMarks(text: string): string {
  const parts = String(text || '')
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (!parts.length) return text
  return parts
    .map((sentence) => (isDeclarativeQuestionMark(sentence) ? sentence.replace(/\?\s*$/, '.') : sentence))
    .join(' ')
}

/** Capitalize sentence starts after repairs — skip mid-clause fragments (…, nes, kad). */
export function polishLtCaps(text: string): string {
  const continuation = /^(nes|kad|bet|ir|arba|todėl|kai|jei|kol|nors|tačiau|dėl)$/iu
  let out = text.replace(/([.!?…]\s+)([a-ząčęėįšųūž]\p{L}*)/gu, (_, pre: string, word: string) =>
    continuation.test(word) ? pre + word : pre + word.charAt(0).toUpperCase() + word.slice(1),
  )
  const trimmed = out.trimStart()
  const lead = out.slice(0, out.length - trimmed.length)
  if (!trimmed || !/^[a-ząčęėįšųūž]/.test(trimmed)) return out
  if (/^\.{2,}/.test(trimmed) || /^…/.test(trimmed)) return out
  if (continuation.test(trimmed.split(/\s+/)[0] || '')) return out
  return lead + trimmed.replace(/^([a-ząčęėįšųūž])/u, (_, c: string) => c.toUpperCase())
}

/** Remove em/en dashes from generated LT copy; split into separate sentences. */
export function stripLtEmDashes(text: string): string {
  let out = text
    .replace(/\s*—\s*/g, '. ')
    .replace(/\s*–\s*/g, '. ')
    .replace(/\.\s*\./g, '.')
    // Capitalize after sentence end — skip abbreviations like min. / val. / pvz.
    .replace(/(?<!\b(?:min|val|pvz|nr|el))\.\s+([a-ząčęėįšųūž])/giu, (_, c) => `. ${c.toUpperCase()}`)
  return out.trim()
}

export function splitLinesAndSentences(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n+/)
    .flatMap((block) => block.split(/(?<=[.!?…])\s+/))
    .map((s) => s.trim())
    .filter(Boolean)
}

export function dedupeMesOpeners(text: string, priorMesCount: number): { text: string; mesCount: number } {
  const parts = text.includes('\n') ? text.split('\n') : splitLinesAndSentences(text)
  let mesUsed = priorMesCount
  const out: string[] = []

  for (let part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue
    if (/^Mes[\s,]/i.test(trimmed)) {
      if (mesUsed >= 1) {
        part = trimmed.replace(/^Mes[\s,]+/i, 'Tai ')
      }
      mesUsed++
    }
    out.push(part)
  }

  return {
    text: text.includes('\n') ? out.join('\n') : out.join(' '),
    mesCount: mesUsed,
  }
}

export type NormalizeLtCopyState = { mesOpenerCount: number }

/** Strip CTA spam + all emoji from slide body/title (CTA lives only in cta field). */
export function stripLtBodyJunk(text: string): string {
  let out = String(text || '')
  // Full CTA spam variants (emoji repeated) — including website CTA
  out = out.replace(/Apsilankyk\s*tavoknyga\.com[^.!\n]*(?:[.!]?\s*🤩*)*/giu, '')
  out = out.replace(/Pradėk\s*5\s*min\.?\s*testą([!\s?.]*🤩*)+/giu, '')
  out = out.replace(/Pradėk\s*5\s*min\.?/giu, '')
  out = out.replace(/\btavoknyga\.com\b/giu, '')
  out = out.replace(/Rask\s+dovaną\s+Kalėdų\s+Kampelyje[^.!\n]*/giu, '')
  out = out.replace(/\bkaledukampelis\.(?:lt|com)\b/giu, '')
  // Tavo: strip all pictographs. Christmas: keep (emoji budget runs later).
  if (!isChristmasGiftsNiche()) {
    out = out.replace(/\p{Extended_Pictographic}/gu, '')
  }
  out = out.replace(/!{2,}/g, '!')
  out = out.replace(/[ \t]{2,}/g, ' ')
  out = out.replace(/ +\n/g, '\n')
  out = out.replace(/\n{3,}/g, '\n\n')
  out = out.replace(/[ \t]+([.,!?])/g, '$1')
  out = out.replace(/^\.+\s*$/gm, '')
  return out.trim()
}

export function normalizeLtUgcCopy(text: string, state: NormalizeLtCopyState = { mesOpenerCount: 0 }): string {
  let out = applyLtPhrasePasses(text)

  const deduped = dedupeMesOpeners(out, state.mesOpenerCount)
  state.mesOpenerCount = deduped.mesCount
  return polishLtCaps(
    stripLtBodyJunk(
      repairIncompleteLtSentence(stripLtEmDashes(deduped.text.replace(/\s+/g, ' ').replace(/ \n /g, '\n').trim())),
    ),
  )
}

export function normalizeLtUgcMultiline(text: string, state: NormalizeLtCopyState = { mesOpenerCount: 0 }): string {
  let out = applyLtPhrasePasses(text)

  const deduped = dedupeMesOpeners(out, state.mesOpenerCount)
  state.mesOpenerCount = deduped.mesCount
  const lines = deduped.text.split('\n').map((line) => repairIncompleteLtSentence(line))
  let sanitized = sanitizeLtSeasonCopy(stripLtEmDashes(lines.join('\n').trim()))
  sanitized = applyLtPhrasePasses(sanitized)
  sanitized = mergeStubSentences(sanitized)
  return polishLtCaps(stripLtBodyJunk(sanitized))
}

export function sanitizeLtCopyFields(fields: {
  title?: string
  body?: string
  cta?: string
}): { title: string; body: string; cta?: string } {
  const state: NormalizeLtCopyState = { mesOpenerCount: 0 }
  // Never run body normalizer on CTA — it strips emoji / rewrites the branded line
  return {
    title: fields.title ? normalizeLtUgcMultiline(fields.title, state) : '',
    body: fields.body ? normalizeLtUgcMultiline(fields.body, state) : '',
    ...(fields.cta !== undefined
      ? {
          cta: isChristmasGiftsNiche() && isAllowedKaleduCta(fields.cta)
            ? fields.cta.trim()
            : ugcActiveCta(),
        }
      : {}),
  }
}

export function splitShipableSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Merge one-word orphan stubs: „…aplinkybės. Keistis. Todėl…" → „…aplinkybės keičiasi. Todėl…" */
export function mergeStubSentences(text: string): string {
  const parts = splitShipableSentences(text)
  if (parts.length < 2) return text
  const merged: string[] = []
  for (const s of parts) {
    const bare = s.replace(/[.!?…]+$/u, '').trim()
    const words = bare.split(/\s+/).filter(Boolean)
    if (words.length === 1 && bare.length < 14 && merged.length) {
      const prev = merged.pop()!.replace(/[.!?…]+$/u, '').trim()
      merged.push(`${prev} ${bare.charAt(0).toLowerCase()}${bare.slice(1)}.`)
    } else {
      merged.push(s)
    }
  }
  return merged.join(' ')
}

/**
 * Rule 13 — flag declarative subject + modal verb + stray „?", not missing „Ar".
 * Colon-aware: checks final clause before „?". Rhetorical „Jauti…?" passes.
 */
// Fail-list is intentionally non-exhaustive (gali|sukelia|veikia|paveikia|tampa|reiškia|leidžia).
// Sentences with a declarative shape using a verb outside this list will pass silently — deliberate tradeoff.
// The two-pass LLM QA re-prompt is the backstop. Extend this list if the same bug class resurfaces.
export const DECLARATIVE_QUESTION_MODAL_RE =
  /\b(gali|sukelia|veikia|paveikia|tampa|reiškia|leidžia)\b/iu

/** Genuine rhetorical „Tai gali (būti)…?" — not declarative+modal false positive. */
export const LT_TAI_GALI_QUESTION_RE = /^Tai\s+gali(?:\s+būti)?\b/iu

export function isDeclarativeQuestionMark(sentence: string): boolean {
  const s = String(sentence || '').trim()
  if (!s.endsWith('?')) return false
  const segments = s.split(/[:;]/)
  const finalSeg = segments[segments.length - 1]?.trim() || ''
  if (!finalSeg) return false
  if (LT_QUESTION_WORD_START_RE.test(finalSeg)) return false
  if (LT_RHETORICAL_QUESTION_VERB_RE.test(finalSeg)) return false
  if (LT_RHETORICAL_PARTICIPLE_HOOK_RE.test(finalSeg)) return false
  if (LT_TAI_GALI_QUESTION_RE.test(finalSeg)) return false
  if (!DECLARATIVE_QUESTION_MODAL_RE.test(finalSeg)) return false
  return true
}

/** Fix truncated / nonsense endings from weak model outputs. */
export function repairIncompleteLtSentence(text: string): string {
  let out = text.trim()
  if (!out) return out
  // Trailing "bet tai." / "bet tai"
  out = out.replace(/\bbet tai\.?\s*$/iu, 'bet tai puiki pradžia.')
  // Known mid-word truncations from screenshots
  out = out.replace(/\bsojos gami\.?\s*$/iu, 'sojos gaminiai.')
  out = out.replace(/\bvegan baltymai\.?\s*$/iu, 'veganiški baltymai.')
  out = out.replace(/\bmaistinu\.?\s*$/iu, 'maitinimu.')
  out = out.replace(/\bangidrat[uų]?\.?\s*$/iu, 'angliavandenių.')
  out = out.replace(/\bPapildomai įkrauti\.?\s*$/iu, 'Papildomai įkrauk energiją vaisiais.')
  out = out.replace(/\bLengvų angliavandenių ir baltymų\.?\s*$/iu, 'Rinkis lengvus angliavandenius ir baltymus.')
  out = out.replace(/\bŠtai kodėl\s+(?!neverta\b)([a-ząčęėįšųūž]+oti(?:s)?)\b/iu, 'Štai kodėl neverta $1')
  // Incomplete CTA in body → drop (canonical CTA is only in cta field)
  out = out.replace(/\bPradėk 5 min\.?\s*(testą)?([!\s?.]*🤩*)*\s*$/iu, '')
  out = out.replace(/\bApsilankyk\s*tavoknyga\.com[^.!\n]*$/iu, '')
  out = out.replace(/\btavoknyga\.com\s*$/iu, '')
  out = out.replace(/\bRask\s+dovaną\s+Kalėdų\s+Kampelyje[^.!\n]*$/iu, '')
  out = out.replace(/\bkaledukampelis\.(?:lt|com)\s*$/iu, '')
  // Trailing "kad" / "kad." dangling
  out = out.replace(/\bkad\.?\s*$/iu, '')
  // Sentence ending mid-clause with only a period after short stump
  if (/\b(bet|kad|ir|arba|nes)\s*$/iu.test(out)) {
    out = out.replace(/\s+(bet|kad|ir|arba|nes)\s*$/iu, '.')
  }
  return out.replace(/\s+/g, ' ').replace(/\.\s*\./g, '.').trim()
}
