import {
    clearGroupPosterLog,
    type GroupPosterRun,
    type GroupPosterState
} from '../../lib/group-poster'
import { EmptyState } from '../ui/primitives'

export function ActivityAside({
  state,
  run,
  busy,
  waitingLive,
  liveWait,
  latestWaitLogIndex,
  flash,
  setState,
  refresh,
}: {
  state: GroupPosterState | null
  run: GroupPosterRun | undefined
  busy: boolean
  waitingLive: boolean
  liveWait: string | null
  latestWaitLogIndex: number
  flash: (msg: string) => void
  setState: React.Dispatch<React.SetStateAction<GroupPosterState | null>>
  refresh: (opts?: { syncSettings?: boolean; light?: boolean }) => Promise<void>
}) {
  return (
    <aside className="tool-companion fit-side flex max-h-[520px] min-h-0 min-w-0 flex-col rounded-2xl border border-lineStrong bg-panel">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-snow">Activity</h2>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-fog">
            {run?.posted ?? 0} posted · {run?.failed ?? 0} failed
            {run?.total ? ` / ${run.total}` : ''}
          </span>
          <button
            type="button"
            title="Clear activity log"
            disabled={busy}
            onClick={() => {
              void clearGroupPosterLog().then(async (r) => {
                flash(r.message || (r.ok ? 'Log cleared' : 'Failed'))
                if (r.ok) {
                  setState((prev) => (prev ? { ...prev, log: [] } : prev))
                }
                await refresh({ light: true })
              })
            }}
            className="rounded-md border border-lineStrong bg-raised px-2 py-0.5 font-mono text-[10px] uppercase text-fog transition hover:bg-lift hover:text-mist disabled:opacity-40"
          >
            Clear
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {(state?.log || []).length === 0 ? (
          <EmptyState title="No activity yet" />
        ) : (
          <ul className="space-y-2">
            {(state?.log || []).map((entry, i) => (
              <li key={`${entry.at}-${i}`} className="border-b border-line/60 pb-2 last:border-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className={[
                      'font-mono text-[10px] uppercase tracking-[0.1em]',
                      entry.kind === 'error' ? 'text-ember' : 'text-mist',
                    ].join(' ')}
                  >
                    {entry.kind}
                  </span>
                  <span className="font-mono text-[10px] text-fog">
                    {entry.at ? new Date(entry.at).toLocaleTimeString() : ''}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-snow/90">
                  {waitingLive && liveWait && i === latestWaitLogIndex ? liveWait : entry.message}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
