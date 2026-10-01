/** Shared run lifecycle types for Outreach, Group Poster, Friend DMs, SEO Blog. */

export type AutomationStatus =
  | 'idle'
  | 'waiting_login'
  | 'running'
  | 'paused'
  | 'waiting'
  | 'sending'
  | 'done'
  | 'error'

export type AutomationRunCounts = {
  sent: number
  failed: number
  skipped?: number
  total?: number
}

export type AutomationRunMeta = {
  id: string
  mode?: string | null
  status: AutomationStatus
  message?: string
  error?: string
  currentItem?: string | null
  waitEndsAt?: string | null
  waitLabel?: string | null
  updatedAt?: string
  workerRunning?: boolean
  workerPid?: number
}

export type AutomationRun = AutomationRunMeta & AutomationRunCounts

export function runHealth(run: Pick<AutomationRunMeta, 'status' | 'error' | 'message'>): {
  label: 'Ready' | 'Needs login' | 'Network recovery' | 'Provider down' | 'Paused' | 'Done' | 'Needs review' | 'Running'
  action?: string
} {
  const text = `${run.error || ''} ${run.message || ''}`.toLowerCase()
  if (
    run.status === 'waiting_login' ||
    /(?:needs? login|login required|not logged in|facebook login|messenger_account_access)/.test(text)
  ) {
    return { label: 'Needs login', action: 'Open the browser and complete login' }
  }
  if (/network_disconnected|chrome_error|connection lost/.test(text)) {
    return { label: 'Network recovery', action: 'Restore the connection, then resume' }
  }
  if (/provider_circuit_open|provider unavailable|fetch failed/.test(text)) {
    return { label: 'Provider down', action: 'Check provider health, then resume' }
  }
  if (/delivery_failed|not confirmed|needs.review/.test(text)) {
    return { label: 'Needs review', action: 'Review the saved screenshot before retrying' }
  }
  if (run.status === 'paused' || run.status === 'waiting') return { label: 'Paused' }
  if (run.status === 'done') return { label: 'Done' }
  if (run.status === 'idle') return { label: 'Ready' }
  if (run.status === 'error') return { label: 'Needs review' }
  return { label: 'Running' }
}

export function normalizeAutomationStatus(raw: string | undefined): AutomationStatus {
  const s = (raw || 'idle').toLowerCase()
  if (s === 'waiting_login') return 'waiting_login'
  if (s === 'running') return 'running'
  if (s === 'paused') return 'paused'
  if (s === 'waiting') return 'waiting'
  if (s === 'sending') return 'sending'
  if (s === 'done') return 'done'
  if (s === 'error') return 'error'
  return 'idle'
}

export function statusLabel(status: AutomationStatus | string): string {
  const map: Record<string, string> = {
    idle: 'Idle',
    waiting_login: 'Waiting for login',
    running: 'Running',
    paused: 'Paused',
    waiting: 'Waiting',
    sending: 'Sending',
    done: 'Done',
    error: 'Error',
  }
  return map[status] || status
}

export function statusTone(status: string): string {
  if (status === 'running' || status === 'sending') return 'text-phosphor'
  if (status === 'waiting_login' || status === 'paused' || status === 'waiting')
    return 'text-brass'
  if (status === 'error') return 'text-ember'
  if (status === 'done') return 'text-phosphor'
  return 'text-mist'
}

export function isActiveAutomation(status: string): boolean {
  return (
    status === 'running' ||
    status === 'waiting_login' ||
    status === 'paused' ||
    status === 'waiting' ||
    status === 'sending'
  )
}

export function formatWaitSec(sec: number) {
  const total = Math.max(0, Math.floor(sec))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}m ${String(s).padStart(2, '0')}s`
}

/** Live countdown text from worker waitEndsAt + waitLabel (optional message hint for friend vs group). */
export function liveWaitText(
  label: string | null | undefined,
  endsAt: string | null | undefined,
  nowMs: number,
  messageHint?: string | null,
) {
  if (!endsAt) return null
  const ends = Date.parse(endsAt)
  if (!Number.isFinite(ends)) return null
  const remaining = Math.max(0, (ends - nowMs) / 1000)
  const t = formatWaitSec(remaining)
  const hint = messageHint || ''
  if (label === 'Waiting') {
    if (hint === 'friend' || hint.includes('friend')) return `Waiting ${t} before next friend`
    if (hint === 'group' || hint.includes('group')) return `Waiting ${t} before next group`
    return `Waiting ${t}`
  }
  if (label === 'Short wait') return `Short wait ${t} after skip`
  if (label === 'Post-wait') return `Post-wait ${t} after join`
  if (label === 'Warm-up') return `Warm-up ${t}`
  if (label) return `${label} ${t}`
  return `Waiting ${t}`
}
