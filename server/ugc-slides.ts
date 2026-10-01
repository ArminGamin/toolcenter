import { isOllamaConfigured, ollamaGenerateJson, ollamaWarmModel } from './ollama-client.js'
import { extractJsonObject, coerceSlidesArray } from './json-extract.js'
import {
  needsUgcLiteOllama,
  resolveUgcOllamaModel,
  resolveUgcOllamaNumCtx,
  resolveUgcOllamaNumCtxBatch,
  resolveUgcOllamaNumGpu,
  resolveUgcOllamaKeepAliveActive,
} from './ugc-env-bridge.js'
import { ensureUgcWebsiteCta, ugcActiveCta } from './ugc-cta-normalize.js'
import {
  collectStoryIssues,
  hasFormalRegister,
  isGibberishLtCopy,
  normalizeLtUgcMultiline,
  type NormalizeLtCopyState,
} from './ugc-lt-normalize.js'
import { ugcFail } from './ugc-error-detail.js'
import {
  UGC_LT_COPY_SKILL,
  ugcActiveAngleHints,
  ugcActiveCopySkill,
  ugcActiveOllamaSystemPrompt,
  buildLtDescriptionPrompt as ltDescTaskPrompt,
  buildSlideshowPrompt as slideshowTaskPrompt,
  stripEnglishCopyLabels,
} from './ugc-copy-skill.js'
import {
  generateUgcBatchStory,
  finalizeBatchSlides,
  qaPolishBatchSlides,
  rewriteKaleduSlidesNative,
  type UgcStorySlide,
} from './ugc-story-engine.js'
import { buildBatchTemplateCaption } from './ugc-caption-format.js'

export const UGC_ANGLES = [
  'save_money',
  'reduce_waste',
  'quick_meals',
  'personalisation',
  'planning',
  'one_time_payment',
  'avoid_disliked_foods',
  'gift_ideas',
  'last_minute',
  'gifts_family',
  'cozy_home',
  'shopping_stress',
  'countdown',
  'product_focus',
  'custom',
] as const

export type UgcAngle = (typeof UGC_ANGLES)[number]

export type UgcCopyVariant = {
  id: string
  title: string
  body: string
  cta?: string
}

export type UgcSlideshowSlide = {
  id: string
  title: string
  body: string
  cta?: string
  role?: string
  productId?: string
  visualIntent?: string
  showProductPrice?: boolean
  productPriceLabel?: string
}

export const MIN_SLIDESHOW_SLIDES = 2
export const MAX_SLIDESHOW_SLIDES = 12

const TITLE_MAX = 48
const BODY_MAX = 220
export const BATCH_SLIDESHOW_BODY_MAX = 380
const CTA_MAX = 55
const LT_DESCRIPTION_MAX = 1800

const OLLAMA_OFFLINE_MSG =
  'Ollama is not running. Start Ollama (ollama serve), then set OLLAMA_URL / OLLAMA_MODEL in UGC Slides settings, Vault, or post-maker/.env.'

export { isOllamaConfigured }

export function validateUgcSlideshowQuality(body: {
  slides: Array<{ title?: string; body?: string; role?: string; cta?: string }>
  description?: string
  theme?: string
}): { ok: boolean; issues: string[] } {
  const slides = Array.isArray(body.slides) ? body.slides : []
  const issues = collectStoryIssues(slides, body.theme || '').map((failure) =>
    `slide ${failure.slide}: ${failure.message}`,
  )
  const allCopy = slides.map((slide) => `${slide.title || ''} ${slide.body || ''} ${slide.cta || ''}`).join(' ')
  if (!slides.length) issues.push('At least one slide is required')
  if (isGibberishLtCopy(allCopy)) issues.push('Copy contains gibberish or incomplete Lithuanian')
  if (hasFormalRegister(allCopy)) issues.push('Use informal „tu“ forms consistently')
  if (body.description && isGibberishLtCopy(body.description)) issues.push('Description contains gibberish or incomplete Lithuanian')
  return { ok: issues.length === 0, issues: [...new Set(issues)] }
}

