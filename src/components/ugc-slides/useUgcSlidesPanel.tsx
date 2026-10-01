import { newId, type SlideImage, type PanelTab } from './ugc-panel-shared'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { activeBusinessProfileId } from '../../lib/business-profiles'
import { fetchToolSettings, saveToolSettings } from '../../lib/launch'
import {
    loadBatchPrefsTestMode,
    parseBatchTestModeSetting,
    saveBatchPrefsTestMode,
} from '../../lib/ugc-batch-prefs'
import {
    createEmptySlideContent,
    DEFAULT_UGC_VAULT_SETTINGS,
    draftSnapshot,
    emptyUgcDraft,
    fetchUgcDiscordSettings,
    generateLtDescription,
    generateUgcSlideshow,
    isChristmasUgcProfile,
    listUgcProfiles,
    loadImageElement,
    loadUgcDraft,
    MAX_SLIDESHOW_SLIDES,
    MIN_SLIDESHOW_SLIDES,
    normalizeUgcVaultSettings,
    publishUgcToDiscord,
    resolveExportSize,
    saveUgcDiscordSettings,
    saveUgcDraft,
    saveUgcProfile,
    slideRoleForIndex,
    ugcAngleOptions,
    validateImageFile,
    validateUgcQuality,
    vaultSettingsSnapshot,
    type UgcSlidesDraft,
    type UgcSlidesProfile,
    type UgcVaultSettings
} from '../../lib/ugc-slides'
import {
    blobToBase64,
    buildUgcSlideIndexFilename,
    buildUgcSlideshowZipFilename,
    downloadBlob,
    downloadSingleSlidePng,
    exportSlideshowZip,
} from '../../lib/ugc-slides-export'
import { canvasToPngBlob, ensureUgcSlideFontsReady, renderUgcSlide } from '../../lib/ugc-slides-render'
import { resolveUniversalUgcDescription } from '../../lib/ugc-universal-description'
import { type UgcBatchRunState } from './UgcSlidesBatchTab'

