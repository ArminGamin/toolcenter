/**
 * Christmas-only final language QA (separate from the Tavo semantic QA).
 * Runs after normalize + native repairs, before ship gates.
 * Deterministic checks are primary; an optional compact LLM judge adds codes it can prove
 * by quoting the exact bad fragment from the slide.
 */

import { UGC_KALEDU_DIET_LEAK_RE } from './ugc-lt-normalize.js'
import {
  kaleduInventedProductMentions,
  kaleduProductSlideVerdict,
  kaleduUngroundedRecommendations,
  loadKaleduCatalog,
  productTypePhrase,
  type KaleduCatalogProduct,
} from './ugc-kaledu-catalog.js'
import { deriveProductSemantic } from './ugc-kaledu-product-index.js'
import { detectKaleduNativeIssues, isIncompleteSubordinateHook } from './ugc-kaledu-native.js'
import { checkLtSpelling } from './ugc-lt-spellcheck.js'
import {
  findLithuanianCoherenceIssues,
  isConfirmedReaderQuestion,
  productContextGap,
  type LtCopyReason,
} from './ugc-lt-sentence-qa.js'
import { repairHurriedClauses } from './ugc-kaledu-card-leaks.js'

export type KaleduQaCode =
  | 'case_agreement'
  | 'person_number'
  | 'incomplete_clause'
  | 'unnatural_collocation'
  | 'invented_word'
  | 'empty_ai_language'
  | 'semantic_coherence'
  | 'product_truth'
  | 'contamination'
  | 'native_style'
  | 'verb_construction'
  | 'register_violation'
  | 'spell_hard_fail'
  | 'spell_note'
  | 'valid_word_wrong_context'
  | 'incomplete_complement'
  | 'semantic_comparison_mismatch'
  | 'awkward_collocation'
  | 'awkward_nominalization'
  | 'translated_sounding_lt'
  | 'vague_metaphor'
  | 'weak_product_story_bridge'
  | 'statement_shaped_question'
  | 'tense_mismatch'
  | 'incomplete_thought'
  | 'unclear_referent'
  | 'product_context_mismatch'
  | 'missing_question_mark'

export type KaleduQaCategory =
  | 'spell_hard_fail'
  | 'spell_note'
  | 'grammar_qa'
  | 'register_violation'
  | 'structural'
  | 'valid_word_wrong_context'
  | 'incomplete_complement'
  | 'semantic_comparison_mismatch'
  | 'awkward_collocation'
  | 'awkward_nominalization'
  | 'translated_sounding_lt'
  | 'vague_metaphor'
  | 'weak_product_story_bridge'
  | 'statement_shaped_question'

const NATIVE_SEMANTIC_CODES = new Set<KaleduQaCode>([
  'valid_word_wrong_context',
  'incomplete_complement',
  'semantic_comparison_mismatch',
  'awkward_collocation',
  'awkward_nominalization',
  'translated_sounding_lt',
  'vague_metaphor',
  'weak_product_story_bridge',
  'statement_shaped_question',
])

/** Audit bucket per code, so the audit shows which layer is doing the work. */
export function kaleduQaCategory(code: KaleduQaCode): KaleduQaCategory {
  if (
    code === 'tense_mismatch' ||
    code === 'incomplete_thought' ||
    code === 'unclear_referent' ||
    code === 'product_context_mismatch' ||
    code === 'missing_question_mark'
  ) {
    return 'grammar_qa'
  }
  if (NATIVE_SEMANTIC_CODES.has(code)) return code
  if (code === 'spell_hard_fail' || code === 'spell_note' || code === 'register_violation') return code
  if (code === 'product_truth' || code === 'contamination') return 'structural'
  return 'grammar_qa'
}

export function countKaleduQaCategories(flags: KaleduQaFlag[]): Record<KaleduQaCategory, number> {
  const counts: Record<KaleduQaCategory, number> = {
    spell_hard_fail: 0,
    spell_note: 0,
    grammar_qa: 0,
    register_violation: 0,
    structural: 0,
    valid_word_wrong_context: 0,
    incomplete_complement: 0,
    semantic_comparison_mismatch: 0,
    awkward_collocation: 0,
    awkward_nominalization: 0,
    translated_sounding_lt: 0,
    vague_metaphor: 0,
    weak_product_story_bridge: 0,
    statement_shaped_question: 0,
  }
  for (const flag of flags) {
    for (const category of new Set(flag.codes.map(kaleduQaCategory))) counts[category] += 1
  }
  return counts
}

/** Flags that only carry a weak spell note — the judge decides, they never block alone. */
export function isSpellNoteOnly(flag: KaleduQaFlag): boolean {
  return flag.codes.every((code) => code === 'spell_note')
}

export type KaleduQaFlag = {
  index: number
  codes: KaleduQaCode[]
  details: string[]
  source: 'deterministic' | 'judge' | 'both'
}

export type KaleduQaSlide = {
  title?: string
  body?: string
  role?: string
  productId?: string
}

export type KaleduQaContext = {
  theme: string
  allowed: KaleduCatalogProduct[]
  /** When false, skip catalog/product/contamination checks (Tavo knyga). Default true. */
  productTruth?: boolean
}

type Gender = 'm' | 'f'
type Tag = string

const CASES_M_AS: Array<[string, Tag[]]> = [
  ['uose', ['loc.pl']],
  ['ams', ['dat.pl']],
  ['ais', ['ins.pl']],
  ['ui', ['dat.sg']],
  ['as', ['nom.sg']],
  ['ai', ['nom.pl']],
  ['us', ['acc.pl']],
  ['ą', ['acc.sg']],
  ['ų', ['gen.pl']],
  ['o', ['gen.sg']],
  ['u', ['ins.sg']],
  ['e', ['loc.sg']],
]

const CASES_M_IS: Array<[string, Tag[]]> = [
  ['iuose', ['loc.pl']],
  ['iams', ['dat.pl']],
  ['iais', ['ins.pl']],
  ['iui', ['dat.sg']],
  ['yje', ['loc.sg']],
  ['iai', ['nom.pl']],
  ['ius', ['acc.pl']],
  ['ių', ['gen.pl']],
  ['is', ['nom.sg']],
  ['ys', ['nom.sg']],
  ['io', ['gen.sg']],
  ['iu', ['ins.sg']],
  ['į', ['acc.sg']],
]

const CASES_M_IUS: Array<[string, Tag[]]> = [
  ['iuose', ['loc.pl']],
  ['iumi', ['ins.sg']],
  ['iaus', ['gen.sg']],
  ['iams', ['dat.pl']],
  ['iais', ['ins.pl']],
  ['iuje', ['loc.sg']],
  ['iui', ['dat.sg']],
  ['iai', ['nom.pl']],
  ['ius', ['nom.sg', 'acc.pl']],
  ['ių', ['acc.sg', 'gen.pl']],
]

const CASES_F_A: Array<[string, Tag[]]> = [
  ['omis', ['ins.pl']],
  ['oje', ['loc.sg']],
  ['oms', ['dat.pl']],
  ['ose', ['loc.pl']],
  ['os', ['gen.sg', 'nom.pl']],
  ['ai', ['dat.sg']],
  ['as', ['acc.pl']],
  ['ą', ['acc.sg']],
  ['ų', ['gen.pl']],
  ['a', ['nom.sg', 'ins.sg']],
]

const CASES_F_E: Array<[string, Tag[]]> = [
  ['ėmis', ['ins.pl']],
  ['ėje', ['loc.sg']],
  ['ėms', ['dat.pl']],
  ['ėse', ['loc.pl']],
  ['ės', ['gen.sg', 'nom.pl']],
  ['ių', ['gen.pl']],
  ['ei', ['dat.sg']],
  ['es', ['acc.pl']],
  ['ę', ['acc.sg']],
  ['ė', ['nom.sg']],
  ['e', ['ins.sg']],
]

type Decl = 'as' | 'is' | 'ius' | 'a' | 'e'

const PARADIGMS: Record<Decl, { gender: Gender; endings: Array<[string, Tag[]]> }> = {
  as: { gender: 'm', endings: CASES_M_AS },
  is: { gender: 'm', endings: CASES_M_IS },
  ius: { gender: 'm', endings: CASES_M_IUS },
  a: { gender: 'f', endings: CASES_F_A },
  e: { gender: 'f', endings: CASES_F_E },
}

/** Noun roots common in gift UGC with their declension — enough to catch agreement slips. */
const NOUN_ROOTS: Array<[string, Decl]> = [
  ['pled', 'as'],
  ['termos', 'as'],
  ['kilim', 'as'],
  ['dėkl', 'as'],
  ['žaidim', 'as'],
  ['žaisliuk', 'as'],
  ['daikt', 'as'],
  ['vakar', 'as'],
  ['kamp', 'as'],
  ['stal', 'as'],
  ['sąraš', 'as'],
  ['užvalkal', 'as'],
  ['drėkintuv', 'as'],
  ['puodel', 'is'],
  ['rėmel', 'is'],
  ['įkrovikl', 'is'],
  ['purškikl', 'is'],
  ['plakikl', 'is'],
  ['masažuokl', 'is'],
  ['rinkin', 'is'],
  ['difuzor', 'ius'],
  ['kalendor', 'ius'],
  ['projektor', 'ius'],
  ['dovan', 'a'],
  ['lemp', 'a'],
  ['girliand', 'a'],
  ['knyg', 'a'],
  ['baterij', 'a'],
  ['lent', 'a'],
  ['idėj', 'a'],
  ['atmosfer', 'a'],
  ['šilum', 'a'],
  ['akimirk', 'a'],
  ['staigmen', 'a'],
  ['arbat', 'a'],
  ['nuotaik', 'a'],
  ['žiem', 'a'],
  ['viln', 'a'],
  ['žvak', 'e'],
  ['žvakid', 'e'],
  ['kojin', 'e'],
  ['ausin', 'e'],
  ['šlepet', 'e'],
  ['užrašin', 'e'],
  ['šildykl', 'e'],
  ['rož', 'e'],
  ['švent', 'e'],
  ['erdv', 'e'],
  ['dėžut', 'e'],
  ['pakuot', 'e'],
  ['smulkmen', 'a'],
]

