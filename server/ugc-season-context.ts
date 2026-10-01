import { isChristmasGiftsNiche } from './profile-brand.js'

/** Lithuanian seasonal context for UGC copy — keeps slides/captions aligned with real calendar. */

const LT_MONTHS = [
  'sausis',
  'vasaris',
  'kovas',
  'balandis',
  'gegužė',
  'birželis',
  'liepa',
  'rugpjūtis',
  'rugsėjis',
  'spalis',
  'lapkritis',
  'gruodis',
] as const

const WRONG_SEASON_WORDS: Record<number, string[]> = {
  0: ['pavasar', 'vasar', 'rud', 'atostog'],
  1: ['pavasar', 'vasar', 'rud', 'atostog'],
  2: ['žiem', 'kalėd', 'vasar', 'rud'],
  3: ['žiem', 'kalėd', 'vasar', 'rud'],
  4: ['žiem', 'kalėd', 'vasar', 'rud'],
  5: ['pavasar', 'žiem', 'kalėd', 'rud'],
  6: ['pavasar', 'žiem', 'kalėd', 'rud'],
  7: [
    'rugsėj',
    'ruden',
    'rudens',
    'spal',
    'mokyklos pradž',
    'pavasar',
    'žiem',
    'kalėd',
    'christmas',
    'new year',
    'nauji metai',
    'naujų metų',
    'kov',
  ],
  8: ['pavasar', 'žiem', 'kalėd', 'biržel'],
  9: ['pavasar', 'žiem', 'kalėd', 'biržel'],
  10: ['pavasar', 'vasar', 'atostog', 'biržel'],
  11: ['pavasar', 'vasar', 'atostog', 'rud'],
}

/**
 * Any month/season/weather reference. Stems account for LT palatalisation
 * (rugpjūtis → rugpjūčio, karštis → karščio), otherwise the gate misses the copy.
 */
export const UGC_SEASON_ECHO_RE =
  /(sausi[oį]|vasari[oį]|kov[oaąų]\b|balandž|geguž|biržel|liep[oaąų]\b|rugpjū|rugsėj|spali[oųj]|lapkri|gruodž|vasar|ruden|ruduo|žiem|pavasar|karšt|karšč|šalt|šalč|atostog|sezon|\borai\b|\boras\b|\borų\b)/iu

/** True when the theme itself is about a season/month — only then seasonal copy is allowed. */
export function isSeasonalUgcTheme(themeText: string): boolean {
  if (isChristmasGiftsNiche()) return true
  return UGC_SEASON_ECHO_RE.test(String(themeText || ''))
}

/**
 * Prompt-side season rule. Deliberately does NOT name the current month:
 * naming it made the model open every slide with the same seasonal filler.
 */
export function getUgcSeasonContext(now = new Date(), themeText = ''): string {
  if (isChristmasGiftsNiche()) {
    return 'SEZONAS: rašai Kalėdų Kampeliui — kalėdos, dovanos, šventė LEIDŽIAMA. Nekeisk kalėdų į rudenį. Vasaros ir pavasario užpildas draudžiamas.'
  }
  const month = now.getMonth()
  const name = LT_MONTHS[month] ?? 'metai'

  if (!isSeasonalUgcTheme(themeText)) {
    return 'SEZONAS: Nerašyk apie mėnesius, metų laikus, orus ar karštį — rašyk tik apie temą. Jokio sezoninio užpildo.'
  }

  const wrong = (WRONG_SEASON_WORDS[month] ?? []).slice(0, 4).join(', ')
  return `SEZONAS: Tema sezoninė, todėl metų laiką gali paminėti TIK VIENĄ KARTĄ per visą istoriją (dabar ${name}). Nekartok jo kitose skaidrėse. Draudžiama: ${wrong}.`
}

export function getUgcSeasonAvoidHint(now = new Date()): string {
  if (isChristmasGiftsNiche()) {
    return 'SEZONAS: Kalėdų Kampelis — kalėdinės temos LEIDŽIAMOS visus metus. Nekeisk kalėdų į rudenį.'
  }
  const month = now.getMonth()
  const avoid = WRONG_SEASON_WORDS[month] ?? []
  if (!avoid.length) return ''
  return `DRAUDŽIAMOS netinkamos metų nuorodos (net temoje): ${avoid.map((w) => `„${w}…"`).join(', ')}. Jei tema mini kitą sezoną — ignoruok ir rašyk apie dabartinį.`
}

/** Block wrong-season words in theme hooks/bodies when picking from pool. */
export function isUgcThemeSeasonallyValid(
  entry: { theme?: string; hook?: string; body?: string },
  now = new Date(),
): boolean {
  const text = `${entry.theme ?? ''} ${entry.hook ?? ''} ${entry.body ?? ''}`.toLowerCase()
  const avoid = WRONG_SEASON_WORDS[now.getMonth()] ?? []
  return !avoid.some((w) => text.includes(w))
}

export function hasWrongUgcSeasonReference(text: string, now = new Date()): boolean {
  if (isChristmasGiftsNiche()) return false
  const value = String(text || '').toLocaleLowerCase('lt-LT')
  const avoid = WRONG_SEASON_WORDS[now.getMonth()] ?? []
  return avoid.some((word) => value.includes(word))
}

