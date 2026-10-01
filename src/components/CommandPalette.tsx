import { useEffect, useMemo, useRef, useState } from 'react'
import { ToolIcon } from '../data/icons'
import {
  fetchUnifiedSearch,
  SEARCH_KIND_LABELS,
  type UnifiedSearchHit,
} from '../lib/unified-search'
import type { Tool } from '../types'

const HUB_SHORTCUTS = [
  { id: 'markets', label: 'Markets' },
  { id: 'outreach', label: 'Outreach' },
  { id: 'pipeline', label: 'Promo Pipeline' },
  { id: 'group-poster', label: 'Groups & Friend DMs' },
  { id: 'reddit-commenter', label: 'Reddit' },
  { id: 'seo-blog', label: 'SEO Blog' },
  { id: 'ugc-slides', label: 'UGC Slides' },
  { id: 'one-shot', label: 'One-Shot' },
  { id: 'notes', label: 'Notes' },
] as const

interface CommandPaletteProps {
  open: boolean
  tools: Tool[]
  onlineMap?: Record<string, boolean>
  onClose: () => void
  onSelect: (id: string) => void
  onOpenModule?: (id: string) => void
  onUnifiedSelect?: (hit: UnifiedSearchHit) => void
  quickActions?: { id: string; label: string }[]
  onQuickAction?: (id: string) => void
}

