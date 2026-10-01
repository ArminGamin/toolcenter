/** Turns parsed model rows into slides and runs the second-pass QA polish. (Split out of ugc-story-engine.ts.) */

import { extractJsonObject } from '../json-extract.js'
import { isChristmasGiftsNiche } from '../profile-brand.js'
import {
    auditLog
} from '../ugc-batch-audit.js'
import {
    stripEnglishCopyLabels
} from '../ugc-copy-skill.js'
import { finalizeCloseSlideCta, ugcActiveCta } from '../ugc-cta-normalize.js'
import { resolveUgcOllamaModel } from '../ugc-env-bridge.js'
import {
    ensureHookQuestionMark,
    finalizeHookBody,
    finalizeHookTitle,
    isInvalidHookTitle,
    KALEDU_HOOK_BODY_OPENERS,
    stripTitleEchoFromBody
} from '../ugc-hook-templates.js'
import {
    assertShipableLtSlide,
    demoteLtTitleCase,
    hasFormalRegister,
    isGibberishLtCopy,
    normalizeLtUgcMultiline,
    sanitizeLtCopyFields,
    type NormalizeLtCopyState
} from '../ugc-lt-normalize.js'
import {
    isUgcQaEnabled,
    qaGenerateJson,
    UGC_LT_SEMANTIC_QA_PROMPT,
    UGC_QA_GRAMMAR_APPENDIX,
    type UgcQaPassMeta,
} from '../ugc-qa-client.js'
import {
    isSeasonFillerRepeat,
    stripSeasonFiller
} from '../ugc-season-context.js'
import {
    isRepeatOfRecentPost
} from '../ugc-variety-ledger.js'
import { parseStoryBatchPayload } from './batch-payload.js'
import { buildFallbackCloseBody, buildFallbackHook, buildFallbackSupportBody, fitSlideText, UGC_MIN_SENTENCES_PER_SLIDE } from './fallbacks.js'
import { ensureHookBodyQuestions } from './repairs.js'
import { isDuplicateSlideCopy, isParaphraseSlideCopy } from './similarity.js'
import { BODY_MAX, clipField, clipHookTitle, splitSentences, TITLE_MAX, type UgcStorySlide } from './text.js'

export function collectUsedPhrases(slides: Array<{ text: string }>): Set<string> {
  const used = new Set<string>()
  for (const slide of slides) {
    for (const sent of splitSentences(slide.text)) {
      used.add(sent.toLowerCase())
    }
  }
  return used
}

export function hasRepetition(text: string, used: Set<string>, prior: Array<{ text: string }>): string | null {
  for (const sent of splitSentences(text)) {
    if (used.has(sent.toLowerCase())) return `pakartotas sakinys: ${sent.slice(0, 40)}`
  }
  const fp = text.toLowerCase().replace(/\s+/g, ' ').trim()
  for (const p of prior) {
    const pfp = p.text.toLowerCase().replace(/\s+/g, ' ').trim()
    if (fp.length > 40 && fp === pfp) return 'per daug panašu į ankstesnę skaidrę'
  }
  return null
}