async function releaseUgcOllamaModel(): Promise<void> {
  // Keep the model resident after a batch (keep_alive 30m) so the next batch skips the
  // ~45s cold load. Ollama still evicts it when another model is requested
  // (OLLAMA_MAX_LOADED_MODELS=1).
}

/** Load model onto GPU before batch — keeps VRAM warm between posts. */
export async function warmUgcOllamaModel(): Promise<{ failed?: boolean; warmRequestMs: number }> {
  return ollamaWarmModel({
    model: resolveUgcOllamaModel(),
    numGpu: resolveUgcOllamaNumGpu(),
    numCtx: resolveUgcOllamaNumCtxBatch(),
    keepAlive: resolveUgcOllamaKeepAliveActive(),
    unloadOthers: true,
  })
}

/** Unload after a multi-post batch session (single-post batchStory skips per-call unload). */
export async function releaseUgcOllamaAfterBatch(): Promise<void> {
  await releaseUgcOllamaModel()
}

async function llmJsonPrompt(
  prompt: string,
  temperature = 0.55,
  options?: { batchCaption?: boolean },
): Promise<unknown> {
  const model = resolveUgcOllamaModel()
  const lite = needsUgcLiteOllama(model)
  const batchCaption = options?.batchCaption === true
  let lastError: Error | null = null
  const passes = batchCaption ? 1 : lite ? 2 : 1
  for (let pass = 0; pass < passes; pass++) {
    try {
      const raw = await ollamaGenerateJson(prompt, {
        temperature: pass > 0 ? Math.max(0.4, temperature - 0.15) : temperature,
        model,
        system: ugcActiveOllamaSystemPrompt(),
        useJsonFormat: batchCaption ? true : lite ? pass === 1 : true,
        numPredict: batchCaption ? 1400 : lite ? 1200 : 2048,
        numCtx: resolveUgcOllamaNumCtx(),
        numGpu: resolveUgcOllamaNumGpu(),
        keepAlive: resolveUgcOllamaKeepAliveActive(),
      })
      return extractJsonObject(raw)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (batchCaption || !lite) break
    }
  }
  throw lastError || new Error('Invalid JSON response')
}

export function llmErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  // Semantic QA / Gemini failures must not be remapped to the Ollama offline blurb.
  if (/Semantic QA|provider=gemini|provider=ollama|GEMINI_|Gemini |QA soft-skip/i.test(msg)) {
    if (/fetch failed|Failed to fetch|ECONNREFUSED|ENOTFOUND|timeout|aborted/i.test(msg) && /gemini/i.test(msg)) {
      return 'Gemini semantic QA request failed. Check GEMINI_API_KEY / network, or use UGC_QA_PROVIDER=ollama.'
    }
    return msg
  }
  if (/Ollama not reachable/i.test(msg)) return OLLAMA_OFFLINE_MSG
  if (/fetch failed|Failed to fetch|ECONNREFUSED|timeout|ENOTFOUND|aborted/i.test(msg)) {
    return 'Ollama request failed. Check that Ollama is running and the model is pulled.'
  }
  return msg || 'Failed to generate copy'
}

export function llmErrorResponse(err: unknown, context?: Record<string, unknown>) {
  return ugcFail(llmErrorMessage(err), err, context)
}
function clipField(text: string, max: number): string {
  const trimmed = text.replace(/\s+/g, ' ').trim()
  if (trimmed.length <= max) return trimmed
  const slice = trimmed.slice(0, max)
  const lastSpace = slice.lastIndexOf(' ')
  if (lastSpace > Math.floor(max * 0.55)) return slice.slice(0, lastSpace).trim()
  return slice.trim()
}

export function normalizeCopyVariant(raw: unknown, index: number): UgcCopyVariant | null {
  if (!raw || typeof raw !== 'object') return null
  const v = raw as Record<string, unknown>
  const titleRaw = String(v.title ?? '').replace(/\s+/g, ' ').trim()
  const bodyRaw = String(v.body ?? '').replace(/\s+/g, ' ').trim()
  const ctaRaw = String(v.cta ?? '').replace(/\s+/g, ' ').trim()
  if (!titleRaw || !bodyRaw) return null
  const title = clipField(titleRaw, TITLE_MAX)
  const body = clipField(bodyRaw, BODY_MAX)
  const ctaClipped = ctaRaw ? ensureUgcWebsiteCta(ctaRaw) : ''
  return {
    id: typeof v.id === 'string' && v.id.trim() ? v.id.trim() : `variant-${index + 1}`,
    title,
    body,
    ...(ctaClipped ? { cta: ctaClipped } : {}),
  }
}

