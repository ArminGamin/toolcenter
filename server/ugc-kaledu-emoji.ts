import { isChristmasGiftsNiche } from './profile-brand.js'

export type EmojiIntent =
  | 'stress'
  | 'surprise'
  | 'thinking'
  | 'warmth'
  | 'gift'
  | 'christmas'
  | 'cozy'
  | 'positive'
  | 'none'

export const KALEDU_EMOJIS: Record<EmojiIntent, readonly string[]> = {
  stress: ['😵‍💫', '😩', '🥲'],
  surprise: ['🤯', '😳', '👀'],
  thinking: ['🤔'],
  warmth: ['❤️', '🤍', '🥰'],
  gift: ['🎁'],
  christmas: ['🎄'],
  cozy: ['✨', '☕️', '🤍'],
  positive: ['😍', '👌'],
  none: [],
}

/** ZWJ / VS16-aware pictograph match. */
export const KALEDU_EMOJI_RE =
  /\p{Extended_Pictographic}(?:\uFE0F)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F)?)*/gu

const ALL_ALLOWED = Object.values(KALEDU_EMOJIS).flat()

const STRESS_STRENGTH: Record<string, number> = {
  '😵‍💫': 3,
  '😩': 2,
  '🥲': 1,
}

function stripVs(emoji: string): string {
  return emoji.replace(/\uFE0F/g, '')
}

export function sameKaleduEmoji(a: string, b: string): boolean {
  return stripVs(a) === stripVs(b)
}

export function isAllowedKaleduEmoji(emoji: string): boolean {
  const n = stripVs(emoji)
  return ALL_ALLOWED.some((a) => stripVs(a) === n)
}

export function extractKaleduEmojis(text: string): string[] {
  return String(text || '').match(KALEDU_EMOJI_RE) || []
}

export function inferKaleduEmojiIntent(text: string): EmojiIntent {
  const raw = String(text || '')
  const t = raw.replace(KALEDU_EMOJI_RE, '').toLocaleLowerCase('lt-LT').trim()
  if (!t) return 'none'

  if (
    /kaledukampelis\.com|rask\s+dovan|užsuk\s+į|daugiau\s+dovan|atrask\s+daugiau|dovaną\s+porai|dovanos\s+pagal|namų\s+jaukumui|jaukios\s+kalėdos\s*:/i.test(
      t,
    )
  ) {
    return 'gift'
  }

  if (
    /laiko\s+vis\s+mažiau|jau\s+rytoj|dovanos\s+dar\s+nėra|paskutin[eė]\s+minut|stres|spaudim|nebėra\s+laiko|skub|dar\s+nėra|vis\s+atided|laiko\s+maž|dienos\s+bėg/i.test(
      t,
    )
  ) {
    return 'stress'
  }

  if (/nežinai|ką\s+rinktis|ką\s+dovanoti|galvoj|kaip\s+pasirink|ką\s+išrink|ko\s+iešk/i.test(t)) {
    return 'thinking'
  }

  if (/pled|vilnon|jauki(?:ems|oms)?\s+vakar|namų\s+jauk|žvak[eė]|jaukumui|jauki\s+dovana/i.test(t)) {
    return 'cozy'
  }

  if (/šilum|meil|šird|šveln|apkabin|šilt(?:a|os|ų)?\s|su\s+meil/i.test(t)) {
    return 'warmth'
  }

  if (/netikėt|nenuostab|šokir|akys\s+iš|negali\s+patikėt/i.test(t)) {
    return 'surprise'
  }

  if (/kalėd(?:os|ų|in)|eglut|dekorac/i.test(t)) {
    return 'christmas'
  }

  if (/puik|nuostab|labai\s+patiks|tobul|super/i.test(t)) {
    return 'positive'
  }

  return 'none'
}

export function emojiMatchesIntent(emoji: string, intent: EmojiIntent): boolean {
  if (intent === 'none') return false
  if (KALEDU_EMOJIS[intent].some((a) => sameKaleduEmoji(a, emoji))) return true
  if (intent === 'thinking' && sameKaleduEmoji(emoji, '👀')) return true
  if (intent === 'gift' && sameKaleduEmoji(emoji, '🎄')) return true
  return false
}

