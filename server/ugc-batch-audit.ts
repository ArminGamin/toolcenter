/**
 * Full-detail audit logger for the next N batch posts only.
 * Default root: D:\ugc-batch-vision\audit (override with UGC_AUDIT_ROOT).
 * Auto-stops when SESSION.completed >= target.
 */

import fs from 'node:fs'
import path from 'node:path'
import { als, appendTimeline, AUDIT_ROOT, ensureDir, inactiveAuditSession, nowIso, PC_LOG_PATH, readSession, scanCaption, scanSlideQuality, UGC_VISION_ROOT, visionPcLog, writeJson, writeSession, type AuditStore, type UgcAuditSession } from './ugc-audit/finalize.js'
export { finalizeUgcAuditPost, scanCaption, scanSlideQuality, UGC_VISION_ROOT, validateUgcExportPost, visionPcLog } from './ugc-audit/finalize.js'
export type { UgcAuditCaptureMode, UgcAuditSession } from './ugc-audit/finalize.js'
export const UGC_AUDIT_TARGET_POSTS = Number(process.env.UGC_AUDIT_TARGET || 5) || 5

/** Record a deterministic fallback that replaced model copy (audit + timeline). */
export function auditFallback(entry: { slide: number; role?: string; reason: string; text: string }) {
  const store = als.getStore()
  if (!store) return
  store.fallbacks.push(entry)
  appendTimeline(store, 'fallback_used', entry)
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
