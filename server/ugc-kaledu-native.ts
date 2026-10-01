import { copyNamesProduct, loadKaleduCatalog, type KaleduCatalogProduct } from './ugc-kaledu-catalog.js'
import { isAllowedKaleduCta, KALEDU_WEBSITE, pickKaleduCta, withKaleduGiftEmoji } from './ugc-kaledu-cta.js'
import { textHasFiniteVerbCue } from './ugc-lt-normalize.js'
import { isChristmasGiftsNiche } from './profile-brand.js'

export type KaleduNativeIssueCode =
  | 'calque'
  | 'corporate'
  | 'repeated_root'
  | 'stiff_hook'
  | 'unnatural_logic'
  | 'too_long'
  | 'too_many_sentences'
  | 'bad_ar_colon'
  | 'incomplete_ar_hook'
  | 'suspicious_title_token'
  | 'invented_product'
  | 'incomplete_subordinate_hook'
  | 'empty_poetic_payoff'

export type KaleduNativeIssue = {
  code: KaleduNativeIssueCode
  reason: string
}

export type KaleduRewrittenFields = {
  i: number
  title?: string
  body?: string
}

export type KaleduNativeSlideAudit = {
  index: number
  role?: string
  originalTitle: string
  originalBody: string
  rewrittenTitle: string
  rewrittenBody: string
  reasons: string[]
  shipped: 'original' | 'rewritten' | 'repaired' | 'fallback'
}

export type KaleduNativeRewriteMeta = {
  attempted: boolean
  attemptCount: number
  rewrittenSlideCount: number
  slides: KaleduNativeSlideAudit[]
  finalQa?: unknown
}

const CALQUE_RE =
  /sukurti\s+momentus|padaryti\s+prisiminimus|turėti\s+gerą\s+laiką|tai\s+ateina\s+su|pristato\s+jaukumą|palieka\s+įspūdį|sukurkite\s+nepamirštamus/i

const CORPORATE_RE =
  /optimalus\s+pasirinkimas|produktas\s+suteikia|šis\s+sprendimas|atitinka\s+poreikius|unikali\s+patirtis|\bvartotojas\b|suteikia\s+galimybę/i

const UNNATURAL_RE =
  /prideda\s+vėsesio|minkštumas\s+skatina|jaukumas\s+įpakuotas|vėsių\s+vakarų\s+vakarais|(?:šventė|kalėdos|diena)\s+jaučiasi|džiugij|dovana\s+tampa\s+skuba/i

const RUSHED_CHOICE_RE = /renkiesi per skubą/i
const POETIC_PAYOFF_RE =
  /pasikliauk intuicij|padovanok šviesą|džiaugsmas akivaizdus|pasijaučia mylimas|stebuklų galia|kalėdų magij/i

export function isIncompleteSubordinateHook(title: string): boolean {
  const t = String(title || '').trim()
  if (!/^Kai\b/iu.test(t)) return false
  if (/\?/.test(t) && /\b(nesinori|ką|kaip|kodėl)\b/iu.test(t)) return false
  return true
}

const STIFF_HOOK_RE =
  /^Ar\s+susiduri\s+su\s+sunkumais|^Ar\s+jauti,?\s+kad\s+kartais|^Ar\s+pastebi,?\s+kad|^Ar\s+ieškai\s+būdų/i

const BAD_AR_COLON_RE = /^Ar\s+.+:\s*(ką|kas|kaip|kodėl|kur|kada|kiek|ko)(?!\p{L})/iu

const KNOWN_HOOK_WORDS = new Set([
  'dovana',
  'dovaną',
  'dovanos',
  'dovanų',
  'dovanai',
  'paaugliui',
  'paauglys',
  'paauglio',
  'paauglei',
  'mamai',
  'tėčiui',
  'porai',
  'vyrui',
  'moteriai',
  'draugui',
  'rinktis',
  'renkiesi',
  'duoti',
  'padovanoti',
  'išrinkai',
  'išrinkti',
  'kalėdinė',
  'kalėdų',
  'kalėdos',
  'jauki',
  'jaukų',
  'jaukumo',
  'šventė',
  'šventės',
  'šventę',
  'idėja',
  'idėją',
  'žmogui',
  'namuose',
  'vakarams',
  'vakarą',
  'kodėl',
  'kaip',
  'kada',
  'kiek',
  'kaledukampelis',
  'kampelis',
  'kampelyje',
])

const CTA_LEAK_RE = new RegExp(
  `${KALEDU_WEBSITE.replace(/\./g, '\\.')}|tavoknyga\\.com|https?:\\/\\/`,
  'i',
)

export function countLtWords(text: string): number {
  return String(text || '')
    .split(/[^\p{L}0-9]+/u)
    .filter(Boolean).length
}