export function christmasFieldEmojiOk(text: string): boolean {
  const emojis = extractKaleduEmojis(text)
  if (!emojis.length) return true
  const intent = inferKaleduEmojiIntent(text)
  return emojis.every((e) => isAllowedKaleduEmoji(e) && emojiMatchesIntent(e, intent))
}

function pickKeptEmoji(text: string, intent: EmojiIntent): string | null {
  if (intent === 'none') return null
  for (const e of extractKaleduEmojis(text)) {
    if (isAllowedKaleduEmoji(e) && emojiMatchesIntent(e, intent)) return e
  }
  return null
}

function cleanFieldEmoji(text: string): string {
  const raw = String(text || '')
  if (!raw) return raw
  const intent = inferKaleduEmojiIntent(raw)
  const keep = pickKeptEmoji(raw, intent)
  let kept = false
  const cleaned = raw
    .replace(KALEDU_EMOJI_RE, (m) => {
      if (keep && sameKaleduEmoji(m, keep) && !kept) {
        kept = true
        return keep
      }
      return ''
    })
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +\n/g, '\n')
    .replace(/\s+([.!?…])/g, '$1')
    .replace(/([.!?…])\s*$/u, '$1')
    .trim()
  return cleaned
}

type Placement = {
  slideIndex: number
  field: 'title' | 'body' | 'cta'
  intent: EmojiIntent
  emoji: string
  isHook: boolean
  isClose: boolean
  isMiddle: boolean
}

function fieldText(
  slide: { title?: string; body?: string; cta?: string },
  field: Placement['field'],
): string {
  if (field === 'title') return String(slide.title || '')
  if (field === 'body') return String(slide.body || '')
  return String(slide.cta || '')
}

function setField<T extends { title?: string; body?: string; cta?: string }>(
  slide: T,
  field: Placement['field'],
  value: string,
): T {
  if (field === 'title') return { ...slide, title: value }
  if (field === 'body') return { ...slide, body: value }
  return { ...slide, cta: value }
}

function stripEmojiFrom(text: string): string {
  return String(text || '')
    .replace(KALEDU_EMOJI_RE, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([.!?…])/g, '$1')
    .trim()
}

function collectPlacements<T extends { title?: string; body?: string; cta?: string; role?: string }>(
  slides: T[],
): Placement[] {
  const out: Placement[] = []
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i]
    const isHook = slide.role === 'hook' || i === 0
    const isClose = slide.role === 'close' || i === slides.length - 1
    const isMiddle = !isHook && !isClose
    for (const field of ['title', 'body', 'cta'] as const) {
      const text = fieldText(slide, field)
      const emojis = extractKaleduEmojis(text)
      if (!emojis.length) continue
      out.push({
        slideIndex: i,
        field,
        intent: inferKaleduEmojiIntent(text),
        emoji: emojis[0],
        isHook,
        isClose: isClose || field === 'cta',
        isMiddle,
      })
    }
  }
  return out
}

function emojiStrength(p: Placement): number {
  let score = 0
  if (p.isHook) score += 100
  if (p.field === 'cta' || (p.isClose && p.intent === 'gift')) score += 80
  if (p.intent === 'stress') score += STRESS_STRENGTH[stripVs(p.emoji)] || 1
  if (p.intent === 'gift' || p.intent === 'christmas') score += 10
  if (p.isMiddle) score -= 40
  if (p.field === 'body' && !p.isHook) score -= 5
  return score
}

function removePlacementEmoji<T extends { title?: string; body?: string; cta?: string }>(
  slides: T[],
  p: Placement,
): T[] {
  return slides.map((slide, i) => {
    if (i !== p.slideIndex) return slide
    return setField(slide, p.field, stripEmojiFrom(fieldText(slide, p.field)))
  })
}

