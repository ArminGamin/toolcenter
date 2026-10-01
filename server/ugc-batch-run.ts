import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { consumeUgcImage, pickBatchUgcImages, pickKaleduSlideBackgrounds } from './ugc-image-pool.js'
import { pickBatchUgcThemes, type UgcThemeEntry } from './ugc-theme-pool.js'
import {
  generateUgcSlideshowCopy,
  releaseUgcOllamaAfterBatch,
  warmUgcOllamaModel,
} from './ugc-slides.js'
import { clearUgcModelDeployCache, verifyUgcModelDeploy } from './ugc-ollama-status.js'
import { redeployUgcOllamaModel } from './ugc-modelfile-sync.js'
import { UGC_MAX_STORY_SLIDES } from './ugc-story-engine.js'
import { assertUgcSemanticQaReady } from './ugc-qa-client.js'
import { buildBatchPostCaption } from './ugc-caption-format.js'
import { ugcActiveCta } from './ugc-cta-normalize.js'
import { currentBusinessProfile } from './business-profiles.js'
import { isChristmasGiftsNiche } from './profile-brand.js'
import { resolveUniversalUgcDescription } from '../src/lib/ugc-universal-description.js'
import {
  attachUgcAuditExport,
  deactivateUgcAuditCapture,
  getUgcAuditStatus,
  logUgcAuditClientEvent,
  resetUgcAuditSession,
  validateUgcExportPost,
  visionPcLog,
  UGC_VISION_ROOT,
  cancelUgcAuditOnAbort,
  writeUgcTestBatchManifest,
} from './ugc-batch-audit.js'
import { saveUgcBatchPostToDisk, type SaveBatchPost } from './ugc-batch-export.js'

function runDir(id = currentBusinessProfile().id): string {
  return path.join(UGC_VISION_ROOT, id)
}

function runPath(id = currentBusinessProfile().id): string {
  return path.join(runDir(id), 'batch-run.json')
}

function runTmpPath(id = currentBusinessProfile().id): string {
  return path.join(runDir(id), 'batch-run.json.tmp')
}

const runs = new Map<string, UgcBatchRunState>()
const loops = new Map<string, Promise<void>>()
const generations = new Map<string, number>()
const abortControllers = new Map<string, AbortController>()
const SCHEMA_VERSION = 2
const STALE_RUN_MS = 2 * 60 * 1000

export type UgcBatchRunPost = {
  postIndex: number
  theme: UgcThemeEntry
  slideCount: number
  imageNames: string[]
  copyStatus: 'pending' | 'generating' | 'ready' | 'failed'
  saved: boolean
  slides?: Array<{ id: string; title: string; body: string; cta?: string; role?: string }>
  caption?: string
  meta?: Record<string, unknown>
  arcName?: string
  hookStyle?: string
  storyArc?: string
  auditId?: string | null
  error?: string
}

export type UgcBatchRunLine = {
  ok: boolean
  text: string
  detail?: string
}

export type UgcBatchRunState = {
  schemaVersion?: number
  runId?: string
  serverPid?: number
  status: 'idle' | 'running' | 'ready' | 'done' | 'error' | 'aborted' | 'stale'
  message: string
  progress: number
  startedAt: number
  finishedAt?: number
  abortRequested: boolean
  count: number
  okCount: number
  outputFolder: string
  batchDir?: string
  options: {
    slideMin: number
    slideMax: number
    category: string
    testMode: boolean
    defaultCta: string
    universalDescription?: string
    useFolderImages: boolean
  }
  posts: UgcBatchRunPost[]
  lines: UgcBatchRunLine[]
}

function emptyRun(): UgcBatchRunState {
  return {
    status: 'idle',
    message: '',
    progress: 0,
    startedAt: 0,
    abortRequested: false,
    count: 0,
    okCount: 0,
    outputFolder: '',
    options: {
      slideMin: 3,
      slideMax: 7,
      category: 'Random theme',
      testMode: false,
      defaultCta: ugcActiveCta(),
      useFolderImages: true,
    },
    posts: [],
    lines: [],
  }
}

