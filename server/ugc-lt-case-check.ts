/**
 * Bounded verb→case agreement checker for Lithuanian UGC copy.
 * Heuristic layer — not full parsing; catches novel nouns in known verb slots.
 */

export type LtCaseRequirement = 'accusative' | 'genitive' | 'instrumental' | 'dative'

const ACCUSATIVE_VERB_STEMS = [
  'sukelti',
  'sukelia',
  'sukuria',
  'ruošti',
  'ruošia',
  'sukurti',
  'pasirinkti',
  'pasirenka',
  'rinkti',
  'renka',
  'mažinti',
  'mažina',
  'didinti',
  'didina',
  'keisti',
  'keičia',
  'valgyti',
  'valgo',
  'maitina',
  'maitinti',
  'sumažina',
  'didina',
  'skatina',
  'skatinti',
  'palaiko',
]

const GENITIVE_VERB_STEMS = [
  'ieško',
  'ieškoti',
  'reikalauti',
  'reikalauja',
  'vengti',
  'vengia',
  'trūkti',
  'trūksta',
  'siekti',
  'siekia',
  'reikia',
  'nori',
  'bijoti',
  'bijo',
]

const DATIVE_VERB_STEMS = ['trukdyti', 'trukdžia']

/** Genitive/reflexive forms wrongly used as accusative object. */
const WRONG_ACCUSATIVE_PRONOUNS = new Set(['tavęs', 'jūsų', 'manęs', 'mūsų'])

const PREPOSITIONS = new Set([
  'į',
  'iš',
  'nuo',
  'iki',
  'apie',
  'prie',
  'po',
  'per',
  'su',
  'be',
  'ant',
  'virš',
  'tarp',
  'dėl',
  'kad',
  'ir',
  'ar',
  'bet',
])

// A following time expression is not the head of the verb's object phrase.
const TEMPORAL_ACCUSATIVE_WORDS = new Set(['rytą', 'popietę', 'vakarą', 'naktį', 'savaitgalį'])

/** Genitive-looking word endings (heuristic): -io, -ių, -ų, -os, -ės, -o, -aus */
export const LT_GENITIVE_ENDING_RE = /(?:io|ių|ų|os|ės|o|aus)$/iu

/** Accusative-looking endings (incl. common masc/fem/plural acc). */
const ACCUSATIVE_ENDING_RE = /(?:ą|ę|us|ius|į)$/iu

const INFINITIVE_RE = /(?:ti|tis)$/iu

const NOMINATIVE_HEAD_RE = /(?:ija|imas|umas|ystė|ė|as|is|us)$/iu
const INSTRUMENTAL_HEAD_RE = /(?:iu|imi|um)$/iu

/** True when token ends in a common Lithuanian genitive suffix (not full parsing). */
export function looksLtGenitiveEnding(token: string): boolean {
  if (!token || token.length < 4) return false
  const w = token.toLocaleLowerCase('lt-LT')
  if (INFINITIVE_RE.test(w)) return false
  return LT_GENITIVE_ENDING_RE.test(w)
}

