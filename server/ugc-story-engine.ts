/**
 * PostMaker-style UGC story engine — hook × arc matrix, role-based slides, dedupe, calmer captions.
 * Lithuanian (lt-LT) for slides + Discord; visual pipeline unchanged on the client.
 */

import { ollamaGenerateJson, ollamaWarmModel, type OllamaCallType } from './ollama-client.js'
import { extractJsonObject, coerceSlidesArray, salvageSlidesJsonText } from './json-extract.js'
import {
  normalizeLtUgcMultiline,
  sanitizeLtCopyFields,
  isGibberishLtCopy,
  hasFormalRegister,
  assertShipableLtSlide,
  isBuildCloseEcho,
  expandBareHookTitle,
  collectStoryIssues,
  collectSlideIssues,
  demoteLtTitleCase,
  normalizeSentenceKey,
  isNearDuplicateSentenceKey,
  sentenceKeyWordOverlap,
  UGC_SOLUTION_PITCH_RE,
  UGC_GENERIC_FILLER_PATTERNS,
  countGenericFillerSlides,
  textHasEngagementBait,
  slidesHaveBrandAnchor,
  isOffTopicNonFoodLtCopy,
  type NormalizeLtCopyState,
  UGC_KALEDU_DIET_LEAK_RE,
  KALEDU_THEME_SUBJECTS,
  kaleduThemeDrift,
} from './ugc-lt-normalize.js'
import { checkLtSpelling, ensureLtSpeller, isLtSpellerReady } from './ugc-lt-spellcheck.js'
import {
  finalizeHookTitle,
  isInvalidHookTitle,
  ensureHookQuestionMark,
  isInterrogativeHookTitle,
  stripTitleEchoFromBody,
  finalizeHookBody,
  pickSlotHookBody,
  KALEDU_HOOK_BODY_OPENERS,
  normalizeBatchHookStyle,
  UGC_BATCH_SAFE_HOOK_STYLES,
} from './ugc-hook-templates.js'
import {
  getUgcSeasonAvoidHint,
  getUgcSeasonContext,
  isSeasonalUgcTheme,
  isSeasonFillerRepeat,
  sanitizeLtSeasonCopy,
  stripSeasonFiller,
  trimCaptionBody,
  UGC_CAPTION_BODY_MAX,
  UGC_CAPTION_BODY_MIN,
} from './ugc-season-context.js'
import {
  buildUgcVarietyBanBlock,
  isRepeatOfRecentPost,
  isRepeatOfRecentSlideBody,
  rankByLedgerFreshness,
  recordUgcVarietyEntry,
} from './ugc-variety-ledger.js'
import { needsUgcLiteOllama, resolveUgcOllamaModel, resolveUgcOllamaNumCtx, resolveUgcOllamaNumCtxBatch, resolveUgcOllamaNumGpu, resolveUgcOllamaKeepAliveActive } from './ugc-env-bridge.js'
import {
  qaGenerateJson,
  UGC_QA_GRAMMAR_APPENDIX,
  UGC_LT_SEMANTIC_QA_PROMPT,
  isUgcQaEnabled,
  type UgcQaPassMeta,
} from './ugc-qa-client.js'
import { hasEarlyProductPitch } from './ugc-lt-classes.js'
import {
  beginUgcAuditPost,
  runUgcAuditPost,
  auditFallback,
  auditLog,
  auditWrite,
  finalizeUgcAuditPost,
  isUgcAuditActive,
} from './ugc-batch-audit.js'
import { finalizeCloseSlideCta, ugcActiveCta } from './ugc-cta-normalize.js'
import { isChristmasGiftsNiche } from './profile-brand.js'
import { currentBusinessProfile } from './business-profiles.js'
import { pickKaleduCta, pickStoryAwareKaleduCta } from './ugc-kaledu-cta.js'
import {
  attachKaleduSlideProducts,
  copyNamesProduct,
  requiredKaleduProductIds,
  buildKaleduProductContract,
  productResolutionPromptLines,
  applyReservedProductResolution,
  enforceKaleduProductSlide,
  formatKaleduProductBrief,
  loadKaleduCatalog,
  kaleduInventedProductMentions,
  kaleduProductSlideVerdict,
  repairKaleduProductConsistency,
  resolveProductAssets,
  routeKaleduStory,
  productTypePhrase,
  recordKaleduProductUsage,
  repairInventedProductCopy,
  rewriteInventedProductSentence,
  type KaleduCatalogProduct,
  type KaleduStoryMode,
  type UgcThemeKind,
} from './ugc-kaledu-catalog.js'
import {
  buildKaleduQaJudgePrompt,
  KALEDU_QA_JUDGE_SYSTEM,
  UGC_LT_QA_JUDGE_SYSTEM,
  countKaleduQaCategories,
  isSpellNoteOnly,
  findMissingQuestionMarks,
  findRegisterErrors,
  kaleduDeterministicQa,
  normalizeDirectQuestionPunctuation,
  repairUgcQuestionAndCollocation,
  repairProductSceneContinuity,
  repairNativeSemantic,
  kaleduRewriteHints,
  mergeKaleduQaFlags,
  parseKaleduQaJudge,
  parseCombinedKaleduQa,
  type KaleduQaFlag,
} from './ugc-kaledu-final-qa.js'
import {
  UGC_BATCH_FAST_SKILL,
  UGC_BATCH_LITE_SKILL,
  UGC_LT_COPY_SKILL,
  UGC_LT_NATIVE_REWRITE_SYSTEM,
  UGC_KALEDU_NATIVE_REWRITE_SYSTEM,
  ugcActiveNativeRewriteSystem,
  ugcActiveCopySkill,
  ugcActiveOllamaSystemPrompt,
  ugcActiveCloseCtaContext,
  ugcActiveAngleHints,
  buildUgcAuditPromptSnapshot,
  stripEnglishCopyLabels,
  buildJsonRetryReminder,
} from './ugc-copy-skill.js'
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
} from './ugc-kaledu-native.js'
import { applyEmphaticPayoffPunctuation, classifyCardPunctuation } from './ugc-kaledu-card-leaks.js'
import {
  chunkResultTelemetry,
  pickDebtRepairTarget,
  recordModelCall,
  resetModelCallLog,
  summarizeModelCalls,
  updateProductDebt,
  validateRewrittenSlide,
} from './ugc-kaledu-rewrite-gate.js'
import { applyWarmPayoffPunctuation, normalizeKaleduEmojiBudget } from './ugc-kaledu-emoji.js'
import {
  ensureKaleduProductIndexFresh,
  kaleduIndexCachePath,
  rankCatalogProducts,
  watchKaleduCatalog,
} from './ugc-kaledu-product-index.js'
import { assignSlideVisuals, checkProductVisual, resolveProductVisuals } from './ugc-kaledu-visuals.js'

const TITLE_MAX = 64
const BODY_MAX = 380

export type UgcStorySlide = {
  id: string
  title: string
  body: string
  cta?: string
  role?: string
  productId?: string
  productVariantId?: string
  productImageSrc?: string
  visualIntent?: string
  showProductPrice?: boolean
  productPriceLabel?: string
}

export const UGC_MIN_STORY_SLIDES = 3
export const UGC_MAX_STORY_SLIDES = 12
export const UGC_MIN_SENTENCES_PER_SLIDE = 1
export const UGC_MAX_SENTENCES_PER_SLIDE = 5

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

const LT_STOPWORDS = new Set([
  'ir', 'su', 'po', 'kad', 'tai', 'yra', 'bet', 'nes', 'jau', 'dar', 'tik', 'kaip', 'kai',
  'tavo', 'tau', 'turi', 'būti', 'bus', 'gali', 'labai', 'daug', 'mažai', 'vis', 'be', 'per',
  'nuo', 'iki', 'apie', 'kas', 'kur', 'kodėl', 'jei', 'tada', 'ten', 'čia', 'todėl',
])

function ltContentToken(w: string): string {
  const base = w.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  if (base.length <= 3 || LT_STOPWORDS.has(base)) return ''
  if (base.length <= 5) return base
  return base.slice(0, Math.max(4, base.length - 2))
}

const THEME_PHRASE_RES = [/alk/i, /kelion/i, /vakarien/i, /plan/i, /greit/i, /paprast/i, /bad/i, /nuovarg/i]

/** Fraction of content tokens shared with any prior slide (0–1). High = repetitive theme. */
export function ugcSlideThemeOverlap(newText: string, priorTexts: string[]): number {
  const tokens = (text: string) => {
    const out = new Set<string>()
    for (const w of text.toLowerCase().replace(/[^\p{L}\s]/gu, ' ').split(/\s+/)) {
      const key = ltContentToken(w)
      if (key) out.add(key)
    }
    return out
  }
  const newTokens = tokens(newText)
  let tokenMax = 0
  if (newTokens.size > 0) {
    for (const prior of priorTexts) {
      const priorTokens = tokens(prior)
      let shared = 0
      for (const t of newTokens) if (priorTokens.has(t)) shared++
      tokenMax = Math.max(tokenMax, shared / newTokens.size)
    }
  }
  let themeMax = 0
  for (const prior of priorTexts) {
    const sharedThemes = THEME_PHRASE_RES.filter((re) => re.test(newText) && re.test(prior)).length
    if (sharedThemes >= 2) themeMax = Math.max(themeMax, 0.3 + sharedThemes * 0.12)
  }
  return Math.max(tokenMax, themeMax)
}

const SLIDE_PARAPHRASE_OVERLAP = 0.35
const SLIDE_PARAPHRASE_OVERLAP_BUILD = 0.3
const POST_MEAL_SLEEPINESS_RE = /\b(mieguistum\w*.*po\s+piet|po\s+piet.*mieguistum\w*)\b/iu

