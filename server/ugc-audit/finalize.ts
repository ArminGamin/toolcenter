/** Finalising and validating audited UGC batch posts. (Split out of ugc-batch-audit.ts.) */

import { AsyncLocalStorage } from 'node:async_hooks'
import fs from 'node:fs'
import path from 'node:path'
import { currentProfileBrand, isChristmasGiftsNiche } from '../profile-brand.js'
import { UGC_CAPTION_CTA } from '../ugc-caption-format.js'
import { UGC_DEFAULT_CTA, ugcActiveCaptionCta, ugcActiveCta, ugcActiveHashtags } from '../ugc-cta-normalize.js'
import { kaleduProductExportIssues } from '../ugc-kaledu-catalog.js'
import { isAllowedKaleduCta } from '../ugc-kaledu-cta.js'
import { christmasFieldEmojiOk } from '../ugc-kaledu-emoji.js'
import { isCaptionSlideDump } from '../ugc-lt-classes.js'
import {
    collectSlideIssues,
    collectStoryIssues,
    collectStoryWarnings,
    hasFormalRegister,
    isGibberishLtCopy,
    isShipableLtSlide,
    LT_QUESTION_STARTER_RE,
    LT_SCREENSHOT_STEMS,
    UGC_KALEDU_DIET_LEAK_RE,
    UGC_LT_RESIDUAL_WE_FORMS,
} from '../ugc-lt-normalize.js'
import { isSeasonalUgcTheme, UGC_SEASON_ECHO_RE } from '../ugc-season-context.js'



/** Capture root on D: — agent-readable vision dump for fortress review. */
export const UGC_VISION_ROOT = process.env.UGC_VISION_ROOT?.trim() || 'D:\\ugc-batch-vision'



export function resolveAuditRoot(): string {
  const fromEnv = process.env.UGC_AUDIT_ROOT?.trim()
  if (fromEnv) return path.resolve(fromEnv)
  return path.join(UGC_VISION_ROOT, 'audit')
}



export const AUDIT_ROOT = resolveAuditRoot()


export const SESSION_PATH = path.join(AUDIT_ROOT, 'SESSION.json')


export const PC_LOG_DIR = path.join(UGC_VISION_ROOT, 'pc-logs')


export const PC_LOG_PATH = path.join(PC_LOG_DIR, 'server.jsonl')



export type UgcAuditCaptureMode = 'off' | 'test-batch' | 'legacy'



export type UgcAuditSession = {
  target: number
  completed: number
  active: boolean
  captureMode: UgcAuditCaptureMode
  startedAt: string
  updatedAt: string
  note: string
  runId?: string
  posts: Array<{
    id: string
    ok: boolean
    theme?: string
    at: string
    issueCount?: number
    ollamaCalls?: number
    durationMs?: number
    rescuedSlides?: number
  }>
}



export type AuditCallStat = {
  callIndex: number
  callType: string
  outcome: 'ok' | 'timeout' | 'error' | 'aborted'
  durationMs: number
  numPredict: number | null
  requestedNumPredict: number | null
  evalCount: number | null
  doneReason: string | null
}



export type AuditStore = {
  postId: string
  postDir: string
  callIndex: number
  events: Array<Record<string, unknown>>
  startedAt: number
  callStats: AuditCallStat[]
  fallbacks: Array<{ slide: number; role?: string; reason: string; text: string }>
}



