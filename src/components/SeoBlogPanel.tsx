import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  abortSeoBlogRun,
  acceptAllSeoBlogDrafts,
  acceptSeoBlogDraft,
  clearSeoBlogRun,
  fetchSeoBlogState,
  rejectAllSeoBlogDrafts,
  rejectSeoBlogDraft,
  saveSeoBlogSettings,
  startSeoBlogRun,
  type SeoBlogSettings,
  type SeoBlogState,
} from '../lib/seoBlog'
import { SeoBlogStepLoader } from './SeoBlogStepLoader'
import { PostsSection } from './seo-blog/PostsSection'
import { ReviewSection } from './seo-blog/ReviewSection'
import { RunSection } from './seo-blog/RunSection'
import { SettingsSection } from './seo-blog/SettingsSection'
import { Btn, Stat } from './seo-blog/seo-blog-ui'
import { statusTone } from './seo-blog/seo-blog-status'
import { SaveChangesBar, SaveChangesFooter } from './ui/SaveChangesBar'
import { AutomationRunBar } from './ui/AutomationRunBar'
import { LoadingPanel, ErrorRetryCallout } from './ui/primitives'
import { BridgeOfflinePanel } from './ui/bridge-offline'

type StageTab = 'run' | 'review' | 'posts' | 'settings'

