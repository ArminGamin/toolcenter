/**
 * Universal LT failure-class repairs and gates (not one-off Discord patches).
 * Each class catches a family of errors; phrase bank entries are seeds only.
 */

import type { UgcStoryGateFailure } from './ugc-lt-normalize.js'

type LtRepair = [RegExp, string | ((match: string) => string)]

/** Wrong 2sg present — family repairs (extend list, not one word tickets). */
const CONJ_2SG_REPAIRS: LtRepair[] = [[/\bvalgoi\b/giu, 'valgai']]

/** pasitaikyti (happen) vs prisitaikyti (adapt) — shared by repair + gate. */
export const PASITAIKYTI_WRONG_RE = /\b(pasitaikyti|pasitaiko|pasitaikytų)\b/iu
export const PASITAIKYTI_ADAPT_CONTEXT_RE = /\b(aplink|nauj|situac|aplinkoje)\b/iu

export function hasPasitaikytiVerbSenseError(text: string): boolean {
  return PASITAIKYTI_WRONG_RE.test(text) && PASITAIKYTI_ADAPT_CONTEXT_RE.test(text)
}

function repairPasitaikytiVerbSense(text: string): string {
  if (!PASITAIKYTI_ADAPT_CONTEXT_RE.test(text)) return text
  return text
    .replace(/\bpasitaikyti\b/giu, 'prisitaikyti')
    .replace(/\bpasitaiko\b/giu, 'prisitaiko')
    .replace(/\bpasitaikytų\b/giu, 'prisitaikytų')
}

/** Singular/plural agreement for common nutrition nouns. */
const AGR_NUMBER_REPAIRS: LtRepair[] = [
  [
    /\bgreitas angliavanden\w*\b/giu,
    (m) => (/^[A-ZĄČĘĖĮŠŲŪŽ]/.test(m) ? 'Greiti angliavandeniai' : 'greiti angliavandeniai'),
  ],
]

const QMARK_SENT_START = /^(Ar|Argi|Kodėl|Kaip|Kas|Kur|Kada|Ką)\b/iu

/** Colon + interrogative word, or line starts with a question word — no nested .* (ReDoS-safe). */
function needsQuestionMarkTitle(text: string): boolean {
  const t = text.trim()
  if (!t || t.endsWith('?')) return false
  if (QMARK_SENT_START.test(t)) return true
  return /^[^:]+:\s*(?:ar|kodėl|ką|kaip|kas|kur|kada|kiek)\b/iu.test(t)
}

/** Subordinate clause comma — omit kaip after lengva/dažnai (comparison idiom). */
const COMMA_SUBORD_KAS_RE =
  /(?<!\p{L})(žinai|žinosi|supranti|galvoji|pamiršti|pamiršai|sprendi|nežinai|suvoki)\s+(kas|ką|kodėl|kur|kada)(?!\p{L})/giu

const COMMA_SUBORD_KAIP_RE =
  /(?<!\p{L})(žinai|žinosi|supranti|nežinai|suvoki)\s+kaip(?!\p{L})/giu

const EARLY_PITCH_RE =
  /\b(Tavo knyga padės|tavo knyga padeda|[„""]?tavo knyga[""]?\s+padės|naudojant\s+[„""]?tavo knyga|su\s+[„""]?tavo knyga|[„""]?tavo knyga[""]?|tavoknyga|[„""]?kalėdų kampelis[""]?|kaledukampelis|Kalėdų Kampelis padės|Dabar\s+(?:žinai|supranti|gali|mėgaujiesi),?\s+(?:kad|kaip|ką)|Štai kodėl\s+.+\s+padės|individualizuot\w+ plan\w+|asmeninis planas|šis sprendimas leidžia|maisto rinkinys (?:leidžia|padeda)|planas (?:leidžia|padeda)|testas\s+(?:per kelias minutes\s+)?(?:atskleidžia|parodo|padės|padeda))\b/iu