export function summarizeCallStats(stats: AuditCallStat[]) {
  const byType: Record<
    string,
    {
      calls: number
      ok: number
      partial: number
      timeouts: number
      errors: number
      totalMs: number
      evalTokens: number
      truncated: number
    }
  > = {}
  for (const row of stats) {
    const bucket = (byType[row.callType] ||= {
      calls: 0,
      ok: 0,
      partial: 0,
      timeouts: 0,
      errors: 0,
      totalMs: 0,
      evalTokens: 0,
      truncated: 0,
    })
    bucket.calls += 1
    bucket.totalMs += row.durationMs
    bucket.evalTokens += row.evalCount || 0
    if (row.doneReason === 'timeout_partial') bucket.partial += 1
    else if (row.outcome === 'ok') bucket.ok += 1
    else if (row.outcome === 'timeout') bucket.timeouts += 1
    else bucket.errors += 1
    if (row.doneReason === 'length') bucket.truncated += 1
  }
  return {
    totalCalls: stats.length,
    totalMs: stats.reduce((sum, row) => sum + row.durationMs, 0),
    timeouts: stats.filter((row) => row.outcome === 'timeout').length,
    partials: stats.filter((row) => row.doneReason === 'timeout_partial').length,
    byType,
    calls: stats,
  }
}



export const als = new AsyncLocalStorage<AuditStore>()



export function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true })
}



export function nowIso() {
  return new Date().toISOString()
}



/** Always-on PC log stream under D:\ugc-batch-vision\pc-logs (even outside audit ALS). */
export function visionPcLog(event: string, detail: Record<string, unknown> = {}) {
  try {
    ensureDir(PC_LOG_DIR)
    const row = { t: nowIso(), event, ...detail }
    fs.appendFileSync(PC_LOG_PATH, JSON.stringify(row) + '\n', 'utf8')
  } catch {
    // never break generation for logging
  }
}



export function inactiveAuditSession(note?: string): UgcAuditSession {
  return {
    target: 0,
    completed: 0,
    active: false,
    captureMode: 'off',
    startedAt: nowIso(),
    updatedAt: nowIso(),
    note: note || 'Audit capture off — enable Test mode on batch run for full D: dump',
    posts: [],
  }
}



export function normalizeSession(raw: UgcAuditSession): UgcAuditSession {
  if (!raw.captureMode) {
    raw.captureMode = raw.active ? 'legacy' : 'off'
  }
  return raw
}