function normalizeSlideshowSlide(
  raw: unknown,
  index: number,
  limits?: { bodyMax?: number },
): UgcCopyVariant | null {
  if (!raw || typeof raw !== 'object') return null
  const bodyMax = limits?.bodyMax ?? BODY_MAX
  const v = raw as Record<string, unknown>
  const titleRaw = stripEnglishCopyLabels(String(v.title ?? '').replace(/\s+/g, ' ').trim())
  const bodyRaw = stripEnglishCopyLabels(String(v.body ?? '').replace(/\s+/g, ' ').trim())
  const ctaRaw = stripEnglishCopyLabels(String(v.cta ?? '').replace(/\s+/g, ' ').trim())
  if (!bodyRaw && !titleRaw) return null
  const title = clipField(titleRaw, TITLE_MAX)
  const body = clipField(bodyRaw, bodyMax)
  const ctaClipped = ctaRaw ? ensureUgcWebsiteCta(ctaRaw) : ''
  return {
    id: typeof v.id === 'string' && v.id.trim() ? v.id.trim() : `slide-${index + 1}`,
    title,
    body,
    ...(ctaClipped ? { cta: ctaClipped } : {}),
  }
}

export function parseOllamaVariantsPayload(raw: unknown): UgcCopyVariant[] {
  let data = raw
  if (typeof raw === 'string') {
    data = extractJsonObject(raw)
  }
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid JSON response')
  }
  const variantsRaw = (data as { variants?: unknown }).variants
  if (!Array.isArray(variantsRaw)) {
    throw new Error('JSON must include a "variants" array with 3 items')
  }
  if (variantsRaw.length !== 3) {
    throw new Error('Exactly 3 valid copy variants are required')
  }
  const variants = variantsRaw
    .map((item, i) => normalizeCopyVariant(item, i))
    .filter((v): v is UgcCopyVariant => Boolean(v))
  if (variants.length !== 3) {
    throw new Error('Exactly 3 valid copy variants are required')
  }
  return variants
}

function slideRoles(count: number): string[] {
  if (count <= 1) return ['hook']
  const roles = ['hook']
  for (let i = 1; i < count - 1; i++) roles.push('value')
  roles.push('close')
  return roles
}

export function parseOllamaSlideshowPayload(
  raw: unknown,
  expectedCount: number,
  options?: { bodyMax?: number },
): UgcSlideshowSlide[] {
  const bodyMax = options?.bodyMax ?? BODY_MAX
  let data = raw
  if (typeof raw === 'string') {
    data = extractJsonObject(raw)
  }
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid JSON response')
  }
  const slidesRaw = coerceSlidesArray(data)
  if (!slidesRaw) {
    const keys =
      data && typeof data === 'object' && !Array.isArray(data)
        ? Object.keys(data as object).slice(0, 12).join(',')
        : typeof data
    throw new Error(`JSON must include a "slides" array (got keys: ${keys || 'none'})`)
  }
  if (slidesRaw.length !== expectedCount) {
    throw new Error(`Exactly ${expectedCount} slides are required`)
  }
  const roles = slideRoles(expectedCount)
  const slides: UgcSlideshowSlide[] = []
  for (let i = 0; i < slidesRaw.length; i++) {
    const normalized = normalizeSlideshowSlide(slidesRaw[i], i, { bodyMax })
    if (!normalized || (!normalized.body && !normalized.title)) {
      throw new Error(`Exactly ${expectedCount} valid slides are required`)
    }
    slides.push({
      ...normalized,
      id: normalized.id || `slide-${i + 1}`,
      role: roles[i],
    })
  }
  return slides
}

