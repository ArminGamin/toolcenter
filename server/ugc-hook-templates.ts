/**
 * Hook title templates — LLM fills topic/pain; code finalizes shape.
 * Interrogative titles (Ar / Kodėl / …) ALWAYS end with "?" — regardless of UgcHookStyle.
 */

import {
  demoteLtTitleCase,
  hasUnmarkedColonQuestion,
  hookBodyEchoesTitle,
  LT_QUESTION_STARTER_RE,
  LT_QUESTION_WORD_START_RE,
  normalizeLtUgcMultiline,
  polishLtCaps,
  stripTitleEchoFromBody,
  UGC_KALEDU_DIET_LEAK_RE,
} from './ugc-lt-normalize.js'
import { isChristmasGiftsNiche } from './profile-brand.js'

export { hookBodyEchoesTitle, stripTitleEchoFromBody }

export type UgcHookStyleName =
  | 'Contrarian'
  | 'Question'
  | 'Story opener'
  | 'Bold claim'
  | 'Confession'
  | 'Before / after'
  | 'Empathy mirror'
  | 'Pattern interrupt'
  | 'Challenge'
  | 'Uncomfortable truth'

const QUESTION_TEMPLATES = [
  (pain: string) => `Ar ${pain}?`,
  (pain: string) => `Kodėl ${pain}?`,
  (pain: string) => `Ar jauti, kad ${pain}?`,
] as const

const CLAIM_TEMPLATES = [
  (pain: string) => `${pain.charAt(0).toUpperCase()}${pain.slice(1)}`,
  (pain: string) => `Sunki tiesa apie ${pain}`,
  (pain: string) => `Nustok ignoruoti: ${pain}`,
] as const

export function clipPain(raw: string, max = 42): string {
  let t = normalizeLtUgcMultiline(raw)
    .replace(/^(?:Ar|Kodėl)\s+/iu, '')
    .replace(/\?+$/g, '')
    .replace(/^sunki tiesa[:\s]*/i, '')
    .trim()
  t = t.replace(/^(kad|jog)\s+/i, '')
  if (t.length > max) {
    const slice = t.slice(0, max)
    const sp = slice.lastIndexOf(' ')
    t = (sp > 20 ? slice.slice(0, sp) : slice).trim()
  }
  return t.replace(/[.,;:]+$/u, '').trim()
}

function looksLikeQuestionStyle(style: string): boolean {
  return /question/i.test(style)
}

const AR_COLON_WH_RE = /^Ar\s+.+:\s*(ką|kas|kaip|kodėl|kur|kada|kiek|ko)(?!\p{L})/iu
const AR_THEN_WH_RE = /^Ar\s+(ką|kas|kaip|kodėl|kur|kada|kiek|ko)(?!\p{L})/iu

/** "Ar" only when the title is a real yes/no question, not "Ar topic: ką …?". */
export function isNaturalArYesNoQuestion(title: string): boolean {
  const t = String(title || '').replace(/\s+/g, ' ').trim()
  if (!/^Ar\b/iu.test(t)) return false
  if (AR_COLON_WH_RE.test(t) || AR_THEN_WH_RE.test(t)) return false
  if (/:\s*(ką|kas|kaip|kodėl|kur|kada|kiek|ko)(?!\p{L})/iu.test(t)) return false
  return true
}

/** Titles that are questions by shape — must keep trailing "?". */
export function isInterrogativeHookTitle(title: string): boolean {
  const t = String(title || '').trim()
  if (!t) return false
  if (LT_QUESTION_STARTER_RE.test(t) || /^Kodėlgi\b/iu.test(t)) return true
  if (hasUnmarkedColonQuestion(t)) return true
  const colonSeg = t.split(/[:;]/).pop()?.trim() || ''
  if (colonSeg && LT_QUESTION_WORD_START_RE.test(colonSeg)) return true
  // Bare masculine participle / rewritten tu-participle openers are questions
  if (/^(Pavargęs|Pavargai|Išsekęs|Išsekai|Įstrigęs|Įstrigai)(?!\p{L})/u.test(t)) return true
  return false
}

export function ensureHookQuestionMark(title: string): string {
  let t = String(title || '').replace(/\s+/g, ' ').trim()
  if (!t || !isInterrogativeHookTitle(t)) return t
  t = t.replace(/[.!…]+$/u, '').trim()
  if (!t.endsWith('?')) t = `${t}?`
  return t
}

/**
 * Finalize a hook title from model output + style.
 * Question styles AND interrogative shapes always end with "?". Never Title Case / CTA.
 */
