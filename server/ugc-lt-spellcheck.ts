/**
 * Lithuanian lexical safety layer (Hunspell dictionary-lt via hunspell-asm WASM).
 * Catches invented / misspelled words only. High-confidence typos are `spell_hard_fail`
 * (rewrite the whole sentence once → re-check → validated fallback; the model judge cannot
 * overrule them). Weak unknowns are `spell_note` and left to the final QA judge.
 * The checker never auto-replaces words; the only automatic fix is `repairUnambiguousLtTypos`
 * (one suggestion, diacritics only), tried before a slide is thrown away for a fallback.
 */

import { loadModule } from 'hunspell-asm'
import ltDictionary from 'dictionary-lt'
import { loadKaleduCatalog } from './ugc-kaledu-catalog.js'

/** Brand, proper nouns and approved loanwords the LT dictionary does not know. */
export const UGC_LT_PERSONAL_DICTIONARY = [
  'Kalėdų',
  'Kampelis',
  'Kampelio',
  'Kampelyje',
  'Kampeliu',
  'Kampelį',
  'kaledukampelis',
  'kalėdukampelis',
  'TikTok',
  'Reels',
  'Instagram',
  'Facebook',
  'unboxing',
  'aromaterapija',
  'difuzorius',
  'difuzoriaus',
  'difuzoriui',
  'difuzorių',
  'difuzoriumi',
  'difuzoriuje',
  'termosas',
  'LED',
  // kampùkas — diminutive of kampas (LKŽ); missing from dictionary-lt
  'kampukas',
  'kampuko',
  'kampukui',
  'kampuką',
  'kampuku',
  'kampuke',
  'kampukai',
  'kampukų',
  'kampukams',
  'kampukus',
  'kampukais',
  'kampukuose',
  // Common fabric words the dictionary lacks: merino (indeclinable), flisas
  'merino',
  'flisas',
  'fliso',
  'flisą',
  'flisu',
  'flise',
  // Catalog product words dictionary-lt lacks (kardiganas, aromaterapija, filtrėlis, plakiklis,
  // indeclinable bordo, gua sha)
  'kardiganas', 'kardigano', 'kardiganui', 'kardiganą', 'kardiganu', 'kardigane',
  'kardiganai', 'kardiganų', 'kardiganams', 'kardiganus', 'kardiganais', 'kardiganuose',
  'aromaterapijos', 'aromaterapijai', 'aromaterapiją', 'aromaterapijoje',
  'filtrėlis', 'filtrėlio', 'filtrėliui', 'filtrėlį', 'filtrėliu', 'filtrėlyje', 'filtrėliai', 'filtrėlių',
  'plakiklis', 'plakiklio', 'plakikliui', 'plakiklį', 'plakikliu', 'plakiklyje', 'plakikliai', 'plakiklių',
  'bordo',
  'gua',
  'sha',
] as const

type Speller = { spell: (word: string) => boolean; suggest: (word: string) => string[] }

let speller: Speller | null = null
let loading: Promise<Speller> | null = null

/** Load the dictionary once. Safe to call repeatedly. */
export function ensureLtSpeller(): Promise<Speller> {
  if (speller) return Promise.resolve(speller)
  if (!loading) {
    loading = (async () => {
      const factory = await loadModule()
      const aff = factory.mountBuffer(ltDictionary.aff, 'lt.aff')
      const dic = factory.mountBuffer(ltDictionary.dic, 'lt.dic')
      const hs = factory.create(aff, dic)
      for (const word of UGC_LT_PERSONAL_DICTIONARY) hs.addWord(word)
      speller = { spell: (w) => hs.spell(w), suggest: (w) => hs.suggest(w) }
      return speller
    })()
  }
  return loading
}

export function isLtSpellerReady(): boolean {
  return speller != null
}

function stemOf(word: string): string {
  const w = word.toLocaleLowerCase('lt-LT')
  return w.length <= 6 ? w : w.slice(0, Math.max(5, w.length - 2))
}

let catalogStemCache: { size: number; stems: string[]; exact: Set<string> } | null = null

