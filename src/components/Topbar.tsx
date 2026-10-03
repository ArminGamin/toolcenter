import { useClock } from '../hooks/useClock'
import { AppLogo } from './AppLogo'
import type { Tool } from '../types'
import { BusinessProfileSwitcher } from './BusinessProfileSwitcher'
import { AppearanceControls } from './AppearanceControls'

interface TopbarProps {
  tools: Tool[]
  currentId: string | null
  marketsOpen?: boolean
  notesOpen?: boolean
  outreachOpen?: boolean
  pipelineOpen?: boolean
  seoBlogOpen?: boolean
  groupPosterOpen?: boolean
  redditCommenterOpen?: boolean
  ugcSlidesOpen?: boolean
  oneShotOpen?: boolean
  bridgeOk: boolean | null
  /** Ollama HTTP reachability from runtime-status */
  ollamaOk?: boolean | null
  onlineCount: number
  onHome: () => void
  onOpenPalette: () => void
  onOpenVault: () => void
  onOpenFolders?: () => void
  onOpenLogs: () => void
  onStopAll: () => void
  stopAllBusy?: boolean
  onBackup: () => void
  backupBusy?: boolean
  /** Markets tab only - force-refresh desk/quotes/chips */
  onMarketsRefresh?: () => void
  marketsRefreshing?: boolean
  marketsRefreshLabel?: string | null
}

