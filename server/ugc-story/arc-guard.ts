/**
 * Kalėdų Kampelis story-arc guard. Slides 1–2 set up the problem; every later slide must move
 * the story forward (tip → product → payoff). The local model often "restarts" on slide 4+ —
 * a new question, the same pain again, or the hook reworded. This guard finds those slides so
 * the gate can swap them for a validated fallback, and the audit records why.
 */

import { ideaFamilies } from '../ugc-lt/idea-families.js'
import { KALEDU_RECIPIENTS, mentionedKaleduRecipients } from '../ugc-lt/recipient.js'
import { findKaleduThemeKit, kaleduProductKits, type KaleduThemeKit } from './kaledu-kits.js'
import { ltContentToken } from './similarity.js'

export type ArcIssueCode =
  | 'late_question'
  | 'arc_restart'
  | 'hook_echo'
  | 'idea_repeat'
  | 'product_repeat'
  | 'recipient_drift'
  | 'recipient_missing'
  | 'off_theme'

export type ArcSlide = { title?: string; body?: string; role?: string; productId?: string }

export type ArcIssue = {
  code: ArcIssueCode
  /** 1-based slide number. */
  slide: number
  role?: string
  message: string
  snippet: string
}

/** The problem / pain vocabulary that belongs on the hook and context slides only. */
export const KALEDU_PAIN_RESTART_RE =
  /vis\s+dar\s+(?:be\s+dovan|nežin|nepirk|neturi|ieško|neišsirink|toks\s+pat|ilg)|(?:ne|vis\s+dar\s+ne)žinai,\s*(?:ką|kokią|kurią|ko|kam)|žinai\s+tą\s+jausmą|jautiesi\s+(?:kaip|tarsi|lyg)|jauti\s+(?:kaip|tarsi|lyg|spaudim|tą\s+pačią|begal)|stres|panik|paskutin\p{L}*\s+minut|laikas\s+bėga|laiko\s+(?:vis\s+)?(?:mažiau|neliko|nebėra|liko\s+mažai)|sąraš\p{L}*\s+(?:vis\s+)?(?:ilgėja|toks\s+pat|dar\s+ilgas)|(?<!\p{L})atided(?:i|ama)(?!\p{L})|atidėlioj|kalėdos\s+(?:jau\s+)?(?:artėja|arti|rytoj|čia\s+pat)|kiekvienais\s+metais\s+(?:tas\s+pats|susiduri)|galvos\s+skausm|dilem|chaos|tas\s+jausmas|vėl\s+tas|galėtum\s+anksčiau|galėjai\s+anksčiau|(?:vis\s+dar\s+)?nepirkt\p{L}*|nieko\s+nepirkta/iu

const GENERIC_STEMS = new Set([
  'dovan', 'dovana', 'dovanos', 'dovaną', 'kalėd', 'kaled', 'švent', 'svent', 'zmog', 'žmog', 'zmogus', 'zmogu',
  'kuris', 'kuri', 'kurią', 'kuria', 'kurie', 'toki', 'tokia', 'toks', 'dazn', 'dazna', 'reiki', 'nori', 'noris',
  'kart', 'karta', 'kartai', 'visa', 'visad', 'tiesi', 'tiesiog', 'butent', 'dabar', 'siem', 'siemet',
])

function contentStems(text: string): Set<string> {
  const out = new Set<string>()
  for (const word of String(text || '').toLowerCase().replace(/[^\p{L}\s]/gu, ' ').split(/\s+/)) {
    const key = ltContentToken(word)
    if (!key || key.length < 4 || GENERIC_STEMS.has(key)) continue
    out.add(key.slice(0, 5))
  }
  return out
}

export function arcSlideText(slide: { title?: string; body?: string }): string {
  return `${slide.title || ''} ${slide.body || ''}`.replace(/\s+/g, ' ').trim()
}