export function SeoBlogPanel({ active = true }: { active?: boolean }) {
  const [state, setState] = useState<SeoBlogState | null>(null)
  const [settings, setSettings] = useState<SeoBlogSettings | null>(null)
  const settingsDirtyRef = useRef(false)
  const [settingsDirty, setSettingsDirty] = useState(false)
  const settingsRef = useRef<SeoBlogSettings | null>(null)
  const [tab, setTab] = useState<StageTab>('run')
  const [busy, setBusy] = useState(false)
  const [flashMsg, setFlashMsg] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const [expanded, setExpanded] = useState<string | null>(null)

  const refresh = useCallback(async (opts?: { syncSettings?: boolean }) => {
    try {
      const next = await fetchSeoBlogState()
      if (!next) {
        setLoadError('Bridge offline')
        return
      }
      if (!next.ok && next.message) {
        setLoadError(next.message)
        return
      }
      setLoadError(null)
      setState(next)
      if (next.settings && (opts?.syncSettings || !settingsDirtyRef.current)) {
        setSettings(next.settings)
        settingsRef.current = next.settings
        if (opts?.syncSettings) {
          settingsDirtyRef.current = false
          setSettingsDirty(false)
        }
      }
      if ((next.draftCount ?? 0) > 0 && next.run?.status === 'done') {
        setTab((t) => (t === 'run' ? 'review' : t))
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    if (!active) return
    void refresh()
    const id = window.setInterval(() => void refresh(), 1500)
    return () => window.clearInterval(id)
  }, [active, refresh])

  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [active])

  function flash(msg: string) {
    setFlashMsg(msg)
    window.setTimeout(() => setFlashMsg(null), 2800)
  }

  async function onStart() {
    if (!settings) return
    if (settingsDirty) await saveChanges()
    setBusy(true)
    const res = await startSeoBlogRun(settings)
    setBusy(false)
    flash(res.message)
    setTab('run')
    void refresh()
  }

  function stageSettings(next: SeoBlogSettings) {
    setSettings(next)
    settingsRef.current = next
    settingsDirtyRef.current = true
    setSettingsDirty(true)
  }

  async function saveChanges() {
    if (!settingsRef.current) return
    setBusy(true)
    const res = await saveSeoBlogSettings(settingsRef.current)
    setBusy(false)
    if (res.ok && res.settings) {
      setSettings(res.settings)
      settingsRef.current = res.settings
      settingsDirtyRef.current = false
      setSettingsDirty(false)
      flash('Changes saved')
      void refresh({ syncSettings: true })
    } else {
      flash(res.message || 'Save failed')
    }
  }

  async function onAccept(slug: string) {
    setBusy(true)
    const res = await acceptSeoBlogDraft(slug)
    setBusy(false)
    flash(res.message)
    void refresh()
  }

  async function onReject(slug: string) {
    setBusy(true)
    const res = await rejectSeoBlogDraft(slug)
    setBusy(false)
    flash(res.message)
    void refresh()
  }

  async function onAcceptAll() {
    setBusy(true)
    const res = await acceptAllSeoBlogDrafts()
    setBusy(false)
    flash(res.message)
    void refresh()
  }

  async function onRejectAll() {
    if (!window.confirm(`Reject all ${drafts.length} draft(s)? This cannot be undone.`)) return
    setBusy(true)
    const res = await rejectAllSeoBlogDrafts()
    setBusy(false)
    flash(res.message)
    void refresh()
  }

  const run = state?.run
  const drafts = state?.drafts || []
  const elapsedMs =
    run?.startedAt != null ? (run.finishedAt ?? now) - run.startedAt : null

  const counts = useMemo(
    () => ({
      posts: state?.postCount ?? 0,
      written: run?.posts?.length ?? 0,
      drafts: state?.draftCount ?? drafts.length,
    }),
    [state, run, drafts.length],
  )

  if (loadError && !state) {
    const isBridge = loadError.toLowerCase().includes('bridge')
    return (
      <div className="flex h-full items-center justify-center px-4">
        {isBridge ? (
          <BridgeOfflinePanel compact onRetry={() => void refresh()} />
        ) : (
          <ErrorRetryCallout title="SEO Blog could not load" body={loadError} onRetry={() => void refresh()} />
        )}
      </div>
    )
  }

  if (!state || !settings) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingPanel title="Loading SEO Blog…" />
      </div>
    )
  }

  return (
    <div className="tool-workspace flex flex-col gap-6">
      <header className="shrink-0 overflow-hidden rounded-2xl border border-lineStrong bg-panel shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-lineStrong px-4 py-3 sm:px-5">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-brass">
              SEO Blog Pipeline
            </p>
            <h1 className="mt-0.5 font-sans text-lg font-semibold tracking-tight text-snow sm:text-xl">
              {state.engine === 'kaledu' ? 'Kalėdų Kampelis · SEO writer' : 'Mission control'}
            </h1>
            <p className={`mt-1 font-mono text-[11px] ${statusTone(run?.status || 'idle')}`}>
              {(run?.status || 'idle').toUpperCase()}
              {run?.stage && run.stage !== 'idle' ? ` · ${run.stage}` : ''}
              {run?.message ? ` - ${run.message.slice(0, 160)}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SaveChangesBar compact dirty={settingsDirty} busy={busy} onSave={() => void saveChanges()} />
            <label className="flex items-center gap-2 rounded-lg border border-lineStrong bg-well px-2.5 py-1.5 font-mono text-[11px] text-fog">
              Blogs
              <input
                type="number"
                min={1}
                max={10}
                value={settings.postsPerRun}
                disabled={busy || run?.status === 'running' || state.childRunning}
                onChange={(e) => {
                  const n = Math.max(1, Math.min(10, Number(e.target.value) || 1))
                  void stageSettings({ ...settings, postsPerRun: n })
                }}
                className="w-12 rounded border border-lineStrong bg-panel px-1.5 py-0.5 text-center text-snow"
                title="How many blogs to write this run (1-10)"
              />
            </label>
            <Btn
              primary
              onClick={() => void onStart()}
              disabled={busy || run?.status === 'running' || state.childRunning}
            >
              Start
            </Btn>
            <Btn
              danger
              onClick={() =>
                void abortSeoBlogRun().then((r) => {
                  flash(r.message)
                  void refresh()
                })
              }
              disabled={busy || (!state.childRunning && run?.status !== 'running')}
            >
              Abort
            </Btn>
            <Btn
              onClick={() =>
                void clearSeoBlogRun().then((r) => {
                  flash(r.message)
                  void refresh()
                })
              }
              disabled={busy || state.childRunning}
            >
              Clear run
            </Btn>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 bg-well px-4 py-3 sm:px-5">
          <div className="cc-tabs" role="tablist">
          {(['run', 'review', 'posts', 'settings'] as StageTab[]).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={tab === s}
              onClick={() => setTab(s)}
              className="cc-tab capitalize"
            >
              {s}
              {s === 'review' && counts.drafts > 0 ? ` (${counts.drafts})` : ''}
            </button>
          ))}
          </div>
          <div className="grid min-w-[min(100%,420px)] flex-1 grid-cols-3 gap-2 min-[1180px]:max-w-[560px]">
            <Stat label={state.engine === 'kaledu' ? 'Saved articles' : 'Published'} value={String(counts.posts)} />
            <Stat label="This run" value={String(counts.written)} />
            <Stat label="Pending review" value={String(counts.drafts)} />
          </div>
        </div>
      </header>


      {flashMsg ? (
        <p className="font-mono text-[11px] text-brass" role="status">
          {flashMsg}
        </p>
      ) : null}

      <div className="tool-workspace-body fit-body grid items-start gap-6 min-[1180px]:grid-cols-[minmax(0,1fr)_360px]">
        <div className="fit-scroll min-w-0 rounded-2xl border border-lineStrong bg-panel p-5 sm:p-6">
          <div className="mb-5">
          <AutomationRunBar
            run={{
              id: run?.id || '',
              status: (run?.status || 'idle') as import('../lib/automation-run').AutomationStatus,
              message: run?.message,
              sent: run?.posts?.length ?? 0,
              total: settings.postsPerRun,
              workerRunning: state.childRunning,
            }}
          />
          </div>
          {tab === 'run' && (
            <RunSection
              run={run}
              draftCount={counts.drafts}
              onOpenReview={() => setTab('review')}
            />
          )}
          {tab === 'review' && (
            <ReviewSection
              drafts={drafts}
              acceptLabel={state.engine === 'kaledu' && !settings.autoPush ? 'Accept → save to store' : 'Accept → publish'}
              busy={busy}
              expanded={expanded}
              onToggleExpanded={(slug) => setExpanded((s) => (s === slug ? null : slug))}
              onAccept={(slug) => void onAccept(slug)}
              onReject={(slug) => void onReject(slug)}
              onAcceptAll={() => void onAcceptAll()}
              onRejectAll={() => void onRejectAll()}
            />
          )}
          {tab === 'posts' && (
            <PostsSection
              postCount={state.postCount}
              slugs={state.slugs}
              publishedPosts={state.publishedPosts}
              siteUrl={state.siteUrl}
              localContent={state.engine === 'kaledu'}
            />
          )}
          {tab === 'settings' && (
            <div className="settings-preserve">
            <SettingsSection
              settings={settings}
              kaledu={state.engine === 'kaledu'}
              onPersist={(next) => stageSettings(next)}
            />
            </div>
          )}
        </div>

        <aside className="fit-scroll min-w-0">
          <SeoBlogStepLoader
            stage={run?.stage}
            status={run?.status}
            progressPct={run?.progressPct || 0}
            postCount={run?.posts?.length || 0}
            postsTarget={settings.postsPerRun}
            elapsedMs={elapsedMs}
          />
        </aside>
      </div>
      <SaveChangesFooter dirty={settingsDirty} busy={busy} onSave={() => void saveChanges()} />
    </div>
  )
}