/** State and handlers for UgcSlidesPanel (kept separate from its markup). */
export function useUgcSlidesPanel({ active }: { active: boolean }) {
  const [draft, setDraft] = useState<UgcSlidesDraft>(() => loadUgcDraft())
  const [tab, setTab] = useState<PanelTab>('batch')
  const [images, setImages] = useState<SlideImage[]>([])
  const [imageError, setImageError] = useState<string | null>(null)
  const [copyError, setCopyError] = useState<string | null>(null)
  const [copyLoading, setCopyLoading] = useState(false)
  const [overflowWarning, setOverflowWarning] = useState(false)
  const [exportBusy, setExportBusy] = useState(false)
  const [descriptionLoading, setDescriptionLoading] = useState(false)
  const [descriptionError, setDescriptionError] = useState<string | null>(null)
  const [discordBusy, setDiscordBusy] = useState(false)
  const [discordError, setDiscordError] = useState<string | null>(null)
  const [discordSuccess, setDiscordSuccess] = useState<string | null>(null)
  const [qualityState, setQualityState] = useState<'unchecked' | 'checking' | 'passed' | 'blocked'>('unchecked')
  const [qualityIssues, setQualityIssues] = useState<string[]>([])
  const [tokenConfigured, setTokenConfigured] = useState(false)
  const [saveBusy, setSaveBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [profiles, setProfiles] = useState<UgcSlidesProfile[]>(() => listUgcProfiles())
  const [profileName, setProfileName] = useState('')
  const [selectedProfile, setSelectedProfile] = useState('')
  const [vaultSettings, setVaultSettings] = useState<UgcVaultSettings>(DEFAULT_UGC_VAULT_SETTINGS)
  const [batchTestMode, setBatchTestMode] = useState(loadBatchPrefsTestMode)
  const [batchRun, setBatchRun] = useState<UgcBatchRunState>({
    busy: false,
    progress: 0,
    status: '',
    elapsedSec: 0,
    abort: null,
  })
  const savedSnapshotRef = useRef(draftSnapshot(loadUgcDraft()))
  const savedVaultRef = useRef(vaultSettingsSnapshot(DEFAULT_UGC_VAULT_SETTINGS))
  const savedBatchTestModeRef = useRef(loadBatchPrefsTestMode())
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const imagesRef = useRef(images)
  imagesRef.current = images
  const fileInputRef = useRef<HTMLInputElement>(null)

  const exportSize = useMemo(() => resolveExportSize(draft.exportSizeId), [draft.exportSizeId])
  const slideWidth = exportSize.width
  const slideHeight = exportSize.height
  const christmasUgc = isChristmasUgcProfile()
  const universalDescription = resolveUniversalUgcDescription(
    activeBusinessProfileId(), draft.universalDescription, draft.generateDescriptionAutomatically,
  )
  const postDescription = universalDescription ?? draft.ltDescription
  const angleOptions = useMemo(() => ugcAngleOptions(), [])

  const activeIndex = Math.min(draft.activeSlideIndex, Math.max(0, images.length - 1))
  const activeImage = images[activeIndex] ?? null
  const activeSlide = draft.slides[activeIndex] ?? createEmptySlideContent(draft.defaultCta)
  const slideCount = images.length
  const dirty =
    draftSnapshot(draft) !== savedSnapshotRef.current ||
    vaultSettingsSnapshot(vaultSettings) !== savedVaultRef.current ||
    batchTestMode !== savedBatchTestModeRef.current

  const tokenReady = Boolean(
    vaultSettings.DISCORD_BOT_TOKEN.trim() || tokenConfigured,
  )

  const patchDraft = useCallback((partial: Partial<UgcSlidesDraft>) => {
    setQualityState('unchecked')
    setDraft((prev) => ({ ...prev, ...partial }))
  }, [])

  const patchActiveSlide = useCallback(
    (partial: Partial<(typeof draft.slides)[number]>) => {
      setQualityState('unchecked')
      setDraft((prev) => {
        const idx = Math.min(prev.activeSlideIndex, Math.max(0, images.length - 1))
        const slides = [...prev.slides]
        while (slides.length <= idx) {
          slides.push(createEmptySlideContent(prev.defaultCta))
        }
        slides[idx] = { ...slides[idx], ...partial }
        return { ...prev, slides }
      })
    },
    [images.length],
  )

  const hasWork = Boolean(
    images.length || draft.slides.some((s) => s.title || s.body) || draft.brief,
  )

  useEffect(() => {
    if (!active) return
    void fetchToolSettings('ugc_slides').then((toolRes) => {
      if (toolRes.ok && toolRes.values) {
        const normalized = normalizeUgcVaultSettings(toolRes.values)
        setVaultSettings(normalized)
        savedVaultRef.current = vaultSettingsSnapshot(normalized)
        const savedTestMode = parseBatchTestModeSetting(toolRes.values.UGC_BATCH_TEST_MODE)
        if (savedTestMode !== null) {
          setBatchTestMode(savedTestMode)
          savedBatchTestModeRef.current = savedTestMode
          saveBatchPrefsTestMode(savedTestMode)
        }
        if (normalized.DISCORD_BOT_TOKEN.trim()) {
          setTokenConfigured(true)
        }
        setDraft((prev) => {
          const next = {
            ...prev,
            discordGuildId: prev.discordGuildId || toolRes.values?.DISCORD_GUILD_ID || '',
            discordCategoryId: prev.discordCategoryId || toolRes.values?.DISCORD_CATEGORY_ID || '',
          }
          savedSnapshotRef.current = draftSnapshot(next)
          return next
        })
      }
    })
    void fetchUgcDiscordSettings().then((settings) => {
      if (!settings) return
      if (settings.tokenConfigured) setTokenConfigured(true)
      setDraft((prev) => {
        const next = {
          ...prev,
          discordGuildId: prev.discordGuildId || settings.guildId,
          discordCategoryId: prev.discordCategoryId || settings.categoryId,
        }
        savedSnapshotRef.current = draftSnapshot(next)
        return next
      })
    })
  }, [active])

  async function onSaveChanges() {
    setSaveBusy(true)
    setSaveError(null)
    try {
      saveUgcDraft(draft)
      const toolRes = await saveToolSettings('ugc_slides', {
        ...vaultSettings,
        DISCORD_GUILD_ID: draft.discordGuildId,
        DISCORD_CATEGORY_ID: draft.discordCategoryId,
        UGC_BATCH_TEST_MODE: batchTestMode ? 'true' : 'false',
      })
      if (!toolRes.ok) {
        setSaveError(toolRes.message || 'Failed to save tool settings')
        return
      }
      savedVaultRef.current = vaultSettingsSnapshot(vaultSettings)
      if (vaultSettings.DISCORD_BOT_TOKEN.trim()) {
        setTokenConfigured(true)
      }
      const discordRes = await saveUgcDiscordSettings({
        guildId: draft.discordGuildId,
        categoryId: draft.discordCategoryId,
      })
      if (!discordRes.ok) {
        setSaveError(discordRes.message || 'Failed to save Discord settings')
        return
      }
      const profileLabel = (profileName || selectedProfile).trim()
      if (profileLabel) {
        saveUgcProfile(profileLabel, {
          angle: draft.angle,
          template: draft.template,
          placement: draft.placement,
          brief: draft.brief,
          defaultCta: draft.defaultCta,
          exportSizeId: draft.exportSizeId,
          ltDescription: draft.ltDescription,
          universalDescription: draft.universalDescription,
          generateDescriptionAutomatically: draft.generateDescriptionAutomatically,
          discordGuildId: draft.discordGuildId,
          discordCategoryId: draft.discordCategoryId,
        })
        setProfileName(profileLabel)
        setSelectedProfile(profileLabel)
        setProfiles(listUgcProfiles())
      }
      savedSnapshotRef.current = draftSnapshot(draft)
      savedBatchTestModeRef.current = batchTestMode
      saveBatchPrefsTestMode(batchTestMode)
    } finally {
      setSaveBusy(false)
    }
  }

  function syncSlidesToImageCount(nextImages: SlideImage[]) {
    setDraft((prev) => {
      const slides = [...prev.slides]
      while (slides.length < nextImages.length) {
        slides.push(createEmptySlideContent(prev.defaultCta))
      }
      if (slides.length > nextImages.length) slides.length = nextImages.length
      const activeSlideIndex = Math.min(prev.activeSlideIndex, Math.max(0, nextImages.length - 1))
      return { ...prev, slides, activeSlideIndex }
    })
  }

  function onPickFiles(fileList: FileList | File[] | null) {
    if (!fileList?.length) return
    const files = [...fileList]
    const valid: File[] = []
    for (const file of files) {
      const err = validateImageFile(file)
      if (err) {
        setImageError(err)
        return
      }
      valid.push(file)
    }
    if (!valid.length) return
    if (images.length + valid.length > MAX_SLIDESHOW_SLIDES) {
      setImageError(`Maximum ${MAX_SLIDESHOW_SLIDES} slides allowed`)
      return
    }
    setImageError(null)
    const added: SlideImage[] = valid.map((file) => ({
      id: newId(),
      url: URL.createObjectURL(file),
    }))
    const next = [...images, ...added]
    setImages(next)
    syncSlidesToImageCount(next)
  }

  function removeSlide(index: number) {
    setImages((prev) => {
      const next = [...prev]
      const removed = next.splice(index, 1)[0]
      if (removed) {
        URL.revokeObjectURL(removed.url)
        imageCacheRef.current.delete(removed.url)
      }
      return next
    })
    setDraft((prev) => {
      const slides = prev.slides.filter((_, i) => i !== index)
      const activeSlideIndex = Math.min(
        prev.activeSlideIndex >= index ? Math.max(0, prev.activeSlideIndex - 1) : prev.activeSlideIndex,
        Math.max(0, slides.length - 1),
      )
      return { ...prev, slides, activeSlideIndex }
    })
  }

  useEffect(() => {
    const cache = imageCacheRef.current
    return () => {
      for (const img of imagesRef.current) URL.revokeObjectURL(img.url)
      cache.clear()
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !activeImage) {
      setOverflowWarning(false)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        let img = imageCacheRef.current.get(activeImage.url)
        if (!img) {
          img = await loadImageElement(activeImage.url)
          imageCacheRef.current.set(activeImage.url, img)
        }
        if (cancelled) return
        await ensureUgcSlideFontsReady()
        const { overflow } = renderUgcSlide(canvas, {
          image: img,
          imgWidth: img.naturalWidth,
          imgHeight: img.naturalHeight,
          focalX: activeSlide.focalX,
          focalY: activeSlide.focalY,
          template: draft.template,
          placement: draft.placement,
          title: activeSlide.title,
          body: activeSlide.body,
          cta: activeSlide.cta || draft.defaultCta,
          slideWidth,
          slideHeight,
          slideIndex: activeIndex,
          slideTotal: Math.max(1, slideCount),
        })
        setOverflowWarning(overflow)
      } catch {
        if (!cancelled) setOverflowWarning(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    activeImage,
    activeSlide,
    activeIndex,
    slideCount,
    draft.template,
    draft.placement,
    draft.defaultCta,
    slideWidth,
    slideHeight,
  ])

  async function onGenerateSlideshow() {
    if (slideCount < MIN_SLIDESHOW_SLIDES) {
      setCopyError(`Upload at least ${MIN_SLIDESHOW_SLIDES} photos`)
      return
    }
    setCopyLoading(true)
    setCopyError(null)
    const res = await generateUgcSlideshow({
      angle: draft.angle,
      brief: draft.brief,
      cta: draft.defaultCta,
      slideCount,
    })
    setCopyLoading(false)
    if (!res.ok || !res.slides?.length) {
      setCopyError(res.message || 'Failed to generate copy')
      return
    }
    setDraft((prev) => ({
      ...prev,
      slides: res.slides!.map((s, i) => ({
        title: s.title,
        body: s.body,
        cta: s.cta || (i === res.slides!.length - 1 ? prev.defaultCta : ''),
        focalX: prev.slides[i]?.focalX ?? 50,
        focalY: prev.slides[i]?.focalY ?? 50,
      })),
    }))
    setQualityIssues([])
    setQualityState('passed')
  }

  async function ensureQualityGate(): Promise<boolean> {
    setQualityState('checking')
    const result = await validateUgcQuality({
      slides: draft.slides.map((slide, index) => ({
        title: slide.title,
        body: slide.body,
        cta: slide.cta || draft.defaultCta,
        role: slideRoleForIndex(index, draft.slides.length),
      })),
      description: postDescription,
      theme: `${draft.angle} ${draft.brief}`,
    })
    setQualityIssues(result.issues)
    setQualityState(result.ok ? 'passed' : 'blocked')
    return result.ok
  }

  async function buildExportSlides() {
    const canvas = canvasRef.current
    if (!canvas) throw new Error('Canvas unavailable')
    const out = []
    for (let i = 0; i < images.length; i++) {
      const imgMeta = images[i]
      const content = draft.slides[i] ?? createEmptySlideContent(draft.defaultCta)
      let img = imageCacheRef.current.get(imgMeta.url)
      if (!img) {
        img = await loadImageElement(imgMeta.url)
        imageCacheRef.current.set(imgMeta.url, img)
      }
      out.push({
        image: img,
        imgWidth: img.naturalWidth,
        imgHeight: img.naturalHeight,
        render: {
          focalX: content.focalX,
          focalY: content.focalY,
          template: draft.template,
          placement: draft.placement,
          title: content.title,
          body: content.body,
          cta: content.cta || draft.defaultCta,
          slideWidth,
          slideHeight,
          slideIndex: i,
          slideTotal: images.length,
        },
      })
    }
    return { canvas, slides: out }
  }

  async function onDownloadZip() {
    if (!images.length) return
    if (!(await ensureQualityGate())) return
    setExportBusy(true)
    try {
      const { canvas, slides } = await buildExportSlides()
      const zip = await exportSlideshowZip(slides, canvas, postDescription)
      downloadBlob(zip, buildUgcSlideshowZipFilename())
    } finally {
      setExportBusy(false)
    }
  }

  async function onDownloadCurrent() {
    if (!activeImage) return
    if (!(await ensureQualityGate())) return
    setExportBusy(true)
    try {
      const { canvas, slides } = await buildExportSlides()
      await downloadSingleSlidePng(slides[activeIndex], canvas)
    } finally {
      setExportBusy(false)
    }
  }

  async function onGenerateLtDescription() {
    if (universalDescription !== undefined) return
    setDescriptionLoading(true)
    setDescriptionError(null)
    const res = await generateLtDescription({
      angle: draft.angle,
      brief: draft.brief,
      cta: draft.defaultCta,
      slides: draft.slides.map((s) => ({ title: s.title, body: s.body })),
    })
    setDescriptionLoading(false)
    if (!res.ok || !res.description) {
      setDescriptionError(res.message || 'Failed to generate Lithuanian description')
      return
    }
    patchDraft({ ltDescription: res.description })
  }

  async function onPublishDiscord() {
    if (!images.length) return
    if (!(await ensureQualityGate())) return
    if (!draft.discordGuildId.trim()) {
      setDiscordError('Guild ID is required - set it in Settings')
      setTab('settings')
      return
    }
    if (dirty) await onSaveChanges()
    setDiscordBusy(true)
    setDiscordError(null)
    setDiscordSuccess(null)
    setQualityIssues([])
    setQualityState('unchecked')
    try {
      const { canvas, slides } = await buildExportSlides()
      await ensureUgcSlideFontsReady()
      const blobs = await Promise.all(
        slides.map(async (slide, i) => {
          renderUgcSlide(canvas, {
            image: slide.image,
            imgWidth: slide.imgWidth,
            imgHeight: slide.imgHeight,
            ...slide.render,
          })
          const blob = await canvasToPngBlob(canvas)
          return {
            filename: buildUgcSlideIndexFilename(i),
            data: await blobToBase64(blob),
          }
        }),
      )
      const res = await publishUgcToDiscord({
        caption: postDescription,
        guildId: draft.discordGuildId,
        categoryId: draft.discordCategoryId,
        slides: blobs,
      })
      if (!res.ok) {
        setDiscordError(res.error || res.message || 'Discord publish failed')
        return
      }
      setDiscordSuccess(res.channel ? `Published to #${res.channel}` : 'Published to Discord')
    } catch (err) {
      setDiscordError(err instanceof Error ? err.message : 'Discord publish failed')
    } finally {
      setDiscordBusy(false)
    }
  }

  function onReset() {
    if (hasWork && !window.confirm('Clear the entire slideshow draft?')) return
    for (const img of images) URL.revokeObjectURL(img.url)
    imageCacheRef.current.clear()
    setImages([])
    setCopyError(null)
    setImageError(null)
    setDescriptionError(null)
    setDiscordError(null)
    setDiscordSuccess(null)
    setOverflowWarning(false)
    const next = {
      ...emptyUgcDraft(),
      universalDescription: draft.universalDescription,
      generateDescriptionAutomatically: draft.generateDescriptionAutomatically,
    }
    setDraft(next)
    savedSnapshotRef.current = draftSnapshot(next)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function goToSlide(index: number) {
    if (!images.length) return
    patchDraft({ activeSlideIndex: ((index % images.length) + images.length) % images.length })
  }

  const activeRole = slideRoleForIndex(activeIndex, slideCount)

  return { active, draft, setDraft, tab, setTab, images, setImages, imageError, setImageError, copyError, setCopyError, copyLoading, setCopyLoading, overflowWarning, setOverflowWarning, exportBusy, setExportBusy, descriptionLoading, setDescriptionLoading, descriptionError, setDescriptionError, discordBusy, setDiscordBusy, discordError, setDiscordError, discordSuccess, setDiscordSuccess, qualityState, setQualityState, qualityIssues, setQualityIssues, tokenConfigured, setTokenConfigured, saveBusy, setSaveBusy, saveError, setSaveError, profiles, setProfiles, profileName, setProfileName, selectedProfile, setSelectedProfile, vaultSettings, setVaultSettings, batchTestMode, setBatchTestMode, batchRun, setBatchRun, savedSnapshotRef, savedVaultRef, savedBatchTestModeRef, canvasRef, imageCacheRef, imagesRef, fileInputRef, exportSize, slideWidth, slideHeight, christmasUgc, universalDescription, postDescription, angleOptions, activeIndex, activeImage, activeSlide, slideCount, dirty, tokenReady, patchDraft, patchActiveSlide, hasWork, onSaveChanges, syncSlidesToImageCount, onPickFiles, removeSlide, onGenerateSlideshow, ensureQualityGate, buildExportSlides, onDownloadZip, onDownloadCurrent, onGenerateLtDescription, onPublishDiscord, onReset, goToSlide, activeRole }
}

export type UgcSlidesPanelVm = ReturnType<typeof useUgcSlidesPanel>
