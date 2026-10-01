import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchToolSettings, saveToolSettings } from '../lib/launch'
import {
  DEFAULT_ONE_SHOT_SETTINGS,
  fetchOneShotDiscordSettings,
  fetchOneShotOllamaStatus,
  fetchOneShotThemeStatus,
  generateOneShot,
  publishOneShotToDiscord,
  resetOneShotThemes,
  shortOllamaModelName,
  type OneShotOllamaStatus,
  type OneShotThemeStatus,
  type OneShotVoice,
} from '../lib/one-shot'
import {
  blobToBase64,
  buildOneShotVideoFilename,
  downloadOneShotVideo,
  renderOneShotVideo,
} from '../lib/one-shot-export'
import {
  EXPORT_SIZE_OPTIONS,
  ensureOneShotFontReady,
  renderOneShotSlide,
  resolveExportSize,
  type OneShotSizeId,
} from '../lib/one-shot-render'
import { OneShotBatchTab, type OneShotBatchRunState } from './one-shot/OneShotBatchTab'
import { SecretInput } from './SecretInput'
import { ErrorRetryCallout, Field, inputCls } from './ui/primitives'
import { SaveChangesBar, SaveChangesFooter } from './ui/SaveChangesBar'

type Tab = 'create' | 'batch' | 'settings'

const RANDOM = 'Random (all)'

const TABS: { id: Tab; label: string }[] = [
  { id: 'create', label: 'Create' },
  { id: 'batch', label: 'Batch' },
  { id: 'settings', label: 'Settings' },
]

