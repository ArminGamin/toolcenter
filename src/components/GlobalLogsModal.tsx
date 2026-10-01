import { useCallback, useEffect, useRef, useState } from 'react'
import {
  clearConsole,
  clearRunErrors,
  deleteRunError,
  fetchConsole,
  fetchRunError,
  fetchRunErrors,
  downloadDiagnosticPack,
  type RunErrorMeta,
} from '../lib/launch'
import { logLevelClass, type LogEntry, type LogLevel } from '../lib/logLevels'
import { clearOutreachLog, fetchOutreachLog } from '../lib/outreach'
import { OutreachLiveFeed, type OutreachLogFilter } from './OutreachLiveFeed'
import { AutomationFailuresPanel } from './AutomationFailuresPanel'

interface GlobalLogsModalProps {
  open: boolean
  onClose: () => void
  /** When set on open, selects this tab first (e.g. outreach while on Outreach panel). */
  preferredTab?: Tab | null
}

type Filter = 'all' | LogLevel
type Tab = 'live' | 'outreach' | 'failures' | 'screenshots'

export function GlobalLogsModal({ open, onClose, preferredTab }: GlobalLogsModalProps) {
  const [tab, setTab] = useState<Tab>('live')
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [errors, setErrors] = useState<RunErrorMeta[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [body, setBody] = useState<string>('')
  const [bodyBusy, setBodyBusy] = useState(false)
  const [outreachLog, setOutreachLog] = useState<Awaited<ReturnType<typeof fetchOutreachLog>>>([])
  const [outreachFilter, setOutreachFilter] = useState<OutreachLogFilter>('all')
  const [outreachBusy, setOutreachBusy] = useState(false)
  const boxRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    if (preferredTab) setTab(preferredTab)
  }, [open, preferredTab])

  const refreshOutreachLog = useCallback(async () => {
    setOutreachLog(await fetchOutreachLog(outreachFilter))
  }, [outreachFilter])

  useEffect(() => {
    if (!open) return
    let alive = true
    async function tickLive() {
      const res = await fetchConsole('__all__')
      if (!alive || !res.ok) return
      setEntries(res.entries || [])
    }
    async function tickErrors() {
      const res = await fetchRunErrors()
      if (!alive || !res.ok) return
      setErrors(res.errors)
      setSelectedId((cur) => cur || res.errors[0]?.id || null)
    }
    async function tickOutreach() {
      const next = await fetchOutreachLog(outreachFilter)
      if (!alive) return
      setOutreachLog(next)
    }
    void tickLive()
    void tickErrors()
    void tickOutreach()
    const id = window.setInterval(() => {
      if (tab === 'live') void tickLive()
      else if (tab === 'outreach') void tickOutreach()
      else void tickErrors()
    }, tab === 'failures' ? 4000 : 2500)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [open, tab, outreachFilter])

  useEffect(() => {
    if (!open || tab !== 'failures' || !selectedId) {
      setBody('')
      return
    }
    let alive = true
    setBodyBusy(true)
    void fetchRunError(selectedId).then((res) => {
      if (!alive) return
      setBodyBusy(false)
      setBody(res.ok ? res.body || '' : res.message || 'Failed to load')
    })
    return () => {
      alive = false
    }
  }, [open, tab, selectedId])

  useEffect(() => {
    const box = boxRef.current
    if (!open || !box || tab !== 'live') return
    box.scrollTop = box.scrollHeight
  }, [entries, open, tab])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const visible = filter === 'all' ? entries : entries.filter((e) => e.level === filter)

  async function onClearLive() {
    await clearConsole('__all__')
    setEntries([])
  }

  async function onClearFailures() {
    await clearRunErrors()
    setErrors([])
    setSelectedId(null)
    setBody('')
  }

  function confirmClear(): boolean {
    if (tab === 'live') {
      return window.confirm('Clear all console logs?\n\nThis cannot be undone.')
    }
    if (tab === 'outreach') {
      return window.confirm('Clear the Outreach log feed?\n\nThis cannot be undone.')
    }
    if (tab === 'failures') {
      return window.confirm('Clear all saved failure logs?\n\nThis cannot be undone.')
    }
    return false
  }

  function onClearClick() {
    if (!confirmClear()) return
    if (tab === 'live') void onClearLive()
    else if (tab === 'outreach') {
      setOutreachBusy(true)
      void clearOutreachLog()
        .then(() => refreshOutreachLog())
        .finally(() => setOutreachBusy(false))
    } else if (tab === 'failures') void onClearFailures()
  }

  const filters: { id: Filter; label: string; className: string }[] = [
    { id: 'all', label: 'All', className: 'text-mist' },
    { id: 'info', label: 'Info', className: 'text-mist' },
    { id: 'noise', label: 'Noise', className: 'text-fog' },
    { id: 'warn', label: 'Warn', className: 'text-brass' },
    { id: 'critical', label: 'Critical', className: 'text-ember' },
  ]

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label="Close logs"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal
        className="relative z-10 flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-lineStrong bg-panel shadow-panel"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold leading-snug text-snow">Logs</h2>
            <div className="mt-2.5 flex flex-wrap gap-1">
              {(
                [
                  { id: 'live' as const, label: 'Console' },
                  { id: 'outreach' as const, label: 'Outreach' },
                  {
                    id: 'screenshots' as const,
                    label: 'Screenshots',
                  },
                  {
                    id: 'failures' as const,
                    label: errors.length ? `Failures (${errors.length})` : 'Failures',
                  },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={[
                    'rounded-lg border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition',
                    tab === t.id
                      ? 'border-brass/40 bg-brassSoft text-snow'
                      : 'border-lineStrong text-fog hover:text-snow',
                  ].join(' ')}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => void downloadDiagnosticPack()}
              className="rounded-lg border border-lineStrong px-2.5 py-1 font-mono text-[11px] text-mist hover:text-snow"
            >
              Export diagnostics
            </button>
            <button
              type="button"
              onClick={onClearClick}
              className="rounded-lg border border-ember/40 bg-ember/10 px-2.5 py-1 font-mono text-[11px] text-ember transition hover:border-ember/70 hover:bg-ember/20"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-lineStrong px-2.5 py-1 font-mono text-[11px] text-mist hover:text-snow"
            >
              Esc
            </button>
          </div>
        </div>

        {tab === 'live' ? (
          <>
            <div className="flex shrink-0 flex-wrap gap-1.5 border-b border-line px-5 py-2.5">
              {filters.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={[
                    'rounded-lg border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition',
                    filter === f.id
                      ? 'border-brass/40 bg-brassSoft text-snow'
                      : 'border-lineStrong text-fog hover:text-snow',
                    f.className,
                  ].join(' ')}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div
              ref={boxRef}
              className="min-h-0 flex-1 overflow-y-auto bg-well p-4 font-mono text-[11px] leading-relaxed"
            >
              {visible.length === 0 ? (
                <div className="text-fog">No console logs yet. Launch a tool to stream output here.</div>
              ) : (
                visible.map((entry, i) => (
                  <div
                    key={`${entry.at}-${entry.toolId}-${i}-${entry.text.slice(0, 20)}`}
                    className={['flex gap-2', logLevelClass(entry.level)].join(' ')}
                  >
                    <span className="shrink-0 text-fog">[{entry.toolId}]</span>
                    <span className="min-w-0 break-all">{entry.text}</span>
                  </div>
                ))
              )}
            </div>
          </>
        ) : tab === 'outreach' ? (
          <OutreachLiveFeed
            log={outreachLog}
            filter={outreachFilter}
            onFilterChange={setOutreachFilter}
            busy={outreachBusy}
            onClear={() => {
              setOutreachBusy(true)
              void clearOutreachLog()
                .then(() => refreshOutreachLog())
                .finally(() => setOutreachBusy(false))
            }}
          />
        ) : tab === 'screenshots' ? (
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <AutomationFailuresPanel active={open} />
          </div>
        ) : tab === 'failures' ? (
          <div className="grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-[220px_minmax(0,1fr)]">
            <div className="min-h-0 overflow-y-auto border-b border-lineStrong bg-well sm:border-b-0 sm:border-r">
              {errors.length === 0 ? (
                <p className="px-3 py-6 text-center font-mono text-[11px] text-fog">No failures saved</p>
              ) : (
                errors.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setSelectedId(e.id)}
                    className={[
                      'block w-full border-b border-lineStrong px-3 py-2.5 text-left transition',
                      selectedId === e.id ? 'bg-lift' : 'hover:bg-raised',
                    ].join(' ')}
                  >
                    <div className="font-mono text-[10px] uppercase tracking-wider text-brass">
                      {e.toolId}
                    </div>
                    <div className="mt-0.5 line-clamp-2 font-mono text-[11px] text-snow">{e.summary}</div>
                    <div className="mt-1 font-mono text-[10px] text-fog">
                      {e.at.slice(0, 19).replace('T', ' ')}
                      {e.exitCode != null ? ` · exit ${e.exitCode}` : ''}
                      {` · ${e.bytes < 1024 ? `${e.bytes}b` : `${Math.round(e.bytes / 1024)}kb`}`}
                    </div>
                  </button>
                ))
              )}
            </div>
            <div className="flex min-h-0 flex-col">
              {selectedId && (
                <div className="flex shrink-0 justify-end border-b border-lineStrong px-3 py-2">
                  <button
                    type="button"
                    onClick={() =>
                      void deleteRunError(selectedId).then(() => {
                        setErrors((prev) => {
                          const next = prev.filter((x) => x.id !== selectedId)
                          setSelectedId(next[0]?.id || null)
                          return next
                        })
                      })
                    }
                    className="rounded-lg border border-lineStrong px-2 py-0.5 font-mono text-[10px] text-fog hover:text-ember"
                  >
                    Delete
                  </button>
                </div>
              )}
              <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-all bg-well p-4 font-mono text-[11px] leading-relaxed text-mist">
                {bodyBusy ? 'Loading…' : body || 'Pick a failure on the left'}
              </pre>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
