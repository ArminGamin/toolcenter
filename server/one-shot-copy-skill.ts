import { rankCaptionsForText } from './one-shot-caption-lexicon.js'

export const ONE_SHOT_MIN_WORDS = 90
export const ONE_SHOT_MAX_WORDS = 150

export type OneShotVoice = 'auto' | 'i' | 'you'

export const ONE_SHOT_SYSTEM_PROMPT = `You write one-slide iPhone Notes posts.

You are a person writing a raw thought into Notes at night. Not a coach. Not a carousel. Not a brand.

OUTPUT
- Return JSON only: {"text":"...","voice":"i"|"you"|"mixed","captions":["...","...","..."]}
- "text" is ONE paragraph. No line breaks. No title. No bullets. No numbered list.
- 90 to 150 words. Dense. Left-aligned Notes length.
- "captions" are TikTok descriptions only. They do NOT appear on the note canvas.

CAPTION (TikTok description)
- 3 to 5 short terms, best first. Each term is 1 to 3 Title Case words.
- Psychological, philosophical, or clinical. Name the idea that is actually in THIS paragraph.
- Wrong term is a failure. A fear/leap note is Achluophobia, not Peniaphobia. A dying/time note is Mortality Salience, not Reticence. A keep-it-private note is Reticence. A crazy/greatness note is Megalomaniacal.
- Match this style: Achluophobia, Mortality Salience, Self-Actualization, Vulnerability, Unburdened Receptivity, Reticence, Compartmentalization, Transcendence, Megalomaniacal, Hypervigilant, Existentialism, Peniaphobia.
- Letters, spaces, hyphens only. No emoji, hashtags, quotes, periods.

VOICE
- Most posts are first person (I, me, my).
- Some posts speak to the reader as you.
- Mixed is allowed when it sounds like a real note, not a script.
- Never write like a slideshow: no "slide 1", no hook/body/CTA, no punchline-only one-liners.

TONE
- Journal, late-night, slightly imperfect. Motivational underneath, not poster copy.
- English only.
- No hashtags, no emoji, no URLs, no CTA, no product, no brand, no handle, no "follow", no "link in bio".
- No markdown. Straight apostrophes and quotes are fine.
- Do not start with "Here's the truth" or "Let me tell you something".
- Never use em dashes or en dashes. Use a comma, a period, or a short sentence. Hyphens only inside words (4am, self-respect).

CRAFT (from Post Maker hook + voice rules, adapted to one note)
- One continuous monologue. One thought that turns. Not a carousel, not a list, not a speech with slides.
- Open in the thought. Use one of: confession, a specific hour/place/decision, a question you cannot drop, an uncomfortable truth you already know. Then stay in the paragraph.
- Specific over slogan. A Tuesday at 4:24am beats "success". A real itch beats "discipline".
- Cut filler. Every sentence has to earn its place. Repeat a word for pressure if it sounds like a note, not a hook formula.
- Do not write Tate/Goggins one-liners, "save this", swipe CTAs, numbered tips, before/after scoreboards, or scroll-stopper cover lines.

FEW-SHOT (match this density and feel, do not copy. captions name THAT paragraph)

1) captions: ["Megalomaniacal","Autonomy","Conviction"]
i: I am striving for freedom. The desire for success is fueled by the need for freedom. I must be able to live how I imagine myself in the future. All my hopes and dreams will become reality once I break through the threshold that is the current boundaries of my current situation. You have to be crazy, you have to be insane to believe you're going to accomplish more than anyone has ever expected. You need people to look at you and call you crazy because you need to be crazy to achieve greatness. But it's not about them, it's about you. No one will take you to where you want to be other than yourself.

2) captions: ["Achluophobia","Mortality Salience","Defiance"]
mixed: Do not be afraid. Use fear to your advantage, for once you take that leap there is no going back. I never understood when someone wants to accomplish something great but chooses not to out of fear. Any day could be our last, live with no regrets. Fear will eat you alive, do not let it consume you, let it fuel you to keep pushing. I would rather fear living in mediocrity knowing I chose not to act than fear taking action at all. Who cares what people think? They speak because they fear you for taking that leap that they never will.

3) captions: ["Vulnerability","Reticence","Ambivalence"]
i: "Is it better to speak or to die?" I can't stop thinking about this quote, as I lie awake at 4:24 am on a Tuesday so many thoughts cross my mind. To speak is to put in existence to those who are yet to know, and to withhold is to keep purity in the idea. I think you should speak because it must be known that you are great, but I also believe it is important to withhold because this way you will die yourself. Pure from thought to thought.`

const NOTES_OPENINGS = [
  'Confession: admit something you got wrong or still wrestle with, then stay in the thought.',
  'Scene: drop into a specific hour, place, or decision. No backstory dump.',
  'Question: one question you cannot stop turning over. Answer it inside the same paragraph.',
  'Uncomfortable truth: say what you already know and keep refusing. No slogan cover line.',
  'In motion: start mid-thought, as if the note was already being typed.',
] as const

export function buildOneShotUserPrompt(input: {
  theme: string
  category: string
  topic?: string
  voice: OneShotVoice
}): string {
  const voiceLine =
    input.voice === 'i'
      ? 'Write in first person (I / me / my). You-address is allowed only as a brief turn, not the whole note.'
      : input.voice === 'you'
        ? 'Write in second person (you). First person is allowed only as a brief turn, not the whole note.'
        : 'Prefer first person (~75%). Sometimes write as you. Mixed is fine if it still reads like one note.'

  const topicLine = input.topic?.trim()
    ? `User topic override: ${input.topic.trim()}`
    : 'No extra topic. Stay on the theme.'

  const opening = NOTES_OPENINGS[Math.floor(Math.random() * NOTES_OPENINGS.length)]

  return `Category: ${input.category}
Theme: ${input.theme}
${topicLine}
Voice rule: ${voiceLine}
Opening: ${opening}

Write one Notes paragraph (90 to 150 words) about this theme.
Then label THIS paragraph with 3 to 5 TikTok description terms, best first, that name what the note actually says (like Achluophobia for fear/leap, Mortality Salience for dying/time).
JSON only. No em dashes.`
}

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u
const CTA_RE =
  /\b(follow me|link in bio|comment below|swipe up|click the link|subscribe|dm me|save this)\b/i

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

