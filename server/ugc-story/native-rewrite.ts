/** Native-Lithuanian rewrite passes for Kalėdų and Tavo Knyga slides. (Split out of ugc-story-engine.ts.) */

import { extractJsonObject } from '../json-extract.js'
import { ollamaGenerateJson, type OllamaCallType } from '../ollama-client.js'
import { isChristmasGiftsNiche } from '../profile-brand.js'
import {
    auditFallback,
    auditLog,
    auditWrite
} from '../ugc-batch-audit.js'
import {
    UGC_KALEDU_NATIVE_REWRITE_SYSTEM,
    UGC_LT_NATIVE_REWRITE_SYSTEM
} from '../ugc-copy-skill.js'
import { finalizeCloseSlideCta, ugcActiveCta } from '../ugc-cta-normalize.js'
import { resolveUgcOllamaKeepAliveActive, resolveUgcOllamaModel, resolveUgcOllamaNumCtxBatch, resolveUgcOllamaNumGpu } from '../ugc-env-bridge.js'
import {
    demoteProductTypeCapitals,
    kaleduInventedProductMentions,
    productTypePhrase,
    repairInventedProductCopy,
    type KaleduCatalogProduct
} from '../ugc-kaledu-catalog.js'
import { normalizeKaleduEmojiBudget } from '../ugc-kaledu-emoji.js'
import {
    buildKaleduQaJudgePrompt,
    countKaleduQaCategories,
    isSpellNoteOnly,
    KALEDU_QA_JUDGE_SYSTEM,
    kaleduDeterministicQa,
    kaleduRewriteHints,
    mergeKaleduQaFlags,
    parseCombinedKaleduQa,
    parseKaleduQaJudge,
    UGC_LT_QA_JUDGE_SYSTEM,
    type KaleduQaFlag
} from '../ugc-kaledu-final-qa.js'
import {
    applyKaleduNativeRepairs,
    applyKaleduRewrittenFields,
    attachKaleduCloseCta,
    detectKaleduNativeIssues,
    emptyKaleduNativeMeta,
    isBadArColonHook,
    kaleduHookTitleIssues,
    repairKaleduHookTitle,
    rewriteIntroducesUnsupportedProductClaims,
    stripKaleduCtaLeak,
    type KaleduNativeRewriteMeta,
    type KaleduNativeSlideAudit,
    type KaleduRewrittenFields,
} from '../ugc-kaledu-native.js'
import {
    recordModelCall,
    validateRewrittenSlide
} from '../ugc-kaledu-rewrite-gate.js'
import {
    normalizeLtUgcMultiline,
    type NormalizeLtCopyState
} from '../ugc-lt-normalize.js'
import { stripProductIdTags } from '../ugc-lt/normalize-copy.js'
import { checkLtSpelling, ensureLtSpeller, isLtSpellerReady, repairUnambiguousLtTypos } from '../ugc-lt-spellcheck.js'
import { applySemanticContextRepairs, type KaleduSlideFallback } from './kaledu-gates.js'
import { consumePostOllamaCall } from './ollama-budget.js'
import { type UgcStorySlide } from './text.js'

export function parseKaleduRewritePatches(raw: unknown, count: number): KaleduRewrittenFields[] {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const rows = Array.isArray(obj.slides) ? obj.slides : Array.isArray(raw) ? raw : []
  const out: KaleduRewrittenFields[] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const rec = row as { i?: unknown; title?: unknown; body?: unknown }
    const i = Number(rec.i)
    if (!Number.isInteger(i) || i < 0 || i >= count) continue
    out.push({
      i,
      title: typeof rec.title === 'string' ? rec.title : undefined,
      body: typeof rec.body === 'string' ? rec.body : undefined,
    })
  }
  return out
}

export type KaleduLlmCall = (
  prompt: string,
  opts: { system: string; numPredict: number; callType: OllamaCallType; temperature: number; timeoutMs: number },
) => Promise<string | null>

export const KALEDU_QA_JUDGE_TIMEOUT_MS = 45_000

export const KALEDU_QA_REWRITE_TIMEOUT_MS = 75_000