export function readSession(): UgcAuditSession {
  ensureDir(AUDIT_ROOT)
  ensureDir(path.join(UGC_VISION_ROOT, 'batch'))
  ensureDir(PC_LOG_DIR)
  if (!fs.existsSync(SESSION_PATH)) {
    return inactiveAuditSession()
  }
  return normalizeSession(JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8')) as UgcAuditSession)
}



export function writeSession(session: UgcAuditSession) {
  ensureDir(AUDIT_ROOT)
  session.updatedAt = nowIso()
  fs.writeFileSync(SESSION_PATH, JSON.stringify(session, null, 2) + '\n', 'utf8')
}



export function formatCarouselOnSlideMarkdown(
  slides: Array<{ title?: string; body?: string; cta?: string; role?: string; productId?: string }>,
): string {
  const lines = ['# Carousel text (as on slides)', '']
  for (const [i, s] of slides.entries()) {
    lines.push(`## Slide ${i + 1}${s.role ? ` (${s.role})` : ''}`)
    if (s.productId) lines.push(`- productId: \`${s.productId}\``)
    if ((s.title || '').trim()) lines.push(`**Title:** ${s.title!.trim()}`)
    if ((s.body || '').trim()) lines.push(`**Body:** ${s.body!.trim()}`)
    if ((s.cta || '').trim()) lines.push(`**CTA:** ${s.cta!.trim()}`)
    lines.push('')
  }
  return lines.join('\n')
}



export function appendTimeline(store: AuditStore, event: string, detail: Record<string, unknown> = {}) {
  const row = { t: nowIso(), ms: Date.now() - store.startedAt, event, ...detail }
  store.events.push(row)
  const linePath = path.join(store.postDir, '01-timeline.jsonl')
  fs.appendFileSync(linePath, JSON.stringify(row) + '\n', 'utf8')
  visionPcLog(event, { postId: store.postId, ms: row.ms, ...detail })
}



export function writeJson(file: string, data: unknown) {
  ensureDir(path.dirname(file))
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8')
}



export function scanSlideQuality(
  slides: Array<{ title?: string; body?: string; cta?: string; role?: string; productId?: string }>,
  themeText = '',
) {
  const storyIssues = collectStoryIssues(slides, themeText)
  const seasonalTheme = isSeasonalUgcTheme(themeText)
  let seasonMentions = 0
  return slides.map((s, i) => {
    const titleBody = `${s.title || ''} ${s.body || ''}`
    const blob = `${titleBody} ${s.cta || ''}`
    const issues = collectSlideIssues(s).map((issue) => issue.code)
    const addIssue = (issue: string) => {
      if (!issues.includes(issue)) issues.push(issue)
    }
    for (const issue of storyIssues.filter((item) => item.slide === i + 1)) {
      addIssue(issue.code)
    }
    if (LT_SCREENSHOT_STEMS.test(blob)) addIssue('screenshot_stem')
    if (isGibberishLtCopy(titleBody)) addIssue('gibberish')
    if (hasFormalRegister(blob)) addIssue('formal_jus')
    if (/—|–/.test(titleBody)) addIssue('em_dash')
    if (UGC_LT_RESIDUAL_WE_FORMS.test(blob)) {
      addIssue('we_or_bad_reflexive')
    }
    if (/pats\s*\(\s*i\s*\)|pati\s*\(\s*s\s*\)/i.test(blob)) addIssue('gender_hedge')
    if (UGC_SEASON_ECHO_RE.test(blob)) {
      seasonMentions += 1
      if (!seasonalTheme || (seasonMentions > 1 && !isChristmasGiftsNiche())) addIssue('season_filler_repeat')
    }
  if (LT_QUESTION_STARTER_RE.test((s.title || '').trim()) && !/\?\s*$/.test((s.title || '').trim())) {
      addIssue('interrogative_hook_missing_question_mark')
    }
    if (s.role === 'close' || s.cta) {
      if (isChristmasGiftsNiche()) {
        if (s.cta && !isAllowedKaleduCta(s.cta)) addIssue('non_canonical_slide_cta')
        if (s.cta && !/kaledukampelis\.com/i.test(s.cta)) addIssue('cta_wrong_host')
        if (s.cta && /kaledukampelis\.lt|tavoknyga/i.test(s.cta)) addIssue('cta_wrong_host')
      } else if (s.cta && s.cta !== ugcActiveCta() && s.cta !== UGC_DEFAULT_CTA) {
        addIssue('non_canonical_slide_cta')
      }
    }
    if (isChristmasGiftsNiche() && UGC_KALEDU_DIET_LEAK_RE.test(blob)) addIssue('diet_leak')
    if (/\p{Extended_Pictographic}/u.test(s.body || '')) {
      if (!(isChristmasGiftsNiche() && christmasFieldEmojiOk(s.body || ''))) {
        addIssue('emoji_in_body')
      }
    }
    if (/tavoknyga\.com/i.test(s.body || '')) addIssue('url_in_body')
    const ship = isShipableLtSlide({ title: s.title, body: s.body, role: s.role })
    if (!ship) addIssue('not_shipable')
    return {
      index: i + 1,
      role: s.role,
      title: s.title,
      body: s.body,
      cta: s.cta,
      issues,
      shipable: issues.length === 0,
      charCounts: {
        title: (s.title || '').length,
        body: (s.body || '').length,
        cta: (s.cta || '').length,
      },
    }
  })
}



export function captionSimilarityTokens(text: string): Set<string> {
  return new Set(
    text
      .toLocaleLowerCase('lt-LT')
      .split(/[^\p{L}]+/u)
      .filter((word) => word.length >= 4),
  )
}



export function captionHookMismatch(caption: string, hookTitle?: string): boolean {
  const hook = (hookTitle || '').trim()
  if (hook.length < 12) return false
  const paras = caption.replace(/\r\n/g, '\n').split(/\n{2,}/).map((part) => part.trim())
  const p1 = paras.find((part) => part && !part.startsWith('📌')) || ''
  const hookTokens = captionSimilarityTokens(hook)
  const p1Tokens = captionSimilarityTokens(p1)
  if (!hookTokens.size || !p1Tokens.size) return true
  const shared = [...hookTokens].filter((token) => p1Tokens.has(token)).length
  return shared / Math.max(hookTokens.size, p1Tokens.size) < 0.6
}



export function scanCaption(
  caption: string,
  slides?: Array<{ title?: string; body?: string; cta?: string; role?: string }>,
  source?: unknown,
) {
  const issues: string[] = []
  if (source === 'universal' && isChristmasGiftsNiche()) {
    if (!caption.trim()) issues.push('empty_universal_description')
    return { issues, chars: caption.length, lines: caption.split('\n').length }
  }
  if (!caption.startsWith('📌')) issues.push('missing_pin_opener')
  const brand = currentProfileBrand()
  const captionCta = ugcActiveCaptionCta()
  const hostRe = new RegExp(brand.siteHost.replace(/\./g, '\\.'), 'i')
  if (!caption.includes(captionCta) && !hostRe.test(caption) && !caption.includes(UGC_CAPTION_CTA)) {
    issues.push('missing_caption_cta_or_url')
  }
  if (/—|–/.test(caption)) issues.push('em_dash')
  const tag = (ugcActiveHashtags().split(/\s+/)[0] || '#tavoknyga').trim()
  if (tag && !caption.includes(tag)) issues.push('missing_hashtags')
  if (!/\n•\n•\n•\n/.test(caption)) issues.push('missing_bullet_footer')
  if (/🍥/.test(caption)) issues.push('legacy_narutomaki_opener')
  if (/-\s*savaitės planas\s*$/im.test(caption) || /-\s*mitybos planas\s*$/im.test(caption)) {
    issues.push('thin_keyword_bolton')
  }
  if (/\b(pagal|apie)\s+(savaitės|mitybos)\s+planas\b/iu.test(caption)) {
    issues.push('caption_case_error')
  }
  if (brand.niche === 'christmas-gifts') {
    if (!/🎁/u.test(caption)) issues.push('caption_cta_emoji_mismatch')
  } else if (/😊/u.test(caption) || !/🤩/u.test(caption)) {
    issues.push('caption_cta_emoji_mismatch')
  }
  const hookTitle = slides?.find((slide) => (slide.title || '').trim())?.title
  if (captionHookMismatch(caption, hookTitle)) issues.push('caption_p1_ne_slide_hook')
  if (slides?.length && isCaptionSlideDump(caption, slides)) issues.push('caption_dump')
  const bodyParas = caption
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p && !p.startsWith('📌') && !p.startsWith('•') && !p.startsWith('#') && !/tavoknyga\.com|kaledukampelis/i.test(p))
  for (const [index, p] of bodyParas.slice(0, 2).entries()) {
    if (isGibberishLtCopy(p)) issues.push('caption_gibberish')
    if (UGC_LT_RESIDUAL_WE_FORMS.test(p)) issues.push('caption_we_form')
    if (hasFormalRegister(p)) issues.push('caption_formal_jus')
    if (index > 0 && p.length < 24) issues.push('caption_para_thin')
  }
  return { issues, chars: caption.length, lines: caption.split('\n').length }
}