export function countLtSentences(text: string): number {
  return String(text || '')
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean).length
}

function ltStem(word: string): string {
  return word
    .toLocaleLowerCase('lt-LT')
    .replace(/(osi|ais|ams|ose|ui|ius|ių|iams|iems|ėmis|omis|oms|os|ės|as|is|ys|ų|u|ą|ę|ė|a|e|i|o)$/u, '')
}

function hasRepeatedRoot(text: string): boolean {
  const words = String(text || '')
    .toLocaleLowerCase('lt-LT')
    .split(/[^\p{L}0-9]+/u)
    .filter((w) => w.length >= 4)
  for (let i = 0; i < words.length; i++) {
    const a = ltStem(words[i])
    if (a.length < 4) continue
    if (i + 1 < words.length && ltStem(words[i + 1]) === a) return true
    if (i + 2 < words.length && ltStem(words[i + 2]) === a) return true
  }
  return false
}

/** Safe mechanical fixes only — not a phrase bank. */
export function applyKaleduNativeRepairs(text: string): string {
  return repairInvalidJoyWord(String(text || ''))
    .replace(
      /Kai dovana jau parinkta, šventė jaučiasi lengvesnė\.?/gi,
      'Kai dovana jau išrinkta, prieš šventes daug ramiau.',
    )
    .replace(/vėsių\s+vakarų\s+vakarais/gi, 'vėsiais vakarais')
    .replace(/\bvakarų\s+vakarais\b/gi, 'vakarais')
    .replace(/\s+/g, ' ')
    .trim()
}

function repairInvalidJoyWord(text: string): string {
  return text.replace(/džiugij(a|ą|os|ai|oje|ų|oms|omis)?/giu, (full, ending) => {
    const forms: Record<string, string> = {
      a: 'džiaugsmas',
      ą: 'džiaugsmą',
      os: 'džiaugsmo',
      ai: 'džiaugsmui',
      oje: 'džiaugsme',
      ų: 'džiaugsmų',
      oms: 'džiaugsmams',
      omis: 'džiaugsmais',
    }
    const next = forms[String(ending || 'a').toLocaleLowerCase('lt-LT')] || 'džiaugsmą'
    return full.charAt(0) === full.charAt(0).toLocaleUpperCase('lt-LT') &&
      full.charAt(0) !== full.charAt(0).toLocaleLowerCase('lt-LT')
      ? next.charAt(0).toLocaleUpperCase('lt-LT') + next.slice(1)
      : next
  })
}

export function stripKaleduCtaLeak(text: string): string {
  return String(text || '')
    .replace(CTA_LEAK_RE, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,!?])/g, '$1')
    .trim()
}

function hookTitleTokens(title: string): string[] {
  return String(title || '')
    .toLocaleLowerCase('lt-LT')
    .split(/[^\p{L}0-9]+/u)
    .filter((word) => word.length >= 4)
}

function isKnownHookWord(word: string): boolean {
  return KNOWN_HOOK_WORDS.has(word.toLocaleLowerCase('lt-LT'))
}

export function isBadArColonHook(title: string): boolean {
  return BAD_AR_COLON_RE.test(String(title || '').trim())
}

const AR_PREDICATE_RE =
  /(?<!\p{L})\p{L}{3,}(?:ai|ei|au)(?!\p{L})|(?<!\p{L})\p{L}{4,}(?:ta|tos|tas|ti)(?!\p{L})/giu

const AR_ADVERB_NOT_VERB = new Set(['labai', 'vėlai', 'gerai', 'visai', 'ramiai', 'tikrai', 'dažnai', 'vėlai'])

function arRemainderHasPredicate(rest: string): boolean {
  if (textHasFiniteVerbCue(rest)) return true
  AR_PREDICATE_RE.lastIndex = 0
  for (const match of rest.matchAll(AR_PREDICATE_RE)) {
    const word = match[0].toLocaleLowerCase('lt-LT')
    if (!AR_ADVERB_NOT_VERB.has(word)) return true
  }
  return false
}

function arHookRemainder(title: string): string {
  return String(title || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^Ar\s+/iu, '')
    .replace(/[?]+$/u, '')
    .trim()
}

/** "Ar" plus only a noun/adjective phrase, with no finite predicate. Hook titles only. */
export function isIncompleteArHook(title: string): boolean {
  const t = String(title || '').replace(/\s+/g, ' ').trim()
  if (!/^Ar\b/iu.test(t)) return false
  if (isBadArColonHook(t)) return false
  const rest = arHookRemainder(t)
  if (!rest) return true
  if (arRemainderHasPredicate(rest)) return false
  return true
}

