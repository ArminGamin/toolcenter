/**
 * Discord / batch caption helpers (server).
 * Keep in sync with src/lib/ugc-batch-caption.ts
 *
 * Path:
 * 📌 {opener}
 *
 * {P1 hook/pain}
 *
 * {P2 insight}
 *
 * {P3 payoff}
 *
 * {P4 soft CTA + tavoknyga.com}
 * •
 * •
 * •
 * #tavoknyga #maistas #sveikamityba #lietuva
 *
 * No em dashes (—) — use hyphen (-) only.
 */

import { captionSlideDumpScore } from './ugc-lt-classes.js'
import {
  LT_QUESTION_STARTER_RE,
  normalizeLtUgcMultiline,
  stripLtBodyJunk,
  expandBareHookTitle,
  isGibberishLtCopy,
} from './ugc-lt-normalize.js'
import { currentProfileBrand } from './profile-brand.js'
import { ugcActiveCaptionCta, ugcActiveHashtags } from './ugc-cta-normalize.js'

/** Canonical caption CTA — same emoji and wording family as slide CTA. */
export const UGC_CAPTION_CTA =
  'Sužinok, ko tau iš tikrųjų trūksta - apsilankyk tavoknyga.com ir pradėk 5 min. testą! 🤩'

const OPENER_POOLS = {
  question: ['📌 Priminimas:', '📌 Atkreipk dėmesį:'],
  insight: ['📌 Štai kas svarbu:', '📌 Skaityk lėtai:'],
  truth: ['📌 Sunki tiesa:', '📌 Priminimas:'],
  default: ['📌 Priminimas:', '📌 Atkreipk dėmesį:', '📌 Štai kas svarbu:'],
  christmas: ['📌 Dovanų idėja:', '📌 Priminimas:', '📌 Štai kas svarbu:', '📌 Trumpai:'],
} as const

/** Core hashtags — always present (exact set for Tavo tests). */
export const LT_CAPTION_HASHTAGS = '#tavoknyga #maistas #sveikamityba #lietuva'

export const LT_CAPTION_FOOTER = `\n•\n•\n•\n${LT_CAPTION_HASHTAGS}`

function captionCta(): string {
  return ugcActiveCaptionCta() || UGC_CAPTION_CTA
}

function captionHashtags(): string {
  return ugcActiveHashtags() || LT_CAPTION_HASHTAGS
}

function captionFooter(): string {
  return `\n•\n•\n•\n${captionHashtags()}`
}

export function classifyCaptionP1(p1: string): keyof typeof OPENER_POOLS {
  if (isChristmasCaption()) return 'christmas'
  const t = p1.trim()
  if (LT_QUESTION_STARTER_RE.test(t) || /^(Ką|Kas)\b/iu.test(t) || (t.includes('?') && t.length < 120))
    return 'question'
  if (/\b(tiesa|mitas|dažnai pamirš|daugelis nežino|skamba griežtai)\b/iu.test(t)) return 'truth'
  if (/:\s/.test(t) || /\b(kodėl|nes|todėl|vyksta|reiškia|nutinka)\b/iu.test(t)) return 'insight'
  return 'default'
}

/** Match opener to P1 shape — never „Sunki tiesa" on a bare question. */
export function pickCaptionOpener(p1: string, seed = 0): string {
  const pool = OPENER_POOLS[classifyCaptionP1(p1)]
  return pool[Math.abs(seed) % pool.length]
}

/** Ban em/en dashes in captions — hyphen (-) only. */
export function stripCaptionEmDashes(text: string): string {
  return String(text || '')
    .replace(/\u2014|\u2013|—|–/g, ' - ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

/** Clip at word boundary — never cut mid-word. */
export function clipCaptionAtWord(text: string, max = 520): string {
  const t = stripCaptionEmDashes(text.trim())
  if (t.length <= max) return t
  const slice = t.slice(0, max)
  const lastSpace = slice.lastIndexOf(' ')
  const cut = lastSpace > Math.floor(max * 0.55) ? slice.slice(0, lastSpace) : slice
  return cut.replace(/[.,;:\s]+$/u, '').trim()
}

function isCtaParagraph(text: string): boolean {
  const host = currentProfileBrand().siteHost.replace(/\./g, '\\.')
  return new RegExp(`tavoknyga\\.com|${host}|pradėk\\s*5\\s*min|apsilankyk|sužinok,\\s*ko tau|kaledukampelis`, 'i').test(
    text,
  )
}

function takeBodyParas(text: string, count = 3): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => stripCaptionEmDashes(p.replace(/\n+/g, ' ').replace(/^\.+\s*$/gm, '').trim()))
    .filter((p) => p && p !== '.' && !isCtaParagraph(p))
    .slice(0, count)
}