function allowedCatalogTokens(): { stems: string[]; exact: Set<string> } {
  let catalog: ReturnType<typeof loadKaleduCatalog> = []
  try {
    catalog = loadKaleduCatalog()
  } catch {
    catalog = []
  }
  if (catalogStemCache && catalogStemCache.size === catalog.length) {
    return { stems: catalogStemCache.stems, exact: catalogStemCache.exact }
  }
  const raw = [
    ...UGC_LT_PERSONAL_DICTIONARY,
    ...catalog.flatMap((p) => `${p.name} ${p.slug.replace(/-/g, ' ')} ${p.tagline}`.split(/[^\p{L}]+/u)),
  ]
  const exact = new Set(raw.map((w) => w.toLocaleLowerCase('lt-LT')).filter((w) => w.length >= 3))
  const stems = [
    ...new Set(
      raw
        .filter((w) => w.length >= 4 && !(speller?.spell(w) || speller?.spell(w.toLocaleLowerCase('lt-LT'))))
        .map(stemOf),
    ),
  ]
  catalogStemCache = { size: catalog.length, stems, exact }
  return { stems, exact }
}

const URL_RE = /\b[\p{L}0-9.-]+\.(?:com|lt|eu|net|org)\b\S*/giu
const EMOJI_RE = /\p{Extended_Pictographic}(?:\uFE0F)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F)?)*/gu

type Token = { word: string; sentence: string; sentenceStart: boolean }

function tokenize(text: string): Token[] {
  const clean = String(text || '').replace(URL_RE, ' ').replace(EMOJI_RE, ' ')
  const out: Token[] = []
  for (const sentence of clean.split(/(?<=[.!?…])\s+/u)) {
    const words = sentence.match(/\p{L}+(?:-\p{L}+)*/gu) || []
    words.forEach((word, i) => out.push({ word, sentence: sentence.trim(), sentenceStart: i === 0 }))
  }
  return out
}

function editDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 1; j <= n; j++) d[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      }
    }
  }
  return d[m][n]
}

/** Short units / abbreviations that legitimately have no vowel. */
export const LT_NO_VOWEL_ALLOWLIST = new Set(['ml', 'kg', 'cm', 'mm', 'gb', 'mb', 'kb', 'km', 'vnt', 'pvz', 'kt', 'tt', 'nr', 'psl', 'str'])

/**
 * Junk word shape, only ever asked about tokens Hunspell already rejected:
 * triple letters, doubled vowels (dovnaa), or a lowercase alphabetic ≥4-letter token with
 * no Lithuanian vowel that is not a known unit/abbreviation (prst, dvnk — not ml).
 */
function morphologicallyImplausible(word: string): boolean {
  const w = word.toLocaleLowerCase('lt-LT')
  if (/(\p{L})\1\1/u.test(w)) return true
  if (/aa|ee|ėė|yy|uu|ūū|oo/u.test(w)) return true
  return (
    word === w &&
    /^\p{L}+$/u.test(w) &&
    w.length >= 4 &&
    !/[aąeęėiįyouųū]/u.test(w) &&
    !LT_NO_VOWEL_ALLOWLIST.has(w)
  )
}

const LT_DIACRITIC_BASE: Record<string, string> = {
  ą: 'a',
  č: 'c',
  ę: 'e',
  ė: 'e',
  į: 'i',
  š: 's',
  ų: 'u',
  ū: 'u',
  ž: 'z',
}

function stripLtDiacritics(word: string): string {
  return word.replace(/[ąčęėįšųūž]/gu, (ch) => LT_DIACRITIC_BASE[ch] || ch)
}

/**
 * Deterministic high-confidence typo: a single-word suggestion that differs only in
 * diacritics, or by edit distance 1 (≤7 letters) / ≤2 (≥8 letters).
 */
function highConfidenceSuggestion(token: string, suggestions: string[], maxDistanceOverride?: number): string | null {
  const lower = token.toLocaleLowerCase('lt-LT')
  const maxDistance = maxDistanceOverride ?? (lower.length <= 7 ? 1 : 2)
  for (const suggestion of suggestions) {
    if (suggestion.length < 3 || /\s|-/.test(suggestion)) continue
    const s = suggestion.toLocaleLowerCase('lt-LT')
    if (stripLtDiacritics(s) === stripLtDiacritics(lower)) return suggestion
    if (editDistance(lower, s) <= maxDistance) return suggestion
  }
  return null
}

/**
 * Capitalized mid-sentence token: never hard-fails on dictionary absence alone, only when a
 * distance-1 / diacritic-only correction is a common lowercase Lithuanian word (Vienisi → vieniši).
 */
function capitalizedTypoOf(token: string, suggestions: string[]): string | null {
  const common = suggestions.filter((s) => speller?.spell(s.toLocaleLowerCase('lt-LT')))
  return highConfidenceSuggestion(token, common, 1)
}