export function roleTextToUgcFields(
  role: string,
  text: string,
  titleFromModel: string,
  ctaFromModel: string,
  defaultCta: string,
  ltState: NormalizeLtCopyState,
  topic: string,
  hookStyle: string,
): { title: string; body: string; cta?: string } {
  const cleaned = normalizeLtUgcMultiline(stripEnglishCopyLabels(text).trim(), ltState)
  const titleRaw = normalizeLtUgcMultiline(stripEnglishCopyLabels(titleFromModel).trim(), ltState)
  // Never run body normalizer on CTA — it strips emoji / URL
  const ctaRaw = stripEnglishCopyLabels(ctaFromModel).trim()
  const sents = splitSentences(cleaned)
  if (role === 'hook') {
    const topicHint = topic || cleaned.slice(0, 40)
    let title = finalizeHookTitle(
      titleRaw || sents[0] || '',
      hookStyle || 'Question',
      topicHint,
      ltState.mesOpenerCount,
    )
    if (isInvalidHookTitle(title)) {
      title = finalizeHookTitle(topicHint, hookStyle || 'Question', topicHint, 1)
    }
    title = clipHookTitle(demoteLtTitleCase(title), TITLE_MAX)
    title = ensureHookQuestionMark(title)
    const bodySents = titleRaw.trim() ? sents : sents.slice(1)
    let body = clipField(
      stripTitleEchoFromBody(title, ensureHookBodyQuestions(bodySents.join(' '))),
      BODY_MAX,
    )
    if (!body.trim()) {
      body = clipField(stripTitleEchoFromBody(title, ensureHookBodyQuestions(cleaned)), BODY_MAX)
    }
    body = clipField(
      finalizeHookBody(
        topicHint,
        ensureHookBodyQuestions(body),
        ltState.mesOpenerCount,
        isChristmasGiftsNiche() ? KALEDU_HOOK_BODY_OPENERS : undefined,
      ),
      BODY_MAX,
    )
    return { title, body }
  }
  if (role === 'close') {
    const closeSents = splitSentences(cleaned)
    let bodySents = [...closeSents]
    let ctaSource = ctaRaw
    const ctaLike = /tavoknyga\.com|pradėk testą|užpildyk testą|suplanuok savaitės meniu/i
    if (!ctaSource && bodySents.length > 0 && ctaLike.test(bodySents[bodySents.length - 1])) {
      ctaSource = bodySents.pop() || ''
    }
    // Keep close body short — payoff only
    const body = clipField(bodySents.slice(0, 2).join(' ') || cleaned.replace(/\n/g, ' '), Math.min(BODY_MAX, 220))
    return {
      title: '',
      body,
      cta: finalizeCloseSlideCta(ctaSource || defaultCta, defaultCta || ugcActiveCta()),
    }
  }
  return {
    title: '',
    body: clipField(cleaned.replace(/\n/g, ' '), BODY_MAX),
  }
}