/** Primary SEO keyword phrase from theme text (injected once). */
export function pickSeoKeyword(themeBlob: string): string {
  const t = themeBlob.toLowerCase()
  if (currentProfileBrand().niche === 'christmas-gifts') {
    if (/mam/.test(t)) return 'dovana mamai'
    if (/tėt|tėči/.test(t)) return 'dovana tėčiui'
    if (/por/.test(t)) return 'dovana porai'
    if (/vyr/.test(t)) return 'dovana vyrui'
    if (/moter/.test(t)) return 'dovana moteriai'
    if (/paskutin|last.?minute/.test(t)) return 'paskutinės minutės dovana'
    if (/biudž|€|eur/.test(t)) return 'dovana iki 30 €'
    return 'kalėdinė dovana'
  }
  if (/švaist|zero.?waste|atliek/.test(t)) return 'maisto švaistymas'
  if (/svor|svarstyk/.test(t)) return 'svorio tikslas'
  if (/vegan|baltym/.test(t)) return 'baltymai'
  if (/dvira|treniruot/.test(t)) return 'energija'
  if (/atostog|vacation|vasar/i.test(t)) return 'vasaros mityba'
  if (/plan|savait|meniu|ruoš/.test(t)) return 'savaitės planas'
  return 'mitybos planas'
}

function ensureQuestionHook(text: string): string {
  const t = stripCaptionEmDashes(text)
  if (!t) return t
  if (t.includes('?')) return t
  if (/[.!]$/.test(t)) return `${t.slice(0, -1)}?`
  return `${t}?`
}

function isThinCaptionPara(text: string): boolean {
  const t = text.trim()
  if (t.length < 40) return true
  if (/-\s*(savaitės planas|mitybos planas)\s*$/i.test(t)) return true
  if (/^apie\s+\w+\.\s*$/i.test(t)) return true
  return false
}

function paraEchoesSlideBodies(
  para: string,
  slides: Array<{ title?: string; body?: string }>,
): boolean {
  const norm = para.toLocaleLowerCase('lt-LT').trim()
  if (norm.length < 30) return false
  const needle = norm.slice(0, Math.min(60, norm.length))
  for (const slide of slides) {
    const slideText = [slide.title, slide.body]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('lt-LT')
      .trim()
    if (!slideText) continue
    if (slideText.includes(needle)) return true
    const slideNeedle = slideText.slice(0, Math.min(60, slideText.length))
    if (slideNeedle.length >= 30 && norm.includes(slideNeedle)) return true
  }
  return false
}

function keywordAccusative(keyword: string): string {
  const forms: Record<string, string> = {
    'maisto švaistymas': 'maisto švaistymą',
    'svorio tikslas': 'svorio tikslą',
    baltymai: 'baltymus',
    energija: 'energiją',
    'vasaros mityba': 'vasaros mitybą',
    'savaitės planas': 'savaitės planą',
    'mitybos planas': 'mitybos planą',
    'dovana mamai': 'dovaną mamai',
    'dovana tėčiui': 'dovaną tėčiui',
    'dovana porai': 'dovaną porai',
    'dovana vyrui': 'dovaną vyrui',
    'dovana moteriai': 'dovaną moteriai',
    'paskutinės minutės dovana': 'paskutinės minutės dovaną',
    'dovana iki 30 €': 'dovaną iki 30 €',
    'kalėdinė dovana': 'kalėdinę dovaną',
  }
  return forms[keyword] || keyword
}

/** Only plan/menu/kit keywords fit „Kai turi aiškų ___ žingsnis po žingsnio". */
export function captionKeywordFitsPlanTemplate(keyword: string): boolean {
  const k = keyword.trim().toLocaleLowerCase('lt-LT')
  return /\b(planas|meniu|rinkinys)\b/u.test(k) || /(planas|meniu|rinkinys)$/u.test(k)
}

function isChristmasCaption(): boolean {
  return currentProfileBrand().niche === 'christmas-gifts'
}

function captionShortHookVariants(keyword: string): string[] {
  if (isChristmasCaption()) {
    const forms = keywordAccusative(keyword)
    return [
      `Dovaną ${forms} išrinkti ne visada lengva.`,
      `Vis dar ieškai ${forms}?`,
      `Iki šventės liko nedaug, o ${forms} vis dar atidėta.`,
      `Nežinai, ką padovanoti - pradėk nuo ${forms}.`,
    ]
  }
  return [
    `Ar jauti, kad ${keyword} vėl grįžta būtent dabar?`,
    `Kodėl ${keyword} vis trukdo rasti ritmą?`,
    `Ar ${keyword} vis dar valdo tavo vakarus?`,
  ]
}