export function OneShotPanel({ active }: { active: boolean }) {
  const [tab, setTab] = useState<Tab>('create')
  const [sizeId, setSizeId] = useState<OneShotSizeId>('tiktok_reels')
  const [category, setCategory] = useState(RANDOM)
  const [topic, setTopic] = useState('')
  const [voice, setVoice] = useState<OneShotVoice>('auto')
  const [text, setText] = useState('')
  const [caption, setCaption] = useState('')
  const [captions, setCaptions] = useState<string[]>([])
  const [meta, setMeta] = useState<{ theme?: string; category?: string; words?: number }>({})
  const [themeStatus, setThemeStatus] = useState<OneShotThemeStatus | null>(null)
  const [ollama, setOllama] = useState<OneShotOllamaStatus | null>(null)
  const [settings, setSettings] = useState(DEFAULT_ONE_SHOT_SETTINGS)
  const [savedSettings, setSavedSettings] = useState(DEFAULT_ONE_SHOT_SETTINGS)
  const [copyError, setCopyError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [downloadBusy, setDownloadBusy] = useState(false)
  const [saveBusy, setSaveBusy] = useState(false)
  const [batchCount, setBatchCount] = useState(10)
  const [batchPostDiscord, setBatchPostDiscord] = useState(false)
  const [batchRun, setBatchRun] = useState<OneShotBatchRunState>({
    busy: false,
    progress: 0,
    status: '',
    phase: 'idle',
  })
  const [tokenConfigured, setTokenConfigured] = useState(false)
  const [discordBusy, setDiscordBusy] = useState(false)
  const [discordError, setDiscordError] = useState<string | null>(null)
  const [discordSuccess, setDiscordSuccess] = useState<string | null>(null)
  const [settingsNote, setSettingsNote] = useState<string | null>(null)
  const [resetThemeBusy, setResetThemeBusy] = useState(false)
  const [themeResetNote, setThemeResetNote] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previewRef = useRef<HTMLCanvasElement>(null)

  const size = resolveExportSize(sizeId)
  const dirty = JSON.stringify(settings) !== JSON.stringify(savedSettings)

  const refreshTheme = useCallback(async () => {
    const status = await fetchOneShotThemeStatus(category === RANDOM ? undefined : category)
    setThemeStatus(status)
  }, [category])

  const refreshOllama = useCallback(async () => {
    setOllama(await fetchOneShotOllamaStatus())
  }, [])

  useEffect(() => {
    if (!active) return
    void Promise.all([fetchToolSettings('one_shot'), fetchOneShotDiscordSettings()]).then(
      ([res, discord]) => {
        if (discord) setTokenConfigured(discord.tokenConfigured)
        if (!res.ok || !res.values) return
        const next = {
          OLLAMA_URL: res.values.OLLAMA_URL || DEFAULT_ONE_SHOT_SETTINGS.OLLAMA_URL,
          OLLAMA_MODEL: res.values.OLLAMA_MODEL || DEFAULT_ONE_SHOT_SETTINGS.OLLAMA_MODEL,
          OLLAMA_NUM_GPU: res.values.OLLAMA_NUM_GPU || DEFAULT_ONE_SHOT_SETTINGS.OLLAMA_NUM_GPU,
          DISCORD_BOT_TOKEN: res.values.DISCORD_BOT_TOKEN || DEFAULT_ONE_SHOT_SETTINGS.DISCORD_BOT_TOKEN,
          DISCORD_GUILD_ID:
            res.values.DISCORD_GUILD_ID || discord?.guildId || DEFAULT_ONE_SHOT_SETTINGS.DISCORD_GUILD_ID,
          DISCORD_CATEGORY_ID:
            res.values.DISCORD_CATEGORY_ID ||
            discord?.categoryId ||
            DEFAULT_ONE_SHOT_SETTINGS.DISCORD_CATEGORY_ID,
        }
        setSettings(next)
        setSavedSettings(next)
      },
    )
  }, [active])

  useEffect(() => {
    if (!active) return
    void refreshTheme()
    void refreshOllama()
  }, [active, refreshTheme, refreshOllama])

  useEffect(() => {
    if (!active || !text) return
    const canvas = previewRef.current
    if (!canvas) return
    let cancelled = false
    void ensureOneShotFontReady().then(() => {
      if (cancelled) return
      renderOneShotSlide(canvas, { text, width: size.width, height: size.height })
    })
    return () => {
      cancelled = true
    }
  }, [active, text, size.width, size.height])

  const categories = useMemo(() => [RANDOM, ...(themeStatus?.categories ?? [])], [themeStatus])

  async function onGenerate() {
    setLoading(true)
    setCopyError(null)
    try {
      const result = await generateOneShot({
        category: category === RANDOM ? undefined : category,
        topic: topic.trim() || undefined,
        voice,
      })
      if (!result.ok || !result.post) {
        setCopyError(result.message || 'Generate failed')
        return
      }
      setText(result.post.text)
      setCaption(result.post.caption || '')
      setCaptions(result.post.captions?.length ? result.post.captions : result.post.caption ? [result.post.caption] : [])
      setMeta({
        theme: result.post.theme,
        category: result.post.category,
        words: result.post.words,
      })
      await refreshTheme()
    } catch (err) {
      setCopyError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function onDownload() {
    const canvas = canvasRef.current
    if (!canvas || !text.trim()) return
    setDownloadBusy(true)
    try {
      await downloadOneShotVideo(canvas, text, size.width, size.height)
    } catch (err) {
      setCopyError(err instanceof Error ? err.message : 'Video export failed')
    } finally {
      setDownloadBusy(false)
    }
  }

  const tokenReady = Boolean(settings.DISCORD_BOT_TOKEN.trim() || tokenConfigured)
  const discordReady = Boolean(
    tokenReady && settings.DISCORD_GUILD_ID.trim() && settings.DISCORD_CATEGORY_ID.trim(),
  )

  async function persistSettingsIfDirty() {
    if (!dirty) return true
    const res = await saveToolSettings('one_shot', settings)
    if (!res.ok) return false
    setSavedSettings(settings)
    if (settings.DISCORD_BOT_TOKEN.trim()) setTokenConfigured(true)
    return true
  }

  async function videoForText(note: string, filename: string) {
    const canvas = canvasRef.current || document.createElement('canvas')
    const { blob, ext } = await renderOneShotVideo(canvas, note, size.width, size.height)
    return {
      filename: filename.replace(/\.(png|mp4|webm)$/i, `.${ext}`),
      videoBase64: await blobToBase64(blob),
      videoExt: ext,
    }
  }

  async function onSaveSettings() {
    setSaveBusy(true)
    const res = await saveToolSettings('one_shot', settings)
    if (res.ok) {
      setSavedSettings(settings)
      if (settings.DISCORD_BOT_TOKEN.trim()) setTokenConfigured(true)
    }
    setSaveBusy(false)
    void refreshOllama()
  }

  async function onPublishDiscord() {
    if (!text.trim()) return
    setDiscordError(null)
    setDiscordSuccess(null)
    if (!discordReady) {
      setDiscordError('Set bot token, guild ID, and category ID in Settings.')
      setTab('settings')
      return
    }
    setDiscordBusy(true)
    try {
      if (!(await persistSettingsIfDirty())) {
        setDiscordError('Could not save Discord settings.')
        return
      }
      const video = await videoForText(text, buildOneShotVideoFilename())
      const res = await publishOneShotToDiscord({
        caption: caption.trim(),
        text: text.trim(),
        videoBase64: video.videoBase64,
        videoExt: video.videoExt,
        filename: video.filename,
        guildId: settings.DISCORD_GUILD_ID.trim(),
        categoryId: settings.DISCORD_CATEGORY_ID.trim(),
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

  async function onResetThemes() {
    const total = themeStatus?.total ?? 0
    const label = total ? `${total} themes` : 'all themes'
    if (!window.confirm(`Reset used themes? ${label} become available again.`)) return
    setResetThemeBusy(true)
    setThemeResetNote(null)
    try {
      const res = await resetOneShotThemes()
      if (!res.ok) {
        setCopyError(res.message || 'Theme reset failed')
        return
      }
      setThemeResetNote(res.message)
      setSettingsNote(res.message)
      setCopyError(null)
      await refreshTheme()
    } catch (err) {
      setCopyError(err instanceof Error ? err.message : 'Theme reset failed')
    } finally {
      setResetThemeBusy(false)
    }
  }

  return (
    <div className="tool-workspace flex flex-col gap-6">
      <canvas ref={canvasRef} className="hidden" />
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <h1 className="text-2xl font-semibold tracking-tight text-snow">One-Shot Creator</h1>
        <div className="cc-tabs" role="tablist">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className="cc-tab"
            >
              {label}
            </button>
          ))}
        </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-mono text-[10px] uppercase tracking-wide text-fog">
            {themeStatus
              ? `${themeStatus.available}/${themeStatus.total} themes left`
              : 'Theme pool…'}
          </p>
          <button
            type="button"
            onClick={() => void onResetThemes()}
            disabled={resetThemeBusy}
            className="rounded-lg border border-lineStrong bg-raised px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-mist hover:border-brass/30 hover:text-brass disabled:opacity-50"
          >
            {resetThemeBusy ? 'Resetting…' : 'Reset themes'}
          </button>
        </div>
      </div>

      {themeResetNote ? (
        <p className="font-mono text-[11px] text-phosphor">{themeResetNote}</p>
      ) : null}

      {batchRun.busy ? (
        <div className="rounded-xl border border-brass/30 bg-brass/5 px-4 py-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-brass">Batch running</p>
            <button
              type="button"
              onClick={() => setTab('batch')}
              className="rounded-lg border border-brass/40 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-brass"
            >
              View batch
            </button>
          </div>
          <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-well">
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

      {tab === 'create' ? (
        <div className="tool-workspace-body fit-body grid grid-cols-1 items-start gap-6 min-[1180px]:grid-cols-[minmax(0,1fr)_360px]">
          <div className="fit-scroll min-w-0 space-y-6 rounded-2xl border border-line bg-panel p-5 sm:p-6">
            <div className="grid gap-5 min-[1400px]:grid-cols-2">
              <Field label="Size">
                <select
                  className={inputCls}
                  value={sizeId}
                  onChange={(e) => setSizeId(e.target.value as OneShotSizeId)}
                >
                  {EXPORT_SIZE_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label} ({opt.width}×{opt.height})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Category">
                <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Voice">
                <select
                  className={inputCls}
                  value={voice}
                  onChange={(e) => setVoice(e.target.value as OneShotVoice)}
                >
                  <option value="auto">Auto (mostly I)</option>
                  <option value="i">First person</option>
                  <option value="you">You</option>
                </select>
              </Field>
              <Field label="Topic override">
                <input
                  className={inputCls}
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Optional. Leave blank to use the pool"
                />
              </Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void onGenerate()}
                disabled={loading}
                className="rounded-lg border border-brass/40 bg-brass/15 px-4 py-2 font-mono text-[11px] uppercase tracking-wide text-brass disabled:opacity-50"
              >
                {loading ? 'Writing…' : 'Generate'}
              </button>
              <button
                type="button"
                onClick={() => void onDownload()}
                disabled={!text.trim() || downloadBusy}
                className="rounded-lg border border-lineStrong bg-raised px-4 py-2 font-mono text-[11px] uppercase tracking-wide text-mist disabled:opacity-40"
              >
                {downloadBusy ? 'Encoding…' : 'Download video'}
              </button>
              <button
                type="button"
                onClick={() => void onPublishDiscord()}
                disabled={!text.trim() || discordBusy}
                className="rounded-lg border border-phosphor/40 bg-phosphor/15 px-4 py-2 font-mono text-[11px] uppercase tracking-wide text-phosphor disabled:opacity-40"
              >
                {discordBusy ? 'Publishing…' : 'Post to Discord'}
              </button>
            </div>
            {discordError ? (
              <ErrorRetryCallout
                title="Discord publish failed"
                body={discordError}
                onRetry={() => void onPublishDiscord()}
                retrying={discordBusy}
              />
            ) : null}
            {discordSuccess ? <p className="font-mono text-xs text-phosphor">{discordSuccess}</p> : null}
            {copyError ? (
              <ErrorRetryCallout title="Generate failed" body={copyError} onRetry={() => void onGenerate()} retrying={loading} />
            ) : null}
            <Field label="Description">
              <input
                className={inputCls}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Achluophobia"
              />
            </Field>
            {captions.length > 1 ? (
              <div className="flex flex-wrap gap-1.5">
                {captions.map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => setCaption(term)}
                    className={[
                      'rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em]',
                      term === caption
                        ? 'border-brass/50 bg-brass/15 text-brass'
                        : 'border-line bg-well text-mist hover:text-snow',
                    ].join(' ')}
                  >
                    {term}
                  </button>
                ))}
              </div>
            ) : null}
            <Field label="Text">
              <textarea
                className={`${inputCls} min-h-[12rem] resize-y leading-relaxed min-[1180px]:min-h-[7rem]`}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Generate a note, then edit it here."
              />
            </Field>
            {meta.theme ? (
              <p className="font-mono text-[10px] text-fog">
                {caption ? `${caption} · ` : ''}
                {meta.category} · {meta.theme} · {meta.words ?? text.trim().split(/\s+/).filter(Boolean).length} words
              </p>
            ) : null}
          </div>
          <div className="tool-preview fit-scroll flex min-w-0 flex-col items-center gap-5 rounded-2xl border border-line bg-panel p-5">
            <h2 className="self-start text-sm font-semibold text-snow">Preview</h2>
            <div
              className="w-fit max-w-full overflow-hidden rounded-xl border border-lineStrong bg-snow"
            >
              <canvas
                ref={previewRef}
                width={size.width}
                height={size.height}
                className="block h-auto max-h-[min(65vh,600px)] w-auto max-w-full"
              />
            </div>
            <p className="font-mono text-[10px] uppercase tracking-wide text-fog">
              {size.width}×{size.height} · 7s MP4 · no logo
            </p>
          </div>
        </div>
      ) : null}

      {tab === 'batch' ? (
        <div className="tool-workspace-body fit-column">
          <OneShotBatchTab
          active={active}
          batchCount={batchCount}
          onBatchCountChange={setBatchCount}
          sizeId={sizeId}
          onSizeIdChange={setSizeId}
          category={category}
          onCategoryChange={setCategory}
          categories={categories}
          topic={topic}
          onTopicChange={setTopic}
          voice={voice}
          onVoiceChange={setVoice}
          size={size}
          discordReady={discordReady}
          batchPostDiscord={batchPostDiscord}
          onBatchPostDiscordChange={setBatchPostDiscord}
          persistSettingsIfDirty={persistSettingsIfDirty}
          settings={settings}
          canvasRef={canvasRef}
          onRefreshTheme={refreshTheme}
          onRunStateChange={setBatchRun}
          />
        </div>
      ) : null}

      {tab === 'settings' ? (
        <div className="tool-workspace-body tool-settings-grid settings-preserve">
          <div className="min-[1180px]:col-span-2"><SaveChangesBar dirty={dirty} busy={saveBusy} onSave={() => void onSaveSettings()} /></div>
          <section className="space-y-5 rounded-2xl border border-line bg-panel p-5 sm:p-6">
          <h2 className="text-base font-semibold text-snow">Copy generation</h2>
          <Field label="Ollama URL">
            <input
              className={inputCls}
              value={settings.OLLAMA_URL}
              onChange={(e) => setSettings((s) => ({ ...s, OLLAMA_URL: e.target.value }))}
            />
          </Field>
          <Field label="Ollama model">
            <select
              className={inputCls}
              value={settings.OLLAMA_MODEL}
              onChange={(e) => setSettings((s) => ({ ...s, OLLAMA_MODEL: e.target.value }))}
            >
              {(ollama?.models?.length ? ollama.models : [settings.OLLAMA_MODEL]).map((m) => (
                <option key={m} value={m}>
                  {shortOllamaModelName(m)}
                </option>
              ))}
              {settings.OLLAMA_MODEL && !(ollama?.models ?? []).includes(settings.OLLAMA_MODEL) ? (
                <option value={settings.OLLAMA_MODEL}>{shortOllamaModelName(settings.OLLAMA_MODEL)}</option>
              ) : null}
            </select>
          </Field>
          <Field label="GPU layers">
            <input
              className={inputCls}
              value={settings.OLLAMA_NUM_GPU}
              onChange={(e) => setSettings((s) => ({ ...s, OLLAMA_NUM_GPU: e.target.value }))}
            />
          </Field>
          <p className="font-mono text-[10px] text-fog">
            {ollama?.online ? (ollama.modelReady ? 'Ollama ready' : ollama.message) : ollama?.message || 'Checking Ollama…'}
          </p>
          </section>
          <section className="space-y-5 rounded-2xl border border-line bg-panel p-5 sm:p-6">
            <h2 className="text-base font-semibold text-snow">Discord</h2>
            <Field label="Bot token">
              <SecretInput
                className={inputCls}
                value={settings.DISCORD_BOT_TOKEN}
                onChange={(v) => setSettings((s) => ({ ...s, DISCORD_BOT_TOKEN: v }))}
                placeholder={tokenConfigured && !settings.DISCORD_BOT_TOKEN ? 'Using vault token' : ''}
              />
            </Field>
            <Field label="Guild ID">
              <input
                className={inputCls}
                value={settings.DISCORD_GUILD_ID}
                onChange={(e) => setSettings((s) => ({ ...s, DISCORD_GUILD_ID: e.target.value }))}
                placeholder="Discord server snowflake ID"
              />
            </Field>
            <Field label="Category ID">
              <input
                className={inputCls}
                value={settings.DISCORD_CATEGORY_ID}
                onChange={(e) => setSettings((s) => ({ ...s, DISCORD_CATEGORY_ID: e.target.value }))}
                placeholder="Category channel snowflake ID"
              />
            </Field>
          </section>
          <div className="space-y-4 min-[1180px]:col-span-2">
          <button
            type="button"
            onClick={() => void onResetThemes()}
            disabled={resetThemeBusy}
            className="rounded-lg border border-lineStrong bg-raised px-4 py-2 font-mono text-[11px] uppercase tracking-wide text-mist disabled:opacity-50"
          >
            {resetThemeBusy ? 'Resetting…' : 'Reset themes'}
          </button>
          {settingsNote ? <p className="font-mono text-xs text-phosphor">{settingsNote}</p> : null}
          </div>
        </div>
      ) : null}
      {tab === 'settings' && <SaveChangesFooter dirty={dirty} busy={saveBusy} onSave={() => void onSaveSettings()} />}
    </div>
  )
}