export function defaultKaleduLlm(signal?: AbortSignal): KaleduLlmCall {
  return async (prompt, o) => {
    if (!consumePostOllamaCall()) return null
    const started = Date.now()
    try {
      const raw = await ollamaGenerateJson(prompt, {
        temperature: o.temperature,
        model: resolveUgcOllamaModel(),
        system: o.system,
        useJsonFormat: true,
        numPredict: o.numPredict,
        numCtx: resolveUgcOllamaNumCtxBatch(),
        numGpu: resolveUgcOllamaNumGpu(),
        keepAlive: resolveUgcOllamaKeepAliveActive(),
        timeoutMs: o.timeoutMs,
        signal,
        callType: o.callType,
        timeFit: true,
      })
      recordModelCall({
        callType: o.callType,
        durationMs: Date.now() - started,
        success: raw != null,
        numPredict: o.numPredict,
        stopReason: raw == null ? 'empty' : 'stop',
      })
      return raw
    } catch (err) {
      recordModelCall({
        callType: o.callType,
        durationMs: Date.now() - started,
        success: false,
        numPredict: o.numPredict,
        stopReason: err instanceof Error && /timeout/i.test(err.message) ? 'timeout' : 'unknown',
      })
      throw err
    }
  }
}

export type KaleduQaRound = {
  round: number
  deterministic: KaleduQaFlag[]
  judge: KaleduQaFlag[]
  judgeRan: boolean
  merged: KaleduQaFlag[]
}

/**
 * Christmas language pass: mechanical repairs → final QA (deterministic + compact judge)
 * → ONE rewrite of flagged slides → re-QA → deterministic product repair → validated fallback.
 * Structured fields (productId, role, CTA, price) are never handed to the model.
 */