function buildSlideshowPrompt(angle: UgcAngle, brief: string, ctaOverride: string, slideCount: number): string {
  const defaultCta = ctaOverride.trim() || ugcActiveCta()
  const hints = ugcActiveAngleHints()
  const angleHint = hints[angle] || hints.custom
  const briefLine = brief.trim() ? `Papildomas kontekstas: ${brief.trim()}` : ''
  const roles = slideRoles(slideCount)
  const roleGuide = roles
    .map((role, i) => {
      if (role === 'hook') return `Skaidrė ${i + 1} (kabliukas): stiprus kabliukas, atpažįstama situacija`
      if (role === 'close') {
        return `Skaidrė ${i + 1} (pabaiga): nauda + švelnus CTA „${defaultCta}"`
      }
      return `Skaidrė ${i + 1} (vertė): konkreti nauda, patarimas ar įtikinama patirtis`
    })
    .join('\n')

  const slideExamples = roles
    .map((role, i) => {
      const ctaPart = role === 'close' ? `, "cta": "${defaultCta}"` : ''
      return `    { "id": "slide-${i + 1}", "title": "Stiprus kabliukas lietuviškai…", "body": "Tekstas lietuviškai…"${ctaPart} }`
    })
    .join(',\n')

  return `${ugcActiveCopySkill(UGC_LT_COPY_SKILL)}

Rašai lietuvišką UGC skaidrių seriją socialiniams tinklams (TikTok / Reels).
Tekstas dedamas ant baltų užrašų virš nuotraukų — trumpai, 2–5 eilutės kūne.
Visa serija turi sklandžiai vingiuoti kaip viena istorija — nekartok tų pačių minčių.
Gali naudoti įtikinamą patirtį pirmuoju asmeniu be konkretaus vardo.

ABSOLIUTUS REIKALAVIMAS: visi JSON laukai title, body, cta — 100% lietuvių kalba (lt-LT).
Jokių angliškų žodžių, jokių angliškų etikečių (HOOK, BODY). Hashtagai skaidrėse draudžiami.

Kampas: ${angleHint}
${briefLine}

Struktūra (${slideCount} skaidrės):
${roleGuide}

Grąžink TIK validų JSON šiuo formatu:
{
  "slides": [
${slideExamples}
  ]
}

Ribos kiekvienai skaidrei:
- title: iki ${TITLE_MAX} simbolių, vienas trumpas teiginys
- body: iki ${BODY_MAX} simbolių
- cta: iki ${CTA_MAX} simbolių (tik paskutinėje skaidrėje)
- Tiksliai ${slideCount} skaidrės

${slideshowTaskPrompt(brief.trim() ? `${angleHint}\n${briefLine}` : angleHint, slideCount)}`
}

function parseThemeBrief(brief: string): { themeHook: string; themeBody: string; topic: string } {
  const hookMatch = brief.match(/Kabliukas:\s*(.+)/i)
  const bodyMatch = brief.match(/Pagrindinė mintis:\s*(.+)/i)
  const themeHook = hookMatch?.[1]?.split('\n')[0]?.trim() || ''
  const themeBody = bodyMatch?.[1]?.split('\n')[0]?.trim() || brief.trim()
  const topic = [themeHook, themeBody].filter(Boolean).join('. ') || brief.trim()
  return {
    themeHook: themeHook || themeBody.slice(0, 80),
    themeBody: themeBody || themeHook,
    topic,
  }
}

export async function generateUgcSlideshowCopy(body: {
  angle?: string
  brief?: string
  cta?: string
  slideCount?: number
  batchStory?: boolean
  seed?: number
  skipWarm?: boolean
  theme?: string
  category?: string
  kind?: 'generic' | 'product'
  modeHint?: 'product_led' | 'hybrid' | 'generic'
  productHints?: string[]
  abortSignal?: AbortSignal
  onProgress?: (msg: string) => void
}): Promise<
  | {
      ok: true
      slides: UgcSlideshowSlide[]
      arcName?: string
      hookStyle?: string
      storyArc?: string
      auditId?: string | null
      pickedProducts?: string[]
    }
  | { ok: false; message: string; errorDetail: string }