export function slidesFromItems(
  items: Array<{ role: string; text: string; title: string; cta: string }>,
  roles: string[],
  targets: number[],
  topic: string,
  defaultCta: string,
  prior: Array<{ role: string; text: string }>,
  ltState: NormalizeLtCopyState,
  hookStyle: string = 'Question',
  slideStart = prior.length + 1,
  allowProgrammaticRescue = false,
  seasonalTheme = false,
  themeSeed: { hook: string; body: string } = { hook: '', body: '' },
): {
  slides: UgcStorySlide[]
  processed: number
  rejected: Array<{ requestedIndex: number; role: string; reason: string }>
} {
  const used = collectUsedPhrases(prior)
  const built: UgcStorySlide[] = []
  const priorText: Array<{ text: string }> = [...prior]
  const rejected: Array<{ requestedIndex: number; role: string; reason: string }> = []
  let gap = false

  for (let i = 0; i < items.length; i++) {
    const role = roles[i]
    const exact = targets[i]
    const priorForFit = [
      ...prior.map((p) => ({ text: p.text })),
      ...built.map((s) => ({ title: s.title, body: s.body })),
    ]
    let text = fitSlideText(items[i].text, exact, role, topic, priorForFit, built.length)
    let dup = hasRepetition(text, used, priorText)
    if (dup) {
      const parts = splitSentences(text).filter((s) => !used.has(s.toLowerCase()))
      text = parts.length >= UGC_MIN_SENTENCES_PER_SLIDE ? parts.slice(0, exact).join('\n') : text
    }

    let rawTitle = items[i].title
    if (isSeasonFillerRepeat(`${rawTitle} ${text}`, priorText.map((p) => p.text), seasonalTheme)) {
      const strippedText = stripSeasonFiller(text)
      if (strippedText.length >= 24) text = strippedText
      const strippedTitle = stripSeasonFiller(rawTitle)
      rawTitle = strippedTitle.length >= 12 ? strippedTitle : ''
    }

    const fields = roleTextToUgcFields(
      role,
      text,
      rawTitle,
      items[i].cta,
      defaultCta,
      ltState,
      topic,
      hookStyle,
    )
    const globalSlide = slideStart + i
    const snippet = `${fields.title} ${fields.body}`.trim().replace(/\s+/g, ' ').slice(0, 100)
    const rescueSlide = () => {
      const rescuePrior = prior.map((slide) => ({ text: slide.text }))
      if (role === 'hook') {
        const hook = buildFallbackHook(themeSeed.hook || topic, themeSeed.body)
        fields.title = hook.title
        fields.body = hook.body
        return
      }
      fields.title = ''
      fields.body =
        role === 'close'
          ? buildFallbackCloseBody(topic, rescuePrior)
          : buildFallbackSupportBody(role, rescuePrior, `${topic} ${themeSeed.hook}`, built.length)
      if (role === 'close') fields.cta = ugcActiveCta()
    }
    const canRescue = allowProgrammaticRescue
    if (!fields.body && !fields.title) {
      if (canRescue) {
        rescueSlide()
      } else {
        throw new Error(`Slide ${globalSlide} (${role}) empty after normalize`)
      }
    }
    if (isGibberishLtCopy(`${fields.title} ${fields.body}`)) {
      if (canRescue) {
        rescueSlide()
      } else {
        throw new Error(
          `Slide ${globalSlide} (${role}) looks like gibberish LT — rewrite required | ${snippet}`,
        )
      }
    }
    if (hasFormalRegister(`${fields.title} ${fields.body}`)) {
      if (canRescue) {
        rescueSlide()
      } else {
        throw new Error(
          `Slide ${globalSlide} (${role}) still uses formal „jūs" — rewrite required | ${snippet}`,
        )
      }
    }
    if (
      isSeasonFillerRepeat(
        `${fields.title} ${fields.body}`,
        priorText.map((p) => p.text),
        seasonalTheme,
      )
    ) {
      if (canRescue) {
        rescueSlide()
      } else {
        throw new Error(
          `Slide ${globalSlide} (${role}) repeats seasonal filler — rewrite required | ${snippet}`,
        )
      }
    }
    if (role === 'hook' && !canRescue && isRepeatOfRecentPost(fields.title, fields.body)) {
      throw new Error(
        `Slide ${globalSlide} (hook) repeats a recent post opener — rewrite required | ${snippet}`,
      )
    }
    try {
      assertShipableLtSlide({ title: fields.title, body: fields.body, role })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const autoFixable = /too short|missing "?|colon-interrogative|participle|not shipable/i.test(msg)
      if (canRescue || autoFixable) {
        rescueSlide()
        assertShipableLtSlide({ title: fields.title, body: fields.body, role })
      } else {
        throw new Error(`Slide ${globalSlide} (${role}) not shipable: ${msg} | ${snippet}`)
      }
    }

    const globalIndex = prior.length + built.length
    const priorForDup = [
      ...prior.map((p) => ({ text: p.text })),
      ...built.map((s) => ({ title: s.title, body: s.body })),
    ]
  // Close must not paraphrase the hook — always auto-fix (never burn an LLM retry)
    if (role === 'close' && prior.length) {
      const hookPrior = prior.filter((p) => p.role === 'hook')
      if (hookPrior.length && isDuplicateSlideCopy(fields.title, fields.body, hookPrior)) {
        fields.title = ''
        fields.body = buildFallbackCloseBody(topic, priorForDup)
        fields.cta = ugcActiveCta()
      }
    }
      if (isDuplicateSlideCopy(fields.title, fields.body, priorForDup)) {
        const unique = splitSentences(text).filter((s) => !used.has(s.toLowerCase()))
      if (unique.length >= UGC_MIN_SENTENCES_PER_SLIDE) {
        text = unique.slice(0, exact).join('\n')
        const salvaged = roleTextToUgcFields(
          role,
          text,
          items[i].title,
          items[i].cta,
          defaultCta,
          ltState,
          topic,
          hookStyle,
        )
        if (salvaged.body || salvaged.title) {
          Object.assign(fields, salvaged)
        }
      }
      if (isDuplicateSlideCopy(fields.title, fields.body, priorForDup)) {
        if (role === 'close' && canRescue) {
          fields.title = ''
          fields.body = buildFallbackCloseBody(topic, priorForDup)
          fields.cta = ugcActiveCta()
        }
      }
      if (isDuplicateSlideCopy(fields.title, fields.body, priorForDup)) {
        // Drop build/context near-dups instead of killing the whole post
        if (role === 'build' || role === 'context') {
          if (!canRescue) {
            rejected.push({ requestedIndex: i, role, reason: 'duplicate' })
            gap = true
            break
          }
          fields.title = ''
          fields.body = buildFallbackSupportBody(role, priorForDup, `${topic} ${themeSeed.hook}`, built.length)
          if (isDuplicateSlideCopy(fields.title, fields.body, priorForDup)) {
            rejected.push({ requestedIndex: i, role, reason: 'duplicate' })
            gap = true
            break
          }
        } else if (canRescue) {
          rescueSlide()
        } else {
          throw new Error(`Slide ${globalIndex + 1} duplicates earlier copy — rewrite required`)
        }
      }
      assertShipableLtSlide({ title: fields.title, body: fields.body, role })
    }

    for (const sent of splitSentences(text)) used.add(sent.toLowerCase())
    const priorSlidesForParaphrase = [
      ...prior.map((p) => ({ title: '', body: p.text })),
      ...built.map((s) => ({ title: s.title, body: s.body })),
    ]
    if (
      (role === 'build' || role === 'context') &&
      isParaphraseSlideCopy(fields.title, fields.body, priorSlidesForParaphrase)
    ) {
      fields.title = ''
      fields.body = buildFallbackSupportBody(
        role,
        priorSlidesForParaphrase,
        `${topic} ${themeSeed.hook}`,
        built.length,
      )
    }
    if (gap) break
    priorText.push({ text })
    built.push({
      id: `slide-${prior.length + built.length + 1}`,
      role,
      ...sanitizeLtCopyFields({ title: fields.title, body: fields.body, cta: fields.cta }),
    })
  }
  return { slides: built, processed: built.length, rejected }
}