function runSlot(id = currentBusinessProfile().id): UgcBatchRunState {
  let slot = runs.get(id)
  if (!slot) {
    slot = emptyRun()
    runs.set(id, slot)
  }
  return slot
}

function setRunSlot(next: UgcBatchRunState, id = currentBusinessProfile().id) {
  runs.set(id, next)
}

function bumpGeneration(id: string): number {
  const next = (generations.get(id) || 0) + 1
  generations.set(id, next)
  return next
}

function isStaleBatchLoop(gen: number, id = currentBusinessProfile().id): boolean {
  return gen !== (generations.get(id) || 0)
}

export function getUgcBatchAbortSignal(): AbortSignal | undefined {
  return abortControllers.get(currentBusinessProfile().id)?.signal
}

export function isUgcBatchAbortRequested(): boolean {
  return runSlot().abortRequested
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function persistRun(batch = runSlot(), id = currentBusinessProfile().id) {
  setRunSlot(batch, id)
  try {
    fs.mkdirSync(runDir(id), { recursive: true })
    batch.schemaVersion = SCHEMA_VERSION
    const payload = JSON.stringify(batch, null, 2) + '\n'
    fs.writeFileSync(runTmpPath(id), payload, 'utf8')
    fs.renameSync(runTmpPath(id), runPath(id))
  } catch {
    try {
      fs.writeFileSync(runPath(id), JSON.stringify(batch, null, 2) + '\n', 'utf8')
    } catch {
      /* never break generation for checkpoint I/O */
    }
  }
}

function isStaleRunningDisk(disk: UgcBatchRunState): boolean {
  if (disk.status !== 'running') return false
  if (!disk.startedAt) return true
  return Date.now() - disk.startedAt > STALE_RUN_MS
}

function markStaleRunAborted(disk: UgcBatchRunState): UgcBatchRunState {
  return {
    ...disk,
    status: 'aborted',
    abortRequested: true,
    message: 'Stale run aborted on boot',
    finishedAt: Date.now(),
    posts: disk.posts.map((p) =>
      p.copyStatus === 'generating'
        ? { ...p, copyStatus: 'failed' as const, error: 'stale' }
        : p,
    ),
  }
}

function loadRunFromDisk(): UgcBatchRunState | null {
  try {
    if (!fs.existsSync(runPath())) return null
    const parsed = JSON.parse(fs.readFileSync(runPath(), 'utf8')) as UgcBatchRunState
    if (!parsed || typeof parsed !== 'object') return null
    if (parsed.status === 'idle') return null
    return parsed
  } catch {
    return null
  }
}

function touch(batch: UgcBatchRunState, id: string, message: string, progress?: number) {
  batch.message = message
  if (progress != null) batch.progress = progress
  persistRun(batch, id)
}

function step(batch: UgcBatchRunState, id: string, message: string, progress?: number) {
  const stamp = new Date().toISOString().slice(11, 19)
  touch(batch, id, message, progress)
  batch.lines.push({ ok: true, text: `· ${stamp}  ${message}` })
  if (batch.lines.length > 250) batch.lines = batch.lines.slice(-250)
  visionPcLog('batch_step', { message })
  persistRun(batch, id)
}

export function getUgcBatchRun(): UgcBatchRunState {
  const id = currentBusinessProfile().id
  let batch = runSlot(id)
  if (batch.status === 'idle') {
    const disk = loadRunFromDisk()
    if (disk && disk.status !== 'idle') {
      setRunSlot(disk, id)
      batch = disk
    }
  }
  return { ...batch, posts: [...batch.posts] }
}

export function abortUgcBatchRun(): { ok: boolean; message: string } {
  const id = currentBusinessProfile().id
  const batch = runSlot(id)
  if (batch.status !== 'running' && batch.status !== 'ready') {
    return { ok: false, message: 'No batch run in progress' }
  }
  batch.abortRequested = true
  batch.status = 'aborted'
  batch.message = 'Stopped'
  batch.finishedAt = Date.now()
  for (const post of batch.posts) {
    if (post.copyStatus === 'generating') {
      post.copyStatus = 'failed'
      post.error = 'aborted'
    }
  }
  abortControllers.get(id)?.abort()
  cancelUgcAuditOnAbort()
  persistRun(batch, id)
  visionPcLog('batch_run_abort', {
    runId: batch.runId,
    okCount: batch.okCount,
    count: batch.count,
    gen: generations.get(id) || 0,
  })
  void releaseUgcOllamaAfterBatch().catch(() => {})
  return { ok: true, message: 'Batch stopped' }
}

export function forceKillUgcBatchRun(): { ok: boolean; message: string } {
  const id = currentBusinessProfile().id
  bumpGeneration(id)
  abortControllers.get(id)?.abort()
  const batch = runSlot(id)
  batch.abortRequested = true
  batch.status = 'aborted'
  batch.message = 'Force stopped'
  batch.finishedAt = Date.now()
  for (const post of batch.posts) {
    if (post.copyStatus === 'generating') {
      post.copyStatus = 'failed'
      post.error = 'aborted'
    }
  }
  cancelUgcAuditOnAbort()
  const cleared = emptyRun()
  setRunSlot(cleared, id)
  try {
    if (fs.existsSync(runPath(id))) fs.unlinkSync(runPath(id))
    if (fs.existsSync(runTmpPath(id))) fs.unlinkSync(runTmpPath(id))
  } catch {
    /* ignore */
  }
  void releaseUgcOllamaAfterBatch().catch(() => {})
  return { ok: true, message: 'Force killed and cleared' }
}

export function clearUgcBatchRun(): { ok: boolean; message: string } {
  const id = currentBusinessProfile().id
  const batch = runSlot(id)
  if (batch.status === 'running') {
    return { ok: false, message: 'Stop the batch first' }
  }
  setRunSlot(emptyRun(), id)
  try {
    if (fs.existsSync(runPath(id))) fs.unlinkSync(runPath(id))
  } catch {
    /* ignore */
  }
  return { ok: true, message: 'Cleared' }
}

export function startUgcBatchRun(opts: {
  count: number
  slideMin: number
  slideMax: number
  category: string
  testMode: boolean
  outputFolder: string
  defaultCta?: string
  universalDescription?: string
  useFolderImages: boolean
}): { ok: boolean; message: string; run?: UgcBatchRunState } {
  const id = currentBusinessProfile().id
  if (loops.get(id)) {
    const prev = runSlot(id)
    bumpGeneration(id)
    abortControllers.get(id)?.abort()
    prev.abortRequested = true
    visionPcLog('batch_zombie_suppressed', { gen: generations.get(id), prevRunId: prev.runId })
  }
  const disk = loadRunFromDisk()
  if (disk && disk.status === 'running') {
    if (isStaleRunningDisk(disk)) {
      const aborted = markStaleRunAborted(disk)
      setRunSlot(aborted, id)
      persistRun(aborted, id)
    } else {
      visionPcLog('batch_stale_reattach_refused', { runId: disk.runId })
    }
  }

  const count = Math.max(1, Math.min(50, Math.floor(opts.count)))
  const slideMin = Math.max(2, Math.floor(opts.slideMin))
  const slideMax = Math.max(slideMin, Math.min(UGC_MAX_STORY_SLIDES, Math.floor(opts.slideMax)))

  const myGen = bumpGeneration(id)
  const runId = randomUUID()
  const controller = new AbortController()
  abortControllers.set(id, controller)

  const batch: UgcBatchRunState = {
    schemaVersion: SCHEMA_VERSION,
    runId,
    serverPid: process.pid,
    status: 'running',
    message: 'Starting…',
    progress: 0,
    startedAt: Date.now(),
    abortRequested: false,
    count,
    okCount: 0,
    outputFolder: opts.outputFolder.trim(),
    options: {
      slideMin,
      slideMax,
      category: opts.category,
      testMode: opts.testMode,
      defaultCta: opts.defaultCta?.trim() || ugcActiveCta(),
      universalDescription: resolveUniversalUgcDescription(id, opts.universalDescription),
      useFolderImages: opts.useFolderImages,
    },
    posts: [],
    lines: [],
  }
  setRunSlot(batch, id)
  persistRun(batch, id)
  const loop = runBatchLoop(batch, id, count, slideMin, slideMax, opts, myGen, runId).finally(() => {
    if (loops.get(id) === loop) loops.delete(id)
  })
  loops.set(id, loop)
  return { ok: true, message: 'Batch started', run: getUgcBatchRun() }
}

async function runBatchLoop(
  batch: UgcBatchRunState,
  id: string,
  count: number,
  slideMin: number,
  slideMax: number,
  opts: {
    category: string
    testMode: boolean
    useFolderImages: boolean
  },
  gen: number,
  runId: string,
) {
  try {
    if (opts.testMode) {
      const auditBefore = getUgcAuditStatus()
      if (!auditBefore.active || auditBefore.remaining < count || auditBefore.runId !== runId) {
        resetUgcAuditSession({
          target: count,
          runId,
          note: `Test mode: ${count} post(s), slides ${slideMin}–${slideMax} — full D: capture`,
        })
      }
      visionPcLog('test_mode_audit_on', { runId, target: count, root: auditBefore.root })
    } else {
      deactivateUgcAuditCapture('Batch run without test mode')
    }

    visionPcLog('batch_begin', {
      runId,
      count,
      slideMin,
      slideMax,
      testMode: opts.testMode,
      category: opts.category,
      serverRun: true,
      gen,
    })

    touch(batch, id, 'Picking themes…', 0.02)
    if (!batch.posts.length) {
      const pickRes = pickBatchUgcThemes(count, opts.category, { testMode: opts.testMode })
      if (!pickRes.ok || !pickRes.themes?.length) {
        throw new Error(pickRes.message || 'Failed to pick themes')
      }

      let pickedImages: { filename: string }[] = []
      if (opts.useFolderImages && !isChristmasGiftsNiche()) {
        touch(batch, id, 'Picking images…', 0.05)
        const imagesNeeded = count * slideMax
        const imgPick = pickBatchUgcImages(imagesNeeded, { testMode: opts.testMode })
        if (!imgPick.ok || !imgPick.images?.length) {
          throw new Error(imgPick.message || 'Failed to pick images')
        }
        pickedImages = imgPick.images
      }

      let imageCursor = 0
      batch.posts = pickRes.themes.map((theme, i) => {
        const slideCount = randomInt(slideMin, slideMax)
        const imageNames: string[] = []
        if (opts.useFolderImages) {
          for (let s = 0; s < slideCount; s++) {
            const img = pickedImages[imageCursor]
            if (img) imageNames.push(img.filename)
            imageCursor += 1
          }
        }
        return {
          postIndex: i + 1,
          theme,
          slideCount,
          imageNames,
          copyStatus: 'pending' as const,
          saved: false,
        }
      })
      persistRun(batch, id)
    }

    touch(batch, id, 'Loading Ollama model onto GPU…', 0.08)
    step(batch, id, 'Warming ugc-lt-gpu…')
    await warmUgcOllamaModel()
    let deploy = await verifyUgcModelDeploy(true)
    if (!deploy.systemHashMatch) {
      step(batch, id, 'Syncing ugc-lt-gpu SYSTEM prompt from code…')
      const redeploy = await redeployUgcOllamaModel()
      if (!redeploy.ok) {
        throw new Error(redeploy.message)
      }
      clearUgcModelDeployCache()
      await warmUgcOllamaModel()
      deploy = await verifyUgcModelDeploy(true)
      if (!deploy.systemHashMatch) {
        throw new Error(
          deploy.message ||
            'ugc-lt-gpu SYSTEM prompt still out of date after ollama create — check Ollama logs',
        )
      }
      step(batch, id, 'ugc-lt-gpu SYSTEM prompt updated')
    }
    step(batch, id, 'Model OK — LLM QA off (TypeScript shipable gates only)')
    assertUgcSemanticQaReady()
    if (batch.abortRequested || isStaleBatchLoop(gen, id)) return

    const startIndex = batch.posts.findIndex(
      (p) => p.copyStatus === 'pending' || p.copyStatus === 'generating',
    )
    await runPostsFrom(batch, id, startIndex < 0 ? 0 : startIndex, gen)
  } catch (err) {
    if (batch.abortRequested || isStaleBatchLoop(gen, id)) return
    batch.status = 'error'
    batch.message = err instanceof Error ? err.message : String(err)
    batch.finishedAt = Date.now()
    persistRun(batch, id)
    visionPcLog('batch_run_error', { error: batch.message })
    await releaseUgcOllamaAfterBatch().catch(() => {})
  }
}

async function runPostsFrom(batch: UgcBatchRunState, id: string, startIndex: number, gen: number) {
  const { slideMin, slideMax, category, testMode, defaultCta, useFolderImages } = batch.options
  void slideMin
  void slideMax

  for (let i = startIndex; i < batch.posts.length; i++) {
    if (batch.abortRequested || isStaleBatchLoop(gen, id)) {
      if (!isStaleBatchLoop(gen, id)) {
        batch.status = 'aborted'
        batch.finishedAt = Date.now()
        persistRun(batch, id)
      }
      await releaseUgcOllamaAfterBatch().catch(() => {})
      return
    }

    const post = batch.posts[i]
    if (post.copyStatus === 'ready' || post.copyStatus === 'failed') continue

    post.copyStatus = 'generating'
    step(
      batch,
      id,
      `Post ${post.postIndex}/${batch.count} — generating ${post.slideCount}-slide story…`,
      i / batch.count,
    )
    persistRun(batch, id)

    let postPhase = 'story'
    try {
      const theme = post.theme
      const storyRes = await generateUgcSlideshowCopy({
        angle: 'custom',
        brief: `Kabliukas: ${theme.hook}\nPagrindinė mintis: ${theme.body}`,
        cta: defaultCta,
        slideCount: post.slideCount,
        batchStory: true,
        seed: post.postIndex,
        skipWarm: true,
        theme: theme.theme,
        category,
        kind: theme.kind,
        modeHint: theme.modeHint,
        productHints: theme.productHints,
        abortSignal: abortControllers.get(id)?.signal,
        onProgress: (msg) => step(batch, id, `Post ${post.postIndex}: ${msg}`, i / batch.count),
      })
      if (batch.abortRequested || isStaleBatchLoop(gen, id)) {
        if (!isStaleBatchLoop(gen, id) && post.copyStatus === 'generating') {
          post.copyStatus = 'failed'
          post.error = 'aborted'
          persistRun(batch, id)
        }
        await releaseUgcOllamaAfterBatch().catch(() => {})
        return
      }
      if (!storyRes.ok || !storyRes.slides?.length) {
        const failMsg = 'message' in storyRes ? storyRes.message : 'Failed to generate slideshow copy'
        if (batch.abortRequested || isStaleBatchLoop(gen, id) || /aborted/i.test(failMsg || '')) {
          if (!isStaleBatchLoop(gen, id) && post.copyStatus === 'generating') {
            post.copyStatus = 'failed'
            post.error = 'aborted'
            persistRun(batch, id)
          }
          await releaseUgcOllamaAfterBatch().catch(() => {})
          return
        }
        throw new Error(failMsg || 'Failed to generate slideshow copy')
      }

      if (useFolderImages && isChristmasGiftsNiche()) {
        const categories = storyRes.slides.map((slide) => {
          const intent = 'visualIntent' in slide ? String(slide.visualIntent || '') : ''
          return intent || 'COZY_HOME'
        })
        const bgPick = pickKaleduSlideBackgrounds(categories, { testMode })
        if (!bgPick.ok || !bgPick.images?.length) {
          throw new Error(bgPick.message || 'Failed to pick Christmas backgrounds')
        }
        post.imageNames = bgPick.images.map((img) => img.filename)
      }

      postPhase = 'caption'
      const universalDescription = batch.options.universalDescription
      step(batch, id, `Post ${post.postIndex}: ${universalDescription === undefined ? 'building caption' : 'using universal description'}…`, (i + 0.7) / batch.count)
      const hookSlide =
        storyRes.slides.find((slide) => slide.role === 'hook') || storyRes.slides[0]
      if (!(hookSlide?.title || '').trim()) {
        throw new Error('Caption cannot be built without the shipped hook title')
      }

      const caption = buildBatchPostCaption({
        themeHook: theme.hook,
        themeBody: theme.body,
        slides: storyRes.slides,
        defaultCta,
        seed: post.postIndex,
        theme: theme.theme,
        category,
        universalDescription,
      })
      const captionP1 =
        caption
          .replace(/\r\n/g, '\n')
          .split(/\n{2,}/)
          .find((part) => part.trim() && !part.trim().startsWith('📌'))
          ?.trim() || ''

      logUgcAuditClientEvent(storyRes.auditId || undefined, 'caption_build', {
        postIndex: post.postIndex,
        hookTitle: hookSlide.title.trim(),
        captionP1,
        source: universalDescription !== undefined ? 'universal' : 'generated',
      })

      const postMeta: Record<string, unknown> = {
        theme: theme.theme,
        hook: theme.hook,
        body: theme.body,
        category,
        slide_count: storyRes.slides.length,
        background_image: post.imageNames.join(', '),
        story_slides: storyRes.slides,
        arc_name: storyRes.arcName,
        hook_style: storyRes.hookStyle,
        story_arc: storyRes.storyArc,
        auditId: storyRes.auditId || undefined,
        caption_preview: caption,
        caption_source: universalDescription !== undefined ? 'universal' : 'generated',
        picked_products: 'pickedProducts' in storyRes ? storyRes.pickedProducts || [] : [],
      }

      postPhase = 'quality-gate'
      step(batch, id, `Post ${post.postIndex}: pre-export quality gate…`, (i + 0.85) / batch.count)
      const quality = validateUgcExportPost({ caption, meta: postMeta })
      if (!quality.ok) {
        logUgcAuditClientEvent(storyRes.auditId || undefined, 'pre_export_gate_fail', {
          postIndex: post.postIndex,
          issues: quality.issues,
        })
        attachUgcAuditExport(storyRes.auditId || undefined, {
          ok: false,
          caption,
          meta: postMeta,
          error: `Pre-export quality gate: ${quality.issues.join(', ')}`,
        })
        throw new Error(`Pre-export quality gate blocked post: ${quality.issues.join(', ')}`)
      }

      if (useFolderImages && !testMode) {
        for (const filename of post.imageNames) {
          const moved = consumeUgcImage(filename)
          if (!moved.ok) {
            throw new Error(moved.message || `Failed to mark image as used: ${filename}`)
          }
        }
      }

      post.slides = storyRes.slides
      post.caption = caption
      post.meta = postMeta
      post.arcName = storyRes.arcName
      post.hookStyle = storyRes.hookStyle
      post.storyArc = storyRes.storyArc
      post.auditId = storyRes.auditId
      post.copyStatus = 'ready'
      post.error = undefined
      batch.okCount += 1
      batch.lines.push({
        ok: true,
        text: `✓ Post ${String(post.postIndex).padStart(2, '0')} — ${storyRes.slides.length} slides — ${storyRes.arcName || 'story'} — ${theme.hook}`,
      })
    } catch (err) {
      if (batch.abortRequested || isStaleBatchLoop(gen, id)) {
        if (!isStaleBatchLoop(gen, id) && post.copyStatus === 'generating') {
          post.copyStatus = 'failed'
          post.error = 'aborted'
          persistRun(batch, id)
        }
        await releaseUgcOllamaAfterBatch().catch(() => {})
        return
      }
      const failMsg = err instanceof Error ? err.message : 'failed'
      post.copyStatus = 'failed'
      post.error = failMsg
      logUgcAuditClientEvent(undefined, 'batch_post_fail', {
        postIndex: post.postIndex,
        slideCount: post.slideCount,
        phase: postPhase,
        theme: post.theme.theme,
        hook: post.theme.hook,
        error: failMsg,
      })
      batch.lines.push({
        ok: false,
        text: `✗ Post ${String(post.postIndex).padStart(2, '0')} — ${failMsg}`,
      })
    }

    touch(batch, id, `Post ${post.postIndex}/${batch.count} done`, (i + 1) / batch.count)
    persistRun(batch, id)
  }

  if (batch.abortRequested || isStaleBatchLoop(gen, id)) {
    if (!isStaleBatchLoop(gen, id) && batch.status === 'running') {
      batch.status = 'aborted'
      batch.finishedAt = Date.now()
      persistRun(batch, id)
    }
    await releaseUgcOllamaAfterBatch().catch(() => {})
    return
  }

  batch.status = 'ready'
  batch.message = `Copy done — ${batch.okCount}/${batch.count} ready to render`
  batch.progress = 1
  batch.finishedAt = Date.now()
  persistRun(batch, id)
  visionPcLog('batch_run_copy_done', { okCount: batch.okCount, count: batch.count })
  if (testMode) {
    writeUgcTestBatchManifest({
      runId: batch.runId || 'unknown',
      profileId: id,
      count: batch.count,
      okCount: batch.okCount,
      outputFolder: batch.outputFolder,
      batchDir: batch.batchDir,
      posts: batch.posts.map((p) => ({
        postIndex: p.postIndex,
        auditId: p.auditId,
        copyStatus: p.copyStatus,
        saved: p.saved,
        theme: p.theme.theme,
        error: p.error,
      })),
    })
  }
  await releaseUgcOllamaAfterBatch().catch(() => {})
}

export function saveUgcBatchRunPost(payload: SaveBatchPost): {
  ok: boolean
  message?: string
  batchDir?: string
} {
  const id = currentBusinessProfile().id
  const batch = runSlot(id)
  const post = batch.posts.find((p) => p.postIndex === payload.postIndex)
  if (!post) return { ok: false, message: 'Post not found in active batch run' }
  if (post.copyStatus !== 'ready') return { ok: false, message: 'Post copy is not ready' }

  const result = saveUgcBatchPostToDisk(batch.outputFolder || undefined, batch.batchDir, payload)
  if (!result.ok) return result

  if (!batch.batchDir) batch.batchDir = result.batchDir
  const auditId =
    typeof post.meta?.auditId === 'string'
      ? post.meta.auditId
      : typeof payload.meta?.auditId === 'string'
        ? payload.meta.auditId
        : post.auditId || undefined
  attachUgcAuditExport(auditId, {
    caption: payload.caption,
    meta: payload.meta,
    batchDir: result.batchDir,
    ok: true,
    renderedSlides: payload.slides,
  })
  post.saved = true
  const allHandled = batch.posts.every(
    (p) => p.copyStatus === 'failed' || (p.copyStatus === 'ready' && p.saved),
  )
  if (allHandled && batch.status === 'ready') {
    batch.status = 'done'
    batch.message = `Done: ${batch.posts.filter((p) => p.saved).length}/${batch.count} posts → ${batch.batchDir}`
    batch.finishedAt = Date.now()
    visionPcLog('batch_complete', {
      okCount: batch.posts.filter((p) => p.saved).length,
      total: batch.count,
      batchDir: batch.batchDir,
      serverRun: true,
    })
    if (batch.options.testMode) {
      writeUgcTestBatchManifest({
        runId: batch.runId || 'unknown',
        profileId: id,
        count: batch.count,
        okCount: batch.posts.filter((p) => p.copyStatus === 'ready').length,
        outputFolder: batch.outputFolder,
        batchDir: batch.batchDir,
        posts: batch.posts.map((p) => ({
          postIndex: p.postIndex,
          auditId: p.auditId,
          copyStatus: p.copyStatus,
          saved: p.saved,
          theme: p.theme.theme,
          error: p.error,
        })),
      })
    }
  }
  persistRun(batch, id)
  return result
}

export function initUgcBatchRunFromDisk() {
  const id = currentBusinessProfile().id
  const disk = loadRunFromDisk()
  if (!disk) return
  if (disk.status === 'running' && isStaleRunningDisk(disk)) {
    const aborted = markStaleRunAborted(disk)
    setRunSlot(aborted, id)
    persistRun(aborted, id)
    visionPcLog('batch_stale_aborted_on_boot', { runId: disk.runId })
    return
  }
  if (disk.status === 'running') {
    const aborted = markStaleRunAborted(disk)
    setRunSlot(aborted, id)
    persistRun(aborted, id)
    visionPcLog('batch_running_refused_on_boot', { runId: disk.runId })
    return
  }
  setRunSlot(disk, id)
}