> {
  const angle = UGC_ANGLES.includes(body.angle as UgcAngle) ? (body.angle as UgcAngle) : 'custom'
  const brief = String(body.brief || '')
  const cta = String(body.cta || '')
  const slideCount = Math.min(
    MAX_SLIDESHOW_SLIDES,
    Math.max(MIN_SLIDESHOW_SLIDES, Number(body.slideCount) || MIN_SLIDESHOW_SLIDES),
  )
  const batchStory = body.batchStory === true

  if (!(await isOllamaConfigured())) {
    return { ok: false, message: OLLAMA_OFFLINE_MSG, errorDetail: OLLAMA_OFFLINE_MSG }
  }

  try {
    if (batchStory) {
      try {
        const { themeHook, themeBody, topic } = parseThemeBrief(brief)
        const story = await generateUgcBatchStory({
          topic,
          themeHook,
          themeBody,
          slideCount,
          cta,
          seed: typeof body.seed === 'number' ? body.seed : undefined,
          skipWarm: body.skipWarm === true,
          theme: typeof body.theme === 'string' ? body.theme : undefined,
          category: typeof body.category === 'string' ? body.category : undefined,
          kind: body.kind,
          modeHint: body.modeHint,
          productHints: body.productHints,
          abortSignal: body.abortSignal,
          onProgress: body.onProgress,
        })
        return {
          ok: true,
          slides: story.slides,
          arcName: story.arcName,
          hookStyle: story.hookStyle,
          storyArc: story.storyArc,
          auditId: story.auditId,
          pickedProducts: story.pickedProducts,
        }
      } catch (err) {
        return llmErrorResponse(err, {
          action: 'batch-story',
          slideCount,
          seed: body.seed,
        })
      }
    }

    const prompt = buildSlideshowPrompt(angle, brief, cta, slideCount)

    try {
      const run = async (extraNote: string, temperature: number) => {
        const data = await llmJsonPrompt(extraNote ? `${prompt}\n\n${extraNote}` : prompt, temperature)
        return parseOllamaSlideshowPayload(data, slideCount, { bodyMax: BODY_MAX })
      }
      const baseTemp = 0.85
      try {
        const slides = await run('', baseTemp)
        const storySlides: UgcStorySlide[] = slides.map((slide) => ({
          ...slide,
          role: slide.role || (slide.id === 'slide-1' ? 'hook' : slide.id === `slide-${slides.length}` ? 'close' : 'build'),
        }))
        const qa = await qaPolishBatchSlides(
          storySlides,
          brief || angle,
          cta.trim() || ugcActiveCta(),
        )
        if (!qa.qa.ok) {
          throw new Error(`Lithuanian semantic QA blocked export: ${qa.qa.error || 'unresolved issue'}`)
        }
        const ltState: NormalizeLtCopyState = { mesOpenerCount: 0 }
        const normalized = qa.slides.map((slide) => ({
          ...slide,
          title: normalizeLtUgcMultiline(slide.title, ltState),
          body: normalizeLtUgcMultiline(slide.body, ltState),
        }))
        const finalized = finalizeBatchSlides(normalized, cta.trim() || ugcActiveCta())
        const native = await rewriteKaleduSlidesNative(finalized, {
          theme: brief || angle,
          defaultCta: cta.trim() || ugcActiveCta(),
        })
        const failures = collectStoryIssues(native.slides, brief || angle)
        if (failures.length) {
          const first = failures[0]
          throw new Error(`Lithuanian story gate blocked export: slide ${first.slide} ${first.code}: ${first.message}`)
        }
        return {
          ok: true,
          slides: native.slides.map((slide) => ({
            id: slide.id,
            title: slide.title,
            body: slide.body,
            ...(slide.cta ? { cta: slide.cta } : {}),
            ...(slide.role ? { role: slide.role } : {}),
          })),
        }
      } catch {
        const slides = await run(
          'Ankstesnis atsakymas neatitiko formato arba buvo per ilgas. Grąžink trumpesnį JSON — laikykis simbolių ribų, vidurinėse skaidrėse title=""',
          Math.max(0.55, baseTemp - 0.15),
        )
        const storySlides: UgcStorySlide[] = slides.map((slide) => ({
          ...slide,
          role: slide.role || (slide.id === 'slide-1' ? 'hook' : slide.id === `slide-${slides.length}` ? 'close' : 'build'),
        }))
        const qa = await qaPolishBatchSlides(
          storySlides,
          brief || angle,
          cta.trim() || ugcActiveCta(),
        )
        if (!qa.qa.ok) {
          throw new Error(`Lithuanian semantic QA blocked export: ${qa.qa.error || 'unresolved issue'}`)
        }
        const ltState: NormalizeLtCopyState = { mesOpenerCount: 0 }
        const normalized = qa.slides.map((slide) => ({
          ...slide,
          title: normalizeLtUgcMultiline(slide.title, ltState),
          body: normalizeLtUgcMultiline(slide.body, ltState),
        }))
        const finalized = finalizeBatchSlides(normalized, cta.trim() || ugcActiveCta())
        const native = await rewriteKaleduSlidesNative(finalized, {
          theme: brief || angle,
          defaultCta: cta.trim() || ugcActiveCta(),
        })
        const failures = collectStoryIssues(native.slides, brief || angle)
        if (failures.length) {
          const first = failures[0]
          throw new Error(`Lithuanian story gate blocked export: slide ${first.slide} ${first.code}: ${first.message}`)
        }
        return {
          ok: true,
          slides: native.slides.map((slide) => ({
            id: slide.id,
            title: slide.title,
            body: slide.body,
            ...(slide.cta ? { cta: slide.cta } : {}),
            ...(slide.role ? { role: slide.role } : {}),
          })),
        }
      }
    } catch (err) {
      return llmErrorResponse(err, { action: 'generate-slideshow', slideCount })
    }
  } finally {
    if (!batchStory) {
      await releaseUgcOllamaModel()
    }
  }
}

