import type { OutreachCampaignHealth } from '../../lib/outreach'

function ageLabel(raw?: string) {
  const time = Date.parse(raw || '')
  if (!Number.isFinite(time)) return 'waiting'
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  return minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`
}

function Metric({ label, value, tone = 'text-snow' }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="min-w-0 px-3 py-2.5">
      <dt className="truncate font-mono text-[9px] uppercase tracking-[0.14em] text-fog">{label}</dt>
      <dd className={`mt-0.5 font-mono text-sm font-semibold tabular-nums ${tone}`}>{value}</dd>
    </div>
  )
}

export function CampaignHealthRail({ health, fallbackTarget = 0 }: { health?: OutreachCampaignHealth; fallbackTarget?: number }) {
  const target = health?.target || fallbackTarget
  const qualified = health?.qualifiedPeople || 0
  const progress = target > 0 ? Math.min(100, (qualified / target) * 100) : 0
  const healthy = (health?.workersHealthy || 0) > 0
  const status = health?.discoveryStatus || 'IDLE'

  return (
    <section className="shrink-0 overflow-hidden rounded-2xl border border-lineStrong bg-panel" aria-label="Campaign health">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-lineStrong px-4 py-3 sm:px-5">
        <div className="min-w-[220px] flex-1">
          <div className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.14em]">
            <span className="text-mist">Campaign pulse · {health?.stage || 'IDLE'}</span>
            <span className={status === 'RUNNING' ? 'text-phosphor' : status === 'EXHAUSTED' ? 'text-brass' : 'text-fog'}>
              {status}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-well" role="progressbar" aria-valuenow={qualified} aria-valuemin={0} aria-valuemax={target || undefined}>
            <div className="h-full bg-phosphor transition-[width] duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] text-fog">
          <span className={`h-2 w-2 rounded-full ${healthy ? 'bg-phosphor' : 'bg-brass'}`} />
          Workers {health?.workersHealthy || 0}/{health?.workersTotal || 1}
          <span className="text-lineStrong">·</span>
          Last progress {ageLabel(health?.lastSuccessfulAction || health?.workerHeartbeat)}
        </div>
      </div>

      <dl className="grid grid-cols-2 divide-x divide-y divide-lineStrong bg-lineStrong sm:grid-cols-4 lg:grid-cols-7 lg:divide-y-0">
        <Metric label="Target" value={target.toLocaleString()} />
        <Metric label="Qualified people" value={qualified.toLocaleString()} tone="text-phosphor" />
        <Metric label="Candidates" value={(health?.candidatesFound || 0).toLocaleString()} />
        <Metric label="Duplicates" value={(health?.duplicatesRemoved || 0).toLocaleString()} />
        <Metric label="Organizations" value={(health?.rejectedOrganizations || 0).toLocaleString()} tone="text-brass" />
        <Metric label="Invalid contacts" value={(health?.invalidContacts || 0).toLocaleString()} tone="text-brass" />
        <Metric label="Source queue" value={(health?.queueSize || 0).toLocaleString()} />
      </dl>

      {health?.currentSources?.length ? (
        <div className="flex min-w-0 items-start gap-2 border-t border-lineStrong bg-well px-4 py-2 font-mono text-[10px] sm:px-5">
          <span className="shrink-0 uppercase tracking-[0.12em] text-fog">Current sources</span>
          <span className="line-clamp-2 break-words text-mist">{health.currentSources.join(' · ')}</span>
        </div>
      ) : null}
    </section>
  )
}