export function normalizeOneShotText(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\n+/g, ' ')
    .replace(/\s*[\u2014\u2013\u2015—–]\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/,(?=\S)/g, ', ')
    .replace(/,\s*,/g, ',')
    .trim()
}

export function validateOneShotText(text: string): string | null {
  const t = text.trim()
  if (!t) return 'Empty text'
  if (t.includes('#')) return 'Hashtags not allowed'
  if (EMOJI_RE.test(t)) return 'Emoji not allowed'
  if (/\bhttps?:\/\//i.test(t)) return 'URLs not allowed'
  if (CTA_RE.test(t)) return 'CTA language not allowed'
  if (/\bslide\s*\d+\b/i.test(t)) return 'Carousel language not allowed'
  if (/^\s*[-*•]\s/m.test(t)) return 'Bullets not allowed'
  if (/[\u2014\u2013\u2015—–]/.test(t)) return 'Em dashes not allowed'
  const words = countWords(t)
  if (words < ONE_SHOT_MIN_WORDS) return `Too short (${words} words)`
  if (words > ONE_SHOT_MAX_WORDS + 20) return `Too long (${words} words)`
  return null
}

const SENTENCE_CAPTION_RE =
  /^(I|I'm|I'd|I've|You|You're|We|We're|Do|Don't|Did|The|A|An|This|That|My|Your)\b/i

export function titleCaseCaption(raw: string): string {
  return raw
    .trim()
    .replace(/['"`“”‘’]/g, '')
    .replace(/[.!?…]+$/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) =>
      word
        .split('-')
        .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part))
        .join('-'),
    )
    .join(' ')
}

export function validateOneShotCaption(caption: string): string | null {
  const t = caption.trim()
  if (!t) return 'Empty caption'
  if (t.includes('#')) return 'Hashtags not allowed'
  if (EMOJI_RE.test(t)) return 'Emoji not allowed'
  if (!/^[A-Za-z][A-Za-z\s-]*[A-Za-z]$/.test(t) && !/^[A-Za-z]+$/.test(t)) {
    return 'Caption must be a short term'
  }
  const words = t.split(/\s+/).filter(Boolean).length
  if (words < 1 || words > 4) return 'Caption must be 1 to 4 words'
  if (SENTENCE_CAPTION_RE.test(t)) return 'Caption looks like a sentence'
  if (/[\u2014\u2013\u2015—–]/.test(t)) return 'Em dashes not allowed'
  return null
}

export function collectModelCaptions(raw: unknown): string[] {
  const bag: unknown[] = []
  if (raw && typeof raw === 'object') {
    const obj = raw as { caption?: unknown; captions?: unknown }
    if (Array.isArray(obj.captions)) bag.push(...obj.captions)
    if (obj.caption) bag.push(obj.caption)
  } else if (typeof raw === 'string') {
    bag.push(raw)
  }
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of bag) {
    const cleaned = titleCaseCaption(String(item || ''))
    if (validateOneShotCaption(cleaned)) continue
    const key = cleaned.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(cleaned)
  }
  return out
}

export function resolveOneShotCaptions(
  text: string,
  modelRaw: unknown,
): { caption: string; captions: string[] } {
  const ranked = rankCaptionsForText(text)
  const scores = new Map(ranked.map((row) => [row.term.toLowerCase(), row.score]))
  const model = collectModelCaptions(modelRaw)

  for (const term of model) {
    const key = term.toLowerCase()
    const prior = scores.get(key) || 0
    scores.set(key, prior + 4)
  }

  const merged = [...scores.entries()]
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([term]) => {
      const fromRank = ranked.find((row) => row.term.toLowerCase() === term)
      if (fromRank) return fromRank.term
      return model.find((item) => item.toLowerCase() === term) || titleCaseCaption(term)
    })

  const captions = merged.slice(0, 5)
  if (!captions.length && model.length) return { caption: model[0], captions: model.slice(0, 5) }
  if (!captions.length) return { caption: 'Existentialism', captions: ['Existentialism'] }
  return { caption: captions[0], captions }
}

export function discordCaptionForNote(caption: string, noteText = ''): string {
  const cleaned = titleCaseCaption(caption)
  if (!validateOneShotCaption(cleaned) && countWords(caption) <= 4) return cleaned
  const source = noteText.trim() || caption
  return resolveOneShotCaptions(source, { caption: cleaned }).caption
}

/** @deprecated Use resolveOneShotCaptions(text, modelRaw) */
export function resolveOneShotCaption(
  raw: unknown,
  category?: string,
  theme?: string,
): string {
  const text = typeof category === 'string' && category.split(/\s+/).length > 20 ? category : ''
  return resolveOneShotCaptions(text || String(theme || ''), { caption: raw, captions: [raw] }).caption
}

export function detectVoice(text: string): 'i' | 'you' | 'mixed' {
  const iHits = (text.match(/\b(I|I'm|I've|I'd|me|my|myself)\b/g) || []).length
  const youHits = (text.match(/\b(you|you're|you've|you'd|your|yourself)\b/gi) || []).length
  if (iHits >= 3 && youHits >= 3) return 'mixed'
  if (youHits > iHits) return 'you'
  return 'i'
}
