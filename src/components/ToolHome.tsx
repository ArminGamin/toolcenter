import { readableToolAccent } from '../lib/appearance'
import { useEffect, useMemo, useState } from 'react'
import { ToolIcon } from '../data/icons'
import type { AppModule } from '../hooks/useAppNavigation'
import { buildToolDirectory, DIRECTORY_GROUPS, matchesDirectoryQuery, type DirectoryGroup } from '../lib/tool-directory'
import type { Tool } from '../types'
import { OrbitView } from './OrbitView'

interface ToolHomeProps {
  tools: Tool[]
  onlineMap: Record<string, boolean>
  onSelect: (id: string) => void
  onLaunch: (id: string) => void
  onOpenModule: (module: AppModule) => void
  onAddToRail: (id: string) => void
  onRemoveFromRail: (id: string) => void
  isOnRail: (id: string) => boolean
  railDirty: boolean
  onSaveRail: () => void
  onRestoreTool: (id: string) => void
}

export function ToolHome(props: ToolHomeProps) {
  const { tools, onlineMap, onSelect, onOpenModule, onAddToRail, onRemoveFromRail, isOnRail, railDirty, onSaveRail, onRestoreTool } = props
  const [view, setView] = useState<'directory' | 'orbit'>(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 860px)').matches ? 'directory' : 'orbit',
  )
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'All tools' | 'Pinned' | 'Hidden tools' | DirectoryGroup>('All tools')
  const entries = useMemo(() => buildToolDirectory(tools, true), [tools])
  const hasHidden = entries.some((entry) => entry.hidden)
  const filtered = entries.filter((entry) => matchesDirectoryQuery(entry, query) &&
    (filter === 'Hidden tools' ? entry.hidden : !entry.hidden &&
      (filter === 'All tools' || (filter === 'Pinned' ? isOnRail(entry.railId) : entry.group === filter))))

  useEffect(() => {
    const narrow = window.matchMedia('(max-width: 860px)')
    const change = () => { if (narrow.matches) setView('directory') }
    narrow.addEventListener('change', change)
    return () => narrow.removeEventListener('change', change)
  }, [])

  return (
    <div className="mx-auto flex h-full min-h-0 min-w-0 w-full max-w-none flex-col">
      <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-snow">Tool Center</h1>
          <p className="mt-1 text-sm text-mist">Create, publish, and manage your workspace.</p>
        </div>
        <div className="hidden items-center gap-1 rounded-lg border border-line bg-well p-1 min-[861px]:flex" aria-label="Home view">
          {(['directory', 'orbit'] as const).map((mode) => (
            <button key={mode} type="button" aria-pressed={view === mode} onClick={() => setView(mode)}
              className={`rounded-md px-3 py-2 text-sm transition ${view === mode ? 'bg-lift text-snow' : 'text-mist hover:text-snow'}`}>
              {mode === 'directory' ? 'Directory' : 'Orbit'}
            </button>
          ))}
        </div>
      </div>
      {railDirty && (
        <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-brass/30 bg-brass/10 px-3 py-2" role="status">
          <span className="text-sm text-brass">Sidebar changes are unsaved.</span>
          <button type="button" onClick={onSaveRail} className="rounded-md bg-brass px-3 py-2 text-sm font-semibold text-onAccent hover:brightness-110">Save sidebar</button>
        </div>
      )}
      {view === 'orbit' ? (
        <div className="min-h-0 flex-1"><OrbitView {...props} /></div>
      ) : (
        <>
          <div className="mb-3 flex shrink-0 items-center gap-3 rounded-xl border border-lineStrong bg-well px-3">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0 text-fog" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m16 16 5 5" /></svg>
            <input aria-label="Find a tool" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a tool or platform…" className="min-w-0 flex-1 !border-0 !bg-transparent py-3 text-sm text-snow placeholder:text-fog focus-visible:outline-none" />
            {query && <button type="button" aria-label="Clear tool search" onClick={() => setQuery('')} className="px-2 py-2 text-sm text-mist hover:text-snow">Clear</button>}
            <span className="shrink-0 font-mono text-xs tabular-nums text-fog" aria-live="polite">{filtered.length} {filtered.length === 1 ? 'tool' : 'tools'}</span>
          </div>
          <div className="mb-4 flex shrink-0 gap-1 overflow-x-auto pb-1 [scrollbar-width:thin]" aria-label="Tool filters">
            {(['All tools', 'Pinned', ...DIRECTORY_GROUPS, ...(hasHidden || filter === 'Hidden tools' ? ['Hidden tools' as const] : [])] as const).map((label) => (
              <button key={label} type="button" aria-pressed={filter === label} onClick={() => setFilter(label)}
                className={`shrink-0 whitespace-nowrap rounded-lg border px-3 py-2 text-xs transition ${filter === label ? 'border-brass/40 bg-brass/10 text-brass' : 'border-transparent text-mist hover:bg-raised hover:text-snow'}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1 pb-4">
            {!filtered.length ? (
              <div className="rounded-xl border border-line bg-panel px-4 py-10 text-center">
                <p className="font-semibold text-snow">{query ? `No tools match “${query}”` : 'No tools in this view'}</p>
                <p className="mt-2 text-sm text-mist">{filter === 'Pinned' ? 'Pin tools with the star beside each tool.' : 'Try another search or view all tools.'}</p>
                <button type="button" onClick={() => { setQuery(''); setFilter('All tools') }} className="mt-4 rounded-lg border border-brass/35 px-3 py-2 text-sm text-brass hover:bg-brass/10">View all tools</button>
              </div>
            ) : (
              <div className="grid items-start gap-5 min-[1100px]:grid-cols-2">
                {DIRECTORY_GROUPS.map((group) => {
                  const groupEntries = filtered.filter((entry) => entry.group === group)
                  if (!groupEntries.length) return null
                  return (
                    <section key={group} aria-label={group}>
                      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-snow">{group}<span className="font-mono text-xs font-normal text-fog">{groupEntries.length}</span></h2>
                      <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel">
                        {groupEntries.map((entry) => {
                          const pinned = isOnRail(entry.railId)
                          const running = Boolean(entry.toolId && onlineMap[entry.toolId])
                          return (
                            <div key={entry.id} className="flex items-center gap-1 pr-2">
                              <button type="button" aria-label={`Open ${entry.name}`} onClick={() => entry.module ? onOpenModule(entry.module) : onSelect(entry.id)} className="group flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left transition hover:bg-raised">
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border" style={{ color: readableToolAccent(entry.accent), borderColor: `${entry.accent}40`, backgroundColor: `${entry.accent}12` }}><ToolIcon id={entry.icon} size={20} /></span>
                                <span className="min-w-0 flex-1">
                                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="text-sm font-semibold text-snow group-hover:text-brass">{entry.name}</span><span className={`font-mono text-[10px] ${running && !entry.module ? 'text-phosphor' : 'text-fog'}`}>{entry.hidden ? 'Hidden' : entry.module ? 'In app' : running ? 'Running' : 'Idle'}</span></span>
                                  <span className="mt-1 block text-xs leading-relaxed text-mist">{entry.description}</span>
                                </span>
                              </button>
                              {entry.hidden ? <button type="button" onClick={() => onRestoreTool(entry.id)} aria-label={`Restore ${entry.name}`} className="shrink-0 rounded-lg px-2 py-3 text-xs font-medium text-brass hover:bg-lift">Restore</button> : <button type="button" aria-label={`${pinned ? 'Unpin' : 'Pin'} ${entry.name}`} aria-pressed={pinned} title={pinned ? 'Remove from sidebar' : 'Pin to sidebar'} onClick={() => pinned ? onRemoveFromRail(entry.railId) : onAddToRail(entry.railId)} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition hover:bg-lift ${pinned ? 'text-brass' : 'text-fog hover:text-snow'}`}>
                                <svg viewBox="0 0 24 24" width="17" height="17" fill={pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true"><path d="m12 3 2.8 5.7 6.3.9-4.5 4.4 1 6.2-5.6-3-5.6 3 1-6.2L3 9.6l6.2-.9Z" /></svg>
                              </button>}
                            </div>
                          )
                        })}
                      </div>
                    </section>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