export async function rewriteKaleduSlidesNative(
  slides: UgcStorySlide[],
  opts: {
    theme: string
    category?: string
    defaultCta: string
    seed?: number
    products?: KaleduCatalogProduct[]
    signal?: AbortSignal
    onProgress?: (msg: string) => void
    /** Inject for tests; null disables every LLM call (deterministic path only). */
    llm?: KaleduLlmCall | null
    fallbackFor?: KaleduSlideFallback
  },
): Promise<{ slides: UgcStorySlide[]; native: KaleduNativeRewriteMeta }> {
  if (!isChristmasGiftsNiche()) {
    return { slides, native: emptyKaleduNativeMeta() }
  }

  await ensureLtSpeller().catch((err) =>
    auditLog('lt_speller_load_fail', { error: err instanceof Error ? err.message : String(err) }),
  )
  const llm = opts.llm !== undefined ? opts.llm : process.env.VITEST ? null : defaultKaleduLlm(opts.signal)
  const allowed = opts.products || []
  const qaCtx = { theme: opts.theme, allowed, productTruth: true as const }

  // A leaked „productId=…“ is stripped before QA — otherwise the whole slide is flagged and
  // replaced by a stock line (audit batch30 post-08). Catalog product types copied with their
  // capital mid-sentence („su Aromaterapijos žvake“) are lowercased.
  const mechanically = slides.map((slide) => ({
    ...slide,
    title: applyKaleduNativeRepairs(demoteProductTypeCapitals(stripProductIdTags(slide.title))),
    body: applyKaleduNativeRepairs(stripKaleduCtaLeak(demoteProductTypeCapitals(stripProductIdTags(slide.body)))),
  }))

  const audits: KaleduNativeSlideAudit[] = mechanically.map((slide, i) => {
    const repaired = slide.title !== slides[i]?.title || slide.body !== slides[i]?.body
    return {
      index: i,
      role: slide.role,
      originalTitle: slides[i]?.title || '',
      originalBody: slides[i]?.body || '',
      rewrittenTitle: slide.title,
      rewrittenBody: slide.body,
      reasons: detectKaleduNativeIssues(slide, { giftNiche: true }).map((issue) => issue.code),
      shipped: repaired ? 'repaired' : 'original',
    }
  })

  const markAudit = (i: number, slide: UgcStorySlide, shipped: KaleduNativeSlideAudit['shipped'], reasons: string[] = []) => {
    audits[i] = {
      ...audits[i],
      rewrittenTitle: slide.title,
      rewrittenBody: slide.body,
      reasons: [...new Set([...audits[i].reasons, ...reasons])] as KaleduNativeSlideAudit['reasons'],
      shipped,
    }
  }

  const repairHooks = (rows: UgcStorySlide[]) =>
    rows.map((slide, i) => {
      const isHook = slide.role === 'hook' || i === 0
      if (!isHook || !slide.title.trim()) return slide
      const nextTitle = repairKaleduHookTitle(slide.title, {
        theme: opts.theme,
        body: slide.body,
        products: opts.products,
      })
      if (nextTitle === slide.title) return slide
      const reasons = kaleduHookTitleIssues(slides[i]?.title || slide.title).map((issue) => issue.code)
      const next = { ...slide, title: nextTitle }
      markAudit(i, next, audits[i].shipped === 'rewritten' ? 'rewritten' : 'repaired', reasons)
      return next
    })

  const normalizeRows = (rows: UgcStorySlide[]) => {
    const ltState: NormalizeLtCopyState = { mesOpenerCount: 0 }
    return rows.map((slide) => ({
      ...slide,
      title: normalizeLtUgcMultiline(slide.title, ltState),
      body: normalizeLtUgcMultiline(slide.body, ltState),
    }))
  }

  const runJudge = async (rows: UgcStorySlide[], indexes?: number[], callType: 'final_qa_judge' | 'final_qa_rejudge' = 'final_qa_judge') => {
    if (!llm) return { flags: [] as KaleduQaFlag[], ran: false }
    try {
      const raw = await llm(buildKaleduQaJudgePrompt(rows, qaCtx, indexes), {
        system: KALEDU_QA_JUDGE_SYSTEM,
        numPredict: 60 + 40 * (indexes?.length ?? rows.length),
        callType,
        temperature: 0.1,
        timeoutMs: KALEDU_QA_JUDGE_TIMEOUT_MS,
      })
      if (raw == null) return { flags: [] as KaleduQaFlag[], ran: false }
      const flags = parseKaleduQaJudge(extractJsonObject(String(raw)), rows, allowed).filter(
        (flag) => !indexes || indexes.includes(flag.index),
      )
      return { flags, ran: true }
    } catch (err) {
      auditLog('kaledu_qa_judge_fail', { error: err instanceof Error ? err.message : String(err) })
      return { flags: [] as KaleduQaFlag[], ran: false }
    }
  }

  const rounds: KaleduQaRound[] = []
  let working = applySemanticContextRepairs(repairHooks(mechanically)).slides

  opts.onProgress?.('Christmas final QA + rewrite…')
  const det1 = kaleduDeterministicQa(working, qaCtx)
  const judge1 = det1.length ? { flags: [] as KaleduQaFlag[], ran: false } : await runJudge(working)
  const flags1 = mergeKaleduQaFlags(det1, judge1.flags)
  rounds.push({ round: 1, deterministic: det1, judge: judge1.flags, judgeRan: judge1.ran, merged: flags1 })

  let attemptCount = 0
  let rewrittenSlideCount = 0

  if (flags1.length && llm) {
    opts.onProgress?.(`Applying ${flags1.length} QA replacement(s)…`)
    const productsLine = allowed.length
      ? `PRODUCTS_ALLOWED: ${allowed.map((p) => productTypePhrase(p)).join(', ')}`
      : 'PRODUCTS_ALLOWED: nėra - konkrečių prekių nerašyk, tik bendrai apie dovaną.'
    const input = flags1.map((flag) => ({
      i: flag.index,
      role: working[flag.index].role || '',
      title: working[flag.index].title,
      body: working[flag.index].body,
      fix: kaleduRewriteHints(flag.codes),
    }))
    try {
      const raw = await llm(
        `Tema: ${opts.theme}\n${productsLine}\nPeržiūrėk TIK šias skaidres. Geros neliesk. Blogai: status REWRITE ir replacement {title,body}. Gerai: status PASS be replacement.\nINPUT:\n${JSON.stringify({ slides: input })}\nJSON: {"slides":[{"index":0,"status":"PASS"},{"index":1,"status":"REWRITE","codes":["awkward_collocation"],"replacement":{"title":"","body":"..."}}]}`,
        {
          system: UGC_KALEDU_NATIVE_REWRITE_SYSTEM,
          numPredict: Math.min(560, 40 + 70 * input.length),
          callType: 'final_qa_rewrite',
          temperature: 0.2,
          timeoutMs: KALEDU_QA_REWRITE_TIMEOUT_MS,
        },
      )
      if (raw != null) {
        attemptCount = 1
        const combined = parseCombinedKaleduQa(extractJsonObject(String(raw)), working.length).filter(
          (row) => row.status === 'REWRITE' && flags1.some((flag) => flag.index === row.index),
        )
        const patches = (
          combined.length
            ? combined.map((row) => ({ i: row.index, title: row.title, body: row.body }))
            : parseKaleduRewritePatches(extractJsonObject(String(raw)), working.length)
        ).filter((patch) => flags1.some((flag) => flag.index === patch.i))
        const merged = applyKaleduRewrittenFields(working, patches)
        working = merged.map((slide, i) => {
          const patch = patches.find((row) => row.i === i)
          if (!patch) return working[i]
          const candTitle = applyKaleduNativeRepairs(stripKaleduCtaLeak(slide.title))
          const candBody = applyKaleduNativeRepairs(stripKaleduCtaLeak(slide.body))
          const isHook = slides[i].role === 'hook' || i === 0
          if ((isHook && !candTitle.trim()) || !candBody.trim()) return working[i]
          const sceneChecked = validateRewrittenSlide({
            originalSlide: working[i],
            candidateSlide: { title: candTitle, body: candBody, role: working[i].role, productId: working[i].productId },
            theme: opts.theme,
            requiredProductIds: allowed.map((product) => product.slug || product.productId),
            products: allowed,
            productTruth: true,
          })
          if (!sceneChecked.ok) {
            auditLog('rewrite_rejected', { stage: 'final_qa_rewrite', slideIndex: i, reasons: sceneChecked.errors.map((error) => error.code) })
            return working[i]
          }
          const sceneBody = sceneChecked.normalizedSlide?.body || candBody
          if (rewriteIntroducesUnsupportedProductClaims(`${working[i].title} ${working[i].body}`, `${candTitle} ${sceneBody}`, allowed)) {
            return working[i]
          }
          rewrittenSlideCount += 1
          const next = { ...slide, title: isHook ? candTitle : slides[i].title ? candTitle : '', body: sceneBody }
          markAudit(i, next, 'rewritten', flags1.find((f) => f.index === i)?.codes || [])
          return next
        })
      }
    } catch (err) {
      auditLog('kaledu_qa_rewrite_fail', { error: err instanceof Error ? err.message : String(err) })
    }
  }

  working = applySemanticContextRepairs(repairHooks(normalizeRows(working))).slides

  const flaggedIdx = flags1.map((flag) => flag.index)
  const det2 = kaleduDeterministicQa(working, qaCtx)
  const spellOnly = isSpellNoteOnly
  const spellOnlyIdx = det2.filter(spellOnly).map((flag) => flag.index)
  const judgeIdx = [
    ...new Set([
      ...(judge1.flags.length && rewrittenSlideCount ? flaggedIdx.filter((i) => audits[i].shipped === 'rewritten') : []),
      ...spellOnlyIdx,
    ]),
  ]
  const judge2 = judgeIdx.length
    ? await runJudge(working, judgeIdx, 'final_qa_rejudge')
    : { flags: [] as KaleduQaFlag[], ran: false }
  auditWrite('05f-spellcheck.json', {
    spellerReady: isLtSpellerReady(),
    slides: working.map((slide, i) => {
      const before = checkLtSpelling(`${slides[i]?.title || ''} ${slides[i]?.body || ''}`)
      const after = checkLtSpelling(`${slide.title} ${slide.body}`)
      const rows = (r: typeof before) =>
        r.unknown.map((u) => ({
          token: u.token,
          suggestions: u.suggestions,
          confidence: u.confidence,
          typoOf: u.typoOf,
          sentence: u.sentence,
        }))
      return {
        slide: i + 1,
        role: slide.role,
        before: rows(before),
        beforeHardFail: before.hardFail,
        beforeNote: before.note,
        after: rows(after),
        afterHardFail: after.hardFail,
        afterNote: after.note,
        rewrite: audits[i].shipped === 'rewritten',
        judgeFlaggedAfter: judge2.flags.some((f) => f.index === i),
      }
    }),
  })
  const flags2 = mergeKaleduQaFlags(det2, judge2.flags)
  rounds.push({ round: 2, deterministic: det2, judge: judge2.flags, judgeRan: judge2.ran, merged: flags2 })

  const fallbackSlides: Array<{ index: number; reason: string; mode: 'product_repair' | 'spell_repair' | 'fallback' | 'kept' }> = []
  for (const flag of flags2) {
    const i = flag.index
    const slide = working[i]
    const priorText = working
      .slice(0, i)
      .map((s) => `${s.title} ${s.body}`)
      .join(' ')
    if (spellOnly(flag) && judge2.ran && !judge2.flags.some((f) => f.index === i)) {
      fallbackSlides.push({ index: i, reason: `spell note only: ${flag.details.join('; ')}`, mode: 'kept' })
      continue
    }
    // A diacritics-only typo with one dictionary suggestion („rankšluoščiai“) is fixed in place,
    // so the slide keeps its concrete idea instead of becoming a stock line.
    if (flag.codes.includes('spell_hard_fail')) {
      const title = repairUnambiguousLtTypos(slide.title)
      const body = repairUnambiguousLtTypos(slide.body)
      if (title.fixes.length || body.fixes.length) {
        const repaired = { ...slide, title: title.text, body: body.text }
        if (!kaleduDeterministicQa([repaired], qaCtx).some((f) => !isSpellNoteOnly(f))) {
          working[i] = repaired
          markAudit(i, repaired, 'repaired', flag.codes)
          fallbackSlides.push({ index: i, reason: [...title.fixes, ...body.fixes].map((f) => `${f.from} → ${f.to}`).join(', '), mode: 'spell_repair' })
          continue
        }
      }
    }
    if (flag.codes.every((code) => code === 'product_truth')) {
      const repairAllowed = slide.role === 'build' ? allowed : []
      const title = repairInventedProductCopy(slide.title, repairAllowed, { priorText })
      const body = repairInventedProductCopy(slide.body, repairAllowed, { priorText: `${priorText} ${title}` })
      const repaired = { ...slide, title, body }
      const stillBad = kaleduDeterministicQa([repaired], qaCtx).some((f) =>
        f.codes.some((code) => code !== 'product_truth' || kaleduInventedProductMentions(`${title} ${body}`, allowed).length),
      )
      if (!stillBad) {
        working[i] = repaired
        markAudit(i, repaired, 'repaired', ['invented_product'])
        fallbackSlides.push({ index: i, reason: flag.details.join('; '), mode: 'product_repair' })
        continue
      }
    }
    const reason = flag.details.join('; ')
    const fb = opts.fallbackFor?.(i, working, reason)
    if (fb) {
      const next = { ...slide, title: fb.title, body: fb.body }
      working[i] = next
      markAudit(i, next, 'fallback', flag.codes)
      fallbackSlides.push({ index: i, reason, mode: 'fallback' })
      auditFallback({ slide: i + 1, role: slide.role, reason, text: `${fb.title} ${fb.body}`.trim() })
    } else {
      fallbackSlides.push({ index: i, reason, mode: 'kept' })
    }
  }

  const withCta = attachKaleduCloseCta(working, opts.theme, opts.seed ?? 0, opts.category || '', opts.defaultCta)
  const withEmoji = normalizeKaleduEmojiBudget(withCta)
  const native: KaleduNativeRewriteMeta = {
    attempted: attemptCount > 0,
    attemptCount,
    rewrittenSlideCount,
    slides: audits,
    finalQa: { rounds, fallbackSlides },
  }
  auditWrite('05b-native-rewrite.json', native)
  auditWrite('05d-final-qa.json', {
    theme: opts.theme,
    niche: 'christmas-gifts',
    allowed: allowed.map((p) => p.slug),
    categories: {
      round1: countKaleduQaCategories(rounds[0]?.merged || []),
      round2: countKaleduQaCategories(rounds[1]?.merged || []),
    },
    rounds,
    fallbackSlides,
    copyQa: {
      sentencesChecked: working.reduce(
        (n, slide) => n + `${slide.title} ${slide.body}`.split(/[.!?…]+/u).filter((part) => part.trim()).length,
        0,
      ),
      punctuationRepairs: flags1.filter((flag) => flag.codes.includes('missing_question_mark')).length,
      lexicalRepairs: flags1.filter((flag) => flag.codes.includes('spell_hard_fail')).length,
      semanticRepairs: rewrittenSlideCount,
      storyRepairs: fallbackSlides.filter((row) => row.mode === 'fallback').length,
      productContextRepairs: flags1.filter((flag) => flag.codes.includes('product_context_mismatch')).length,
      regenerations: fallbackSlides.filter((row) => row.mode === 'fallback').length,
      finalPass: flags2.filter((flag) => !isSpellNoteOnly(flag)).length === 0,
      firstPassSuccess: flags1.filter((flag) => !isSpellNoteOnly(flag)).length === 0,
      repairSuccess:
        flags1.some((flag) => !isSpellNoteOnly(flag)) &&
        flags2.filter((flag) => !isSpellNoteOnly(flag)).length === 0,
      regenerationRequired:
        rewrittenSlideCount >= 3 || fallbackSlides.filter((row) => row.mode === 'fallback').length >= 2,
      rhetoricalPunctuationRepairs: 0,
      comparisonFragmentMerges: 0,
      productVisualMissingFailures: 0,
      payoffPunctuationRepairs: 0,
    },
  })
  auditLog('kaledu_native_rewrite', {
    attempted: native.attempted,
    attemptCount,
    rewrittenSlideCount,
    qaFlagsRound1: flags1.length,
    qaFlagsRound2: flags2.length,
    fallbacks: fallbackSlides.filter((row) => row.mode === 'fallback').length,
  })
  return { slides: withEmoji, native }
}