function quotedNames(text: string): string[] {
  return [...String(text || '').matchAll(/„([^“”"]{3,60})[“”"]/gu)].map((m) => m[1].trim().toLocaleLowerCase('lt-LT'))
}

/** Share of a slide's content stems that already appeared in the hook (title + body). */
export function hookEchoScore(slideText: string, hookText: string): { shared: number; ratio: number } {
  const slide = contentStems(slideText)
  const hook = contentStems(hookText)
  if (!slide.size) return { shared: 0, ratio: 0 }
  let shared = 0
  for (const stem of slide) if (hook.has(stem)) shared++
  return { shared, ratio: shared / slide.size }
}

function isLateSlide(index: number, slide: ArcSlide, total: number): boolean {
  if (index < 2 || slide.role === 'hook') return false
  return slide.role === 'build' || slide.role === 'close' || slide.role === 'punch' || index === total - 1 || !slide.role
}

/**
 * Story-level issues on slides 3+. One issue per slide (the most serious), so each slide is
 * repaired at most once per round.
 */
export function collectKaleduArcIssues(slides: ArcSlide[], themeText = ''): ArcIssue[] {
  const issues: ArcIssue[] = []
  // Recipient drift: a „seseriai“ post that talks about „mama“, or a product post whose hook
  // invents a recipient the theme never had. One issue per slide, checked before the arc rules.
  const themeRecipients = themeText ? mentionedKaleduRecipients(themeText) : []
  const drifted = new Set<number>()
  if (themeText) {
    slides.forEach((slide, index) => {
      // A product slide names the product („poros knyga“) — not a recipient.
      if (slide.productId) return
      const text = arcSlideText(slide).replace(/„[^“”"]{1,60}[“”"]/gu, ' ')
      const named = mentionedKaleduRecipients(text)
      const foreign = named.filter((key) => !themeRecipients.includes(key))
      // No recipient in the theme: the hook may not invent one, and later slides may not
      // switch between people („vyrą“ on slide 3, „mamos“ on slide 5).
      const firstNamed = themeRecipients.length ? [] : mentionedKaleduRecipients(
        slides.slice(0, index).filter((s) => !s.productId).map((s) => arcSlideText(s)).join(' '),
      )
      const off = themeRecipients.length
        ? foreign.length > 0
        : index === 0
          ? named.length > 0
          : firstNamed.length > 0 && named.some((key) => !firstNamed.includes(key))
      if (!off) return
      drifted.add(index)
      issues.push({
        code: 'recipient_drift',
        slide: index + 1,
        role: slide.role,
        message: `mentions ${foreign.join(', ') || named.join(', ')} but the theme is about ${themeRecipients.join(', ') || 'no specific person'}`,
        snippet: text.slice(0, 120),
      })
    })
    if (themeRecipients.length && !drifted.has(0)) {
      const res = KALEDU_RECIPIENTS.filter((r) => themeRecipients.includes(r.key)).map((r) => r.re)
      const anyMention = slides.some((slide) => res.some((re) => re.test(arcSlideText(slide))))
      if (!anyMention) {
        drifted.add(0)
        issues.push({
          code: 'recipient_missing',
          slide: 1,
          role: slides[0]?.role,
          message: `theme is about ${themeRecipients.join(', ')} but no slide mentions them`,
          snippet: arcSlideText(slides[0] || {}).slice(0, 120),
        })
      }
    }
  }
  if (slides.length < 3) return issues
  const kit = themeText ? findKaleduThemeKit(themeText) : null
  const hookText = arcSlideText(slides[0])
  const familyOwner = new Map<string, number>()
  const productOwner = new Map<string, number>()
  slides.forEach((slide, index) => {
    const text = arcSlideText(slide)
    const snippet = text.slice(0, 120)
    const push = (code: ArcIssueCode, message: string) =>
      issues.push({ code, slide: index + 1, role: slide.role, message, snippet })

    let flagged = drifted.has(index)
    if (!flagged && isLateSlide(index, slide, slides.length)) {
      const productKey = slide.productId ? `id:${slide.productId}` : ''
      const names = quotedNames(text)
      const repeatedProduct =
        (productKey && productOwner.has(productKey)) || names.some((name) => productOwner.has(`name:${name}`))
      if (repeatedProduct) {
        push('product_repeat', 'the same product was already revealed on an earlier slide')
        flagged = true
      } else if (/\?/u.test(String(slide.body || ''))) {
        push('late_question', 'questions belong on the hook and context; later slides answer')
        flagged = true
      } else if (KALEDU_PAIN_RESTART_RE.test(text)) {
        push('arc_restart', `restates the problem: "${text.match(KALEDU_PAIN_RESTART_RE)?.[0] || ''}"`)
        flagged = true
      } else {
        const echo = hookEchoScore(text, hookText)
        if (echo.shared >= 3 && echo.ratio >= 0.45) {
          push('hook_echo', `rewords the hook (${echo.shared} shared stems, ${Math.round(echo.ratio * 100)}%)`)
          flagged = true
        }
      }
      if (!flagged) {
        const repeated = ideaFamilies(text).find((family) => familyOwner.has(family))
        if (repeated) {
          push('idea_repeat', `"${repeated}" idea already on slide ${(familyOwner.get(repeated) ?? 0) + 1}`)
          flagged = true
        }
      }
    }
    if (!flagged && kit && !slide.productId && isOffTheme(text, themeText, kit)) {
      push('off_theme', 'shares no content words with the theme or its checked lines')
      flagged = true
    }
    if (index >= 1 && !flagged) {
      for (const family of ideaFamilies(text)) if (!familyOwner.has(family)) familyOwner.set(family, index)
      if (slide.productId) productOwner.set(`id:${slide.productId}`, index)
      for (const name of quotedNames(text)) productOwner.set(`name:${name}`, index)
    }
  })
  return issues
}

function kitLineKey(text: string): string {
  return String(text || '').toLocaleLowerCase('lt-LT').replace(/[^\p{L}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
}

let productKitKeys: { source: unknown; keys: string[] } | null = null

function allProductKitKeys(): string[] {
  const kits = kaleduProductKits()
  if (productKitKeys && productKitKeys.source === kits) return productKitKeys.keys
  const keys = kits.flatMap((k) => [...k.reveal, ...k.use, ...k.close]).map(kitLineKey).filter((key) => key.length >= 12)
  productKitKeys = { source: kits, keys }
  return keys
}

/**
 * A slide is off theme when none of its content words appear in the theme or in the theme's
 * hand-checked kit, and it is not itself a kit line. Only used when the theme has a kit, so
 * the repair always has on-theme material to swap in.
 */
function isOffTheme(text: string, themeText: string, kit: KaleduThemeKit): boolean {
  const probe = kitLineKey(text)
  const kitLines = [...kit.hooks.flatMap((h) => [h.title, h.body]), ...kit.context, ...kit.build, ...kit.close]
  if (kitLines.some((line) => { const key = kitLineKey(line); return key.length >= 12 && probe.includes(key) })) return false
  if (allProductKitKeys().some((key) => probe.includes(key))) return false
  const own = contentStems(text)
  if (own.size < 2) return false
  const themeStems = contentStems(`${themeText} ${kitLines.join(' ')}`)
  for (const stem of own) if (themeStems.has(stem)) return false
  return true
}
