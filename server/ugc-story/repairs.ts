/** Post-generation repairs: story order, repeats, hook questions and final slide cleanup. (Split out of ugc-story-engine.ts.) */

import { isChristmasGiftsNiche } from '../profile-brand.js'
import { finalizeCloseSlideCta, ugcActiveCta } from '../ugc-cta-normalize.js'
import {
    ensureHookQuestionMark,
    stripTitleEchoFromBody
} from '../ugc-hook-templates.js'
import { hasEarlyProductPitch } from '../ugc-lt-classes.js'
import {
    assertShipableLtSlide,
    collectSlideIssues,
    countGenericFillerSlides,
    demoteLtTitleCase,
    isBuildCloseEcho,
    isGibberishLtCopy,
    isNearDuplicateSentenceKey,
    isOffTopicNonFoodLtCopy,
    normalizeSentenceKey,
    sanitizeLtCopyFields,
    slidesHaveBrandAnchor,
    textHasEngagementBait,
    UGC_GENERIC_FILLER_PATTERNS,
    UGC_SOLUTION_PITCH_RE
} from '../ugc-lt-normalize.js'
import { buildFallbackCloseBody, buildFallbackHook, buildFallbackSupportBody } from './fallbacks.js'
import { isDuplicateSlideCopy, isParaphraseSlideCopy } from './similarity.js'
import { BODY_MAX, clipField, clipHookTitle, splitSentences, TITLE_MAX, type UgcStorySlide } from './text.js'

/** Guarantee close-slide CTA + hook title/body split after model output. */
export function finalizeBatchSlides(slides: UgcStorySlide[], defaultCta: string): UgcStorySlide[] {
  const ctaDefault = defaultCta.trim() || ugcActiveCta()
  const multi = slides.length > 1
  return slides.map((slide, i) => {
    let next = slide
    if ((slide.role === 'hook' || i === 0) && !slide.title.trim() && slide.body.includes('?')) {
      const sents = splitSentences(slide.body)
      const q = sents.find((s) => s.includes('?')) || sents[0]
      if (q) {
        const rest = sents.filter((s) => s !== q)
        next = {
          ...next,
          title: clipHookTitle(demoteLtTitleCase(q), TITLE_MAX),
          body: clipField(rest.join(' ') || slide.body, BODY_MAX),
        }
      }
    }
    const isClose = slide.role === 'close' || (multi && i === slides.length - 1)
    if (isClose && multi) {
      const hook = slides[0]
      if (
        isDuplicateSlideCopy(next.title, next.body, [
          { title: hook.title, body: hook.body },
        ])
      ) {
        next = {
          ...next,
          body: buildFallbackCloseBody('', [{ title: hook.title, body: hook.body }]),
        }
      }
    }
    // Final sanitize pass — catches anything that slipped before persist/export
    const cleaned = sanitizeLtCopyFields({
      title: next.title,
      body: next.body,
      ...(isClose ? { cta: ctaDefault } : next.cta !== undefined ? { cta: next.cta } : {}),
    })
    const isHook = slide.role === 'hook' || i === 0
    const hookTitle = ensureHookQuestionMark(cleaned.title)
    const hookBody = isHook
      ? stripTitleEchoFromBody(hookTitle, ensureHookBodyQuestions(cleaned.body))
      : cleaned.body
    const out: UgcStorySlide = {
      ...next,
      title: hookTitle,
      body: hookBody,
      ...(isClose
        ? { role: slide.role === 'close' ? 'close' : next.role || 'close', cta: finalizeCloseSlideCta(ctaDefault, ctaDefault) }
        : cleaned.cta !== undefined
          ? { cta: cleaned.cta }
          : {}),
    }
    assertShipableLtSlide({ title: out.title, body: out.body, role: out.role })
    return out
  })
}

/** Embedded questions in hook copy must read as questions, not flat statements. */
export function ensureHookBodyQuestions(body: string): string {
  return body
    .split('\n')
    .map((line) => {
      const sentences = line.split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter(Boolean)
      if (!sentences.length) return line
      return sentences
        .map((sentence, idx) => {
          if (sentence.endsWith('?') || sentence.endsWith('!')) return sentence
          const embedded =
            /\b(galvoji|svarstai|nežinai|spėlioji|klausi savęs)\b[^.!?]*(?<!\p{L})(ką|kaip|kodėl|nuo ko|ko)(?!\p{L})/iu.test(
              sentence,
            )
          if (embedded) return `${sentence.replace(/[.…]+$/u, '').trim()}?`
          const priorHasQ = sentences.slice(0, idx).some((s) => s.includes('?'))
          if (
            priorHasQ &&
            /^(Tu nori|Tu norėtum|Supranti|Galbūt)\b/iu.test(sentence) &&
            !sentence.endsWith('?')
          ) {
            return `${sentence.replace(/[.…]+$/u, '').trim()}?`
          }
          if (/\b(Supranti|Jauti)[^.!?]*\bpo valgio\b/iu.test(sentence) && !sentence.endsWith('?')) {
            return `${sentence.replace(/[.…]+$/u, '').trim()}?`
          }
          return sentence
        })
        .join(' ')
    })
    .join('\n')
}