export function CommandPalette({
  open,
  tools,
  onlineMap = {},
  onClose,
  onSelect,
  onOpenModule,
  onUnifiedSelect,
  quickActions = [],
  onQuickAction,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selIndex, setSelIndex] = useState(0)
  const [unifiedHits, setUnifiedHits] = useState<UnifiedSearchHit[]>([])
  const [unifiedLoading, setUnifiedLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    const list = tools.filter((t) => !t.removed && (!onOpenModule || !['ugc_slides', 'one_shot', 'reddit_commenter'].includes(t.id)))
    if (!q) return list
    return list.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.blurb.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        Boolean(t.launchOptions?.some((option) => option.label.toLowerCase().includes(q))),
    )
  }, [tools, query, onOpenModule])

  const hubHits = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!onOpenModule) return []
    return HUB_SHORTCUTS.filter(
      (h) => !q || h.label.toLowerCase().includes(q) || h.id.includes(q),
    )
  }, [query, onOpenModule])

  const actionHits = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!onQuickAction) return []
    return quickActions.filter(
      (a) => !q || a.label.toLowerCase().includes(q) || a.id.includes(q),
    )
  }, [query, onQuickAction, quickActions])

  const rowCount = unifiedHits.length + hubHits.length + actionHits.length + filtered.length

  useEffect(() => {
    if (open) {
      const previousFocus = document.activeElement as HTMLElement | null
      setQuery('')
      setSelIndex(0)
      setUnifiedHits([])
      const t = window.setTimeout(() => inputRef.current?.focus(), 10)
      return () => {
        window.clearTimeout(t)
        if (previousFocus?.isConnected && !previousFocus.closest('[inert]')) previousFocus.focus()
      }
    }
  }, [open])

  useEffect(() => {
    setSelIndex(0)
  }, [query, unifiedHits.length])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const q = query.trim()
    setUnifiedHits([])
    if (q.length < 2) {
      setUnifiedHits([])
      setUnifiedLoading(false)
      return
    }
    setUnifiedLoading(true)
    const timer = window.setTimeout(() => {
      void fetchUnifiedSearch(q).then((res) => {
        if (cancelled) return
        setUnifiedHits(res.hits)
        setUnifiedLoading(false)
      })
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [open, query])

  useEffect(() => {
    resultsRef.current?.querySelector(`[data-search-row="${selIndex}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, selIndex, rowCount])

  if (!open) return null

  function choose(id: string) {
    onSelect(id)
    onClose()
  }

  function chooseUnified(hit: UnifiedSearchHit) {
    onUnifiedSelect?.(hit)
    onClose()
  }

  function rowKind(index: number): 'unified' | 'hub' | 'action' | 'tool' {
    if (index < unifiedHits.length) return 'unified'
    if (index < unifiedHits.length + hubHits.length) return 'hub'
    if (index < unifiedHits.length + hubHits.length + actionHits.length) return 'action'
    return 'tool'
  }

  function activateIndex(index: number) {
    const kind = rowKind(index)
    if (kind === 'unified') {
      const hit = unifiedHits[index]
      if (hit) chooseUnified(hit)
      return
    }
    if (kind === 'hub') {
      const hub = hubHits[index - unifiedHits.length]
      if (hub && onOpenModule) {
        onOpenModule(hub.id)
        onClose()
      }
      return
    }
    if (kind === 'action') {
      const act = actionHits[index - unifiedHits.length - hubHits.length]
      if (act && onQuickAction) {
        onQuickAction(act.id)
        onClose()
      }
      return
    }
    const hit = filtered[index - unifiedHits.length - hubHits.length - actionHits.length]
    if (hit) choose(hit.id)
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/70 pt-[12vh] backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className="w-[520px] max-w-[92vw] overflow-hidden rounded-2xl border border-lineStrong bg-panel shadow-panel"
        role="dialog"
        aria-label="Unified search"
        aria-modal="true"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            onClose()
          } else if (event.key === 'Tab') {
            const controls = dialogRef.current?.querySelectorAll<HTMLElement>('input, button:not(:disabled)')
            const first = controls?.[0]
            const last = controls?.[controls.length - 1]
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault()
              last?.focus()
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault()
              first?.focus()
            }
          }
        }}
      >
        <div className="flex items-center gap-3 border-b border-line bg-panel px-4">
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="text-fog"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            aria-label="Search tools and workspace"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSelIndex((i) => Math.min(i + 1, Math.max(rowCount - 1, 0)))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSelIndex((i) => Math.max(i - 1, 0))
              } else if (e.key === 'Enter') {
                activateIndex(selIndex)
              }
            }}
            placeholder="Search tools, leads, notes, runs…"
            autoComplete="off"
            className="w-full !bg-panel py-4 text-sm text-snow outline-none placeholder:text-fog focus-visible:outline-none"
          />
          <button type="button" onClick={onClose} aria-label="Close search" className="shrink-0 rounded-md px-2 py-2 font-mono text-xs text-fog hover:bg-lift hover:text-snow">Esc</button>
        </div>
        <div ref={resultsRef} className="max-h-[min(360px,60vh)] overflow-auto p-2">
          {query.trim().length >= 2 && (
            <div className="mb-2 space-y-1">
              <div className="flex items-center justify-between px-2">
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-fog">
                  Unified search
                </span>
                {unifiedLoading && (
                  <span className="font-mono text-[9px] text-fog">Searching…</span>
                )}
              </div>
              {unifiedHits.map((hit, i) => (
                <button
                  key={`${hit.kind}:${hit.id}`}
                  data-search-row={i}
                  aria-current={i === selIndex ? 'true' : undefined}
                  type="button"
                  onClick={() => chooseUnified(hit)}
                  className={[
                    'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors',
                    i === selIndex
                      ? 'bg-lift text-snow'
                      : 'text-mist hover:bg-raised hover:text-snow',
                  ].join(' ')}
                >
                  <span className="shrink-0 rounded border border-lineStrong px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-brass">
                    {SEARCH_KIND_LABELS[hit.kind]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{hit.title}</span>
                    <span className="block truncate font-mono text-[10px] text-fog">{hit.subtitle}</span>
                  </span>
                </button>
              ))}
              {!unifiedLoading && !unifiedHits.length && (
                <div className="px-3 py-2 font-mono text-[11px] text-fog">No matches in workspace data</div>
              )}
            </div>
          )}

          {hubHits.length > 0 && (
            <div className="mb-2 space-y-1">
              <div className="px-2 font-mono text-[9px] uppercase tracking-[0.14em] text-fog">
                Hubs
              </div>
              {hubHits.map((h, i) => {
                const row = i + unifiedHits.length
                return (
                  <button
                    key={h.id}
                    data-search-row={row}
                    aria-current={row === selIndex ? 'true' : undefined}
                    type="button"
                    onClick={() => {
                      onOpenModule?.(h.id)
                      onClose()
                    }}
                    className={[
                      'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors',
                      row === selIndex
                        ? 'bg-lift text-snow'
                        : 'text-mist hover:bg-raised hover:text-snow',
                    ].join(' ')}
                  >
                    <span className="font-mono text-[11px] text-brass">{h.label}</span>
                  </button>
                )
              })}
            </div>
          )}
          {actionHits.length > 0 && (
            <div className="mb-2 space-y-1">
              <div className="px-2 font-mono text-[9px] uppercase tracking-[0.14em] text-fog">
                Run actions
              </div>
              {actionHits.map((a, i) => {
                const row = i + unifiedHits.length + hubHits.length
                return (
                  <button
                    key={a.id}
                    data-search-row={row}
                    aria-current={row === selIndex ? 'true' : undefined}
                    type="button"
                    onClick={() => {
                      onQuickAction?.(a.id)
                      onClose()
                    }}
                    className={[
                      'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors',
                      row === selIndex
                        ? 'bg-lift text-snow'
                        : 'text-mist hover:bg-raised hover:text-snow',
                    ].join(' ')}
                  >
                    <span className="font-mono text-[11px] text-phosphor">{a.label}</span>
                  </button>
                )
              })}
            </div>
          )}
          {filtered.length === 0 && hubHits.length === 0 && actionHits.length === 0 && !unifiedHits.length ? (
            <div className="px-5 py-8 text-center font-mono text-xs text-fog">
              {query.trim().length >= 2 ? 'No results' : 'Type to search workspace or jump to a hub'}
            </div>
          ) : (
            filtered.map((t, i) => {
              const row = i + unifiedHits.length + hubHits.length + actionHits.length
              return (
                <button
                  key={t.id}
                  data-search-row={row}
                  aria-current={row === selIndex ? 'true' : undefined}
                  type="button"
                  onClick={() => choose(t.id)}
                  className={[
                    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                    row === selIndex
                      ? 'bg-lift text-snow'
                      : 'text-mist hover:bg-raised hover:text-snow',
                  ].join(' ')}
                >
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-xl border"
                    style={{
                      borderColor: `${t.accent}55`,
                      color: t.accent,
                      background: `${t.accent}12`,
                    }}
                  >
                    <ToolIcon id={t.icon} size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="block text-sm font-medium">{t.name}</span>
                      <span className="rounded border border-lineStrong px-1.5 py-1 font-mono text-xs uppercase tracking-wide text-mist">
                        {t.category}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[11px] text-fog">
                      {t.blurb}
                    </span>
                  </span>
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{
                      background: onlineMap[t.id] ? '#5ec4b4' : '#a8afba',
                    }}
                  />
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