export function hasEarlyProductPitch(text: string): boolean {
  return EARLY_PITCH_RE.test(text)
}

/** Shared stem for circular causal claims (stresas/stresą, alkis/alkį, …). */
export function ltCausalStem(token: string): string {
  const w = String(token || '')
    .toLocaleLowerCase('lt-LT')
    .replace(/[^\p{L}]/gu, '')
  if (w.length < 4) return w
  return w.replace(/(?:ą|ę|į|ų|us|ius|io|ės|os|oje|oje|ui|iu|imi|um|as|is|ys|ė|a|o)$/u, '')
}

/** True when X sukelia/lemia X (same stem) — empty circular claim. */
export function hasCircularCausalClaim(text: string): boolean {
  const re =
    /\b(\p{L}{4,})\s+(sukelia|lemia|sukuria|sukelia|skatina)\s+(\p{L}{4,})\b/giu
  let m: RegExpExecArray | null
  while ((m = re.exec(String(text || '')))) {
    const left = ltCausalStem(m[1])
    const right = ltCausalStem(m[3])
    if (left.length >= 4 && left === right) return true
  }
  return false
}

const LOGIC_LEAP_RE = /\b\w+\s+priklauso\s+nuo\s+\w+/iu

const FEMININE_MARKERS =
  /\b(Planuodama|prisitaikančią|prisitaikusi|linkusi|nepajutusi|esi linkusi|atrandi save prisitaikančią)\b/iu
const MASCULINE_MARKERS =
  /\b(Planuodamas|linkęs|nepajutęs|prisitaikęs|esi linkęs)\b/iu

const STUMP_SLIDE_RE = /^(Pamiršti\s+[^.]{3,30}\.?|[^.!?]{2,28}\.)$/iu

function applyRepairPasses(text: string, passes: LtRepair[]): string {
  let out = text
  for (const [re, rep] of passes) {
    out = typeof rep === 'function' ? out.replace(re, rep) : out.replace(re, rep)
  }
  return out
}

function splitSentencesForQmark(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n+/)
    .flatMap((block) => block.split(/(?<=[.!?…])\s+/))
    .map((s) => s.trim())
    .filter(Boolean)
}

function applySentenceQuestionMarks(text: string): string {
  const parts = splitSentencesForQmark(text)
  if (!parts.length) return text.trim()
  if (parts.length === 1) {
    const s = parts[0]
    if (s.endsWith('.') && QMARK_SENT_START.test(s) && !/^Galbūt\b/iu.test(s)) {
      return s.replace(/\.\s*$/u, '?')
    }
    return s
  }
  return parts
    .map((sentence) => {
      if (!sentence.endsWith('.')) return sentence
      if (/^Galbūt\b/iu.test(sentence)) return sentence
      if (QMARK_SENT_START.test(sentence)) return sentence.replace(/\.\s*$/u, '?')
      return sentence
    })
    .join(' ')
}

export function applyUniversalLtClassRepairs(text: string): string {
  let out = applyRepairPasses(text, CONJ_2SG_REPAIRS)
  out = repairPasitaikytiVerbSense(out)
  out = applyRepairPasses(out, AGR_NUMBER_REPAIRS)
  out = out.replace(COMMA_SUBORD_KAS_RE, '$1, $2')
  out = out.replace(COMMA_SUBORD_KAIP_RE, '$1, kaip')
  const trimmed = out.trim()
  if (needsQuestionMarkTitle(trimmed)) {
    out = `${trimmed.replace(/[.!…]+\s*$/u, '').trimEnd()}?`
  } else {
    out = trimmed
  }
  out = applySentenceQuestionMarks(out)
  return out
}

export function detectPostGenderFlip(slides: Array<{ title?: string; body?: string }>): boolean {
  let hasFem = false
  let hasMasc = false
  for (const slide of slides) {
    const t = `${slide.title || ''} ${slide.body || ''}`
    if (FEMININE_MARKERS.test(t)) hasFem = true
    if (MASCULINE_MARKERS.test(t)) hasMasc = true
  }
  return hasFem && hasMasc
}