function captionRecoveryHook(keyword: string): string {
  if (isChristmasCaption()) {
    return `Dovaną ${keywordAccusative(keyword)} išrinkti ne visada lengva.`
  }
  return `Ar ${keyword} vis dar trukdo tavo savaitės ritmui?`
}

function captionRecoveryInsight(keyword: string): string {
  if (isChristmasCaption()) {
    return `Kai ${keywordAccusative(keyword)} jau išrinkai, prieš šventes daug ramiau.`
  }
  return `Kai sudėlioji ${keywordAccusative(keyword)} pagal savo ritmą, kasdienybė tampa ramesnė.`
}

function genericCaptionInsight(keyword: string, seed = 0): string {
  const forms = keywordAccusative(keyword)
  if (isChristmasCaption()) {
    const variants = [
      `Dažniausiai padeda vienas paprastas klausimas apie ${forms} - kam tas daiktas tikrai tiks.`,
      `Kai ${forms} jau išrinkai, prieš šventes daug ramiau.`,
      `Jei biudžetas ribotas, geriau viena tiksli dovana nei keli skuboti daiktai.`,
      `${forms.charAt(0).toUpperCase()}${forms.slice(1)} tinka tam, kas mėgsta jaukius vakarus namuose.`,
    ]
    return variants[Math.abs(seed) % variants.length]
  }
  const variants = [
    `Dažniausiai priežastis - viena paprasta taisyklė apie ${forms}, kurią beveik visi pamiršta.`,
    `Kai sudėlioji ${forms} pagal savo ritmą, kasdienybė tampa ramesnė.`,
  ]
  if (captionKeywordFitsPlanTemplate(keyword)) {
    variants.push(`Kai turi aiškų ${forms} žingsnis po žingsnio, kasdien lieka mažiau spėliojimo.`)
  }
  return variants[Math.abs(seed) % variants.length]
}

function isUsableCaptionPara(text: string, used: Set<string>): boolean {
  const t = text.trim()
  if (t.length < 40 || t.length > 220) return false
  if (isThinCaptionPara(t) || isCtaParagraph(t)) return false
  if (/[,]+\s*$/.test(t)) return false
  if (/pradėk|🤩|😊|apsilankyk|tavoknyga|kaledukampelis|žaidžiami|nebebeg|užsispyti|maistinu|angidrat|įsismuov|nešlamž|subręst|naudoju/i.test(t)) {
    return false
  }
  return !used.has(t.toLocaleLowerCase('lt-LT'))
}

export function normalizeCaptionLt(text: string): string {
  return stripCaptionEmDashes(text)
    .replace(/\b(pagal|apie)\s+(savaitės|mitybos)\s+planas\b/giu, '$1 $2 planą')
    .replace(/\bapie\s+maisto\s+švaistymas\b/giu, 'apie maisto švaistymą')
    .replace(/\bapie\s+svorio\s+tikslas\b/giu, 'apie svorio tikslą')
    .replace(/\bapie\s+vasaros\s+mityba\b/giu, 'apie vasaros mitybą')
}

export function formatBatchDiscordCaption(
  description: string,
  options?: { opener?: string; seed?: number; themeBlob?: string },
): string {
  const cleaned = stripCaptionEmDashes(
    stripLtBodyJunk(description)
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\.+\s*$/gm, '')
      .trim(),
  )
  const paras = takeBodyParas(cleaned, 3)
  const fallbacks =
    currentProfileBrand().niche === 'christmas-gifts'
      ? [
          'Ar vis dar ieškai kalėdinės dovanos ir vis atidedi sprendimą?',
          'Dažniausiai padeda vienas paprastas klausimas - kam tas daiktas tikrai tiks.',
          'Kai dovana jau išrinkta, prieš šventes daug ramiau.',
        ]
      : [
          'Ar jauti, kad mityba vis tiek neveikia taip, kaip tikėjaisi?',
          'Dažniausiai priežastis - viena paprasta taisyklė, kurią lengva pamiršti.',
          'Kai turi aiškų planą, kasdien lieka mažiau spėliojimo ir daugiau ramybės.',
        ]
  while (paras.length < 3) {
    paras.push(fallbacks[paras.length] || fallbacks[2])
  }
  const opener = stripCaptionEmDashes(
    options?.opener?.trim() || pickCaptionOpener(paras[0], options?.seed ?? 0),
  )
  const withPin = opener.startsWith('📌') ? opener : `📌 ${opener.replace(/^📌\s*/, '')}`
  const body = [paras[0], paras[1], paras[2], captionCta()].join('\n\n')
  return `${withPin}\n\n${body}${captionFooter()}`
}

/**
 * Deterministic Discord caption body — 3 content paragraphs + soft CTA (no em dashes).
 */
