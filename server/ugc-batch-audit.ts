/**
 * Full-detail audit logger for the next N batch posts only.
 * Default root: D:\ugc-batch-vision\audit (override with UGC_AUDIT_ROOT).
 * Auto-stops when SESSION.completed >= target.
 */

import fs from 'node:fs'
import path from 'node:path'
import { AsyncLocalStorage } from 'node:async_hooks'
import {
  isGibberishLtCopy,
  hasFormalRegister,
  LT_SCREENSHOT_STEMS,
  isShipableLtSlide,
  UGC_LT_RESIDUAL_WE_FORMS,
  collectSlideIssues,
  collectStoryIssues,
  collectStoryWarnings,
  LT_QUESTION_STARTER_RE,
  UGC_KALEDU_DIET_LEAK_RE,
} from './ugc-lt-normalize.js'
import { UGC_DEFAULT_CTA, ugcActiveCaptionCta, ugcActiveCta, ugcActiveHashtags } from './ugc-cta-normalize.js'
import { isSeasonalUgcTheme, UGC_SEASON_ECHO_RE } from './ugc-season-context.js'
import { UGC_CAPTION_CTA } from './ugc-caption-format.js'
import { isCaptionSlideDump } from './ugc-lt-classes.js'
import { currentProfileBrand, isChristmasGiftsNiche } from './profile-brand.js'
import { isAllowedKaleduCta } from './ugc-kaledu-cta.js'
import { christmasFieldEmojiOk } from './ugc-kaledu-emoji.js'
import { kaleduProductExportIssues } from './ugc-kaledu-catalog.js'

/** Capture root on D: — agent-readable vision dump for fortress review. */
export const UGC_VISION_ROOT = process.env.UGC_VISION_ROOT?.trim() || 'D:\\ugc-batch-vision'

export const UGC_AUDIT_TARGET_POSTS = Number(process.env.UGC_AUDIT_TARGET || 5) || 5

function resolveAuditRoot(): string {
  const fromEnv = process.env.UGC_AUDIT_ROOT?.trim()
  if (fromEnv) return path.resolve(fromEnv)
  return path.join(UGC_VISION_ROOT, 'audit')
}

const AUDIT_ROOT = resolveAuditRoot()
const SESSION_PATH = path.join(AUDIT_ROOT, 'SESSION.json')
const PC_LOG_DIR = path.join(UGC_VISION_ROOT, 'pc-logs')
const PC_LOG_PATH = path.join(PC_LOG_DIR, 'server.jsonl')

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

type AuditCallStat = {
  callIndex: number
  callType: string
  outcome: 'ok' | 'timeout' | 'error' | 'aborted'
  durationMs: number
  numPredict: number | null
  requestedNumPredict: number | null
  evalCount: number | null
  doneReason: string | null
}

type AuditStore = {
  postId: string
  postDir: string
  callIndex: number
  events: Array<Record<string, unknown>>
  startedAt: number
  callStats: AuditCallStat[]
  fallbacks: Array<{ slide: number; role?: string; reason: string; text: string }>
}

function summarizeCallStats(stats: AuditCallStat[]) {
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

/** Record a deterministic fallback that replaced model copy (audit + timeline). */
export function auditFallback(entry: { slide: number; role?: string; reason: string; text: string }) {
  const store = als.getStore()
  if (!store) return
  store.fallbacks.push(entry)
  appendTimeline(store, 'fallback_used', entry)
}

const als = new AsyncLocalStorage<AuditStore>()

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true })
}

