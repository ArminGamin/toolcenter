/** Batch prompt building and the Ollama JSON call used to generate slide chunks. (Split out of ugc-story-engine.ts.) */

import { extractJsonObject, salvageSlidesJsonText } from '../json-extract.js'
import { ollamaGenerateJson, type OllamaCallType } from '../ollama-client.js'
import { isChristmasGiftsNiche } from '../profile-brand.js'
import {
    buildJsonRetryReminder,
    UGC_BATCH_FAST_SKILL,
    ugcActiveCopySkill,
    ugcActiveOllamaSystemPrompt
} from '../ugc-copy-skill.js'
import { ugcActiveCta } from '../ugc-cta-normalize.js'
import { resolveUgcOllamaKeepAliveActive, resolveUgcOllamaModel, resolveUgcOllamaNumCtx, resolveUgcOllamaNumCtxBatch, resolveUgcOllamaNumGpu } from '../ugc-env-bridge.js'
import {
    getUgcSeasonContext,
    sanitizeLtSeasonCopy
} from '../ugc-season-context.js'
import { parseStoryBatchPayload, type StoryBatchItems } from './batch-payload.js'
import { UGC_ROLE_LABELS, type UgcHookStyle, type UgcStoryArc } from './caption.js'
import { consumePostOllamaCall, isPostOllamaBudgetExhausted } from './ollama-budget.js'
import { splitSentences, TITLE_MAX } from './text.js'

export const ROLE_BEAT_GUIDE: Record<string, string> = {
  hook: 'ĮVYKIS: konkreti akimirka ar klausimas iš temos — sustabdo scroll. Be sprendimo, be CTA, be emoji.',
  context:
    'PRIEŽASTIS: kodėl taip nutinka — paaiškink mechanizmą, ne pakartok hook. Nauji daiktavardžiai, nauja mintis. Be sprendimo.',
  build:
    'POSŪKIS: nauja įžvalga, kurios dar nebuvo — ką tai keičia praktiškai. Nekartok ankstesnių skaidrių žodžių ar temos.',
  close:
    'REZULTATAS: kas pasikeičia, kai problema išspręsta. Nekartok hook. cta = tiksliai „Apsilankyk tavoknyga.com ir pradėk 5 min. testą! 🤩" (vieną kartą, NE body). Jokio naujo klausimo.',
  punch: 'Vienas stiprus, pilnas sakinys — visa mintis.',
}

export function roleGuideLt(role: string, index: number, defaultCta: string): string {
  const beat = ROLE_BEAT_GUIDE[role] || UGC_ROLE_LABELS[role] || role
  if (role === 'hook') {
    return `Skaidrė ${index} (kabliukas): ${beat} title = pirmas trumpas sakinys (≤${TITLE_MAX} simb.), text = likę sakiniai`
  }
  if (role === 'context') {
    return `Skaidrė ${index} (kontekstas): ${beat}`
  }
  if (role === 'close') {
    return `Skaidrė ${index} (pabaiga): ${beat} text = išvada; cta = PRIVALOMA tiksliai „${defaultCta}"`
  }
  if (role === 'build') {
    return `Skaidrė ${index} (istorija): ${beat} 2–4 sakiniai`
  }
  return `Skaidrė ${index}: ${beat}`
}

export function jsonBatchExample(roles: string[], targets: number[]): string {
  const slides = roles.map((role, i) => {
    const lines = Array.from({ length: targets[i] }, (_, j) => `S${j + 1}.`)
    const item: Record<string, string> = { role, text: lines.join('\n') }
    if (role === 'close') item.cta = ugcActiveCta()
    if (role === 'hook') item.title = 'Kabliukas'
    return item
  })
  return JSON.stringify({ slides })
}

export function storySoFar(slides: Array<{ role: string; text: string }>, compact = false): string {
  if (!slides.length) return '(pradžia — dar nieko)'
  if (compact) {
    return slides
      .map((s, i) => {
        const oneLine = s.text.replace(/\s+/g, ' ').trim()
        const clip = oneLine.length > 100 ? `${oneLine.slice(0, 100)}…` : oneLine
        return `Skaidrė ${i + 1}: ${clip}`
      })
      .join('\n')
  }
  return slides
    .map((s, i) => {
      const label = UGC_ROLE_LABELS[s.role] || s.role
      return `Skaidrė ${i + 1} (${label}):\n${s.text}`
    })
    .join('\n\n')
}