/** True when slide copy paraphrases an earlier slide (token overlap or near-dup fingerprint). */
export function isParaphraseSlideCopy(
  title: string,
  body: string,
  prior: Array<{ title?: string; body?: string; text?: string }>,
): boolean {
  if (isDuplicateSlideCopy(title, body, prior)) return true
  const combined = [title, body].filter(Boolean).join(' ').trim()
  if (combined.length < 24) return false
  const priorTexts = prior
    .map((p) => p.text || [p.title, p.body].filter(Boolean).join(' '))
    .filter(Boolean)
  if (
    priorTexts.some(
      (priorText) =>
        POST_MEAL_SLEEPINESS_RE.test(combined) && POST_MEAL_SLEEPINESS_RE.test(priorText),
    )
  ) {
    return true
  }
  const threshold =
    prior.length >= 2 && prior.length <= 5 ? SLIDE_PARAPHRASE_OVERLAP_BUILD : SLIDE_PARAPHRASE_OVERLAP
  return ugcSlideThemeOverlap(combined, priorTexts) >= threshold
}

export function collectParaphraseSlideIssues(
  slides: Array<{ title?: string; body?: string; role?: string }>,
): Array<{ code: string; message: string; slide: number; role?: string; snippet: string }> {
  const failures: Array<{ code: string; message: string; slide: number; role?: string; snippet: string }> = []
  const closeIdx = slides.length - 1
  const closeText = `${slides[closeIdx]?.title || ''} ${slides[closeIdx]?.body || ''}`.trim()
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i]
    const prior = slides.slice(0, i).map((s) => ({ title: s.title, body: s.body }))
    if (isParaphraseSlideCopy(slide.title || '', slide.body || '', prior)) {
      failures.push({
        code: 'duplicate_slide_paraphrase',
        message: 'Slide paraphrases an earlier slide instead of adding a new beat',
        slide: i + 1,
        role: slide.role,
        snippet: `${slide.title || ''} ${slide.body || ''}`.trim().slice(0, 140),
      })
    }
    if (
      i < closeIdx &&
      (slide.role === 'build' || slide.role === 'context') &&
      closeText &&
      isBuildCloseEcho(`${slide.title || ''} ${slide.body || ''}`, closeText)
    ) {
      failures.push({
        code: 'build_close_echo',
        message: 'Build slide previews the close payoff instead of adding a new beat',
        slide: i + 1,
        role: slide.role,
        snippet: `${slide.title || ''} ${slide.body || ''}`.trim().slice(0, 140),
      })
    }
  }
  return failures
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

const ROLE_BEAT_GUIDE: Record<string, string> = {
  hook: 'ĮVYKIS: konkreti akimirka ar klausimas iš temos — sustabdo scroll. Be sprendimo, be CTA, be emoji.',
  context:
    'PRIEŽASTIS: kodėl taip nutinka — paaiškink mechanizmą, ne pakartok hook. Nauji daiktavardžiai, nauja mintis. Be sprendimo.',
  build:
    'POSŪKIS: nauja įžvalga, kurios dar nebuvo — ką tai keičia praktiškai. Nekartok ankstesnių skaidrių žodžių ar temos.',
  close:
    'REZULTATAS: kas pasikeičia, kai problema išspręsta. Nekartok hook. cta = tiksliai „Apsilankyk tavoknyga.com ir pradėk 5 min. testą! 🤩" (vieną kartą, NE body). Jokio naujo klausimo.',
  punch: 'Vienas stiprus, pilnas sakinys — visa mintis.',
}

export { isSeasonFillerRepeat, seasonEchoCount, stripSeasonFiller } from './ugc-season-context.js'

function clipField(text: string, max: number): string {
  const trimmed = text.replace(/\s+/g, ' ').trim()
  if (trimmed.length <= max) return trimmed
  const slice = trimmed.slice(0, max)
  const lastSpace = slice.lastIndexOf(' ')
  if (lastSpace > Math.floor(max * 0.55)) return slice.slice(0, lastSpace).trim()
  return slice.trim()
}

/** Clip hook title without ever stripping a required trailing "?". */
function clipHookTitle(title: string, max = TITLE_MAX): string {
  const raw = title.replace(/\s+/g, ' ').trim()
  const needsQ = isInterrogativeHookTitle(raw)
  const core = raw.replace(/[.!?…]+$/u, '').trim()
  const budget = needsQ ? Math.max(12, max - 1) : max
  let out = clipField(core, budget)
  if (needsQ) {
    out = ensureHookQuestionMark(out)
  }
  return out
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n+/)
    .flatMap((block) => block.split(/(?<=[.!?…])\s+/))
    .map((s) => s.trim())
    .filter(Boolean)
}

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

export function batchChunkSize(slideCount: number): number {
  if (slideCount <= 3) return slideCount
  if (slideCount === 4) return 4
  return 3
}

/** After a truncation or timeout, the next request is smaller. A success keeps the current size. */
export function nextChunkSize(requested: number, result: 'OK' | 'TRUNCATED_RESPONSE' | 'TIMEOUT' | 'VALIDATION_REJECTION'): number {
  if (result === 'OK') return Math.max(1, requested)
  return Math.max(1, requested - 1)
}

export function slideCopyFingerprint(title: string, body: string): string {
  return [title, body].filter(Boolean).join(' ').toLowerCase().replace(/\s+/g, ' ').trim()
}

function slideTokenSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}]+/u)
      .filter((w) => w.length >= 4),
  )
}

function tokenOverlapRatio(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const w of a) if (b.has(w)) inter++
  return inter / Math.min(a.size, b.size)
}

export function isDuplicateSlideCopy(
  title: string,
  body: string,
  prior: Array<{ title?: string; body?: string; text?: string }>,
): boolean {
  const key = slideCopyFingerprint(title, body)
  if (key.length < 24) return false
  const keyTokens = slideTokenSet(key)
  const keyBody = slideCopyFingerprint('', body)
  for (const p of prior) {
    const pKey = p.text
      ? slideCopyFingerprint('', p.text)
      : slideCopyFingerprint(p.title || '', p.body || '')
    if (!pKey || pKey.length < 24) continue
    if (key === pKey) return true
    const shorter = key.length < pKey.length ? key : pKey
    const longer = key.length < pKey.length ? pKey : key
    if (shorter.length >= 40 && longer.includes(shorter.slice(0, Math.min(50, shorter.length)))) {
      return true
    }
    // Shared opening beat (close echoing hook opener)
    if (shorter.length >= 28 && longer.includes(shorter.slice(0, 28))) {
      return true
    }
    const pBody = p.text ? pKey : slideCopyFingerprint('', p.body || '')
    if (keyBody.length >= 24 && pBody.length >= 24) {
      const headK = keyBody.slice(0, 24)
      const headP = pBody.slice(0, 24)
      if (keyBody.includes(headP) || pBody.includes(headK)) return true
    }
    // Near-paraphrase (close echoing hook / prior slide)
    if (key.length >= 36 && pKey.length >= 36 && tokenOverlapRatio(keyTokens, slideTokenSet(pKey)) >= 0.55) {
      return true
    }
  }
  return false
}

/**
 * Christmas fallback copy is validated like model copy: contamination, product truth,
 * deterministic final QA, slide ship gate, in-post duplicates — and ordered by the
 * variety ledger so the same canonical line is not reused across a batch.
 */
export function pickValidatedKaleduFallback(
  role: string,
  candidates: string[],
  prior: Array<{ title?: string; body?: string; text?: string }> = [],
  allowed: KaleduCatalogProduct[] = [],
): string | null {
  const priorText = prior.map((p) => [p.title, p.body ?? p.text].filter(Boolean).join(' ')).join(' ')
  const priorKeys = splitSentences(priorText)
    .map((s) => normalizeSentenceKey(s))
    .filter((key) => key.split(' ').filter(Boolean).length >= 4)
  const passes = (body: string) => {
    if (UGC_KALEDU_DIET_LEAK_RE.test(body)) return false
    if (kaleduInventedProductMentions(body, allowed).length) return false
    if (kaleduDeterministicQa([{ body, role }], { theme: '', allowed }).length) return false
    if (isParaphraseSlideCopy('', body, prior)) return false
    for (const sentence of splitSentences(body)) {
      const key = normalizeSentenceKey(sentence)
      if (priorKeys.includes(key) || isNearDuplicateSentenceKey(key, priorKeys, 0.7)) return false
    }
    try {
      assertShipableLtSlide({ body, role })
      return true
    } catch {
      return false
    }
  }
  return rankByLedgerFreshness(candidates).find(passes) || null
}

export function buildFallbackCloseBody(
  topic: string,
  prior: Array<{ title?: string; body?: string; text?: string }> = [],
): string {
  const candidates = getFallbackCloseBodyCandidates(topic)
  if (isChristmasGiftsNiche()) {
    const picked = pickValidatedKaleduFallback('close', candidates, prior)
    if (picked) return picked
  }
  return (
    candidates.find((body) => {
      if (isDuplicateSlideCopy('', body, prior)) return false
      try {
        assertShipableLtSlide({ body, role: 'close' })
        return true
      } catch {
        return false
      }
    }) || candidates[1]
  )
}

/**
 * Theme anchors the story gate requires in the first three slides. Rescued slides must
 * carry them too, otherwise a rescued post dies later on `theme_drift`.
 */