export function repairIncompleteArHook(title: string): string {
  if (!isIncompleteArHook(title)) return String(title || '').trim()
  const rest = arHookRemainder(title)
  const phrase = rest.toLocaleLowerCase('lt-LT')
  if (/minut/iu.test(phrase)) return 'Vėl viską palikai paskutinei minutei?'
  if (/iešk/iu.test(phrase)) return 'Dar ieškai dovanos?'
  if (/nežin/iu.test(phrase)) return 'Vis dar nežinai, ką padovanoti?'
  const spoken = phrase ? `Jau prasideda ${phrase}?` : 'Jau prasideda?'
  return spoken.charAt(0).toLocaleUpperCase('lt-LT') + spoken.slice(1)
}

export function suspiciousHookTitleTokens(title: string, sources: string[] = []): string[] {
  const badAr = isBadArColonHook(title)
  return hookTitleTokens(title).filter((word) => {
    if (isKnownHookWord(word)) return false
    const clipped = sources.some((source) => {
      const delta = source.length - word.length
      return delta >= 1 && delta <= 2 && source.endsWith(word)
    })
    if (clipped) return true
    return badAr && word.length <= 5
  })
}

function capLt(word: string): string {
  const t = word.toLocaleLowerCase('lt-LT')
  return t.charAt(0).toLocaleUpperCase('lt-LT') + t.slice(1)
}

function hookContextWords(theme: string, body: string, products: KaleduCatalogProduct[]): string[] {
  const blob = `${theme} ${body} ${products.map((p) => `${p.name} ${p.slug}`).join(' ')}`
  const words = blob
    .toLocaleLowerCase('lt-LT')
    .split(/[^\p{L}0-9]+/u)
    .filter((word) => word.length >= 4)
  if (/dovan/i.test(blob)) words.push('dovana')
  return words
}

function restoreClippedToken(token: string, sources: string[]): string | null {
  const bare = token.toLocaleLowerCase('lt-LT')
  if (bare.length < 3 || isKnownHookWord(bare)) return null
  for (const source of sources) {
    const word = source.toLocaleLowerCase('lt-LT')
    const delta = word.length - bare.length
    if (delta >= 1 && delta <= 2 && word.endsWith(bare) && word !== bare) return word
  }
  return null
}

export function repairKaleduHookTitle(
  title: string,
  ctx: { theme?: string; body?: string; products?: KaleduCatalogProduct[] } = {},
): string {
  const raw = String(title || '').replace(/\s+/g, ' ').trim()
  if (!raw) return raw
  if (isIncompleteArHook(raw)) return repairIncompleteArHook(raw)
  let next = raw
  let changed = false
  if (isBadArColonHook(next)) {
    next = next.replace(/^Ar\s+/iu, '').trim()
    changed = true
  }
  const sources = hookContextWords(ctx.theme || '', ctx.body || '', ctx.products || [])
  const tokens = next.split(/\s+/)
  const repaired = tokens.map((token, index) => {
    const bare = token.replace(/[?:.,]+$/u, '')
    const punct = token.slice(bare.length)
    const restored = restoreClippedToken(bare, sources)
    if (!restored) return token
    changed = true
    const word = index === 0 ? capLt(restored) : restored
    return `${word}${punct}`
  })
  if (!changed) return raw
  next = repaired.join(' ').replace(/[.!…]+$/u, '').trim()
  if (/^\p{Ll}/u.test(next)) next = capLt(next.charAt(0)) + next.slice(1)
  if (!next.endsWith('?')) next = `${next}?`
  return next
}

export function kaleduHookTitleIssues(title: string): KaleduNativeIssue[] {
  const issues: KaleduNativeIssue[] = []
  if (isBadArColonHook(title)) {
    issues.push({ code: 'bad_ar_colon', reason: 'Ar does not form a yes/no question' })
  }
  if (isIncompleteArHook(title)) {
    issues.push({ code: 'incomplete_ar_hook', reason: 'Ar + nominal phrase, no finite predicate' })
  }
  const unknown = suspiciousHookTitleTokens(title)
  if (unknown.length) {
    issues.push({
      code: 'suspicious_title_token',
      reason: `Unknown title token: ${unknown[0]}`,
    })
  }
  return issues
}

