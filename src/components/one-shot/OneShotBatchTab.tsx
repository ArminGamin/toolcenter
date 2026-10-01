import { useEffect, useRef, useState, type RefObject } from 'react'
import {
  generateOneShot,
  publishOneShotToDiscord,
  type OneShotPost,
  type OneShotVoice,
} from '../../lib/one-shot'
import {
  blobToBase64,
  renderOneShotVideo,
  saveOneShotBatchToServer,
} from '../../lib/one-shot-export'
import {
  EXPORT_SIZE_OPTIONS,
  ensureOneShotFontReady,
  type OneShotSizeId,
} from '../../lib/one-shot-render'
import { ErrorRetryCallout, Field, Panel, Stat, checkCls, inputCls } from '../ui/primitives'

const RANDOM = 'Random (all)'

type BatchPhase = 'idle' | 'writing' | 'rendering' | 'discord' | 'done' | 'error'

type BatchRow = OneShotPost & {
  rowStatus: 'pending' | 'active' | 'done' | 'error'
  error?: string
}

export type OneShotBatchRunState = {
  busy: boolean
  progress: number
  status: string
  phase: BatchPhase
}

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`
}

const PHASES: { id: BatchPhase; label: string }[] = [
  { id: 'writing', label: 'Write' },
  { id: 'rendering', label: 'Render' },
  { id: 'discord', label: 'Discord' },
]

function phaseIndex(phase: BatchPhase): number {
  if (phase === 'writing') return 0
  if (phase === 'rendering') return 1
  if (phase === 'discord') return 2
  if (phase === 'done') return 3
  return -1
}

export function OneShotBatchTab({
  active,
  batchCount,
  onBatchCountChange,
  sizeId,
  onSizeIdChange,
  category,
  onCategoryChange,
  categories,
  topic,
  onTopicChange,
  voice,
  onVoiceChange,
  size,
  discordReady,
  batchPostDiscord,
  onBatchPostDiscordChange,
  persistSettingsIfDirty,
  settings,
  canvasRef,
  onRefreshTheme,
  onRunStateChange,
}: {
  active: boolean
  batchCount: number
  onBatchCountChange: (n: number) => void
  sizeId: OneShotSizeId
  onSizeIdChange: (id: OneShotSizeId) => void
  category: string
  onCategoryChange: (c: string) => void
  categories: string[]
  topic: string
  onTopicChange: (t: string) => void
  voice: OneShotVoice
  onVoiceChange: (v: OneShotVoice) => void
  size: { width: number; height: number }
  discordReady: boolean
  batchPostDiscord: boolean
  onBatchPostDiscordChange: (v: boolean) => void
  persistSettingsIfDirty: () => Promise<boolean>
  settings: { DISCORD_GUILD_ID: string; DISCORD_CATEGORY_ID: string }
  canvasRef: RefObject<HTMLCanvasElement | null>
  onRefreshTheme: () => Promise<void>
  onRunStateChange?: (state: OneShotBatchRunState) => void
}) {
  const [rows, setRows] = useState<BatchRow[]>([])
  const [phase, setPhase] = useState<BatchPhase>('idle')
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [doneMessage, setDoneMessage] = useState<string | null>(null)
  const [elapsedSec, setElapsedSec] = useState(0)
  const startedAtRef = useRef<number | null>(null)
  const abortRef = useRef(false)

  useEffect(() => {
    onRunStateChange?.({ busy, progress, status, phase })
  }, [busy, progress, status, phase, onRunStateChange])

  useEffect(() => {
    if (!active || !busy) return
    const id = window.setInterval(() => {
      if (startedAtRef.current) {
        setElapsedSec(Math.floor((Date.now() - startedAtRef.current) / 1000))
      }
    }, 1000)
    return () => window.clearInterval(id)
  }, [active, busy])

  function patchRow(index: number, patch: Partial<BatchRow>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function requestAbort() {
    abortRef.current = true
    setStatus('Stopping after current step…')
  }

  async function onBatch() {
    setBusy(true)
    setError(null)
    setDoneMessage(null)
    setProgress(0)
    setPhase('writing')
    setStatus('Starting batch…')
    setElapsedSec(0)
    startedAtRef.current = Date.now()
    abortRef.current = false

    const total = batchCount
    const discordSteps = batchPostDiscord ? total : 0
    const totalSteps = total + total + discordSteps
    let completed = 0

    const bump = (label: string, nextPhase?: BatchPhase) => {
      if (nextPhase) setPhase(nextPhase)
      setStatus(label)
      setProgress(Math.min(1, completed / totalSteps))
    }

    const initialRows: BatchRow[] = Array.from({ length: total }, () => ({
      text: '',
      caption: '',
      captions: [],
      voice: 'i',
      theme: '',
      category: '',
      words: 0,
      rowStatus: 'pending',
    }))
    setRows(initialRows)

    const posts: OneShotPost[] = []

    try {
      for (let i = 0; i < total; i++) {
        if (abortRef.current) break
        patchRow(i, { rowStatus: 'active' })
        bump(`Writing post ${i + 1} of ${total}…`, 'writing')
        const result = await generateOneShot({
          category: category === RANDOM ? undefined : category,
          topic: topic.trim() || undefined,
          voice,
        })
        if (!result.ok || !result.post) {
          patchRow(i, { rowStatus: 'error', error: result.message || 'Failed' })
          throw new Error(result.message || `Post ${i + 1} failed`)
        }
        posts.push(result.post)
        patchRow(i, { ...result.post, rowStatus: 'done' })
        completed += 1
        setProgress(completed / totalSteps)
      }

      if (abortRef.current || !posts.length) {
        setPhase('error')
        setStatus(abortRef.current ? 'Batch stopped.' : 'No posts generated.')
        return
      }

      const canvas = canvasRef.current || document.createElement('canvas')
      await ensureOneShotFontReady()
      const payload = []

      for (let i = 0; i < posts.length; i++) {
        if (abortRef.current) break
        bump(`Rendering video ${i + 1} of ${posts.length}…`, 'rendering')
        const post = posts[i]
        const { blob, ext } = await renderOneShotVideo(
          canvas,
          post.text,
          size.width,
          size.height,
        )
        payload.push({
          postIndex: i + 1,
          text: post.text,
          meta: { ...post, width: size.width, height: size.height },
          videoBase64: await blobToBase64(blob),
          videoExt: ext,
        })
        completed += 1
        setProgress(completed / totalSteps)
      }

      if (abortRef.current) {
        setPhase('error')
        setStatus('Batch stopped.')
        return
      }

      const saved = await saveOneShotBatchToServer(payload)

      let discordNote = ''
      if (batchPostDiscord) {
        if (!discordReady) {
          discordNote = 'Discord skipped: set bot token, guild ID, and category ID in Settings.'
        } else if (!(await persistSettingsIfDirty())) {
          discordNote = 'Discord skipped: could not save settings.'
        } else {
          let published = 0
          for (let i = 0; i < payload.length; i++) {
            if (abortRef.current) break
            bump(`Posting ${i + 1} of ${payload.length} to Discord…`, 'discord')
            const pub = await publishOneShotToDiscord({
              caption: String(payload[i].meta.caption || ''),
              text: payload[i].text.trim(),
              videoBase64: payload[i].videoBase64,
              videoExt: payload[i].videoExt,
              filename: `one-shot-${String(i + 1).padStart(2, '0')}.${payload[i].videoExt}`,
              guildId: settings.DISCORD_GUILD_ID.trim(),
              categoryId: settings.DISCORD_CATEGORY_ID.trim(),
            })
            if (!pub.ok) {
              discordNote = `Discord stopped at ${i + 1}/${payload.length}: ${pub.error || pub.message || 'failed'}.`
              break
            }
            published += 1
            completed += 1
            setProgress(completed / totalSteps)
          }
          if (!discordNote) discordNote = `Posted ${published} to Discord.`
        }
      }

      setPhase('done')
      setProgress(1)
      setStatus('Batch complete')
      setDoneMessage(
        saved.ok
          ? `Saved ${posts.length} posts${saved.batchDir ? ` → ${saved.batchDir}` : ''}.${discordNote ? ` ${discordNote}` : ''}`
          : `Generated ${posts.length} posts. Disk save failed: ${saved.message || 'unknown'}.${discordNote ? ` ${discordNote}` : ''}`,
      )
      await onRefreshTheme()
    } catch (err) {
      setPhase('error')
      setError(err instanceof Error ? err.message : String(err))
      setStatus('Batch failed')
    } finally {
      setBusy(false)
      startedAtRef.current = null
      abortRef.current = false
    }
  }

  const activePhase = phaseIndex(phase)
  const doneCount = rows.filter((r) => r.rowStatus === 'done').length

  return (
    <div className="fit-body grid items-start gap-6 min-[1180px]:grid-cols-2">
      <div className="fit-scroll min-w-0">
      <Panel title="Batch setup">
        <div className="grid gap-5 min-[1180px]:grid-cols-2">
          <Field label="Count">
            <input
              className={inputCls}
              type="number"
              min={1}
              max={50}
              value={batchCount}
              disabled={busy}
              onChange={(e) =>
                onBatchCountChange(Math.max(1, Math.min(50, Number(e.target.value) || 1)))
              }
            />
          </Field>
          <Field label="Size">
            <select
              className={inputCls}
              value={sizeId}
              disabled={busy}
              onChange={(e) => onSizeIdChange(e.target.value as OneShotSizeId)}
            >
              {EXPORT_SIZE_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label} ({opt.width}×{opt.height})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Category">
            <select
              className={inputCls}
              value={category}
              disabled={busy}
              onChange={(e) => onCategoryChange(e.target.value)}
            >
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
              disabled={busy}
              onChange={(e) => onVoiceChange(e.target.value as OneShotVoice)}
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
              disabled={busy}
              onChange={(e) => onTopicChange(e.target.value)}
              placeholder="Optional. Leave blank for pool themes"
            />
          </Field>
        </div>

        <label className="mt-4 flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            className={checkCls}
            checked={batchPostDiscord}
            disabled={busy}
            onChange={(e) => onBatchPostDiscordChange(e.target.checked)}
          />
          <span className="font-mono text-[11px] uppercase tracking-wide text-mist">Post each to Discord</span>
          {!discordReady ? (
            <span className="font-mono text-[10px] text-fog">Configure in Settings</span>
          ) : null}
        </label>
      </Panel>
      </div>
      <div className="fit-scroll min-w-0 space-y-6">

      {(busy || phase === 'done' || phase === 'error') && (
        <section className="rounded-2xl border border-lineStrong bg-panel p-4 shadow-panel">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {PHASES.map((p, i) => {
                const done = activePhase > i
                const current = activePhase === i
                return (
                  <span
                    key={p.id}
                    className={[
                      'rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em]',
                      done
                        ? 'border-phosphor/40 bg-phosphor/10 text-phosphor'
                        : current
                          ? 'border-brass/50 bg-brass/15 text-brass'
                          : 'border-line bg-well text-fog',
                    ].join(' ')}
                  >
                    {p.label}
                  </span>
                )
              })}
            </div>
            {(busy || elapsedSec > 0) && (
              <span className="font-mono text-[11px] tabular-nums text-brass">
                {busy ? 'Elapsed' : 'Finished in'} {formatElapsed(elapsedSec)}
              </span>
            )}
          </div>

          <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-3">
            <Stat label="Posts" value={`${doneCount}/${batchCount}`} tone="brass" />
            <Stat label="Phase" value={phase === 'idle' ? '-' : phase} tone="mist" />
            <Stat label="Progress" value={`${Math.round(progress * 100)}%`} tone="phosphor" />
          </div>

          <div className="mb-3 h-2 overflow-hidden rounded-full bg-well">
            <div
              className="h-full rounded-full bg-brass transition-all duration-300"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>

          {status ? <p className="font-mono text-[11px] text-phosphor">{status}</p> : null}
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void onBatch()}
          disabled={busy}
          className="min-h-[44px] flex-1 rounded-lg border border-brass/50 bg-brass/20 px-4 py-2.5 font-mono text-[12px] font-semibold uppercase tracking-wide text-brass disabled:opacity-50 sm:flex-none"
        >
          {busy ? 'Running batch…' : `Generate ${batchCount} posts`}
        </button>
        {busy ? (
          <button
            type="button"
            onClick={requestAbort}
            className="min-h-[44px] rounded-lg border border-ember/50 bg-ember/10 px-4 py-2.5 font-mono text-[12px] uppercase tracking-wide text-ember"
          >
            Stop
          </button>
        ) : rows.length ? (
          <button
            type="button"
            onClick={() => {
              setRows([])
              setPhase('idle')
              setProgress(0)
              setStatus('')
              setDoneMessage(null)
              setError(null)
            }}
            className="min-h-[44px] rounded-lg border border-lineStrong bg-well px-4 py-2.5 font-mono text-[12px] uppercase tracking-wide text-mist"
          >
            Clear
          </button>
        ) : null}
      </div>

      {error ? <ErrorRetryCallout title="Batch failed" body={error} onRetry={() => void onBatch()} retrying={busy} /> : null}
      {doneMessage ? <p className="font-mono text-xs text-phosphor">{doneMessage}</p> : null}

      {rows.length ? (
        <ul className="space-y-2 pb-2">
          {rows.map((post, i) => (
            <li
              key={`batch-row-${i}`}
              className={[
                'rounded-xl border p-3 transition-colors',
                post.rowStatus === 'active'
                  ? 'border-brass/40 bg-brass/5'
                  : post.rowStatus === 'done'
                    ? 'border-line bg-raised'
                    : post.rowStatus === 'error'
                      ? 'border-ember/40 bg-ember/5'
                      : 'border-line/60 bg-well/30',
              ].join(' ')}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-mono text-[10px] uppercase tracking-wide text-fog">
                  {String(i + 1).padStart(2, '0')}
                  {post.caption ? ` · ${post.caption}` : post.category ? ` · ${post.category}` : ''}
                  {post.words ? ` · ${post.words} words` : ''}
                </p>
                <span
                  className={[
                    'shrink-0 font-mono text-[9px] uppercase tracking-[0.14em]',
                    post.rowStatus === 'done'
                      ? 'text-phosphor'
                      : post.rowStatus === 'active'
                        ? 'text-brass'
                        : post.rowStatus === 'error'
                          ? 'text-ember'
                          : 'text-fog',
                  ].join(' ')}
                >
                  {post.rowStatus}
                </span>
              </div>
              {post.caption ? (
                <p className="mt-1 font-mono text-[11px] text-brass">{post.caption}</p>
              ) : null}
              {post.captions?.length > 1 ? (
                <p className="mt-0.5 font-mono text-[10px] text-fog">{post.captions.slice(1).join(' · ')}</p>
              ) : null}
              {post.text ? (
                <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-mist">{post.text}</p>
              ) : post.error ? (
                <p className="mt-1 text-xs text-ember">{post.error}</p>
              ) : (
                <p className="mt-1 text-xs text-fog">Waiting…</p>
              )}
            </li>
          ))}
        </ul>
      ) : !busy ? (
        <div className="rounded-xl border border-dashed border-lineStrong bg-well/30 px-6 py-10 text-center">
          <p className="font-mono text-sm text-mist">No batch yet</p>
          <p className="mt-1 text-[12px] text-fog">
            Generate unique notes, render 7s videos, and optionally post each to Discord.
          </p>
        </div>
      ) : null}
      </div>
    </div>
  )
}
