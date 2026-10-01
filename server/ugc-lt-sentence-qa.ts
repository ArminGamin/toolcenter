/**
 * Generic Lithuanian sentence intent, punctuation, and coherence.
 * A valid word is not a valid sentence. Christmas story/product rules stay outside this file.
 */

export type SentenceIntent = 'question' | 'statement' | 'exclamation' | 'cta' | 'invalid'

export type CopyRepairType = 'token' | 'punctuation' | 'full_sentence'

export type LtCopyReason =
  | 'missing_question_mark'
  | 'wrong_terminal_punctuation'
  | 'broken_case'
  | 'tense_mismatch'
  | 'unclear_referent'
  | 'incomplete_thought'
  | 'broken_comparison'
  | 'unnatural_collocation'
  | 'broken_nominalization'
  | 'translated_syntax'
  | 'semantic_nonsense'
  | 'product_context_mismatch'

export type LtSentenceIssue = {
  pass: false
  sentenceIndex: number
  reason: LtCopyReason
  original: string
  replacement: string
  confidence: 'high'
  repairType: CopyRepairType
}

export type SentenceIntentResult = {
  intent: SentenceIntent
  confidence: 'high' | 'medium' | 'low'
  hints: string[]
}

const CTA_RE = /kaledukampelis\.com|tavoknyga\.com|pirk\s+dabar|apsilankyk/iu
const FEELING_PREDICATE_RE =
  /(?<!\p{L})(jautiesi|jaučiasi|jaučiuosi)\s+(?:(?:visiškai|labai|tikrai|toks|tokia)\s+)?(panika|nuobodulys|stresas|chaosas|džiaugsmas|baimė|ramybė)(?!\p{L})/iu
const NOMINALIZATION_RE =
  /(?<!\p{L})\p{L}{3,}(?:as|is|ys|us|ė|a)\s+\p{L}+(?:imo|ymo|ėjimo)\s+\p{L}+(?:ai|ui)(?!\p{L})/iu
const SOLUTION_NOMINAL_RE = /(?<!\p{L})(?:yra\s+)?sprendimas\s+(?:šilum|dovan|išsaug)/iu
const BROKEN_COMPARISON_RE =
  /ką\s+(\p{L}+(?:am|ai))\s+(\p{L}+)\s*,\s*kitam\s+(\p{L}+)(?!\p{L})/iu
const TENSE_FUTURE_RE = /(?<!\p{L})(naudos|pirks|turės|matys|dovanos|naudosis|ieškos|pirksis)(?!\p{L})/iu
const TENSE_PRESENT_RE = /(?<!\p{L})(primena|tinka|padeda|suteikia|duoda|lieka)(?!\p{L})/iu
const INCOMPLETE_TIK_RE = /kad\s+(\p{L}+)\s+tik\s+(\p{L}+(?:ui|ai))(?!\p{L})/iu
const DANGLING_JI_RE = /^(?:ji|ją)\s+(?:puikiai\s+)?(?:pravers|tinka|primena|padeda)\b/iu
const FEMININE_REF_RE =
  /(?<!\p{L})(?:dovana|dovaną|dovanos|žvakė|žvakę|lempa|lempą|kava|kavą|arbata|arbatą|knyga|knygą|ji|ją|jai)(?!\p{L})/iu
const THERMOS_RE = /termos/iu
const THERMOS_SETUP_RE = /kel|kav|arbat|gėrim|atšal|važiu|kely|karšt|šalt/iu
const READER_2SG_RE =
  /(?<!\p{L})(praleidi|neišsirinkai|nežinai|ieškai|važinėji|būni|jauti|nori|renkiesi|atidedi|svarstai|lauki|perki)(?!\p{L})/iu

const FUTURE_FOR_PRESENT: Record<string, string> = {
  primena: 'primins',
  tinka: 'tiks',
  padeda: 'padės',
  suteikia: 'suteiks',
  duoda: 'duos',
  lieka: 'liks',
}