export const SUGAR_CONTEXT_RE = /\b(cukr|sald)/iu

export const SATIETY_BUILD_RE = /\b(sotum|baltym|skaidul)/iu

export const SUGAR_CONTRAST_RE = /\b(ko cukrus|nesuteik)/iu

export const SUGAR_CONTRAST_SENTENCE = 'Ko cukrus nesuteikia — ilgalaikio sotumo.'

/** When prior slide discussed sugar, satiety/build slide must contrast what sugar lacks. */
export function repairSugarSatietyContrast(slides: UgcStorySlide[]): void {
  if (isChristmasGiftsNiche()) return
  for (let i = 1; i < slides.length; i++) {
    const slide = slides[i]
    if (slide.role !== 'build' && slide.role !== 'context') continue
    const current = `${slide.title || ''} ${slide.body || ''}`.trim()
    if (!SATIETY_BUILD_RE.test(current) || SUGAR_CONTRAST_RE.test(current)) continue
    const priorTexts = slides
      .slice(0, i)
      .map((s) => `${s.title || ''} ${s.body || ''}`)
      .join(' ')
    if (!SUGAR_CONTEXT_RE.test(priorTexts)) continue
    slide.body = clipField(`${SUGAR_CONTRAST_SENTENCE} ${slide.body || ''}`.trim(), BODY_MAX)
  }
}