export function finalizeHookTitle(
  rawTitle: string,
  style: string,
  topicHint: string,
  seed = 0,
): string {
  const raw = demoteLtTitleCase(String(rawTitle || '').trim())
  const topic = clipPain(topicHint || raw || 'savaitės planą', 36)
  const painFromTitle = clipPain(raw || topic, 42)
  const pain = painFromTitle || topic
  const forceQuestion = looksLikeQuestionStyle(style) || isInterrogativeHookTitle(raw)

  let out: string
  if (forceQuestion) {
    const tmpl = QUESTION_TEMPLATES[Math.abs(seed) % QUESTION_TEMPLATES.length]
    if (
      isInterrogativeHookTitle(raw) &&
      raw.length >= 10 &&
      raw.length <= 64 &&
      !/tavoknyga|pradėk|🤩/i.test(raw)
    ) {
      out = ensureHookQuestionMark(raw)
    } else if (
      isInterrogativeHookTitle(raw) &&
      raw.length >= 12 &&
      raw.length <= 64 &&
      !/tavoknyga|pradėk|🤩/i.test(raw)
    ) {
      out = ensureHookQuestionMark(raw)
    } else {
      const slot = pain.replace(/\?+$/g, '').replace(/^(ar|kodėl)\s+/i, '')
      out = tmpl(slot.charAt(0).toLowerCase() + slot.slice(1))
    }
  } else {
    if (raw && raw.length >= 10 && raw.length <= 64 && !/tavoknyga|pradėk|🤩/i.test(raw)) {
      // Keep claim shape — but never strip "?" if somehow interrogative slipped through
      out = isInterrogativeHookTitle(raw) ? ensureHookQuestionMark(raw) : raw.replace(/\?+$/g, '').trim()
    } else {
      const tmpl = CLAIM_TEMPLATES[Math.abs(seed + 3) % CLAIM_TEMPLATES.length]
      out = tmpl(pain)
    }
  }

  out = demoteLtTitleCase(polishLtCaps(out.replace(/\s+/g, ' ').trim()))
  if (forceQuestion || isInterrogativeHookTitle(out)) {
    out = ensureHookQuestionMark(out)
  }
  if (out.length > 68) {
    const needsQ = forceQuestion || isInterrogativeHookTitle(out)
    const cut = out.replace(/\?+$/g, '').slice(0, needsQ ? 65 : 66)
    const sp = cut.lastIndexOf(' ')
    out = `${(sp > 24 ? cut.slice(0, sp) : cut).trim()}${needsQ ? '?' : ''}`
  }
  return out
}

export function isInvalidHookTitle(title: string): boolean {
  const t = title.trim()
  if (!t || t.length < 8) return true
  if (/tavoknyga\.com|🤩|Apsilankyk|Pradėk\s*5\s*min/i.test(t)) return true
  return false
}

/** Batch-safe hook styles — no Confession/Story-opener first-person invitation. */
export const UGC_BATCH_SAFE_HOOK_STYLES: UgcHookStyleName[] = [
  'Contrarian',
  'Question',
  'Bold claim',
  'Empathy mirror',
  'Pattern interrupt',
  'Challenge',
  'Uncomfortable truth',
]

/** Map high-risk styles that invite first-person / testimonial voice → Question. */
export function normalizeBatchHookStyle(style: string): UgcHookStyleName {
  const s = String(style || '').trim()
  if (/^(Confession|Story opener|Before \/ after)$/i.test(s)) return 'Question'
  if ((UGC_BATCH_SAFE_HOOK_STYLES as string[]).includes(s)) return s as UgcHookStyleName
  return 'Question'
}

type HookSlotBank = { re: RegExp; openers: string[] }

const HOOK_BODY_OPENERS: HookSlotBank[] = [
  {
    re: /stres|emocin|alk|nerim|komfort/iu,
    openers: [
      'Jauti, kad valgai ne todėl, kad esi alkanas?',
      'Ar emocijos diktuoja tavo maisto pasirinkimą?',
      'Kai stresas auga, greitas užkandis atrodo kaip sprendimas?',
    ],
  },
  {
    re: /sald|cukr|priz|craving|pagund/iu,
    openers: [
      'Dažnai manai, kad atlaikęs saldžiųjų pagundų?',
      'Ar saldumynai grįžta vos tik diena tampa sunkesnė?',
      'Kodėl greitas cukrus vilioja būtent tada, kai esi pavargęs?',
    ],
  },
  {
    re: /šeim|vaik|vakarien|restoran/iu,
    openers: [
      'Vėl susirenki prie stalo, bet niekas nebendrauja maloniai?',
      'Ar vakarienė su šeima virsta skubotu sprendimu?',
      'Ruošti maistą su vaikais gali varginti labiau, nei tikėjaisi?',
    ],
  },
  {
    re: /rinkin|meal kit|virtuv|gamin/iu,
    openers: [
      'Ar maisto ruošimas be plano vėl pavagia vakarą?',
      'Kai diena baigiasi, vėl nežinai, ką gaminti?',
      'Ar trumpa virtuvės pertrauka virsta chaotišku sprendimu?',
    ],
  },
  {
    re: /svor|diet|svarstykl|svėr/iu,
    openers: [
      'Ar svarstyklių skaičiai diktuoja tavo nuotaiką?',
      'Jauti, kad svoris kinta be aiškaus plano?',
      'Ar nuolatinis svėrimas atitraukia nuo ramesnio valgymo?',
    ],
  },
]

