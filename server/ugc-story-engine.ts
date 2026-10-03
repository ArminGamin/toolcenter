/**
 * PostMaker-style UGC story engine — hook × arc matrix, role-based slides, dedupe, calmer captions.
 * Lithuanian (lt-LT) for slides + Discord; visual pipeline unchanged on the client.
 */

import { currentBusinessProfile } from './business-profiles.js'
import { ollamaWarmModel, onOllamaCallStat } from './ollama-client.js'
import { noteUgcGpuCall, ugcGpuTunerBatchStart } from './ugc-gpu-tuner.js'
import { isChristmasGiftsNiche } from './profile-brand.js'
import {
    auditFallback,
    auditLog,
    auditWrite,
    beginUgcAuditPost,
    finalizeUgcAuditPost,
    isUgcAuditActive,
    runUgcAuditPost,
} from './ugc-batch-audit.js'
import {
    buildUgcAuditPromptSnapshot
} from './ugc-copy-skill.js'
import { ugcActiveCta } from './ugc-cta-normalize.js'
import { resolveUgcOllamaKeepAliveActive, resolveUgcOllamaModel, resolveUgcOllamaNumCtxBatch, resolveUgcOllamaNumGpu } from './ugc-env-bridge.js'
import {
    normalizeBatchHookStyle,
    UGC_BATCH_SAFE_HOOK_STYLES
} from './ugc-hook-templates.js'
import { applyEmphaticPayoffPunctuation, classifyCardPunctuation } from './ugc-kaledu-card-leaks.js'
import {
    applyReservedProductResolution,
    attachKaleduSlideProducts,
    buildKaleduProductContract,
    demoteProductTypeCapitals,
    enforceKaleduProductSlide,
    formatKaleduProductBrief,
    loadKaleduCatalog,
    productResolutionPromptLines,
    recordKaleduProductUsage,
    repairKaleduProductConsistency,
    resolveProductAssets,
    routeKaleduStory,
    type KaleduStoryMode,
    type UgcThemeKind
} from './ugc-kaledu-catalog.js'
import { pickKaleduCta, pickStoryAwareKaleduCta } from './ugc-kaledu-cta.js'
import { applyWarmPayoffPunctuation, normalizeKaleduEmojiBudget, topUpKaleduEmoji } from './ugc-kaledu-emoji.js'
import {
    findMissingQuestionMarks,
    findRegisterErrors,
    isSpellNoteOnly,
    kaleduDeterministicQa,
    normalizeDirectQuestionPunctuation,
    repairProductSceneContinuity,
    repairUgcQuestionAndCollocation
} from './ugc-kaledu-final-qa.js'
import {
    emptyKaleduNativeMeta,
    type KaleduNativeRewriteMeta
} from './ugc-kaledu-native.js'
import {
    ensureKaleduProductIndexFresh,
    kaleduIndexCachePath,
    rankCatalogProducts,
    watchKaleduCatalog,
} from './ugc-kaledu-product-index.js'
import {
    chunkResultTelemetry,
    recordModelCall,
    resetModelCallLog,
    summarizeModelCalls,
    updateProductDebt
} from './ugc-kaledu-rewrite-gate.js'
import { assignSlideVisuals, checkProductVisual, resolveProductVisuals } from './ugc-kaledu-visuals.js'
import {
    collectStoryIssues,
    isNearDuplicateSentenceKey,
    normalizeLtUgcMultiline,
    normalizeSentenceKey,
    sentenceKeyWordOverlap,
    UGC_KALEDU_DIET_LEAK_RE,
    type NormalizeLtCopyState
} from './ugc-lt-normalize.js'
import {
    isSeasonalUgcTheme
} from './ugc-season-context.js'
import { batchChunkError, batchNumPredict, buildBatchStoryPrompt, generateBatchChunk, isAbortError, isTimeoutError, isTruncatedJsonError } from './ugc-story/batch-llm.js'
import { UGC_LT_CAPTION_HOOKS, UGC_STORY_ARCS, type UgcHookStyle, type UgcStoryArc } from './ugc-story/caption.js'
import { buildFallbackChunkSlides, buildFallbackCloseBody, buildFallbackHook, buildFallbackSupportBody } from './ugc-story/fallbacks.js'
import { buildKaleduProductLedBrief, enforceProductSlideContract, finalKaleduShipQa, kaleduProductLedIssues, makeKaleduSlideFallback, repairKaleduProductLed, repairKaleduStoryGate, repairProductDebt, type KaleduSlideFallback, type KaleduStoryGateRepair } from './ugc-story/kaledu-gates.js'
import { rewriteKaleduSlidesNative, rewriteTavoSlidesNative } from './ugc-story/native-rewrite.js'
import { batchChunkSize, isPostOllamaBudgetExhausted, postOllamaBudgetForSlideCount, resetPostOllamaBudget } from './ugc-story/ollama-budget.js'
import { stripProductIdTags } from './ugc-lt/normalize-copy.js'
import { repairKaleduArc } from './ugc-story/arc-repair.js'
import { finalizeBatchSlides, repairStoryOrderAndRepeats } from './ugc-story/repairs.js'
import { collectParaphraseSlideIssues } from './ugc-story/similarity.js'
import { qaPolishBatchSlides, slidesFromItems } from './ugc-story/slide-assembly.js'
import { splitSentences, type UgcStorySlide } from './ugc-story/text.js'
import {
    buildUgcVarietyBanBlock,
    recordUgcVarietyEntry
} from './ugc-variety-ledger.js'
export { holdPendingSuffix, parseStoryBatchPayload, planChunkRepair } from './ugc-story/batch-payload.js'
export type { ChunkRoleOutcome, StoryBatchItem, StoryBatchItems } from './ugc-story/batch-payload.js'
export { buildUgcCalmCaptionPrompt, parseCalmCaptionPayload, UGC_HOOK_STYLES, UGC_LT_CAPTION_HOOKS, UGC_ROLE_LABELS, UGC_STORY_ARCS } from './ugc-story/caption.js'
export type { UgcHookStyle, UgcStoryArc } from './ugc-story/caption.js'
export { buildFallbackChunkSlides, buildFallbackCloseBody, buildFallbackHook, fitSlideText, getFallbackCloseBodyCandidates, KALEDU_SUBJECT_HOOKS, pickKaleduSubjectHook, pickValidatedKaleduFallback, UGC_FALLBACK_BUILD_BODIES, UGC_FALLBACK_CONTEXT_BODIES, UGC_KALEDU_FALLBACK_BUILD_BODIES, UGC_KALEDU_FALLBACK_CLOSE_BODIES, UGC_KALEDU_FALLBACK_CONTEXT_BODIES, UGC_MIN_SENTENCES_PER_SLIDE } from './ugc-story/fallbacks.js'
export { buildKaleduProductLedBrief, finalKaleduShipQa, KALEDU_PRODUCT_LED_CLOSE_BODIES, kaleduProductLedIssues, makeKaleduSlideFallback, repairKaleduProductLed, repairKaleduStoryGate, repairProductDebt } from './ugc-story/kaledu-gates.js'
export type { KaleduSlideFallback, KaleduStoryGateRepair } from './ugc-story/kaledu-gates.js'
export { rewriteKaleduSlidesNative, rewriteTavoSlidesNative } from './ugc-story/native-rewrite.js'
export type { KaleduLlmCall } from './ugc-story/native-rewrite.js'
export { batchChunkSize, consumePostOllamaCall, isPostOllamaBudgetExhausted, postOllamaBudgetForSlideCount, resetPostOllamaBudget } from './ugc-story/ollama-budget.js'
export { ensureHookBodyQuestions, finalizeBatchSlides, repairStoryOrderAndRepeats, repairSugarSatietyContrast } from './ugc-story/repairs.js'
export { collectParaphraseSlideIssues, isDuplicateSlideCopy, isParaphraseSlideCopy, slideCopyFingerprint, ugcSlideThemeOverlap } from './ugc-story/similarity.js'
export { qaPolishBatchSlides } from './ugc-story/slide-assembly.js'
export type { UgcStorySlide } from './ugc-story/text.js'
// Adaptive GPU layers: a slow or timed-out UGC call means VRAM spilled — step down.
onOllamaCallStat((stat) => {
  const result = noteUgcGpuCall(stat)
  if (result.stepped) {
    console.warn(`[UGC GPU] slow call (${result.tokensPerSec?.toFixed(1) ?? 'timeout'} tok/s) → ${result.layers} GPU layers`)
    auditLog('gpu_layers_step_down', result)
  }
})

