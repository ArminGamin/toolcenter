/**
 * Lithuanian UGC copy normalizer — fixes formal „jūs“, common EuroLLM grammar slips, repeated „Mes“ openers.
 */

import { isChristmasGiftsNiche } from './profile-brand.js'
import { collectUniversalClassStoryIssues } from './ugc-lt-classes.js'
import { UGC_DIET_DRIFT_RE, UGC_FOOD_ANCHOR_RE } from './ugc-lt/gibberish.js'
import { BARE_HOOK_EXPANSIONS, collectSlideIssues, type UgcSlideGateIssue } from './ugc-lt/slide-checks.js'
import { isSeasonalUgcTheme, seasonEchoCount, UGC_SEASON_ECHO_RE } from './ugc-season-context.js'
export { isGibberishLtCopy, isOffTopicNonFoodLtCopy, LT_REFLEXIVE_FINITE_RE, textHasFiniteVerbCue, UGC_DIET_DRIFT_RE, UGC_FOOD_ANCHOR_RE, UGC_LT_RESIDUAL_WE_FORMS } from './ugc-lt/gibberish.js'
export { isDeclarativeQuestionMark, LT_DECLARATIVE_INSIGHT_RE, LT_QUESTION_STARTER_RE, LT_QUESTION_WORD_START_RE, LT_RHETORICAL_DIRECT_QUESTION_RE, LT_RHETORICAL_PARTICIPLE_HOOK_RE, LT_RHETORICAL_QUESTION_VERB_RE, mergeStubSentences, normalizeLtUgcCopy, normalizeLtUgcMultiline, normalizePersonRegister, polishLtCaps, repairIncompleteLtSentence, sanitizeLtCopyFields, stripLtBodyJunk, stripLtEmDashes } from './ugc-lt/normalize-copy.js'
export type { NormalizeLtCopyState } from './ugc-lt/normalize-copy.js'
export { UGC_LT_CAPTION_SEO_BLOCK, UGC_LT_CLARITY_GUARDRAILS_BLOCK, UGC_LT_CLOSE_BLOCK, UGC_LT_CRAFT_BLOCK, UGC_LT_GRAMMAR_BLOCK, UGC_LT_HOOK_BLOCK, UGC_LT_LINKSNIAI_BLOCK, UGC_LT_QUALITY_RULES, UGC_LT_STRUCTURE_BLOCK, UGC_LT_THEME_ANCHOR_BLOCK, UGC_LT_TU_REGISTER_BLOCK, UGC_OLLAMA_SYSTEM_PROMPT } from './ugc-lt/prompts.js'
export { assertShipableLtSlide, collectEngagementBaitIssues, collectSlideIssues, demoteLtTitleCase, hasFormalRegister, hasUnmarkedColonQuestion, isBareHookTitleFragment, isRhetoricalTuQuestionMissingMark, isShipableLtSlide, LT_SCREENSHOT_STEMS, textHasDeclarativeQuestionMark, textHasEngagementBait, textHasRhetoricalTuQuestionMissingMark, UGC_ENGAGEMENT_BAIT_PATTERNS } from './ugc-lt/slide-checks.js'
export type { UgcSlideGateIssue } from './ugc-lt/slide-checks.js'
/**
 * Gift/Christmas scene anchors. Use `(?<!\p{L})…(?!\p{L})` — JS `\b` treats š/ž/ė as
 * non-word, so `\bšvent` never matches „Šventinis“ / „šventė“.
 * Includes concrete gift-scene stems (juostelė, staigmena, paštas, įdėti…) so a
 * kalėdinė dovana story need not repeat the literal theme tokens.
 */
export const UGC_GIFT_ANCHOR_RE =
  /(?<!\p{L})(dovan\p{L}*|kalėd\p{L}*|kaled\p{L}*|kampel\p{L}*|kaledukampelis|švent\p{L}*|dekora\p{L}*|eglut\p{L}*|išpakuoj\p{L}*|pled\p{L}*|žvak\p{L}*|juostel\p{L}*|staig(?:men|tyb)\p{L}*|pašt\p{L}*|įdėt\p{L}*|pakuot\p{L}*|paslėpt\p{L}*)(?!\p{L})/iu
