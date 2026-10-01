import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchHubSummary, type HubSummary } from '../lib/hub'
import { TodayStripSkeleton, ErrorRetryCallout } from './ui/primitives'
import { isActiveAutomation, statusLabel, statusTone } from '../lib/automation-run'

export function TodayDashboard({
  onOpenModule,
  onOpenFailures,
  onOpenPipeline,
}: {
  onOpenModule: (id: string) => void
  onOpenFailures?: () => void
  onOpenPipeline?: () => void
}) {
  const [summary, setSummary] = useState<HubSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const refreshInFlight = useRef(false)

  const refresh = useCallback(async () => {
    if (refreshInFlight.current) return
    refreshInFlight.current = true
    try {
      const next = await fetchHubSummary()
      if (next) {
        setSummary(next)
        setError(false)
      } else {
        setError(true)
      }
      setLoading(false)
    } finally {
      refreshInFlight.current = false
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => void refresh(), 8000)
    return () => window.clearInterval(id)
  }, [refresh])

  if (loading && !summary) {
    return <TodayStripSkeleton />
  }

  if (error && !summary) {
    return (
      <div className="shrink-0">
        <ErrorRetryCallout
          title="Could not load today summary"
          body="Bridge may be offline or hub API unavailable."
          onRetry={() => {
            setLoading(true)
            void refresh()
          }}
        />
      </div>
    )
  }

  if (!summary) {
    return <TodayStripSkeleton />
  }

  const active = summary.modules.filter((m) => isActiveAutomation(m.status))

  return (
    <section className="shrink-0 rounded-[14px] border border-lineStrong bg-panel px-4 py-3 sm:px-5 sm:py-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 gap-y-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-mono text-[13px] font-semibold tracking-wide text-brass">Today</span>
          <span className="text-[12px] text-fog">
            {active.length ? `${active.length} automation(s) active` : 'All automations idle'}
            {summary.deskOpen > 0 ? ` · ${summary.deskOpen} open desk ticket(s)` : ''}
            {summary.followUpsDue > 0 ? ` · ${summary.followUpsDue} promo follow-up(s) due` : ''}
            {summary.failures > 0 ? ` · ${summary.failures} failure screenshot(s)` : ''}
          </span>
        </div>
        {summary.failures > 0 && onOpenFailures ? (
          <button
            type="button"
            onClick={onOpenFailures}
            className="min-h-[36px] rounded-lg border border-lineStrong bg-raised px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-mist hover:text-snow"
          >
            View failures
          </button>
        ) : null}
        {summary.followUpsDue > 0 && onOpenPipeline ? (
          <button
            type="button"
            onClick={onOpenPipeline}
            className="min-h-[36px] rounded-lg border border-phosphor/35 bg-raised px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-phosphor hover:text-snow"
          >
            {summary.followUpsDue} follow-up(s)
          </button>
        ) : null}
      </div>

      <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {summary.modules.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onOpenModule(m.id)}
            className="min-h-[44px] rounded-[10px] border border-line bg-well px-3 py-2.5 text-left transition hover:border-brass/30 hover:bg-lift active:bg-lift"
          >
            <div className="text-[12.5px] font-semibold text-snow">{m.label}</div>
            <div className={`mt-0.5 font-mono text-[11px] ${statusTone(m.status)}`}>
              {statusLabel(m.status)}
            </div>
            <div className="mt-1 font-mono text-[10.5px] text-fog">
              {m.sent ?? 0} sent · {m.failed ?? 0} failed
              {(m.skipped ?? 0) > 0 ? ` · ${m.skipped} skipped` : ''}
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}