export const UGC_MIN_STORY_SLIDES = 3
export const UGC_MAX_STORY_SLIDES = 12
export const UGC_MAX_SENTENCES_PER_SLIDE = 5
export const UGC_HOOK_STYLE_GUIDE: Record<UgcHookStyle, string> = {
  Contrarian: 'Apversk įprastą tikėjimą apie temą. Ne patogus hot take — atpažįstama tiesa.',
  Question: 'Vienas aštrus klausimas apie skaitytojo elgesį su tema. Pilna mintis pirmoje skaidrėje.',
  'Story opener': 'Konkretus momentas — laikas, vieta ar sprendimas — susietas su tema. Be ilgos praeities.',
  'Bold claim': 'Aiškus teiginys, kurį norisi patvirtinti ar paneigti. Nuo 2 skaidrės — įrodymai.',
  Confession: 'Klausimo kabliukas (ne aš/testimonial) — 2-ojo asmens gidas apie temą.',
  'Before / after': 'Kas jauti dabar vs ko norėtum dėl temos. 2 skaidrė — posūkis.',
  'Empathy mirror': 'Įvardink skausmą dėl temos be guodimo.',
  'Pattern interrupt': 'Trumpas, sustabdantis sakinys — 1–2 eilutės.',
  Challenge: 'Tiesioginis iššūkis: jei tema vėl laimi — skaityk toliau.',
  'Uncomfortable truth': 'Pasakyk tai, ką jie jau žino, bet vengia pripažinti.',
}

export const UGC_STORY_ARC_GUIDE: Record<UgcStoryArc, string> = {
  'Two-beat punch': 'Drąsus teiginys apie temą → atskleisk spragą tarp žodžių ir veiksmų → spaudimas → CTA.',
  Contrarian: 'Puolimas patogios nuomonės apie temą. Apversk, ką mano „visi".',
  Confession: 'Problema → posūkis → naujas standartas (tik „tu", be aš/testimonial).',
  'Bold claim': 'Eilutė, kurios negalima ignoruoti. Kiekviena skaidrė įrodo spaudimu.',
  'Before / after': 'Kas buvote vs kas tapote. Viduryje — darbas, kurio vengia dauguma.',
  Question: 'Vienas klausimas apie elgesį su tema. Kiekviena skaidrė atsako, kodėl pralaimite.',
}

export const UGC_STORY_ANGLES = [
  'Konkreti diena ar momentas, kai viskas pasikeitė dėl temos',
  'Du žmonės, tas pats tikslas — vienas laimi, kitas stovi vietoje',
  'Paslėptos metų kainos, kai ignoruoji temą',
  'Ką tavo savaitės rutina išduoda apie tikruosius prioritetus',
  'Taisyklė, kurios nepažeidi — kai kiti kasdien ją laužo',
  'Melas, kurį sau pasakojai praėjusiais metais apie temą',
  'Nejaukus veidrodis — vienas įprotis, kuris tave demaskuoja',
  'Konkretūs skaičiai: kg, €, dienos ar savaitės, kurie privertė veikti',
  'Kas pasikeitė, kai nustojai spėlioti ir pradėjai planuoti',
  'Vieta ar scena: virtuvė vakare, parduotuvė, šaldytuvas — susieti su tema',
]

export const UGC_KALEDU_STORY_ANGLES = [
  'Konkreti diena, kai vis dar neturi dovanos, o šventė jau visai čia',
  'Du žmonės, tas pats biudžetas — vienas ramiai išsirinko, kitas vis dar skuba',
  'Paslėpta kaina, kai perki bet ką, kad tik būtų dovana',
  'Ką tavo dovanų sąrašas išduoda apie tikruosius prioritetus',
  'Taisyklė, kurios nepažeidi — dovana turi tikti žmogui, ne lentynai',
  'Melas, kurį sau pasakojai: dar spėsi iki Kalėdų',
  'Nejaukus veidrodis — vis atidedi pirkimą, kol lieka paskutinė diena',
  'Konkretūs skaičiai: eurai, dienos iki švenčių, žmonės sąraše',
  'Kas pasikeitė, kai nustojai spėlioti ir pradėjai rinktis pagal žmogų',
  'Vieta ar scena: prekybos centras, eglutė namuose, paskutinė diena iki švenčių',
]

function ugcActiveStoryAngles(): readonly string[] {
  return isChristmasGiftsNiche() ? UGC_KALEDU_STORY_ANGLES : UGC_STORY_ANGLES
}

export const UGC_STORY_PREMISES = [
  'Viena scena su laiku ir vieta — ne abstraktus patarimas',
  'Du žmonės, du rezultatai, vienas pasirinkimas',
  'Konkretūs skaičiai: suma, dienos, porcijos',
  'Pirmo asmens prisipažinimas, tada sprendimas',
  'Vienas kasdienis įprotis, kuris išduoda tikruosius prioritetus',
  'Mitai, kuriais visi tiki — ir kodėl jie neteisingi',
  'Taisyklė, kuria gyveni — skamba griežtai, bet veikia',
  'Ką beveik padarėte — ir kas sustabdė',
]
const CAPTION_HOOK_BY_STORY_HOOK: Partial<Record<UgcHookStyle, string>> = {
  Contrarian: '📌 Sunki tiesa:',
  Question: '📌 Priminimas:',
  'Bold claim': '📌 Daugelis to nežino:',
  'Before / after': '📌 Atkreipk dėmesį:',
  Confession: '📌 Jei jauti, kad stringi:',
  'Uncomfortable truth': '📌 Sunki tiesa:',
}

/** Reject community/social CTAs that do not match the Tavo knyga product. */
export function isBadLtCommunityCta(text: string): boolean {
  const lower = text.toLowerCase()
  return /bendruomen|prisijunk|sek mus|link in bio|nuoroda profilyje|discord|telegram|instagram profil/i.test(
    lower,
  )
}

function assertShipableStoryFull(
  slides: Array<{ title?: string; body?: string; role?: string }>,
  themeText = '',
): void {
  const failures = [...collectStoryIssues(slides, themeText), ...collectParaphraseSlideIssues(slides)]
  if (!failures.length) return
  auditWrite('04-story-gate-fail.json', { themeText, failures, slides })
  const first = failures[0]
  throw new Error(
    `Story gate failed: slide ${first.slide}${first.role ? ` (${first.role})` : ''} ${first.code}: ${first.message} | ${first.snippet}`,
  )
}