export function buildBatchStoryPrompt(opts: {
  topic: string
  themeHook: string
  themeBody: string
  slideCount: number
  hookStyle: UgcHookStyle
  storyArc: UgcStoryArc
  defaultCta: string
  storyAngle: string
  priorSlides: Array<{ role: string; text: string }>
  slideStart: number
  chunkRoles: string[]
  chunkTargets: number[]
  lite?: boolean
  varietyBlock?: string
  productBrief?: string
  productResolutionBlock?: string
}): string {
  const {
    topic,
    themeHook,
    themeBody,
    slideCount,
    hookStyle,
    storyArc,
    defaultCta,
    storyAngle,
    priorSlides,
    slideStart,
    chunkRoles,
    chunkTargets,
  } = opts

  const roleLines = chunkRoles.map((role, offset) => {
    const num = slideStart + offset
    const exact = chunkTargets[offset]
    const guide = roleGuideLt(role, num, defaultCta)
    return `- ${guide} | tiksliai ${exact} sakiniai (vienas sakinys = viena eilutė text lauke)`
  })

  const banned: string[] = []
  for (const s of priorSlides) {
    for (const sent of splitSentences(s.text)) banned.push(`- ${sent}`)
  }
  const bannedLimit = chunkRoles.length === 1 && chunkRoles[0] === 'close' ? 6 : 16
  const bannedBlock = banned.length
    ? `\nNEKARTOK (draudžiama naudoti šiuos sakinius ar labai panašias formuluotes):\n${banned.slice(-bannedLimit).join('\n')}`
    : ''
  const closeBlock = chunkRoles.includes('close')
    ? `\nPASKUTINĖ SKAIDRĖ: body = išvada. cta = tiksliai „${defaultCta}". NERAŠYK URL / emoji į body.\n`
    : ''

  const skillBlock = ugcActiveCopySkill(UGC_BATCH_FAST_SKILL)

  const themeText = `${topic} ${themeHook} ${themeBody}`
  const varietyBlock = slideStart === 1 ? opts.varietyBlock || '' : ''
  const catalogBlock = opts.productBrief?.trim() ? `\n${opts.productBrief.trim()}\n` : ''
  const resolutionBlock = opts.productResolutionBlock?.trim() ? `\n${opts.productResolutionBlock.trim()}\n` : ''

  return `${skillBlock}

${getUgcSeasonContext(new Date(), themeText)}
${catalogBlock}${resolutionBlock}
TEMA: ${topic}
${sanitizeLtSeasonCopy(themeHook)}. ${sanitizeLtSeasonCopy(themeBody)}
${hookStyle} · ${storyArc} · ${storyAngle}

Skaidrės ${slideStart}–${slideStart + chunkRoles.length - 1} / ${slideCount} (text = sakiniai per \\n; hook: title+text; close: text+cta)
KIEKVIENA SKAIDRĖ = kitas istorijos žingsnis (įvykis → priežastis → posūkis → rezultatas). Nekartok tų pačių daiktavardžių ar pirmos frazės.
${
  isChristmasGiftsNiche()
    ? 'Jei jau kalbėjai apie pirkimo stresą / sąrašą / paskutinę minutę — kitoje skaidrėje NAUJA mintis, ne tas pats kitais žodžiais.'
    : 'Jei jau kalbėjai apie mieguistumą / angliavandenių santykį / aiškų planą — kitoje skaidrėje NAUJA mintis, ne tas pats kitais žodžiais.'
}
${varietyBlock}${bannedBlock}
${roleLines.join('\n')}
${storySoFar(priorSlides, true)}
${closeBlock}
Grąžink TIK JSON su tiksliai ${chunkRoles.length} slides. Pavyzdys: ${jsonBatchExample(chunkRoles, chunkTargets)}`
}

export const UGC_LITE_NUM_PREDICT = 1200

/** Token budget — short LT JSON; leave headroom so Ollama doesn't truncate to `{`. */
export function batchNumPredict(slideCount: number): number {
  const ideal = 180 * Math.max(1, slideCount) + 160
  const ctx = resolveUgcOllamaNumCtxBatch()
  // Short batch SYSTEM (~120 tok) + user skill/theme (~700) — keep reserve honest
  const promptReserve = 1100
  const capped = Math.min(ideal, Math.max(520, ctx - promptReserve))
  return Math.min(1400, capped)
}

export function isTruncatedJsonError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return (
    /\b(2|3|4|5|6|7|8|9|[1-4]\d)\s*chars\b/i.test(msg) ||
    /preview:\s*\{\s*"?\s*$/i.test(msg) ||
    /Invalid JSON response:\s*\{\s*"?\s*$/i.test(msg) ||
    /JSON parse failed \(\d{1,2} chars\)/i.test(msg)
  )
}

export const UGC_BATCH_OLLAMA_TIMEOUT_MS = 90_000

export type LlmJsonOpts = {
  lite?: boolean
  numPredict?: number
  /** Batch story: one format:json pass (PostMaker speed). */
  batchMode?: boolean
  signal?: AbortSignal
  callType?: OllamaCallType
}

export function isAbortError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  return err.name === 'AbortError' || /aborted|abort/i.test(err.message)
}

export function isTimeoutError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  return err.name === 'TimeoutError' || /timeout|aborted due to timeout/i.test(err.message)
}