function nowIso() {
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

function inactiveAuditSession(note?: string): UgcAuditSession {
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

function normalizeSession(raw: UgcAuditSession): UgcAuditSession {
  if (!raw.captureMode) {
    raw.captureMode = raw.active ? 'legacy' : 'off'
  }
  return raw
}

function readSession(): UgcAuditSession {
  ensureDir(AUDIT_ROOT)
  ensureDir(path.join(UGC_VISION_ROOT, 'batch'))
  ensureDir(PC_LOG_DIR)
  if (!fs.existsSync(SESSION_PATH)) {
    return inactiveAuditSession()
  }
  return normalizeSession(JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8')) as UgcAuditSession)
}

function writeSession(session: UgcAuditSession) {
  ensureDir(AUDIT_ROOT)
  session.updatedAt = nowIso()
  fs.writeFileSync(SESSION_PATH, JSON.stringify(session, null, 2) + '\n', 'utf8')
}

export function getUgcAuditStatus(): UgcAuditSession & { remaining: number; root: string } {
  const s = readSession()
  return {
    ...s,
    remaining: Math.max(0, s.target - s.completed),
    root: AUDIT_ROOT,
  }
}

/** Archive prior post-* folders and start a fresh audit session. */
export function resetUgcAuditSession(opts?: {
  target?: number
  note?: string
  archivePrevious?: boolean
  runId?: string
}): UgcAuditSession & { remaining: number; root: string; archivedTo?: string } {
  const target = Math.max(1, opts?.target ?? UGC_AUDIT_TARGET_POSTS)
  const archivePrevious = opts?.archivePrevious !== false
  let archivedTo: string | undefined

  ensureDir(AUDIT_ROOT)
  if (archivePrevious) {
    const entries = fs.existsSync(AUDIT_ROOT) ? fs.readdirSync(AUDIT_ROOT) : []
    const toArchive = entries.filter(
      (name) => name.startsWith('post-') || name === 'COMPLETE.md' || name === 'SESSION.json',
    )
    if (toArchive.length) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      archivedTo = path.join(AUDIT_ROOT, 'archive', stamp)
      ensureDir(archivedTo)
      for (const name of toArchive) {
        fs.renameSync(path.join(AUDIT_ROOT, name), path.join(archivedTo, name))
      }
    }
  }

  const fresh: UgcAuditSession = {
    target,
    completed: 0,
    active: true,
    captureMode: 'test-batch',
    startedAt: nowIso(),
    updatedAt: nowIso(),
    runId: opts?.runId,
    note:
      opts?.note?.trim() ||
      `Test mode: full capture for next ${target} batch posts → ${UGC_VISION_ROOT}`,
    posts: [],
  }
  writeSession(fresh)
  fs.writeFileSync(
    path.join(AUDIT_ROOT, 'README.md'),
    `# UGC batch audit (next ${target} posts)

Vision root: \`${UGC_VISION_ROOT}\`

Each \`post-NN/\` folder has raw Ollama calls, prompts, retries, normalized/final slides, caption, quality scan.

Batch PNGs → \`${path.join(UGC_VISION_ROOT, 'batch')}\`
PC logs → \`${PC_LOG_PATH}\`

When SESSION.completed >= ${target}, logging stops. Start another batch with **Test mode** checked, or POST reset-audit.

Each post folder includes: Ollama prompts/responses, pipeline JSON, story-gate failures, native rewrite, quality scan, caption, rendered PNGs (after client save).
`,
    'utf8',
  )
  visionPcLog('audit_reset', {
    target,
    runId: fresh.runId,
    note: fresh.note,
    archivedTo: archivedTo || null,
    root: AUDIT_ROOT,
    captureMode: 'test-batch',
  })
  return { ...fresh, remaining: target, root: AUDIT_ROOT, archivedTo }
}

/** Turn off D: capture (normal batch runs without full audit). */
export function deactivateUgcAuditCapture(reason = 'Normal batch — test mode off') {
  const session = inactiveAuditSession(reason)
  writeSession(session)
  visionPcLog('audit_deactivated', { reason, root: AUDIT_ROOT })
  return { ...session, remaining: 0, root: AUDIT_ROOT }
}

/** Close audit session on batch abort — prevents zombie post-NN slots. */
export function cancelUgcAuditOnAbort() {
  try {
    const s = readSession()
    if (!s.active) return
    s.active = false
    s.note = `${s.note} [aborted]`
    writeSession(s)
    visionPcLog('audit_aborted', { runId: s.runId, completed: s.completed })
  } catch {
    /* ignore */
  }
}

/** Client + server events → pc-logs and per-post timeline when auditId is set. */
export function logUgcAuditClientEvent(
  auditId: string | undefined,
  event: string,
  detail: Record<string, unknown> = {},
) {
  visionPcLog(event, { auditId: auditId || null, source: 'client', ...detail })
  if (!auditId || !/^post-\d{2}$/.test(auditId)) return
  const postDir = path.join(AUDIT_ROOT, auditId)
  if (!fs.existsSync(postDir)) return
  const row = { t: nowIso(), event, source: 'client', ...detail }
  fs.appendFileSync(path.join(postDir, '01-timeline.jsonl'), JSON.stringify(row) + '\n', 'utf8')
  if (event === 'render_complete' || event === 'batch_post_render_ok') {
    writeJson(path.join(postDir, '13-client-render.json'), { ...detail, at: nowIso() })
  }
}

export function isUgcAuditActive(): boolean {
  const s = readSession()
  if (s.captureMode === 'off') return false
  return s.active && s.completed < s.target
}

export function getUgcAuditRoot(): string {
  return AUDIT_ROOT
}

function formatCarouselOnSlideMarkdown(
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

/** Batch-level rollup after a test-mode run (copy + optional render). */
export function writeUgcTestBatchManifest(payload: {
  runId: string
  profileId: string
  count: number
  okCount: number
  batchDir?: string
  outputFolder?: string
  posts: Array<{
    postIndex: number
    auditId?: string | null
    copyStatus: string
    saved?: boolean
    theme?: string
    error?: string
  }>
}) {
  const session = readSession()
  const file = path.join(
    AUDIT_ROOT,
    `BATCH-RUN-${payload.runId.slice(0, 8)}.json`,
  )
  writeJson(file, {
    at: nowIso(),
    visionRoot: UGC_VISION_ROOT,
    auditRoot: AUDIT_ROOT,
    session,
    ...payload,
  })
  const md = [
    `# Test batch ${payload.runId.slice(0, 8)}`,
    '',
    `- Profile: ${payload.profileId}`,
    `- Posts: ${payload.okCount}/${payload.count} copy-ready`,
    `- Batch PNG folder: ${payload.batchDir || '—'}`,
    `- Audit: \`${AUDIT_ROOT}\``,
    '',
    '## Posts',
    ...payload.posts.map(
      (p) =>
        `- Post ${String(p.postIndex).padStart(2, '0')} ${p.auditId || '—'} · ${p.copyStatus}${p.saved ? ' · saved' : ''}${p.error ? ` · ${p.error}` : ''}`,
    ),
    '',
    'Mine with agent skill: ugc-vision-mine',
    '',
  ].join('\n')
  fs.writeFileSync(path.join(AUDIT_ROOT, `BATCH-RUN-${payload.runId.slice(0, 8)}.md`), md, 'utf8')
  visionPcLog('test_batch_manifest', { runId: payload.runId, file })
}

export function getActiveAuditPostId(): string | null {
  return als.getStore()?.postId ?? null
}

function appendTimeline(store: AuditStore, event: string, detail: Record<string, unknown> = {}) {
  const row = { t: nowIso(), ms: Date.now() - store.startedAt, event, ...detail }
  store.events.push(row)
  const linePath = path.join(store.postDir, '01-timeline.jsonl')
  fs.appendFileSync(linePath, JSON.stringify(row) + '\n', 'utf8')
  visionPcLog(event, { postId: store.postId, ms: row.ms, ...detail })
}

function writeJson(file: string, data: unknown) {
  ensureDir(path.dirname(file))
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

/** Begin a post audit slot (consumes one of the 10). Returns auditId or null if done. */
export function beginUgcAuditPost(meta: {
  theme?: string
  themeHook?: string
  themeBody?: string
  category?: string
  slideCount?: number
  seed?: number
  topic?: string
  model?: string
  numCtx?: number
  numGpu?: number
}): string | null {
  const session = readSession()
  if (!session.active || session.completed >= session.target) {
    if (session.active) {
      session.active = false
      writeSession(session)
    }
    return null
  }

  // Allocate from folders on disk, not from `completed`: two overlapping posts both
  // read completed=0 and wrote into post-01, silently destroying the first one.
  const taken = fs.existsSync(AUDIT_ROOT)
    ? fs
        .readdirSync(AUDIT_ROOT, { withFileTypes: true })
        .filter((e) => e.isDirectory() && /^post-\d+$/.test(e.name))
        .map((e) => Number(e.name.slice(5)))
        .filter((v) => Number.isFinite(v))
    : []
  const n = Math.max(session.completed, ...taken, 0) + 1
  const postId = `post-${String(n).padStart(2, '0')}`
  const postDir = path.join(AUDIT_ROOT, postId)
  ensureDir(postDir)
  ensureDir(path.join(postDir, '02-ollama-calls'))

  const store: AuditStore = {
    postId,
    postDir,
    callIndex: 0,
    events: [],
    startedAt: Date.now(),
    callStats: [],
    fallbacks: [],
  }

  writeJson(path.join(postDir, '00-request.json'), {
    postId,
    slot: n,
    target: session.target,
    at: nowIso(),
    ...meta,
  })
  appendTimeline(store, 'begin', { slot: n, theme: meta.theme || meta.themeHook })

  // Bind store for nested async work via run — caller must use runUgcAuditPost
  ;(beginUgcAuditPost as unknown as { _pending?: AuditStore })._pending = store
  return postId
}

export async function runUgcAuditPost<T>(auditId: string | null, fn: () => Promise<T>): Promise<T> {
  const pending = (beginUgcAuditPost as unknown as { _pending?: AuditStore })._pending
  ;(beginUgcAuditPost as unknown as { _pending?: AuditStore })._pending = undefined
  if (!auditId || !pending || pending.postId !== auditId) {
    return fn()
  }
  return als.run(pending, fn)
}

export function auditLog(event: string, detail: Record<string, unknown> = {}) {
  const store = als.getStore()
  if (!store) return
  appendTimeline(store, event, detail)
}

export function auditWrite(filename: string, data: unknown) {
  const store = als.getStore()
  if (!store) return
  writeJson(path.join(store.postDir, filename), data)
  appendTimeline(store, 'write', { filename })
}

/** Log one Ollama generate call (full detail). */
export function auditOllamaCall(payload: {
  prompt: string
  system?: string
  model: string
  options: Record<string, unknown>
  keepAlive?: unknown
  useJsonFormat?: boolean
  responseText: string
  ollamaMeta?: Record<string, unknown>
  durationMs: number
  error?: string
  emptyRetry?: boolean
  callType?: string
  requestedNumPredict?: number
}) {
  const store = als.getStore()
  if (!store) return
  store.callIndex += 1
  const callType = payload.callType || 'other'
  const errorText = payload.error || ''
  const numPredict = Number(payload.options?.num_predict)
  store.callStats.push({
    callIndex: store.callIndex,
    callType,
    outcome: !errorText
      ? 'ok'
      : /timeout/i.test(errorText)
        ? 'timeout'
        : /abort/i.test(errorText)
          ? 'aborted'
          : 'error',
    durationMs: payload.durationMs,
    numPredict: Number.isFinite(numPredict) ? numPredict : null,
    requestedNumPredict: payload.requestedNumPredict ?? null,
    evalCount: typeof payload.ollamaMeta?.eval_count === 'number' ? payload.ollamaMeta.eval_count : null,
    doneReason: typeof payload.ollamaMeta?.done_reason === 'string' ? payload.ollamaMeta.done_reason : null,
  })
  const name = `call-${String(store.callIndex).padStart(2, '0')}-${callType}.json`
  const file = path.join(store.postDir, '02-ollama-calls', name)
  writeJson(file, {
    at: nowIso(),
    callIndex: store.callIndex,
    callType,
    requestedNumPredict: payload.requestedNumPredict ?? null,
    durationMs: payload.durationMs,
    model: payload.model,
    useJsonFormat: payload.useJsonFormat,
    keepAlive: payload.keepAlive,
    options: payload.options,
    systemChars: (payload.system || '').length,
    promptChars: payload.prompt.length,
    responseChars: (payload.responseText || '').length,
    system: payload.system || '',
    prompt: payload.prompt,
    responseText: payload.responseText,
    ollamaMeta: payload.ollamaMeta || {},
    error: payload.error || null,
    emptyRetry: Boolean(payload.emptyRetry),
  })
  appendTimeline(store, 'ollama_call', {
    callIndex: store.callIndex,
    callType,
    durationMs: payload.durationMs,
    responseChars: (payload.responseText || '').length,
    error: payload.error || null,
  })
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

function captionSimilarityTokens(text: string): Set<string> {
  return new Set(
    text
      .toLocaleLowerCase('lt-LT')
      .split(/[^\p{L}]+/u)
      .filter((word) => word.length >= 4),
  )
}

function captionHookMismatch(caption: string, hookTitle?: string): boolean {
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

/** Copy rendered slide PNGs into the audit post folder (test mode). */
export function attachUgcAuditRenderedSlides(
  auditId: string | undefined,
  slides: Array<{ filename: string; data: string }>,
) {
  if (!auditId || !/^post-\d{2}$/.test(auditId) || !slides.length) return
  const postDir = path.join(AUDIT_ROOT, auditId)
  if (!fs.existsSync(postDir)) return
  const outDir = path.join(postDir, '16-rendered-slides')
  ensureDir(outDir)
  for (const slide of slides) {
    if (!slide.data) continue
    fs.writeFileSync(path.join(outDir, slide.filename), Buffer.from(slide.data, 'base64'))
  }
  visionPcLog('audit_rendered_slides', { auditId, count: slides.length, dir: outDir })
}

/** Attach caption/meta after client save (matches auditId). */
export function attachUgcAuditExport(auditId: string | undefined, payload: {
  caption?: string
  meta?: Record<string, unknown>
  batchDir?: string
  ok?: boolean
  error?: string
  renderedSlides?: Array<{ filename: string; data: string }>
}) {
  if (!auditId || !/^post-\d{2}$/.test(auditId)) return
  const postDir = path.join(AUDIT_ROOT, auditId)
  if (!fs.existsSync(postDir)) return
  if (payload.caption != null) {
    const storySlides = Array.isArray(payload.meta?.story_slides)
      ? (payload.meta?.story_slides as Array<{
          title?: string
          body?: string
          cta?: string
          role?: string
        }>)
      : undefined
    writeJson(path.join(postDir, '07-caption.json'), {
      caption: payload.caption,
      scan: scanCaption(payload.caption, storySlides, payload.meta?.caption_source),
      attachedAt: nowIso(),
    })
    fs.writeFileSync(path.join(postDir, '07-caption.txt'), payload.caption.trim() + '\n', 'utf8')
    if (storySlides?.length) {
      const themeText = [
        payload.meta?.theme,
        payload.meta?.hook,
        payload.meta?.body,
        payload.meta?.category,
      ]
        .filter((value): value is string => typeof value === 'string')
        .join(' ')
      const slideScan = scanSlideQuality(storySlides, themeText)
      const captionScan = scanCaption(payload.caption, storySlides, payload.meta?.caption_source)
      const slideIssueCount = slideScan.reduce((sum, slide) => sum + slide.issues.length, 0)
      writeJson(path.join(postDir, '08-quality-scan.json'), {
        slides: slideScan,
        caption: captionScan,
      })
      writeJson(path.join(postDir, '14-gate-report.json'), {
        ok: slideIssueCount === 0 && captionScan.issues.length === 0,
        slideIssueCount,
        captionIssueCount: captionScan.issues.length,
        failedSlides: slideScan.filter((slide) => !slide.shipable).map((slide) => slide.index),
        generatedAt: nowIso(),
      })
    }
  }
  if (payload.meta) {
    writeJson(path.join(postDir, '11-export-meta.json'), payload.meta)
  }
  if (payload.batchDir) {
    writeJson(path.join(postDir, '12-export-path.json'), { batchDir: payload.batchDir, at: nowIso() })
  }
  if (payload.error) {
    writeJson(path.join(postDir, '09-error.json'), { error: payload.error, at: nowIso(), phase: 'export' })
  }
  if (payload.renderedSlides?.length) {
    attachUgcAuditRenderedSlides(auditId, payload.renderedSlides)
  }
  const timeline = path.join(postDir, '01-timeline.jsonl')
  fs.appendFileSync(
    timeline,
    JSON.stringify({ t: nowIso(), event: 'export_attach', ok: payload.ok !== false }) + '\n',
    'utf8',
  )
}