export function repairStoryOrderAndRepeats(
  slides: UgcStorySlide[],
  topic = '',
  opts?: { themeHook?: string; themeBody?: string },
): UgcStorySlide[] {
  const out = slides.map((slide) => ({ ...slide }))
  let droppedSentenceCount = 0

  const hook = out[0]
  if (hook?.title?.trim() && hook.body) {
    hook.body = clipField(stripTitleEchoFromBody(hook.title, hook.body), BODY_MAX)
  }

  if (hook) {
    const hookCombined = `${hook.title || ''} ${hook.body || ''}`.trim()
    const hookBroken =
      !hook.body?.trim() ||
      hook.body.trim().length < 28 ||
      isGibberishLtCopy(hookCombined) ||
      isOffTopicNonFoodLtCopy(hookCombined) ||
      collectSlideIssues({ title: hook.title, body: hook.body, role: 'hook' }).some(
        (issue) => issue.code === 'gibberish' || issue.code === 'empty',
      )
    if (hookBroken) {
      const fb = buildFallbackHook(opts?.themeHook || topic, opts?.themeBody || '')
      hook.title = fb.title
      hook.body = fb.body
    }
  }

  if (out.length >= 2) {
    for (let i = 0; i < out.length; i++) {
      const slide = out[i]
      const isClose = slide.role === 'close' || slide.role === 'punch' || i === out.length - 1
      if (isClose) continue
      const combined = `${slide.title || ''} ${slide.body || ''}`
      if (!UGC_SOLUTION_PITCH_RE.test(combined) && !hasEarlyProductPitch(combined)) continue
      const prior = out.slice(0, i).map((s) => ({ title: s.title, body: s.body }))
      if (slide.title && (UGC_SOLUTION_PITCH_RE.test(slide.title) || hasEarlyProductPitch(slide.title))) {
        slide.title = ''
      }
      const kept = splitSentences(slide.body || '').filter(
        (sentence) => !UGC_SOLUTION_PITCH_RE.test(sentence) && !hasEarlyProductPitch(sentence),
      )
      let body = kept.join(' ').trim()
      if (body.length < 28) {
        body = buildFallbackSupportBody(slide.role === 'context' ? 'context' : 'build', prior, topic, i)
      }
      slide.body = clipField(body, BODY_MAX)
    }
  }

  const seen: string[] = []
  for (let i = 0; i < out.length; i++) {
    const titleKey = normalizeSentenceKey(out[i].title || '')
    if (titleKey.split(' ').filter(Boolean).length >= 6 && !isNearDuplicateSentenceKey(titleKey, seen)) {
      seen.push(titleKey)
    }
    const original = (out[i].body || '').trim()
    if (!original) continue
    const kept: string[] = []
    for (const sentence of splitSentences(original)) {
      const key = normalizeSentenceKey(sentence)
      const words = key.split(' ').filter(Boolean).length
      if (words >= 6 && isNearDuplicateSentenceKey(key, seen)) {
        droppedSentenceCount++
        continue
      }
      if (words >= 6) seen.push(key)
      kept.push(sentence)
    }
    let body = kept.join(' ').trim()
    if (body.length < 28) {
      const prior = out.slice(0, i).map((slide) => ({ title: slide.title, body: slide.body }))
      body =
        out[i].role === 'close'
          ? buildFallbackCloseBody(topic, prior)
          : buildFallbackSupportBody(out[i].role === 'context' ? 'context' : 'build', prior, topic, i)
      for (const sentence of splitSentences(body)) {
        const key = normalizeSentenceKey(sentence)
        if (key.split(' ').filter(Boolean).length >= 6 && !isNearDuplicateSentenceKey(key, seen)) {
          seen.push(key)
        }
      }
    }
    out[i].body = clipField(body, BODY_MAX)
  }

  for (let pass = 0; pass < 4; pass++) {
    let changed = false
    for (let i = 1; i < out.length; i++) {
      const slide = out[i]
      if (slide.role === 'close' || slide.role === 'hook') continue
      const prior = out.slice(0, i).map((s) => ({ title: s.title, body: s.body }))
      if (!isParaphraseSlideCopy(slide.title || '', slide.body || '', prior)) continue
      slide.body = clipField(
        buildFallbackSupportBody(
          slide.role === 'context' ? 'context' : 'build',
          prior,
          topic,
          i + pass,
        ),
        BODY_MAX,
      )
      changed = true
    }
    if (!changed) break
  }

  const closeIdx = out.length - 1
  for (let i = closeIdx - 1; i >= 1; i--) {
    const slide = out[i]
    if (slide.role !== 'build' && slide.role !== 'context') continue
    const closeText = `${out[closeIdx]?.title || ''} ${out[closeIdx]?.body || ''}`.trim()
    const buildText = `${slide.title || ''} ${slide.body || ''}`.trim()
    if (!isBuildCloseEcho(buildText, closeText)) break
    const prior = out.slice(0, i).map((s) => ({ title: s.title, body: s.body }))
    slide.body = clipField(
      buildFallbackSupportBody(slide.role === 'context' ? 'context' : 'build', prior, topic, i + 2),
      BODY_MAX,
    )
    break
  }

  repairSugarSatietyContrast(out)

  for (let i = 0; i < out.length; i++) {
    const slide = out[i]
    if (slide.role === 'close' || slide.role === 'hook') continue
    if (!textHasEngagementBait(`${slide.title || ''} ${slide.body || ''}`)) continue
    const prior = out.slice(0, i).map((s) => ({ title: s.title, body: s.body }))
    slide.body = clipField(
      buildFallbackSupportBody(
        slide.role === 'context' ? 'context' : 'build',
        prior,
        topic,
        i,
      ),
      BODY_MAX,
    )
  }

  const finalCloseIdx = out.length - 1
  const closeSlide = out[finalCloseIdx]
  if (closeSlide) {
    const priorForClose = out.slice(0, finalCloseIdx).map((s) => ({ title: s.title, body: s.body }))
    if (isParaphraseSlideCopy(closeSlide.title || '', closeSlide.body || '', priorForClose)) {
      closeSlide.body = clipField(buildFallbackCloseBody(topic, priorForClose), BODY_MAX)
    }
  }

  if (!slidesHaveBrandAnchor(out.map((s) => ({ body: s.body, cta: s.cta, role: s.role })))) {
    const priorForAnchor = out.slice(0, finalCloseIdx).map((s) => ({ title: s.title, body: s.body }))
    out[finalCloseIdx].body = clipField(
      buildFallbackCloseBody(isChristmasGiftsNiche() ? 'kalėdinė dovana' : 'meal planning', priorForAnchor),
      BODY_MAX,
    )
  }

  if (countGenericFillerSlides(out) >= 2) {
    const hook = out[0]
    const hookText = `${hook?.title || ''} ${hook?.body || ''}`
    if (hook && UGC_GENERIC_FILLER_PATTERNS.some((re) => re.test(hookText))) {
      const prior = out.slice(1).map((s) => ({ title: s.title, body: s.body }))
      hook.body = clipField(
        buildFallbackSupportBody('context', prior, topic, 3),
        BODY_MAX,
      )
    }
  }

  return out
}
