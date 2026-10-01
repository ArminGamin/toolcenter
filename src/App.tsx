import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CommandPalette } from './components/CommandPalette'
import { GlobalLogsModal } from './components/GlobalLogsModal'
import { ToolHome } from './components/ToolHome'
import { Rail } from './components/Rail'
import { BridgeBlocker } from './components/BridgeBlocker'
import { Topbar } from './components/Topbar'
import { VaultModal } from './components/VaultModal'
import { FoldersModal } from './components/FoldersModal'
import { usePersistedTools } from './hooks/usePersistedTools'
import { useRailOrder } from './hooks/useRailOrder'
import { useAppNavigation, type AppModule } from './hooks/useAppNavigation'
import { createBackup, fetchRuntimeStatus, launchTool, stopAllTools } from './lib/launch'
import { fetchHubSummary, railRunningFromHub, type HubModuleSnapshot } from './lib/hub'
import { AlertBanner } from './components/AlertBanner'
import { buildQuickActions, runQuickAction } from './lib/quick-actions'
import { setNavTarget } from './lib/nav-target'
import type { UnifiedSearchHit } from './lib/unified-search'
import type { Tool } from './types'
import { BUSINESS_PROFILE_CHANGED_EVENT } from './lib/business-profiles'

const MarketsPanel = lazy(() =>
  import('./components/MarketsPanel').then((m) => ({ default: m.MarketsPanel })),
)
const NotesPanel = lazy(() =>
  import('./components/NotesPanel').then((m) => ({ default: m.NotesPanel })),
)
const OutreachPanel = lazy(() =>
  import('./components/OutreachPanel').then((m) => ({ default: m.OutreachPanel })),
)
const SeoBlogPanel = lazy(() =>
  import('./components/SeoBlogPanel').then((m) => ({ default: m.SeoBlogPanel })),
)
const GroupPosterPanel = lazy(() =>
  import('./components/GroupPosterPanel').then((m) => ({ default: m.GroupPosterPanel })),
)
const RedditCommenterPanel = lazy(() =>
  import('./components/RedditCommenterPanel').then((m) => ({ default: m.RedditCommenterPanel })),
)
const UgcSlidesPanel = lazy(() =>
  import('./components/UgcSlidesPanel').then((m) => ({ default: m.UgcSlidesPanel })),
)
const OneShotPanel = lazy(() =>
  import('./components/OneShotPanel').then((m) => ({ default: m.OneShotPanel })),
)
const PipelinePanel = lazy(() =>
  import('./components/PipelinePanel').then((m) => ({ default: m.PipelinePanel })),
)
const ToolPanel = lazy(() =>
  import('./components/ToolPanel').then((m) => ({ default: m.ToolPanel })),
)

/** Orbit tool overrides (hidden/renamed) — scoped per business profile in usePersistedTools. */
const TOOLS_STORAGE_BASE = 'control-center-tools-v9'

import { LoadingPanel } from './components/ui/primitives'

function PanelFallback() {
  return (
    <div className="flex h-full items-center justify-center p-4">
      <LoadingPanel title="Loading module…" />
    </div>
  )
}

/** Built-in orbit tools that are always available (no external process). */
const ORBIT_ALWAYS_ONLINE = new Set(['ugc_slides', 'one_shot'])

/** Orbit tools that open a built-in panel instead of the external Tool panel. */
const ORBIT_BUILTIN_TOOLS: Record<string, AppModule> = {
  reddit_commenter: 'reddit-commenter',
  ugc_slides: 'ugc-slides',
  one_shot: 'one-shot',
}