/** Rewrite wrong-season words in theme seed + generated copy (e.g. pavasario → vasaros in August). */
export function sanitizeLtSeasonCopy(text: string, now = new Date()): string {
  if (isChristmasGiftsNiche()) return text
  const month = now.getMonth()
  let out = text
  if (month >= 5 && month <= 8) {
    out = out
      .replace(/\bpavasario\b/giu, 'vasaros')
      .replace(/\bpavasarį\b/giu, 'vasarą')
      .replace(/\bpavasaris\b/giu, 'vasara')
      .replace(/\bpavasar\w*/giu, (m) => m.replace(/pavasar/giu, 'vasar'))
      .replace(/\bPavasario\b/g, 'Vasaros')
      .replace(/\bPavasaris\b/g, 'Vasara')
  }
  if (month === 7) {
    out = out
      .replace(/\bRugsėjo\b/gu, 'Rugpjūčio')
      .replace(/\brugsėjo\b/giu, 'rugpjūčio')
      .replace(/\bRugsėjis\b/gu, 'Rugpjūtis')
      .replace(/\brugsėjis\b/giu, 'rugpjūtis')
      .replace(/\bRugsėjį\b/gu, 'Rugpjūtį')
      .replace(/\brugsėjį\b/giu, 'rugpjūtį')
      .replace(/\bRudens\b/gu, 'Vasaros')
      .replace(/\brudens\b/giu, 'vasaros')
      .replace(/\bRudenio\b/gu, 'Vasaros')
      .replace(/\brudenio\b/giu, 'vasaros')
      .replace(/\bRudeniui\b/gu, 'Vasarai')
      .replace(/\brudeniui\b/giu, 'vasarai')
      .replace(/\bRudenį\b/gu, 'Vasarą')
      .replace(/\brudenį\b/giu, 'vasarą')
      .replace(/\bRuduo\b/gu, 'Vasara')
      .replace(/\bruduo\b/giu, 'vasara')
      .replace(/\bmokyklos pradži\w*\b/giu, 'rugpjūčio rutiną')
  }
  if (month >= 8 && month <= 10) {
    out = out
      .replace(/\bžiemos\b/giu, 'rudens')
      .replace(/\bkalėd\w*\b/giu, 'rudens')
      .replace(/\bbiržel\w*\b/giu, 'rugsėj')
  }
  if (month >= 2 && month <= 4) {
    out = out.replace(/\bvasaros\b/giu, 'pavasario').replace(/\brudens\b/giu, 'pavasario')
  }
  if (month === 11 || month <= 1) {
    out = out.replace(/\bvasaros\b/giu, 'žiemos').replace(/\bpavasario\b/giu, 'žiemos')
  }
  return out
}

export function adaptUgcThemeForSeason<T extends { theme: string; hook: string; body: string }>(
  entry: T,
  now = new Date(),
): T {
  return {
    ...entry,
    theme: sanitizeLtSeasonCopy(entry.theme, now),
    hook: sanitizeLtSeasonCopy(entry.hook, now),
    body: sanitizeLtSeasonCopy(entry.body, now),
  }
}

/** Batch Discord caption body — shorter than full skill default. */
export const UGC_CAPTION_BODY_MIN = 80
export const UGC_CAPTION_BODY_MAX = 520
export const UGC_CAPTION_MAX_BLOCKS = 4

export function trimCaptionBody(
  body: string,
  maxChars = UGC_CAPTION_BODY_MAX,
  maxBlocks = UGC_CAPTION_MAX_BLOCKS,
): string {
  let blocks = body
    .replace(/\r\n/g, '\n')
    .split(/\n+/)
    .map((b) => b.trim())
    .filter(Boolean)

  while (blocks.length > maxBlocks) {
    if (blocks.length <= 2) break
    blocks.pop()
  }

  let text = blocks.join('\n\n')
  while (text.length > maxChars && blocks.length > 2) {
    blocks.pop()
    text = blocks.join('\n\n')
  }

  if (text.length <= maxChars) return text.trim()

  const slice = text.slice(0, maxChars)
  const lastSpace = slice.lastIndexOf(' ')
  return (lastSpace > Math.floor(maxChars * 0.55) ? slice.slice(0, lastSpace) : slice).trim()
}

/** Slides may not recycle the same season/weather filler across a post. */
export function seasonEchoCount(texts: string[]): number {
  return texts.filter((text) => UGC_SEASON_ECHO_RE.test(text)).length
}

export function isSeasonFillerRepeat(
  text: string,
  priorTexts: string[],
  seasonalTheme: boolean,
): boolean {
  if (!UGC_SEASON_ECHO_RE.test(text)) return false
  if (!seasonalTheme) return true
  return seasonEchoCount(priorTexts) >= 1
}

/**
 * Remove seasonal filler without killing the slide: drop a leading weather clause
 * ("Po sunkaus rugpjūčio karščio, ...") or the whole sentence when it is filler only.
 */
export function stripSeasonFiller(text: string): string {
  if (isChristmasGiftsNiche()) return String(text || '').trim()
  const kept: string[] = []
  for (const line of String(text || '').split('\n')) {
    const sentence = line.trim()
    if (!sentence) continue
    if (!UGC_SEASON_ECHO_RE.test(sentence)) {
      kept.push(sentence)
      continue
    }
    const comma = sentence.indexOf(',')
    if (comma > 8 && comma < 90) {
      const head = sentence.slice(0, comma)
      const tail = sentence.slice(comma + 1).trim()
      if (UGC_SEASON_ECHO_RE.test(head) && !UGC_SEASON_ECHO_RE.test(tail) && tail.length >= 24) {
        kept.push(tail.charAt(0).toLocaleUpperCase('lt-LT') + tail.slice(1))
        continue
      }
    }
  }
  return kept.join('\n').trim()
}
