import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  loadImageElement,
  isChristmasUgcProfile,
  MAX_SLIDESHOW_SLIDES,
  MIN_SLIDESHOW_SLIDES,
  publishUgcToDiscord,
  resolveExportSize,
  validateImageFile,
  fetchUgcAuditStatus,
  postUgcVisionLog,
  type UgcAuditStatusView,
  type UgcSlidesDraft,
  type UgcSlideshowSlideCopy,
} from '../../lib/ugc-slides'
import {
  blobToBase64,
  buildUgcSlideIndexFilename,
  type SlideshowExportSlide,
} from '../../lib/ugc-slides-export'
import {
  buildUgcImageServeUrl,
  buildUgcProductServeUrl,
  fetchUgcImagePoolStatus,
  type UgcImagePoolStatus,
} from '../../lib/ugc-image-pool'
import {
  fetchUgcThemePoolStatus,
  resetUgcThemePool,
  type UgcThemePoolStatus,
} from '../../lib/ugc-theme-pool'
import { UGC_DEFAULT_CTA } from '../../lib/ugc-cta'
import { renderUgcSlide, canvasToPngBlob, ensureUgcSlideFontsReady, type UgcTemplate } from '../../lib/ugc-slides-render'
import {
  abortUgcBatchRun,
  clearUgcBatchRun,
  fetchUgcBatchRun,
  isUgcBatchRunActive,
  saveUgcBatchRunPost,
  startUgcBatchRun,
  type UgcBatchRunPostView,
  type UgcBatchRunView,
} from '../../lib/ugc-batch-run'
import { abortableSleep, isAbortError } from '../../lib/ugc-fetch'
import { batchErrorDetail } from '../../lib/ugc-error-detail'
import { openFolderPath } from '../../lib/launch'
import { ErrorRetryCallout, inputCls } from '../ui/primitives'
import { activeBusinessProfileId } from '../../lib/business-profiles'
import { resolveUniversalUgcDescription } from '../../lib/ugc-universal-description'
import { UgcUniversalDescription, type UgcDescriptionSettings } from './UgcUniversalDescription'

const BATCH_PREFS_KEY = 'cc-ugc-batch-prefs-v3'
const BATCH_DISCORD_POSTED_KEY = 'cc-ugc-batch-discord-posted'

function loadDiscordPosted(): Set<number> {
  try {
    const raw = sessionStorage.getItem(BATCH_DISCORD_POSTED_KEY)
    return raw ? new Set(JSON.parse(raw) as number[]) : new Set()
  } catch {
    return new Set()
  }
}

function saveDiscordPosted(set: Set<number>) {
  sessionStorage.setItem(BATCH_DISCORD_POSTED_KEY, JSON.stringify([...set]))
}

function clearDiscordPosted() {
  sessionStorage.removeItem(BATCH_DISCORD_POSTED_KEY)
}

const SLIDE_OPTS = Array.from(
  { length: MAX_SLIDESHOW_SLIDES - MIN_SLIDESHOW_SLIDES + 1 },
  (_, i) => String(MIN_SLIDESHOW_SLIDES + i),
)

type BatchImage = { id: string; url: string; file: File }

type BatchPrefs = {
  batchCount: string
  slideMin: string
  slideMax: string
  outputFolder: string
  postToDiscord: boolean
  category: string
}

const VISION_BATCH_OUTPUT = 'D:\\ugc-batch-vision\\batch'

type BatchResultLine = {
  ok: boolean
  text: string
  detail?: string
}

type DiscordResultLine = {
  ok: boolean
  index: number
  channel?: string
  error?: string
  detail?: string
}

function newId() {
  return `batch-img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function loadPrefs(): BatchPrefs {
  try {
    let raw = localStorage.getItem(BATCH_PREFS_KEY)
    if (!raw) {
      raw = localStorage.getItem('cc-ugc-batch-prefs-v2')
    }
    if (!raw) {
      raw = localStorage.getItem('cc-ugc-batch-prefs-v1')
    }
    if (!raw) throw new Error('empty')
    const p = JSON.parse(raw) as Partial<BatchPrefs>
    return {
      batchCount: '5',
      slideMin: p.slideMin ?? '3',
      slideMax: p.slideMax ?? '7',
      outputFolder: VISION_BATCH_OUTPUT,
      postToDiscord: p.postToDiscord ?? true,
      category: p.category ?? 'Random theme',
    }
  } catch {
    return {
      batchCount: '5',
      slideMin: '3',
      slideMax: '7',
      outputFolder: VISION_BATCH_OUTPUT,
      postToDiscord: true,
      category: 'Random theme',
    }
  }
}

function savePrefs(prefs: BatchPrefs) {
  try {
    let raw = localStorage.getItem(BATCH_PREFS_KEY)
    const existing = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    localStorage.setItem(BATCH_PREFS_KEY, JSON.stringify({ ...existing, ...prefs }))
  } catch {
    localStorage.setItem(BATCH_PREFS_KEY, JSON.stringify(prefs))
  }
}

function formatBatchElapsed(totalSec: number): string {
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`
}