export function bareLtSentence(sentence: string): string {
  return String(sentence || '')
    .trim()
    .replace(/[.!?…]+$/u, '')
    .trim()
}

export function splitLtSentences(text: string): string[] {
  return String(text || '')
    .split(/(?<=[.!?…])\s+/u)
    .map((part) => part.trim())
    .filter(Boolean)
}

function statementFrame(bare: string): boolean {
  if (/^žinai,\s*kad\b/iu.test(bare)) return true
  if (/^(?:kas|ką)\s+\p{L}+(?:am|ai)\b/iu.test(bare) && /,\s*kitam\b/iu.test(bare)) return true
  if (/^(?:praktiška|jauki|maža|šventinis)\s+(?:dovana|vakaras)\b/iu.test(bare)) return true
  if (/^(?:tu\s+)?dažnai\b/iu.test(bare)) return true
  if (/^(?:šiemet|kasmet)\b/iu.test(bare) && /iš anksto/iu.test(bare)) return true
  if (/^(?:tu)\s+/iu.test(bare) && !/^(?:tu)\s+(?:dar|vis dar)\b/iu.test(bare)) return true
  if (/(?:renkamės|žinome|galime|turime)/iu.test(bare)) return true
  return false
}

/** Inexpensive hints. They do not rewrite the sentence by themselves. */
export function questionHints(sentence: string): string[] {
  const bare = bareLtSentence(sentence)
  const hints: string[] = []
  if (/^(?:ar|kodėl|kaip|ką|kas|kur|kada|kuris|kuri|kiek|koks|kokia|kam)\b/iu.test(bare)) hints.push('q_word')
  if (/^gal\s/iu.test(bare)) hints.push('gal')
  if (/^vis dar\b/iu.test(bare)) hints.push('vis_dar')
  if (/^dar\s+(?:ne|nei)/iu.test(bare)) hints.push('dar_neg')
  if (/^(?:nežinai|ieškai)\b/iu.test(bare)) hints.push('reader_verb')
  if (/^žinai tą jausmą\b/iu.test(bare)) hints.push('feeling')
  if (/^daug laiko\b/iu.test(bare) && READER_2SG_RE.test(bare)) hints.push('daug_laiko')
  if (/^(?:sunku|atrodo)\b/iu.test(bare) && /(?:išrink|padovan|rasti|dovan)/iu.test(bare)) hints.push('sunku')
  return hints
}

function confirmQuestion(bare: string, hints: string[]): boolean {
  if (!hints.length || statementFrame(bare)) return false
  if (hints.includes('q_word') && /^žinai,\s*kad\b/iu.test(bare)) return false
  if (hints.includes('vis_dar') && !/(?:nežinai|ieškai|be\s+dovan|neturi|neapsisprend|renkiesi|perki)/iu.test(bare)) {
    return false
  }
  return true
}

export function classifySentenceIntent(sentence: string): SentenceIntentResult {
  const raw = String(sentence || '').trim()
  const bare = bareLtSentence(raw)
  if (!bare || bare.split(/\s+/).length < 2) {
    return { intent: 'invalid', confidence: 'high', hints: [] }
  }
  if (CTA_RE.test(bare)) return { intent: 'cta', confidence: 'high', hints: ['cta'] }
  const hints = questionHints(bare)
  if (confirmQuestion(bare, hints)) {
    return { intent: 'question', confidence: 'high', hints }
  }
  if (/[!]$/u.test(raw) && !hints.length) return { intent: 'exclamation', confidence: 'medium', hints: [] }
  return { intent: 'statement', confidence: hints.length ? 'low' : 'high', hints }
}

export function isConfirmedReaderQuestion(sentence: string): boolean {
  return classifySentenceIntent(sentence).intent === 'question'
}

