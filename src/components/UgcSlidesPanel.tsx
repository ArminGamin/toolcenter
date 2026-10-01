import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createEmptySlideContent,
  emptyUgcDraft,
  DEFAULT_UGC_VAULT_SETTINGS,
  draftSnapshot,
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
  SLIDE_ROLE_LABELS,
  slideRoleForIndex,
  ugcAngleOptions,
  validateImageFile,
  validateUgcQuality,
  vaultSettingsSnapshot,
  type UgcSlidesDraft,
  type UgcSlidesProfile,
  type UgcVaultSettings,
} from '../lib/ugc-slides'
import { fetchToolSettings, saveToolSettings } from '../lib/launch'
import {
  loadBatchPrefsTestMode,
  parseBatchTestModeSetting,
  saveBatchPrefsTestMode,
} from '../lib/ugc-batch-prefs'
import {
  blobToBase64,
  buildUgcSlideIndexFilename,
  buildUgcSlideshowZipFilename,
  downloadBlob,
  downloadSingleSlidePng,
  exportSlideshowZip,
} from '../lib/ugc-slides-export'
import { canvasToPngBlob, renderUgcSlide, ensureUgcSlideFontsReady } from '../lib/ugc-slides-render'
import { UgcSlidesSettingsTab } from './ugc-slides/UgcSlidesSettingsTab'
import { UgcOllamaModelBar } from './ugc-slides/UgcOllamaModelBar'
import { UgcSlidesBatchTab, type UgcBatchRunState } from './ugc-slides/UgcSlidesBatchTab'
import { ErrorRetryCallout, Field, inputCls } from './ui/primitives'
import { SaveChangesBar, SaveChangesFooter } from './ui/SaveChangesBar'
import { activeBusinessProfileId } from '../lib/business-profiles'
import { resolveUniversalUgcDescription } from '../lib/ugc-universal-description'
import { UgcUniversalDescription } from './ugc-slides/UgcUniversalDescription'

type PanelTab = 'create' | 'batch' | 'settings'

type SlideImage = {
  id: string
  url: string
}