export const UGC_KALEDU_DIET_LEAK_RE =
  /tavoknyga|kalorij|mitybos knyga|angliavanden|5\s*min\.?\s*test|(?<!\p{L})testas(?!\p{L})|(?<!\p{L})(maist\p{L}*|mityb\p{L}*|valgym\p{L}*|recept\p{L}*|porcij\p{L}*|svor\p{L}*)(?!\p{L})|maisto\s+sprendim\p{L}*|valgymo\s+ritm\p{L}*|mitybos\s+ritm\p{L}*/iu

/** Normalize hook title/body for echo comparison (case + trailing punctuation). */
function normalizeHookEchoKey(s: string): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[.!?…]+$/u, '')
    .replace(/\s+/g, ' ')
}

/** True when hook body opens with the same sentence as the title (any title length). */
export function hookBodyEchoesTitle(title: string, body: string): boolean {
  const normTitle = normalizeHookEchoKey(title)
  if (!normTitle) return false
  const sentences = String(body || '')
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (!sentences.length) return false
  const normFirst = normalizeHookEchoKey(sentences[0])
  return Boolean(normFirst && (normFirst === normTitle || normFirst.startsWith(normTitle)))
}

/**
 * Strip a leading body sentence that repeats the hook title verbatim (normalized).
 * Aug-9 batch: intermittent generation echo — normalization backstop, not prompt-only.
 */
export function stripTitleEchoFromBody(title: string, body: string): string {
  const normTitle = normalizeHookEchoKey(title)
  if (!normTitle) return body
  const sentences = String(body || '')
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (!sentences.length) return body
  const normFirst = normalizeHookEchoKey(sentences[0])
  if (normFirst && (normFirst === normTitle || normFirst.startsWith(normTitle))) {
    return sentences.slice(1).join(' ').trim()
  }
  return body
}

/** Generic planning-benefit filler — max once per story unless theme-matched. */
export const UGC_GENERIC_FILLER_PATTERNS: RegExp[] = [
  /\bKai žingsniai aiškūs\b/iu,
  /\bIš anksto suplanuotas pasirinkimas sumažina impulsyvius\b/iu,
  /\bAiškus planas padeda kasdien maistą rinktis ramiau\b/iu,
  /\bDiena be aiškaus plano prabėga\b/iu,
]

export function countGenericFillerSlides(
  slides: Array<{ title?: string; body?: string }>,
): number {
  let count = 0
  for (const slide of slides) {
    const text = `${slide.title || ''} ${slide.body || ''}`
    if (UGC_GENERIC_FILLER_PATTERNS.some((re) => re.test(text))) count++
  }
  return count
}

export const UGC_LT_OPENER_BLOCK = `SAKINIO PRADŽIA — tas pats žodis MAX 1 kartą visame karuselės tekste:
✗ trys sakiniai „Mes neprimetame…", „Mes padedame…", „Mes padedame jums…"
✓ vienas „Mes…", kiti prasideda kitaip: „Tai…", „Kai…", „Tavo…", „Planas…", „Kai…", „Todėl…"`
/** Second-pass LT QA user prompt — one Ollama call before ship gate. */
export const UGC_LT_QA_PROMPT = `Perskaityk kiekvieną sakinį atskirai. Ar kiekvienas sakinys yra pilnas (turi veiksnį ir tarinį)? Ar kiekvienas veiksmažodis derinamas su tinkamu linksniu? Ar klaustukas naudojamas tik tikram klausimui? Ar sakinys turi prasmę pažodžiui, ne tik gramatiškai? Ištaisyk, jei ne.`
/**
 * Short SYSTEM for batch generate — overrides Modelfile SYSTEM for that request.
 * Full literacy stays in Modelfile for warm/single; batch needs KV room for JSON output.
 * Quality is enforced by normalize + assertShipable (code fortress).
 */