export { isSeasonFillerRepeat, seasonEchoCount, stripSeasonFiller } from './ugc-season-context.js'

export function ugcSlideRoles(count: number): string[] {
  const n = Math.max(1, Math.min(UGC_MAX_STORY_SLIDES, count))
  if (n === 1) return ['punch']
  if (n === 2) return ['hook', 'close']
  const roles = ['hook', 'context']
  roles.push(...Array(Math.max(0, n - 3)).fill('build'))
  roles.push('close')
  return roles
}

function pickOne<T>(items: readonly T[], seed: number): T {
  return items[Math.abs(seed) % items.length]
}

export function pickUgcArcAndHook(seed: number): {
  hookStyle: UgcHookStyle
  storyArc: UgcStoryArc
  arcName: string
} {
  const rawStyle = pickOne([...UGC_BATCH_SAFE_HOOK_STYLES], seed) as UgcHookStyle
  const hookStyle = normalizeBatchHookStyle(rawStyle) as UgcHookStyle
  let storyArc = pickOne([...UGC_STORY_ARCS], seed + 17)
  if (storyArc === 'Confession') storyArc = 'Question'
  return {
    hookStyle,
    storyArc,
    arcName: `${hookStyle} hook · ${storyArc}`,
  }
}

/** After a truncation or timeout, the next request is smaller. A success keeps the current size. */
export function nextChunkSize(requested: number, result: 'OK' | 'TRUNCATED_RESPONSE' | 'TIMEOUT' | 'VALIDATION_REJECTION'): number {
  if (result === 'OK') return Math.max(1, requested)
  return Math.max(1, requested - 1)
}

function batchSentenceTargets(roles: string[], _seed: number): number[] {
  // Always 2 short sentences — halves tokens vs 3–4 and speeds OpenEuroLLM a lot
  return roles.map(() => 2)
}

/**
 * Story-level auto-repair — runs after finalize, before the hard story gate:
 * 1) hook body may not echo the hook title;
 * 2) slide 2 may not pitch the solution (rewrite to problem-focused context);
 * 3) the same ≥6-word sentence may not appear on two slides.
 */
/** Debug helper — find cross-slide sentences with high token overlap (not just exact keys). */
function scanNearDuplicateSentences(
  slides: Array<{ title?: string; body?: string }>,
): Array<{ slideA: number; slideB: number; sentA: string; sentB: string; overlap: number }> {
  const entries: Array<{ slide: number; sent: string; key: string }> = []
  slides.forEach((slide, idx) => {
    for (const sent of splitSentences(`${slide.title || ''} ${slide.body || ''}`)) {
      const key = normalizeSentenceKey(sent)
      if (key.split(' ').filter(Boolean).length < 6) continue
      entries.push({ slide: idx + 1, sent: sent.slice(0, 100), key })
    }
  })
  const pairs: Array<{ slideA: number; slideB: number; sentA: string; sentB: string; overlap: number }> = []
  const priorKeys: string[] = []
  for (const entry of entries) {
    if (isNearDuplicateSentenceKey(entry.key, priorKeys)) {
      const matchKey = priorKeys.find((k) => sentenceKeyWordOverlap(entry.key, k) >= 0.85)
      const matchIdx = entries.findIndex((e) => e.key === matchKey)
      if (matchIdx >= 0) {
        pairs.push({
          slideA: entries[matchIdx].slide,
          slideB: entry.slide,
          sentA: entries[matchIdx].sent,
          sentB: entry.sent,
          overlap: Math.round(sentenceKeyWordOverlap(entry.key, entries[matchIdx].key) * 100) / 100,
        })
      }
    }
    priorKeys.push(entry.key)
  }
  return pairs
}


function classifyBatchGateError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  if (isTimeoutError(err) || isAbortError(err)) return 'timeout'
  if (isTruncatedJsonError(err) || /JSON parse|invalid JSON|empty body/i.test(message)) return 'truncated'
  if (/gibberish|bad stem|formal/i.test(message)) return 'gibberish'
  if (/duplicate|loops hook|echo/i.test(message)) return 'duplicate'
  if (/shipable|sentence|stump|question mark|gender/i.test(message)) return 'shipable'
  return 'unknown'
}

export type UgcBatchStoryResult = {
  slides: UgcStorySlide[]
  arcName: string
  hookStyle: UgcHookStyle
  storyArc: UgcStoryArc
  topic: string
  auditId?: string | null
  /** PRODUCTS_ALLOWED slugs for this post — export gate treats them as legal concrete nouns. */
  pickedProducts?: string[]
}