export default function App() {
  const [profileRevision, setProfileRevision] = useState(0)
  const [tools, setTools] = usePersistedTools(TOOLS_STORAGE_BASE)
  const { order: railOrder, reorder: reorderRail, addItem: addToRail, removeItem: removeFromRail, isOnRail, isRailModuleId, isDirty: railDirty, save: saveRail } = useRailOrder()
  const nav = useAppNavigation(null)
  const [marketsMounted, setMarketsMounted] = useState(false)
  const [outreachMounted, setOutreachMounted] = useState(false)
  const [seoBlogMounted, setSeoBlogMounted] = useState(false)
  const [groupPosterMounted, setGroupPosterMounted] = useState(false)
  const [redditCommenterMounted, setRedditCommenterMounted] = useState(false)
  const [ugcSlidesMounted, setUgcSlidesMounted] = useState(false)
  const [oneShotMounted, setOneShotMounted] = useState(false)
  const [pipelineMounted, setPipelineMounted] = useState(false)
  const [pipelineDue, setPipelineDue] = useState(0)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [vaultOpen, setVaultOpen] = useState(false)
  const [foldersOpen, setFoldersOpen] = useState(false)
  const [logsOpen, setLogsOpen] = useState(false)
  const [logsTab, setLogsTab] = useState<'live' | 'outreach' | 'failures' | 'screenshots' | null>(
    null,
  )
  const [backupBusy, setBackupBusy] = useState(false)
  const [stopAllBusy, setStopAllBusy] = useState(false)
  const [bridgeOk, setBridgeOk] = useState<boolean | null>(null)
  const [ollamaOk, setOllamaOk] = useState<boolean | null>(null)
  const [onlineMap, setOnlineMap] = useState<Record<string, boolean>>({})
  const [hubRunning, setHubRunning] = useState<Record<string, boolean>>({})
  const [hubModules, setHubModules] = useState<HubModuleSnapshot[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const marketsRefreshRef = useRef<(() => Promise<void>) | null>(null)
  const [marketsRefreshing, setMarketsRefreshing] = useState(false)
  const [marketsRefreshLabel, setMarketsRefreshLabel] = useState<string | null>(null)
  const [quickActions, setQuickActions] = useState<{ id: string; label: string }[]>([])

  useEffect(() => {
    const onProfileChanged = () => {
      setOnlineMap({})
      setHubRunning({})
      setHubModules([])
      setQuickActions([])
      setPipelineDue(0)
      setProfileRevision((value) => value + 1)
    }
    window.addEventListener(BUSINESS_PROFILE_CHANGED_EVENT, onProfileChanged)
    return () => window.removeEventListener(BUSINESS_PROFILE_CHANGED_EVENT, onProfileChanged)
  }, [])

  useEffect(() => {
    let alive = true
    async function tick() {
      const summary = await fetchHubSummary()
      if (!alive || !summary) return
      setQuickActions(buildQuickActions(summary.modules))
      setPipelineDue(summary.followUpsDue ?? 0)
      setHubRunning(railRunningFromHub(summary.modules))
      setHubModules(summary.modules)
    }
    void tick()
    const id = window.setInterval(() => void tick(), paletteOpen ? 2000 : 12000)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [paletteOpen, profileRevision])

  // Fetch panel chunks after the first useful paint. The first click then uses
  // the browser cache instead of waiting on a cold dynamic import, while the
  // initial home screen remains small and interactive.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void Promise.allSettled([
        import('./components/NotesPanel'),
        import('./components/OutreachPanel'),
        import('./components/GroupPosterPanel'),
        import('./components/RedditCommenterPanel'),
        import('./components/PipelinePanel'),
        import('./components/SeoBlogPanel'),
        import('./components/UgcSlidesPanel'),
        import('./components/OneShotPanel'),
        import('./components/MarketsPanel'),
      ])
    }, 900)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (nav.marketsOpen) setMarketsMounted(true)
    if (nav.outreachOpen) setOutreachMounted(true)
    if (nav.seoBlogOpen) setSeoBlogMounted(true)
    if (nav.groupPosterOpen) setGroupPosterMounted(true)
    if (nav.redditCommenterOpen) setRedditCommenterMounted(true)
    if (nav.ugcSlidesOpen) setUgcSlidesMounted(true)
    if (nav.oneShotOpen) setOneShotMounted(true)
    if (nav.pipelineOpen) setPipelineMounted(true)
  }, [nav.marketsOpen, nav.outreachOpen, nav.seoBlogOpen, nav.groupPosterOpen, nav.redditCommenterOpen, nav.ugcSlidesOpen, nav.oneShotOpen, nav.pipelineOpen])

  const onMarketsRefreshBinding = useCallback(
    (
      binding: {
        refresh: () => Promise<void>
        refreshing: boolean
        lastLabel: string | null
      } | null,
    ) => {
      marketsRefreshRef.current = binding?.refresh ?? null
      setMarketsRefreshing(Boolean(binding?.refreshing))
      setMarketsRefreshLabel(binding?.lastLabel ?? null)
    },
    [],
  )

  const current = nav.toolId ? tools.find((t) => t.id === nav.toolId) : null
  const onlineCount = useMemo(
    () => tools.filter((t) => !t.removed && onlineMap[t.id] && !ORBIT_ALWAYS_ONLINE.has(t.id)).length,
    [tools, onlineMap],
  )

  const runningMap = useMemo(
    () => ({ ...onlineMap, ...hubRunning }),
    [onlineMap, hubRunning],
  )

  const orbitOnlineMap = useMemo(() => {
    const next = { ...onlineMap }
    for (const id of ORBIT_ALWAYS_ONLINE) next[id] = true
    return next
  }, [onlineMap])

  function handleUnifiedSearch(hit: UnifiedSearchHit) {
    if (hit.module === 'logs') {
      setLogsTab(hit.kind === 'error' ? 'failures' : 'live')
      setLogsOpen(true)
      return
    }
    setNavTarget({ module: hit.module, id: hit.id, kind: hit.kind })
    if (hit.module === 'notes' || hit.module === 'pipeline' || hit.module === 'outreach' || hit.module === 'seo-blog' || hit.module === 'markets') {
      nav.openModule(hit.module as AppModule)
    }
  }

  function handleOrbitSelect(id: string) {
    const builtin = ORBIT_BUILTIN_TOOLS[id]
    if (builtin) {
      nav.openModule(builtin)
      return
    }
    nav.selectTool(id)
  }

  function handleOrbitLaunch(id: string) {
    const builtin = ORBIT_BUILTIN_TOOLS[id]
    if (builtin) {
      nav.openModule(builtin)
      return
    }
    void quickLaunch(id)
  }

  function updateTool(next: Tool) {
    setTools((prev) => prev.map((t) => (t.id === next.id ? next : t)))
  }

  async function quickLaunch(id: string) {
    const result = await launchTool(id)
    setToast(result.message)
    if (result.ok) {
      setOnlineMap((m) => ({ ...m, [id]: true }))
    }
    window.setTimeout(() => setToast(null), 2800)
  }

  async function onBackup() {
    setBackupBusy(true)
    const result = await createBackup()
    setBackupBusy(false)
    setToast(result.path ? `${result.message}: ${result.path}` : result.message)
    window.setTimeout(() => setToast(null), 4500)
  }

  async function onStopAll() {
    setStopAllBusy(true)
    const result = await stopAllTools()
    setStopAllBusy(false)
    setToast(result.message)
    setOnlineMap({})
    window.setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    let alive = true
    let inFlight = false
    let failStreak = 0
    async function tick() {
      if (inFlight) return
      inFlight = true
      try {
        const res = await fetchRuntimeStatus()
        if (!alive) return
        setBridgeOk(res.ok)
        if (res.ok) {
          const next = Boolean(res.ollama || res.tools?.ollama)
          if (next) {
            failStreak = 0
            setOllamaOk(true)
          } else {
            failStreak += 1
            if (failStreak >= 2) setOllamaOk(false)
          }
          if (res.tools) setOnlineMap(res.tools)
        } else {
          setOllamaOk(null)
        }
      } finally {
        inFlight = false
      }
    }
    void tick()
    const id = window.setInterval(() => void tick(), 5000)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented) return
      const el = document.activeElement as HTMLElement | null
      const typing =
        el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.isContentEditable ||
          el.tagName === 'SELECT')

      if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault()
        setPaletteOpen(true)
        return
      }

      if (e.key === 'Escape') {
        if (logsOpen) {
          setLogsOpen(false)
          return
        }
        if (vaultOpen) {
          setVaultOpen(false)
          return
        }
        if (paletteOpen) {
          setPaletteOpen(false)
          return
        }
        if (!nav.isHome && !typing) nav.goHome()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [paletteOpen, nav, vaultOpen, logsOpen])

  const showHome = nav.isHome
  const showTool = !nav.isHome && nav.module === 'tool' && current

  if (bridgeOk === false) {
    return (
      <div className="app-noise flex h-screen w-screen items-center justify-center bg-ink">
        <BridgeBlocker onRetry={() => window.location.reload()} />
      </div>
    )
  }

  return (
    <div className="app-noise flex h-screen w-screen max-[860px]:flex-col">
      <div className="contents" inert={paletteOpen || vaultOpen || logsOpen || foldersOpen}>
      <Rail
        order={railOrder}
        reorder={reorderRail}
        removeItem={removeFromRail}
        isRailModuleId={isRailModuleId}
        isDirty={railDirty}
        onSaveRail={saveRail}
        tools={tools}
        activeToolId={nav.toolId}
        runningMap={runningMap}
        marketsOpen={nav.marketsOpen}
        notesOpen={nav.notesOpen}
        outreachOpen={nav.outreachOpen}
        pipelineOpen={nav.pipelineOpen}
        seoBlogOpen={nav.seoBlogOpen}
        groupPosterOpen={nav.groupPosterOpen}
        redditCommenterOpen={nav.redditCommenterOpen}
        ugcSlidesOpen={nav.ugcSlidesOpen}
        oneShotOpen={nav.oneShotOpen}
        pipelineDue={pipelineDue}
        onHome={nav.goHome}
        onMarkets={() => nav.openModule('markets')}
        onNotes={() => nav.openModule('notes')}
        onOutreach={() => nav.openModule('outreach')}
        onPipeline={() => nav.openModule('pipeline')}
        onSeoBlog={() => nav.openModule('seo-blog')}
        onGroupPoster={() => nav.openModule('group-poster')}
        onRedditCommenter={() => nav.openModule('reddit-commenter')}
        onUgcSlides={() => nav.openModule('ugc-slides')}
        onOneShot={() => nav.openModule('one-shot')}
        onToolSelect={handleOrbitSelect}
      />

      <div className="flex min-w-0 flex-1 flex-col max-[860px]:order-1 max-[860px]:flex-none max-[860px]:h-[calc(100dvh-72px)]">
        <Topbar
          tools={tools}
          currentId={
            nav.marketsOpen || nav.notesOpen || nav.outreachOpen || nav.pipelineOpen || nav.seoBlogOpen || nav.groupPosterOpen || nav.redditCommenterOpen || nav.ugcSlidesOpen || nav.oneShotOpen
              ? null
              : nav.toolId
          }
          marketsOpen={nav.marketsOpen}
          notesOpen={nav.notesOpen}
          outreachOpen={nav.outreachOpen}
          pipelineOpen={nav.pipelineOpen}
          seoBlogOpen={nav.seoBlogOpen}
          groupPosterOpen={nav.groupPosterOpen}
          redditCommenterOpen={nav.redditCommenterOpen}
          ugcSlidesOpen={nav.ugcSlidesOpen}
          oneShotOpen={nav.oneShotOpen}
          bridgeOk={bridgeOk}
          ollamaOk={ollamaOk}
          onlineCount={onlineCount}
          onHome={nav.goHome}
          onOpenPalette={() => setPaletteOpen(true)}
          onOpenVault={() => setVaultOpen(true)}
          onOpenFolders={() => setFoldersOpen(true)}
          onOpenLogs={() => {
            setLogsTab(null)
            setLogsOpen(true)
          }}
          onStopAll={() => void onStopAll()}
          stopAllBusy={stopAllBusy}
          onBackup={() => void onBackup()}
          backupBusy={backupBusy}
          onMarketsRefresh={
            nav.marketsOpen
              ? () => {
                  void marketsRefreshRef.current?.()
                }
              : undefined
          }
          marketsRefreshing={marketsRefreshing}
          marketsRefreshLabel={marketsRefreshLabel}
        />
        <AlertBanner modules={hubModules} />

        <main key={profileRevision} className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <section
            className={[
              'absolute inset-0 grid min-h-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] overflow-hidden px-4 py-3 sm:px-6 sm:py-4 max-[860px]:px-3 max-[860px]:pt-3',
              'transition-[opacity,transform] duration-[250ms] ease-out',
              showHome
                ? 'pointer-events-auto translate-y-0 opacity-100'
                : 'pointer-events-none translate-y-1.5 opacity-0',
            ].join(' ')}
            aria-hidden={!showHome}
            inert={!showHome}
          >
            <ToolHome
              tools={tools}
              onlineMap={orbitOnlineMap}
              onSelect={handleOrbitSelect}
              onLaunch={handleOrbitLaunch}
              onAddToRail={addToRail}
              onRemoveFromRail={removeFromRail}
              isOnRail={isOnRail}
              onOpenModule={nav.openModule}
              railDirty={railDirty}
              onSaveRail={saveRail}
              onRestoreTool={(id) => {
                const tool = tools.find((entry) => entry.id === id)
                if (tool) updateTool({ ...tool, removed: false })
              }}
            />
          </section>

          <section
            className={[
              'absolute inset-0 overflow-hidden p-6 sm:p-8 max-[860px]:px-4 max-[860px]:pb-4 max-[860px]:pt-4',
              'transition-[opacity,transform] duration-[250ms] ease-out',
              nav.notesOpen
                ? 'pointer-events-auto translate-y-0 opacity-100'
                : 'pointer-events-none translate-y-1.5 opacity-0',
            ].join(' ')}
            aria-hidden={!nav.notesOpen}
            inert={!nav.notesOpen}
          >
            {nav.notesOpen && (
              <Suspense fallback={<PanelFallback />}>
                <NotesPanel />
              </Suspense>
            )}
          </section>

          <section
            className={[
              'absolute inset-0 overflow-hidden p-6 sm:p-8 max-[860px]:px-4 max-[860px]:pb-4 max-[860px]:pt-4',
              'transition-[opacity,transform] duration-[250ms] ease-out',
              nav.outreachOpen
                ? 'pointer-events-auto translate-y-0 opacity-100'
                : 'pointer-events-none translate-y-1.5 opacity-0',
            ].join(' ')}
            aria-hidden={!nav.outreachOpen}
            inert={!nav.outreachOpen}
          >
            {outreachMounted && (
              <Suspense fallback={<PanelFallback />}>
                <OutreachPanel active={nav.outreachOpen} />
              </Suspense>
            )}
          </section>

          <section
            className={[
              'absolute inset-0 overflow-hidden p-6 sm:p-8 max-[860px]:px-4 max-[860px]:pb-4 max-[860px]:pt-4',
              'transition-[opacity,transform] duration-[250ms] ease-out',
              nav.pipelineOpen
                ? 'pointer-events-auto translate-y-0 opacity-100'
                : 'pointer-events-none translate-y-1.5 opacity-0',
            ].join(' ')}
            aria-hidden={!nav.pipelineOpen}
            inert={!nav.pipelineOpen}
          >
            {pipelineMounted && (
              <Suspense fallback={<PanelFallback />}>
                <PipelinePanel active={nav.pipelineOpen} />
              </Suspense>
            )}
          </section>

          <section
            className={[
              'absolute inset-0 overflow-hidden p-6 sm:p-8 max-[860px]:px-4 max-[860px]:pb-4 max-[860px]:pt-4',
              'transition-[opacity,transform] duration-[250ms] ease-out',
              nav.seoBlogOpen
                ? 'pointer-events-auto translate-y-0 opacity-100'
                : 'pointer-events-none translate-y-1.5 opacity-0',
            ].join(' ')}
            aria-hidden={!nav.seoBlogOpen}
            inert={!nav.seoBlogOpen}
          >
            {seoBlogMounted && (
              <Suspense fallback={<PanelFallback />}>
                <SeoBlogPanel active={nav.seoBlogOpen} />
              </Suspense>
            )}
          </section>

          <section
            className={[
              'absolute inset-0 overflow-hidden p-6 sm:p-8 max-[860px]:px-4 max-[860px]:pb-4 max-[860px]:pt-4',
              'transition-[opacity,transform] duration-[250ms] ease-out',
              nav.groupPosterOpen
                ? 'pointer-events-auto translate-y-0 opacity-100'
                : 'pointer-events-none translate-y-1.5 opacity-0',
            ].join(' ')}
            aria-hidden={!nav.groupPosterOpen}
            inert={!nav.groupPosterOpen}
          >
            {groupPosterMounted && (
              <Suspense fallback={<PanelFallback />}>
                <GroupPosterPanel active={nav.groupPosterOpen} />
              </Suspense>
            )}
          </section>

          <section
            className={[
              'absolute inset-0 overflow-hidden p-6 sm:p-8 max-[860px]:px-4 max-[860px]:pb-4 max-[860px]:pt-4',
              'transition-[opacity,transform] duration-[250ms] ease-out',
              nav.redditCommenterOpen
                ? 'pointer-events-auto translate-y-0 opacity-100'
                : 'pointer-events-none translate-y-1.5 opacity-0',
            ].join(' ')}
            aria-hidden={!nav.redditCommenterOpen}
            inert={!nav.redditCommenterOpen}
          >
            {redditCommenterMounted && (
              <Suspense fallback={<PanelFallback />}>
                <RedditCommenterPanel active={nav.redditCommenterOpen} />
              </Suspense>
            )}
          </section>

          <section
            className={[
              'absolute inset-0 overflow-hidden p-6 sm:p-8 max-[860px]:px-4 max-[860px]:pb-4 max-[860px]:pt-4',
              'transition-[opacity,transform] duration-[250ms] ease-out',
              nav.ugcSlidesOpen
                ? 'pointer-events-auto translate-y-0 opacity-100'
                : 'pointer-events-none translate-y-1.5 opacity-0',
            ].join(' ')}
            aria-hidden={!nav.ugcSlidesOpen}
            inert={!nav.ugcSlidesOpen}
          >
            {ugcSlidesMounted && (
              <Suspense fallback={<PanelFallback />}>
                <UgcSlidesPanel active={nav.ugcSlidesOpen} />
              </Suspense>
            )}
          </section>

          <section
            className={[
              'absolute inset-0 overflow-hidden p-6 sm:p-8 max-[860px]:px-4 max-[860px]:pb-4 max-[860px]:pt-4',
              'transition-[opacity,transform] duration-[250ms] ease-out',
              nav.oneShotOpen
                ? 'pointer-events-auto translate-y-0 opacity-100'
                : 'pointer-events-none translate-y-1.5 opacity-0',
            ].join(' ')}
            aria-hidden={!nav.oneShotOpen}
            inert={!nav.oneShotOpen}
          >
            {oneShotMounted && (
              <Suspense fallback={<PanelFallback />}>
                <OneShotPanel active={nav.oneShotOpen} />
              </Suspense>
            )}
          </section>

          <section
            className={[
              'absolute inset-0 overflow-y-auto overflow-x-hidden p-6 sm:p-8 max-[860px]:px-4 max-[860px]:pb-4 max-[860px]:pt-4',
              'transition-[opacity,transform] duration-[250ms] ease-out',
              nav.marketsOpen
                ? 'pointer-events-auto translate-y-0 opacity-100'
                : 'pointer-events-none translate-y-1.5 opacity-0',
            ].join(' ')}
            aria-hidden={!nav.marketsOpen}
            inert={!nav.marketsOpen}
          >
            {marketsMounted && (
              <Suspense fallback={<PanelFallback />}>
                <MarketsPanel
                  active={nav.marketsOpen}
                  onHome={nav.goHome}
                  onRefreshBinding={onMarketsRefreshBinding}
                />
              </Suspense>
            )}
          </section>

          <section
            className={[
              'absolute inset-0 overflow-y-auto overflow-x-hidden p-6 sm:p-8 max-[860px]:px-4 max-[860px]:pb-4 max-[860px]:pt-4',
              'transition-[opacity,transform] duration-[250ms] ease-out',
              showTool
                ? 'pointer-events-auto translate-y-0 opacity-100'
                : 'pointer-events-none translate-y-1.5 opacity-0',
            ].join(' ')}
            aria-hidden={!showTool}
            inert={!showTool}
          >
            {current && (
              <Suspense fallback={<PanelFallback />}>
                <ToolPanel
                  tool={current}
                  online={Boolean(onlineMap[current.id])}
                  bridgeOk={bridgeOk}
                  pinned={isOnRail(current.id)}
                  onTogglePin={() => isOnRail(current.id) ? removeFromRail(current.id) : addToRail(current.id)}
                  onHome={nav.goHome}
                  onUpdate={updateTool}
                />
              </Suspense>
            )}
          </section>
        </main>
      </div>

      </div>

      <CommandPalette
        open={paletteOpen}
        tools={tools}
        onlineMap={onlineMap}
        onClose={() => setPaletteOpen(false)}
        onSelect={(id) => {
          if (ORBIT_BUILTIN_TOOLS[id]) {
            nav.openModule(ORBIT_BUILTIN_TOOLS[id])
            setPaletteOpen(false)
            return
          }
          nav.selectTool(id)
        }}
        quickActions={quickActions}
        onQuickAction={(id) => {
          void runQuickAction(id).then((r) => {
            setToast(r.message)
            window.setTimeout(() => setToast(null), 3200)
          })
        }}
        onOpenModule={(id) => {
          nav.openModule(id as AppModule)
          setPaletteOpen(false)
        }}
        onUnifiedSelect={handleUnifiedSearch}
      />

      <VaultModal open={vaultOpen} onClose={() => setVaultOpen(false)} />
      <FoldersModal open={foldersOpen} onClose={() => setFoldersOpen(false)} tools={tools} />

      <GlobalLogsModal
        open={logsOpen}
        onClose={() => setLogsOpen(false)}
        preferredTab={logsTab || (nav.outreachOpen ? 'outreach' : null)}
      />

      {toast && (
        <div
          className="fixed bottom-6 left-1/2 z-[120] -translate-x-1/2 rounded-xl border border-lineStrong bg-lift px-4 py-2.5 font-mono text-xs text-snow shadow-panel max-[860px]:bottom-20"
          role="status"
        >
          {toast}
        </div>
      )}
    </div>
  )
}
