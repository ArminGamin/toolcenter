import { useCallback, useEffect, useState } from 'react'
import type { HubModuleSnapshot } from '../lib/hub'

type Alert = {
  id: string
  at: string
  level: 'error' | 'critical'
  title: string
  detail: string
  source?: string
  count: number
}

type Row = { key: string; title: string; detail: string; at: string; count: number; alertId?: string }

function authHeaders(): Record<string, string> {
  const token = (window as unknown as { __CC_AUTH__?: string }).__CC_AUTH__
  return token ? { 'X-CC-Token': token } : {}
}

function timeAgo(iso: string) {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  return new Date(iso).toLocaleTimeString()
}

const DISMISSED_KEY = 'cc.alerts.dismissedModules'

function readDismissed(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(DISMISSED_KEY) || '[]') as string[])
  } catch {
    return new Set()
  }
}

/**
 * One "something failed" banner for the whole app: server alerts (timeouts,
 * helpers that would not start, automation errors) plus any automation whose
 * status is currently "error".
 */
export function AlertBanner({ modules }: { modules: HubModuleSnapshot[] }) {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [open, setOpen] = useState(false)
  const [dismissedModules, setDismissedModules] = useState<Set<string>>(readDismissed)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/alerts', { headers: authHeaders() })
      if (!res.ok) return
      const data = (await res.json()) as { alerts?: Alert[] }
      setAlerts(data.alerts || [])
    } catch {
      /* bridge restarting; the bridge banner covers that */
    }
  }, [])

  useEffect(() => {
    void load()
    const id = window.setInterval(() => void load(), 5000)
    return () => window.clearInterval(id)
  }, [load])

  const moduleRows: Row[] = modules
    .filter((m) => m.status === 'error')
    .map((m) => ({
      key: `module:${m.id}:${m.message || ''}`,
      title: `${m.label} failed`,
      detail: m.message || 'Open the tool for details.',
      at: new Date().toISOString(),
      count: 1,
    }))
    .filter((r) => !dismissedModules.has(r.key))

  const rows: Row[] = [
    ...alerts.map((a) => ({ key: a.id, alertId: a.id, title: a.title, detail: a.detail, at: a.at, count: a.count })),
    ...moduleRows,
  ]
  if (!rows.length) return null

  async function dismiss(row: Row) {
    if (row.alertId) {
      setAlerts((prev) => prev.filter((a) => a.id !== row.alertId))
      await fetch('/api/alerts', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss', id: row.alertId }),
      }).catch(() => {})
    } else {
      const next = new Set(dismissedModules).add(row.key)
      setDismissedModules(next)
      try {
        sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]))
      } catch {
        /* ignore */
      }
    }
  }

  async function dismissAll() {
    for (const row of rows) if (!row.alertId) dismissedModules.add(row.key)
    setDismissedModules(new Set(dismissedModules))
    try {
      sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissedModules]))
    } catch {
      /* ignore */
    }
    setAlerts([])
    setOpen(false)
    await fetch('/api/alerts', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'dismiss-all' }),
    }).catch(() => {})
  }

  const first = rows[0]
  return (
    <div role="alert" className="border-b border-ember/40 bg-ember/10 px-4 py-2.5 sm:px-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="rounded-md bg-ember px-2 py-0.5 text-xs font-bold text-panel">Something failed</span>
        <p className="min-w-0 flex-1 text-sm text-snow">
          <span className="font-semibold">{first.title}</span>
          {first.count > 1 ? <span className="text-mist"> ×{first.count}</span> : null}
          {first.detail ? <span className="text-mist"> · {first.detail}</span> : null}
          <span className="text-fog"> · {timeAgo(first.at)}</span>
        </p>
        {rows.length > 1 ? (
          <button type="button" onClick={() => setOpen((v) => !v)} className="rounded-lg border border-ember/40 px-3 py-1.5 text-xs font-semibold text-ember hover:bg-ember/10">
            {open ? 'Hide' : `+${rows.length - 1} more`}
          </button>
        ) : null}
        <button type="button" onClick={() => void (rows.length > 1 ? dismissAll() : dismiss(first))} className="rounded-lg border border-lineStrong bg-raised px-3 py-1.5 text-xs font-semibold text-snow hover:bg-lift">
          {rows.length > 1 ? 'Dismiss all' : 'Dismiss'}
        </button>
      </div>
      {open ? (
        <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
          {rows.slice(1).map((row) => (
            <li key={row.key} className="flex items-start justify-between gap-3 rounded-lg bg-panel/60 px-3 py-2 text-sm">
              <span className="min-w-0 text-snow">
                <span className="font-semibold">{row.title}</span>
                {row.count > 1 ? <span className="text-mist"> ×{row.count}</span> : null}
                {row.detail ? <span className="text-mist"> · {row.detail}</span> : null}
                <span className="text-fog"> · {timeAgo(row.at)}</span>
              </span>
              <button type="button" onClick={() => void dismiss(row)} className="shrink-0 text-xs font-semibold text-mist hover:text-snow">
                Dismiss
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