function buildLtDescriptionPrompt(
  angle: UgcAngle,
  brief: string,
  cta: string,
  slides: Array<{ title: string; body: string }>,
): string {
  const hints = ugcActiveAngleHints()
  const angleHint = hints[angle] || hints.custom
  const briefLine = brief.trim() ? `Papildomas kontekstas: ${brief.trim()}` : ''
  const slideSummary = slides
    .map((s, i) => `Skaidrė ${i + 1}: ${s.title} — ${s.body}`)
    .join('\n')
  const defaultCta = cta.trim() || ugcActiveCta()

  return `${ugcActiveCopySkill(UGC_LT_COPY_SKILL)}

Rašai aukštos kokybės lietuvišką Discord / Reels / TikTok aprašymą.
Aprašymas turi papildyti skaidrių seriją, o ne ją dubliuoti žodis į žodį.
Pirmas sakinys — stiprus kabliukas. Pabaigoje švelnus kvietimas veikti.

ABSOLIUTUS REIKALAVIMAS: aprašymas — tik lietuvių kalba (lt-LT). Jokių angliškų žodžių ar frazių.
Neįtrauk hashtagų — jie bus pridėti automatiškai po teksto.

Kampas: ${angleHint}
${briefLine}
CTA nuoroda: ${defaultCta}

Skaidrių turinys:
${slideSummary}

Grąžink TIK validų JSON:
{
  "description": "vienas lietuviškas aprašymas"
}

Ribos:
- description: 400–${LT_DESCRIPTION_MAX} simbolių
- 3–8 trumpų pastrašų arba sakinių blokų, atskirtų nauja eilute
- Paskutinis sakinys gali būti švelnus CTA

${ltDescTaskPrompt(brief.trim() ? `${angleHint}\n${briefLine}` : angleHint)}`
}

export function parseLtDescriptionPayload(raw: unknown): string {
  let data = raw
  if (typeof raw === 'string') {
    data = extractJsonObject(raw)
  }
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid JSON response')
  }
  const description = stripEnglishCopyLabels(
    String((data as { description?: unknown }).description || '')
      .replace(/\s+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  )
  if (description.length < 80) {
    throw new Error('Description is too short')
  }
  return description.slice(0, LT_DESCRIPTION_MAX)
}

export async function generateLtDiscordDescription(body: {
  angle?: string
  brief?: string
  cta?: string
  slides?: Array<{ title?: string; body?: string; role?: string; cta?: string }>
  batchCaption?: boolean
  arcName?: string
  hookStyle?: string
  storyArc?: string
  seed?: number
}): Promise<
  | { ok: true; description: string; hook?: string }
  | { ok: false; message: string }
