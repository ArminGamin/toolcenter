import type { OutreachLogEntry } from '../lib/outreach'

export type OutreachLogFilter = 'all' | 'error' | 'decision'

export function OutreachLiveFeed({
  log,
  filter,
  onFilterChange,
  onClear,
  busy = false,
  elapsedLabel,
}: {
  log: OutreachLogEntry[]
  filter: OutreachLogFilter
  onFilterChange: (f: OutreachLogFilter) => void
  onClear: () => void
  busy?: boolean
  elapsedLabel?: string | null
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-lineStrong px-4 py-2.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mist">Outreach feed</p>
          {elapsedLabel ? (
            <span className="font-mono text-[11px] tabular-nums text-brass">{elapsedLabel}</span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1">
          {(['all', 'decision', 'error'] as OutreachLogFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => onFilterChange(f)}
              className={[
                'rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase transition',
                filter === f
                  ? 'border-brass/40 bg-lift text-brass'
                  : 'border-lineStrong bg-raised text-fog hover:bg-lift hover:text-mist',
              ].join(' ')}
            >
              {f}
            </button>
          ))}
          <button
            type="button"
            title="Clear outreach feed"
            disabled={busy}
            onClick={() => {
              if (!window.confirm('Clear the Outreach log feed?\n\nThis cannot be undone.')) return
              onClear()
            }}
            className="rounded-md border border-ember/40 bg-ember/10 px-2 py-0.5 font-mono text-[10px] uppercase text-ember transition hover:border-ember/70 hover:bg-ember/20 disabled:opacity-40"
          >
            Clear
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto bg-well p-3 font-mono text-[11px] leading-relaxed">
        {!log.length && <p className="px-1 py-2 text-fog">Waiting for activity…</p>}
        {[...log].reverse().map((entry, i) => (
          <div
            key={`${entry.at}-${i}`}
            className={[
              'rounded-lg border px-2.5 py-1.5 shadow-card',
              entry.kind === 'error'
                ? 'border-ember/45 bg-lift text-ember'
                : entry.kind === 'decision'
                  ? 'border-brass/40 bg-lift text-brass'
                  : 'border-lineStrong bg-raised text-mist',
            ].join(' ')}
          >
            <div className="flex gap-2 text-[10px] text-fog">
              <span>{entry.at.slice(11, 19)}</span>
              <span className="uppercase">{entry.stage}</span>
            </div>
            <div className="mt-0.5 text-snow/90">{entry.message}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