export function detectKaleduNativeIssues(
  slide: {
    title?: string
    body?: string
    role?: string
  },
  opts: { giftNiche?: boolean } = {},
): KaleduNativeIssue[] {
  const giftNiche = opts.giftNiche !== false && (opts.giftNiche === true || isChristmasGiftsNiche())
  const title = String(slide.title || '').trim()
  const body = String(slide.body || '').trim()
  const blob = `${title} ${body}`
  const issues: KaleduNativeIssue[] = []
  if (CALQUE_RE.test(blob)) issues.push({ code: 'calque', reason: 'English calque' })
  if (CORPORATE_RE.test(blob)) issues.push({ code: 'corporate', reason: 'Corporate phrasing' })
  if (UNNATURAL_RE.test(blob)) issues.push({ code: 'unnatural_logic', reason: 'Unnatural collocation' })
  if (hasRepeatedRoot(blob)) issues.push({ code: 'repeated_root', reason: 'Repeated stem' })
  const isHook = slide.role === 'hook'
  if (isHook && STIFF_HOOK_RE.test(title || body)) {
    issues.push({ code: 'stiff_hook', reason: 'Stiff rhetorical hook' })
  }
  if (isHook && giftNiche) issues.push(...kaleduHookTitleIssues(title))
  else if (isHook) {
    if (isBadArColonHook(title)) {
      issues.push({ code: 'bad_ar_colon', reason: 'Ar does not form a yes/no question' })
    }
    if (isIncompleteArHook(title)) {
      issues.push({ code: 'incomplete_ar_hook', reason: 'Ar + nominal phrase, no finite predicate' })
    }
  }
  if (isHook && isIncompleteSubordinateHook(title)) {
    issues.push({ code: 'incomplete_subordinate_hook', reason: 'Kai hook never finishes the thought' })
  }
  if (giftNiche && slide.role === 'close' && POETIC_PAYOFF_RE.test(blob)) {
    issues.push({ code: 'empty_poetic_payoff', reason: 'Abstract close does not finish the gift problem' })
  }
  if (RUSHED_CHOICE_RE.test(blob)) {
    issues.push({ code: 'unnatural_logic', reason: 'Unnatural rushed-choice collocation' })
  }
  const titleWords = countLtWords(title)
  const bodyWords = countLtWords(body)
  if ((isHook && titleWords > 12) || bodyWords > 32) {
    issues.push({ code: 'too_long', reason: 'Over length target' })
  }
  if (countLtSentences(body) > 3) {
    issues.push({ code: 'too_many_sentences', reason: 'More than 3 sentences' })
  }
  return issues
}

export function kaleduSlideNeedsNativeRewrite(slide: {
  title?: string
  body?: string
  role?: string
}): boolean {
  return detectKaleduNativeIssues(slide).length > 0
}

export function applyKaleduRewrittenFields<
  T extends { title: string; body: string; role?: string; cta?: string; productId?: string },
>(slides: T[], patches: KaleduRewrittenFields[]): T[] {
  const byIndex = new Map(patches.map((p) => [p.i, p]))
  return slides.map((slide, i) => {
    const patch = byIndex.get(i)
    if (!patch) return slide
    return {
      ...slide,
      title: typeof patch.title === 'string' ? patch.title : slide.title,
      body: typeof patch.body === 'string' ? patch.body : slide.body,
    }
  })
}

export function rewriteIntroducesUnsupportedProductClaims(
  original: string,
  rewritten: string,
  allowed: KaleduCatalogProduct[],
): boolean {
  const catalog = loadKaleduCatalog()
  const allowedIds = new Set(allowed.map((p) => p.productId))
  for (const product of catalog) {
    if (!copyNamesProduct(rewritten, product)) continue
    if (allowedIds.has(product.productId) || copyNamesProduct(original, product)) continue
    return true
  }
  const priceRe = /\d+(?:[.,]\d+)?\s*€/g
  const origPrices = new Set((original.match(priceRe) || []).map((p) => p.replace(/\s/g, '')))
  const nextPrices = rewritten.match(priceRe) || []
  for (const raw of nextPrices) {
    const key = raw.replace(/\s/g, '')
    if (origPrices.has(key)) continue
    const cents = Math.round(Number(raw.replace(',', '.').replace(/[^\d.]/g, '')) * 100)
    if (!allowed.some((p) => p.priceCents === cents)) return true
  }
  return false
}

export function attachKaleduCloseCta<T extends { role?: string; cta?: string; body?: string }>(
  slides: T[],
  theme: string,
  seed: number,
  category = '',
  ctaOverride = '',
): T[] {
  if (!isChristmasGiftsNiche()) return slides
  const picked = pickKaleduCta(theme, seed, category)
  const cand = String(ctaOverride || '').trim()
  const cta = withKaleduGiftEmoji(cand && isAllowedKaleduCta(cand) ? cand : picked)
  return slides.map((slide, i) => {
    const isClose = slide.role === 'close' || i === slides.length - 1
    return {
      ...slide,
      body: stripKaleduCtaLeak(String(slide.body || '')),
      cta: isClose ? cta : '',
    }
  })
}

export function emptyKaleduNativeMeta(): KaleduNativeRewriteMeta {
  return { attempted: false, attemptCount: 0, rewrittenSlideCount: 0, slides: [] }
}