export async function generateUgcBatchStory(body: {
  topic: string
  themeHook: string
  themeBody: string
  slideCount: number
  cta?: string
  seed?: number
  skipWarm?: boolean
  theme?: string
  category?: string
  kind?: 'generic' | 'product'
  modeHint?: 'product_led' | 'hybrid' | 'generic'
  productHints?: string[]
  abortSignal?: AbortSignal
  onProgress?: (msg: string) => void
}): Promise<UgcBatchStoryResult> {
  const auditId = isUgcAuditActive()
    ? beginUgcAuditPost({
        theme: body.theme,
        themeHook: body.themeHook,
        themeBody: body.themeBody,
        category: body.category,
        slideCount: body.slideCount,
        seed: body.seed,
        topic: body.topic,
        model: resolveUgcOllamaModel(),
        numCtx: resolveUgcOllamaNumCtxBatch(),
        numGpu: resolveUgcOllamaNumGpu(),
      })
    : null

  return runUgcAuditPost(auditId, async () => {
    if (isChristmasGiftsNiche()) {
      watchKaleduCatalog()
      await ensureKaleduProductIndexFresh({ cacheFile: kaleduIndexCachePath() }).catch((err) => {
        auditLog('product_index_fail', { error: err instanceof Error ? err.message : String(err) })
      })
    }
    const progress = (msg: string) => {
      body.onProgress?.(msg)
      auditLog('progress', { message: msg })
    }
    try {
      const topic = body.topic.trim() || `${body.themeHook}. ${body.themeBody}`.trim()
      const slideCount = Math.max(
        UGC_MIN_STORY_SLIDES,
        Math.min(UGC_MAX_STORY_SLIDES, body.slideCount || UGC_MIN_STORY_SLIDES),
      )
      resetPostOllamaBudget(
        postOllamaBudgetForSlideCount(slideCount) + 3,
      )
      if (!body.skipWarm) {
        const layers = ugcGpuTunerBatchStart()
        progress(`Warming Ollama model… (${layers} GPU layers)`)
        auditLog('warm_start')
        await ollamaWarmModel({
          model: resolveUgcOllamaModel(),
          numGpu: resolveUgcOllamaNumGpu(),
          numCtx: resolveUgcOllamaNumCtxBatch(),
          keepAlive: resolveUgcOllamaKeepAliveActive(),
          unloadOthers: true,
        })
        auditLog('warm_done')
        progress('Ollama warm done')
      }
      const seed = body.seed ?? Math.floor(Math.random() * 1_000_000)
      const pickedCta = isChristmasGiftsNiche()
        ? pickKaleduCta(body.theme || topic, seed, body.category || '')
        : ''
      const defaultCta =
        (body.cta || '').trim() ||
        pickedCta ||
        ugcActiveCta()
      let storyMode: KaleduStoryMode = isChristmasGiftsNiche()
        ? routeKaleduStory({
            theme: body.theme || topic,
            hook: body.themeHook,
            body: body.themeBody,
            category: body.category,
            kind: body.kind,
            modeHint: body.modeHint,
            productHints: body.productHints,
          })
        : { mode: 'GENERIC', reason: null, confidence: 'LOW', intent: null, products: [] }
      if (isChristmasGiftsNiche() && storyMode.products.length === 0) {
        const ranked = rankCatalogProducts(
          `${body.theme || ''} ${body.themeHook || ''} ${body.themeBody || ''} ${topic}`,
          loadKaleduCatalog().filter((product) => product.inStock && resolveProductAssets(product.slug)),
        )
        if (ranked[0] && ranked[0].score >= 50 && !/klaidos|patarim|chaos|stres|per daug pasirink/iu.test(topic)) {
          storyMode = {
            mode: 'PRODUCT_LED',
            reason: 'product_index',
            confidence: 'HIGH',
            intent: null,
            products: [ranked[0].product],
          }
        }
      }
      const themeKind: UgcThemeKind = storyMode.mode === 'GENERIC' ? 'generic' : 'product'
      const pickedProducts = storyMode.products
      const productBrief = [formatKaleduProductBrief(pickedProducts), buildKaleduProductLedBrief(storyMode)]
        .filter(Boolean)
        .join('\n\n')
      const promptSnapshot = buildUgcAuditPromptSnapshot(true)
      auditWrite('00c-prompt-snapshot.json', promptSnapshot)
      if (isChristmasGiftsNiche()) {
        auditWrite('00a-catalog-context.json', {
          themeKind,
          pickedProducts,
          productBrief,
          storyMode: {
            mode: storyMode.mode,
            reason: storyMode.reason,
            confidence: storyMode.confidence,
            intent: storyMode.intent?.label || null,
            products: storyMode.products.map((p) => p.slug),
          },
        })
      }

      const { hookStyle, storyArc, arcName } = pickUgcArcAndHook(seed)
      const roles = ugcSlideRoles(slideCount)
      const productContract = isChristmasGiftsNiche()
        ? buildKaleduProductContract(storyMode, slideCount)
        : null
      const productDebt: string[] = [...(productContract?.requiredProductIds || [])]
      const productDebtHistory: Array<{ slide: number; productId: string | null; debtMovedTo: number | null }> = []
      const targets = batchSentenceTargets(roles, seed)
      const storyAngle = pickOne(ugcActiveStoryAngles(), seed + 3)
      const themeText = `${body.theme || ''} ${topic} ${body.themeHook} ${body.themeBody}`
      const seasonalTheme = isSeasonalUgcTheme(themeText)
      const varietyBlock = buildUgcVarietyBanBlock()

      progress(
        `Plan: ${slideCount} slides · ${arcName} · ${hookStyle} · chunk ${batchChunkSize(slideCount)}`,
      )
      auditWrite('00b-plan.json', {
        topic,
        slideCount,
        seed,
        hookStyle,
        storyArc,
        arcName,
        roles,
        targets,
        storyAngle,
        defaultCta,
        chunkSize: batchChunkSize(slideCount),
        productResolution: productContract,
        profile: currentBusinessProfile().id,
        niche: isChristmasGiftsNiche() ? 'christmas-gifts' : 'tavo-knyga',
        activeCopySkill: isChristmasGiftsNiche() ? 'UGC_KALEDU_BATCH_FAST_SKILL' : 'UGC_BATCH_FAST_SKILL',
        activeSystemPrompt: isChristmasGiftsNiche()
          ? 'UGC_KALEDU_OLLAMA_BATCH_SYSTEM_PROMPT'
          : 'UGC_OLLAMA_BATCH_SYSTEM_PROMPT',
        path: 'batch',
        nativeRewriteSystem: isChristmasGiftsNiche()
          ? 'UGC_KALEDU_NATIVE_REWRITE_SYSTEM'
          : 'UGC_LT_NATIVE_REWRITE_SYSTEM',
        fallbackBank: isChristmasGiftsNiche() ? 'UGC_KALEDU_FALLBACK' : 'UGC_FALLBACK',
        hookOpenerBank: isChristmasGiftsNiche() ? 'KALEDU_HOOK_BODY_OPENERS' : 'HOOK_BODY_DEFAULT_OPENERS',
      })

      const priorRaw: Array<{ role: string; text: string }> = []
      const allSlides: UgcStorySlide[] = []
      const ltState: NormalizeLtCopyState = { mesOpenerCount: 0 }
      const chunkTrace: unknown[] = []
      let rescuedSlides = 0
      let arcRepairCount = 0
      let arcUnresolved: string[] = []
      let generationCalls = 0
      let generationMs = 0
      let productRepairCalls = 0
      resetModelCallLog()
      const perfStarted = Date.now()

      let chunkSize = batchChunkSize(slideCount)
      let start = 0
      while (start < slideCount) {
        if (body.abortSignal?.aborted) throw new Error('Batch aborted')
        let chunkRoles = roles.slice(start, start + chunkSize)
        let chunkTargets = targets.slice(start, start + chunkSize)
        let requestSize = chunkRoles.length
        const plannedRequestSize = chunkRoles.length
        let chunkSlides: UgcStorySlide[] = []
        let lastChunkError: Error | null = null
        let lastQualityAttempts = 2
        let timeoutShrinkUsed = false
        const chunkAttempts: unknown[] = []

        while (requestSize >= 1 && !chunkSlides.length) {
          chunkRoles = roles.slice(start, start + requestSize)
          chunkTargets = targets.slice(start, start + requestSize)
          const prompt = buildBatchStoryPrompt({
            topic,
            themeHook: body.themeHook,
            themeBody: body.themeBody,
            slideCount,
            hookStyle,
            storyArc,
            defaultCta,
            storyAngle,
            priorSlides: priorRaw,
            slideStart: start + 1,
            chunkRoles,
            chunkTargets,
            lite: true,
            varietyBlock,
            productBrief,
            productResolutionBlock: productContract
              ? productResolutionPromptLines({
                  slideStart: start + 1,
                  roles: chunkRoles,
                  slots: productContract.productResolutionPlan,
                  debt: productDebt,
                  products: pickedProducts,
                })
              : '',
          })
          const temp = 0.4 + (seed % 25) / 1000
          lastChunkError = null
          // Keep attempts low — programmatic rescue on the final attempt fixes bad
          // slides for free, so extra LLM retries only burn time.
          const qualityAttempts = 1
          lastQualityAttempts = qualityAttempts
          for (let attempt = 0; attempt < qualityAttempts; attempt++) {
            if (body.abortSignal?.aborted) throw new Error('Batch aborted')
            // A timed-out call is never re-sent at the same size — shrink or fall back instead.
            if (attempt > 0 && isTimeoutError(lastChunkError)) break
            try {
              let chunkPrompt = prompt
              if (attempt > 0) {
                chunkPrompt += `\n\nRETRY ${attempt}: ${lastChunkError?.message}. Perrašyk TIKRAIS lt-LT — pilnas JSON {"slides":[...]}, 1–2 sakiniai. Nauja mintis, nekartok ankstesnių skaidrių.`
              }
              progress(
                `Quality attempt ${attempt + 1}/${qualityAttempts} · model call 1/1 · slides ${start + 1}–${start + requestSize} (${chunkRoles.join('+')})`,
              )
              auditLog('chunk_attempt', {
                start: start + 1,
                requestSize,
                attempt,
                roles: chunkRoles,
                temp,
                promptChars: chunkPrompt.length,
              })
              const callStarted = Date.now()
              const items = await generateBatchChunk(
                chunkPrompt,
                chunkRoles,
                temp,
                isTruncatedJsonError(lastChunkError) ? 240 : 0,
                body.abortSignal,
                start + 1,
              )
              generationCalls += 1
              generationMs += Date.now() - callStarted
              auditWrite(`03-raw-items-s${start + 1}.json`, { items, roles: chunkRoles })
              const gotRoles = chunkRoles.slice(0, items.length)
              const gotTargets = chunkTargets.slice(0, items.length)
              const built = slidesFromItems(
                items,
                gotRoles,
                gotTargets,
                topic,
                defaultCta,
                priorRaw,
                ltState,
                hookStyle,
                start + 1,
                attempt === qualityAttempts - 1,
                seasonalTheme,
                { hook: body.themeHook, body: body.themeBody },
              )
              if (!built.slides.length) {
                throw new Error(
                  items.emptyRows[0]?.message ||
                    `Slide ${start + 1} (${gotRoles[0] || 'build'}) produced no accepted slide`,
                )
              }
              chunkSlides = built.slides
              if (productContract && isChristmasGiftsNiche()) {
                const stamped = applyReservedProductResolution(
                  chunkSlides,
                  start,
                  productContract.productResolutionPlan,
                  pickedProducts,
                  productDebt,
                )
                chunkSlides = stamped.slides
                productDebt.splice(0, productDebt.length, ...stamped.debt)
                productDebtHistory.push(...stamped.events)
              }
              if (isChristmasGiftsNiche() && chunkSlides.some((slide) => findRegisterErrors(`${slide.title} ${slide.body}`).length)) {
                throw new Error('register_violation')
              }
              if (items.resultType === 'TRUNCATED_RESPONSE') {
                const telemetry = chunkResultTelemetry({
                  requested: requestSize,
                  parsed: items.parsedCount,
                  built: chunkSlides.length,
                  durationMs: Date.now() - callStarted,
                  numPredict: batchNumPredict(requestSize),
                  truncated: true,
                })
                recordModelCall(telemetry)
                auditLog('chunk_truncated', telemetry)
              } else {
                recordModelCall(
                  chunkResultTelemetry({
                    requested: requestSize,
                    parsed: items.parsedCount,
                    built: chunkSlides.length,
                    durationMs: Date.now() - callStarted,
                    numPredict: batchNumPredict(requestSize),
                    truncated: false,
                  }),
                )
              }
              if (requestSize < plannedRequestSize) rescuedSlides += chunkSlides.length
              chunkAttempts.push({
                requestSize,
                attempt,
                ok: true,
                got: chunkSlides.length,
                processed: built.processed,
              })
              progress(
                `Chunk @${start + 1} requested=${requestSize} parsed=${items.parsedCount} built=${chunkSlides.length} advance=${chunkSlides.length} result=${items.resultType} quality ${attempt + 1}/2`,
              )
              break
            } catch (err) {
              lastChunkError = err instanceof Error ? err : new Error(String(err))
              chunkAttempts.push({
                requestSize,
                attempt,
                ok: false,
                error: lastChunkError.message,
              })
              progress(
                `Chunk fail @${start + 1}: ${lastChunkError.message.slice(0, 120)}`,
              )
              auditLog('chunk_fail', {
                start: start + 1,
                requestSize,
                attempt,
                error: lastChunkError.message,
                gate: classifyBatchGateError(lastChunkError),
                slideGlobal: Number(lastChunkError.message.match(/Slide\s+(\d+)/i)?.[1]) || start + 1,
                role: lastChunkError.message.match(/\((hook|context|build|close|punch)\)/i)?.[1] || chunkRoles[0],
                snippet: lastChunkError.message.split('|').at(-1)?.trim().slice(0, 140) || '',
                autoFixAttempted: attempt > 0,
              })
            }
          }
          const timedOut = isTimeoutError(lastChunkError)
          const canShrink =
            !chunkSlides.length &&
            requestSize > 1 &&
            !isPostOllamaBudgetExhausted() &&
            (!timedOut || !timeoutShrinkUsed)
          if (canShrink) {
            if (timedOut) timeoutShrinkUsed = true
            requestSize = Math.max(1, Math.ceil(requestSize / 2))
            progress(`Shrinking chunk → ${requestSize} slide(s)${timedOut ? ' after timeout' : ''}`)
            auditLog('chunk_shrink', {
              newRequestSize: requestSize,
              gate: classifyBatchGateError(lastChunkError),
            })
            continue
          }
          break
        }

        chunkTrace.push({ start: start + 1, attempts: chunkAttempts, slides: chunkSlides })

        if (!chunkSlides.length) {
          // A dead chunk used to kill the whole post (~26% loss rate). Ship deterministic
          // copy for the failed roles instead and record it as a rescue.
          const failedRoles = roles.slice(start, start + plannedRequestSize)
          progress(`Programmatic fallback for slides ${start + 1}+ (${failedRoles.join('+')})`)
          chunkSlides = buildFallbackChunkSlides({
            roles: failedRoles,
            slideStart: start + 1,
            topic,
            themeHook: body.themeHook,
            themeBody: body.themeBody,
            defaultCta,
            prior: priorRaw,
          })
          rescuedSlides += chunkSlides.length
          auditLog('chunk_programmatic_fallback', {
            start: start + 1,
            roles: failedRoles,
            error: batchChunkError(lastChunkError, chunkRoles, lastQualityAttempts).message,
          })
        }
        for (const s of chunkSlides) {
          priorRaw.push({
            role: s.role || 'build',
            text: [s.title, s.body].filter(Boolean).join('\n'),
          })
        }
        allSlides.push(...chunkSlides)
        start += chunkSlides.length
        const chunkResult = chunkSlides.length < requestSize ? 'TRUNCATED_RESPONSE' : 'OK'
        chunkSize = nextChunkSize(requestSize, lastChunkError && isTimeoutError(lastChunkError) ? 'TIMEOUT' : chunkResult)
      }

      if (allSlides.length < UGC_MIN_STORY_SLIDES) {
        throw new Error(
          `Too few unique slides after near-dup drops (${allSlides.length}/${UGC_MIN_STORY_SLIDES})`,
        )
      }

      progress(`Finalize + repair (${allSlides.length} slides)…`)
      auditWrite('03-chunks.json', chunkTrace)
      auditWrite('05-normalized-before-finalize.json', allSlides)
      const preRepair = finalizeBatchSlides(allSlides, defaultCta)
      void collectStoryIssues(preRepair, themeText)
      void scanNearDuplicateSentences(preRepair)
      const repairOpts = { themeHook: body.themeHook, themeBody: body.themeBody }
      const repaired = repairStoryOrderAndRepeats(preRepair, themeText, repairOpts)
      const { slides: qaSlides, qa } = await qaPolishBatchSlides(
        repaired,
        themeText,
        defaultCta,
        body.abortSignal,
        progress,
      )
      if (!qa.ok) {
        throw new Error(`Lithuanian semantic QA blocked export: ${qa.error || 'unresolved issue'}`)
      }
      const qaLtState: NormalizeLtCopyState = { mesOpenerCount: 0 }
      const qaNormalized = qaSlides.map((slide) => ({
        ...slide,
        title: normalizeLtUgcMultiline(slide.title, qaLtState),
        body: normalizeLtUgcMultiline(slide.body, qaLtState),
      }))
      const finalized = repairStoryOrderAndRepeats(qaNormalized, themeText, repairOpts)
      let nativeSlides = finalized
      let native: KaleduNativeRewriteMeta = emptyKaleduNativeMeta()
      if (isChristmasGiftsNiche()) {
        const kaleduFallback = makeKaleduSlideFallback({
          themeHook: body.themeHook,
          themeBody: body.themeBody,
          topic: `${body.theme || topic} ${body.themeHook}`,
          allowed: pickedProducts,
          getStoryMode: () => storyMode,
        })
        const debtRepair = repairProductDebt(finalized, storyMode, pickedProducts, productDebt, seed, themeText)
        productRepairCalls += debtRepair.attempts
        productDebt.splice(0, productDebt.length, ...debtRepair.remainingDebt)
        const rewritten = await rewriteKaleduSlidesNative(debtRepair.slides, {
          theme: body.theme || topic,
          category: body.category,
          defaultCta,
          seed,
          products: pickedProducts,
          signal: body.abortSignal,
          onProgress: progress,
          fallbackFor: kaleduFallback,
        })
        nativeSlides = rewritten.slides
        native = rewritten.native
      } else {
        const tavoFallback: KaleduSlideFallback = (index, rows) => {
          const slide = rows[index]
          const role =
            slide.role || (index === 0 ? 'hook' : index === rows.length - 1 ? 'close' : 'build')
          const others = rows
            .filter((_, j) => j !== index)
            .map((s) => ({ title: s.title, body: s.body }))
          if (role === 'hook') return buildFallbackHook(body.themeHook, body.themeBody)
          if (role === 'close' || role === 'punch') {
            return { title: '', body: buildFallbackCloseBody(topic, others) }
          }
          return {
            title: '',
            body: buildFallbackSupportBody(role, others, `${topic} ${body.themeHook}`, index),
          }
        }
        const rewritten = await rewriteTavoSlidesNative(finalized, {
          theme: body.theme || topic,
          defaultCta,
          signal: body.abortSignal,
          onProgress: progress,
          fallbackFor: tavoFallback,
        })
        nativeSlides = rewritten.slides
        native = rewritten.native
      }
      const attached = isChristmasGiftsNiche()
        ? attachKaleduSlideProducts(nativeSlides, pickedProducts, {
            theme: body.theme || topic,
            category: body.category,
            kind: themeKind,
          })
        : nativeSlides
      const withProducts = isChristmasGiftsNiche() ? [...attached] : attached
      if (isChristmasGiftsNiche()) {
        const kaleduFallback = makeKaleduSlideFallback({
          themeHook: body.themeHook,
          themeBody: body.themeBody,
          topic: `${body.theme || topic} ${body.themeHook}`,
          allowed: pickedProducts,
          getStoryMode: () => storyMode,
        })
        for (let i = 0; i < withProducts.length; i++) {
          const slide = withProducts[i]
          const blob = `${slide.title} ${slide.body} ${slide.cta || ''}`
          if (UGC_KALEDU_DIET_LEAK_RE.test(blob)) {
            const fb = kaleduFallback(i, withProducts, 'contamination')
            if (fb) {
              withProducts[i] = { ...slide, ...fb, productId: undefined, showProductPrice: false }
              auditFallback({ slide: i + 1, role: slide.role, reason: 'contamination', text: `${fb.title} ${fb.body}`.trim() })
            }
          }
          const priorText = withProducts
            .filter((_, j) => j !== i)
            .map((s) => `${s.title} ${s.body}`)
            .join(' ')
          const enforced = enforceKaleduProductSlide(withProducts[i], { priorText })
          if (enforced.productId !== withProducts[i].productId) {
            auditLog('product_slide_downgraded', {
              slide: i + 1,
              productId: withProducts[i].productId || null,
              body: enforced.body,
            })
          }
          withProducts[i] = enforced
        }
      }
      if (isChristmasGiftsNiche()) {
        const shipCtx = { theme: body.theme || topic, allowed: pickedProducts }
        const gateRepairs: KaleduStoryGateRepair[] = []
        const qaRepairs: KaleduStoryGateRepair[] = []
        const productLedRepairs: KaleduStoryGateRepair[] = []
        let shipQa: ReturnType<typeof finalKaleduShipQa> = {
          slides: withProducts,
          repairs: [],
          remaining: [],
          semanticHits: 0,
          semanticSentences: 0,
          semanticRepairGroups: 0,
        }
        for (let round = 0; round < 3; round++) {
          const led = repairKaleduProductLed(withProducts, storyMode, pickedProducts, seed + round, themeText)
          withProducts.splice(0, withProducts.length, ...led.slides)
          storyMode = led.mode
          shipQa = finalKaleduShipQa(withProducts, shipCtx, makeKaleduSlideFallback({
            themeHook: body.themeHook,
            themeBody: body.themeBody,
            topic: `${body.theme || topic} ${body.themeHook}`,
            allowed: pickedProducts,
            getStoryMode: () => storyMode,
          }))
          withProducts.splice(0, withProducts.length, ...shipQa.slides)
          const gate = repairKaleduStoryGate(
            withProducts,
            themeText,
            makeKaleduSlideFallback({
              themeHook: body.themeHook,
              themeBody: body.themeBody,
              topic: `${body.theme || topic} ${body.themeHook}`,
              allowed: pickedProducts,
              getStoryMode: () => storyMode,
            }),
            pickedProducts,
          )
          withProducts.splice(0, withProducts.length, ...gate.slides)
          // Story arc: slides 3+ may not restart the hook, re-ask, or repeat an idea/product.
          const arc = repairKaleduArc(withProducts, makeKaleduSlideFallback({
            themeHook: body.themeHook,
            themeBody: body.themeBody,
            topic: `${body.theme || topic} ${body.themeHook}`,
            allowed: pickedProducts,
            getStoryMode: () => storyMode,
          }), `gate-${round + 1}`, themeText)
          withProducts.splice(0, withProducts.length, ...arc.slides)
          arcRepairCount += arc.repairs.length
          productLedRepairs.push(...led.repairs)
          productRepairCalls += led.repairs.length
          qaRepairs.push(...shipQa.repairs)
          gateRepairs.push(...gate.repairs, ...arc.repairs)
          if (!shipQa.remaining.length && !gate.repairs.length && !led.repairs.length && !arc.repairs.length) break
        }
        const remaining = kaleduDeterministicQa(withProducts, shipCtx).filter((flag) => !isSpellNoteOnly(flag))
        const productLedLeft = kaleduProductLedIssues(withProducts, storyMode)
        productDebt.splice(0, productDebt.length, ...updateProductDebt(productContract?.requiredProductIds || [], withProducts, pickedProducts))
        if (gateRepairs.length || qaRepairs.length || productLedRepairs.length) {
          progress(
            `Final QA + story repair (${gateRepairs.length + qaRepairs.length + productLedRepairs.length} slide fix(es))…`,
          )
        }
        auditWrite('04b-story-gate-repair.json', gateRepairs)
        auditWrite('04c-product-led.json', {
          mode: storyMode.mode,
          reason: storyMode.reason,
          confidence: storyMode.confidence,
          intent: storyMode.intent?.label || null,
          products: storyMode.products.map((p) => p.slug),
          repairs: productLedRepairs,
          remaining: productLedLeft,
          required: productContract?.requiredProductIds || [],
          debt: productDebt,
          debtHistory: productDebtHistory,
        })
        auditWrite('05e-final-ship-qa.json', {
          repairs: qaRepairs,
          remaining,
          semanticHits: shipQa.semanticHits,
          semanticSentences: shipQa.semanticSentences,
          semanticRepairGroups: shipQa.semanticRepairGroups,
          slides: withProducts,
        })
        recordKaleduProductUsage(
          [...new Set(withProducts.map((s) => s.productId).filter((id): id is string => Boolean(id)))],
        )
        for (const [kind, rows] of [
          ['product_led', productLedRepairs],
          ['story_gate', gateRepairs],
          ['final_ship_qa', qaRepairs],
        ] as const) {
          for (const repair of rows) {
            auditFallback({
              slide: repair.slide,
              role: withProducts[repair.slide - 1]?.role,
              reason: `${kind}:${repair.code}`,
              text: repair.after,
            })
          }
        }
        if (remaining.length) {
          const first = remaining[0]
          throw new Error(`Final Christmas QA failed: slide ${first.index + 1} ${first.details.join('; ')}`)
        }
        // A context slide that wandered off the product habit is a style issue — log it, keep the post.
        for (const issue of productLedLeft.filter((i) => i.code === 'product_theme_drift')) auditLog('product_theme_drift_kept', issue)
        if (productLedLeft.some((i) => i.code === 'missing_product_resolution')) {
          throw new Error(
            `Product-led story gate failed: ${productLedLeft.map((i) => `${i.code}${i.slide ? ` slide ${i.slide}` : ''}`).join(', ')}`,
          )
        }
        for (let i = 0; i < withProducts.length; i++) {
          const missingQ = findMissingQuestionMarks(`${withProducts[i].title || ''} ${withProducts[i].body || ''}`)
          if (missingQ.some((row) => row.kind === 'rhetorical')) {
            auditLog('rhetorical_question_missing_question_mark', {
              slide: i + 1,
              sentences: missingQ.filter((row) => row.kind === 'rhetorical').map((row) => row.sentence),
            })
          }
          const titleQ = normalizeDirectQuestionPunctuation(withProducts[i].title || '')
          const product = [...storyMode.products, ...pickedProducts].find(
            (p) => p.slug === withProducts[i].productId || p.productId === withProducts[i].productId,
          )
          const scene = repairProductSceneContinuity(withProducts[i].body || '', `${body.theme || ''} ${topic} ${body.themeHook || ''}`)
          const bodyQ = repairUgcQuestionAndCollocation(
            scene.text,
            withProducts[i].role || '',
            `${product?.name || ''} ${product?.sku || ''} ${product?.slug || ''}`,
          )
          const card = classifyCardPunctuation({
            title: titleQ.text,
            body: bodyQ,
            slideRole: withProducts[i].role,
          })
          if (card.kind === 'rhetorical_continuation' && card.changed) {
            auditLog('ugc-copy-qa', {
              profile: 'kaledu',
              slide: i + 1,
              reason: 'rhetorical_continuation',
              original: bodyQ,
              replacement: card.body,
              attempt: 1,
            })
          }
          if (card.merges) {
            auditLog('ugc-copy-qa', {
              profile: 'kaledu',
              slide: i + 1,
              reason: 'orphan_comparison_fragment',
              original: bodyQ,
              replacement: card.body,
              attempt: 1,
            })
          }
          const repaired = repairKaleduProductConsistency(
            { ...withProducts[i], title: card.title, body: card.body },
            storyMode.products.length ? storyMode.products : pickedProducts,
          )
          withProducts[i] = repaired.slide
          if (repaired.code === 'product_reference_without_product') {
            // The generic "Net maža, apgalvota dovana…" line is a poor hook or context —
            // use the role's own validated fallback instead.
            const role = withProducts[i].role || (i === 0 ? 'hook' : i === withProducts.length - 1 ? 'close' : 'build')
            const fb = makeKaleduSlideFallback({
              themeHook: body.themeHook,
              themeBody: body.themeBody,
              topic: `${body.theme || topic} ${body.themeHook}`,
              allowed: pickedProducts,
              getStoryMode: () => storyMode,
            })(i, withProducts, 'product_reference_without_product')
            if (fb) {
              withProducts[i] = { ...withProducts[i], title: role === 'hook' ? fb.title : '', body: fb.body }
              auditFallback({ slide: i + 1, role, reason: 'product_reference_without_product', text: `${fb.title} ${fb.body}`.trim() })
            }
          }
        }
        for (let i = 0; i < withProducts.length; i++) {
          const slide = withProducts[i]
          withProducts[i] = {
            ...slide,
            title: demoteProductTypeCapitals(stripProductIdTags(slide.title || '')),
            body: demoteProductTypeCapitals(stripProductIdTags(slide.body || '')),
          }
        }
        // Product slide contract: productId only where the copy names the product, and a named
        // product always says why it fits (not a bare „Gali rinktis X.“).
        const contract = enforceProductSlideContract(withProducts, storyMode.products.length ? storyMode.products : pickedProducts)
        withProducts.splice(0, withProducts.length, ...contract.slides)
        for (const repair of contract.repairs) auditLog('product_slide_contract', repair)
        if (contract.repairs.some((r) => r.code === 'product_id_without_product_copy')) {
          const led = repairKaleduProductLed(withProducts, storyMode, pickedProducts, seed + 7, themeText)
          withProducts.splice(0, withProducts.length, ...led.slides)
          for (const repair of led.repairs) {
            auditLog('product_slide_contract', repair)
            auditFallback({ slide: repair.slide, role: withProducts[repair.slide - 1]?.role, reason: `product_contract:${repair.code}`, text: repair.after })
          }
        }
        // Punctuation repair above can turn a statement into a question — re-check the arc.
        const finalArc = repairKaleduArc(withProducts, makeKaleduSlideFallback({
          themeHook: body.themeHook,
          themeBody: body.themeBody,
          topic: `${body.theme || topic} ${body.themeHook}`,
          allowed: pickedProducts,
          getStoryMode: () => storyMode,
        }), 'final', themeText)
        withProducts.splice(0, withProducts.length, ...finalArc.slides)
        arcRepairCount += finalArc.repairs.length
        for (const repair of finalArc.repairs) {
          auditFallback({ slide: repair.slide, role: withProducts[repair.slide - 1]?.role, reason: `final_arc:${repair.code}`, text: repair.after })
        }
        // Late fallback swaps can collide with another slide — one more story-gate pass so a
        // paraphrase never kills the whole post at the hard gate below.
        const lateGate = repairKaleduStoryGate(withProducts, themeText, makeKaleduSlideFallback({
          themeHook: body.themeHook,
          themeBody: body.themeBody,
          topic: `${body.theme || topic} ${body.themeHook}`,
          allowed: pickedProducts,
          getStoryMode: () => storyMode,
        }), pickedProducts)
        withProducts.splice(0, withProducts.length, ...lateGate.slides)
        for (const repair of lateGate.repairs) {
          auditLog('late_story_gate_repair', repair)
          auditFallback({ slide: repair.slide, role: withProducts[repair.slide - 1]?.role, reason: `late_story_gate:${repair.code}`, text: repair.after })
        }
        arcUnresolved = finalArc.unresolved.map((issue) => `slide ${issue.slide} ${issue.code}`)
        const ctaPick = pickStoryAwareKaleduCta({
          theme: body.theme || topic,
          category: body.category,
          slides: withProducts,
          products: storyMode.products.length ? storyMode.products : pickedProducts,
          mode: storyMode.mode,
          seed,
        })
        for (let i = 0; i < withProducts.length; i++) {
          const isClose = withProducts[i].role === 'close' || i === withProducts.length - 1
          withProducts[i] = { ...withProducts[i], cta: isClose ? ctaPick.cta : '' }
        }
        auditWrite('04d-cta.json', ctaPick)
        const payoff = applyWarmPayoffPunctuation(withProducts)
        const emphatic = applyEmphaticPayoffPunctuation(payoff.slides)
        auditWrite('04f-warm-payoff.json', { warm: payoff.repairs, emphatic: emphatic.repairs })
        for (const repair of payoff.repairs) auditLog('warm_payoff_punctuation', repair)
        // Brand voice: about two Apple emojis per post — topped up only here, after every
        // text check, so an added emoji can never trigger a slide repair.
        const budgetedEmoji = topUpKaleduEmoji(normalizeKaleduEmojiBudget(emphatic.slides))
        withProducts.splice(0, withProducts.length, ...budgetedEmoji)
        if (
          storyMode.mode === 'PRODUCT_LED' &&
          !withProducts.some((s) => s.productId && resolveProductAssets(s.productId))
        ) {
          throw new Error('MISSING_PRODUCT_VISUAL_RESOLUTION')
        }
      }
      void collectStoryIssues(withProducts, themeText)
      void scanNearDuplicateSentences(withProducts)
      if (isChristmasGiftsNiche()) {
        const visuals = assignSlideVisuals(withProducts, {
          postSeed: String(seed),
          visualsFor: resolveProductVisuals,
          quiet: true,
        })
        withProducts.splice(0, withProducts.length, ...visuals.slides)
        const productVisualFailures = withProducts.flatMap((slide) => {
          if (!slide.productId) return []
          const visuals = resolveProductVisuals(slide.productId)
          const check = checkProductVisual({
            slideRole: slide.role,
            productId: slide.productId,
            visualReady: visuals.length > 0,
            productFound: visuals.length > 0,
            imageSrc: slide.productImageSrc,
            rendered: Boolean(slide.productImageSrc),
            copyProductId: slide.productId,
            visualProductId: slide.productImageSrc ? slide.productId : undefined,
          })
          return check.reason ? [check] : []
        })
        if (productVisualFailures.length) {
          auditLog('product_visual_missing', { failures: productVisualFailures })
          const first = productVisualFailures[0]
          throw new Error(`product_visual_missing ${first.cause} productId=${first.productId}`)
        }
        auditWrite('04e-product-visuals.json', {
          avoidableVisualRepeats: visuals.avoidableVisualRepeats,
          unavoidableVisualRepeats: visuals.unavoidableVisualRepeats,
          picks: visuals.picks,
          productVisualMissingFailures: productVisualFailures.length,
        })
      }
      progress('Shipable gate (structural)…')
      if (isChristmasGiftsNiche()) {
        // Last resort before the hard gate: a failing non-hook slide becomes a validated stock
        // line (keeping the only product slide of a product-led post). Losing the whole post
        // over one slide is worse than one plain line.
        const lastResort = makeKaleduSlideFallback({
          themeHook: body.themeHook,
          themeBody: body.themeBody,
          topic: `${body.theme || topic} ${body.themeHook}`,
          allowed: pickedProducts,
          getStoryMode: () => storyMode,
        })
        for (let attempt = 0; attempt < 3; attempt++) {
          const failures = [...collectStoryIssues(withProducts, themeText), ...collectParaphraseSlideIssues(withProducts)]
          const target = failures.map((f) => f.slide - 1).find((i) => i > 0 && i < withProducts.length)
          if (target == null) break
          const productSlides = withProducts.filter((s) => s.productId).length
          const keepProduct = Boolean(withProducts[target].productId) && productSlides === 1
          const base = keepProduct
            ? withProducts[target]
            : { ...withProducts[target], productId: undefined, productImageSrc: undefined, productVariantId: undefined, showProductPrice: false }
          const work = withProducts.map((s, j) => (j === target ? base : s))
          const fb = lastResort(target, work, 'last_resort')
          if (!fb) break
          withProducts[target] = { ...base, title: '', body: fb.body }
          auditFallback({ slide: target + 1, role: base.role, reason: `last_resort:${failures[0].code}`, text: fb.body })
        }
      }
      assertShipableStoryFull(withProducts, themeText)
      const perf = summarizeModelCalls()
      console.log(
        `[Perf] storyGenerationCalls=${perf.storyGenerationCalls} storyRepairCalls=${perf.storyRepairCalls} productRepairCalls=${productRepairCalls} finalQaJudgeCalls=${perf.finalQaJudgeCalls} finalQaRewriteCalls=${perf.finalQaRewriteCalls} finalQaRejudgeCalls=${perf.finalQaRejudgeCalls} qaCalls=${perf.qaCalls} totalModelCalls=${perf.totalModelCalls} generationMs=${generationMs} totalMs=${Date.now() - perfStarted}`,
      )
      progress(`Story ready — ${withProducts.length} slides · QA ${qa.provider}${qa.error ? ` (${qa.error})` : ''}`)
      recordUgcVarietyEntry({
        theme: body.theme || topic,
        hookTitle: withProducts.find((s) => s.role === 'hook')?.title || withProducts[0]?.title || '',
        slideTexts: withProducts.map((s) => [s.title, s.body].filter(Boolean).join(' ')),
        slideBodies: withProducts.map((s) => s.body || '').filter(Boolean),
      })
      const result: UgcBatchStoryResult = {
        slides: withProducts,
        arcName,
        hookStyle,
        storyArc,
        topic,
        auditId,
        pickedProducts: pickedProducts.map((p) => p.slug),
      }
      finalizeUgcAuditPost({
        ok: true,
        slides: withProducts,
        arcName,
        hookStyle,
        storyArc,
        topic,
        extra: {
          theme: body.theme,
          themeHook: body.themeHook,
          category: body.category,
          rescuedSlides,
          arcRepairs: arcRepairCount,
          arcUnresolved,
          qaProvider: qa.provider,
          qaModel: qa.model,
          qaOk: qa.ok,
          nativeRewrite: native,
          promptSnapshot,
          products: isChristmasGiftsNiche()
            ? { themeKind, pickedProducts, productBrief }
            : undefined,
        },
      })
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const stack = err instanceof Error ? err.stack : undefined
      finalizeUgcAuditPost({
        ok: false,
        error: message,
        errorStack: stack,
        extra: { theme: body.theme, themeHook: body.themeHook },
      })
      throw err
    }
  })
}

export function pickCaptionHook(hookStyle: UgcHookStyle, seed: number): string {
  const mapped = CAPTION_HOOK_BY_STORY_HOOK[hookStyle]
  if (mapped) return mapped
  return pickOne([...UGC_LT_CAPTION_HOOKS], seed)
}