export function validateUgcExportPost(post: {
  caption: string
  meta?: Record<string, unknown>
}): { ok: boolean; issues: string[] } {
  const slides = Array.isArray(post.meta?.story_slides)
    ? (post.meta.story_slides as Array<{
        title?: string
        body?: string
        cta?: string
        role?: string
        productId?: string
      }>)
    : []
  const themeText = [post.meta?.theme, post.meta?.hook, post.meta?.body, post.meta?.category]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
  const category = typeof post.meta?.category === 'string' ? post.meta.category : ''
  const theme = typeof post.meta?.theme === 'string' ? post.meta.theme : ''
  const hook = typeof post.meta?.hook === 'string' ? post.meta.hook : ''
  const body = typeof post.meta?.body === 'string' ? post.meta.body : ''
  const kind =
    post.meta?.kind === 'generic' || post.meta?.kind === 'product'
      ? (post.meta.kind as 'generic' | 'product')
      : undefined
  const issues = [
    ...scanSlideQuality(slides, themeText).flatMap((slide) =>
      slide.issues.map((issue) => `slide_${slide.index}:${issue}`),
    ),
    ...scanCaption(post.caption, slides, post.meta?.caption_source).issues.map((issue) => `caption:${issue}`),
  ]
  if (!slides.length) issues.push('story_slides:missing')
  if (isChristmasGiftsNiche()) {
    const picked = Array.isArray(post.meta?.picked_products)
      ? (post.meta.picked_products as unknown[]).filter((slug): slug is string => typeof slug === 'string')
      : []
    issues.push(...kaleduProductExportIssues(slides, theme, category, { hook, body, kind, picked }))
  }
  return { ok: issues.length === 0, issues }
}