export const UGC_OLLAMA_BATCH_SYSTEM_PROMPT = `Tu esi lt-LT UGC copywriteris „Tavo knyga" (tavoknyga.com).
Grąžink TIK validų JSON {"slides":[...]} — be markdown, be teksto prieš/po.
Kreipkis „tu" (ne „mes", ne „aš" monologas). 1–2 trumpi sakiniai / skaidrė su veiksmažodžiu. Be emoji/URL/CTA body.
NATŪRALI LT: gramatika neužtenka. Tikras žodis netinka, jei reikšmė šiame sakinyje absurdiška. Jei lietuvis taip nepasakytų — perrašyk visą sakinį.
STORY: hook → kontekstas → posūkis → payoff. Kiekviena skaidrė = nauja mintis.
Hook title: jei prasideda „Ar" / „Kodėl" — BAIGIASI „?". Close cta tiksliai:
Apsilankyk tavoknyga.com ir pradėk 5 min. testą! 🤩
Tikri lt-LT žodžiai — nieko neišgalvok. Be em dash (—).
DRAUDŽIAMA: galimi, jaučiat, kasmens, utėlius, apjungia, maisto gėriu, šventvėlių, Ištvermas, įsisisteminus, viršvalgėjimo, Pamėteli, pats(i), skyręs(-ei), išsekęs(-us), nenorisi, pasirūpintį, ima dėvėti, norėjau, atsisakiau, planuodamas.
Rašyk: gali, jauti, maisto skoniu; tik „tu" formos (įsitikinai, nori, supranti). Nerašyk jaučiame, Siekdami, Nustokit.
SEZONAS: nerašyk apie mėnesius, metų laikus, orus ar karštį, jei tema ne apie tai; jei tema sezoninė — daugiausia vieną kartą.
Kiekviena skaidrė = kitas žingsnis: įvykis → priežastis → posūkis → rezultatas. Nekartok tų pačių daiktavardžių.
Pirmos 3 skaidrės lieka konkrečioje temoje. Medicinos/sporto/kūdikio temos nekeisk bendru tekstu apie sezoną.
PROBLEMA PIRMA: sprendimo (testo/rinkinio/plano / „Dabar žinai, kad…" / „Tavo knyga padės") neminėk 2-oje skaidrėje; minėk TIK VIENĄ kartą po posūkio.
Nekartok to paties sakinio dviejose skaidrėse. Title „X: kodėl/ką/kaip/kas …" ar „X: A ar B" baigiasi „?".
„meal kit" daugiausia kartą hook title; body = „maisto rinkinys". Close = nauja išvada, ne hook echo.`

export function expandBareHookTitle(title: string): string {
  const t = title.trim()
  if (!t) return t
  if (BARE_HOOK_EXPANSIONS[t]) return BARE_HOOK_EXPANSIONS[t]
  if (/^Mažiau emocinio$/iu.test(t)) return 'Mažiau emocinio valgymo'
  if (/^Mažiau paslėptų$/iu.test(t)) return 'Mažiau paslėptų kalorijų'
  return t
}

const BUILD_CLOSE_ECHO_BUILD_RE =
  /\b(Supranti,?\s+kad|Supratęs\s+savo|Supratusi\s+savo|mažas pokytis dietoje)\b/iu
const BUILD_CLOSE_ECHO_CLOSE_RE =
  /\b(Dabar\s+(?:supranti|žinai)|Tavo knyga padės|maisto derinimas gali|pritaikytas tavo tikslams|sumažins uždegimą)\b/iu
const BUILD_CLOSE_ECHO_NARRATIVE_EXCLUSION_RE =
  /\b(pradėjai|naudoti.*rinkin|mokamas planas)\b/iu
const BUILD_CLOSE_ECHO_PAYOFF_STUB_RE =
  /\b(Supranti,?\s+kad|individualus planas gali|optimalų meniu)\b/iu