const THEME_ANCHOR_LEADS: Array<{ re: RegExp; lead: string }> = [
  {
    re: /diabet|gliukoz|cukraus kiek/iu,
    lead: 'Gliukozės svyravimai kasdien keičia tavo savijautą.',
  },
  {
    re: /ištverm|endurance|sport/iu,
    lead: 'Treniruotė pareikalauja energijos, kurią gauni iš maisto.',
  },
  {
    re: /kūdik|baby|pirmas maist/iu,
    lead: 'Pirmas maistas kūdikiui kelia daugiau klausimų, nei tikėjaisi.',
  },
  { re: /sūr|cheese/iu, lead: 'Sūrio gabalas šaldytuve dažnai lieka nepanaudotas.' },
  {
    re: /meal kit|maisto rinkin/iu,
    lead: 'Maisto rinkinys sutaupo laiko, kai savaitė būna įtempta.',
  },
  { re: /stres.*valg|stress.*eat/iu, lead: 'Stresas dažnai nukreipia tave prie greito užkandžio.' },
  { re: /biudžet|pinig|finans|budget/iu, lead: 'Kiekvienas neplanuotas pirkinys spaudžia biudžetą.' },
  {
    re: /laik[oy]|produktyv|planavim|time management/iu,
    lead: 'Diena be aiškaus plano prabėga greičiau, nei spėji pastebėti.',
  },
  {
    re: /šaldytuv|likuč|leftover|portion/iu,
    lead: 'Šaldytuve likę produktai dažnai lieka nepanaudoti.',
  },
  {
    re: /geležis|geležies|energij|nuovarg|iron/iu,
    lead: 'Nuovargis dažnai signalizuoja apie tai, ko organizmui trūksta.',
  },
]

const KALEDU_THEME_ANCHOR_LEADS: Array<{ re: RegExp; leads: string[] }> = [
  {
    re: /mam/iu,
    leads: [
      'Dovana mamai dažnai lieka paskutinė eilutė sąraše.',
      'Mamai visada norisi išrinkti kažką daugiau nei dar vieną smulkmeną.',
    ],
  },
  {
    re: /tėt|tėči/iu,
    leads: [
      'Dovana tėčiui dažnai virsta tuo, kas greičiausia po ranka.',
      'Tėtis sako, kad jam nieko nereikia, todėl rinktis dar sunkiau.',
    ],
  },
  {
    re: /senel|močiut/iu,
    leads: [
      'Seneliams sunku išrinkti dovaną, nes jie sako, kad visko turi.',
      'Dovana seneliui turi būti paprasta ir tikrai naudinga.',
    ],
  },
  {
    re: /por/iu,
    leads: [
      'Dovana porai dažnai tampa dar vienu daiktu į stalčių.',
      'Porai norisi dovanos, kuria abu galėtų džiaugtis kartu.',
    ],
  },
  {
    re: /paskutin|last.?minute/iu,
    leads: [
      'Paskutinė diena iki švenčių palieka mažai ramybės rinktis.',
      'Kai iki švenčių liko kelios dienos, kiekviena valanda svarbi.',
    ],
  },
  {
    re: /biudž|€|eur/iu,
    leads: [
      'Nedidelis biudžetas vis tiek gali atrodyti kaip apgalvota dovana.',
      'Su aiškia suma galvoje rinktis dovaną net paprasčiau.',
    ],
  },
  {
    re: /dekor|eglut/iu,
    leads: [
      'Šventinės dekoracijos namuose kuria nuotaiką dar prieš Kalėdas.',
      'Viena graži dekoracija gali pakeisti visą kambario nuotaiką.',
    ],
  },
  {
    re: /slapt|koleg/iu,
    leads: [
      'Slaptasis Senelis palieka per mažai laiko spėlioti pagal skonį.',
      'Dovana kolegai turi būti maloni, bet ne per daug asmeniška.',
    ],
  },
  {
    re: /vyr/iu,
    leads: [
      'Dovana vyrui dažnai stringa, kai sukiesi ratu tarp tų pačių lentynų.',
      'Vyrui dovaną išrinkti sunku, kai jis sako, kad nieko nereikia.',
    ],
  },
  {
    re: /moter/iu,
    leads: [
      'Dovana jai nebūtinai turi būti dar viena dėžutė.',
      'Moteriai norisi dovanos, kuri parodytų, kad pagalvojai būtent apie ją.',
    ],
  },
  {
    re: /jauk/iu,
    leads: [
      'Jaukumas namuose dažnai prasideda nuo vienos smulkmenos.',
      'Jauki dovana tinka tiems, kurie mėgsta vakarus namuose.',
    ],
  },
  {
    re: /dovan|kalėd|kaled|švent/iu,
    leads: [
      'Dovanos paieška dažnai virsta skuba, kai sąrašas vis ilgėja.',
      'Prieš šventes dovanų sąrašas ilgėja greičiau nei laikas.',
    ],
  },
]

function themeAnchorLead(topic: string): string {
  if (!isChristmasGiftsNiche()) {
    return THEME_ANCHOR_LEADS.find((entry) => entry.re.test(topic))?.lead || ''
  }
  const entry = KALEDU_THEME_ANCHOR_LEADS.find((row) => row.re.test(topic))
  return entry ? rankByLedgerFreshness(entry.leads)[0] : ''
}

/** Pad context/build text to target sentence count without meta scroll bait. */
export function fitSlideText(
  text: string,
  exact: number,
  role: string,
  topic: string,
  prior: Array<{ title?: string; body?: string; text?: string }> = [],
  slideIndex = 0,
): string {
  let sents = splitSentences(stripEnglishCopyLabels(text))
  while (sents.length > exact) sents.pop()
  if (sents.length < exact && sents.length > 0 && role !== 'close') {
    if (role === 'context' && sents.length < UGC_MIN_SENTENCES_PER_SLIDE) {
      const anchor = themeAnchorLead(topic)
      if (
        anchor &&
        !sents.some((s) => ugcSlideThemeOverlap(anchor, [s]) >= 0.5)
      ) {
        sents = [anchor, ...sents]
      }
      if (sents.length < UGC_MIN_SENTENCES_PER_SLIDE) {
        const priorMapped = prior.map((p) => ({
          title: p.title,
          body: p.body ?? p.text,
          text: p.text ?? p.body,
        }))
        const fb = buildFallbackSupportBody('context', priorMapped, topic, slideIndex)
        const fbSents = splitSentences(fb).filter(
          (s) => !sents.some((x) => x.toLowerCase() === s.toLowerCase()),
        )
        if (fbSents.length) {
          sents = [...fbSents.slice(0, exact - sents.length), ...sents]
        }
      }
    }
    while (sents.length < exact && sents.length > 0) break
  }
  return sents.slice(0, exact).join('\n')
}

/** Exported for pool audit tests — every line must pass ship gates. */
export const UGC_FALLBACK_CONTEXT_BODIES = [
  'Kasdieniai pasirinkimai tampa sunkesni, kai neturi aiškios krypties. Tada kiekvienas sprendimas pareikalauja daugiau laiko.',
  'Dabartinis ritmas ne visada palieka laiko ramiam pasirinkimui. Dėl to naudinga iš anksto žinoti savo kitą žingsnį.',
  'Sprendimai kaupiasi, kol pradedi atidėlioti net paprastus dalykus. Vakare lieka mažiau jėgų rinktis apgalvotai.',
  'Kai kiekvieną kartą svarstai iš naujo, pavargsti dar prieš pradėdamas. Tada renkiesi tai, kas greičiausia, o ne tai, ko nori.',
  'Dažnai priimti sprendimus sunaudoja daug energijos. Tokiais atvejais dažnai renkiamas greitas malonumas.',
  'Kiekvieno žmogaus virškinimas unikalus, todėl skirtingi produktai gali sukelti nevienodus simptomus.',
]

export const UGC_KALEDU_FALLBACK_CONTEXT_BODIES = [
  'Lentynose daug dovanų, bet vis tiek nežinai, ką rinktis. Šventė artėja, o tu vis atidedi.',
  'Sąrašas ilgėja, kol perki tai, kas po ranka. Tada dovaną dažniau imi paskubomis, užuot rinkęs pagal žmogų.',
  'Kiekvieną vakarą svarstai iš naujo ir pavargsti dar prieš parduotuvę. Tada renkiesi greičiausią daiktą.',
  'Kuo ilgiau atidedi dovanų paiešką, tuo sunkiau apsispręsti. Vakare jėgų rinktis lieka vis mažiau.',
  'Kai nežinai, kam ieškai, visos lentynos atrodo vienodos. Tada laukti švenčių sunkiau.',
  'Internete tiek dovanų pasiūlymų, kad akys raibsta. Po valandos naršymo vis dar nieko neišsirinkai.',
  'Jau kelias savaites galvoji apie dovaną, bet nežinai, nuo ko pradėti. Todėl sprendimą vis stumi vėliau.',
  'Atrodo, kad tas žmogus jau viską turi. Todėl kiekviena dovanos idėja atrodo per paprasta.',
  'Laiko iki švenčių lieka vis mažiau, o sąraše dar keli vardai. Skubant lengva nupirkti bet ką.',
  'Daug išleisti nesinori, bet ir atsitiktinės dovanos nenori. Taip rinktis tampa dar sunkiau.',
]

export const UGC_KALEDU_FALLBACK_BUILD_BODIES = [
  'Kai žinai, kam dovana, parduotuvėje lieka mažiau spėliojimo. Greičiau randi daiktą, kuris tinka.',
  'Kai žinai, kuo žmogus džiaugiasi kasdien, dovanos paieška tampa daug paprastesnė.',
  'Pradėk nuo žmogaus, ne nuo daikto. Tada dovaną rinktis ramiau ir lieka laiko pakuotei.',
  'Viena apgalvota dovana geriau už dešimt skubotų krepšelių. Tai pajunti ir biudžete.',
  'Pagalvok, kaip tas žmogus leidžia laisvą vakarą. Iš to dažnai ir gimsta geriausia dovanos idėja.',
  'Užsirašyk tris dalykus, kuriuos žmogus mėgsta. Su tokiu sąrašu dovanos pasirinkimas susiaurėja per kelias minutes.',
  'Dovana nebūtinai turi būti brangi. Svarbiau, kad ji tiktų žmogaus kasdienybei.',
  'Kartais geriausia dovana yra tai, ko žmogus pats sau nenupirktų. Tokią smulkmeną jis prisimins ilgiau.',
  'Praktiška dovana nebūtinai nuobodi. Kai žmogus ja naudojasi kasdien, ji primena apie tave.',
  'Nereikia ieškoti tobulos dovanos. Užtenka tokios, kuri tiktų būtent tam žmogui.',
]