function mapStorySlidesToRender(
  slides: UgcSlideshowSlideCopy[],
  defaultCta: string,
): Array<{
  title: string
  body: string
  cta: string
  productId?: string
  productVariantId?: string
  showProductPrice?: boolean
  productPriceLabel?: string
  role?: string
}> {
  return slides.map((slide, i) => {
    const role = slide.role
    const extra = {
      productId: slide.productId,
      productVariantId: slide.productVariantId,
      showProductPrice: slide.showProductPrice,
      productPriceLabel: slide.productPriceLabel,
      role,
    }
    if (role === 'hook' || (!role && i === 0)) {
      return { title: slide.title, body: slide.body, cta: '', ...extra }
    }
    if (role === 'close' || role === 'punch' || i === slides.length - 1) {
      return {
        title: '',
        body: slide.body,
        cta: slide.cta?.trim() || defaultCta,
        ...extra,
      }
    }
    return { title: '', body: slide.body, cta: '', ...extra }
  })
}

function renderStorySlide(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  copy: {
    title: string
    body: string
    cta: string
    productId?: string
    showProductPrice?: boolean
    productPriceLabel?: string
    role?: string
  },
  draft: UgcSlidesDraft,
  slideWidth: number,
  slideHeight: number,
  slideIndex: number,
  slideTotal: number,
  productImg?: HTMLImageElement | null,
) {
  const base = {
    focalX: 50,
    focalY: 50,
    placement: draft.placement,
    slideWidth,
    slideHeight,
    slideIndex,
    slideTotal,
  }
  const hasCta = Boolean(copy.cta.trim())
  let template: UgcTemplate = hasCta ? 'headline_body_cta' : draft.template
  let title = copy.title
  let body = copy.body
  let cta = copy.cta

  const tryRender = (t: UgcTemplate, ti: string, b: string, c: string) =>
    renderUgcSlide(canvas, {
      image: img,
      imgWidth: img.naturalWidth,
      imgHeight: img.naturalHeight,
      template: t,
      ...base,
      title: ti,
      body: b,
      cta: c,
      productImage: productImg || undefined,
      productImgWidth: productImg?.naturalWidth,
      productImgHeight: productImg?.naturalHeight,
      showProductPrice: copy.showProductPrice,
      productPriceLabel: copy.productPriceLabel,
      productRole: copy.role,
    }).overflow

  let overflow = tryRender(template, title, body, cta)

  // Clip on a sentence, then a word - a mid-word "…" reads as a defect.
  const clipCopy = (text: string, maxLen: number): string => {
    if (text.length <= maxLen) return text
    const slice = text.slice(0, maxLen)
    const sentenceEnd = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '))
    if (sentenceEnd > maxLen * 0.5) return slice.slice(0, sentenceEnd + 1).trim()
    const wordEnd = slice.lastIndexOf(' ')
    return `${(wordEnd > maxLen * 0.5 ? slice.slice(0, wordEnd) : slice).trimEnd()}…`
  }

  const shrinkToFit = (t: UgcTemplate, source: string, c: string): string | null => {
    for (let maxLen = Math.min(source.length, 220); maxLen >= 24; maxLen -= 16) {
      const trial = clipCopy(source, maxLen)
      if (!tryRender(t, '', trial, c)) return trial
    }
    return null
  }

  if (overflow && hasCta) {
    template = 'headline_body_cta'
    title = ''
    cta = copy.cta.trim() || UGC_DEFAULT_CTA
    const fitted = shrinkToFit(template, body, cta)
    if (fitted != null) {
      body = fitted
      overflow = false
    } else {
      body = ''
      overflow = tryRender('headline_body_cta', '', '', cta)
    }
  } else if (overflow) {
    template = 'single_statement'
    title = ''
    cta = ''
    const source = [copy.title, copy.body].filter(Boolean).join(' ')
    const fitted = shrinkToFit(template, source, '')
    body = fitted ?? clipCopy(source, 24)
    overflow = fitted == null ? tryRender(template, '', body, '') : false
  }

  return {
    overflow,
    render: {
      ...base,
      template,
      title,
      body,
      cta,
      productImage: productImg || undefined,
      productImgWidth: productImg?.naturalWidth,
      productImgHeight: productImg?.naturalHeight,
      showProductPrice: copy.showProductPrice,
      productPriceLabel: copy.productPriceLabel,
      productRole: copy.role,
    },
  }
}

function estimateMinutes(count: number, slideMin: number, slideMax: number, discord: boolean) {
  const avgSlides = (slideMin + slideMax) / 2
  const chunks = Math.ceil(avgSlides / 3)
  const warmSec = 45
  const perCallSec = 55
  const perPostSec = warmSec / count + chunks * 2 * perCallSec + (discord ? 10 : 0)
  const totalMin = Math.ceil((count * perPostSec) / 60)
  const min = Math.max(2, Math.floor(totalMin * 0.85))
  const max = Math.max(min + 2, Math.ceil(totalMin * 1.25))
  const discordExtra = discord ? ' + Discord' : ''
  return `Est. ~${min}-${max} min for ${count} posts (≤${slideMax} slides, ~${chunks} chunk(s)/post)${discordExtra}`
}