const HOOK_BODY_DEFAULT_OPENERS = [
  'Jauti, kad kasdieniai maisto sprendimai vargina labiau, nei turėtų?',
  'Ar diena be aiškaus plano vėl baigiasi spėliojimu?',
  'Kai ritmas stringa, maistas tampa greitu pabėgimu?',
]

const HOOK_BODY_BRIDGES = [
  'Tai gali būti ženklas, kad trūksta aiškesnio ritmo.',
  'Tokia diena kartojasi dažniau, nei norėtum.',
  'Būtent tada pasirinkimas tampa sunkesniu, nei turėtų būti.',
]

export const KALEDU_HOOK_BODY_OPENERS = [
  'Nenori didelės dovanos, bet ir tuščiomis ateiti nesinori?',
  'Ką dovanoti, kai nesinori nieko didelio?',
  'Kalėdos jau čia pat, o dovanos dar nėra?',
]

export const KALEDU_HOOK_BODY_BRIDGES = [
  'Tada lentynos atrodo vienodos, o sprendimas vis atidedamas.',
  'Būtent tada dovaną išrinkti tampa sunkiau, nei atrodo.',
  'Todėl dažniau imi tai, kas po ranka.',
]

export const UGC_HOOK_BODY_BRIDGES = HOOK_BODY_BRIDGES

function composeHookBody(openers: string[], bridges: string[], seed: number): string {
  const opener = openers[Math.abs(seed) % openers.length]
  const bridge = bridges[Math.abs(seed + 3) % bridges.length]
  return `${opener} ${bridge}`.trim()
}

/** Deterministic hook body. Pass openerBank so Christmas never inherits the Tavo defaults. */
export function pickSlotHookBody(themeText: string, seed = 0, openerBank?: string[]): string {
  if (openerBank?.length) {
    const bridges = isChristmasGiftsNiche() ? KALEDU_HOOK_BODY_BRIDGES : HOOK_BODY_BRIDGES
    return composeHookBody(openerBank, bridges, seed)
  }
  if (isChristmasGiftsNiche()) {
    return composeHookBody(KALEDU_HOOK_BODY_OPENERS, KALEDU_HOOK_BODY_BRIDGES, seed)
  }
  const theme = String(themeText || '')
  const bank = HOOK_BODY_OPENERS.find((b) => b.re.test(theme))
  const openers = bank?.openers || HOOK_BODY_DEFAULT_OPENERS
  return composeHookBody(openers, HOOK_BODY_BRIDGES, seed)
}

/** Prefer model body when shipable; otherwise the caller’s opener bank. */
export function finalizeHookBody(
  themeText: string,
  modelBody: string,
  seed = 0,
  openerBank?: string[],
): string {
  const cleaned = stripTitleEchoFromBody('', String(modelBody || '').trim()) || String(modelBody || '').trim()
  if (isShipableHookBody(cleaned) && !(isChristmasGiftsNiche() && UGC_KALEDU_DIET_LEAK_RE.test(cleaned))) {
    return cleaned
  }
  return pickSlotHookBody(themeText, seed, openerBank)
}

const HOOK_TESTIMONIAL_RE =
  /\b(man pavyko|man pavyk|aš\s+\w+|gavau|supratau|pamačiau|naudojama|naudojant|užsisakiau|pradėjau|galėčiau|norėjau|atsisakiau|planavau|nusprendžiau|jaučiu)\b/iu

const HOOK_BRAND_RE = /\b(tavo\s+knyga|tavoknyga)\b/iu

/** True when hook body is safe 2nd-person guidance (no testimonial / brand / first person). */
export function isShipableHookBody(body: string): boolean {
  const t = String(body || '').trim()
  if (t.length < 28) return false
  if (HOOK_TESTIMONIAL_RE.test(t)) return false
  if (HOOK_BRAND_RE.test(t)) return false
  if (/\b(aš|man|mano)\b/iu.test(t.replace(/tavo\s+knyga/giu, 'BRAND'))) return false
  return true
}