export const UGC_KALEDU_FALLBACK_CLOSE_BODIES = [
  'Kai dovana jau išrinkta, prieš šventes daug ramiau. Žinai, kad daiktas tiks žmogui.',
  'Kai žinai, ko ieškai, dovaną išrinkti daug paprasčiau.',
  'Parinkus dovaną ramiai, švenčių laukti lengviau. Lieka daugiau ramybės.',
  'Gerai dovanai nebūtina kainuoti daug. Svarbiau, kam ją renkiesi.',
  'Net maža dovana gali pradžiuginti, jei ji tinka žmogui.',
  'Kai dovana tinka žmogui, jos kaina nebe tokia svarbi. Toks pasirinkimas prisimenamas ilgiau.',
  'Kai turi aiškią idėją, dovanų paieška trunka kelias minutes, ne kelis vakarus.',
  'Išsirinkus dovaną anksčiau, šventės prasideda be skubos. Lieka laiko ir pakuotei.',
  'Apgalvota dovana nereikalauja didelio biudžeto. Užtenka žinoti, kam ją perki.',
  'Kai dovana išrinkta pagal žmogų, jos išpakavimas tampa smagiausia vakaro dalimi.',
]

/** Exported for pool audit tests — diversified; no generic-filler self-contradictions. */
export const UGC_FALLBACK_BUILD_BODIES = [
  'Kai žinai, ką valgyti rytoj, vakare lieka mažiau spėliojimo. Taip atgauni kontrolę savo dienoje.',
  'Aiškios gairės palengvina kasdienį maisto planavimą. Taip daugiau dėmesio skiri tam, kas tau iš tikrųjų svarbu.',
  'Aiškus planas padeda iš anksto pasiruošti dienai. Kasdienius sprendimus priimi ramiau ir išvengi bereikalingo spėliojimo.',
  'Kai žingsniai surašyti, nebereikia kaskart pradėti nuo nulio. Tau lieka energijos tam, kas iš tiesų svarbu.',
  'Vienas apgalvotas maisto pasirinkimas pakeičia dešimt skubotų. Ilgainiui tai pastebi ir savijautoje, ir laike.',
  'Kai turi savaitės meniu, mažiau laiko praleidi spėliojant, ką gaminti vakare.',
  '30 klausimų testas sumažina sprendimų naštą, todėl streso metu mažiau norisi užkandžiauti.',
  'Netolygus angliavandenių ir baltymų santykis gali lemti staigius cukraus svyravimus kraujyje.',
  'Kai šaldytuve lieka produktų, aiškus savaitės meniu padeda juos panaudoti laiku, o ne išmesti.',
  'Biudžetui draugiškas maisto planas sumažina impulsyvius pirkinius ir mažiau maisto eina į šiukšlynę.',
]

export function getFallbackCloseBodyCandidates(topic: string): string[] {
  if (isChristmasGiftsNiche()) return [...UGC_KALEDU_FALLBACK_CLOSE_BODIES]
  const themeLead = /gliuten|gliadin/iu.test(topic)
    ? 'Aiškus planas be gliuteno padeda kasdien ramiai rinktis maistą.'
    : /švent|vestuv|engagement/iu.test(topic)
      ? 'Aiškus pasiruošimo planas leidžia švente mėgautis ramiau.'
      : /mokest|vienkart|payment/iu.test(topic)
        ? 'Vienkartinis sprendimas leidžia nebeplanuoti visko iš naujo.'
        : /žarn|mikrobiom|microbiome/iu.test(topic)
          ? 'Žarnynui pritaikytas planas padeda kasdien rinktis ramiau.'
          : /biudžet|pinig|finans|budget/iu.test(topic)
            ? 'Aiškus biudžeto planas padeda kasdien rinktis ramiau.'
            : /laik[oy]|produktyv|planavim|time management/iu.test(topic)
              ? 'Aiškus dienos planas padeda kasdien rinktis ramiau.'
              : 'Aiškus asmeninis planas padeda kasdien ramiai rinktis maistą.'
  const genericTail = /gliuten|gliadin|švent|vestuv|engagement|mokest|vienkart|payment|žarn|mikrobiom|microbiome/iu.test(
    topic,
  )
    ? 'Taip sutaupai laiko ir nebesiblaškai dėl kiekvieno patiekalo.'
    : 'Taip sutaupai laiko ir nebesiblaškai dėl kiekvieno sprendimo.'
  return [
    `${themeLead} ${genericTail}`,
    'Praktiškas sprendimas palieka daugiau laiko tavo dienai. Kasdien žinai, ką rinktis, todėl išvengi bereikalingo chaoso.',
    'Asmeninės gairės paverčia kasdienius pasirinkimus paprastesnius. Tau lieka daugiau laiko be nuolatinio spėliojimo.',
  ]
}

function buildFallbackSupportBody(
  role: string,
  prior: Array<{ title?: string; body?: string; text?: string }> = [],
  topic = '',
  startIndex = 0,
): string {
  const anchor = themeAnchorLead(topic)
  const contextBase = isChristmasGiftsNiche()
    ? UGC_KALEDU_FALLBACK_CONTEXT_BODIES
    : UGC_FALLBACK_CONTEXT_BODIES
  const buildBase = isChristmasGiftsNiche() ? UGC_KALEDU_FALLBACK_BUILD_BODIES : UGC_FALLBACK_BUILD_BODIES
  const base = role === 'context' ? contextBase : buildBase
  const candidates = anchor ? [...base.map((body) => `${anchor} ${body}`), ...base] : base
  if (isChristmasGiftsNiche()) {
    const picked = pickValidatedKaleduFallback(role, [...base, ...(anchor ? base.map((b) => `${anchor} ${b}`) : [])], prior)
    if (picked) return picked
  }
  const rotated = [...candidates.slice(startIndex % candidates.length), ...candidates.slice(0, startIndex % candidates.length)]
  const priorHasGenericFiller = prior.some((p) => {
    const t = p.text || p.body || ''
    return UGC_GENERIC_FILLER_PATTERNS.some((re) => re.test(t))
  })
  const rejectsBody = (body: string) => {
    if (isDuplicateSlideCopy('', body, prior)) return true
    if (hasEarlyProductPitch(body)) return true
    if (isRepeatOfRecentSlideBody(body)) return true
    if (textHasEngagementBait(body)) return true
    if (priorHasGenericFiller && UGC_GENERIC_FILLER_PATTERNS.some((re) => re.test(body))) return true
    const priorTexts = prior.map((p) => p.text || p.body || '').filter(Boolean)
    if (priorTexts.some((t) => ugcSlideThemeOverlap(body, [t]) >= 0.35)) return true
    return false
  }
  return (
    rotated.find((body) => {
      if (rejectsBody(body)) return false
      try {
        assertShipableLtSlide({ body, role })
        return true
      } catch {
        return false
      }
    }) ||
    rotated.find((body) => {
      if (rejectsBody(body)) return false
      try {
        assertShipableLtSlide({ body, role })
        return true
      } catch {
        return false
      }
    }) ||
    rotated.find((body) => !rejectsBody(body)) ||
    rotated[Math.min(startIndex, rotated.length - 1)]
  )
}

/** Deterministic hook built from the human-written theme seed — never fails the gates. */
/** Christmas hook fallbacks keyed by KALEDU_THEME_SUBJECTS label — real sentences, never theme labels. */
export const KALEDU_SUBJECT_HOOKS: Record<string, Array<{ title: string; body: string }>> = {
  mama: [
    { title: 'Ką padovanoti mamai šiemet?', body: 'Ji sako, kad nieko nereikia. Bet tuščiomis ateiti vis tiek nesinori.' },
    { title: 'Mamai vėl ta pati dovana?', body: 'Kasmet perki kažką panašaus. Šiemet dovana turi būti apgalvota.' },
  ],
  tėtis: [{ title: 'Ką padovanoti tėčiui?', body: 'Tėtis sako, kad jam nieko nereikia. Tada ieškoti dar sunkiau.' }],
  senelis: [
    { title: 'Senelis sako, kad jam nieko nereikia?', body: 'Tada dovanos ieškai ilgiau nei bet kam kitam.' },
    { title: 'Ką padovanoti seneliui?', body: 'Jam nereikia dar vienos smulkmenos lentynai.' },
  ],
  pora: [
    { title: 'Viena dovana dviem žmonėms?', body: 'Norisi, kad ja džiaugtųsi abu, o ne tik vienas.' },
    { title: 'Ką padovanoti porai?', body: 'Dovana turi tikti abiem, todėl rinktis sunkiau.' },
  ],
  vyras: [{ title: 'Ką padovanoti vyrui?', body: 'Jis viską nusiperka pats, todėl sugalvoti sunku.' }],
  moteris: [{ title: 'Ką padovanoti jai šiemet?', body: 'Ji turi beveik viską, todėl sugalvoti sunku.' }],
  draugas: [{ title: 'Ką padovanoti draugui?', body: 'Jį pažįsti gerai, bet idėjų vis tiek trūksta.' }],
  kolega: [
    { title: 'Slaptasis Senelis darbe?', body: 'Reikia dovanos kolegai, kurio beveik nepažįsti.' },
    { title: 'Ką padovanoti kolegai?', body: 'Reikia mažos dovanos, bet ne visai beasmenės.' },
  ],
  paauglys: [{ title: 'Ką padovanoti paaugliui?', body: 'Jam sunku įtikti, o klausti nesinori.' }],
  vaikas: [{ title: 'Ką padovanoti vaikui?', body: 'Jam greitai viskas nusibosta, todėl rinktis sunkiau.' }],
  dekoracijos: [
    { title: 'Dekoracijos, kurios nepabosta?', body: 'Kasmet perki naujų, o po švenčių jos vėl atsiduria dėžėje.' },
  ],
  biudžetas: [
    { title: 'Gera dovana už nedidelę sumą?', body: 'Biudžetas ribotas, bet dovana vis tiek turi atrodyti apgalvota.' },
  ],
  'paskutinė minutė': [
    { title: 'Kalėdos jau rytoj, o dovanos dar nėra?', body: 'Laiko liko mažai, todėl rinktis reikia greitai.' },
  ],
  atstumas: [
    { title: 'Kaip nudžiuginti žmogų kitame mieste?', body: 'Kai negali įteikti dovanos pats, ji turi keliauti paštu.' },
  ],
  'nauji namai': [{ title: 'Ką padovanoti į naujus namus?', body: 'Dar nežinai jų skonio, todėl rinktis sunkiau.' }],
  rinkinys: [{ title: 'Viena dovana ar kelios mažos?', body: 'Kartais kelios smulkmenos kartu pasako daugiau.' }],
  pledas: [{ title: 'Ieškai jaukios dovanos?', body: 'Nori, kad ji primintų šiltus vakarus namuose?' }],
  termosas: [{ title: 'Daug laiko praleidi kelyje?', body: 'Žiemą karšta kava kelionėje labai praverčia.' }],
  žvakė: [{ title: 'Ieškai jaukios dovanos vakarui?', body: 'Kartais užtenka šviesos ir ramaus vakaro namuose.' }],
  puodelis: [{ title: 'Dovana rytinei kavai?', body: 'Kai diena prasideda nuo kavos, tokia smulkmena praverčia.' }],
  kojinės: [{ title: 'Šilta dovana žiemai?', body: 'Kartais paprasčiausia dovana būna pati praktiškiausia.' }],
}