export async function llmJson(
  prompt: string,
  temperature: number,
  attempt = 0,
  opts: LlmJsonOpts = {},
): Promise<unknown> {
  const lite = opts.lite ?? false
  const batchMode = opts.batchMode ?? false
  const numPredict = opts.numPredict ?? (lite ? UGC_LITE_NUM_PREDICT : 2048)
  let lastError: Error | null = null
  const passes = batchMode ? 1 : lite ? 2 : 1
  for (let pass = 0; pass < passes; pass++) {
    try {
      if (batchMode && !consumePostOllamaCall()) {
        throw new Error('Post Ollama call budget exhausted')
      }
      // PostMaker: format:json on every batch call — stops prose rambling before JSON
      const useJsonFormat = batchMode ? true : lite ? pass === 1 : attempt < 2
      const raw = await ollamaGenerateJson(prompt, {
        temperature:
          pass > 0 || attempt > 0
            ? Math.max(0.35, temperature - 0.12 * Math.max(pass, attempt))
            : temperature,
        model: resolveUgcOllamaModel(),
        // Batch: short SYSTEM overrides Modelfile — frees KV for JSON (full rules → code gate)
        system: ugcActiveOllamaSystemPrompt(batchMode),
        useJsonFormat,
        numPredict,
        numCtx: batchMode ? resolveUgcOllamaNumCtxBatch() : resolveUgcOllamaNumCtx(),
        numGpu: resolveUgcOllamaNumGpu(),
        keepAlive: resolveUgcOllamaKeepAliveActive(),
        timeoutMs: batchMode ? UGC_BATCH_OLLAMA_TIMEOUT_MS : 180_000,
        topP: 0.85,
        signal: opts.signal,
        callType: opts.callType || (batchMode ? 'draft' : 'other'),
        timeFit: batchMode,
      })
      const text = String(raw ?? '').trim()
      if (!text) {
        throw new Error(`Ollama returned empty body (model=${resolveUgcOllamaModel()})`)
      }
      // Tiny stubs like `{"` mean ctx/predict starvation — fail fast for retry/split
      if (text.length < 24 || /^[\s{["]+$/.test(text)) {
        throw new Error(`JSON parse failed (${text.length} chars): truncated stub | preview: ${text.slice(0, 40)}`)
      }
      try {
        return extractJsonObject(raw)
      } catch (err) {
        const salvaged = salvageSlidesJsonText(String(raw))
        if (salvaged) return salvaged
        const preview = String(raw).replace(/\s+/g, ' ').trim().slice(0, 240)
        const msg = err instanceof Error ? err.message : String(err)
        throw new Error(`JSON parse failed (${String(raw).length} chars): ${msg}${preview ? ` | preview: ${preview}` : ''}`, {
          cause: err instanceof Error ? err : undefined,
        })
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (isAbortError(err) || isTimeoutError(err)) throw lastError
      if (batchMode || !lite) break
    }
  }
  throw lastError || new Error('Invalid JSON response')
}

export function batchChunkError(err: unknown, _roles: string[], attempts: number): Error {
  const message = err instanceof Error ? err.message : String(err)
  // Avoid "Batch chunk failed… Batch chunk failed…" nesting
  if (/^Model call failed \(\d+ call/i.test(message)) {
    return err instanceof Error ? err : new Error(message)
  }
  return new Error(`Model call failed (${attempts} call(s)): ${message}`, {
    cause: err instanceof Error ? err : undefined,
  })
}

export async function generateBatchChunk(
  prompt: string,
  roles: string[],
  temperature: number,
  numPredictBoost = 0,
  signal?: AbortSignal,
  chunkStart = 1,
): Promise<StoryBatchItems> {
  const expected = roles.length
  let lastError: Error | null = null
  // One call per chunk attempt — the caller owns retries, so parse failures never chain 90s calls.
  const maxAttempts = 1
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) throw new Error('Batch aborted')
    if (isPostOllamaBudgetExhausted()) break
    try {
      const retryNote =
        attempt === 0
          ? ''
          : `\n\n${buildJsonRetryReminder('invalid_json')}\nRETRY: Return COMPLETE {"slides":[...]} with EXACTLY ${expected} slides. Short LT only. Error: ${lastError?.message}`
      const temp = attempt === 0 ? temperature : 0.42
      const predict = Math.min(1600, batchNumPredict(expected) + numPredictBoost + attempt * 80)
      const raw = await llmJson(`${prompt}${retryNote}`, temp, attempt, {
        batchMode: true,
        numPredict: predict,
        signal,
      })
      return parseStoryBatchPayload(raw, roles, chunkStart)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (isAbortError(err) || isTimeoutError(err)) throw lastError
      if (isTruncatedJsonError(err)) numPredictBoost = Math.max(numPredictBoost, 200)
    }
  }
  throw batchChunkError(lastError, roles, maxAttempts)
}