/**
 * Tavo knyga language pass — completely separate from Kalėdų Kampelis.
 * No gift catalog, no Christmas hooks/emoji/CTA banks. Diet / meal-plan only.
 */
export async function rewriteTavoSlidesNative(
  slides: UgcStorySlide[],
  opts: {
    theme: string
    defaultCta: string
    signal?: AbortSignal
    onProgress?: (msg: string) => void
    llm?: KaleduLlmCall | null
    fallbackFor?: KaleduSlideFallback
  },
): Promise<{ slides: UgcStorySlide[]; native: KaleduNativeRewriteMeta }> {
  if (isChristmasGiftsNiche()) {
    return { slides, native: emptyKaleduNativeMeta() }
  }

  await ensureLtSpeller().catch((err) =>
    auditLog('lt_speller_load_fail', { error: err instanceof Error ? err.message : String(err) }),
  )
  const llm = opts.llm !== undefined ? opts.llm : process.env.VITEST ? null : defaultKaleduLlm(opts.signal)
  const qaCtx = { theme: opts.theme, allowed: [] as KaleduCatalogProduct[], productTruth: false as const }

  // A leaked „productId=…“ is stripped before QA — otherwise the whole slide is flagged and
  // replaced by a stock line (audit batch30 post-08).
  const mechanically = slides.map((slide) => ({
    ...slide,
    title: applyKaleduNativeRepairs(stripProductIdTags(slide.title)),
    body: applyKaleduNativeRepairs(stripKaleduCtaLeak(stripProductIdTags(slide.body))),
  }))

  const audits: KaleduNativeSlideAudit[] = mechanically.map((slide, i) => {
    const repaired = slide.title !== slides[i]?.title || slide.body !== slides[i]?.body
    return {
      index: i,
      role: slide.role,
      originalTitle: slides[i]?.title || '',
      originalBody: slides[i]?.body || '',
      rewrittenTitle: slide.title,
      rewrittenBody: slide.body,
      reasons: detectKaleduNativeIssues(slide, { giftNiche: false }).map((issue) => issue.code),
      shipped: repaired ? 'repaired' : 'original',
    }
  })

  const markAudit = (i: number, slide: UgcStorySlide, shipped: KaleduNativeSlideAudit['shipped'], reasons: string[] = []) => {
    audits[i] = {
      ...audits[i],
      rewrittenTitle: slide.title,
      rewrittenBody: slide.body,
      reasons: [...new Set([...audits[i].reasons, ...reasons])] as KaleduNativeSlideAudit['reasons'],
      shipped,
    }
  }

  const repairHooks = (rows: UgcStorySlide[]) =>
    rows.map((slide, i) => {
      const isHook = slide.role === 'hook' || i === 0
      if (!isHook || !slide.title.trim()) return slide
      let nextTitle = slide.title
      if (isBadArColonHook(nextTitle)) {
        nextTitle = nextTitle.replace(/^Ar\s+/iu, '').replace(/[.!…]+$/u, '').trim()
        if (!nextTitle.endsWith('?')) nextTitle = `${nextTitle}?`
      }
      if (nextTitle === slide.title) return slide
      const next = { ...slide, title: nextTitle }
      markAudit(i, next, audits[i].shipped === 'rewritten' ? 'rewritten' : 'repaired', ['bad_ar_colon'])
      return next
    })

  const normalizeRows = (rows: UgcStorySlide[]) => {
    const ltState: NormalizeLtCopyState = { mesOpenerCount: 0 }
    return rows.map((slide) => ({
      ...slide,
      title: normalizeLtUgcMultiline(slide.title, ltState),
      body: normalizeLtUgcMultiline(slide.body, ltState),
    }))
  }

  const runJudge = async (rows: UgcStorySlide[], indexes?: number[], callType: 'final_qa_judge' | 'final_qa_rejudge' = 'final_qa_judge') => {
    if (!llm) return { flags: [] as KaleduQaFlag[], ran: false }
    try {
      const raw = await llm(buildKaleduQaJudgePrompt(rows, qaCtx, indexes), {
        system: UGC_LT_QA_JUDGE_SYSTEM,
        numPredict: 60 + 40 * (indexes?.length ?? rows.length),
        callType,
        temperature: 0.1,
        timeoutMs: KALEDU_QA_JUDGE_TIMEOUT_MS,
      })
      if (raw == null) return { flags: [] as KaleduQaFlag[], ran: false }
      const flags = parseKaleduQaJudge(extractJsonObject(String(raw)), rows, []).filter(
        (flag) => !indexes || indexes.includes(flag.index),
      )
      return { flags, ran: true }
    } catch (err) {
      auditLog('tavo_qa_judge_fail', { error: err instanceof Error ? err.message : String(err) })
      return { flags: [] as KaleduQaFlag[], ran: false }
    }
  }

  const rounds: KaleduQaRound[] = []
  let working = applySemanticContextRepairs(repairHooks(mechanically)).slides

  opts.onProgress?.('Tavo knyga final QA + rewrite…')
  const det1 = kaleduDeterministicQa(working, qaCtx)
  const judge1 = det1.length ? { flags: [] as KaleduQaFlag[], ran: false } : await runJudge(working)
  const flags1 = mergeKaleduQaFlags(det1, judge1.flags)
  rounds.push({ round: 1, deterministic: det1, judge: judge1.flags, judgeRan: judge1.ran, merged: flags1 })

  let attemptCount = 0
  let rewrittenSlideCount = 0

  if (flags1.length && llm) {
    opts.onProgress?.(`Applying ${flags1.length} QA replacement(s)…`)
    const input = flags1.map((flag) => ({
      i: flag.index,
      role: working[flag.index].role || '',
      title: working[flag.index].title,
      body: working[flag.index].body,
      fix: kaleduRewriteHints(flag.codes),
    }))
    try {
      const raw = await llm(
        `Tema: ${opts.theme}\nProduktas: Tavo knyga (mitybos planas / 5 min. testas). NEMINĖK dovanų ar Kalėdų.\nPeržiūrėk TIK šias skaidres. Geros neliesk. Blogai: status REWRITE ir replacement {title,body}. Gerai: status PASS be replacement.\nINPUT:\n${JSON.stringify({ slides: input })}\nJSON: {"slides":[{"index":0,"status":"PASS"},{"index":1,"status":"REWRITE","codes":["awkward_collocation"],"replacement":{"title":"","body":"..."}}]}`,
        {
          system: UGC_LT_NATIVE_REWRITE_SYSTEM,
          numPredict: Math.min(560, 40 + 70 * input.length),
          callType: 'final_qa_rewrite',
          temperature: 0.2,
          timeoutMs: KALEDU_QA_REWRITE_TIMEOUT_MS,
        },
      )
      if (raw != null) {
        attemptCount = 1
        const combined = parseCombinedKaleduQa(extractJsonObject(String(raw)), working.length).filter(
          (row) => row.status === 'REWRITE' && flags1.some((flag) => flag.index === row.index),
        )
        const patches = (
          combined.length
            ? combined.map((row) => ({ i: row.index, title: row.title, body: row.body }))
            : parseKaleduRewritePatches(extractJsonObject(String(raw)), working.length)
        ).filter((patch) => flags1.some((flag) => flag.index === patch.i))
        const merged = applyKaleduRewrittenFields(working, patches)
        working = merged.map((slide, i) => {
          const patch = patches.find((row) => row.i === i)
          if (!patch) return working[i]
          const candTitle = applyKaleduNativeRepairs(stripKaleduCtaLeak(slide.title))
          const candBody = applyKaleduNativeRepairs(stripKaleduCtaLeak(slide.body))
          const isHook = slides[i].role === 'hook' || i === 0
          if ((isHook && !candTitle.trim()) || !candBody.trim()) return working[i]
          const sceneChecked = validateRewrittenSlide({
            originalSlide: working[i],
            candidateSlide: {
              title: candTitle,
              body: candBody,
              role: working[i].role,
              cta: working[i].cta,
            },
            theme: opts.theme,
            productTruth: false,
          })
          if (!sceneChecked.ok) {
            auditLog('rewrite_rejected', { stage: 'tavo_final_qa_rewrite', slideIndex: i, reasons: sceneChecked.errors.map((e) => e.code) })
            return working[i]
          }
          rewrittenSlideCount += 1
          const next = {
            ...slide,
            title: isHook ? candTitle : slides[i].title ? candTitle : '',
            body: sceneChecked.normalizedSlide?.body || candBody,
          }
          markAudit(i, next, 'rewritten', flags1.find((f) => f.index === i)?.codes || [])
          return next
        })
      }
    } catch (err) {
      auditLog('tavo_qa_rewrite_fail', { error: err instanceof Error ? err.message : String(err) })
    }
  }

  working = applySemanticContextRepairs(repairHooks(normalizeRows(working))).slides

  const flaggedIdx = flags1.map((flag) => flag.index)
  const det2 = kaleduDeterministicQa(working, qaCtx)
  const spellOnlyIdx = det2.filter(isSpellNoteOnly).map((flag) => flag.index)
  const judgeIdx = [
    ...new Set([
      ...(judge1.flags.length && rewrittenSlideCount ? flaggedIdx.filter((i) => audits[i].shipped === 'rewritten') : []),
      ...spellOnlyIdx,
    ]),
  ]
  const judge2 = judgeIdx.length
    ? await runJudge(working, judgeIdx, 'final_qa_rejudge')
    : { flags: [] as KaleduQaFlag[], ran: false }
  auditWrite('05f-spellcheck.json', {
    niche: 'tavo-knyga',
    spellerReady: isLtSpellerReady(),
    slides: working.map((slide, i) => {
      const before = checkLtSpelling(`${slides[i]?.title || ''} ${slides[i]?.body || ''}`)
      const after = checkLtSpelling(`${slide.title} ${slide.body}`)
      return {
        slide: i + 1,
        role: slide.role,
        beforeHardFail: before.hardFail,
        afterHardFail: after.hardFail,
        rewrite: audits[i].shipped === 'rewritten',
      }
    }),
  })
  const flags2 = mergeKaleduQaFlags(det2, judge2.flags)
  rounds.push({ round: 2, deterministic: det2, judge: judge2.flags, judgeRan: judge2.ran, merged: flags2 })

  const fallbackSlides: Array<{ index: number; reason: string; mode: 'product_repair' | 'fallback' | 'kept' }> = []
  for (const flag of flags2) {
    const i = flag.index
    const slide = working[i]
    if (isSpellNoteOnly(flag) && judge2.ran && !judge2.flags.some((f) => f.index === i)) {
      fallbackSlides.push({ index: i, reason: `spell note only: ${flag.details.join('; ')}`, mode: 'kept' })
      continue
    }
    const reason = flag.details.join('; ')
    const fb = opts.fallbackFor?.(i, working, reason)
    if (fb) {
      const next = { ...slide, title: fb.title, body: fb.body }
      working[i] = next
      markAudit(i, next, 'fallback', flag.codes)
      fallbackSlides.push({ index: i, reason, mode: 'fallback' })
      auditFallback({ slide: i + 1, role: slide.role, reason, text: `${fb.title} ${fb.body}`.trim() })
    } else {
      fallbackSlides.push({ index: i, reason, mode: 'kept' })
    }
  }

  const withCta = working.map((slide, i) => {
    const isClose = slide.role === 'close' || i === working.length - 1
    return {
      ...slide,
      body: stripKaleduCtaLeak(String(slide.body || '')),
      cta: isClose ? finalizeCloseSlideCta(opts.defaultCta, opts.defaultCta || ugcActiveCta()) : '',
    }
  })
  const native: KaleduNativeRewriteMeta = {
    attempted: attemptCount > 0,
    attemptCount,
    rewrittenSlideCount,
    slides: audits,
    finalQa: { rounds, fallbackSlides },
  }
  auditWrite('05b-native-rewrite.json', native)
  auditWrite('05d-final-qa.json', {
    theme: opts.theme,
    niche: 'tavo-knyga',
    categories: {
      round1: countKaleduQaCategories(rounds[0]?.merged || []),
      round2: countKaleduQaCategories(rounds[1]?.merged || []),
    },
    rounds,
    fallbackSlides,
  })
  return { slides: withCta, native }
}