> {
  const angle = UGC_ANGLES.includes(body.angle as UgcAngle) ? (body.angle as UgcAngle) : 'custom'
  const brief = String(body.brief || '')
  const cta = String(body.cta || '')
  const slides = (body.slides || [])
    .map((s) => ({
      id: '',
      title: String(s.title || '').trim(),
      body: String(s.body || '').trim(),
      role: String(s.role || '').trim(),
      ...(s.cta ? { cta: String(s.cta).trim() } : {}),
    }))
    .filter((s) => s.title || s.body)

  if (!(await isOllamaConfigured())) {
    return { ok: false, message: OLLAMA_OFFLINE_MSG }
  }

  if (body.batchCaption === true && slides.length > 0) {
    const seed = typeof body.seed === 'number' ? body.seed : 0
    const defaultCta = cta.trim() || ugcActiveCta()
    const { themeHook, themeBody } = parseThemeBrief(brief)
    const templated = buildBatchTemplateCaption({
      themeHook,
      themeBody,
      slides,
      defaultCta,
      seed,
    })
    return { ok: true, description: templated.description, hook: templated.hook }
  }

  const prompt = buildLtDescriptionPrompt(
    angle,
    brief,
    cta,
    slides.map((s) => ({ title: s.title, body: s.body })),
  )

  try {
    const data = await llmJsonPrompt(prompt, 0.75)
    const description = parseLtDescriptionPayload(data)
    return { ok: true, description }
  } catch (err) {
    return llmErrorResponse(err, { action: 'generate-description-lt' })
  } finally {
    await releaseUgcOllamaModel()
  }
}

function buildPrompt(angle: UgcAngle, brief: string, ctaOverride: string): string {
  const defaultCta = ctaOverride.trim() || ugcActiveCta()
  const hints = ugcActiveAngleHints()
  const angleHint = hints[angle] || hints.custom
  const briefLine = brief.trim() ? `Papildomas kontekstas: ${brief.trim()}` : ''

  return `${ugcActiveCopySkill(UGC_LT_COPY_SKILL)}

Rašai trumpos lietuviškos UGC skaidrės socialiniams įrašams (TikTok / Reels).
Tekstas turi tilpti ant baltų užrašų virš nuotraukų — 2–5 eilutės kūne.
Gali naudoti įtikinamą patirtį pirmuoju asmeniu be konkretaus vardo.

Kampas: ${angleHint}
${briefLine}

Grąžink TIK validų JSON šiuo formatu:
{
  "variants": [
    { "id": "variant-1", "title": "...", "body": "...", "cta": "${defaultCta}" },
    { "id": "variant-2", "title": "...", "body": "...", "cta": "${defaultCta}" },
    { "id": "variant-3", "title": "...", "body": "...", "cta": "${defaultCta}" }
  ]
}

Ribos:
- title: iki ${TITLE_MAX} simbolių, vienas trumpas teiginys
- body: iki ${BODY_MAX} simbolių
- cta: iki ${CTA_MAX} simbolių
- 3 skirtingi variantai`
}

export async function generateUgcSlideCopy(body: {
  angle?: string
  brief?: string
  cta?: string
}): Promise<{ ok: true; variants: UgcCopyVariant[] } | { ok: false; message: string }> {
  const angle = UGC_ANGLES.includes(body.angle as UgcAngle) ? (body.angle as UgcAngle) : 'custom'
  const brief = String(body.brief || '')
  const cta = String(body.cta || '')

  if (!(await isOllamaConfigured())) {
    return { ok: false, message: OLLAMA_OFFLINE_MSG }
  }

  const prompt = buildPrompt(angle, brief, cta)

  try {
    const data = await llmJsonPrompt(prompt, 0.85)
    const variants = parseOllamaVariantsPayload(data)
    return { ok: true, variants }
  } catch (err) {
    return llmErrorResponse(err, { action: 'generate-copy' })
  } finally {
    await releaseUgcOllamaModel()
  }
}