const BUILD_CLOSE_ECHO_STOP_STEMS = new Set([
  'maisto',
  'planas',
  'supratai',
  'supranti',
  'dabar',
  'žinai',
  'tavo',
  'knyga',
])

export function slidesHaveFoodAnchor(
  slides: Array<{ body?: string; cta?: string; role?: string }>,
): boolean {
  if (slides.length < 2) return true
  const tail = slides.slice(-2)
  const close = slides[slides.length - 1]
  const text = [...tail.map((s) => s.body || ''), close?.cta || ''].join(' ')
  return UGC_FOOD_ANCHOR_RE.test(text)
}

export function slidesHaveGiftAnchor(
  slides: Array<{ body?: string; cta?: string; role?: string }>,
): boolean {
  if (slides.length < 2) return true
  const tail = slides.slice(-2)
  const close = slides[slides.length - 1]
  const text = [...tail.map((s) => s.body || ''), close?.cta || ''].join(' ')
  return UGC_GIFT_ANCHOR_RE.test(text)
}

export function slidesHaveBrandAnchor(
  slides: Array<{ body?: string; cta?: string; role?: string }>,
): boolean {
  return isChristmasGiftsNiche() ? slidesHaveGiftAnchor(slides) : slidesHaveFoodAnchor(slides)
}

export function isBuildCloseEcho(buildText: string, closeText: string): boolean {
  const build = buildText.trim()
  const close = closeText.trim()
  if (!build || !close) return false
  if (BUILD_CLOSE_ECHO_NARRATIVE_EXCLUSION_RE.test(build)) return false
  if (BUILD_CLOSE_ECHO_BUILD_RE.test(build) && BUILD_CLOSE_ECHO_CLOSE_RE.test(close)) {
    return true
  }
  if (!BUILD_CLOSE_ECHO_PAYOFF_STUB_RE.test(build) || !BUILD_CLOSE_ECHO_CLOSE_RE.test(close)) {
    return false
  }
  const buildTokens = new Set(
    build
      .toLocaleLowerCase('lt-LT')
      .split(/[^\p{L}]+/u)
      .filter((w) => w.length >= 5 && !BUILD_CLOSE_ECHO_STOP_STEMS.has(w)),
  )
  let shared = 0
  for (const w of close
    .toLocaleLowerCase('lt-LT')
    .split(/[^\p{L}]+/u)
    .filter((x) => x.length >= 5 && !BUILD_CLOSE_ECHO_STOP_STEMS.has(x))) {
    if (buildTokens.has(w)) shared++
  }
  return shared >= 3
}

export type UgcStoryGateFailure = UgcSlideGateIssue & {
  slide: number
  role?: string
  snippet: string
}