export function captionSlideDumpScore(
  caption: string,
  slides: Array<{ title?: string; body?: string }>,
): number {
  const paras = caption
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(
      (p) =>
        p &&
        !p.startsWith('📌') &&
        !p.startsWith('•') &&
        !p.startsWith('#') &&
        !/tavoknyga\.com/i.test(p),
    )
  if (!paras.length || !slides.length) return 0
  const captionText = paras.join(' ').toLocaleLowerCase('lt-LT')
  const slideBodies = slides
    .map((s) => [s.title, s.body].filter(Boolean).join(' ').trim())
    .filter(Boolean)
  if (!slideBodies.length) return 0
  let matched = 0
  for (const body of slideBodies) {
    const norm = body.toLocaleLowerCase('lt-LT').slice(0, 80)
    if (norm.length >= 30 && captionText.includes(norm.slice(0, Math.min(60, norm.length)))) {
      matched++
    }
  }
  return matched / slideBodies.length
}

export function isCaptionSlideDump(
  caption: string,
  slides: Array<{ title?: string; body?: string }>,
): boolean {
  return captionSlideDumpScore(caption, slides) >= 0.5
}

export function collectUniversalClassStoryIssues(
  slides: Array<{ title?: string; body?: string; role?: string }>,
  _themeText = '',
): UgcStoryGateFailure[] {
  const failures: UgcStoryGateFailure[] = []
  const add = (code: string, message: string, slide: number, role?: string, snippet = '') => {
    if (!failures.some((f) => f.code === code && f.slide === slide)) {
      failures.push({ code, message, slide, role, snippet: snippet.slice(0, 140) })
    }
  }

  if (detectPostGenderFlip(slides)) {
    add(
      'gender_flip',
      'Post mixes masculine and feminine participles — pick one gender for the whole post',
      1,
      slides[0]?.role,
      `${slides[0]?.title || ''} ${slides[0]?.body || ''}`,
    )
  }

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i]
    const role = slide.role
    const text = `${slide.title || ''} ${slide.body || ''}`.trim()
    const isClose = role === 'close' || role === 'punch' || i === slides.length - 1

    if (!isClose && EARLY_PITCH_RE.test(text)) {
      add(
        'early_pitch',
        'Product/solution pitch only allowed on close slide',
        i + 1,
        role,
        text,
      )
    }

    if (hasCircularCausalClaim(text)) {
      add('circular_claim', 'Slide has circular causal claim', i + 1, role, text)
    }

    if (/\bvalgoi\b/iu.test(text)) {
      add('conj_2sg', 'Wrong 2sg conjugation (valgoi → valgai)', i + 1, role, text)
    }

    if (hasPasitaikytiVerbSenseError(text)) {
      add('verb_sense', 'Use prisitaikyti (adapt), not pasitaikyti (happen)', i + 1, role, text)
    }

    const bodyOnly = (slide.body || '').trim()
    if (bodyOnly && STUMP_SLIDE_RE.test(bodyOnly) && bodyOnly.split(/\s+/).length <= 5) {
      add('stump_slide', 'Slide body is too short or fragmentary', i + 1, role, bodyOnly)
    }

    if (i >= 2 && LOGIC_LEAP_RE.test(text)) {
      const prior = slides
        .slice(0, i)
        .map((s) => `${s.title || ''} ${s.body || ''}`)
        .join(' ')
      const leap = text.match(LOGIC_LEAP_RE)?.[0] || ''
      const subject = leap.split(/\s+priklauso/)[0]?.trim().toLowerCase() || ''
      if (subject && !prior.toLowerCase().includes(subject.slice(0, Math.min(12, subject.length)))) {
        add('logic_leap', 'Causal claim without prior setup in story', i + 1, role, text)
      }
    }
  }

  return failures
}