const KALEDU_GENERIC_HOOKS: Array<{ title: string; body: string }> = [
  { title: 'Vis dar be dovanos?', body: 'Sąrašas ilgėja, o šventė vis arčiau.' },
  { title: 'Nežinai, ką padovanoti?', body: 'Idėjų daug, bet nė viena netinka iki galo.' },
]

/** Validated Christmas hook for the theme subject; falls back to generic gift hooks. */
export function pickKaleduSubjectHook(
  themeText: string,
  prior: Array<{ title?: string; body?: string; text?: string }> = [],
  allowed: KaleduCatalogProduct[] = [],
): { title: string; body: string } {
  let subjects = KALEDU_THEME_SUBJECTS.filter((row) => row.theme.test(themeText)).map((row) => row.label)
  if (/slapt/iu.test(themeText)) subjects = ['kolega', ...subjects.filter((label) => label !== 'kolega' && label !== 'senelis')]
  const byFreshness = (hooks: Array<{ title: string; body: string }>) =>
    rankByLedgerFreshness(hooks.map((h) => `${h.title}\n${h.body}`)).map((key) => {
      const [title, body] = key.split('\n')
      return { title, body }
    })
  const ranked = [
    ...byFreshness(subjects.flatMap((label) => KALEDU_SUBJECT_HOOKS[label] || [])),
    ...byFreshness(KALEDU_GENERIC_HOOKS),
  ]
  const ok = ranked.find((hook) => {
    if (isDuplicateSlideCopy(hook.title, hook.body, prior)) return false
    if (kaleduDeterministicQa([{ ...hook, role: 'hook' }], { theme: themeText, allowed }).length) return false
    try {
      assertShipableLtSlide({ ...hook, role: 'hook' })
      return true
    } catch {
      return false
    }
  })
  return ok || KALEDU_GENERIC_HOOKS[0]
}

export function buildFallbackHook(
  themeHook: string,
  themeBody: string,
): { title: string; body: string } {
  if (isChristmasGiftsNiche()) return pickKaleduSubjectHook(`${themeHook} ${themeBody}`)
  const seedTitle = expandBareHookTitle(
    sanitizeLtSeasonCopy(stripSeasonFiller(themeHook) || themeHook).trim(),
  )
  const tavoFallback = 'Ar kasdienis maistas vis dar atrodo kaip užduotis?'
  const christmasFallback = 'Ar vis dar ieškai kalėdinės dovanos?'
  const candidates = [
    seedTitle,
    themeHook.trim(),
    isChristmasGiftsNiche() ? christmasFallback : tavoFallback,
  ]
  let title = ''
  for (const candidate of candidates) {
    const clipped = clipHookTitle(demoteLtTitleCase(candidate), TITLE_MAX)
    if (!clipped || isInvalidHookTitle(clipped)) continue
    try {
      assertShipableLtSlide({ title: clipped, body: '', role: 'hook' })
      title = clipped
      break
    } catch {
      continue
    }
  }
  if (!title) title = 'Ar kasdienis maistas vis dar atrodo kaip užduotis?'

  const bodyCandidates = [
    sanitizeLtSeasonCopy(stripSeasonFiller(themeBody) || '').trim(),
    pickSlotHookBody(`${themeHook} ${themeBody}`, 0, isChristmasGiftsNiche() ? KALEDU_HOOK_BODY_OPENERS : undefined),
    'Tokia diena kartojasi dažniau, nei norėtum. Vakare vėl svarstai tą patį klausimą.',
    'Būtent tada pasirinkimas tampa sunkesniu, nei turėtų būti.',
  ]
  let body = ''
  for (const candidate of bodyCandidates) {
    if (candidate.length < 28) continue
    const finalized = finalizeHookBody(
      `${themeHook} ${themeBody}`,
      candidate,
      1,
      isChristmasGiftsNiche() ? KALEDU_HOOK_BODY_OPENERS : undefined,
    )
    try {
      assertShipableLtSlide({ title: '', body: finalized, role: 'hook' })
      body = clipField(finalized, BODY_MAX)
      break
    } catch {
      continue
    }
  }
  if (!body) body = pickSlotHookBody(`${themeHook} ${themeBody}`, 2)
  return { title, body }
}

/** Last-resort slides so a chunk failure never kills the whole post. */
export function buildFallbackChunkSlides(opts: {
  roles: string[]
  slideStart: number
  topic: string
  themeHook: string
  themeBody: string
  defaultCta: string
  prior: Array<{ role: string; text: string }>
}): UgcStorySlide[] {
  const out: UgcStorySlide[] = []
  const prior: Array<{ title?: string; body?: string; text?: string }> = opts.prior.map((p) => ({
    text: p.text,
  }))

  for (let i = 0; i < opts.roles.length; i++) {
    const role = opts.roles[i]
    const id = `slide-${opts.slideStart + i}`
    if (role === 'hook') {
      const hook = buildFallbackHook(opts.themeHook, opts.themeBody)
      out.push({ id, title: hook.title, body: hook.body, role })
      prior.push({ title: hook.title, body: hook.body })
      continue
    }
    if (role === 'close' || role === 'punch') {
      const body = buildFallbackCloseBody(opts.topic, prior)
      out.push({ id, title: '', body, cta: opts.defaultCta || ugcActiveCta(), role: 'close' })
      prior.push({ body })
      continue
    }
    const body = buildFallbackSupportBody(role, prior, `${opts.topic} ${opts.themeHook}`, prior.length)
    out.push({ id, title: '', body, role })
    prior.push({ body })
  }
  return out
}

function batchSentenceTargets(roles: string[], _seed: number): number[] {
  // Always 2 short sentences — halves tokens vs 3–4 and speeds OpenEuroLLM a lot
  return roles.map(() => 2)
}