function collapseTerminal(sentence: string, mark: '?' | '.' | '!'): string {
  const bare = bareLtSentence(sentence)
  return `${bare}${mark}`
}

/** Punctuation follows intent. Does not rewrite wording. */
export function applySentenceIntentPunctuation(text: string): { text: string; changed: boolean; repairs: number } {
  const parts = String(text || '').split(/(?<=[.!?…])\s+/u)
  let repairs = 0
  const next = parts.map((part) => {
    const s = part.trim()
    if (!s) return part
    const intent = classifySentenceIntent(s)
    const terminal = s.match(/[.!?…]+$/u)?.[0] || ''
    const messy = terminal.length > 1 || /[.!?…]{2,}|[.!][?]|[?][!]/u.test(terminal)
    if (intent.intent === 'question') {
      if (terminal === '?' && !messy) return part
      repairs += 1
      return collapseTerminal(s, '?')
    }
    if (intent.intent === 'statement' && (messy || terminal === '?' || terminal === '')) {
      if (terminal === '.' && !messy) return part
      if (terminal === '' && !/[.!?…]$/u.test(s)) {
        repairs += 1
        return collapseTerminal(s, '.')
      }
      if (messy || terminal === '?') {
        repairs += 1
        return collapseTerminal(s, '.')
      }
    }
    if (intent.intent === 'exclamation' && terminal !== '!') {
      repairs += 1
      return collapseTerminal(s, '!')
    }
    return part
  })
  const textOut = next.join(' ')
  return { text: textOut, changed: textOut !== String(text || ''), repairs }
}

function emotionRewrite(sentence: string, noun: string): string {
  if (/žinai tą jausmą/iu.test(sentence)) {
    return `Žinai tą jausmą, kai paskutinę minutę apima ${noun}?`
  }
  return `Paskutinę minutę apima ${noun}.`
}

function nominalRewrite(sentence: string): string {
  if (THERMOS_RE.test(sentence)) return 'Termosas padeda ilgiau išlaikyti gėrimą karštą.'
  const subject = sentence.match(/^(\p{L}{3,})/u)?.[1]
  if (subject) return `${subject} tam puikiai tinka.`
  return 'Tai praktiška dovana kasdienai.'
}

function tenseRewrite(sentence: string, present: string): string {
  const future = FUTURE_FOR_PRESENT[present.toLocaleLowerCase('lt-LT')] || present
  const next = sentence.replace(new RegExp(`(?<!\\p{L})${present}(?!\\p{L})`, 'iu'), (found) => {
    const word = present.toLocaleLowerCase('lt-LT') === 'primena' ? `vis ${future}` : future
    return found.charAt(0) === found.charAt(0).toLocaleUpperCase('lt-LT') ? word.charAt(0).toLocaleUpperCase('lt-LT') + word.slice(1) : word
  })
  return /[.!?…]$/u.test(next) ? next.replace(/[.!?…]+$/u, '.') : `${next}.`
}

