import { useEffect, useState, type ReactNode } from 'react'
import {
  liveWaitText,
  statusLabel,
  statusTone,
  runHealth,
  type AutomationRunCounts,
  type AutomationRunMeta,
} from '../../lib/automation-run'

export function AutomationRunBar({
  run,
  actions,
  waitTarget,
}: {
  run: AutomationRunMeta & Partial<AutomationRunCounts>
  actions?: ReactNode
  /** When set, live wait text uses friend/group suffix even if run.message lacks it. */
  waitTarget?: 'group' | 'friend'
}) {
  const status = run.status || 'idle'
  const statusText = statusLabel(status)
  const health = runHealth(run)
  const message = run.message?.trim()
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    if (!run.waitEndsAt) return
    setNowMs(Date.now())
    const id = window.setInterval(() => setNowMs(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [run.waitEndsAt])

  const waitHint = waitTarget || message
  const liveWait = liveWaitText(run.waitLabel, run.waitEndsAt, nowMs, waitHint)
  const showMessage =
    message &&
    message.toLowerCase() !== statusText.toLowerCase() &&
    message.toLowerCase() !== status.toLowerCase() &&
    message !== liveWait

  return (
    <div className="space-y-2 rounded-xl border border-lineStrong bg-well/50 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-lineStrong bg-panel px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-mist">
            {health.label}
          </span>
          <span
            className={`font-mono text-[10px] uppercase tracking-[0.14em] ${statusTone(status)}`}
          >
            {statusLabel(status)}
          </span>
          {liveWait ? (
            <span className="font-mono text-[11px] text-brass">{liveWait}</span>
          ) : showMessage ? (
            <span className="font-mono text-[11px] text-mist">{message}</span>
          ) : null}
          {run.workerRunning ? (
            <span className="font-mono text-[10px] text-fog">
              worker{run.workerPid ? ` pid ${run.workerPid}` : ''}
            </span>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>

      <div className="flex flex-wrap items-center gap-4 font-mono text-[10px] text-fog">
        <span className="text-phosphor">{run.sent ?? 0} sent</span>
        <span className="text-ember">{run.failed ?? 0} failed</span>
        {(run.skipped ?? 0) > 0 ? <span>{run.skipped} skipped</span> : null}
        {run.total != null && run.total > 0 ? <span>/ {run.total}</span> : null}
        {run.currentItem ? <span className="text-mist">· {run.currentItem}</span> : null}
      </div>

      {run.error ? <p className="text-[11px] text-ember">{run.error}</p> : null}
      {health.action ? <p className="text-[10px] text-brass">Next: {health.action}</p> : null}
      {run.id ? <p className="font-mono text-[9px] text-fog">run {run.id.slice(0, 12)}</p> : null}
    </div>
  )
}