export type PayoffTone = 'NEUTRAL' | 'WARM_PAYOFF' | 'EXCITED_REVEAL' | 'EMOTIONAL_PAYOFF'

const EXCITED_REVEAL_RE = /^(?:ir\s+štai|štai\s+kur)\b|jau\s+beveik\s+aišk/iu
const EMOTIONAL_PAYOFF_RE = /pradžiugina\s+labiausiai|būtent\s+toki\p{L}*\s+smulkmen/iu
const WARM_PAYOFF_RE = /iš\s+to\s+(?:dažnai\s+)?ir\s+gimsta|geriausia\s+dovanos\s+idėja|tikrai\s+pradžiugins/iu

export function classifyPayoffTone(sentence: string): PayoffTone {
  const bare = String(sentence || '')
    .replace(KALEDU_EMOJI_RE, '')
    .replace(/[.!?…]+$/u, '')
    .trim()
  if (!bare || bare.endsWith('?')) return 'NEUTRAL'
  if (EXCITED_REVEAL_RE.test(bare)) return 'EXCITED_REVEAL'
  if (EMOTIONAL_PAYOFF_RE.test(bare)) return 'EMOTIONAL_PAYOFF'
  if (WARM_PAYOFF_RE.test(bare)) return 'WARM_PAYOFF'
  return 'NEUTRAL'
}

function payoffEmoji(tone: PayoffTone): string | null {
  if (tone === 'EXCITED_REVEAL') return '✨'
  if (tone === 'WARM_PAYOFF' || tone === 'EMOTIONAL_PAYOFF') return '❤️'
  return null
}

function isProtectedCtaSentence(sentence: string): boolean {
  return /kaledukampelis\.(?:com|lt)/iu.test(sentence) || /🎁\s*$/u.test(sentence.trim())
}

function lastSentenceSpan(text: string): { head: string; tail: string; last: string } | null {
  const parts = String(text || '')
    .split(/(?<=[.!?…])\s+/u)
    .map((part) => part.trim())
    .filter(Boolean)
  if (!parts.length) return null
  let lastIndex = parts.length - 1
  while (lastIndex > 0 && isProtectedCtaSentence(parts[lastIndex])) lastIndex -= 1
  if (isProtectedCtaSentence(parts[lastIndex])) return null
  return {
    head: parts.slice(0, lastIndex).join(' '),
    tail: parts.slice(lastIndex + 1).join(' '),
    last: parts[lastIndex],
  }
}

export type WarmPayoffRepair = {
  slide: number
  category: 'warm_payoff_punctuation'
  original: string
  repair: string
  tone: PayoffTone
  emojiAdded: string | null
  slideRole: string
}

/** Last-sentence payoff punctuation, then at most one body emoji on the strongest moment. */
export function applyWarmPayoffPunctuation<T extends { title?: string; body?: string; role?: string }>(
  slides: T[],
): { slides: T[]; repairs: WarmPayoffRepair[] } {
  const ranked: Array<{ index: number; tone: PayoffTone; rank: number }> = []
  const tones: PayoffTone[] = slides.map(() => 'NEUTRAL')
  slides.forEach((slide, index) => {
    const role = slide.role || ''
    if (role === 'hook' || role === 'cta') return
    const span = lastSentenceSpan(slide.body || '')
    if (!span) return
    const tone = classifyPayoffTone(span.last)
    tones[index] = tone
    if (tone === 'NEUTRAL') return
    const rank = tone === 'EXCITED_REVEAL' ? 3 : tone === 'EMOTIONAL_PAYOFF' ? 2 : 1
    ranked.push({ index, tone, rank })
  })
  const bodyAlready = slides.some((slide) => {
    const copy = String(slide.body || '')
      .split(/(?<=[.!?…])\s+/u)
      .filter((part) => !isProtectedCtaSentence(part))
      .join(' ')
    return extractKaleduEmojis(`${slide.title || ''} ${copy}`).length > 0
  })
  const winner = bodyAlready
    ? -1
    : ranked.sort((a, b) => b.rank - a.rank || b.index - a.index)[0]?.index ?? -1
  const repairs: WarmPayoffRepair[] = []
  const next = slides.map((slide, index) => {
    const tone = tones[index]
    if (tone === 'NEUTRAL') return slide
    const span = lastSentenceSpan(slide.body || '')
    if (!span) return slide
    const original = span.last
    let last = original.replace(/[!?.…]+$/u, '').trim() + '!'
    let emojiAdded: string | null = null
    if (index === winner) {
      emojiAdded = payoffEmoji(tone)
      if (emojiAdded) last = `${last} ${emojiAdded}`
    }
    if (last === original) return slide
    const body = [span.head, last, span.tail].filter(Boolean).join(' ')
    repairs.push({
      slide: index + 1,
      category: 'warm_payoff_punctuation',
      original,
      repair: last,
      tone,
      emojiAdded,
      slideRole: slide.role || '',
    })
    return { ...slide, body }
  })
  return { slides: next, repairs }
}

