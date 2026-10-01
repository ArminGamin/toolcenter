/**
 * Central "something failed" list. Anything that fails in the background
 * (automation errors, timeouts, a helper that would not start) is raised here so
 * the UI can show one banner and the desktop app can show a notification,
 * instead of the failure disappearing into a log.
 */

export type AlertLevel = 'error' | 'critical'

export type Alert = {
  id: string
  at: string
  level: AlertLevel
  title: string
  detail: string
  source?: string
  /** Times the same failure repeated while still undismissed. */
  count: number
}

type AlertStore = { alerts: Alert[]; seq: number }

const MAX_ALERTS = 50
const REPEAT_WINDOW_MS = 10 * 60_000

// Survive module re-evaluation (dev server reloads) by keeping state on globalThis.
const g = globalThis as typeof globalThis & { __ccAlerts?: AlertStore }
const store: AlertStore = (g.__ccAlerts ??= { alerts: [], seq: 0 })

export function raiseAlert(
  title: string,
  detail: string,
  opts: { level?: AlertLevel; source?: string } = {},
): Alert {
  const cleanTitle = String(title || 'Something failed').slice(0, 160)
  const cleanDetail = String(detail || '').slice(0, 1200)
  const now = Date.now()
  const repeat = store.alerts.find(
    (a) => a.title === cleanTitle && a.detail === cleanDetail && now - Date.parse(a.at) < REPEAT_WINDOW_MS,
  )
  if (repeat) {
    repeat.count += 1
    repeat.at = new Date(now).toISOString()
    return repeat
  }
  const alert: Alert = {
    id: `${now.toString(36)}-${(store.seq += 1)}`,
    at: new Date(now).toISOString(),
    level: opts.level || 'error',
    title: cleanTitle,
    detail: cleanDetail,
    source: opts.source,
    count: 1,
  }
  store.alerts.unshift(alert)
  if (store.alerts.length > MAX_ALERTS) store.alerts.length = MAX_ALERTS
  console.error(`[alert] ${alert.title}${alert.detail ? ` — ${alert.detail}` : ''}`)
  return alert
}

export function listAlerts(): Alert[] {
  return store.alerts.map((a) => ({ ...a }))
}

export function dismissAlert(id: string): boolean {
  const before = store.alerts.length
  store.alerts = store.alerts.filter((a) => a.id !== id)
  return store.alerts.length !== before
}

export function dismissAllAlerts(): void {
  store.alerts = []
}

/** Human message for an error, calling out timeouts explicitly. */
export function describeFailure(err: unknown, timeoutHint?: string): string {
  const name = err instanceof Error ? err.name : ''
  const message = err instanceof Error ? err.message : String(err)
  if (name === 'TimeoutError' || /timed? ?out|aborted due to timeout/i.test(message)) {
    return timeoutHint ? `Timed out: ${timeoutHint}` : `Timed out (${message})`
  }
  return message
}