export function buildBatchPostCaption(opts: Parameters<typeof buildBatchTemplateCaption>[0] & {
  universalDescription?: string
}): string {
  if (currentProfileBrand().niche === 'christmas-gifts' && opts.universalDescription?.trim()) {
    return opts.universalDescription
  }
  const templated = buildBatchTemplateCaption(opts)
  return formatBatchDiscordCaption(templated.description, {
    opener: templated.hook,
    seed: opts.seed,
    themeBlob: `${opts.theme || ''} ${opts.themeHook} ${opts.themeBody} ${opts.category || ''}`,
  })
}

export function buildBatchTemplateCaption(opts: {
  themeHook: string
  themeBody: string
  slides: Array<{ title?: string; body?: string; role?: string }>
  defaultCta: string
  seed?: number
  theme?: string
  category?: string
}): { description: string; hook: string } {
  const themeBlob = [opts.theme, opts.category, opts.themeHook, opts.themeBody].filter(Boolean).join(' ')
  const keyword = pickSeoKeyword(themeBlob)

  const hookSlide =
    opts.slides.find((slide) => slide.role === 'hook' && (slide.title || '').trim()) ||
    opts.slides.find((slide) => (slide.title || '').trim()) ||
    opts.slides[0]
  const hookTitle = stripCaptionEmDashes(expandBareHookTitle((hookSlide?.title || '').trim()))

  let p1 = clipCaptionAtWord(normalizeLtUgcMultiline(opts.themeHook.trim()), 180)
  if (hookTitle) {
    p1 = clipCaptionAtWord(normalizeLtUgcMultiline(hookTitle), 180)
  } else if (p1.length >= 24 && !/trukdo kasdienybei/i.test(p1)) {
    // keep theme hook
  } else if (opts.themeHook.trim().length >= 24) {
    p1 = clipCaptionAtWord(normalizeLtUgcMultiline(opts.themeHook.trim()), 180)
  } else {
    const variants = captionShortHookVariants(keyword)
    p1 = variants[Math.abs(opts.seed ?? 0) % variants.length]
  }
  let p2 = clipCaptionAtWord(normalizeLtUgcMultiline(opts.themeBody.trim()), 220)

  if (!hookTitle && p1.length < 24) {
    p1 = captionRecoveryHook(keyword)
  }
  if (LT_QUESTION_STARTER_RE.test(p1)) p1 = ensureQuestionHook(p1)

  if (isThinCaptionPara(p2) || paraEchoesSlideBodies(p2, opts.slides)) {
    p2 = genericCaptionInsight(keyword, opts.seed ?? 0)
  }
  if (/naudoju|pastovesnis valgymas/i.test(p2)) {
    p2 = genericCaptionInsight(keyword, (opts.seed ?? 0) + 1)
  }
  p2 = stripCaptionEmDashes(p2)
  if (isThinCaptionPara(p2)) {
    p2 = captionRecoveryInsight(keyword)
  }
  if (isGibberishLtCopy(p1) || isGibberishLtCopy(p2)) {
    p1 = captionRecoveryHook(keyword)
    p2 = captionRecoveryInsight(keyword)
  }
  if (hookTitle) {
    p1 = clipCaptionAtWord(normalizeLtUgcMultiline(hookTitle), 180)
    if (LT_QUESTION_STARTER_RE.test(p1)) p1 = ensureQuestionHook(p1)
  }

  const used = new Set([p1, p2].map((p) => p.toLocaleLowerCase('lt-LT')))
  const p3Candidates = [
    genericCaptionInsight(keyword, (opts.seed ?? 0) + 2),
    ...(captionKeywordFitsPlanTemplate(keyword) && !isChristmasCaption()
      ? [
          `Kai turi aiškų ${keywordAccusative(keyword)} žingsnis po žingsnio, kasdien lieka mažiau spėliojimo.`,
        ]
      : []),
    genericCaptionInsight(keyword, (opts.seed ?? 0) + 3),
  ]
  let p3 = ''
  for (const candidate of p3Candidates) {
    const clipped = clipCaptionAtWord(candidate, 220)
    if (isUsableCaptionPara(clipped, used) && !paraEchoesSlideBodies(clipped, opts.slides)) {
      p3 = clipped
      break
    }
  }
  if (!p3) {
    p3 = genericCaptionInsight(keyword, (opts.seed ?? 0) + 2)
  }

  let description = [p1, p2, p3, captionCta()].map(normalizeCaptionLt).join('\n\n')
  if (captionSlideDumpScore(description, opts.slides) >= 0.5) {
    p2 = genericCaptionInsight(keyword, (opts.seed ?? 0) + 3)
    p3 = genericCaptionInsight(keyword, (opts.seed ?? 0) + 4)
    description = [p1, p2, p3, captionCta()].map(normalizeCaptionLt).join('\n\n')
  }
  return {
    description,
    hook: pickCaptionOpener(p1, opts.seed ?? 0),
  }
}
