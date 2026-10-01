/** Hook styles, story arcs and the calm Discord caption prompt/parser. (Split out of ugc-story-engine.ts.) */

import { extractJsonObject } from '../json-extract.js'
import {
    stripEnglishCopyLabels,
    UGC_BATCH_LITE_SKILL,
    UGC_LT_COPY_SKILL,
    ugcActiveCopySkill
} from '../ugc-copy-skill.js'
import { needsUgcLiteOllama } from '../ugc-env-bridge.js'
import {
    normalizeLtUgcMultiline,
    type NormalizeLtCopyState
} from '../ugc-lt-normalize.js'
import {
    getUgcSeasonAvoidHint,
    getUgcSeasonContext,
    trimCaptionBody,
    UGC_CAPTION_BODY_MAX,
    UGC_CAPTION_BODY_MIN
} from '../ugc-season-context.js'
import { type UgcStorySlide } from './text.js'

export const UGC_HOOK_STYLES = [
  'Contrarian',
  'Question',
  'Story opener',
  'Bold claim',
  'Confession',
  'Before / after',
  'Empathy mirror',
  'Pattern interrupt',
  'Challenge',
  'Uncomfortable truth',
] as const

export type UgcHookStyle = (typeof UGC_HOOK_STYLES)[number]

export const UGC_STORY_ARCS = [
  'Two-beat punch',
  'Contrarian',
  'Confession',
  'Bold claim',
  'Before / after',
  'Question',
] as const

export type UgcStoryArc = (typeof UGC_STORY_ARCS)[number]

export const UGC_ROLE_LABELS: Record<string, string> = {
  hook: 'Kabliukas',
  context: 'Kontekstas',
  build: 'Istorijos dalis',
  close: 'Pabaiga',
  punch: 'Smūgis',
}

export const UGC_LT_CAPTION_HOOKS = [
  '📌 Priminimas:',
  '📌 Sunki tiesa:',
  '📌 Atkreipk dėmesį:',
  '📌 Skaityk lėtai:',
  '📌 Štai kas svarbu:',
  '📌 Trumpai ir aiškiai:',
  '📌 Daugelis to nežino:',
  '📌 Jei jauti, kad stringi:',
] as const

export function buildUgcCalmCaptionPrompt(opts: {
  topic: string
  arcName: string
  hookStyle: UgcHookStyle
  storyArc: UgcStoryArc
  defaultCta: string
  slides: UgcStorySlide[]
  provenHook: string
}): string {
  const slideSummary = opts.slides
    .map((s, i) => {
      const label = UGC_ROLE_LABELS[s.role || 'build'] || s.role
      const text = [s.title, s.body].filter(Boolean).join(' ')
      return `Skaidrė ${i + 1} (${label}): ${text}${s.cta ? ` [CTA: ${s.cta}]` : ''}`
    })
    .join('\n')

  const hooksList = UGC_LT_CAPTION_HOOKS.map((h) => `- ${h}`).join('\n')
  const skill = ugcActiveCopySkill(needsUgcLiteOllama() ? UGC_BATCH_LITE_SKILL : UGC_LT_COPY_SKILL)

  return `${skill}

Rasyk RAMU, silta lietuviska Discord / Reels aprasyma - NE agresyvu skaidriu tona.
Skaidres = emocinis monologas; aprasymas = trumpas, ramus paaiskinimas.

${getUgcSeasonContext(new Date(), opts.topic)}
${getUgcSeasonAvoidHint()}

TEMA: ${opts.topic}
LANKAS: ${opts.arcName}

Skaidriu turinys (reference only - expand, do NOT copy):
${slideSummary}

Grazink TIK JSON:
{
  "hook": "vienas openeris is PROVEN HOOKS",
  "body": "LYGIAI 3 trumpos pastraipos be CTA. ${UGC_CAPTION_BODY_MIN}-${UGC_CAPTION_BODY_MAX} simb."
}

PROVEN HOOKS:
${hooksList}

Rekomenduojamas hook: ${opts.provenHook}

TAISYKLES:
- hook - tiksliai viena eilute is PROVEN HOOKS (su pin)
- body - LYGIAI 3 pastraipos: 1) klausimas/skausmas 2) insight 3) nauda/posūkis (be CTA)
- Sistema prideda soft CTA su tavoknyga.com + hashtagus
- Be em dash; naudok paprasta bruksneli (-)
- Be emoji spam body
- Be HOOK:/BODY: etikeciu
- 100% lietuviu kalba, kreipinys "tu"
`
}

export function parseCalmCaptionPayload(raw: unknown): { hook: string; body: string } {
  let data = raw
  if (typeof raw === 'string') data = extractJsonObject(raw)
  if (!data || typeof data !== 'object') throw new Error('Invalid JSON response')
  const v = data as Record<string, unknown>
  let hook = stripEnglishCopyLabels(String(v.hook ?? '').trim())
  let body = stripEnglishCopyLabels(
    String(v.body ?? v.description ?? '')
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  )
  if (!body && hook) {
    body = hook
    hook = ''
  }
  if (body.length < UGC_CAPTION_BODY_MIN) throw new Error('Description is too short')
  if (!hook) hook = 'Skaityk lėtai:'
  if (!hook.endsWith(':')) hook = hook.replace(/[.!?]+$/, '') + ':'
  const ltState: NormalizeLtCopyState = { mesOpenerCount: 0 }
  body = trimCaptionBody(normalizeLtUgcMultiline(body, ltState))
  hook = normalizeLtUgcMultiline(hook, ltState)
  return { hook, body }
}