const ADJ_ENDINGS: Array<[string, Gender, Tag[]]> = [
  // masculine -as / -us / -is
  ['iuose', 'm', ['loc.pl']],
  ['uose', 'm', ['loc.pl']],
  ['iems', 'm', ['dat.pl']],
  ['iame', 'm', ['loc.sg']],
  ['iams', 'm', ['dat.pl']],
  ['iais', 'm', ['ins.pl']],
  ['ame', 'm', ['loc.sg']],
  ['aus', 'm', ['gen.sg']],
  ['iam', 'm', ['dat.sg']],
  ['ais', 'm', ['ins.pl']],
  ['iai', 'm', ['nom.pl']],
  ['ius', 'm', ['acc.pl']],
  ['am', 'm', ['dat.sg']],
  ['as', 'm', ['nom.sg']],
  ['us', 'm', ['nom.sg', 'acc.pl']],
  ['is', 'm', ['nom.sg']],
  ['ūs', 'm', ['nom.pl']],
  ['io', 'm', ['gen.sg']],
  ['iu', 'm', ['ins.sg']],
  ['ių', 'm', ['gen.pl']],
  ['ą', 'm', ['acc.sg']],
  ['į', 'm', ['acc.sg']],
  ['ų', 'm', ['gen.pl', 'acc.sg']],
  ['o', 'm', ['gen.sg']],
  ['u', 'm', ['ins.sg']],
  ['i', 'm', ['nom.pl']],
  // feminine -a / -i / -ė
  ['iomis', 'f', ['ins.pl']],
  ['omis', 'f', ['ins.pl']],
  ['ėmis', 'f', ['ins.pl']],
  ['ioje', 'f', ['loc.sg']],
  ['ioms', 'f', ['dat.pl']],
  ['iose', 'f', ['loc.pl']],
  ['oje', 'f', ['loc.sg']],
  ['ėje', 'f', ['loc.sg']],
  ['oms', 'f', ['dat.pl']],
  ['ėms', 'f', ['dat.pl']],
  ['ose', 'f', ['loc.pl']],
  ['ėse', 'f', ['loc.pl']],
  ['ios', 'f', ['gen.sg', 'nom.pl']],
  ['ias', 'f', ['acc.pl']],
  ['iai', 'f', ['dat.sg']],
  ['ią', 'f', ['acc.sg']],
  ['ia', 'f', ['ins.sg']],
  ['ių', 'f', ['gen.pl']],
  ['os', 'f', ['gen.sg', 'nom.pl']],
  ['ės', 'f', ['gen.sg', 'nom.pl']],
  ['as', 'f', ['acc.pl']],
  ['es', 'f', ['acc.pl']],
  ['ai', 'f', ['dat.sg']],
  ['ei', 'f', ['dat.sg']],
  ['ą', 'f', ['acc.sg']],
  ['ę', 'f', ['acc.sg']],
  ['ų', 'f', ['gen.pl']],
  ['a', 'f', ['nom.sg', 'ins.sg']],
  ['ė', 'f', ['nom.sg']],
  ['e', 'f', ['ins.sg']],
  ['i', 'f', ['nom.sg']],
]

/** Adjective stems frequent in gift copy. Stem + ending must reproduce the word exactly. */
const ADJ_STEMS = new Set([
  'šilt',
  'minkšt',
  'jauk',
  'graž',
  'šveln',
  'kvapn',
  'aromatin',
  'vilnon',
  'šventin',
  'kalėdin',
  'praktišk',
  'maž',
  'didel',
  'nauj',
  'ger',
  'puik',
  'ypating',
  'tobul',
  'ram',
  'patog',
  'malon',
  'stiklin',
  'medin',
  'odin',
  'keramikin',
  'šilkin',
  'miel',
  'brang',
  'pig',
  'paprast',
  'apgalvot',
  'asmenin',
  'nuostab',
  'tikr',
  'spalving',
  'balt',
  'raudon',
  'auksin',
  'sidabrin',
  'karšt',
  'šalt',
  'vės',
  'lengv',
  'natūral',
  'belaid',
  'megzt',
  'žiemin',
  'naudin',
  'kasdien',
  'subtil',
  'elegantišk',
  'originali',
])

const CLAUSE_BREAK_WORDS = new Set([
  'su',
  'ir',
  'o',
  'bet',
  'kad',
  'kai',
  'į',
  'iš',
  'ant',
  'po',
  'per',
  'be',
  'prie',
  'nuo',
  'iki',
  'už',
  'kaip',
  'nei',
  'tai',
  'yra',
  'jau',
  'dar',
  'tik',
  'labai',
  'ar',
  'jei',
  'tada',
  'vis',
  'visada',
  'dažnai',
  'kartais',
  'tiesiog',
  'taip',
  'čia',
  'ten',
  'tikrai',
  'net',
  'irgi',
])

function nounTags(word: string): { gender: Gender; tags: Set<Tag> } | null {
  const w = word.toLocaleLowerCase('lt-LT')
  for (const [root, decl] of NOUN_ROOTS) {
    if (!w.startsWith(root)) continue
    const ending = w.slice(root.length)
    const paradigm = PARADIGMS[decl]
    const match = paradigm.endings.find(([e]) => e === ending)
    if (match) return { gender: paradigm.gender, tags: new Set(match[1]) }
  }
  return null
}

function adjTags(word: string): Set<string> | null {
  const w = word.toLocaleLowerCase('lt-LT')
  const out = new Set<string>()
  for (const [ending, gender, tags] of ADJ_ENDINGS) {
    if (!w.endsWith(ending)) continue
    const stem = w.slice(0, -ending.length)
    if (!ADJ_STEMS.has(stem)) continue
    for (const tag of tags) out.add(`${gender}.${tag}`)
  }
  return out.size ? out : null
}

/** Unknown word: every gender/case its ending could express in any noun paradigm. */
function endingNounTags(word: string): Set<string> {
  const w = word.toLocaleLowerCase('lt-LT')
  const out = new Set<string>()
  for (const paradigm of Object.values(PARADIGMS)) {
    for (const [ending, tags] of paradigm.endings) {
      if (w.length - ending.length >= 3 && w.endsWith(ending)) {
        for (const tag of tags) out.add(`${paradigm.gender}.${tag}`)
      }
    }
  }
  return out
}

function looksGenitive(word: string): boolean {
  return /(os|ės|ų|io|o|ių)$/u.test(word.toLocaleLowerCase('lt-LT'))
}

function agrees(adj: Set<string>, noun: { gender: Gender; tags: Set<Tag> }): boolean {
  for (const tag of noun.tags) if (adj.has(`${noun.gender}.${tag}`)) return true
  return false
}

