/**
 * Discord / batch caption helpers (client).
 * Keep in sync with server/ugc-caption-format.ts
 */

import {
  activeBusinessProfileId,
  CHRISTMAS_BUSINESS_PROFILE_ID,
} from './business-profiles'

/** Canonical caption CTA — same emoji and wording family as slide CTA. */
export const UGC_CAPTION_CTA =
  'Sužinok, ko tau iš tikrųjų trūksta - apsilankyk tavoknyga.com ir pradėk 5 min. testą! 🤩'

const OPENER_POOLS = {
  question: ['📌 Priminimas:', '📌 Atkreipk dėmesį:'],
  insight: ['📌 Štai kas svarbu:', '📌 Skaityk lėtai:'],
  truth: ['📌 Sunki tiesa:', '📌 Priminimas:'],
  default: ['📌 Priminimas:', '📌 Atkreipk dėmesį:', '📌 Štai kas svarbu:'],
} as const

export const LT_CAPTION_HASHTAGS = '#tavoknyga #maistas #sveikamityba #lietuva'

const BARE_HOOK_EXPANSIONS: Record<string, string> = {
  'Mažiau emocinio': 'Mažiau emocinio valgymo',
  'Mažiau paslėptų': 'Mažiau paslėptų kalorijų',
}

function expandBareHookTitle(title: string): string {
  const t = title.trim()
  if (!t) return t
  if (BARE_HOOK_EXPANSIONS[t]) return BARE_HOOK_EXPANSIONS[t]
  if (/^Mažiau emocinio$/iu.test(t)) return 'Mažiau emocinio valgymo'
  if (/^Mažiau paslėptų$/iu.test(t)) return 'Mažiau paslėptų kalorijų'
  return t
}

export const LT_CAPTION_FOOTER = `\n•\n•\n•\n${LT_CAPTION_HASHTAGS}`

/** Keep in sync with server/ugc-lt-normalize.ts LT_QUESTION_STARTER_RE */
const LT_QUESTION_STARTER_RE = /^(Ar|Kodėl|Kaip|Argi)\b/iu

export function classifyCaptionP1(p1: string): keyof typeof OPENER_POOLS {
  const t = p1.trim()
  if (LT_QUESTION_STARTER_RE.test(t) || /^(Ką|Kas)\b/iu.test(t) || (t.includes('?') && t.length < 120))
    return 'question'
  if (/\b(tiesa|mitas|dažnai pamirš|daugelis nežino|skamba griežtai)\b/iu.test(t)) return 'truth'
  if (/:\s/.test(t) || /\b(kodėl|nes|todėl|vyksta|reiškia|nutinka)\b/iu.test(t)) return 'insight'
  return 'default'
}

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

export function clipCaptionAtWord(text: string, max = 520): string {
  const t = stripCaptionEmDashes(text.trim())
  if (t.length <= max) return t
  const slice = t.slice(0, max)
  const lastSpace = slice.lastIndexOf(' ')
  const cut = lastSpace > Math.floor(max * 0.55) ? slice.slice(0, lastSpace) : slice
  return cut.replace(/[.,;:\s]+$/u, '').trim()
}

export function scrubCaptionChunk(text: string): string {
  let out = String(text || '')
  out = out.replace(/Apsilankyk\s*tavoknyga\.com[^.!\n]*/giu, '')
  out = out.replace(/Sužinok,\s*ko tau[^.!\n]*/giu, '')
  out = out.replace(/Pradėk\s*5\s*min\.?\s*testą([!\s?.]*[🤩😊]*)+/giu, '')
  out = out.replace(/Pradėk\s*5\s*min\.?/giu, '')
  out = out.replace(/tavoknyga\.com/giu, '')
  out = out.replace(/\p{Extended_Pictographic}/gu, '')
  out = out.replace(/!{2,}/g, '!')
  out = out.replace(/^\.+\s*$/gm, '')
  out = out.replace(/[ \t]{2,}/g, ' ').trim()
  return stripCaptionEmDashes(out)
}

function isCtaParagraph(text: string): boolean {
  return /tavoknyga\.com|pradėk\s*5\s*min|apsilankyk|sužinok,\s*ko tau/i.test(text)
}

function takeBodyParas(text: string, count = 3): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => scrubCaptionChunk(p.replace(/\n+/g, ' ')))
    .filter((p) => p && p !== '.' && !isCtaParagraph(p))
    .slice(0, count)
}