function tokenize(sentence: string): string[] {
  return String(sentence || '')
    .replace(/[^\p{L}\s'-]/gu, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
}

function stemMatches(token: string, stems: string[]): boolean {
  const lower = token.toLocaleLowerCase('lt-LT')
  return stems.some((stem) => lower === stem || lower.startsWith(stem))
}

function looksGenitive(token: string): boolean {
  return looksLtGenitiveEnding(token)
}

function looksAccusative(token: string): boolean {
  if (!token || token.length < 4) return false
  if (INFINITIVE_RE.test(token)) return false
  return ACCUSATIVE_ENDING_RE.test(token)
}

function looksNominativeFeminine(token: string): boolean {
  if (!token || token.length < 4) return false
  if (INFINITIVE_RE.test(token)) return false
  const w = token.toLocaleLowerCase('lt-LT')
  return /a$/u.test(w) && !looksGenitive(token) && !looksAccusative(token)
}

export type LtCaseAgreementIssue = {
  code: 'case_agreement'
  verb: string
  object: string
  expected: LtCaseRequirement
  snippet: string
}

function checkVerbObject(
  verb: string,
  objectToken: string,
  required: LtCaseRequirement,
  sentence: string,
): LtCaseAgreementIssue | null {
  if (!objectToken || objectToken.length < 3) return null
  if (PREPOSITIONS.has(objectToken.toLocaleLowerCase('lt-LT'))) return null
  if (INFINITIVE_RE.test(objectToken)) return null

  const lowerObject = objectToken.toLocaleLowerCase('lt-LT')

  if (required === 'accusative' && WRONG_ACCUSATIVE_PRONOUNS.has(lowerObject)) {
    return {
      code: 'case_agreement',
      verb,
      object: objectToken,
      expected: 'accusative',
      snippet: sentence.slice(0, 140),
    }
  }

  if (required === 'dative' && looksAccusative(objectToken) && /ą$/iu.test(objectToken)) {
    return {
      code: 'case_agreement',
      verb,
      object: objectToken,
      expected: 'dative',
      snippet: sentence.slice(0, 140),
    }
  }

  const mismatch =
    required === 'accusative'
      ? looksGenitive(objectToken) && !looksAccusative(objectToken)
      : required === 'genitive'
        ? (looksAccusative(objectToken) || looksNominativeFeminine(objectToken)) &&
          !looksGenitive(objectToken)
        : false

  if (!mismatch) return null

  return {
    code: 'case_agreement',
    verb,
    object: objectToken,
    expected: required,
    snippet: sentence.slice(0, 140),
  }
}

export function collectLtCaseAgreementIssues(text: string): LtCaseAgreementIssue[] {
  const issues: LtCaseAgreementIssue[] = []
  const sentences = String(text || '')
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)

  for (const sentence of sentences) {
    const tokens = tokenize(sentence)
    for (let i = 0; i < tokens.length; i++) {
      const verb = tokens[i]
      let required: LtCaseRequirement | null = null
      if (stemMatches(verb, ACCUSATIVE_VERB_STEMS)) required = 'accusative'
      else if (stemMatches(verb, GENITIVE_VERB_STEMS)) required = 'genitive'
      else if (stemMatches(verb, DATIVE_VERB_STEMS)) required = 'dative'
      else continue

      for (let j = i + 1; j < Math.min(i + 4, tokens.length); j++) {
        const objectToken = tokens[j]
        if (PREPOSITIONS.has(objectToken.toLocaleLowerCase('lt-LT'))) continue
        if (required === 'accusative' && looksGenitive(objectToken)) {
          // Genitive modifiers before the object: „keramikos arbatos rinkinį“.
          let k = j + 1
          while (k < Math.min(j + 3, tokens.length) && looksGenitive(tokens[k]) && !looksAccusative(tokens[k]) && !/ių$/iu.test(tokens[k])) k++
          const next = tokens[k]
          // -ių is also the accusative of -ius nouns: „kvapo difuzorių“, „advento kalendorių“.
          const accusativeNext = next && (looksAccusative(next) || (k > j && /ių$/iu.test(next)))
          if (accusativeNext && !TEMPORAL_ACCUSATIVE_WORDS.has(next.toLocaleLowerCase('lt-LT'))) {
            continue
          }
        }
        // „rinktis kvapo difuzorių“: after a genitive modifier, -ių is the -ius accusative.
        if (required === 'accusative' && j > i + 1 && /ių$/iu.test(objectToken) && looksGenitive(tokens[j - 1])) break
        const issue = checkVerbObject(verb, objectToken, required, sentence)
        if (issue) {
          issues.push(issue)
          break
        }
        if (objectToken.length >= 4 && !INFINITIVE_RE.test(objectToken)) break
      }
    }
  }
  return issues
}

export type LtInstrumentalIssue = {
  code: 'instrumental_after_tampa'
  complement: string
  snippet: string
}

/** Flag nominative complement after tapo/tampa (needs instrumental). */
export function collectLtInstrumentalIssues(text: string): LtInstrumentalIssue[] {
  const issues: LtInstrumentalIssue[] = []
  const re = /\b(tampa|tapo|taps)\s+(\p{L}{4,})\b/giu
  let m: RegExpExecArray | null
  const raw = String(text || '')
  while ((m = re.exec(raw))) {
    const complement = m[2]
    if (INFINITIVE_RE.test(complement)) continue
    if (NOMINATIVE_HEAD_RE.test(complement) && !INSTRUMENTAL_HEAD_RE.test(complement)) {
      issues.push({
        code: 'instrumental_after_tampa',
        complement,
        snippet: raw.slice(Math.max(0, m.index - 20), m.index + m[0].length + 40).slice(0, 140),
      })
    }
  }
  return issues
}

/** High-confidence repairs for verb→case slips (streso→stresą, etc.). */
export function repairLtCaseAgreement(text: string): string {
  let out = String(text || '')
  const pairs: Array<[RegExp, string]> = [
    [/\bsukelia\s+streso\b/giu, 'sukelia stresą'],
    [/\bsukelia\s+diskomforto\b/giu, 'sukelia diskomfortą'],
    [/\bsukelia\s+(\w{4,})o\b/giu, 'sukelia $1ą'],
    [/\bruošti\s+maisto\b/giu, 'ruošti maistą'],
    [/\bsukurti\s+tinkančių\s+receptų\b/giu, 'sukurti tinkančius receptus'],
    [/\btrūksta\s+energija\b/giu, 'trūksta energijos'],
    [/\btrūksta\s+jėga\b/giu, 'trūksta jėgų'],
    [/\bmaitina\s+tavęs\b/giu, 'maitina tave'],
    [/\bmaitina\s+jūsų\b/giu, 'maitina tave'],
    [/\bvalgyti\s+tavęs\b/giu, 'valgyti tave'],
    [/\bpasiduoti\s+saldumams\b/giu, 'pasiduoti saldumynams'],
    [/\b(tampa|tapo)\s+iššūkis\b/giu, '$1 iššūkiu'],
    [/\b(tampa|tapo)\s+malonumas\b/giu, '$1 malonumu'],
    [/\btrukdyti\s+tavo\s+kasdienę\s+veiklą\b/giu, 'trukdyti tavo kasdienei veiklai'],
  ]
  for (const [re, rep] of pairs) out = out.replace(re, rep)
  return out
}

export type LtArCoordinationIssue = {
  code: 'ar_coordination_mismatch'
  left: string
  right: string
  snippet: string
}

/** Heuristic: nominative head before „ar" coordinated with instrumental head after. */
export function collectLtArCoordinationIssues(text: string): LtArCoordinationIssue[] {
  const issues: LtArCoordinationIssue[] = []
  const sentences = String(text || '')
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)

  for (const sentence of sentences) {
    const segments = sentence.split(/\s+ar\s+/iu)
    if (segments.length < 2) continue
    for (let i = 0; i < segments.length - 1; i++) {
      const leftTokens = tokenize(segments[i])
      const rightTokens = tokenize(segments[i + 1])
      const leftHead = leftTokens.at(-1)
      const rightHead = rightTokens.at(-1)
      if (!leftHead || !rightHead || leftHead.length < 4 || rightHead.length < 4) continue
      if (INFINITIVE_RE.test(leftHead) || INFINITIVE_RE.test(rightHead)) continue
      if (NOMINATIVE_HEAD_RE.test(leftHead) && INSTRUMENTAL_HEAD_RE.test(rightHead)) {
        issues.push({
          code: 'ar_coordination_mismatch',
          left: leftHead,
          right: rightHead,
          snippet: sentence.slice(0, 140),
        })
        break
      }
    }
  }
  return issues
}