function clauseTokens(text: string): string[][] {
  return String(text || '')
    .split(/[.,;:!?„“"()\n]+/u)
    .map((part) =>
      part
        .split(/\s+/)
        .map((w) => w.replace(/[^\p{L}-]/gu, ''))
        .filter(Boolean),
    )
    .filter((tokens) => tokens.length)
}

/** Adjective + noun (optionally with a genitive in between) that cannot agree in gender/case/number. */
export function findAgreementErrors(text: string): string[] {
  const errors: string[] = []
  for (const tokens of clauseTokens(text)) {
    for (let i = 0; i < tokens.length - 1; i++) {
      const adj = adjTags(tokens[i])
      if (!adj) continue
      const next = tokens[i + 1]
      const n1 = nounTags(next)
      const after = tokens[i + 2]
      const afterIsHead = after && !CLAUSE_BREAK_WORDS.has(after.toLocaleLowerCase('lt-LT'))
      if (n1 && agrees(adj, n1)) continue
      if (looksGenitive(next) && afterIsHead) {
        const n2 = nounTags(after)
        if (n2 ? agrees(adj, n2) : [...endingNounTags(after)].some((tag) => adj.has(tag))) continue
        if (!n1 && !n2) continue
        errors.push(`${tokens[i]} ${next} ${after}`)
        continue
      }
      if (!n1) continue
      errors.push(`${tokens[i]} ${next}`)
    }
  }
  return errors
}

const THIRD_PERSON_SUBJECTS = new Set([
  'žmogus',
  'jis',
  'ji',
  'jie',
  'jos',
  'mama',
  'tėtis',
  'senelis',
  'močiutė',
  'draugas',
  'draugė',
  'vyras',
  'moteris',
  'paauglys',
  'vaikas',
  'kiekvienas',
  'niekas',
  'šeima',
  'gavėjas',
])

/** 2nd-person singular forms whose 3rd-person form differs (nori/gali/turi are ambiguous and omitted). */
const SECOND_PERSON_VERBS = new Set([
  'jauti',
  'jautiesi',
  'pasijauti',
  'žinai',
  'esi',
  'randi',
  'renkiesi',
  'išsirenki',
  'pasirenki',
  'perki',
  'ieškai',
  'galvoji',
  'pagalvoji',
  'matai',
  'supranti',
  'dovanoji',
  'atidedi',
  'svarstai',
  'pavargsti',
  'lauki',
  'džiaugiesi',
  'bijai',
  'pameni',
  'atsimeni',
  'skaitai',
  'gauni',
  'nusprendi',
  'buvai',
  'radai',
  'pamatei',
])

const CLAUSE_SPLIT_RE = /[.,;:!?]|\s(?:o|bet|kai|kad|jei|nes|todėl)\s/u

/** "Žmogus visada jauti" — 3rd-person subject with a 2nd-person verb in one clause. */
export function findPersonNumberErrors(text: string): string[] {
  const errors: string[] = []
  for (const clause of String(text || '').split(CLAUSE_SPLIT_RE)) {
    const words = clause
      .toLocaleLowerCase('lt-LT')
      .split(/\s+/)
      .map((w) => w.replace(/[^\p{L}]/gu, ''))
      .filter(Boolean)
    if (words.includes('tu') || words.includes('tau')) continue
    const subjectAt = words.findIndex((w) => THIRD_PERSON_SUBJECTS.has(w))
    if (subjectAt < 0) continue
    const verb = words.slice(subjectAt + 1, subjectAt + 5).find((w) => SECOND_PERSON_VERBS.has(w))
    if (verb) errors.push(`${words[subjectAt]} … ${verb}`)
  }
  return errors
}

const DANGLING_LAST_WORDS = new Set([
  'ir',
  'o',
  'bet',
  'kad',
  'kai',
  'su',
  'be',
  'į',
  'iš',
  'ant',
  'po',
  'per',
  'nei',
  'kaip',
  'jog',
  'arba',
  'ar',
  'tai',
  'jei',
  'nes',
])

/** Unfinished clause: dangling conjunction, or a line cut after a conditional/infinitive verb. */
export function findIncompleteClause(text: string, role?: string, field: 'title' | 'body' = 'body'): string | null {
  const t = String(text || '').trim()
  if (!t) return null
  const hasTerminal = /[.!?…]$/u.test(t)
  const last = (t.split(/\s+/).pop() || '').replace(/[^\p{L}]/gu, '').toLocaleLowerCase('lt-LT')
  if (DANGLING_LAST_WORDS.has(last)) return `ends on "${last}"`
  if (!hasTerminal && /(tų|ti|tis)$/u.test(last) && last.length > 4) return `cut after "${last}"`
  if (field === 'title' && role === 'hook' && isIncompleteSubordinateHook(t)) return 'Kai hook never finishes'
  if (field === 'title' && !hasTerminal && /,/.test(t) && /^(jei|jeigu|kai|kad|nors)\b/iu.test(t)) {
    return 'subordinate title without main clause'
  }
  return null
}

const UNNATURAL_COLLOCATION_RE =
  /atstumo\s+suvokim|apimtas\s+snaig|vis\s+atvėsina|prieglob(?!st)|tiltu\s+tarp|kaip\s+senos\s+istorijos|atskleist\p{L}*\s+dėmes|apimti\s+rūpesting|sušildo\s+ne\s+tik\s+kūnui|dovanoji\s+jai\s+ramybės|suskumbim|staigtyb|dovanų\s+paieškos\s+stresas\s+pranoksta|nuspręsk\s+(?!ką|kaip|ar|kur|kam|kurį|kurią|kuri|kada)\p{L}+|susivienyti\s+su|švent\p{L}*\s+bum\p{L}*|sukurti\s+jauk\p{L}*\s+moment\p{L}*|patirties\s+nei\s+tu|kupin\p{L}*\s+nerimo|(?<!\p{L})(?:ne)?būtina\s+(?:yra\s+)?būti\s+\p{L}+iai(?!\p{L})/iu

const EMPTY_AI_RE =
  /ne\s+tik\s+(?:daiktas|dovana|rankas|kūną|kūnui)[^.]{0,40}bet\s+ir|(?<!\p{L})siel(?:a|ą|ai|os|oje)(?!\p{L})|širdis\s+(?:visada\s+)?žino|širdis\s+plaka|tarsi\s+pasaka|nepakartojam\p{L}*|stebukl\p{L}*|kalėdų\s+magij|šventin\p{L}*\s+magij|šilumos\s+simbol|tikroji\s+dovana|nepamirštam\p{L}*\s+akimirk|ypating\p{L}*\s+akimirk|pasiner\p{L}*\s+į|emocij\p{L}*\s+kupin\p{L}*|kupin\p{L}*\s+pasakojim\p{L}*|pasitikėk\s+(?:emocij|intuicij|kalėdų|savimi)\p{L}*|dovanok\s+(?:ne\s+daiktą,\s*bet\s+)?(?:šilumą|artimumą|jaukumą|šviesą|jaukius\s+vakarus)/iu

const INVENTED_WORD_RE = /(?<!\p{L})(?:rasisi|džiugij\p{L}*|staigtyb\p{L}*|nesusiprotėj\p{L}*)(?!\p{L})/iu

const FIRST_PERSON_RE =
  /(?<!\p{L})(?:aš|man|mano|mane|žinau|galiu|noriu|manau|radau|pirkau|jaučiu|ieškau|dovanoju|renkuosi|nežinau|negaliu|supratau|pamačiau|turiu|neturiu|esu|darau|perku|randu|sakau|matau|galvoju|pamenu|mėgstu|dovanosiu)(?!\p{L})/iu

const WE_FORM_RE =
  /(?<!\p{L})(?:mes|mūsų|mums|žinome|galime|turime|esame|norime|ieškome|renkamės|dovanojame|siūlome|\p{L}{3,}(?:amės|imės|omės))(?!\p{L})/iu

const FORMAL_PLURAL_RE =
  /(?<!\p{L})(?:jūs|jūsų|jums|\p{L}{3,}(?:kite|ykite|kitės)|\p{L}{3,}(?:ate|ite|ote|atės|itės|otės))(?!\p{L})/iu

const DEMONSTRATIVE_NOM_RE = /^(?:tas|ta|šis|ši|tie|tos|toks|tokia)$/u

const INDEF_GENITIVE_RE = /(?<!\p{L})(kažko|nieko|ko\s+nors|kai\s+ko)\s+(\p{L}{4,})(?!\p{L})/giu

const FINITE_AFTER_GOVERNOR_RE =
  /(?<!\p{L})(verčia|leidžia|padeda|tenka|reikia|norisi|gali|turi|nori|privalai|pradedi|bandai|stengiesi|verta|reikėtų)\s+(\p{L}{3,}(?:iame|ame|ime|ome|iate|ate|ite|ote))(?!\p{L})/iu

const BUTI_HALF_PARTICIPLE_RE =
  /(?<!\p{L})(esi|yra|esu|esame|esate|buvo|buvai|buvau|būsi|būna|būni)\s+(\p{L}+(?:damas|dama|dami|damos))(?!\p{L})/iu

const DALINTIS_GENITIVE_RE = /(?<!\p{L})((?:pasi)?dalin\p{L}*|(?:pasi)?dalyk\p{L}*)\s+(\p{L}+(?:ės|os|ų|io))\s+\p{L}+/iu

const IESKOTI_ACCUSATIVE_RE = /(?<!\p{L})(ieško\p{L}*|ieškai|ieškau)\s+(\p{L}+ą)(?!\p{L})/iu

/** Case government: verb/pronoun demands a case the next word does not have. */
export function findCaseGovernmentErrors(text: string): string[] {
  const errors: string[] = []
  for (const clause of String(text || '').split(/[.,;:!?]/u)) {
    const words = clause
      .split(/\s+/)
      .map((w) => w.replace(/[^\p{L}]/gu, ''))
      .filter(Boolean)
    for (let i = 0; i < words.length - 1; i++) {
      const verb = words[i].toLocaleLowerCase('lt-LT')
      const next = words[i + 1].toLocaleLowerCase('lt-LT')
      if (SECOND_PERSON_VERBS.has(verb) && DEMONSTRATIVE_NOM_RE.test(next)) errors.push(`${verb} ${next} (object must be accusative)`)
    }
  }
  for (const match of String(text || '').matchAll(INDEF_GENITIVE_RE)) {
    const next = match[2].toLocaleLowerCase('lt-LT')
    if (/aus$/u.test(next)) continue
    if (/(u|ą|į|as|us|ius|iu|ais|ui)$/u.test(next)) errors.push(`${match[1]} ${match[2]} (needs genitive)`)
  }
  const dalintis = String(text || '').match(DALINTIS_GENITIVE_RE)
  if (dalintis) errors.push(`${dalintis[1]} ${dalintis[2]} (dalintis + instrumental)`)
  const ieskoti = String(text || '').match(IESKOTI_ACCUSATIVE_RE)
  if (ieskoti) errors.push(`${ieskoti[1]} ${ieskoti[2]} (ieškoti + genitive)`)
  return errors
}

const NEBUTINA_BUTI_MISUSE_RE =
  /(?<!\p{L})nebūtina\s+būti\s+(\p{L}+(?:ai|ei))(?!\p{L})/iu

/** Malformed verb chains: finite verb where an infinitive belongs; būti + half-participle; nebūtina būti + adverb. */
export function findVerbConstructionErrors(text: string): string[] {
  const t = String(text || '')
  const errors: string[] = []
  const finite = t.match(FINITE_AFTER_GOVERNOR_RE)
  if (finite) errors.push(`${finite[1]} ${finite[2]} (needs infinitive)`)
  const participle = t.match(BUTI_HALF_PARTICIPLE_RE)
  if (participle) errors.push(`${participle[1]} ${participle[2]} (būti + pusdalyvis)`)
  const nebutina = t.match(NEBUTINA_BUTI_MISUSE_RE)
  if (nebutina) errors.push(`nebūtina būti ${nebutina[1]} (use nebūtinai turi būti + adjective)`)
  return errors
}

/** Christmas copy speaks to one reader as „tu“ — no aš / mes / formal jūs forms. */
export function findRegisterErrors(text: string): string[] {
  const t = String(text || '')
  return [t.match(FIRST_PERSON_RE)?.[0], t.match(WE_FORM_RE)?.[0], t.match(FORMAL_PLURAL_RE)?.[0]].filter(
    (hit): hit is string => Boolean(hit),
  )
}

const DIRECT_Q_START_RE =
  /^(?:ar|kodėl|kaip|ką|kas|kur|kada|kuris|kuri|nežinai|vis\s+dar|nenori|ieškai|pažįsti|svarstai|galvoji|nerandi|sunku\s+išrinkti|neapsisprendi|jau\s+išrinkai|dar\s+neturi|dar\s+nieko|nori|dovana\s+\p{L}{3,16})\b/iu

const RHETORICAL_Q_RE =
  /^(?:(?:kasmet|vėl|dažnai|kiekvienais\s+metais)\s+perki\s+kažką|(?:vėl|vis\s+dar)\s+renkiesi|(?:dar|vis\s+dar)\s+ieškai|(?:vėl|dar|vis\s+dar)\s+nežinai|dar\s+neišrinkai|vėl\s+atidėjai|vis\s+dar\s+atidėlioji|(?:(?:dar|vis\s+dar)\s+)?reikia\s+dovanos|(?:ieškai|nori)\s+dovanos)(?!\p{L})/iu

const FALSE_DECLARATIVE_Q_RE =
  /^(?:(?:jauki|praktiška|maža|šventinis)\s+)?(?:dovana|vakaras)\s+(?:(?:nebūtinai\s+)?turi\s+būti|turėtų|gali|yra|tampa)(?!\p{L})/iu

const AWKWARD_KVAPU_DOVANA_RE = /kvapų\s+dovan\p{L}*/iu

const DECLARATIVE_QUESTION_BLOCK_RE =
  /iš\s+anksto|anksčiau|visai\s+šeimai|praktišk|pagal\s+biudžet|mažesnį\s+biudžet|(?<!\p{L})renkamės(?!\p{L})/iu

const CONTRAST_NEXT_RE = /^(?:šiemet|šįkart|bet|tada|todėl)\b/iu

export type UgcQuestionKind = 'direct' | 'rhetorical'

function bareSentence(sentence: string): string {
  return String(sentence || '')
    .trim()
    .replace(/[.!?…]+$/u, '')
    .trim()
}

export function isFalseRhetoricalQuestion(sentence: string): boolean {
  return FALSE_DECLARATIVE_Q_RE.test(bareSentence(sentence))
}

export function classifyUgcQuestion(sentence: string, nextSentence = ''): UgcQuestionKind | null {
  const s = bareSentence(sentence)
  if (!s || s.length > 120 || DECLARATIVE_QUESTION_BLOCK_RE.test(s) || isFalseRhetoricalQuestion(s)) return null
  if (RHETORICAL_Q_RE.test(s)) return 'rhetorical'
  if (DIRECT_Q_START_RE.test(s)) return 'direct'
  const next = bareSentence(nextSentence)
  if (
    next &&
    CONTRAST_NEXT_RE.test(next) &&
    /^(?:kasmet|vėl|dažnai)\s+(?:perki|renkiesi)\b/iu.test(s) &&
    s.split(/\s+/).length <= 8
  ) {
    return 'rhetorical'
  }
  return null
}

export function isDirectReaderQuestion(sentence: string): boolean {
  return classifyUgcQuestion(sentence) != null
}

export function findMissingQuestionMarks(text: string): Array<{ sentence: string; kind: UgcQuestionKind }> {
  const parts = String(text || '')
    .split(/(?<=[.!?…])\s+/u)
    .map((part) => part.trim())
    .filter(Boolean)
  const out: Array<{ sentence: string; kind: UgcQuestionKind }> = []
  parts.forEach((part, i) => {
    if (/\?\s*$/u.test(part)) return
    const kind = classifyUgcQuestion(part, parts[i + 1] || '')
    if (kind) out.push({ sentence: part, kind })
    else if (isConfirmedReaderQuestion(part)) out.push({ sentence: part, kind: 'direct' })
  })
  return out
}

export function normalizeDirectQuestionPunctuation(text: string): { text: string; changed: boolean } {
  const parts = String(text || '').split(/(?<=[.!?…])\s+/u)
  let changed = false
  const next = parts.map((part, i) => {
    const s = part.trim()
    const following = parts[i + 1] || ''
    const bare = s.replace(/[.!?…]+$/u, '').trim()
    const correlative = /^(?:kas|ką)\s+\p{L}+(?:am|ai)\b/iu.test(bare) && /,\s*kitam\b/iu.test(bare)
    const readerQuestion = !correlative && (classifyUgcQuestion(s, following) || isConfirmedReaderQuestion(s))
    if (!s || !readerQuestion || /\?\s*$/u.test(s)) return part
    changed = true
    return s.replace(/[.!…]*$/u, '') + '?'
  })
  return { text: next.join(' '), changed }
}

const CLOSE_VIEWER_QUESTION = 'Nori dovanos, kuri pradžiugintų ir sukurtų šventinę atmosferą?'

const TRAVEL_SCENE_RE = /kelion|kelyj|kelyje|termos/iu
const KITCHEN_SCENE_RE = /virtuv/iu

/** A travel product story does not silently move into the kitchen. */
export function repairProductSceneContinuity(text: string, theme: string): { text: string; changed: boolean } {
  const source = String(text || '')
  const themeTravel = TRAVEL_SCENE_RE.test(theme) && !KITCHEN_SCENE_RE.test(theme)
  if (!themeTravel || !KITCHEN_SCENE_RE.test(source)) return { text: source, changed: false }
  if (TRAVEL_SCENE_RE.test(source) && /virtuv\p{L}*.{0,40}kelion|kelion\p{L}*.{0,40}virtuv/iu.test(source)) {
    return { text: source, changed: false }
  }
  const next = source.replace(/virtuvėje/giu, 'kelionėje').replace(/virtuvė/giu, 'kelionė')
  return { text: next, changed: next !== source }
}

export function repairFalseQuestionSentence(sentence: string, role = ''): string {
  const s = sentence.trim()
  if (!isFalseRhetoricalQuestion(s)) return s
  const viewer = role === 'close' || role === 'hook'
  if (viewer && /pradžiugint|atmosfer/iu.test(s)) return CLOSE_VIEWER_QUESTION
  return `${bareSentence(s)}.`
}

export function repairAwkwardCollocation(sentence: string, productBlob = ''): string {
  if (!AWKWARD_KVAPU_DOVANA_RE.test(sentence)) return sentence
  if (/žvak|JK-001|aromaterap/iu.test(productBlob)) return 'Kvapni žvakė tam puikiai tinka.'
  return 'Kvapni dovana tam puikiai tinka.'
}

export function repairUgcQuestionAndCollocation(text: string, role = '', productBlob = ''): string {
  const punctuated = normalizeDirectQuestionPunctuation(repairValidWordWrongContext(text).text).text
  return punctuated
    .split(/(?<=[.!?…])\s+/u)
    .map((part) => repairAwkwardCollocation(repairFalseQuestionSentence(part, role), productBlob))
    .join(' ')
}

const PLUMBING_CIAUP_RE = /(?:vandens|virtuv\p{L}*|voni\p{L}*)\s+čiaup\p{L}*|čiaup\p{L}*\s+rankenėl/iu
const TEMPORAL_CIAUP_RE =
  /(?:kalėd\p{L}*|švent(?:ė|ės|ėms|es)|šventinis\s+laikotarp\p{L}*|gruodžio\s+pabaig\p{L}*)[^!?.]{0,48}(?:jau\s+)?(?:visai\s+)?čiaup\p{L}*/iu
const TIME_BLINK_RE = /(?<!\p{L})laikas\s+blyk[sš]t\p{L}*/iu
const GIFT_TILT_RE = /(?<!\p{L})dovan\p{L}*\s+atloj\p{L}*/iu
const FEELING_PASSAGE_RE =
  /ar\s+žinai\s+tą\s+jausmą,\s*kai\s+kalėdos\s+jau\s+čiaup\p{L}*\??\s*visada\s+lieka\s+tiek\s+daug\s+nepadaryt\p{L}*\??/iu

const FEELING_REPAIR =
  'Ar žinai tą jausmą, kai Kalėdos jau visai čia pat, o dar tiek daug nepadaryta?'

const TEMPORAL_CIAUP_REASON = 'dictionary-valid word used in impossible temporal context'
const TIME_BLINK_REASON = 'dictionary-valid word used where time is passing'
const GIFT_TILT_REASON = 'dictionary-valid word used in an impossible gift context'

export type SemanticConfidence = 'HIGH' | 'MEDIUM' | 'NOTE'

export type ValidWordWrongContextHit = {
  sentence: string
  original: string
  reason: string
  repair: string
  replacement: string
}

export type NativeSemanticCode = Extract<
  KaleduQaCode,
  | 'incomplete_complement'
  | 'semantic_comparison_mismatch'
  | 'awkward_collocation'
  | 'awkward_nominalization'
  | 'translated_sounding_lt'
  | 'vague_metaphor'
  | 'valid_word_wrong_context'
  | 'weak_product_story_bridge'
  | 'statement_shaped_question'
  | 'tense_mismatch'
  | 'incomplete_thought'
  | 'unclear_referent'
>

/** Detection only. weak_product_story_bridge is a high-confidence actor gap, not full story QA. */
export type NativeSemanticHit = {
  code: NativeSemanticCode
  confidence: SemanticConfidence
  span: string
  sentence: string
  sentenceIndex: number
  reason: string
  role?: string
  productId?: string
  evidence: string
  repairGroupId: string
}

export type SemanticRepairGroup = {
  id: string
  sentenceIndexes: number[]
  codes: NativeSemanticCode[]
  strategy: string
  confidence: 'HIGH' | 'MEDIUM'
  replacement: string
}

export type NativeSemanticOpts = {
  role?: string
  productId?: string
  productBlob?: string
  prior?: string
}

type ProductSemantic = {
  family: string
  subject: string
  benefits: string[]
  source: 'catalog_meta' | 'catalog_name' | 'fallback'
  atmosphere: boolean
}

const ISSUE_PRIORITY: NativeSemanticCode[] = [
  'tense_mismatch',
  'incomplete_thought',
  'unclear_referent',
  'valid_word_wrong_context',
  'semantic_comparison_mismatch',
  'incomplete_complement',
  'awkward_collocation',
  'awkward_nominalization',
  'vague_metaphor',
  'translated_sounding_lt',
  'weak_product_story_bridge',
  'statement_shaped_question',
]

const EXPERIENCE_WORD = /^(?:vakaras|vakaro|vakarą|vakarui|vakare|nuotaika|nuotaikos|nuotaiką|akimirka|akimirką|laikas|laiką|jausmas|jausmą)$/iu
const OBJECT_WORD = /^(?:dekoracija|dekoracijos|dekoraciją|prekė|prekės|prekę|daiktas|daikto|daiktą|dovana|dovanos|dovaną|pledas|pledo|pledą|užklotas|užklotą|žvakė|žvakės|žvakių)$/iu
const PERSON_WORD = /^(?:žmogus|žmogui|mama|mamai|draugas|draugei|kolegė|kolegai)$/iu
const PRICE_WORD = /^(?:kaina|kainą|biudžetas|biudžetą)$/iu

function ltSentences(text: string): string[] {
  return String(text || '')
    .split(/(?<=[.!?…])\s+/u)
    .map((part) => part.trim())
    .filter(Boolean)
}

const INCOMPLETE_SUGALVOTI_RE = /sugalvoti\s+sunku|sunku\s+sugalvoti/iu
const MORE_EVENING_RE = /palieka\s+daugiau\s+vakaro/iu
const ABSTRACT_PROCESS_RE =
  /(?:pasirinkimas|sprendimas)\s+(?:palieka|suteikia|sukuria|leidžia)|paieška\s+sukuria|dovanos\s+pasirinkimas\s+tampa/iu
const SOFT_ABSTRACT_RE = /(?:pasirinkimas|sprendimas|paieška)\s+(?:suteikia|sukuria|palieka|tampa)/iu
const SHELF_GUESS_RE = /(?:ne)?spėlioj\p{L}*\s+kiekvienoje\s+lentynoje/iu
const COMPLEMENT_REPAIR = 'Ji turi beveik viską, todėl sugalvoti, ką padovanoti, nėra lengva.'
const CANDLE_BRIDGE = 'Kvapni žvakė gali paprastą vakarą namuose paversti daug jaukesniu.'
const SIMPLE_EVENING = 'Paprastas vakaras namuose gali būti daug jaukesnis.'
const HUMAN_CHOICE = 'Kai žinai, ko ieškai, dovaną išrinkti daug paprasčiau.'

function lastLtSentence(text: string): string {
  const parts = ltSentences(text)
  return parts[parts.length - 1] || ''
}

function wordGroup(side: string): 'experience' | 'object' | 'person' | 'price' | null {
  let found: 'experience' | 'object' | 'person' | 'price' | null = null
  for (const word of side.toLocaleLowerCase('lt-LT').split(/[^\p{L}]+/u)) {
    if (EXPERIENCE_WORD.test(word)) found = 'experience'
    else if (OBJECT_WORD.test(word)) found = 'object'
    else if (PERSON_WORD.test(word)) found = 'person'
    else if (PRICE_WORD.test(word)) found = 'price'
  }
  return found
}

function comparisonSides(sentence: string): { left: string; right: string } | null {
  const match = sentence.match(
    /(.{0,80}?)\s+(?:ramesn|jaukesn|geresn|šiltesn)\p{L}*\s+už\s+([^!.?]+)/iu,
  )
  if (!match) return null
  return { left: match[1], right: match[2] }
}

const VIEWER_TU_RE = /(?<!\p{L})(?:ieškai|nori|žinai|renkiesi|jauti)(?!\p{L})/iu
const NORISI_KAD_RE = /^Norisi,\s*kad\b/iu

function isStatementShapedQuestion(sentence: string, previous: string, role?: string): boolean {
  if (role !== 'hook' && role !== 'context') return false
  if (!NORISI_KAD_RE.test(sentence.trim())) return false
  return VIEWER_TU_RE.test(previous)
}

function directViewerQuestion(sentence: string): string {
  const body = sentence.trim().replace(/^Norisi,/iu, 'Nori,').replace(/[.!?…]+$/u, '').trim()
  return `${body}?`
}

function complementRecoverable(sentence: string, previous: string): boolean {
  if (/sugalvoti\s*,\s*ką/iu.test(sentence)) return true
  const prev = previous.trim()
  if (!prev) return false
  if (!/[?]/.test(prev) && !/^nežinai\b/iu.test(prev)) return false
  return /ką\s+(?:jai\s+|jam\s+|joms\s+|jiems\s+)?(?:padovanoti|dovanoti)/iu.test(prev)
}

function catalogAtmosphere(row: KaleduCatalogProduct): boolean | null {
  const meta = [...row.vibes, ...(row.benefits || [])].map((item) => item.trim()).filter(Boolean)
  if (!meta.length) return null
  return meta.some((item) => /jauk|kvap|atmosfer/iu.test(item))
}

function productSemantic(opts: NativeSemanticOpts): ProductSemantic | null {
  let row: KaleduCatalogProduct | undefined
  try {
    row = loadKaleduCatalog().find(
      (product) =>
        product.sku === opts.productId ||
        product.slug === opts.productId ||
        product.productId === opts.productId,
    )
  } catch {
    row = undefined
  }
  if (row) {
    const semantic = deriveProductSemantic(row)
    const fromMeta = catalogAtmosphere(row)
    const subject = semantic.naturalSubject.charAt(0).toLocaleUpperCase('lt-LT') + semantic.naturalSubject.slice(1)
    return {
      family: semantic.family,
      subject,
      benefits: semantic.benefits.length ? semantic.benefits : row.vibes,
      source: semantic.confidence === 'catalog' ? 'catalog_meta' : 'catalog_name',
      atmosphere: fromMeta === null ? /žvak/iu.test(semantic.family) : fromMeta,
    }
  }
  const hint = `${opts.productId || ''} ${opts.productBlob || ''}`.toLocaleLowerCase('lt-LT')
  const token = hint.match(/žvak|termos|puodel/)
  if (!token) return null
  const family = token[0] === 'žvak' ? 'žvakė' : token[0] === 'termos' ? 'termosas' : 'puodelis'
  return { family, subject: family, benefits: [], source: 'fallback', atmosphere: family === 'žvakė' }
}

function productFitsEvening(product: ProductSemantic | null): boolean {
  return Boolean(product?.atmosphere && /žvak/iu.test(product.family))
}

function hit(
  partial: Omit<NativeSemanticHit, 'role' | 'productId' | 'repairGroupId'> & { repairGroupId?: string },
  opts: NativeSemanticOpts,
): NativeSemanticHit {
  return {
    ...partial,
    role: opts.role,
    productId: opts.productId,
    repairGroupId: partial.repairGroupId || `s${partial.sentenceIndex}`,
  }
}

function lexicalHits(sentence: string, index: number, opts: NativeSemanticOpts): NativeSemanticHit[] {
  const hits: NativeSemanticHit[] = []
  if (!PLUMBING_CIAUP_RE.test(sentence) && TEMPORAL_CIAUP_RE.test(sentence)) {
    const span = (sentence.match(TEMPORAL_CIAUP_RE)?.[0] || 'čiaupo').replace(/\s+/g, ' ').trim()
    hits.push(
      hit(
        {
          code: 'valid_word_wrong_context',
          confidence: 'HIGH',
          span,
          sentence,
          sentenceIndex: index,
          reason: TEMPORAL_CIAUP_REASON,
          evidence: 'collocation=Kalėdos jau visai čia pat',
        },
        opts,
      ),
    )
  }
  if (TIME_BLINK_RE.test(sentence)) {
    hits.push(
      hit(
        {
          code: 'valid_word_wrong_context',
          confidence: 'HIGH',
          span: sentence.match(TIME_BLINK_RE)?.[0] || 'laikas blyksta',
          sentence,
          sentenceIndex: index,
          reason: TIME_BLINK_REASON,
          evidence: 'collocation=Laikas greitai bėga',
        },
        opts,
      ),
    )
  }
  if (GIFT_TILT_RE.test(sentence)) {
    hits.push(
      hit(
        {
          code: 'valid_word_wrong_context',
          confidence: 'HIGH',
          span: sentence.match(GIFT_TILT_RE)?.[0] || 'dovana atlojama',
          sentence,
          sentenceIndex: index,
          reason: GIFT_TILT_REASON,
          evidence: 'collocation=Tokia dovana tikrai tinka',
        },
        opts,
      ),
    )
  }
  return hits
}

function sentenceSemanticHits(
  sentence: string,
  index: number,
  previous: string,
  opts: NativeSemanticOpts,
): NativeSemanticHit[] {
  const hits: NativeSemanticHit[] = []
  const group = `s${index}`
  const coherenceCode: Partial<Record<LtCopyReason, NativeSemanticCode>> = {
    unnatural_collocation: 'awkward_collocation',
    broken_nominalization: 'awkward_nominalization',
    broken_comparison: 'semantic_comparison_mismatch',
    tense_mismatch: 'tense_mismatch',
    incomplete_thought: 'incomplete_thought',
    unclear_referent: 'unclear_referent',
  }
  for (const row of findLithuanianCoherenceIssues(sentence, previous)) {
    if (row.repairType !== 'full_sentence') continue
    const code = coherenceCode[row.reason]
    if (!code) continue
    hits.push(
      hit(
        {
          code,
          confidence: 'HIGH',
          span: row.original,
          sentence,
          sentenceIndex: index,
          reason: row.reason,
          evidence: row.replacement,
          repairGroupId: group,
        },
        opts,
      ),
    )
  }
  if (isStatementShapedQuestion(sentence, previous, opts.role)) {
    hits.push(
      hit(
        {
          code: 'statement_shaped_question',
          confidence: 'HIGH',
          span: 'Norisi, kad',
          sentence,
          sentenceIndex: index,
          reason: 'impersonal desire statement where the viewer is being asked',
          evidence: 'direct_question_person_shift',
          repairGroupId: group,
        },
        opts,
      ),
    )
  }
  if (/^jauti kaip\b/iu.test(sentence.trim()) && /(?:ą|į)\s*[.!?]*$/iu.test(sentence.trim())) {
    hits.push(
      hit(
        {
          code: 'valid_word_wrong_context',
          confidence: 'HIGH',
          span: sentence.trim(),
          sentence,
          sentenceIndex: index,
          reason: 'jauti kaip plus a noun phrase is not a natural question',
          evidence: 'collocation=Jauti, kad dovanų paieška vėl tampa chaotiška?',
          repairGroupId: group,
        },
        opts,
      ),
    )
  }
  if (INCOMPLETE_SUGALVOTI_RE.test(sentence) && !complementRecoverable(sentence, previous)) {
    hits.push(
      hit(
        {
          code: 'incomplete_complement',
          confidence: 'MEDIUM',
          span: 'sugalvoti sunku',
          sentence,
          sentenceIndex: index,
          reason: 'sugalvoti has no object a native reader can recover',
          evidence: 'missing=ką padovanoti',
          repairGroupId: group,
        },
        opts,
      ),
    )
  }
  const compared = comparisonSides(sentence)
  if (compared) {
    const left = wordGroup(compared.left)
    const right = wordGroup(compared.right)
    if (left && right && left !== right && (left === 'experience' || right === 'experience') && (left === 'object' || right === 'object')) {
      const product = productSemantic(opts)
      hits.push(
        hit(
          {
            code: 'semantic_comparison_mismatch',
            confidence: 'HIGH',
            span: sentence.replace(/[.!?…]+$/u, ''),
            sentence,
            sentenceIndex: index,
            reason: 'experience compared directly to a physical object',
            evidence: `${left} vs ${right}`,
            repairGroupId: group,
          },
          opts,
        ),
      )
      const actor = product?.subject.split(' ').pop() || ''
      if (product && actor && !new RegExp(`(?<!\\p{L})${actor}(?!\\p{L})`, 'iu').test(sentence)) {
        hits.push(
          hit(
            {
              code: 'weak_product_story_bridge',
              confidence: 'HIGH',
              span: sentence.replace(/[.!?…]+$/u, ''),
              sentence,
              sentenceIndex: index,
              reason: 'high-confidence only: product is not the actor in a broken comparison',
              evidence: `family=${product.family}`,
              repairGroupId: group,
            },
            opts,
          ),
        )
      }
    }
  }
  if (MORE_EVENING_RE.test(sentence)) {
    hits.push(
      hit(
        {
          code: 'awkward_collocation',
          confidence: 'HIGH',
          span: 'palieka daugiau vakaro',
          sentence,
          sentenceIndex: index,
          reason: 'verb and noun do not collocate: palikti daugiau vakaro',
          evidence: 'collocation=palieka daugiau vakaro',
          repairGroupId: group,
        },
        opts,
      ),
      hit(
        {
          code: 'translated_sounding_lt',
          confidence: 'HIGH',
          span: 'palieka daugiau vakaro',
          sentence,
          sentenceIndex: index,
          reason: 'translated abstract phrasing instead of a spoken Lithuanian sentence',
          evidence: 'collocation=palieka daugiau vakaro',
          repairGroupId: group,
        },
        opts,
      ),
    )
  }
  if (ABSTRACT_PROCESS_RE.test(sentence)) {
    hits.push(
      hit(
        {
          code: 'awkward_nominalization',
          confidence: 'HIGH',
          span: sentence.replace(/[.!?…]+$/u, ''),
          sentence,
          sentenceIndex: index,
          reason: 'abstract process noun where a human action is natural',
          evidence: 'noun-process',
          repairGroupId: group,
        },
        opts,
      ),
    )
  } else if (SOFT_ABSTRACT_RE.test(sentence)) {
    hits.push(
      hit(
        {
          code: 'translated_sounding_lt',
          confidence: 'NOTE',
          span: sentence.replace(/[.!?…]+$/u, ''),
          sentence,
          sentenceIndex: index,
          reason: 'abstract noun plus a weak verb; native QA should read it',
          evidence: 'density=abstract',
          repairGroupId: group,
        },
        opts,
      ),
    )
  }
  if (SHELF_GUESS_RE.test(sentence)) {
    hits.push(
      hit(
        {
          code: 'vague_metaphor',
          confidence: 'HIGH',
          span: 'nespėlioji kiekvienoje lentynoje',
          sentence,
          sentenceIndex: index,
          reason: 'gift shopping is not naturally described as guessing on every shelf',
          evidence: 'metaphor=lentyna',
          repairGroupId: group,
        },
        opts,
      ),
    )
  }
  hits.push(...lexicalHits(sentence, index, opts))
  return hits
}

export type SemanticRepairPolicy = 'deterministic' | 'native_qa' | 'audit_only'

const REPAIR_POLICY: Array<{
  match: (hit: Pick<NativeSemanticHit, 'code' | 'confidence'>) => boolean
  policy: SemanticRepairPolicy
}> = [
  { match: (hit) => hit.confidence === 'HIGH', policy: 'deterministic' },
  {
    match: (hit) => hit.confidence === 'MEDIUM' && hit.code === 'incomplete_complement',
    policy: 'deterministic',
  },
  { match: (hit) => hit.confidence === 'MEDIUM', policy: 'native_qa' },
  { match: (hit) => hit.confidence === 'NOTE', policy: 'audit_only' },
]

export function semanticRepairPolicy(hit: Pick<NativeSemanticHit, 'code' | 'confidence'>): SemanticRepairPolicy {
  return REPAIR_POLICY.find((row) => row.match(hit))?.policy || 'audit_only'
}

function actionable(hit: NativeSemanticHit): boolean {
  return semanticRepairPolicy(hit) === 'deterministic'
}

function topCode(codes: NativeSemanticCode[]): NativeSemanticCode {
  return [...codes].sort((a, b) => ISSUE_PRIORITY.indexOf(a) - ISSUE_PRIORITY.indexOf(b))[0]
}

function keepFacts(original: string, repaired: string): string {
  const euro = original.match(/iki\s*\d+\s*€/iu)
  if (euro && !repaired.toLocaleLowerCase('lt-LT').includes(euro[0].toLocaleLowerCase('lt-LT'))) {
    return `${repaired.replace(/[.!?…]+$/u, '')} ${euro[0]}.`
  }
  return repaired
}

function complementLine(sentence: string): string {
  if (/^ji\s+turi\s+beveik\s+viską/iu.test(sentence)) return COMPLEMENT_REPAIR
  if (/^jis\s+turi\s+beveik\s+viską/iu.test(sentence)) {
    return 'Jis turi beveik viską, todėl sugalvoti, ką padovanoti, nėra lengva.'
  }
  const lead = sentence.match(/^(.+?),\s*todėl\s+/iu)
  if (lead && /^(?:ji|jis)\b/iu.test(lead[1])) {
    return `${lead[1]}, todėl sugalvoti, ką padovanoti, nėra lengva.`
  }
  return 'Sugalvoti, ką padovanoti, nėra lengva.'
}

function temporalLine(sentence: string): string {
  const visai = /visai/iu.test(sentence)
  if (/^ar\s+žinai\s+tą\s+jausmą/iu.test(sentence)) return 'Ar žinai tą jausmą, kai Kalėdos jau visai čia pat?'
  if (/gruodžio\s+pabaig/iu.test(sentence)) return visai ? 'Gruodžio pabaiga jau visai čia pat.' : 'Gruodžio pabaiga jau čia pat.'
  if (/šventinis\s+laikotarp/iu.test(sentence)) return 'Šventinis laikotarpis jau visai čia pat.'
  if (/švent/iu.test(sentence) && !/kalėd/iu.test(sentence)) return visai ? 'Šventės jau visai arti.' : 'Šventės jau čia pat.'
  return 'Kalėdos jau visai čia pat.'
}

function strategyLine(code: NativeSemanticCode, sentence: string, opts: NativeSemanticOpts): { strategy: string; replacement: string } {
  const coherence = findLithuanianCoherenceIssues(sentence, opts.prior || '').find((row) => {
    if (row.repairType !== 'full_sentence') return false
    if (row.reason === 'tense_mismatch' || row.reason === 'incomplete_thought' || row.reason === 'unclear_referent') {
      return row.reason === code
    }
    if (code === 'awkward_collocation' && row.reason === 'unnatural_collocation') return true
    if (code === 'awkward_nominalization' && row.reason === 'broken_nominalization') return true
    if (code === 'semantic_comparison_mismatch' && row.reason === 'broken_comparison') return true
    return false
  })
  if (coherence) {
    return { strategy: coherence.reason, replacement: coherence.replacement }
  }
  if (code === 'valid_word_wrong_context' && /^jauti kaip\b/iu.test(sentence.trim())) {
    return { strategy: 'native_clause', replacement: 'Jauti, kad dovanų paieška vėl tampa chaotiška?' }
  }
  if (code === 'valid_word_wrong_context' && TIME_BLINK_RE.test(sentence)) {
    return { strategy: 'time_passing', replacement: 'Laikas greitai bėga.' }
  }
  if (code === 'valid_word_wrong_context' && GIFT_TILT_RE.test(sentence)) {
    return { strategy: 'plain_statement', replacement: 'Tokia dovana tikrai tinka.' }
  }
  if (code === 'valid_word_wrong_context') return { strategy: 'temporal_proximity', replacement: temporalLine(sentence) }
  if (code === 'semantic_comparison_mismatch' || code === 'weak_product_story_bridge') {
    const product = productSemantic(opts)
    if (productFitsEvening(product)) return { strategy: 'product_as_actor', replacement: CANDLE_BRIDGE }
    return { strategy: 'drop_comparison', replacement: SIMPLE_EVENING }
  }
  if (code === 'incomplete_complement') return { strategy: 'complete_complement', replacement: complementLine(sentence) }
  if (code === 'statement_shaped_question') return { strategy: 'direct_question_person_shift', replacement: directViewerQuestion(sentence) }
  return { strategy: 'human_action', replacement: HUMAN_CHOICE }
}

/** Sentence-level native semantic pass. Does not choose final wording. */
export function findNativeSemanticHits(text: string, opts: NativeSemanticOpts = {}): NativeSemanticHit[] {
  const source = String(text || '').trim()
  if (!source) return []
  const sentences = ltSentences(source)
  let previous = lastLtSentence(opts.prior || '')
  const hits: NativeSemanticHit[] = []
  sentences.forEach((sentence, index) => {
    hits.push(...sentenceSemanticHits(sentence, index, previous, opts))
    previous = sentence
  })
  return hits
}

export function planSemanticRepairs(
  text: string,
  hits: NativeSemanticHit[],
  opts: NativeSemanticOpts = {},
): SemanticRepairGroup[] {
  const sentences = ltSentences(text)
  const byIndex = new Map<number, NativeSemanticHit[]>()
  for (const row of hits.filter(actionable)) {
    const list = byIndex.get(row.sentenceIndex) || []
    list.push(row)
    byIndex.set(row.sentenceIndex, list)
  }
  const groups: SemanticRepairGroup[] = []
  const used = new Set<number>()
  for (const index of [...byIndex.keys()].sort((a, b) => a - b)) {
    if (used.has(index)) continue
    const rows = byIndex.get(index) || []
    const codes = [...new Set(rows.map((row) => row.code))]
    let indexes = [index]
    const evening = MORE_EVENING_RE.test(sentences[index] || '')
    const next = sentences[index + 1] || ''
    if (evening && SHELF_GUESS_RE.test(next)) indexes = [index, index + 1]
    const ciaupFeeling = /^ar\s+žinai\s+tą\s+jausmą/iu.test(sentences[index] || '') && TEMPORAL_CIAUP_RE.test(sentences[index] || '')
    if (ciaupFeeling && /nepadaryt/iu.test(next)) indexes = [index, index + 1]
    indexes.forEach((i) => used.add(i))
    const code = topCode(codes)
    const planned = ciaupFeeling && indexes.length > 1
      ? { strategy: 'feeling_passage', replacement: FEELING_REPAIR }
      : indexes.length > 1 && evening
        ? { strategy: 'human_action', replacement: HUMAN_CHOICE }
        : strategyLine(code, sentences[index] || '', opts)
    const original = indexes.map((i) => sentences[i] || '').join(' ')
    groups.push({
      id: `s${indexes.join('-')}`,
      sentenceIndexes: indexes,
      codes,
      strategy: planned.strategy,
      confidence: rows.some((row) => row.confidence === 'HIGH') ? 'HIGH' : 'MEDIUM',
      replacement: keepFacts(original, planned.replacement),
    })
  }
  return groups
}

/** One rewrite pass for the collected issue set. Discarded if HIGH/MEDIUM issues remain. */
export function repairNativeSemantic(
  text: string,
  opts: NativeSemanticOpts = {},
): {
  text: string
  hits: NativeSemanticHit[]
  groups: SemanticRepairGroup[]
  changed: boolean
  recheckResult: 'pass' | 'reverted'
} {
  const punctuated = normalizeDirectQuestionPunctuation(text)
  const hits = findNativeSemanticHits(punctuated.text, opts)
  const groups = planSemanticRepairs(punctuated.text, hits, opts)
  if (!groups.length) {
    return { text: punctuated.text, hits, groups, changed: punctuated.changed, recheckResult: 'pass' }
  }
  const parts = ltSentences(punctuated.text)
  const consumed = new Set<number>()
  for (const group of groups) {
    if (group.sentenceIndexes.some((index) => consumed.has(index))) continue
    parts[group.sentenceIndexes[0]] = group.replacement
    for (const index of group.sentenceIndexes.slice(1)) parts[index] = ''
    group.sentenceIndexes.forEach((index) => consumed.add(index))
  }
  const next = normalizeDirectQuestionPunctuation(parts.filter(Boolean).join(' ')).text
  const again = findNativeSemanticHits(next, opts).filter(actionable)
  if (again.length) return { text, hits, groups, changed: false, recheckResult: 'reverted' }
  return { text: next, hits, groups, changed: next !== text, recheckResult: 'pass' }
}

/** Thin wrapper. Semantic truth lives in findNativeSemanticHits. */
export function findValidWordWrongContext(text: string): ValidWordWrongContextHit[] {
  return findNativeSemanticHits(text)
    .filter((row) => row.code === 'valid_word_wrong_context')
    .map((row) => {
      const repair = row.evidence.replace(/^collocation=/, '')
      return {
        sentence: row.sentence,
        original: row.span === 'čiaupo' ? 'Kalėdos jau čiaupo' : row.span,
        reason: row.reason,
        repair,
        replacement: repair.endsWith('.') || repair.endsWith('?') ? repair : `${repair}.`,
      }
    })
}

/** Thin wrapper around repairNativeSemantic. */
export function repairValidWordWrongContext(text: string): {
  text: string
  hits: ValidWordWrongContextHit[]
  changed: boolean
} {
  const repaired = repairNativeSemantic(text)
  return { text: repaired.text, hits: findValidWordWrongContext(text), changed: repaired.changed }
}
export function findSentenceFragments(text: string): string[] {
  const out: string[] = []
  for (const sentence of String(text || '').split(/(?<=[.!?…])\s+/u)) {
    const s = sentence.trim()
    if (!s) continue
    const words = s.split(/\s+/).filter((w) => /\p{L}/u.test(w))
    if (words.length === 1 && /[.!]$/u.test(s)) out.push(s)
    if (/^kai\s/iu.test(s) && !/[,?]/u.test(s) && words.length <= 8 && /[.!]$/u.test(s)) out.push(s)
    if (/^(?:(?:su|be|į|iš|apie|dėl|prie)\s+)?kur(?:is|i|ie|ios|iuo|iais|ią|į|iam|iai|ių|iomis)\s/iu.test(s)) out.push(s)
  }
  if (/[:\-–—]\s*$/u.test(String(text || '').trim())) out.push('dangling trailing punctuation')
  return out
}

export function kaleduDeterministicQa(slides: KaleduQaSlide[], ctx: KaleduQaContext): KaleduQaFlag[] {
  const flags: KaleduQaFlag[] = []
  const storyAllowed = ctx.allowed
  const productTruth = ctx.productTruth !== false
  slides.forEach((slide, index) => {
    const title = String(slide.title || '')
    const body = String(slide.body || '')
    const blob = `${title} ${body}`.trim()
    const codes = new Set<KaleduQaCode>()
    const details: string[] = []
    const add = (code: KaleduQaCode, detail: string) => {
      codes.add(code)
      details.push(`${code}: ${detail}`)
    }
    for (const err of findAgreementErrors(blob)) add('case_agreement', err)
    for (const err of findPersonNumberErrors(blob)) add('person_number', err)
    for (const err of findRegisterErrors(blob)) add('register_violation', `register "${err}"`)
    for (const frag of findSentenceFragments(blob)) add('incomplete_clause', `fragment "${frag}"`)
    const inventedWord = blob.match(INVENTED_WORD_RE)?.[0]
    if (inventedWord) add('invented_word', inventedWord)
    for (const err of findCaseGovernmentErrors(blob)) add('case_agreement', err)
    for (const err of findVerbConstructionErrors(blob)) add('verb_construction', err)
    const spell = checkLtSpelling(blob)
    if (spell.hardFail) add('spell_hard_fail', spell.hardFail)
    if (spell.note) add('spell_note', spell.note)
    const titleCut = findIncompleteClause(title, slide.role, 'title')
    if (titleCut) add('incomplete_clause', `title ${titleCut}`)
    const bodyCut = findIncompleteClause(body, slide.role, 'body')
    if (bodyCut) add('incomplete_clause', `body ${bodyCut}`)
    const colloc = blob.match(UNNATURAL_COLLOCATION_RE)?.[0]
    if (colloc) add('unnatural_collocation', colloc)
    const prior = index > 0 ? `${slides[index - 1].title || ''} ${slides[index - 1].body || ''}` : ''
    if (repairHurriedClauses(blob).grammarRepair) add('incomplete_clause', 'subordinate_clause_missing_predicate')
    if (productTruth && productContextGap(blob, prior)) {
      add('product_context_mismatch', 'product has no use-case in the previous slide')
    }
    for (const miss of findMissingQuestionMarks(blob)) {
      if (classifyUgcQuestion(miss.sentence)) continue
      add('missing_question_mark', miss.sentence)
    }
    for (const hit of findNativeSemanticHits(blob, { role: slide.role, productId: slide.productId, prior })) {
      if (semanticRepairPolicy(hit) !== 'deterministic') continue
      add(
        hit.code,
        `group=${hit.repairGroupId} confidence=${hit.confidence} | ${hit.reason} | original="${hit.span}"`,
      )
    }
    const filler = blob.match(EMPTY_AI_RE)?.[0]
    if (filler) add('empty_ai_language', filler)
    if (productTruth) {
      const invented = kaleduInventedProductMentions(blob, storyAllowed)
      if (invented.length) add('product_truth', `not in PRODUCTS_ALLOWED: ${invented.slice(0, 3).join(', ')}`)
      const ungrounded = kaleduUngroundedRecommendations(blob, storyAllowed, slide.productId || '')
      if (ungrounded.length) add('product_truth', `recommendation without productId: ${ungrounded.slice(0, 3).join(', ')}`)
      const verdict = kaleduProductSlideVerdict(slide)
      if (verdict !== 'ok' && verdict !== 'no_product') add('product_truth', `productId ${verdict}`)
      const leak = blob.match(UGC_KALEDU_DIET_LEAK_RE)?.[0]
      if (leak) add('contamination', leak)
    }
    for (const issue of detectKaleduNativeIssues(slide, { giftNiche: productTruth })) {
      if (issue.code === 'invented_product') continue
      add(issue.code === 'incomplete_subordinate_hook' ? 'incomplete_clause' : 'native_style', issue.code)
    }
    if (codes.size) flags.push({ index, codes: [...codes], details, source: 'deterministic' })
  })
  return flags
}

const JUDGE_CODE_MAP: Record<string, KaleduQaCode> = {
  agreement: 'case_agreement',
  person: 'person_number',
  incomplete: 'incomplete_clause',
  collocation: 'unnatural_collocation',
  wrong_context: 'valid_word_wrong_context',
  invented_word: 'invented_word',
  ai_filler: 'empty_ai_language',
  incoherent: 'semantic_coherence',
  invented_product: 'product_truth',
}

export const KALEDU_QA_JUDGE_SYSTEM = `Tu esi griežtas lietuvių kalbos redaktorius. Tikrini Kalėdų Kampelio UGC skaidres.
Pažymėk TIK aiškias klaidas:
agreement = linksnio/giminės/skaičiaus derinimas (pvz. „Minkšta vilnos pledas“)
person = asmuo nesutampa („žmogus jauti“)
incomplete = nebaigtas sakinys ar antraštė
collocation = taip lietuviai nesako
wrong_context = tikras lietuviškas žodis, bet reikšmė sakinyje absurdiška (pvz. „Kalėdos jau čiaupo“)
invented_word = neegzistuojantis ar iškraipytas žodis
ai_filler = tuščia reklaminė poezija (siela, magija, tarsi pasaka)
incoherent = skaidrė nesusijusi su tema ar ankstesne skaidre
invented_product = konkreti prekė, kurios nėra PRODUCTS_ALLOWED
"q" = TIKSLI ištrauka iš skaidrės teksto (2–6 žodžiai). Be ištraukos - nežymėk.
Jei viskas gerai: {"bad":[]}. TIK JSON {"bad":[{"i":0,"c":["agreement"],"q":"..."}]}`

/** Tavo knyga / shared language judge — no catalog product codes. */
export const UGC_LT_QA_JUDGE_SYSTEM = `Tu esi griežtas lietuvių kalbos redaktorius. Tikrini „Tavo knyga" UGC skaidres (mityba / maisto planas).
Pažymėk TIK aiškias klaidas:
agreement = linksnio/giminės/skaičiaus derinimas
person = asmuo nesutampa („žmogus jauti“)
incomplete = nebaigtas sakinys ar antraštė
collocation = taip lietuviai nesako
wrong_context = tikras lietuviškas žodis, bet reikšmė sakinyje absurdiška
invented_word = neegzistuojantis ar iškraipytas žodis
ai_filler = tuščia reklaminė poezija / biurokratinė abstrakcija
incoherent = skaidrė nesusijusi su tema ar ankstesne skaidre
"q" = TIKSLI ištrauka iš skaidrės teksto (2–6 žodžiai). Be ištraukos — nežymėk.
Jei viskas gerai: {"bad":[]}. TIK JSON {"bad":[{"i":0,"c":["agreement"],"q":"..."}]}`

export function buildKaleduQaJudgePrompt(slides: KaleduQaSlide[], ctx: KaleduQaContext, indexes?: number[]): string {
  const rows = slides
    .map((slide, i) => ({ i, role: slide.role || '', text: `${slide.title || ''} ${slide.body || ''}`.trim() }))
    .filter((row) => !indexes || indexes.includes(row.i))
  if (ctx.productTruth === false) {
    return `Tema: ${ctx.theme}\n\nSKAIDRĖS:\n${JSON.stringify(rows)}\n\nJSON:`
  }
  const products = ctx.allowed.length
    ? ctx.allowed.map((p) => productTypePhrase(p)).join(', ')
    : 'nėra (konkrečios prekės draudžiamos)'
  return `Tema: ${ctx.theme}\nPRODUCTS_ALLOWED: ${products}\n\nSKAIDRĖS:\n${JSON.stringify(rows)}\n\nJSON:`
}

/**
 * Parse judge JSON; keep only flags whose quote really occurs in that slide.
 * Quotes that are just an allowed catalog product phrase are judge false positives.
 */
export function parseKaleduQaJudge(
  raw: unknown,
  slides: KaleduQaSlide[],
  allowed: KaleduCatalogProduct[] = [],
): KaleduQaFlag[] {
  const productPhrases = allowed.map((p) => productTypePhrase(p).toLocaleLowerCase('lt-LT'))
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const rows = Array.isArray(obj.bad) ? obj.bad : []
  const flags = new Map<number, KaleduQaFlag>()
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const rec = row as { i?: unknown; c?: unknown; q?: unknown }
    const index = Number(rec.i)
    if (!Number.isInteger(index) || index < 0 || index >= slides.length) continue
    const quote = typeof rec.q === 'string' ? rec.q.trim() : ''
    const text = `${slides[index].title || ''} ${slides[index].body || ''}`.toLocaleLowerCase('lt-LT')
    const quoteLower = quote.toLocaleLowerCase('lt-LT')
    if (quote.length < 3 || !text.includes(quoteLower)) continue
    if (productPhrases.some((phrase) => phrase && (phrase === quoteLower || phrase.startsWith(quoteLower)))) continue
    const rawCodes = Array.isArray(rec.c) ? rec.c : [rec.c]
    const codes = rawCodes
      .map((code) => JUDGE_CODE_MAP[String(code || '').trim()])
      .filter((code): code is KaleduQaCode => Boolean(code))
    if (!codes.length) continue
    const existing = flags.get(index)
    if (existing) {
      existing.codes = [...new Set([...existing.codes, ...codes])]
      existing.details.push(`judge: ${codes.join(',')} "${quote}"`)
    } else {
      flags.set(index, { index, codes, details: [`judge: ${codes.join(',')} "${quote}"`], source: 'judge' })
    }
  }
  return [...flags.values()]
}

export type CombinedQaSlide = {
  index: number
  status: 'PASS' | 'REWRITE'
  codes: KaleduQaCode[]
  title?: string
  body?: string
}

/** One QA response: PASS keeps the original; REWRITE carries the replacement. */
export function parseCombinedKaleduQa(raw: unknown, slideCount: number): CombinedQaSlide[] {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const rows = Array.isArray(obj.slides) ? obj.slides : []
  const out: CombinedQaSlide[] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const rec = row as { index?: unknown; i?: unknown; status?: unknown; codes?: unknown; replacement?: unknown; title?: unknown; body?: unknown }
    const index = Number(rec.index ?? rec.i)
    if (!Number.isInteger(index) || index < 0 || index >= slideCount) continue
    const status = String(rec.status || '').toUpperCase() === 'REWRITE' ? 'REWRITE' : 'PASS'
    const replacement = rec.replacement && typeof rec.replacement === 'object' ? (rec.replacement as { title?: unknown; body?: unknown }) : rec
    const title = typeof replacement.title === 'string' ? replacement.title : undefined
    const body = typeof replacement.body === 'string' ? replacement.body : undefined
    const codes = Array.isArray(rec.codes) ? rec.codes.map((code) => String(code)) as KaleduQaCode[] : []
    if (status === 'REWRITE' && !String(body || '').trim() && !String(title || '').trim()) continue
    out.push({ index, status, codes, title, body })
  }
  return out
}