export function Topbar({
  tools,
  currentId,
  marketsOpen,
  notesOpen,
  outreachOpen,
  pipelineOpen,
  seoBlogOpen,
  groupPosterOpen,
  redditCommenterOpen,
  ugcSlidesOpen,
  oneShotOpen,
  bridgeOk,
  ollamaOk = null,
  onlineCount,
  onHome,
  onOpenPalette,
  onOpenVault,
  onOpenFolders,
  onOpenLogs,
  onStopAll,
  stopAllBusy,
  onBackup,
  backupBusy,
  onMarketsRefresh,
  marketsRefreshing,
  marketsRefreshLabel,
}: TopbarProps) {
  const clock = useClock()
  const current = currentId ? tools.find((t) => t.id === currentId) : null
  const menuRef = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) menuRef.current?.removeAttribute('open')
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])
  function menuAction(action: () => void) {
    menuRef.current?.removeAttribute('open')
    action()
  }

  return (
    <header className="app-titlebar relative z-30 flex min-h-14 shrink-0 flex-wrap items-center gap-3 border-b border-line bg-ink/90 px-3 py-2 sm:px-6 max-[860px]:gap-x-2 max-[860px]:gap-y-2">
      <div className="flex min-w-0 flex-1 items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.14em]">
        <button
          type="button"
          onClick={onHome}
          aria-label="Tool Center home"
          className="flex shrink-0 items-center gap-2 text-snow transition-colors hover:text-brass"
        >
          <span className="flex h-7 w-7 shrink-0 overflow-hidden rounded-xl">
            <AppLogo size={28} className="h-full w-full rounded-xl" />
          </span>
          <span className="max-[860px]:hidden">ToolsAI</span>
        </button>
        <span className="text-fog max-[860px]:hidden">/</span>
        <span className="truncate normal-case tracking-normal text-mist" title={`${onlineCount} local tools running`}>
          {marketsOpen
            ? 'Markets'
            : notesOpen
              ? 'Notes'
            : outreachOpen
              ? 'Outreach'
              : pipelineOpen
                ? 'Promo Pipeline'
                : seoBlogOpen
                  ? 'SEO Blog'
                  : groupPosterOpen
                    ? 'Group Poster'
                    : redditCommenterOpen
                      ? 'Reddit Commenter'
                      : ugcSlidesOpen
                        ? 'UGC Slides'
                        : oneShotOpen
                          ? 'One-Shot'
                        : current
                          ? current.name
                          : 'Tool Center'}
        </span>
      </div>

      <BusinessProfileSwitcher />
      <div className="flex shrink-0 flex-wrap items-center gap-2 whitespace-nowrap max-[1400px]:w-full max-[1400px]:justify-end max-[860px]:justify-between max-[400px]:gap-1">
        <span
          className={[
            'hidden items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider min-[1100px]:inline-flex max-[860px]:inline-flex',
            bridgeOk
              ? 'border-phosphor/30 bg-phosphor/10 text-phosphor'
              : bridgeOk === false
                ? 'border-ember/30 bg-ember/10 text-ember'
                : 'border-lineStrong text-fog',
          ].join(' ')}
          title={
            bridgeOk
              ? 'Local launch bridge is online'
              : 'Start with npm run dev to launch tools'
          }
        >
          <span
            className={[
              'h-1.5 w-1.5 rounded-full',
              bridgeOk ? 'bg-phosphor' : bridgeOk === false ? 'bg-ember' : 'bg-fog',
            ].join(' ')}
          />
          <span className="max-[360px]:hidden">{bridgeOk ? 'Bridge on' : bridgeOk === false ? 'Bridge off' : 'Bridge…'}</span>
          <span className="hidden max-[360px]:inline">Bridge</span>
        </span>

        <span
          className={[
            'hidden items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider min-[1100px]:inline-flex max-[860px]:inline-flex',
            ollamaOk
              ? 'border-phosphor/30 bg-phosphor/10 text-phosphor'
              : ollamaOk === false
                ? 'border-ember/30 bg-ember/10 text-ember'
                : 'border-lineStrong text-fog',
          ].join(' ')}
          title={
            ollamaOk
              ? 'Ollama HTTP is reachable (local models API)'
              : ollamaOk === false
                ? 'Ollama offline - start it from the Ollama tool or ollama serve'
                : 'Checking Ollama…'
          }
        >
          <span
            className={[
              'h-1.5 w-1.5 rounded-full',
              ollamaOk ? 'bg-phosphor' : ollamaOk === false ? 'bg-ember' : 'bg-fog',
            ].join(' ')}
          />
          <span className="max-[360px]:hidden">{ollamaOk ? 'Ollama on' : ollamaOk === false ? 'Ollama off' : 'Ollama…'}</span>
          <span className="hidden max-[360px]:inline">Ollama</span>
        </span>

        <span
          className="hidden font-mono text-[11px] tabular-nums text-mist min-[1600px]:inline"
          title="Local date and time"
        >
          {clock}
        </span>

        {marketsOpen && onMarketsRefresh && (
          <button
            type="button"
            onClick={onMarketsRefresh}
            disabled={marketsRefreshing}
            title="Force-refresh Markets desk, quotes, and source-health chips"
            className="hidden rounded-lg border border-brass/40 bg-brass/15 px-2.5 py-1.5 font-mono text-[11px] text-brass transition hover:border-brass/70 hover:bg-brass/25 disabled:cursor-wait disabled:opacity-60 min-[1100px]:inline-flex"
          >
            {marketsRefreshing
              ? 'Refreshing…'
              : marketsRefreshLabel
                ? `Refresh · ${marketsRefreshLabel}`
                : 'Refresh'}
          </button>
        )}

        <button
          type="button"
          onClick={onOpenLogs}
          className="hidden rounded-lg border border-lineStrong bg-raised px-2.5 py-1.5 font-mono text-[11px] text-mist transition hover:border-brass/40 hover:bg-lift hover:text-snow min-[1100px]:inline-flex"
          title="Live logs + saved failure packs"
        >
          Logs
        </button>

        <button
          type="button"
          onClick={onStopAll}
          disabled={stopAllBusy || bridgeOk === false}
          className="hidden rounded-lg border border-ember/40 bg-ember/10 px-2.5 py-1.5 font-mono text-[11px] text-ember transition hover:border-ember/70 hover:bg-ember/20 disabled:opacity-40 min-[1100px]:inline-flex"
          title="Force-close every running tool"
        >
          {stopAllBusy ? 'Stopping…' : 'Stop all'}
        </button>

        <AppearanceControls />
        <details ref={menuRef} className="relative" onKeyDown={(event) => {
          if (event.key === 'Escape' && menuRef.current?.open) {
            event.preventDefault()
            event.stopPropagation()
            menuRef.current.removeAttribute('open')
            menuRef.current.querySelector('summary')?.focus()
          }
        }}>
          <summary className="cursor-pointer list-none rounded-lg border border-lineStrong bg-raised px-2.5 py-2 font-mono text-[11px] text-mist transition hover:bg-lift hover:text-snow">More</summary>
          <div className="absolute right-0 top-[calc(100%+8px)] z-[120] w-64 max-w-[calc(100vw-32px)] whitespace-normal rounded-xl border border-lineStrong bg-panel p-1.5 shadow-panel">
            <div className="px-2 py-2 text-xs text-fog min-[1100px]:hidden">Bridge {bridgeOk ? 'on' : bridgeOk === false ? 'off' : 'checking'} · Ollama {ollamaOk ? 'on' : ollamaOk === false ? 'off' : 'checking'}</div>
            <button type="button" onClick={() => menuAction(onOpenLogs)} className="w-full rounded-lg px-3 py-2 text-left text-sm text-mist hover:bg-lift min-[1100px]:hidden">Live logs</button>
            {marketsOpen && onMarketsRefresh && <button type="button" onClick={() => menuAction(onMarketsRefresh)} disabled={marketsRefreshing} className="w-full rounded-lg px-3 py-2 text-left text-sm text-brass hover:bg-lift disabled:opacity-40 min-[1100px]:hidden">{marketsRefreshing ? 'Refreshing…' : 'Refresh Markets'}</button>}
            <button type="button" onClick={() => menuAction(onOpenVault)} className="w-full rounded-lg px-3 py-2 text-left text-sm text-mist hover:bg-lift">Credentials vault</button>
            {onOpenFolders ? <button type="button" onClick={() => menuAction(onOpenFolders)} className="w-full rounded-lg px-3 py-2 text-left text-sm text-mist hover:bg-lift">Folders</button> : null}
            <button type="button" onClick={() => menuAction(onBackup)} disabled={backupBusy} className="w-full rounded-lg px-3 py-2 text-left text-sm text-mist hover:bg-lift disabled:opacity-40">{backupBusy ? 'Backing up…' : 'Back up workspace'}</button>
            <button type="button" onClick={() => menuAction(onStopAll)} disabled={stopAllBusy || bridgeOk === false} className="w-full rounded-lg px-3 py-2 text-left text-sm text-ember hover:bg-ember/10 disabled:opacity-40 min-[1100px]:hidden">{stopAllBusy ? 'Stopping…' : 'Stop all tools'}</button>
            <div className="mt-1 border-t border-line px-3 py-2 font-mono text-[10px] text-fog">{clock}</div>
          </div>
        </details>

        <button
          type="button"
          aria-label="Search tools and workspace"
          onClick={onOpenPalette}
          className="flex items-center gap-2 rounded-lg border border-lineStrong bg-raised px-2.5 py-1.5 font-mono text-[11px] text-mist transition hover:border-brass/40 hover:bg-lift hover:text-snow"
        >
          <svg
            viewBox="0 0 24 24"
            width="13"
            height="13"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span className="max-[360px]:hidden">Search</span>
          <kbd className="rounded bg-lift px-1.5 py-px text-[10px] text-fog max-[400px]:hidden">/</kbd>
        </button>
      </div>
    </header>
  )
}
import { useEffect, useRef } from 'react'