export function findLithuanianCoherenceIssues(text: string, prior = ''): LtSentenceIssue[] {
  const sentences = splitLtSentences(text)
  const issues: LtSentenceIssue[] = []
  sentences.forEach((sentence, sentenceIndex) => {
    const feeling = sentence.match(FEELING_PREDICATE_RE)
    if (feeling) {
      issues.push({
        pass: false,
        sentenceIndex,
        reason: 'unnatural_collocation',
        original: sentence,
        replacement: emotionRewrite(sentence, feeling[2].toLocaleLowerCase('lt-LT')),
        confidence: 'high',
        repairType: 'full_sentence',
      })
    }
    if (NOMINALIZATION_RE.test(sentence) || SOLUTION_NOMINAL_RE.test(sentence)) {
      issues.push({
        pass: false,
        sentenceIndex,
        reason: 'broken_nominalization',
        original: sentence,
        replacement: nominalRewrite(sentence),
        confidence: 'high',
        repairType: 'full_sentence',
      })
    }
    if (BROKEN_COMPARISON_RE.test(sentence)) {
      issues.push({
        pass: false,
        sentenceIndex,
        reason: 'broken_comparison',
        original: sentence,
        replacement: 'Kas vienam patinka, kitam gali visai netikti.',
        confidence: 'high',
        repairType: 'full_sentence',
      })
    }
    const future = TENSE_FUTURE_RE.test(sentence)
    const present = sentence.match(TENSE_PRESENT_RE)
    if (/^kai\b/iu.test(bareLtSentence(sentence)) && future && present) {
      issues.push({
        pass: false,
        sentenceIndex,
        reason: 'tense_mismatch',
        original: sentence,
        replacement: tenseRewrite(sentence, present[1]),
        confidence: 'high',
        repairType: 'full_sentence',
      })
    }
    const incomplete = sentence.match(INCOMPLETE_TIK_RE)
    if (incomplete && !/(?:tinka|praverčia|patinka|reiškia|yra)\b/iu.test(sentence.slice(sentence.toLocaleLowerCase('lt-LT').indexOf('kad')))) {
      issues.push({
        pass: false,
        sentenceIndex,
        reason: 'incomplete_thought',
        original: sentence,
        replacement: 'Žinai, kad išrinkai daiktą, kuris tam žmogui tikrai tinka.',
        confidence: 'high',
        repairType: 'full_sentence',
      })
    }
    if (DANGLING_JI_RE.test(bareLtSentence(sentence)) && !FEMININE_REF_RE.test(prior)) {
      issues.push({
        pass: false,
        sentenceIndex,
        reason: 'unclear_referent',
        original: sentence,
        replacement: 'Tokia dovana puikiai pravers kasdien.',
        confidence: 'high',
        repairType: 'full_sentence',
      })
    }
    const intent = classifySentenceIntent(sentence)
    const terminal = sentence.match(/[.!?…]+$/u)?.[0] || ''
    if (intent.intent === 'question' && terminal !== '?') {
      issues.push({
        pass: false,
        sentenceIndex,
        reason: 'missing_question_mark',
        original: sentence,
        replacement: collapseTerminal(sentence, '?'),
        confidence: 'high',
        repairType: 'punctuation',
      })
    } else if (terminal.length > 1) {
      const mark = intent.intent === 'question' ? '?' : intent.intent === 'exclamation' ? '!' : '.'
      issues.push({
        pass: false,
        sentenceIndex,
        reason: 'wrong_terminal_punctuation',
        original: sentence,
        replacement: collapseTerminal(sentence, mark),
        confidence: 'high',
        repairType: 'punctuation',
      })
    }
  })
  return issues
}

export function productContextGap(slideText: string, prior: string): boolean {
  if (!prior.trim()) return false
  if (!THERMOS_RE.test(slideText)) return false
  return !THERMOS_SETUP_RE.test(prior)
}

const MAX_SEMANTIC_REPAIRS = 3

export function semanticRepairEscalates(substantialRepairs: number, storyFailures: number): boolean {
  return substantialRepairs >= MAX_SEMANTIC_REPAIRS || storyFailures >= 2
}

export type CopyQaCounters = {
  sentencesChecked: number
  punctuationRepairs: number
  lexicalRepairs: number
  semanticRepairs: number
  storyRepairs: number
  productContextRepairs: number
  regenerations: number
  finalPass: boolean
  firstPassSuccess: boolean
  repairSuccess: boolean
  regenerationRequired: boolean
}

export function emptyCopyQaCounters(): CopyQaCounters {
  return {
    sentencesChecked: 0,
    punctuationRepairs: 0,
    lexicalRepairs: 0,
    semanticRepairs: 0,
    storyRepairs: 0,
    productContextRepairs: 0,
    regenerations: 0,
    finalPass: false,
    firstPassSuccess: false,
    repairSuccess: false,
    regenerationRequired: false,
  }
}