/** Product/solution pitch markers — shared by story gate + slide-2 auto-repair. */
export const UGC_SOLUTION_PITCH_RE =
  /\b(testas\s+(?:per kelias minutes\s+)?(?:atskleidžia|parodo|padės|padeda|suformuoja)|maisto rinkinys (leidžia|padeda|tau padeda)|planas (leidžia|padeda)|šis sprendimas leidžia|individualizuot\w+ plan\w+|asmeninis planas|su\s+[„"]?tavo knyga|[„"]?tavo knyga[""]?\s+padės|[„"]?kalėdų kampelis[""]?\s+padės|kaledukampelis|Dabar\s+(?:žinai|supranti|gali|mėgaujiesi),?\s+(?:kad|kaip|ką)\b)/iu

/** Normalized sentence key for cross-slide repetition checks (≥6 words). */
export function normalizeSentenceKey(sentence: string): string {
  return sentence
    .toLocaleLowerCase('lt-LT')
    .replace(/\btačiau\b/gu, 'bet')
    .replace(/[^\p{L}\s]/gu, '')
    .replace(/(?<!\p{L})tu(?!\p{L})/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Word-overlap ratio for cross-slide near-duplicate detection (0–1). */
export function sentenceKeyWordOverlap(a: string, b: string): number {
  const w1 = a.split(' ').filter(Boolean)
  const w2 = b.split(' ').filter(Boolean)
  if (!w1.length || !w2.length) return 0
  const set1 = new Set(w1)
  let inter = 0
  for (const w of w2) if (set1.has(w)) inter++
  return inter / Math.min(w1.length, w2.length)
}

/** True when ≥6-word keys are identical or ≥85% word overlap (catches „dažnai" variants). */
export function isNearDuplicateSentenceKey(
  key: string,
  prior: Iterable<string>,
  threshold = 0.85,
): boolean {
  const words = key.split(' ').filter(Boolean)
  if (words.length < 6) return false
  for (const prev of prior) {
    if (!prev || prev === key) return prev === key
    if (sentenceKeyWordOverlap(key, prev) >= threshold) return true
  }
  return false
}

function storySimilarityTokens(text: string): Set<string> {
  const stop = new Set(['tavo', 'dabar', 'kodėl', 'kaip', 'šiemet', 'rugpjūtį', 'vis', 'dar', 'kad'])
  return new Set(
    text
      .toLocaleLowerCase('lt-LT')
      .split(/[^\p{L}]+/u)
      .filter((word) => word.length >= 4 && !stop.has(word)),
  )
}

/** Relaxed gift anchor: accepts prefixed verbs (padovanoti, apdovanoti) too. */
export const UGC_KALEDU_GIFT_ANCHOR_RE =
  /(?<!\p{L})(?:pa|ap|iš|nu|su)?dovan\p{L}*|(?<!\p{L})(kalėd\p{L}*|kaled\p{L}*|švent\p{L}*|kampel\p{L}*)(?!\p{L})/iu

/** Specific subjects a Christmas theme can carry; generic gift words never satisfy these. */
export const KALEDU_THEME_SUBJECTS: Array<{ label: string; theme: RegExp; copy: RegExp }> = [
  { label: 'mama', theme: /(?<!\p{L})mam\p{L}*/iu, copy: /(?<!\p{L})mam\p{L}*/iu },
  { label: 'tėtis', theme: /tėt|tėč/iu, copy: /tėt|tėč/iu },
  { label: 'senelis', theme: /senel|senol|močiut/iu, copy: /senel|senol|močiut/iu },
  { label: 'pora', theme: /(?<!\p{L})por(a|ai|ą|oms|os)(?!\p{L})|partner/iu, copy: /(?<!\p{L})por\p{L}*|partner|mylim|antr(ajai|ajam)|(?<!\p{L})(abu|abiem|abi|dviem|dviese)(?!\p{L})|vienas\s+kit\p{L}*/iu },
  { label: 'vyras', theme: /(?<!\p{L})vyr(as|ui|ams|ą|o)(?!\p{L})/iu, copy: /(?<!\p{L})vyr\p{L}*/iu },
  { label: 'moteris', theme: /moter/iu, copy: /moter/iu },
  { label: 'draugas', theme: /draug/iu, copy: /draug/iu },
  { label: 'kolega', theme: /koleg|slapt/iu, copy: /koleg|biur|darb|slapt/iu },
  { label: 'paauglys', theme: /paaugl/iu, copy: /paaugl/iu },
  { label: 'vaikas', theme: /(?<!\p{L})vaik/iu, copy: /(?<!\p{L})vaik/iu },
  { label: 'dekoracijos', theme: /dekor|puoš/iu, copy: /dekor|puoš|eglut|girliand|žvak|žaisliuk/iu },
  { label: 'biudžetas', theme: /iki\s*\d+|eur|€|biudžet/iu, copy: /eur|€|biudžet|kain|brang|pig|išleist|sum/iu },
  { label: 'paskutinė minutė', theme: /paskutin|last.?minute|rytoj/iu, copy: /paskutin|rytoj|liko|dien|skub|laik/iu },
  { label: 'atstumas', theme: /miest|toli|atstum|siunt/iu, copy: /miest|toli|atstum|siunt|pašt|nutol/iu },
  { label: 'nauji namai', theme: /nauj\p{L}*\s+nam|įkurtuv/iu, copy: /nam|įkurtuv|but[aeuą]/iu },
  { label: 'rinkinys', theme: /rinkin/iu, copy: /rinkin|kelet|kelis|kelių|dėžut/iu },
  { label: 'pledas', theme: /pled/iu, copy: /pled|jauk\p{L}*\s+vakar|šilt\p{L}*\s+vakar/iu },
  { label: 'termosas', theme: /termos/iu, copy: /termos|kelion|kelyj|kelyje|kelio/iu },
  { label: 'žvakė', theme: /žvak/iu, copy: /žvak|švies/iu },
  { label: 'puodelis', theme: /puodel/iu, copy: /puodel|kav[ao]s?|arbat/iu },
  { label: 'kojinės', theme: /kojin/iu, copy: /kojin|šilt/iu },
]

/** Semantic subject check: theme subject must survive into the first three slides. */
export function kaleduThemeDrift(themeText: string, firstThree: string): string | null {
  const subjects = KALEDU_THEME_SUBJECTS.filter((row) => row.theme.test(themeText))
  if (subjects.length) {
    if (subjects.some((row) => row.copy.test(firstThree))) return null
    return subjects.map((row) => row.label).join(' / ')
  }
  if (!UGC_KALEDU_GIFT_ANCHOR_RE.test(themeText)) return null
  return UGC_KALEDU_GIFT_ANCHOR_RE.test(firstThree) ? null : 'kalėdinė dovana'
}

/** Soft story warnings (audit only) — never block export. */
export function collectStoryWarnings(
  slides: Array<{ title?: string; body?: string; role?: string }>,
  themeText = '',
): Array<{ code: string; message: string }> {
  const warnings: Array<{ code: string; message: string }> = []
  if (isChristmasGiftsNiche() && isSeasonalUgcTheme(themeText)) {
    const count = seasonEchoCount(slides.map((s) => `${s.title || ''} ${s.body || ''}`))
    if (count > 1) {
      warnings.push({ code: 'season_repeat', message: `Seasonal words on ${count} slides (soft)` })
    }
  }
  return warnings
}

/** Final whole-story gate. Hook/close echo is a story-level error. */
export function collectStoryIssues(
  slides: Array<{ title?: string; body?: string; role?: string }>,
  themeText = '',
): UgcStoryGateFailure[] {
  const failures: UgcStoryGateFailure[] = slides.flatMap((slide, index) =>
    collectSlideIssues(slide).map((issue) => ({
      ...issue,
      slide: index + 1,
      role: slide.role,
      snippet: `${slide.title || ''} ${slide.body || ''}`.trim().slice(0, 140),
    })),
  )
  if (slides.length > 1) {
    const hook = storySimilarityTokens(`${slides[0].title || ''} ${slides[0].body || ''}`)
    const close = storySimilarityTokens(
      `${slides.at(-1)?.title || ''} ${slides.at(-1)?.body || ''}`,
    )
    const shared = [...hook].filter((token) => close.has(token))
    const smaller = Math.min(hook.size, close.size)
    if (shared.length >= 2 && smaller > 0 && shared.length / smaller >= 0.6) {
      failures.push({
        code: 'hook_close_echo',
        message: 'Close repeats the hook instead of adding a payoff',
        slide: slides.length,
        role: slides.at(-1)?.role,
        snippet: `${slides.at(-1)?.title || ''} ${slides.at(-1)?.body || ''}`.trim().slice(0, 140),
      })
    }
  }
  const themeAnchors: Array<{ theme: RegExp; copy: RegExp; label: string }> = [
    { theme: /diabet|gliukoz|cukraus kiek/iu, copy: /diabet|gliukoz|cukraus kiek/iu, label: 'diabetas' },
    { theme: /ištverm|endurance|sport/iu, copy: /ištverm|treniruot|sport|energij/iu, label: 'ištvermė' },
    { theme: /kūdik|baby|pirmas maist/iu, copy: /pirmas maist|primaitin|ragau/iu, label: 'pirmas kūdikio maistas' },
    { theme: /sūr|cheese/iu, copy: /sūr/iu, label: 'sūris' },
    { theme: /meal kit|maisto rinkin/iu, copy: /maisto rinkin/iu, label: 'maisto rinkinys' },
    { theme: /stres.*valg|stress.*eat/iu, copy: /stres|emoc.*valg/iu, label: 'stresinis valgymas' },
  ]
  const firstThree = slides
    .slice(0, 3)
    .map((slide) => `${slide.title || ''} ${slide.body || ''}`)
    .join(' ')
  if (isChristmasGiftsNiche()) {
    const lost = kaleduThemeDrift(themeText, firstThree)
    if (lost) {
      failures.push({
        code: 'theme_drift',
        message: `First three slides lost the theme subject: ${lost}`,
        slide: 1,
        role: slides[0]?.role,
        snippet: firstThree.slice(0, 140),
      })
    }
  } else {
    for (const anchor of themeAnchors) {
      if (anchor.theme.test(themeText) && !anchor.copy.test(firstThree)) {
        failures.push({
          code: 'theme_drift',
          message: `First three slides lost the required theme anchor: ${anchor.label}`,
          slide: 1,
          role: slides[0]?.role,
          snippet: firstThree.slice(0, 140),
        })
      }
    }
  }
  const bodies = slides.map((slide) => (slide.body || '').trim()).filter(Boolean)
  const seenBodies = new Set<string>()
  for (let i = 0; i < bodies.length; i++) {
    if (seenBodies.has(bodies[i])) {
      failures.push({
        code: 'duplicate_slide_body',
        message: 'Two slides share the same body text',
        slide: i + 1,
        role: slides[i]?.role,
        snippet: bodies[i].slice(0, 140),
      })
    }
    seenBodies.add(bodies[i])
  }
  if (!isSeasonalUgcTheme(themeText)) {
    for (let i = 0; i < slides.length; i++) {
      const slideText = `${slides[i].title || ''} ${slides[i].body || ''}`
      if (UGC_SEASON_ECHO_RE.test(slideText)) {
        failures.push({
          code: 'season_filler',
          message: 'Non-seasonal theme must not mention months, seasons, or weather',
          slide: i + 1,
          role: slides[i]?.role,
          snippet: slideText.trim().slice(0, 140),
        })
      }
    }
  } else if (
    !isChristmasGiftsNiche() &&
    seasonEchoCount(slides.map((s) => `${s.title || ''} ${s.body || ''}`)) > 1
  ) {
    failures.push({
      code: 'season_repeat',
      message: 'Seasonal filler may appear at most once per story',
      slide: 1,
      role: slides[0]?.role,
      snippet: slides.map((s) => s.body || '').join(' ').slice(0, 140),
    })
  }
  // Story arc order: the product/solution pitch may not appear on slide 2 —
  // the problem must develop first (įvykis → priežastis → posūkis → rezultatas).
  if (slides.length >= 4) {
    const secondSlide = `${slides[1]?.title || ''} ${slides[1]?.body || ''}`
    if (UGC_SOLUTION_PITCH_RE.test(secondSlide)) {
      failures.push({
        code: 'solution_too_early',
        message: 'Slide 2 already pitches the solution — develop the problem first',
        slide: 2,
        role: slides[1]?.role,
        snippet: secondSlide.trim().slice(0, 140),
      })
    }
  }
  // Cross-slide sentence repetition — exact OR ≥85% word overlap (≥6 words).
  {
    const seenSentences = new Map<string, number>()
    const seenKeys: string[] = []
    for (let i = 0; i < slides.length; i++) {
      const text = `${slides[i].title || ''} ${slides[i].body || ''}`
      const sentences = text.split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter(Boolean)
      for (const sentence of sentences) {
        const key = normalizeSentenceKey(sentence)
        if (key.split(' ').filter(Boolean).length < 6) continue
        const firstSlide = seenSentences.get(key)
        const nearDup = isNearDuplicateSentenceKey(key, seenKeys)
        if ((firstSlide !== undefined && firstSlide !== i) || nearDup) {
          failures.push({
            code: 'duplicate_sentence',
            message: `Sentence repeats slide ${firstSlide !== undefined ? firstSlide + 1 : 'earlier'}`,
            slide: i + 1,
            role: slides[i]?.role,
            snippet: sentence.slice(0, 140),
          })
        } else {
          seenSentences.set(key, i)
          seenKeys.push(key)
        }
      }
    }
  }
  // Hook body may not repeat its own title sentence (any title length).
  {
    const hookTitle = slides[0]?.title || ''
    const hookBody = slides[0]?.body || ''
    if (hookTitle && hookBodyEchoesTitle(hookTitle, hookBody)) {
      failures.push({
        code: 'hook_title_echo',
        message: 'Hook body repeats the hook title verbatim',
        slide: 1,
        role: slides[0]?.role,
        snippet: hookBody.slice(0, 140),
      })
    }
  }
  failures.push(...collectUniversalClassStoryIssues(slides, themeText))
  if (countGenericFillerSlides(slides) >= 2) {
    failures.push({
      code: 'generic_filler_repeat',
      message: 'Generic planning filler appears on more than one slide',
      slide: 1,
      role: slides[0]?.role,
      snippet: slides
        .map((s) => s.body || '')
        .find((b) => UGC_GENERIC_FILLER_PATTERNS.some((re) => re.test(b)))
        ?.slice(0, 140) || '',
    })
  }
  if (slides.length >= 4) {
    const closeIdx = slides.length - 1
    for (let i = closeIdx - 1; i >= 1; i--) {
      const role = slides[i]?.role
      if (role !== 'build' && role !== 'context') continue
      const buildText = `${slides[i]?.title || ''} ${slides[i]?.body || ''}`.trim()
      const closeText = `${slides[closeIdx]?.title || ''} ${slides[closeIdx]?.body || ''}`.trim()
      if (isBuildCloseEcho(buildText, closeText)) {
        failures.push({
          code: 'build_close_echo',
          message: 'Build slide previews the close payoff instead of adding a new beat',
          slide: i + 1,
          role: slides[i]?.role,
          snippet: buildText.slice(0, 140),
        })
      }
      break
    }
  }
  if (slides.length >= 3 && !slidesHaveBrandAnchor(slides)) {
    failures.push({
      code: 'brand_drift',
      message: isChristmasGiftsNiche()
        ? 'Last slides and close CTA must explicitly tie to a gift or Christmas shopping'
        : 'Last slides and close CTA must explicitly tie to food or meal planning',
      slide: slides.length,
      role: slides.at(-1)?.role,
      snippet: `${slides.at(-2)?.body || ''} ${slides.at(-1)?.body || ''}`.trim().slice(0, 140),
    })
  }
  if (isChristmasGiftsNiche()) {
    const blob = slides.map((s) => `${s.title || ''} ${s.body || ''}`).join(' ')
    if (UGC_DIET_DRIFT_RE.test(blob) || UGC_KALEDU_DIET_LEAK_RE.test(blob)) {
      failures.push({
        code: 'brand_drift',
        message: 'Christmas UGC must not mention diets, calories, meal plans, or tavoknyga.com',
        slide: slides.length,
        role: slides.at(-1)?.role,
        snippet: blob.slice(0, 140),
      })
    }
  }
  return failures
}

export function assertShipableStory(
  slides: Array<{ title?: string; body?: string; role?: string }>,
  themeText = '',
): void {
  const failures = collectStoryIssues(slides, themeText)
  if (!failures.length) return
  const first = failures[0]
  throw new Error(
    `Story gate failed: slide ${first.slide}${first.role ? ` (${first.role})` : ''} ${first.code}: ${first.message} | ${first.snippet}`,
  )
}