export type LtSpellUnknown = {
  token: string
  suggestions: string[]
  sentence: string
  /** Suggestion that makes this a high-confidence typo (never auto-applied). */
  typoOf: string | null
  implausible: boolean
  properNounLike: boolean
  confidence: 'high' | 'weak'
}

export type LtSpellResult = {
  checked: boolean
  unknown: LtSpellUnknown[]
  /** High-confidence typo → `spell_hard_fail`: the judge cannot overrule it. */
  hardFail: string | null
  /** Weak unknowns (no close suggestion) → `spell_note`: the final QA judge decides. */
  note: string | null
}

/**
 * Check one slide's title/body text. Returns every unknown token (for the audit), a hard
 * failure for high-confidence typos, and a note for weak unknowns. Returns checked=false until
 * the dictionary is loaded — callers in async paths should await ensureLtSpeller() first.
 */
export function checkLtSpelling(text: string): LtSpellResult {
  if (!speller) return { checked: false, unknown: [], hardFail: null, note: null }
  const { stems, exact } = allowedCatalogTokens()
  const tokens = tokenize(text)
  const unknown: LtSpellUnknown[] = []
  const seen = new Set<string>()
  for (const token of tokens) {
    const word = token.word
    const lower = word.toLocaleLowerCase('lt-LT')
    if (word.length < 3 || seen.has(lower)) continue
    seen.add(lower)
    if (LT_NO_VOWEL_ALLOWLIST.has(lower) || exact.has(lower)) continue
    if (speller.spell(word) || speller.spell(lower)) continue
    if (stems.some((stem) => lower.startsWith(stem))) continue
    const suggestions = speller.suggest(word).slice(0, 4)
    const properNounLike = !token.sentenceStart && /^\p{Lu}/u.test(word)
    const typoOf = properNounLike ? capitalizedTypoOf(word, suggestions) : highConfidenceSuggestion(word, suggestions)
    const implausible = !properNounLike && morphologicallyImplausible(word)
    unknown.push({
      token: word,
      suggestions,
      sentence: token.sentence,
      typoOf,
      implausible,
      properNounLike,
      confidence: typoOf || implausible ? 'high' : 'weak',
    })
  }
  const high = unknown.filter((u) => u.confidence === 'high')
  const weak = unknown.filter((u) => u.confidence === 'weak' && !u.properNounLike)
  // List every close candidate: „megimas“ is mezgimas in context, not the first hit „mėgimas“.
  const candidates = (u: LtSpellUnknown) =>
    u.suggestions.filter((s) => highConfidenceSuggestion(u.token, [s]) != null).slice(0, 3).join(' / ') || u.typoOf
  const hardFail = high.length
    ? high.map((u) => (u.typoOf ? `"${u.token}" → ${candidates(u)}` : `"${u.token}" implausible`)).join(', ')
    : null
  const note = weak.length ? `unknown ${weak.map((u) => `"${u.token}"`).join(', ')}` : null
  return { checked: true, unknown, hardFail, note }
}

/**
 * The one safe automatic spelling fix: Hunspell offers exactly one suggestion and it differs
 * from the token only in Lithuanian diacritics („rankšluoščiai“ → „rankšluosčiai“). Anything
 * with several candidates („megimas“: mėgimas / mezgimas) stays for the rewrite or fallback.
 */
export function repairUnambiguousLtTypos(text: string): { text: string; fixes: Array<{ from: string; to: string }> } {
  const fixes: Array<{ from: string; to: string }> = []
  if (!speller) return { text, fixes }
  let out = String(text || '')
  for (const u of checkLtSpelling(out).unknown) {
    if (u.properNounLike || u.suggestions.length !== 1) continue
    const [only] = u.suggestions
    if (/\s|-/.test(only)) continue
    if (stripLtDiacritics(only.toLocaleLowerCase('lt-LT')) !== stripLtDiacritics(u.token.toLocaleLowerCase('lt-LT'))) continue
    const to = /^\p{Lu}/u.test(u.token) ? only.charAt(0).toLocaleUpperCase('lt-LT') + only.slice(1) : only
    out = out.replace(new RegExp(`(?<!\\p{L})${u.token}(?!\\p{L})`, 'gu'), to)
    fixes.push({ from: u.token, to })
  }
  return { text: out, fixes }
}