function BatchLabel({ children }: { children: ReactNode }) {
  return (
    <span className="pt-2 font-mono text-[11px] uppercase tracking-wide text-fog">{children}</span>
  )
}

export type UgcBatchRunState = {
  busy: boolean
  progress: number
  status: string
  elapsedSec: number
  abort: (() => void) | null
}

export function UgcSlidesBatchTab({
  active,
  draft,
  onDescriptionChange,
  tokenReady,
  testMode,
  onTestModeChange,
  onOpenSettings,
  onRunStateChange,
}: {
  active: boolean
  draft: UgcSlidesDraft
  onDescriptionChange: (settings: Partial<UgcDescriptionSettings>) => void
  tokenReady: boolean
  testMode: boolean
  onTestModeChange: (value: boolean) => void
  onOpenSettings: () => void
  onRunStateChange?: (state: UgcBatchRunState) => void
}) {
  const [prefs, setPrefs] = useState<BatchPrefs>(loadPrefs)
  const [poolStatus, setPoolStatus] = useState<UgcThemePoolStatus | null>(null)
  const [imagePoolStatus, setImagePoolStatus] = useState<UgcImagePoolStatus | null>(null)
  const [images, setImages] = useState<BatchImage[]>([])
  const [imageError, setImageError] = useState<string | null>(null)
  const [batchBusy, setBatchBusy] = useState(false)
  const [batchProgress, setBatchProgress] = useState(0)
  const [batchStatus, setBatchStatus] = useState('')
  const [batchElapsedSec, setBatchElapsedSec] = useState(0)
  const [batchError, setBatchError] = useState<string | null>(null)
  const [resultLines, setResultLines] = useState<BatchResultLine[]>([])
  const [discordLines, setDiscordLines] = useState<DiscordResultLine[]>([])
  const [lastBatchAbsPath, setLastBatchAbsPath] = useState<string | null>(null)
  const [resetBusy, setResetBusy] = useState(false)
  const [outputDirHandle, setOutputDirHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [batchRunId, setBatchRunId] = useState<string | null>(null)
  const [auditStatus, setAuditStatus] = useState<UgcAuditStatusView | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const batchStartedAtRef = useRef<number | null>(null)
  const batchAbortControllerRef = useRef<AbortController | null>(null)
  const batchStoppedRef = useRef(false)
  const renderingRef = useRef(false)
  const discordPostedRef = useRef<Set<number>>(loadDiscordPosted())
  const imagesRef = useRef(images)
  imagesRef.current = images

  const exportSize = resolveExportSize(draft.exportSizeId)
  const slideWidth = exportSize.width
  const slideHeight = exportSize.height

  const discordReady = tokenReady && Boolean(draft.discordGuildId.trim())
  const outputOptional = prefs.postToDiscord
  const totalFolderImages =
    (imagePoolStatus?.total ?? 0) ||
    (imagePoolStatus?.available ?? 0) + (imagePoolStatus?.used ?? 0)
  const folderImagesAvailable = totalFolderImages > 0
  const canUseImages = folderImagesAvailable || images.length > 0

  const postCount = useMemo(() => {
    const n = parseInt(prefs.batchCount, 10)
    return Number.isFinite(n) && n > 0 ? Math.min(50, n) : 10
  }, [prefs.batchCount])

  const slideMin = parseInt(prefs.slideMin, 10) || MIN_SLIDESHOW_SLIDES
  const slideMax = parseInt(prefs.slideMax, 10) || MAX_SLIDESHOW_SLIDES

  const estimate = estimateMinutes(
    postCount,
    Math.min(slideMin, slideMax),
    Math.max(slideMin, slideMax),
    prefs.postToDiscord && discordReady,
  )

  const patchPrefs = (partial: Partial<BatchPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...partial }
      savePrefs(next)
      return next
    })
  }

  const refreshStatus = useCallback(async () => {
    const status = await fetchUgcThemePoolStatus(prefs.category)
    setPoolStatus(status)
  }, [prefs.category])

  const refreshImageStatus = useCallback(async () => {
    const status = await fetchUgcImagePoolStatus()
    setImagePoolStatus(status)
  }, [])

  const refreshAuditStatus = useCallback(async () => {
    const status = await fetchUgcAuditStatus()
    setAuditStatus(status)
  }, [])

  useEffect(() => {
    if (!active) return
    void refreshStatus()
    void refreshImageStatus()
    void refreshAuditStatus()
  }, [active, refreshStatus, refreshImageStatus, refreshAuditStatus])

  const requestBatchAbort = useCallback(() => {
    batchStoppedRef.current = true
    renderingRef.current = false
    batchAbortControllerRef.current?.abort()
    batchAbortControllerRef.current = null
    void abortUgcBatchRun()
    setBatchBusy(false)
    batchStartedAtRef.current = null
    setBatchElapsedSec(0)
    setBatchStatus('Stopped')
  }, [])

  useEffect(() => {
    onRunStateChange?.({
      busy: batchBusy,
      progress: batchProgress,
      status: batchStatus,
      elapsedSec: batchElapsedSec,
      abort: batchBusy ? requestBatchAbort : null,
    })
  }, [batchBusy, batchProgress, batchStatus, batchElapsedSec, requestBatchAbort, onRunStateChange])

  useEffect(() => {
    if (!batchBusy) return
    batchStartedAtRef.current = Date.now()
    setBatchElapsedSec(0)
    const id = window.setInterval(() => {
      const started = batchStartedAtRef.current
      if (started) {
        setBatchElapsedSec(Math.floor((Date.now() - started) / 1000))
      }
    }, 1000)
    return () => window.clearInterval(id)
  }, [batchBusy])

  useEffect(() => {
    return () => {
      for (const img of imagesRef.current) URL.revokeObjectURL(img.url)
    }
  }, [])

  function onPickFiles(fileList: FileList | File[] | null) {
    if (!fileList?.length) return
    const valid: File[] = []
    for (const file of [...fileList]) {
      const err = validateImageFile(file)
      if (err) {
        setImageError(err)
        return
      }
      valid.push(file)
    }
    if (!valid.length) return
    setImageError(null)
    setImages((prev) => [
      ...prev,
      ...valid.map((file) => ({
        id: newId(),
        url: URL.createObjectURL(file),
        file,
      })),
    ])
  }

  async function onBrowseOutput() {
    try {
      const picker = (
        window as Window & {
          showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>
        }
      ).showDirectoryPicker
      if (!picker) {
        setBatchError('Folder picker not supported - use the path field or default output/batch/')
        return
      }
      const handle = await picker()
      patchPrefs({ outputFolder: handle.name })
      setOutputDirHandle(handle)
      setBatchError(null)
    } catch {
      /* user cancelled */
    }
  }

  async function onResetPool() {
    if (!window.confirm('Reset used themes? All themes become available again.')) return
    setResetBusy(true)
    const res = await resetUgcThemePool()
    setResetBusy(false)
    if (!res.ok) {
      setBatchError(res.message || 'Reset failed')
      return
    }
    if (res.status) setPoolStatus(res.status)
    else await refreshStatus()
    setBatchError(null)
    setBatchStatus(res.message || 'Theme pool reset')
  }

  const renderServerPost = useCallback(
    async (post: UgcBatchRunPostView, run: UgcBatchRunView) => {
      if (batchStoppedRef.current) return
      const canvas = canvasRef.current
      if (!canvas || !post.slides?.length || !post.caption || !post.meta) return

      const postIndex = post.postIndex
      const defaultCta = run.options.defaultCta || draft.defaultCta
      const postDiscord = prefs.postToDiscord && discordReady

      setBatchStatus(`Post ${postIndex}/${run.count} - rendering ${post.slides.length} slides…`)
      const renderTimeout = new AbortController()
      const renderTimer = window.setTimeout(() => renderTimeout.abort(), 60000)
      try {
      await ensureUgcSlideFontsReady()

      const slideImages: HTMLImageElement[] = []
      if (post.imageNames.length) {
        for (let s = 0; s < post.slideCount; s++) {
          const filename = post.imageNames[s]
          if (!filename) throw new Error('Not enough images in pool for all slides')
          slideImages.push(
            await loadImageElement(
              buildUgcImageServeUrl(filename, `${postIndex}-${s}-${filename}`),
              { signal: renderTimeout.signal },
            ),
          )
        }
      } else {
        if (!imagesRef.current.length) {
          throw new Error('Upload images lost after refresh - use folder images for refresh-safe batches')
        }
        for (let s = 0; s < post.slideCount; s++) {
          const imgMeta = imagesRef.current[s % imagesRef.current.length]
          slideImages.push(await loadImageElement(imgMeta.url, { signal: renderTimeout.signal }))
        }
      }

      const copySlides = mapStorySlidesToRender(post.slides, defaultCta)
      const exportSlides: SlideshowExportSlide[] = []
      for (let s = 0; s < copySlides.length; s++) {
        if (batchStoppedRef.current) return
        const copy = copySlides[s]
        const slideImg = slideImages[s] ?? slideImages[0]
        let productImg: HTMLImageElement | null = null
        if (copy.productId) {
          try {
            productImg = await loadImageElement(
              buildUgcProductServeUrl(copy.productId, `${postIndex}-${s}-${copy.productId}`, copy.productVariantId),
              { signal: renderTimeout.signal },
            )
          } catch {
            throw new Error(`PRODUCT_IMAGE_MISSING productId=${copy.productId} slide=${s + 1}`)
          }
        }
        const rendered = renderStorySlide(
          canvas,
          slideImg,
          copy,
          draft,
          slideWidth,
          slideHeight,
          s,
          copySlides.length,
          productImg,
        )
        if (rendered.overflow) {
          throw new Error(`Text overflow on slide ${s + 1}/${copySlides.length}`)
        }
        exportSlides.push({
          image: slideImg,
          imgWidth: slideImg.naturalWidth,
          imgHeight: slideImg.naturalHeight,
          render: rendered.render,
        })
      }

      await postUgcVisionLog(
        'batch_post_render_ok',
        {
          postIndex,
          slideCount: copySlides.length,
          arcName: post.arcName,
          theme: post.theme.theme,
          hook: post.theme.hook,
          template: draft.template,
          exportSizeId: draft.exportSizeId,
        },
        post.auditId || undefined,
      )

      const slidePayloads: Array<{ filename: string; data: string }> = []
      for (let i = 0; i < exportSlides.length; i++) {
        if (batchStoppedRef.current) return
        renderUgcSlide(canvas, {
          image: exportSlides[i].image,
          imgWidth: exportSlides[i].imgWidth,
          imgHeight: exportSlides[i].imgHeight,
          ...exportSlides[i].render,
          slideIndex: exportSlides[i].render.slideIndex ?? i,
          slideTotal: exportSlides[i].render.slideTotal ?? exportSlides.length,
        })
        const blob = await canvasToPngBlob(canvas)
        slidePayloads.push({
          filename: buildUgcSlideIndexFilename(i),
          data: await blobToBase64(blob),
        })
      }

      const saveRes = await saveUgcBatchRunPost({
        postIndex,
        caption: post.caption,
        meta: post.meta,
        slides: slidePayloads,
      })
      if (!saveRes?.ok) throw new Error(saveRes?.message || 'Failed to save post')
      if (saveRes.batchDir) setLastBatchAbsPath(saveRes.batchDir)

      if (postDiscord && !discordPostedRef.current.has(postIndex)) {
        setBatchStatus(`Post ${postIndex}/${run.count} - publishing to Discord…`)
        try {
          const pub = await publishUgcToDiscord({
            caption: post.caption,
            guildId: draft.discordGuildId,
            categoryId: draft.discordCategoryId,
            slides: slidePayloads,
          })
          setDiscordLines((prev) => [
            ...prev,
            {
              ok: pub.ok,
              index: postIndex,
              channel: pub.channel,
              error: pub.error || pub.message,
              detail: (pub as { errorDetail?: string }).errorDetail,
            },
          ])
          if (pub.ok) {
            discordPostedRef.current.add(postIndex)
            saveDiscordPosted(discordPostedRef.current)
            await abortableSleep(1500)
          }
        } catch (err) {
          setDiscordLines((prev) => [
            ...prev,
            {
              ok: false,
              index: postIndex,
              error: err instanceof Error ? err.message : 'Discord publish failed',
              detail: batchErrorDetail(err, { postIndex, phase: 'discord' }),
            },
          ])
        }
      }
      } catch (err) {
        if (isAbortError(err) && !batchStoppedRef.current) {
          throw new Error('Render timed out after 60s (fonts or product image)')
        }
        throw err
      } finally {
        window.clearTimeout(renderTimer)
      }
    },
    [draft, discordReady, prefs.postToDiscord, slideHeight, slideWidth],
  )

  useEffect(() => {
    if (!active) return
    let cancelled = false

    const syncRun = async (run: UgcBatchRunView | null) => {
      if (!run || run.status === 'idle') return

      if (isUgcBatchRunActive(run)) {
        setBatchBusy(true)
        if (run.startedAt) batchStartedAtRef.current = run.startedAt
      } else if (run.status === 'done' || run.status === 'aborted' || run.status === 'error') {
        batchStoppedRef.current = run.status === 'aborted' || run.abortRequested
        setBatchBusy(false)
        batchStartedAtRef.current = null
        batchAbortControllerRef.current = null
        await refreshStatus()
        await refreshImageStatus()
        await refreshAuditStatus()
      }

      setBatchProgress(run.progress)
      if (!renderingRef.current) setBatchStatus(run.message)
      if (run.runId) setBatchRunId(run.runId)
      setResultLines(run.lines)
      if (run.batchDir) setLastBatchAbsPath(run.batchDir)
      if (run.status === 'error') setBatchError(run.message)
      if (run.status === 'ready') void refreshAuditStatus()

      if (cancelled || renderingRef.current || batchStoppedRef.current) return
      if (run.status === 'aborted' || run.abortRequested) return
      const pending = run.posts.filter((p) => p.copyStatus === 'ready' && !p.saved)
      if (!pending.length) return

      renderingRef.current = true
      try {
        for (const post of pending) {
          if (cancelled || batchStoppedRef.current) break
          try {
            await renderServerPost(post, run)
          } catch (err) {
            if (!cancelled) {
              setBatchError(err instanceof Error ? err.message : 'Render failed')
            }
          }
        }
      } finally {
        renderingRef.current = false
      }
    }

    const tick = async () => {
      const run = await fetchUgcBatchRun()
      if (!cancelled) await syncRun(run)
    }

    void tick()
    const id = window.setInterval(() => void tick(), 1500)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [active, renderServerPost, refreshStatus, refreshImageStatus, refreshAuditStatus])

  async function onGenerateBatch() {
    const useFolderImages = folderImagesAvailable

    if (!useFolderImages && !images.length) {
      setBatchError(`Add images to ${imagePoolStatus?.newImagesDir || 'D:\\new-pics'} or upload photos below`)
      return
    }
    let count = parseInt(prefs.batchCount, 10)
    if (!Number.isFinite(count) || count < 1) count = 1
    if (count > 50) count = 50

    let sMin = parseInt(prefs.slideMin, 10) || MIN_SLIDESHOW_SLIDES
    let sMax = parseInt(prefs.slideMax, 10) || MAX_SLIDESHOW_SLIDES
    if (sMax > MAX_SLIDESHOW_SLIDES) sMax = MAX_SLIDESHOW_SLIDES
    if (sMin > sMax) [sMin, sMax] = [sMax, sMin]

    const postDiscord = prefs.postToDiscord && discordReady
    const hasOutput = Boolean(prefs.outputFolder.trim() || outputDirHandle)

    if (!postDiscord && !hasOutput) {
      setBatchError('Choose an output folder, or enable Post to Discord')
      return
    }
    if (prefs.postToDiscord && !discordReady) {
      setBatchError('Post to Discord is enabled but bot token or guild ID is missing')
      onOpenSettings()
      return
    }

    if (!testMode && poolStatus && count > poolStatus.available) {
      setBatchError(`Only ${poolStatus.available} unused themes left in this category`)
      return
    }
    if (useFolderImages && count * sMax > totalFolderImages) {
      setBatchError(
        `Need up to ${count * sMax} images (${count} posts × ${sMax} slides each), only ${totalFolderImages} in pool`,
      )
      return
    }

    setBatchBusy(true)
    batchStoppedRef.current = false
    batchAbortControllerRef.current = new AbortController()
    batchStartedAtRef.current = Date.now()
    setBatchError(null)
    setResultLines([])
    setDiscordLines([])
    setBatchProgress(0)
    setBatchStatus('Starting server batch…')
    clearDiscordPosted()
    discordPostedRef.current = new Set()

    const startRes = await startUgcBatchRun({
      count,
      slideMin: sMin,
      slideMax: sMax,
      category: prefs.category,
      testMode,
      outputFolder: prefs.outputFolder.trim() || VISION_BATCH_OUTPUT,
      defaultCta: draft.defaultCta,
      universalDescription: resolveUniversalUgcDescription(
        activeBusinessProfileId(), draft.universalDescription, draft.generateDescriptionAutomatically,
      ),
      useFolderImages,
    })

    if (!startRes?.ok) {
      setBatchBusy(false)
      setBatchError(startRes?.message || 'Failed to start batch')
      return
    }

    if (startRes.run) {
      setBatchProgress(startRes.run.progress)
      setBatchStatus(startRes.run.message)
      setResultLines(startRes.run.lines)
    }
  }

  async function onOpenImageFolder(which: 'new' | 'used') {
    const dir =
      which === 'new' ? imagePoolStatus?.newImagesDir : imagePoolStatus?.usedImagesDir
    if (!dir) return
    const res = await openFolderPath(dir)
    if (!res.ok) setBatchError(res.message)
  }

  async function onOpenBatchFolder() {
    if (!lastBatchAbsPath) return
    const res = await openFolderPath(lastBatchAbsPath)
    if (!res.ok) setBatchError(res.message)
    else setBatchStatus(res.message)
  }

  const imageMeterPct =
    imagePoolStatus && imagePoolStatus.available + imagePoolStatus.used > 0
      ? imagePoolStatus.available / (imagePoolStatus.available + imagePoolStatus.used)
      : 0

  const themeAvailableDisplay = testMode
    ? poolStatus?.totalInScope ?? 0
    : poolStatus?.available ?? 0

  const meterPct =
    poolStatus && poolStatus.totalInScope > 0
      ? themeAvailableDisplay / poolStatus.totalInScope
      : 0

  const resultsText = [
    ...[...resultLines].reverse().flatMap((l) => (l.detail ? [l.text, l.detail, ''] : [l.text])),
    ...(discordLines.length
      ? [
          '',
          'Discord:',
          ...discordLines.flatMap((d) =>
            d.ok
              ? [`  ✓ #${d.channel ?? '?'} - Post ${String(d.index).padStart(2, '0')}`]
              : [
                  `  ✗ Post ${String(d.index).padStart(2, '0')} - ${d.error ?? 'failed'}`,
                  ...(d.detail ? [d.detail, ''] : []),
                ],
          ),
        ]
      : []),
  ].join('\n')

  return (
    <div className="fit-body grid items-start gap-6 pb-6 min-[1180px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)] min-[1180px]:pb-0">
      <canvas ref={canvasRef} className="hidden" width={slideWidth} height={slideHeight} />
      <div className="fit-scroll min-w-0 space-y-6">
      {isChristmasUgcProfile() && (
        <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
          <UgcUniversalDescription draft={draft} onChange={onDescriptionChange} />
        </section>
      )}

      {/* Theme pool + photos - UGC-specific, above PostMaker-style form */}
      <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
        <div className="mb-5 grid gap-5">
          {poolStatus && (
            <div className="flex flex-col justify-end">
              <div className="mb-1 flex justify-between font-mono text-[10px] text-fog">
                <span>Themes left</span>
                <span>
                  {themeAvailableDisplay} / {poolStatus.totalInScope}
                  {testMode ? ' (test)' : poolStatus.used > 0 ? ` · ${poolStatus.used} used` : ''}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-well">
                  <div
                    className="h-full rounded-full bg-brass transition-all"
                    style={{ width: `${Math.round(meterPct * 100)}%` }}
                  />
                </div>
                <button
                  type="button"
                  disabled={resetBusy || batchBusy || testMode}
                  onClick={() => void onResetPool()}
                  title={
                    testMode
                      ? 'Test mode does not mark themes used'
                      : 'Clear used_themes.json - full pool again'
                  }
                  className="shrink-0 rounded-lg border border-lineStrong bg-well px-3 py-1 font-mono text-[10px] uppercase tracking-wide text-mist hover:border-brass/30 disabled:opacity-40"
                >
                  {resetBusy ? '…' : 'Reset pool'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mb-3 rounded-xl border border-lineStrong bg-well/30 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-mist">
              Photos are pulled from{' '}
              <span className="font-mono text-snow">{imagePoolStatus?.newImagesDir || 'D:\\new-pics'}</span>{' '}
              - each post picks one at random and marks it used. When every photo has been used, the
              pool resets automatically. Your originals stay in the source folder.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={batchBusy || !imagePoolStatus?.newImagesDir}
                onClick={() => void onOpenImageFolder('new')}
                className="rounded-lg border border-lineStrong bg-well px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide text-mist hover:border-brass/30 disabled:opacity-40"
              >
                Open source folder
              </button>
              <button
                type="button"
                disabled={batchBusy || !imagePoolStatus?.usedImagesDir}
                onClick={() => void onOpenImageFolder('used')}
                className="rounded-lg border border-lineStrong bg-well px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide text-mist hover:border-brass/30 disabled:opacity-40"
              >
                Open used-images
              </button>
            </div>
          </div>
          {imagePoolStatus && (
            <div>
              <div className="mb-1 flex justify-between font-mono text-[10px] text-fog">
                <span>Source images</span>
                <span>
                  {imagePoolStatus.available} new · {imagePoolStatus.used} used
                  {imagePoolStatus.recycleCount > 0
                    ? ` · cycle ${imagePoolStatus.recycleCount + 1}`
                    : ''}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-well">
                <div
                  className="h-full rounded-full bg-phosphor transition-all"
                  style={{ width: `${Math.round(imageMeterPct * 100)}%` }}
                />
              </div>
            </div>
          )}
          <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-phosphor/25 bg-phosphor/5 px-3 py-2">
            <input
              type="checkbox"
              checked={testMode}
              onChange={(e) => onTestModeChange(e.target.checked)}
              disabled={batchBusy}
              className="mt-0.5 accent-phosphor"
            />
            <span className="text-sm text-mist">
              <span className="font-mono text-[10px] uppercase tracking-wide text-phosphor">
                Test mode
              </span>
              <span className="mt-0.5 block text-xs text-fog">
                Reuse theme/image pool without marking used, and save full generation audit to{' '}
                <span className="font-mono text-[10px]">D:\ugc-batch-vision\audit</span> (prompts,
                Ollama I/O, rewrites, gates, captions, rendered PNGs) for AI review.
              </span>
            </span>
          </label>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => onPickFiles(e.target.files)}
        />
        {imageError && <p className="mt-2 text-xs text-ember">{imageError}</p>}
      </section>
      </div>

      {/* PostMaker-style batch form */}
      <section className="fit-scroll min-w-0 rounded-2xl border border-line bg-panel p-5 sm:p-6">
        <p className="mb-5 text-sm text-fog">
          Generate multiple posts into separate folders (slides + caption.txt). Copy is Lithuanian.
        </p>

        {batchError && (
          <div className="mb-4">
            <ErrorRetryCallout title={batchError} onRetry={() => void onGenerateBatch()} />
          </div>
        )}

        <div className="grid grid-cols-1 gap-y-1">
          <BatchLabel>Posts to generate</BatchLabel>
          <input
            className={`${inputCls} mb-3`}
            value={prefs.batchCount}
            onChange={(e) => patchPrefs({ batchCount: e.target.value })}
            placeholder="10"
            disabled={batchBusy}
          />

          <BatchLabel>Slides per post</BatchLabel>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <select
              className={`${inputCls} !w-[88px]`}
              value={prefs.slideMin}
              onChange={(e) => patchPrefs({ slideMin: e.target.value })}
              disabled={batchBusy}
            >
              {SLIDE_OPTS.map((v) => (
                <option key={`min-${v}`} value={v}>
                  {v}
                </option>
              ))}
            </select>
            <span className="text-fog">-</span>
            <select
              className={`${inputCls} !w-[88px]`}
              value={prefs.slideMax}
              onChange={(e) => patchPrefs({ slideMax: e.target.value })}
              disabled={batchBusy}
            >
              {SLIDE_OPTS.map((v) => (
                <option key={`max-${v}`} value={v}>
                  {v}
                </option>
              ))}
            </select>
            <span className="font-mono text-[11px] text-fog">slides (random)</span>
          </div>

          <BatchLabel>{outputOptional ? 'Output folder (optional)' : 'Output folder'}</BatchLabel>
          <div className="mb-3 flex gap-2">
            <input
              className={`${inputCls} min-w-0 flex-1`}
              value={prefs.outputFolder}
              onChange={(e) => patchPrefs({ outputFolder: e.target.value })}
              placeholder="D:\ugc-batch-vision\batch"
              disabled={batchBusy}
            />
            <button
              type="button"
              onClick={() => void onBrowseOutput()}
              disabled={batchBusy}
              className="shrink-0 rounded-lg border border-lineStrong bg-well px-4 py-2 font-mono text-[11px] uppercase tracking-wide text-mist hover:border-brass/30"
            >
              Browse
            </button>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={prefs.postToDiscord}
                onChange={(e) => patchPrefs({ postToDiscord: e.target.checked })}
                disabled={batchBusy || !tokenReady}
                className="accent-brass"
              />
              <span className="font-mono text-[11px] uppercase tracking-wide text-mist">
                Post to Discord
              </span>
            </label>
            <span className="font-mono text-[10px] text-fog">
              {!tokenReady
                ? 'Configure in Settings tab'
                : !draft.discordGuildId.trim()
                  ? 'Add guild ID in Settings'
                  : ''}
            </span>
          </div>
        </div>

      </section>

      <section className="flex min-h-0 min-w-0 flex-col self-stretch rounded-2xl border border-line bg-panel p-5 sm:p-6">
        <p className="mb-3 font-mono text-[11px] text-fog">{estimate}</p>
        {batchRunId && batchBusy && (
          <p className="mb-2 font-mono text-[10px] text-fog/70">Run {batchRunId.slice(0, 8)}…</p>
        )}
        <p className="mb-3 font-mono text-[10px] text-fog/80">
          {auditStatus?.active
            ? `Vision capture ON (${auditStatus.completed}/${auditStatus.target} done, ${auditStatus.remaining} left) → D:\\ugc-batch-vision\\`
            : auditStatus
              ? `Vision capture idle - batch start auto-resets audit → D:\\ugc-batch-vision\\`
              : `Vision capture → D:\\ugc-batch-vision\\ (audit + batch + pc-logs)`}
        </p>

        {(batchBusy || batchElapsedSec > 0) && (
          <p className="mb-2 font-mono text-[13px] tabular-nums text-brass">
            <span className="text-[10px] uppercase tracking-wide text-fog">
              {batchBusy ? 'Elapsed' : 'Finished in'}
            </span>{' '}
            {formatBatchElapsed(batchElapsedSec)}
          </p>
        )}

        <div className="mb-2 h-2 overflow-hidden rounded-full bg-well">
          <div
            className="h-full rounded-full bg-brass transition-all"
            style={{ width: `${Math.round(batchProgress * 100)}%` }}
          />
        </div>
        {batchStatus && (
          <p className="mb-4 font-mono text-[11px] text-phosphor">{batchStatus}</p>
        )}

        <div className="mb-6 flex gap-2">
          <button
            type="button"
            disabled={batchBusy || !canUseImages}
            onClick={() => void onGenerateBatch()}
            className="flex min-h-[44px] flex-1 items-center justify-center rounded-lg border border-brass/50 bg-brass/20 px-4 py-2.5 font-mono text-[12px] font-semibold uppercase tracking-wide text-brass disabled:opacity-50"
          >
            {batchBusy ? 'Generating batch…' : 'Generate batch'}
          </button>
          {batchBusy ? (
            <button
              type="button"
              onClick={requestBatchAbort}
              className="min-h-[44px] shrink-0 rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2.5 font-mono text-[12px] font-semibold uppercase tracking-wide text-red-300 hover:bg-red-500/20"
            >
              Abort
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void clearUgcBatchRun().then(() => {
                setBatchRunId(null)
                setResultLines([])
                setBatchStatus('')
                setBatchElapsedSec(0)
              })}
              className="min-h-[44px] shrink-0 rounded-lg border border-lineStrong bg-well px-4 py-2.5 font-mono text-[12px] uppercase tracking-wide text-mist"
            >
              Clear
            </button>
          )}
        </div>

        <h3 className="mb-2 text-sm font-semibold text-snow">Results</h3>
        <textarea
          readOnly
          value={resultsText}
          placeholder="Batch results will appear here…"
          className={`${inputCls} mb-3 min-h-[280px] flex-1 resize-none min-[1180px]:min-h-[160px] font-mono text-[11px] leading-relaxed`}
        />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!lastBatchAbsPath || batchBusy}
            onClick={() => void onOpenBatchFolder()}
            className="min-h-[40px] flex-1 rounded-lg border border-lineStrong bg-well px-4 py-2 font-mono text-[11px] uppercase tracking-wide text-mist disabled:opacity-40"
          >
            Open batch folder
          </button>
        </div>
      </section>
    </div>
  )
}