/** Finalize current ALS post (success or failure). */
export function finalizeUgcAuditPost(result: {
  ok: boolean
  slides?: Array<{ title?: string; body?: string; cta?: string; role?: string; id?: string }>
  caption?: string
  error?: string
  errorStack?: string
  arcName?: string
  hookStyle?: string
  storyArc?: string
  topic?: string
  extra?: Record<string, unknown>
}) {
  const store = als.getStore()
  if (!store) {
    // Allow finalize from outside ALS if we pass postId via extra
    return
  }

  if (result.slides) {
    const themeText = [result.extra?.theme, result.extra?.themeHook, result.topic]
      .filter((value): value is string => typeof value === 'string')
      .join(' ')
    const storyIssues = collectStoryIssues(result.slides, themeText)
    const slideScan = scanSlideQuality(result.slides, themeText)
    const captionScan = result.caption != null ? scanCaption(result.caption, result.slides) : null
    writeJson(path.join(store.postDir, '06-final-slides.json'), result.slides)
    writeJson(path.join(store.postDir, '04-story-issues.json'), {
      themeText,
      issues: storyIssues,
      warnings: collectStoryWarnings(result.slides, themeText),
    })
    fs.writeFileSync(
      path.join(store.postDir, '15-carousel-on-slide.md'),
      formatCarouselOnSlideMarkdown(result.slides),
      'utf8',
    )
    if (result.extra?.promptSnapshot) {
      writeJson(path.join(store.postDir, '00c-prompt-snapshot.json'), result.extra.promptSnapshot)
    }
    if (result.extra?.nativeRewrite) {
      writeJson(path.join(store.postDir, '05c-native-rewrite-detail.json'), result.extra.nativeRewrite)
    }
    if (result.extra?.products) {
      writeJson(path.join(store.postDir, '00a-catalog-context.json'), result.extra.products)
    }
    if (result.extra?.preExportGate) {
      writeJson(path.join(store.postDir, '09b-pre-export-gate.json'), result.extra.preExportGate)
    }
    writeJson(path.join(store.postDir, '08-quality-scan.json'), {
      slides: slideScan,
      caption: captionScan,
      storyIssues,
    })
    const slideIssueCount = slideScan.reduce((sum, slide) => sum + slide.issues.length, 0)
    writeJson(path.join(store.postDir, '14-gate-report.json'), {
      ok: slideIssueCount === 0 && (captionScan?.issues.length ?? 0) === 0,
      slideIssueCount,
      captionIssueCount: captionScan?.issues.length ?? 0,
      failedSlides: slideScan.filter((slide) => !slide.shipable).map((slide) => slide.index),
      generatedAt: nowIso(),
    })
  }
  if (result.caption != null) {
    writeJson(path.join(store.postDir, '07-caption.json'), {
      caption: result.caption,
      scan: scanCaption(result.caption, result.slides),
    })
    fs.writeFileSync(path.join(store.postDir, '07-caption.txt'), result.caption.trim() + '\n', 'utf8')
  }
  if (!result.ok) {
    writeJson(path.join(store.postDir, '09-error.json'), {
      error: result.error,
      stack: result.errorStack,
      at: nowIso(),
    })
  }

  const callSummary = summarizeCallStats(store.callStats)
  writeJson(path.join(store.postDir, '17-ollama-stats.json'), callSummary)
  writeJson(path.join(store.postDir, '18-fallbacks.json'), store.fallbacks)
  const summary = {
    postId: store.postId,
    ok: result.ok,
    durationMs: Date.now() - store.startedAt,
    ollamaCalls: store.callIndex,
    ollamaTimeouts: callSummary.timeouts,
    ollamaByType: callSummary.byType,
    fallbackCount: store.fallbacks.length,
    arcName: result.arcName,
    hookStyle: result.hookStyle,
    storyArc: result.storyArc,
    topic: result.topic,
    slideCount: result.slides?.length ?? 0,
    error: result.error || null,
    qaProvider: result.extra?.qaProvider ?? null,
    qaModel: result.extra?.qaModel ?? null,
    qaOk: result.extra?.qaOk ?? null,
    extra: result.extra || {},
    at: nowIso(),
  }
  writeJson(path.join(store.postDir, '10-summary.json'), summary)

  const slidePreview =
    result.slides?.map((s, i) => {
      const parts = [
        (s.title || '').trim(),
        (s.body || '').trim(),
        (s.cta || '').trim(),
      ].filter(Boolean)
      return `### Slide ${i + 1}${s.role ? ` (${s.role})` : ''}\n${parts.join('\n\n') || '—'}`
    }) ?? []

  const md = [
    `# ${store.postId} — ${result.ok ? 'OK' : 'FAIL'}`,
    '',
    `- Duration: ${summary.durationMs}ms`,
    `- Ollama calls: ${summary.ollamaCalls}`,
    `- Slides: ${summary.slideCount}`,
    `- Arc: ${result.arcName || '—'}`,
    `- Hook style: ${result.hookStyle || '—'}`,
    result.error ? `- Error: ${result.error}` : '',
    '',
    '## On-slide copy',
    '',
    ...slidePreview,
    '',
    'Full pipeline: `00-request.json`, `00c-prompt-snapshot.json`, `02-ollama-calls/`, `04-story-issues.json`, `05b-native-rewrite.json`, `08-quality-scan.json`, `16-rendered-slides/`',
    '',
  ]
    .filter(Boolean)
    .join('\n')
  fs.writeFileSync(path.join(store.postDir, 'README.md'), md, 'utf8')

  appendTimeline(store, 'finalize', { ok: result.ok, ollamaCalls: store.callIndex })

  const session = readSession()
  if (session.completed < session.target) {
    const qualityIssues = result.slides
      ? scanSlideQuality(
          result.slides,
          [result.extra?.theme, result.extra?.themeHook, result.topic]
            .filter((value): value is string => typeof value === 'string')
            .join(' '),
        ).reduce((sum, slide) => sum + slide.issues.length, 0)
      : result.ok
        ? 0
        : 1
    session.completed += 1
    session.posts.push({
      id: store.postId,
      ok: result.ok,
      theme: typeof result.extra?.theme === 'string' ? result.extra.theme : undefined,
      at: nowIso(),
      issueCount: qualityIssues,
      ollamaCalls: store.callIndex,
      durationMs: summary.durationMs,
      rescuedSlides:
        typeof result.extra?.rescuedSlides === 'number' ? result.extra.rescuedSlides : undefined,
    })
    if (session.completed >= session.target) {
      session.active = false
      fs.writeFileSync(
        path.join(AUDIT_ROOT, 'COMPLETE.md'),
        `# Audit complete (${session.completed}/${session.target})

All ${session.target} posts logged under \`${AUDIT_ROOT}\`.

Ask the agent: mine D:\\ugc-batch-vision (audit + batch + pc-logs) and review fortress quality.
`,
        'utf8',
      )
      visionPcLog('audit_complete', { completed: session.completed, root: AUDIT_ROOT })
    }
    writeSession(session)
  }
}