export function mergeKaleduQaFlags(a: KaleduQaFlag[], b: KaleduQaFlag[]): KaleduQaFlag[] {
  const byIndex = new Map<number, KaleduQaFlag>()
  for (const flag of [...a, ...b]) {
    const prev = byIndex.get(flag.index)
    if (!prev) {
      byIndex.set(flag.index, { ...flag, codes: [...flag.codes], details: [...flag.details] })
      continue
    }
    prev.codes = [...new Set([...prev.codes, ...flag.codes])]
    prev.details.push(...flag.details)
    if (prev.source !== flag.source) prev.source = 'both'
  }
  return [...byIndex.values()].sort((x, y) => x.index - y.index)
}

const REWRITE_HINTS: Record<KaleduQaCode, string> = {
  case_agreement: 'sutvarkyk linksnius ir giminę',
  person_number: 'asmuo turi sutapti (tu … jauti / jis … jaučia)',
  incomplete_clause: 'užbaik mintį pilnu sakiniu',
  unnatural_collocation: 'rašyk taip, kaip lietuvis pasakytų',
  invented_word: 'pakeisk iškraipytą žodį tikru',
  empty_ai_language: 'be poezijos, konkrečiai',
  semantic_coherence: 'laikykis temos ir ankstesnės skaidrės',
  product_truth: 'jokių konkrečių prekių, kurių nėra PRODUCTS_ALLOWED; rašyk bendrai apie dovaną',
  contamination: 'tik apie kalėdines dovanas',
  native_style: 'natūrali šnekamoji lt-LT',
  verb_construction: 'po „verčia/gali/reikia“ - bendratis; nerašyk „esi …damas“',
  register_violation: 'kreipkis tik „tu“: be aš / mes / jūs formų',
  spell_hard_fail: 'perrašyk visą sakinį be iškraipyto žodžio; nekeisk tik vieno žodžio',
  spell_note: 'jei žodis neegzistuoja lietuviškai - perrašyk sakinį',
  valid_word_wrong_context: 'perrašyk visą sakinį: tikras žodis čia semantiškai netinka',
  incomplete_complement: 'užbaik mintį: sugalvoti ką',
  semantic_comparison_mismatch: 'nebealyginik skirtingų dalykų; perrašyk visą mintį',
  awkward_collocation: 'rašyk taip, kaip lietuvis pasakytų',
  awkward_nominalization: 'vietoj abstraktaus proceso rašyk žmogaus veiksmą',
  translated_sounding_lt: 'perrašyk visą sakinį šnekamąja lt-LT',
  vague_metaphor: 'mesk keistą metaforą, pasakyk tiesiai',
  weak_product_story_bridge: 'parodyk, kodėl būtent ši prekė tinka istorijai',
  statement_shaped_question: 'klausk žiūrovo tiesiogiai: Nori, kad...?',
  tense_mismatch: 'sulygink laikus visame sakinyje ir perrašyk jį iš naujo',
  incomplete_thought: 'perrašyk visą sakinį, kad mintis būtų užbaigta',
  unclear_referent: 'pasakyk, ką įvardis reiškia',
  product_context_mismatch: 'pirmiau parodyk, kodėl ši prekė tinka',
  missing_question_mark: 'tikras klausimas baigiasi klaustuku',
}

export function kaleduRewriteHints(codes: KaleduQaCode[]): string {
  return [...new Set(codes.map((code) => REWRITE_HINTS[code]))].join('; ')
}