export function pickSeoKeyword(themeBlob: string): string {
  const t = themeBlob.toLowerCase()
  if (activeBusinessProfileId() === CHRISTMAS_BUSINESS_PROFILE_ID) {
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

function captionKeywordFitsPlanTemplate(keyword: string): boolean {
  const k = keyword.trim().toLocaleLowerCase('lt-LT')
  return /\b(planas|meniu|rinkinys)\b/u.test(k) || /(planas|meniu|rinkinys)$/u.test(k)
}

function slideCaptionText(slide?: { title?: string; body?: string }): string {
  if (!slide) return ''
  return scrubCaptionChunk([slide.title, slide.body].filter(Boolean).join(' ').trim())
}

function isUsableCaptionPara(text: string, used: Set<string>): boolean {
  const t = text.trim()
  if (t.length < 40 || t.length > 220) return false
  if (isThinCaptionPara(t) || isCtaParagraph(t)) return false
  if (/[,]+\s*$/.test(t)) return false
  if (/pradėk|🤩|😊|apsilankyk|tavoknyga|žaidžiami|nebebeg|užsispyti|jaučiasi|maistinu|angidrat|įsismuov|nešlamž|subręst|naudoju/i.test(t)) {
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
  const paras = takeBodyParas(description, 3)
  const fallbacks = [
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
  const body = [paras[0], paras[1], paras[2], UGC_CAPTION_CTA].join('\n\n')
  return `${withPin}\n\n${body}${LT_CAPTION_FOOTER}`
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

  let p1 = clipCaptionAtWord(scrubCaptionChunk(opts.themeHook), 180)
  if (hookTitle) {
    p1 = clipCaptionAtWord(scrubCaptionChunk(hookTitle), 180)
  } else if (p1.length >= 24 && !/trukdo kasdienybei/i.test(p1)) {
    // keep theme hook
  } else if (opts.themeHook.trim().length >= 24) {
    p1 = clipCaptionAtWord(scrubCaptionChunk(opts.themeHook), 180)
  } else {
    const variants =
      activeBusinessProfileId() === CHRISTMAS_BUSINESS_PROFILE_ID
        ? [
            `Ar vis dar ieškai ${keywordAccusative(keyword)} ir vis atidedi sprendimą?`,
            `Kodėl ${keywordAccusative(keyword)} vis atidedi iki paskutinės dienos?`,
            `Ar ${keywordAccusative(keyword)} vis dar stringa tavo dovanų sąraše?`,
          ]
        : [
            `Ar jauti, kad ${keyword} vėl grįžta būtent dabar?`,
            `Kodėl ${keyword} vis trukdo rasti ritmą?`,
            `Ar ${keyword} vis dar valdo tavo vakarus?`,
          ]
    p1 = variants[Math.abs(opts.seed ?? 0) % variants.length]
  }
  let p2 = clipCaptionAtWord(scrubCaptionChunk(opts.themeBody), 220)

  const closeBody = [...opts.slides]
    .reverse()
    .map((s) => scrubCaptionChunk(s.body || ''))
    .find(
      (b) =>
        b.length >= 40 &&
        b.length <= 160 &&
        !/[,]+\s*$/.test(b) &&
        !/pradėk|🤩|😊|apsilankyk|tavoknyga|žaidžiami|nebebeg|užsispyti|jaučiasi|maistinu|angidrat|įsismuov|nešlamž|subręst|naudoju/i.test(
          b,
        ),
    )

  if (!hookTitle && p1.length < 24) {
    p1 =
      activeBusinessProfileId() === CHRISTMAS_BUSINESS_PROFILE_ID
        ? `Ar vis dar ieškai ${keywordAccusative(keyword)} ir vis atidedi sprendimą?`
        : `Ar ${keyword} vis dar trukdo tavo savaitės ritmui?`
  }
  if (LT_QUESTION_STARTER_RE.test(p1)) p1 = ensureQuestionHook(p1)

  if (p2.length < 40 && closeBody) {
    p2 = clipCaptionAtWord(closeBody, 220)
  }
  if (isThinCaptionPara(p2) || /naudoju|pastovesnis valgymas/i.test(p2)) {
    p2 = `Dažniausiai priežastis - viena paprasta taisyklė apie ${keywordAccusative(keyword)}, kurią beveik visi pamiršta.`
  }
  p2 = stripCaptionEmDashes(p2)
  if (isThinCaptionPara(p2)) {
    p2 =
      activeBusinessProfileId() === CHRISTMAS_BUSINESS_PROFILE_ID
        ? `Kai ${keywordAccusative(keyword)} jau išrinkai, prieš šventes daug ramiau.`
        : `Kai sudėlioji ${keywordAccusative(keyword)} pagal savo ritmą, kasdienybė tampa ramesnė.`
  }
  if (hookTitle) {
    p1 = clipCaptionAtWord(scrubCaptionChunk(hookTitle), 180)
    if (LT_QUESTION_STARTER_RE.test(p1)) p1 = ensureQuestionHook(p1)
  }

  const used = new Set([p1, p2].map((p) => p.toLocaleLowerCase('lt-LT')))
  const p3Candidates = [
    slideCaptionText(opts.slides.find((slide) => slide.role === 'build')),
    slideCaptionText(hookSlide?.body ? { body: hookSlide.body } : undefined),
    ...opts.slides
      .filter((slide) => slide.role === 'context' && (slide.body || '').trim())
      .map((slide) => slideCaptionText(slide)),
    closeBody || '',
    ...(captionKeywordFitsPlanTemplate(keyword)
      ? [
          `Kai turi aiškų ${keywordAccusative(keyword)} žingsnis po žingsnio, kasdien lieka mažiau spėliojimo.`,
        ]
      : []),
    activeBusinessProfileId() === CHRISTMAS_BUSINESS_PROFILE_ID
      ? `Kai ${keywordAccusative(keyword)} jau išrinkai, prieš šventes daug ramiau.`
      : `Asmeninis planas padeda tau judėti ramiau ir išvengti bereikalingų sprendimų.`,
  ]
  let p3 = ''
  for (const candidate of p3Candidates) {
    const clipped = clipCaptionAtWord(candidate, 220)
    if (isUsableCaptionPara(clipped, used)) {
      p3 = clipped
      break
    }
  }
  if (!p3) {
    p3 =
      activeBusinessProfileId() === CHRISTMAS_BUSINESS_PROFILE_ID
        ? `Kai ${keywordAccusative(keyword)} jau išrinkai, prieš šventes daug ramiau.`
        : captionKeywordFitsPlanTemplate(keyword)
          ? `Kai turi aiškų ${keywordAccusative(keyword)} žingsnis po žingsnio, kasdien lieka mažiau spėliojimo.`
          : `Kai sudėlioji ${keywordAccusative(keyword)} pagal savo ritmą, kasdienybė tampa ramesnė.`
  }

  return {
    description: [p1, p2, p3, UGC_CAPTION_CTA].map(normalizeCaptionLt).join('\n\n'),
    hook: pickCaptionOpener(p1, opts.seed ?? 0),
  }
}
