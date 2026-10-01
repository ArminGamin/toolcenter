import { newId, type BatchImage, type BatchResultLine, type DiscordResultLine, type UgcBatchRunState } from './batch-shared'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { activeBusinessProfileId } from '../../lib/business-profiles'
import { openFolderPath } from '../../lib/launch'
import {
    abortUgcBatchRun,
    fetchUgcBatchRun,
    isUgcBatchRunActive,
    saveUgcBatchRunPost,
    startUgcBatchRun,
    type UgcBatchRunPostView,
    type UgcBatchRunView
} from '../../lib/ugc-batch-run'
import { batchErrorDetail } from '../../lib/ugc-error-detail'
import { abortableSleep, isAbortError } from '../../lib/ugc-fetch'
import {
    buildUgcImageServeUrl,
    buildUgcProductServeUrl,
    fetchUgcImagePoolStatus,
    type UgcImagePoolStatus,
} from '../../lib/ugc-image-pool'
import {
    fetchUgcAuditStatus,
    loadImageElement,
    MAX_SLIDESHOW_SLIDES,
    MIN_SLIDESHOW_SLIDES,
    postUgcVisionLog,
    publishUgcToDiscord,
    resolveExportSize,
    validateImageFile,
    type UgcAuditStatusView,
    type UgcSlidesDraft
} from '../../lib/ugc-slides'
import {
    blobToBase64,
    buildUgcSlideIndexFilename,
    type SlideshowExportSlide,
} from '../../lib/ugc-slides-export'
import { canvasToPngBlob, ensureUgcSlideFontsReady, renderUgcSlide } from '../../lib/ugc-slides-render'
import {
    fetchUgcThemePoolStatus,
    resetUgcThemePool,
    type UgcThemePoolStatus,
} from '../../lib/ugc-theme-pool'
import { resolveUniversalUgcDescription } from '../../lib/ugc-universal-description'
import { type UgcDescriptionSettings } from './UgcUniversalDescription'
import { clearDiscordPosted, estimateMinutes, loadDiscordPosted, loadPrefs, saveDiscordPosted, savePrefs, VISION_BATCH_OUTPUT, type BatchPrefs } from './batch-prefs'
import { mapStorySlidesToRender, renderStorySlide } from './batch-render'

/** State and handlers for UgcSlidesBatchTab (kept separate from its markup). */
export function useUgcSlidesBatchTab({
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

  return { active, draft, onDescriptionChange, tokenReady, testMode, onTestModeChange, onOpenSettings, onRunStateChange, prefs, setPrefs, poolStatus, setPoolStatus, imagePoolStatus, setImagePoolStatus, images, setImages, imageError, setImageError, batchBusy, setBatchBusy, batchProgress, setBatchProgress, batchStatus, setBatchStatus, batchElapsedSec, setBatchElapsedSec, batchError, setBatchError, resultLines, setResultLines, discordLines, setDiscordLines, lastBatchAbsPath, setLastBatchAbsPath, resetBusy, setResetBusy, outputDirHandle, setOutputDirHandle, batchRunId, setBatchRunId, auditStatus, setAuditStatus, fileInputRef, canvasRef, batchStartedAtRef, batchAbortControllerRef, batchStoppedRef, renderingRef, discordPostedRef, imagesRef, exportSize, slideWidth, slideHeight, discordReady, outputOptional, totalFolderImages, folderImagesAvailable, canUseImages, postCount, slideMin, slideMax, estimate, patchPrefs, refreshStatus, refreshImageStatus, refreshAuditStatus, requestBatchAbort, onPickFiles, onBrowseOutput, onResetPool, renderServerPost, onGenerateBatch, onOpenImageFolder, onOpenBatchFolder, imageMeterPct, themeAvailableDisplay, meterPct, resultsText }
}

export type UgcSlidesBatchTabVm = ReturnType<typeof useUgcSlidesBatchTab>