/** Second-pass semantic QA — strict in production; unresolved failures block export. */
export async function qaPolishBatchSlides(
  slides: UgcStorySlide[],
  themeText: string,
  defaultCta: string,
  signal?: AbortSignal,
  onProgress?: (msg: string) => void,
): Promise<{ slides: UgcStorySlide[]; qa: UgcQaPassMeta }> {
  const model = resolveUgcOllamaModel()
  if (!isUgcQaEnabled()) {
    onProgress?.('QA skipped (UGC_QA_ENABLED=false)')
    return { slides, qa: { provider: 'skipped', model, ok: true } }
  }

  const runOnce = async (current: UgcStorySlide[]) => {
    const inputSlides = current.map((s, i) => ({
      role: s.role || (i === 0 ? 'hook' : i === current.length - 1 ? 'close' : 'build'),
      title: s.title,
      body: s.body,
      cta: s.cta || '',
    }))

    const prompt = `Tema: ${themeText}

${UGC_LT_SEMANTIC_QA_PROMPT}

${UGC_QA_GRAMMAR_APPENDIX}

Grąžink TIK JSON su ${current.length} slides ir rejects masyvu.
Close cta NEKEISK.

INPUT:
${JSON.stringify({ slides: inputSlides })}

JSON:`

    const { raw, meta } = await qaGenerateJson(prompt, {
      signal,
      temperature: 0.2,
      numPredict: 2048,
    })
    return { raw, meta, inputSlides }
  }

  const applyPolished = (current: UgcStorySlide[], raw: string, inputSlides: Array<{ role: string }>) => {
    const roles = inputSlides.map((s) => s.role)
    const items = parseStoryBatchPayload(raw, roles)
    const ltState: NormalizeLtCopyState = { mesOpenerCount: 0 }
    return current.map((orig, i) => {
      const item = items[i]
      if (!item) return orig
      const fields = roleTextToUgcFields(
        item.role,
        item.text,
        item.title,
        item.cta,
        defaultCta,
        ltState,
        themeText,
        orig.role === 'hook' ? 'Question' : 'Question',
      )
      const isClose = orig.role === 'close' || i === current.length - 1
      const isHook = orig.role === 'hook' || i === 0
      let body = fields.body
      let title = fields.title
      if (isHook) {
        body = finalizeHookBody(
          themeText,
          body,
          i,
          isChristmasGiftsNiche() ? KALEDU_HOOK_BODY_OPENERS : undefined,
        )
      }
      return {
        ...orig,
        title,
        body,
        ...(isClose && fields.cta ? { cta: fields.cta } : {}),
      }
    })
  }

  const parseRejects = (raw: string): Array<{ slide: number; code: string; reason: string }> => {
    try {
      const data = extractJsonObject(raw)
      const rejects = (data as { rejects?: unknown })?.rejects
      if (!Array.isArray(rejects)) return []
      return rejects
        .map((r) => {
          const row = r as { slide?: number; code?: string; reason?: string }
          return {
            slide: Number(row.slide) || 0,
            code: String(row.code || 'semantic'),
            reason: String(row.reason || ''),
          }
        })
        .filter((r) => r.slide > 0 && r.code)
    } catch {
      return []
    }
  }

  const repairRejected = (current: UgcStorySlide[], rejects: Array<{ slide: number; code: string }>) => {
    const out = current.map((s) => ({ ...s }))
    for (const rej of rejects) {
      const idx = rej.slide - 1
      if (idx < 0 || idx >= out.length) continue
      const slide = out[idx]
      const prior = out.slice(0, idx).map((s) => ({ title: s.title, body: s.body }))
      if (slide.role === 'hook' || idx === 0) {
        const fb = buildFallbackHook(themeText, themeText)
        slide.title = fb.title
        slide.body = fb.body
      } else if (slide.role === 'close' || idx === out.length - 1) {
        slide.body = buildFallbackCloseBody(themeText, prior)
      } else {
        slide.body = buildFallbackSupportBody(
          slide.role === 'context' ? 'context' : 'build',
          prior,
          themeText,
          idx,
        )
      }
    }
    return out
  }

  let working = slides
  let lastMeta: UgcQaPassMeta = { provider: 'ollama', model, ok: false }
  let lastRejects: Array<{ slide: number; code: string; reason: string }> = []

  for (let attempt = 0; attempt < 2; attempt++) {
    onProgress?.(
      `Semantic QA pass ${attempt + 1}/2 (${lastMeta.provider || 'ollama'})…`,
    )
    const { raw, meta, inputSlides } = await runOnce(working)
    lastMeta = meta
    if (!meta.ok || !raw) {
      auditLog('qa_provider_fail', {
        attempt,
        provider: meta.provider,
        error: meta.error || 'empty',
      })
      if (attempt === 0) {
        onProgress?.(`QA provider hiccup — repairing + retry (${meta.error || 'empty'})`)
        working = repairRejected(
          working,
          working.map((_, i) => ({ slide: i + 1, code: 'qa_failed' })),
        )
        continue
      }
      onProgress?.(`QA failed after provider error — export blocked (${meta.error || 'empty'})`)
      auditLog('qa_blocked', { reason: meta.error || 'empty', provider: meta.provider })
      return {
        slides: working,
        qa: { ...meta, ok: false, error: `qa_provider:${meta.error || 'empty'}` },
      }
    }

    let polished: UgcStorySlide[]
    try {
      polished = applyPolished(working, raw, inputSlides)
    } catch (err) {
      const parseErr = err instanceof Error ? err.message : String(err)
      auditLog('qa_parse_fail', { attempt, error: parseErr })
      if (attempt === 0) {
        onProgress?.(`QA parse fail — repairing + retry`)
        working = repairRejected(working, [{ slide: 1, code: 'parse_fail' }])
        continue
      }
      onProgress?.(`QA parse failed — export blocked (${parseErr})`)
      auditLog('qa_blocked', { reason: parseErr, provider: meta.provider })
      return {
        slides: working,
        qa: { ...meta, ok: false, error: `qa_parse:${parseErr}` },
      }
    }

    const rejects = parseRejects(raw)
    lastRejects = rejects
    lastMeta = { ...meta, rejects }
    if (!rejects.length) {
      onProgress?.(`Semantic QA PASS (${meta.provider}/${meta.model})`)
      return { slides: polished, qa: lastMeta }
    }
    if (attempt === 0) {
      onProgress?.(
        `QA rejects ${rejects.length} slide(s) — ${rejects.map((r) => r.code).join(', ')} — repairing`,
      )
      working = repairRejected(polished, rejects)
      continue
    }
    onProgress?.(
      `QA still rejects after repair — export blocked (${rejects[0]?.code || 'reject'})`,
    )
    auditLog('qa_blocked', {
      reason: 'rejects_after_repair',
      rejects,
      provider: meta.provider,
    })
    return {
      slides: polished,
      qa: { ...lastMeta, ok: false, error: `qa_reject:${rejects[0]?.code || 'reject'}` },
    }
  }

  return {
    slides: working,
    qa: { ...lastMeta, ok: false, error: `qa_blocked:${lastRejects[0]?.code || lastMeta.error || 'unknown'}` },
  }
}