function roleGuideLt(role: string, index: number, defaultCta: string): string {
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

function jsonBatchExample(roles: string[], targets: number[]): string {
  const slides = roles.map((role, i) => {
    const lines = Array.from({ length: targets[i] }, (_, j) => `S${j + 1}.`)
    const item: Record<string, string> = { role, text: lines.join('\n') }
    if (role === 'close') item.cta = ugcActiveCta()
    if (role === 'hook') item.title = 'Kabliukas'
    return item
  })
  return JSON.stringify({ slides })
}

function storySoFar(slides: Array<{ role: string; text: string }>, compact = false): string {
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

function collectUsedPhrases(slides: Array<{ text: string }>): Set<string> {
  const used = new Set<string>()
  for (const slide of slides) {
    for (const sent of splitSentences(slide.text)) {
      used.add(sent.toLowerCase())
    }
  }
  return used
}

function hasRepetition(text: string, used: Set<string>, prior: Array<{ text: string }>): string | null {
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

function roleTextToUgcFields(
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

export type StoryBatchItem = { role: string; text: string; title: string; cta: string }

export type StoryBatchItems = StoryBatchItem[] & {
  truncated: boolean
  requestedCount: number
  parsedCount: number
  emptyRows: Array<{ localRow: number; globalSlide: number; role: string; message: string }>
  resultType: 'OK' | 'TRUNCATED_RESPONSE' | 'EMPTY_ROW'
}

export function parseStoryBatchPayload(
  raw: unknown,
  roles: string[],
  chunkStart = 1,
): StoryBatchItems {
  let data = raw
  if (typeof raw === 'string') data = extractJsonObject(raw)
  if (!data || typeof data !== 'object') throw new Error('Invalid JSON response')
  const items = coerceSlidesArray(data)
  if (!items) {
    const keys =
      data && typeof data === 'object' && !Array.isArray(data)
        ? Object.keys(data as object).slice(0, 12).join(',')
        : typeof data
    throw new Error(`JSON must include a "slides" array (got keys: ${keys || 'none'})`)
  }
  let slideRows: unknown[] = items
  if (slideRows.length !== roles.length) {
    if (roles.length === 1 && slideRows.length >= 1) {
      slideRows = [slideRows[0]]
    } else if (slideRows.length > roles.length) {
      slideRows = slideRows.slice(0, roles.length)
    } else if (slideRows.length >= 1) {
      // Truncated JSON — keep what we got; caller requests the rest next
      slideRows = slideRows.slice(0, slideRows.length)
    } else {
      throw new Error(`Expected ${roles.length} slides, got ${slideRows.length}`)
    }
  }
  const out = [] as StoryBatchItems
  const emptyRows: StoryBatchItems['emptyRows'] = []
  for (let i = 0; i < slideRows.length; i++) {
    const row = slideRows[i]
    if (!row || typeof row !== 'object') throw new Error(`Chunk starting @${chunkStart}: global slide ${chunkStart + i} (${roles[i] || 'build'}), local row ${i + 1} invalid`)
    const v = row as Record<string, unknown>
    const role = String(v.role || roles[i]).trim() || roles[i]
    let text = normalizeSlideTextValue(v.text)
    if (!text) {
      const title = String(v.title ?? '').trim()
      const body = normalizeSlideTextValue(v.body)
      text = [title, body].filter(Boolean).join('\n')
    }
    if (!text) {
      emptyRows.push({
        localRow: i + 1,
        globalSlide: chunkStart + i,
        role,
        message: `Chunk starting @${chunkStart}: global slide ${chunkStart + i} (${role}), local row ${i + 1} has no text`,
      })
      break
    }
    out.push({
      role,
      text,
      title: String(v.title ?? '').trim(),
      cta: String(v.cta ?? '').trim(),
    })
  }
  out.requestedCount = roles.length
  out.parsedCount = out.length
  out.emptyRows = emptyRows
  out.truncated = out.length < roles.length
  out.resultType = emptyRows.length ? 'EMPTY_ROW' : out.truncated ? 'TRUNCATED_RESPONSE' : 'OK'
  return out
}

export type ChunkRoleOutcome = { ok: boolean; role: string; reason?: string }

/** Accepted story progress is the contiguous OK prefix. A later OK row cannot skip a rejected role. */
export function planChunkRepair(opts: {
  requestedRoles: string[]
  outcomes: ChunkRoleOutcome[]
}): {
  advanceCount: number
  repair: 'none' | 'single' | 'suffix' | 'full'
  repairRoles: string[]
  rejectedRole: string | null
} {
  let advance = 0
  for (const row of opts.outcomes) {
    if (!row.ok) break
    advance += 1
  }
  const rejected = opts.outcomes[advance]
  if (!rejected) {
    const rest = opts.requestedRoles.slice(advance)
    return {
      advanceCount: advance,
      repair: rest.length ? 'suffix' : 'none',
      repairRoles: rest,
      rejectedRole: null,
    }
  }
  const after = opts.outcomes.slice(advance + 1)
  const singleGap = after.length > 0 && after.every((row) => row.ok) && opts.outcomes.length === opts.requestedRoles.length
  if (advance === 0 && rejected.role === 'hook') {
    return { advanceCount: 0, repair: 'full', repairRoles: opts.requestedRoles, rejectedRole: rejected.role }
  }
  if (singleGap && rejected.role !== 'hook') {
    return { advanceCount: advance, repair: 'single', repairRoles: [rejected.role], rejectedRole: rejected.role }
  }
  return {
    advanceCount: advance,
    repair: 'suffix',
    repairRoles: opts.requestedRoles.slice(advance),
    rejectedRole: rejected.role,
  }
}

const DEICTIC_SUFFIX_RE = /šit(?:a|as|ą|o)\s+(?:dovan|daikt)|ši\s+dovan|šis\s+daikt/iu

/** A later valid row can be held while the hole is repaired, unless it points at that hole. */
export function holdPendingSuffix(outcomes: Array<{ ok: boolean; role: string; text?: string }>): {
  prefixCount: number
  repairRoles: string[]
  pending: Array<{ index: number; role: string; text: string }>
} {
  const hole = outcomes.findIndex((row) => !row.ok)
  if (hole < 0) return { prefixCount: outcomes.length, repairRoles: [], pending: [] }
  const pending = outcomes.slice(hole + 1).flatMap((row, offset) => {
    if (!row.ok) return []
    const text = row.text || ''
    if (DEICTIC_SUFFIX_RE.test(text)) return []
    return [{ index: hole + 1 + offset, role: row.role, text }]
  })
  return {
    prefixCount: hole,
    repairRoles: [outcomes[hole].role],
    pending,
  }
}

function normalizeSlideTextValue(value: unknown): string {
  if (Array.isArray(value)) {
    return stripEnglishCopyLabels(
      value
        .map((x) => String(x).replace(/\*\*/g, '').trim())
        .filter(Boolean)
        .join(' '),
    )
  }
  return stripEnglishCopyLabels(String(value ?? '').replace(/\*\*/g, '').trim())
}

function slidesFromItems(
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
): { slides: UgcStorySlide[]; processed: number } {
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

const SUGAR_CONTEXT_RE = /\b(cukr|sald)/iu
const SATIETY_BUILD_RE = /\b(sotum|baltym|skaidul)/iu
const SUGAR_CONTRAST_RE = /\b(ko cukrus|nesuteik)/iu
const SUGAR_CONTRAST_SENTENCE = 'Ko cukrus nesuteikia — ilgalaikio sotumo.'

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

function buildBatchStoryPrompt(opts: {
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

const UGC_LITE_NUM_PREDICT = 1200

/** Token budget — short LT JSON; leave headroom so Ollama doesn't truncate to `{`. */
function batchNumPredict(slideCount: number): number {
  const ideal = 180 * Math.max(1, slideCount) + 160
  const ctx = resolveUgcOllamaNumCtxBatch()
  // Short batch SYSTEM (~120 tok) + user skill/theme (~700) — keep reserve honest
  const promptReserve = 1100
  const capped = Math.min(ideal, Math.max(520, ctx - promptReserve))
  return Math.min(1400, capped)
}

function isTruncatedJsonError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return (
    /\b(2|3|4|5|6|7|8|9|[1-4]\d)\s*chars\b/i.test(msg) ||
    /preview:\s*\{\s*"?\s*$/i.test(msg) ||
    /Invalid JSON response:\s*\{\s*"?\s*$/i.test(msg) ||
    /JSON parse failed \(\d{1,2} chars\)/i.test(msg)
  )
}

const UGC_BATCH_OLLAMA_TIMEOUT_MS = 90_000

type LlmJsonOpts = {
  lite?: boolean
  numPredict?: number
  /** Batch story: one format:json pass (PostMaker speed). */
  batchMode?: boolean
  signal?: AbortSignal
  callType?: OllamaCallType
}

function isAbortError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  return err.name === 'AbortError' || /aborted|abort/i.test(err.message)
}

function isTimeoutError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  return err.name === 'TimeoutError' || /timeout|aborted due to timeout/i.test(err.message)
}

export function postOllamaBudgetForSlideCount(slideCount: number): number {
  const chunks = Math.ceil(slideCount / batchChunkSize(slideCount))
  return Math.max(4, chunks * 2)
}

const MAX_OLLAMA_CALLS_PER_POST = 8
let postOllamaBudget = { max: MAX_OLLAMA_CALLS_PER_POST, used: 0 }

export function resetPostOllamaBudget(max = MAX_OLLAMA_CALLS_PER_POST) {
  postOllamaBudget = { max, used: 0 }
}

export function isPostOllamaBudgetExhausted(): boolean {
  return postOllamaBudget.used >= postOllamaBudget.max
}

function consumePostOllamaCall(): boolean {
  if (postOllamaBudget.used >= postOllamaBudget.max) return false
  postOllamaBudget.used += 1
  return true
}

export { consumePostOllamaCall }

async function llmJson(
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

function batchChunkError(err: unknown, _roles: string[], attempts: number): Error {
  const message = err instanceof Error ? err.message : String(err)
  // Avoid "Batch chunk failed… Batch chunk failed…" nesting
  if (/^Model call failed \(\d+ call/i.test(message)) {
    return err instanceof Error ? err : new Error(message)
  }
  return new Error(`Model call failed (${attempts} call(s)): ${message}`, {
    cause: err instanceof Error ? err : undefined,
  })
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

async function generateBatchChunk(
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

function parseKaleduRewritePatches(raw: unknown, count: number): KaleduRewrittenFields[] {
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

export type KaleduSlideFallback = (
  index: number,
  slides: UgcStorySlide[],
  reason: string,
) => { title: string; body: string } | null

export type KaleduStoryGateRepair = { slide: number; code: string; before: string; after: string }

/** Close bodies that bridge a revealed product to the store CTA (PRODUCT_LED mode). */
export const KALEDU_PRODUCT_LED_CLOSE_BODIES = [
  'Jei žmogus tuo naudosis kasdien, dovana tikrai neliks pamiršta.',
  'Kai dovana tinka kasdieniam įpročiui, ji nepasimeta stalčiuje.',
  'Tokia dovana primins apie tave kiekvieną kartą, kai ja naudosis.',
]

/** Prompt block that steers PRODUCT_LED / HYBRID stories. */
export function buildKaleduProductLedBrief(mode: KaleduStoryMode): string {
  if (mode.mode === 'GENERIC') return ''
  if (mode.mode === 'HYBRID') {
    const optional = mode.products[0]
      ? `Jei tinka natūraliai, vienoje build skaidrėje gali paminėti ${productTypePhrase(mode.products[0])} [productId=${mode.products[0].slug}].`
      : 'Prekę minėk tik jei ji natūraliai tinka iš PRODUCTS_ALLOWED.'
    return `STORY MODE: HYBRID
Rašyk naudingą patarimą pagal temą. ${optional} Neprievartauk prekės.`
  }
  if (mode.mode !== 'PRODUCT_LED' || !mode.products.length) return ''
  const product = mode.products[0]
  const second = mode.products[1]
  const habit = mode.intent ? ` (${mode.intent.label})` : ''
  const reveal = second
    ? `2 skaidrė: ${productTypePhrase(product)} [productId=${product.slug}].
3 skaidrė: ${productTypePhrase(second)} [productId=${second.slug}].
Viena prekė vienoje skaidrėje. Hook ir close be productId.`
    : `2 skaidrė: tas pats įprotis - kodėl tai užuomina dovanai. NE bendras dovanų pirkimo stresas.
3 skaidrė: pristatyk ${productTypePhrase(product)} [productId=${product.slug}] ir kodėl tinka šiam įpročiui.`
  return `STORY MODE: PRODUCT_LED${habit}
1 skaidrė: žmogaus įprotis ar situacija iš temos.
${reveal}
Paskutinė: konkreti nauda žmogui, be CTA body.`
}

function kaleduProductLedResolved(slides: UgcStorySlide[], mode: KaleduStoryMode): boolean {
  const required = requiredKaleduProductIds(mode)
  if (!required.length) return true
  return required.every((id) =>
    slides.some(
      (slide) =>
        (slide.productId === id || mode.products.some((product) => (product.slug === id || product.productId === id) && (slide.productId === product.productId || slide.productId === product.slug))) &&
        kaleduProductSlideVerdict(slide) === 'ok',
    ),
  )
}

/** PRODUCT_LED story checks: context must stay on the habit; the selected SKU must be revealed. */
export function kaleduProductLedIssues(
  slides: UgcStorySlide[],
  mode: KaleduStoryMode,
): Array<{ code: 'product_theme_drift' | 'missing_product_resolution'; slide: number }> {
  if (mode.mode !== 'PRODUCT_LED' && mode.mode !== 'HYBRID') return []
  const issues: Array<{ code: 'product_theme_drift' | 'missing_product_resolution'; slide: number }> = []
  const contextIdx = slides.findIndex((s, i) => i > 0 && i < slides.length - 1 && s.role === 'context')
  const idx = contextIdx >= 0 ? contextIdx : 1
  const context = slides[idx]
  if (mode.mode === 'PRODUCT_LED' && mode.intent && context && idx < slides.length - 1) {
    const text = `${context.title} ${context.body}`
    const onProduct = mode.products.some((p) => copyNamesProduct(text, p))
    if (!mode.intent.copy.test(text) && !onProduct) issues.push({ code: 'product_theme_drift', slide: idx + 1 })
  }
  if (!kaleduProductLedResolved(slides, mode)) issues.push({ code: 'missing_product_resolution', slide: 0 })
  return issues
}

/**
 * Deterministic PRODUCT_LED repair: habit context back on topic, and the selected SKU revealed
 * on a build slide (productId + catalog noun + image). If no selected SKU can render, the
 * whole post is downgraded to GENERIC instead of keeping product copy without a picture.
 */
export function repairKaleduProductLed(
  input: UgcStorySlide[],
  mode: KaleduStoryMode,
  allowed: KaleduCatalogProduct[],
  seed = 0,
): { slides: UgcStorySlide[]; repairs: KaleduStoryGateRepair[]; mode: KaleduStoryMode } {
  const slides = input.map((slide) => ({ ...slide }))
  const repairs: KaleduStoryGateRepair[] = []
  if (mode.mode !== 'PRODUCT_LED' && mode.mode !== 'HYBRID') return { slides, repairs, mode }
  const textOf = (s: UgcStorySlide) => `${s.title || ''} ${s.body || ''}`.trim()
  for (const issue of kaleduProductLedIssues(slides, mode)) {
    if (issue.code !== 'product_theme_drift' || !mode.intent) continue
    const i = issue.slide - 1
    const others = slides.filter((_, j) => j !== i).map((s) => ({ title: s.title, body: s.body }))
    const body = pickValidatedKaleduFallback('context', mode.intent.context, others, allowed)
    if (!body) continue
    repairs.push({ slide: i + 1, code: issue.code, before: textOf(slides[i]), after: body })
    slides[i] = { ...slides[i], title: '', body, productId: undefined, showProductPrice: false }
  }
  if (kaleduProductLedResolved(slides, mode)) return { slides, repairs, mode }

  const inner = slides.map((_, i) => i).filter((i) => i > 0 && i < slides.length - 1)
  const contextIdx = slides.findIndex((s, i) => i > 0 && i < slides.length - 1 && s.role === 'context')
  const targets = [
    ...inner.filter((i) => i !== contextIdx && slides[i].role !== 'context'),
    ...inner.filter((i) => i === contextIdx || slides[i].role === 'context'),
  ]
  for (const product of mode.products) {
    const already = slides.some(
      (slide) =>
        (slide.productId === product.productId || slide.productId === product.slug) &&
        kaleduProductSlideVerdict(slide) === 'ok',
    )
    if (already) continue
    let placed = false
    for (const target of targets) {
      if (slides[target].productId && kaleduProductSlideVerdict(slides[target]) === 'ok') continue
      const priorText = slides.filter((_, j) => j !== target).map(textOf).join(' ')
      const reveal = rewriteInventedProductSentence('', [product], { priorText })
      const why = mode.intent?.why.length ? ` ${mode.intent.why[seed % mode.intent.why.length]}` : ''
      const next = {
        ...slides[target],
        title: '',
        body: `${reveal}${why}`,
        productId: product.productId || product.slug,
        showProductPrice: false,
      }
      if (kaleduProductSlideVerdict(next) !== 'ok') continue
      if (kaleduDeterministicQa([next], { theme: '', allowed: mode.products }).some((f) => !isSpellNoteOnly(f))) continue
      repairs.push({ slide: target + 1, code: 'missing_product_resolution', before: textOf(slides[target]), after: next.body })
      slides[target] = next
      placed = true
      break
    }
    if (!placed) {
      auditLog('product_led_unresolved', { products: mode.products.map((p) => p.slug), mode: mode.mode })
    }
  }
  return { slides, repairs, mode }
}

export function repairProductDebt(
  slides: UgcStorySlide[],
  mode: KaleduStoryMode,
  products: KaleduCatalogProduct[],
  debt: string[],
  seed = 0,
): { slides: UgcStorySlide[]; remainingDebt: string[]; attempts: number; repairs: KaleduStoryGateRepair[] } {
  if (!debt.length) return { slides, remainingDebt: debt, attempts: 0, repairs: [] }
  const owed = products.filter((product) => debt.includes(product.slug) || debt.includes(product.productId))
  const narrowed: KaleduStoryMode = { ...mode, products: owed.length ? owed : mode.products }
  const led = repairKaleduProductLed(slides, narrowed, products, seed)
  const remainingDebt = updateProductDebt(debt, led.slides, products)
  for (const repair of led.repairs) {
    if (repair.code !== 'missing_product_resolution') continue
    const product = owed[0]
    const target = product ? pickDebtRepairTarget(slides, product, repair.slide - 1, debt) : null
    auditLog('product_debt_repair', {
      productId: product?.slug || debt[0],
      targetSlideIndex: target?.index ?? repair.slide - 1,
      originalText: repair.before,
      candidateText: repair.after,
      accepted: !remainingDebt.includes(product?.slug || debt[0]),
    })
  }
  return { slides: led.slides, remainingDebt, attempts: debt.length, repairs: led.repairs }
}

/**
 * Last language check on the exact slides that ship. Any text change after the native pass
 * (product attach, contamination swap, product downgrade, story gate repair) is re-checked here.
 * Spell-only notes were already adjudicated by the judge in the native pass and are skipped.
 * One validated-fallback repair, then a hard failure if anything is still wrong.
 */
function applySemanticContextRepairs(slides: UgcStorySlide[]): {
  slides: UgcStorySlide[]
  repairs: KaleduStoryGateRepair[]
  semanticHits: number
  semanticSentences: number
  semanticRepairGroups: number
} {
  const repairs: KaleduStoryGateRepair[] = []
  let semanticHits = 0
  let semanticSentences = 0
  let semanticRepairGroups = 0
  const next = slides.map((slide, index) => {
    const prior = index > 0 ? `${slides[index - 1].title || ''} ${slides[index - 1].body || ''}` : ''
    const semanticOpts = { role: slide.role, productId: slide.productId, prior }
    const title = repairNativeSemantic(slide.title || '', semanticOpts)
    const body = repairNativeSemantic(slide.body || '', semanticOpts)
    const hits = [...title.hits, ...body.hits]
    const groups = [...title.groups, ...body.groups]
    const sentences = new Set([
      ...title.groups.flatMap((group) => group.sentenceIndexes.map((i) => `title:${i}`)),
      ...body.groups.flatMap((group) => group.sentenceIndexes.map((i) => `body:${i}`)),
    ])
    semanticHits += hits.length
    semanticSentences += sentences.size
    semanticRepairGroups += groups.length
    if (!groups.length) {
      if (title.changed || body.changed) return { ...slide, title: title.text, body: body.text }
      return slide
    }
    const before = `${slide.title || ''} ${slide.body || ''}`.trim()
    const afterSlide = title.changed || body.changed ? { ...slide, title: title.text, body: body.text } : slide
    const after = `${afterSlide.title} ${afterSlide.body}`.trim()
    const recheckResult = title.recheckResult === 'reverted' || body.recheckResult === 'reverted' ? 'reverted' : 'pass'
    for (const group of groups) {
      auditLog('ugc-copy-qa', {
        profile: 'kaledu',
        slide: index + 1,
        reason: group.codes.join(','),
        original: before,
        replacement: group.replacement,
        attempt: 1,
      })
      auditLog('semantic_repair', {
        slide: index + 1,
        category: group.codes.join(','),
        confidence: group.confidence,
        sentenceIndex: group.sentenceIndexes.join(','),
        role: slide.role || '',
        productId: slide.productId || '',
        repairStrategy: group.strategy,
        repair: group.replacement,
        recheckResult,
        semanticHits: hits.length,
        semanticSentences: sentences.size,
        semanticRepairGroups: groups.length,
      })
    }
    if (!title.changed && !body.changed) return slide
    repairs.push({
      slide: index + 1,
      code: [...new Set(hits.map((hit) => hit.code))].join(','),
      before,
      after,
    })
    return afterSlide
  })
  return { slides: next, repairs, semanticHits, semanticSentences, semanticRepairGroups }
}

function applyKaleduFallbackCopy(slide: UgcStorySlide, copy: { title: string; body: string }): UgcStorySlide {
  const next = { ...slide, ...copy }
  return kaleduProductSlideVerdict(next) === 'ok'
    ? next
    : { ...next, productId: undefined, showProductPrice: false }
}

export function finalKaleduShipQa(
  input: UgcStorySlide[],
  ctx: { theme: string; allowed: KaleduCatalogProduct[] },
  fallbackFor: KaleduSlideFallback,
): {
  slides: UgcStorySlide[]
  repairs: KaleduStoryGateRepair[]
  remaining: KaleduQaFlag[]
  semanticHits: number
  semanticSentences: number
  semanticRepairGroups: number
} {
  const semantic = applySemanticContextRepairs(input.map((slide) => ({ ...slide })))
  const slides = semantic.slides
  const repairs: KaleduStoryGateRepair[] = [...semantic.repairs]
  const blocking = (rows: UgcStorySlide[]) =>
    kaleduDeterministicQa(rows, ctx).filter((flag) => !isSpellNoteOnly(flag))
  for (const flag of blocking(slides)) {
    const i = flag.index
    const before = `${slides[i].title} ${slides[i].body}`.trim()
    const others = slides.filter((_, j) => j !== i).map((s) => ({ title: s.title, body: s.body }))
    const fb =
      slides[i].role === 'hook' || i === 0
        ? pickKaleduSubjectHook(ctx.theme, others, ctx.allowed)
        : fallbackFor(i, slides, flag.details.join('; '))
    if (!fb) continue
    slides[i] = applyKaleduFallbackCopy(slides[i], {
      title: slides[i].role === 'hook' || i === 0 ? fb.title : '',
      body: fb.body,
    })
    repairs.push({ slide: i + 1, code: flag.codes.join(','), before, after: `${slides[i].title} ${slides[i].body}`.trim() })
  }
  return {
    slides,
    repairs,
    remaining: blocking(slides),
    semanticHits: semantic.semanticHits,
    semanticSentences: semantic.semanticSentences,
    semanticRepairGroups: semantic.semanticRepairGroups,
  }
}

/**
 * Christmas story gate repair: each failing slide is replaced once (validated fallback,
 * subject hook, or the picked product the theme names). Two rounds max, then the hard gate decides.
 */
export function repairKaleduStoryGate(
  input: UgcStorySlide[],
  themeText: string,
  fallbackFor: KaleduSlideFallback,
  picked: KaleduCatalogProduct[] = [],
): { slides: UgcStorySlide[]; repairs: KaleduStoryGateRepair[] } {
  const slides = input.map((slide) => ({ ...slide }))
  const repairs: KaleduStoryGateRepair[] = []
  const touched = new Set<number>()
  const textOf = (s: UgcStorySlide) => `${s.title || ''} ${s.body || ''}`.trim()
  for (let round = 0; round < 2; round++) {
    const failures = [...collectStoryIssues(slides, themeText), ...collectParaphraseSlideIssues(slides)]
    if (!failures.length) break
    let changed = false
    for (const failure of failures) {
      if (failure.code === 'theme_drift') {
        const lost = kaleduThemeDrift(themeText, slides.slice(0, 3).map(textOf).join(' '))
        if (!lost) continue
        const subject = KALEDU_THEME_SUBJECTS.find((row) => row.label === lost.split(' / ')[0])
        const product = subject
          ? picked.find((p) => subject.copy.test(`${productTypePhrase(p)} ${p.slug}`))
          : undefined
        const target = product
          ? [1, 2].find((i) => i < slides.length - 1 && !touched.has(i) && !slides[i].productId)
          : undefined
        if (product && target != null) {
          const priorText = slides.filter((_, j) => j !== target).map(textOf).join(' ')
          const before = textOf(slides[target])
          const next = enforceKaleduProductSlide(
            {
              ...slides[target],
              title: '',
              body: rewriteInventedProductSentence('', [product], { priorText }),
              productId: product.productId || product.slug,
            },
            { priorText },
          )
          if (next.productId) {
            slides[target] = next
            touched.add(target)
            repairs.push({ slide: target + 1, code: failure.code, before, after: textOf(next) })
            changed = true
            continue
          }
        }
        if (touched.has(0)) continue
        const before = textOf(slides[0])
        const others = slides.slice(1).map((s) => ({ title: s.title, body: s.body }))
        const hook = pickKaleduSubjectHook(themeText, others, picked)
        slides[0] = { ...slides[0], ...hook, productId: undefined, showProductPrice: false }
        touched.add(0)
        repairs.push({ slide: 1, code: failure.code, before, after: textOf(slides[0]) })
        changed = true
        continue
      }
      const idx = failure.slide - 1
      if (idx < 0 || idx >= slides.length || touched.has(idx)) continue
      const before = textOf(slides[idx])
      const fb =
        idx === 0
          ? pickKaleduSubjectHook(
              themeText,
              slides.slice(1).map((s) => ({ title: s.title, body: s.body })),
              picked,
            )
          : fallbackFor(idx, slides, failure.code)
      if (!fb) continue
      slides[idx] = applyKaleduFallbackCopy(slides[idx], {
        title: idx === 0 ? fb.title : '',
        body: fb.body,
      })
      touched.add(idx)
      repairs.push({ slide: idx + 1, code: failure.code, before, after: textOf(slides[idx]) })
      changed = true
    }
    if (!changed) break
  }
  return { slides, repairs }
}

/** Role-aware validated fallback for one Christmas slide (never repeats another slide in the post). */
export function makeKaleduSlideFallback(ctx: {
  themeHook: string
  themeBody: string
  topic: string
  allowed: KaleduCatalogProduct[]
  getStoryMode?: () => KaleduStoryMode
}): KaleduSlideFallback {
  return (index, slides) => {
    const slide = slides[index]
    const role =
      slide.role || (index === 0 ? 'hook' : index === slides.length - 1 ? 'close' : 'build')
    const others = slides
      .filter((_, j) => j !== index)
      .map((s) => ({ title: s.title, body: s.body }))
    const storyMode = ctx.getStoryMode?.()
    const productLed = storyMode?.mode === 'PRODUCT_LED'
    if (role === 'hook') {
      return pickKaleduSubjectHook(`${ctx.topic} ${ctx.themeHook} ${ctx.themeBody}`, others, ctx.allowed)
    }
    if (role === 'close' || role === 'punch') {
      const pool = productLed
        ? [...KALEDU_PRODUCT_LED_CLOSE_BODIES, ...getFallbackCloseBodyCandidates(ctx.topic)]
        : getFallbackCloseBodyCandidates(ctx.topic)
      const body = pickValidatedKaleduFallback('close', pool, others, ctx.allowed)
      return body ? { title: '', body } : null
    }
    if (role === 'context' && productLed && storyMode?.intent) {
      const body = pickValidatedKaleduFallback('context', storyMode.intent.context, others, ctx.allowed)
      if (body) return { title: '', body }
    }
    const pid = String(slide.productId || '').trim()
    const product = pid ? ctx.allowed.find((p) => p.productId === pid || p.slug === pid) : undefined
    if (product) {
      const priorText = others.map((s) => `${s.title} ${s.body}`).join(' ')
      return { title: '', body: rewriteInventedProductSentence('', [product], { priorText }) }
    }
    const pool = role === 'context' ? UGC_KALEDU_FALLBACK_CONTEXT_BODIES : UGC_KALEDU_FALLBACK_BUILD_BODIES
    const body = pickValidatedKaleduFallback(role, pool, others, ctx.allowed)
    return body ? { title: '', body } : null
  }
}

const KALEDU_QA_JUDGE_TIMEOUT_MS = 45_000
const KALEDU_QA_REWRITE_TIMEOUT_MS = 75_000

function defaultKaleduLlm(signal?: AbortSignal): KaleduLlmCall {
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

type KaleduQaRound = {
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

  const mechanically = slides.map((slide) => ({
    ...slide,
    title: applyKaleduNativeRepairs(slide.title),
    body: applyKaleduNativeRepairs(stripKaleduCtaLeak(slide.body)),
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

  const fallbackSlides: Array<{ index: number; reason: string; mode: 'product_repair' | 'fallback' | 'kept' }> = []
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

  const mechanically = slides.map((slide) => ({
    ...slide,
    title: applyKaleduNativeRepairs(slide.title),
    body: applyKaleduNativeRepairs(stripKaleduCtaLeak(slide.body)),
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
        progress('Warming Ollama model…')
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
        let chunkProcessed = 0
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
              chunkProcessed = built.processed
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
          chunkProcessed = chunkSlides.length
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
        const debtRepair = repairProductDebt(finalized, storyMode, pickedProducts, productDebt, seed)
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
          const led = repairKaleduProductLed(withProducts, storyMode, pickedProducts, seed + round)
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
          productLedRepairs.push(...led.repairs)
          productRepairCalls += led.repairs.length
          qaRepairs.push(...shipQa.repairs)
          gateRepairs.push(...gate.repairs)
          if (!shipQa.remaining.length && !gate.repairs.length && !led.repairs.length) break
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
        if (productLedLeft.length) {
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
        }
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
        const budgetedEmoji = normalizeKaleduEmojiBudget(emphatic.slides)
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