function newId() {
  return `slide-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function UgcSlidesPanel({ active }: { active: boolean }) {
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

  return (
    <div className="tool-workspace flex flex-col gap-6">
      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <h1 className="font-sans text-2xl font-semibold tracking-tight text-snow">UGC Slide Creator</h1>
          <UgcTabs tab={tab} setTab={setTab} />
          <SaveChangesBar compact dirty={dirty} busy={saveBusy} onSave={onSaveChanges} className="ml-auto" />
        </div>
        {saveError ? <ErrorRetryCallout title={saveError} onRetry={onSaveChanges} /> : null}
        <UgcOllamaModelBar
          active={active}
          vaultSettings={vaultSettings}
          onModelChange={(model) =>
            setVaultSettings((prev) => ({ ...prev, OLLAMA_MODEL: model }))
          }
          compact
        />
        {batchRun.busy && tab !== 'batch' ? (
          <div className="rounded-xl border border-brass/30 bg-brass/5 px-4 py-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wide text-brass">
                Batch generating
                {batchRun.elapsedSec > 0 ? (
                  <span className="ml-2 tabular-nums normal-case text-phosphor">
                    {Math.floor(batchRun.elapsedSec / 60)}:
                    {String(batchRun.elapsedSec % 60).padStart(2, '0')}
                  </span>
                ) : null}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {batchRun.abort ? (
                  <button
                    type="button"
                    onClick={batchRun.abort}
                    className="min-h-[32px] rounded-lg border border-red-500/50 px-3 py-1 font-mono text-[10px] uppercase tracking-wide text-red-300 hover:bg-red-500/10"
                  >
                    Abort
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setTab('batch')}
                  className="min-h-[32px] rounded-lg border border-brass/40 px-3 py-1 font-mono text-[10px] uppercase tracking-wide text-brass"
                >
                  View batch
                </button>
              </div>
            </div>
            <div className="mb-2 h-2 overflow-hidden rounded-full bg-well">
              <div
                className="h-full rounded-full bg-brass transition-all"
                style={{ width: `${Math.round(batchRun.progress * 100)}%` }}
              />
            </div>
            {batchRun.status ? (
              <p className="font-mono text-[11px] text-phosphor">{batchRun.status}</p>
            ) : null}
          </div>
        ) : null}
      </header>

      <div
        className={[
          'tool-workspace-body settings-preserve pb-6',
          tab === 'settings' ? 'block' : 'hidden',
        ].join(' ')}
      >
        <UgcSlidesSettingsTab
          draft={draft}
          vaultSettings={vaultSettings}
          profiles={profiles}
          profileName={profileName}
          selectedProfile={selectedProfile}
          onProfilesChange={setProfiles}
          onProfileNameChange={setProfileName}
          onSelectedProfileChange={setSelectedProfile}
          onPatchDraft={patchDraft}
          onVaultSettingsChange={(partial) =>
            setVaultSettings((prev) => ({ ...prev, ...partial }))
          }
        />
      </div>

      <div
        className={[
          'tool-workspace-body fit-column flex-col',
          tab === 'batch' ? 'flex' : 'hidden',
        ].join(' ')}
      >
        <UgcSlidesBatchTab
          active={active}
          draft={draft}
          onDescriptionChange={patchDraft}
          tokenReady={tokenReady}
          testMode={batchTestMode}
          onTestModeChange={(value) => {
            setBatchTestMode(value)
            saveBatchPrefsTestMode(value)
          }}
          onOpenSettings={() => setTab('settings')}
          onRunStateChange={setBatchRun}
        />
      </div>

      <div
        className={[
          'tool-workspace-body grid grid-cols-1 items-start gap-6 min-[1180px]:grid-cols-[minmax(0,1fr)_360px]',
          tab === 'create' ? 'grid' : 'hidden',
        ].join(' ')}
      >
          <section id="ugc-preview" className="tool-preview order-2 flex min-w-0 flex-col gap-5 rounded-2xl border border-line bg-panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="font-mono text-xs text-fog">
                Preview · {slideWidth}×{slideHeight}
                <span className="ml-2 text-mist">{exportSize.label}</span>
                {slideCount > 0 && (
                  <span className="ml-2 text-brass">
                    {activeIndex + 1} / {slideCount}
                  </span>
                )}
              </div>
              {activeRole && slideCount > 0 && (
                <span className="rounded-full border border-lineStrong bg-well px-2 py-0.5 font-mono text-[10px] uppercase text-mist">
                  {SLIDE_ROLE_LABELS[activeRole] || activeRole}
                </span>
              )}
            </div>

            <a href="#ugc-editor" onClick={(event) => { event.preventDefault(); document.getElementById('ugc-editor')?.scrollIntoView({ block: 'start' }) }} className="inline-flex self-start rounded-lg border border-lineStrong px-4 py-2.5 text-sm text-mist hover:text-snow min-[1180px]:hidden">Back to editing ↑</a>
            <div className="flex min-w-0 flex-col items-center justify-center gap-5">
              <div
                className="relative w-fit max-w-full overflow-hidden rounded-xl border border-lineStrong bg-ink shadow-panel"
              >
                <canvas
                  ref={canvasRef}
                  width={slideWidth}
                  height={slideHeight}
                  className="block h-auto max-h-[min(55vh,640px)] w-auto max-w-full"
                />
                {!activeImage && (
                  <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-fog">
                    Upload photos to preview the slideshow
                  </div>
                )}
              </div>

              {slideCount > 0 && (
                <div className="flex w-full max-w-md items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => goToSlide(activeIndex - 1)}
                    className="min-h-[40px] rounded-lg border border-lineStrong px-3 py-2 font-mono text-[10px] uppercase text-mist"
                    aria-label="Previous slide"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={() => goToSlide(activeIndex + 1)}
                    className="min-h-[40px] rounded-lg border border-lineStrong px-3 py-2 font-mono text-[10px] uppercase text-mist"
                    aria-label="Next slide"
                  >
                    →
                  </button>
                </div>
              )}

              {overflowWarning && (
                <p className="text-center text-xs text-ember">
                  Text is too long on this slide - shorten the headline or body.
                </p>
              )}
            </div>

            {images.length > 0 && (
              <div className="shrink-0">
                <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-fog">Slides</div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {images.map((img, i) => (
                    <div key={img.id} className="group relative shrink-0">
                      <button
                        type="button"
                        onClick={() => goToSlide(i)}
                        className={[
                          'relative h-16 w-10 overflow-hidden rounded-lg border-2 transition',
                          i === activeIndex ? 'border-brass ring-2 ring-brass/30' : 'border-lineStrong hover:border-brass/40',
                        ].join(' ')}
                        aria-label={`Slide ${i + 1}`}
                      >
                        <img src={img.url} alt="" className="h-full w-full object-cover" />
                        <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-center font-mono text-[9px] text-snow">
                          {i + 1}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSlide(i)}
                        className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-ember text-[10px] text-snow group-hover:flex"
                        aria-label="Remove"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          <div id="ugc-editor" className="order-1 min-w-0 space-y-6 pb-6">
            <a href="#ugc-preview" onClick={(event) => { event.preventDefault(); document.getElementById('ugc-preview')?.scrollIntoView({ block: 'start' }) }} className="inline-flex rounded-lg border border-lineStrong px-4 py-2.5 text-sm text-mist hover:text-snow min-[1180px]:hidden">Jump to preview ↓</a>
            <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6 min-[1180px]:!mt-0">
              <h2 className="mb-3 text-sm font-semibold text-snow">Photos</h2>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  onPickFiles(e.dataTransfer.files)
                }}
                className="flex min-h-[100px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-lineStrong bg-well/40 px-4 py-5 text-center transition hover:border-brass/40"
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
              >
                <p className="text-sm text-mist">Drag photos here or click to browse</p>
                <p className="mt-1 font-mono text-[10px] text-fog">
                  JPG · PNG · WEBP · up to 15 MB · {MIN_SLIDESHOW_SLIDES}-{MAX_SLIDESHOW_SLIDES} slides
                </p>
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
              {slideCount > 0 && (
                <p className="mt-2 font-mono text-[10px] text-fog">
                  {slideCount} slide{slideCount === 1 ? '' : 's'} ready
                </p>
              )}
            </section>

            <section className="space-y-5 rounded-2xl border border-line bg-panel p-5 sm:p-6">
              <h2 className="text-sm font-semibold text-snow">Slideshow copy</h2>
              <Field label="Angle">
                <select
                  className={inputCls}
                  value={draft.angle}
                  onChange={(e) => patchDraft({ angle: e.target.value as UgcSlidesDraft['angle'] })}
                >
                  {angleOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Extra context">
                <textarea
                  className={`${inputCls} min-h-[120px]`}
                  value={draft.brief}
                  onChange={(e) => patchDraft({ brief: e.target.value })}
                  placeholder={
                    christmasUgc
                      ? 'e.g. last-minute gift for dad under 30 euros'
                      : 'e.g. $40 weekly food budget and very little time to cook'
                  }
                />
              </Field>
              <Field label="Default CTA (last slide)">
                <input
                  className={inputCls}
                  value={draft.defaultCta}
                  onChange={(e) => patchDraft({ defaultCta: e.target.value })}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={copyLoading || slideCount < MIN_SLIDESHOW_SLIDES}
                  onClick={() => void onGenerateSlideshow()}
                  className="min-h-[44px] rounded-lg border border-brass/40 bg-brass/15 px-4 py-2 font-mono text-[11px] uppercase tracking-wide text-brass disabled:opacity-50"
                >
                  {copyLoading ? 'Generating…' : 'Generate slideshow'}
                </button>
                {slideCount >= MIN_SLIDESHOW_SLIDES && (
                  <button
                    type="button"
                    disabled={copyLoading}
                    onClick={() => void onGenerateSlideshow()}
                    className="min-h-[44px] rounded-lg border border-lineStrong px-4 py-2 font-mono text-[11px] uppercase tracking-wide text-mist disabled:opacity-50"
                  >
                    Regenerate
                  </button>
                )}
              </div>
              {copyError && (
                <ErrorRetryCallout title={copyError} onRetry={() => void onGenerateSlideshow()} />
              )}
            </section>

            {slideCount > 0 && (
              <section className="space-y-5 rounded-2xl border border-line bg-panel p-5 sm:p-6">
                <h2 className="text-sm font-semibold text-snow">
                  Slide {activeIndex + 1} copy
                </h2>
                <Field label="Headline">
                  <input
                    className={inputCls}
                    value={activeSlide.title}
                    onChange={(e) => patchActiveSlide({ title: e.target.value })}
                  />
                </Field>
                <Field label="Body">
                  <textarea
                    className={`${inputCls} min-h-[144px]`}
                    value={activeSlide.body}
                    onChange={(e) => patchActiveSlide({ body: e.target.value })}
                  />
                </Field>
                {(activeRole === 'close' || draft.template === 'headline_body_cta') && (
                  <Field label="CTA">
                    <input
                      className={inputCls}
                      value={activeSlide.cta}
                      onChange={(e) => patchActiveSlide({ cta: e.target.value })}
                      placeholder={draft.defaultCta}
                    />
                  </Field>
                )}
                <Field label="Horizontal focal point">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={activeSlide.focalX}
                    onChange={(e) => patchActiveSlide({ focalX: Number(e.target.value) })}
                    className="w-full accent-brass"
                  />
                </Field>
                <Field label="Vertical focal point">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={activeSlide.focalY}
                    onChange={(e) => patchActiveSlide({ focalY: Number(e.target.value) })}
                    className="w-full accent-brass"
                  />
                </Field>
              </section>
            )}

            <section className="space-y-5 rounded-2xl border border-line bg-panel p-5 sm:p-6">
              <h2 className="text-sm font-semibold text-snow">Discord description</h2>
              {christmasUgc && <UgcUniversalDescription draft={draft} onChange={patchDraft} />}
              {universalDescription === undefined && (
              <Field label="Lithuanian caption (caption.txt)">
                <textarea
                  className={`${inputCls} min-h-[240px]`}
                  value={draft.ltDescription}
                  onChange={(e) => patchDraft({ ltDescription: e.target.value })}
                  placeholder="Discord post description in Lithuanian"
                />
              </Field>
              )}
              <button
                type="button"
                disabled={descriptionLoading || slideCount < 1 || universalDescription !== undefined}
                onClick={() => void onGenerateLtDescription()}
                className="min-h-[44px] rounded-lg border border-brass/40 bg-brass/15 px-4 py-2 font-mono text-[11px] uppercase tracking-wide text-brass disabled:opacity-50"
              >
                {universalDescription !== undefined ? 'Using universal description' : descriptionLoading ? 'Generating…' : 'Generate LT description'}
              </button>
              {descriptionError && (
                <ErrorRetryCallout title={descriptionError} onRetry={() => void onGenerateLtDescription()} />
              )}
            </section>

            <section className="space-y-5 rounded-2xl border border-line bg-panel p-5 sm:p-6">
              <h2 className="text-sm font-semibold text-snow">Export & publish</h2>
              {!tokenReady && (
                <p className="text-xs text-ember">
                  Discord bot token missing. Add it in Settings, then Save changes.
                </p>
              )}
              {discordError && <p className="text-xs text-ember">{discordError}</p>}
              {discordSuccess && <p className="text-xs text-phosphor">{discordSuccess}</p>}
              <div className="rounded-lg border border-lineStrong bg-well/30 px-3 py-2 font-mono text-[10px]">
                <span className={qualityState === 'passed' ? 'text-phosphor' : qualityState === 'blocked' ? 'text-ember' : 'text-brass'}>
                  {qualityState === 'passed' ? 'Lithuanian quality gate passed' : qualityState === 'blocked' ? 'Lithuanian quality gate blocked export' : qualityState === 'checking' ? 'Checking Lithuanian quality…' : 'Lithuanian quality needs a final check before export'}
                </span>
                {qualityIssues.length > 0 ? (
                  <ul className="mt-1 list-disc pl-4 text-ember">{qualityIssues.slice(0, 6).map((issue) => <li key={issue}>{issue}</li>)}</ul>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={slideCount < 1 || exportBusy || overflowWarning}
                  onClick={() => void onDownloadZip()}
                  className="min-h-[44px] rounded-lg border border-phosphor/40 bg-phosphor/15 px-4 py-2 font-mono text-[11px] uppercase tracking-wide text-phosphor disabled:opacity-40"
                >
                  {exportBusy ? 'Exporting…' : 'Download ZIP'}
                </button>
                <button
                  type="button"
                  disabled={!activeImage || exportBusy || overflowWarning}
                  onClick={() => void onDownloadCurrent()}
                  className="min-h-[44px] rounded-lg border border-lineStrong px-4 py-2 font-mono text-[11px] uppercase tracking-wide text-mist disabled:opacity-40"
                >
                  This slide only
                </button>
                <button
                  type="button"
                  disabled={discordBusy || !tokenReady || slideCount < 1 || overflowWarning}
                  onClick={() => void onPublishDiscord()}
                  className="min-h-[44px] rounded-lg border border-[#5865F2]/40 bg-[#5865F2]/15 px-4 py-2 font-mono text-[11px] uppercase tracking-wide text-[#8ea1ff] disabled:opacity-40"
                >
                  {discordBusy ? 'Publishing…' : 'Post to Discord'}
                </button>
                <button
                  type="button"
                  onClick={onReset}
                  className="min-h-[44px] rounded-lg border border-lineStrong px-4 py-2 font-mono text-[11px] uppercase tracking-wide text-mist"
                >
                  Clear
                </button>
              </div>
              <p className="text-xs text-fog">
                Export size: <span className="text-mist">{exportSize.label}</span> - change in Settings.
              </p>
            </section>
          </div>
      </div>
      <SaveChangesFooter dirty={dirty} busy={saveBusy} onSave={onSaveChanges} />
    </div>
  )
}

function UgcTabs({ tab, setTab }: { tab: PanelTab; setTab: (tab: PanelTab) => void }) {
  return (
    <div className="cc-tabs" role="tablist">
      {(['batch', 'settings'] as PanelTab[]).map((id) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tab === id}
          onClick={() => setTab(id)}
          className="cc-tab"
        >
          {id === 'create' ? 'Create' : id === 'batch' ? 'Batch' : 'Settings'}
        </button>
      ))}
    </div>
  )
}