export function normalizeTerminalEmojiPunctuation(text: string): string {
  return String(text || '').replace(
    /\s*(\p{Extended_Pictographic}(?:\uFE0F)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F)?)*)\s*([.!?])/gu,
    '$2 $1',
  )
}

/**
 * Christmas-only: keep 0–2 relevant allowlisted emojis across the whole carousel.
 * Never invents emoji when the budget is unused.
 */
export function normalizeKaleduEmojiBudget<
  T extends { title?: string; body?: string; cta?: string; role?: string },
>(slides: T[]): T[] {
  if (!isChristmasGiftsNiche() || !slides.length) return slides

  let next = slides.map((slide) => ({
    ...slide,
    title: normalizeTerminalEmojiPunctuation(cleanFieldEmoji(String(slide.title || ''))),
    body: normalizeTerminalEmojiPunctuation(cleanFieldEmoji(String(slide.body || ''))),
    ...(slide.cta !== undefined
      ? { cta: normalizeTerminalEmojiPunctuation(cleanFieldEmoji(String(slide.cta || ''))) }
      : {}),
  }))

  // Adjacent slides with the same intent → keep strongest (prefer hook).
  let placements = collectPlacements(next)
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const a = placements[i]
      const b = placements[j]
      if (a.intent === 'none' || b.intent === 'none') continue
      if (a.intent !== b.intent) continue
      if (Math.abs(a.slideIndex - b.slideIndex) !== 1) continue
      const drop = emojiStrength(a) >= emojiStrength(b) ? b : a
      next = removePlacementEmoji(next, drop)
      placements = collectPlacements(next)
      i = -1
      break
    }
  }

  placements = collectPlacements(next)
  while (placements.length > 2) {
    const nonCta = placements.filter((p) => p.field !== 'cta')
    const ctaPlacements = placements.filter((p) => p.field === 'cta')
    const middles = placements.filter((p) => p.isMiddle)
    const hook = placements.find((p) => p.isHook)
    const giftCta = placements.find(
      (p) => p.field === 'cta' || p.intent === 'gift' || p.intent === 'christmas',
    )
    let drop: Placement | undefined

    if (middles.length) {
      // Prefer dropping explanatory slides so hook + CTA/gift can remain.
      drop = [...middles].sort((a, b) => emojiStrength(a) - emojiStrength(b))[0]
    } else if (nonCta.length && ctaPlacements.length) {
      drop = [...nonCta].sort((a, b) => emojiStrength(a) - emojiStrength(b))[0]
    } else if (!ctaPlacements.length) {
      const ranked = [...placements].sort((a, b) => emojiStrength(a) - emojiStrength(b))
      drop = ranked.find((p) => {
        if (hook && giftCta && hook.intent !== giftCta.intent) {
          if (p === hook || p === giftCta) return false
        }
        return true
      })
      if (!drop) drop = ranked[0]
    }

    if (!drop) break
    next = removePlacementEmoji(next, drop)
    placements = collectPlacements(next)
  }

  return next
}
