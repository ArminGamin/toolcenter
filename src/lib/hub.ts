import { isActiveAutomation } from './automation-run'

function authHeaders(extra?: HeadersInit): HeadersInit {
  const token =
    typeof window !== 'undefined' && (window as unknown as { __CC_AUTH__?: string }).__CC_AUTH__
  return {
    ...(token ? { 'X-CC-Token': token } : {}),
    ...extra,
  }
}

export type HubModuleSnapshot = {
  id: string
  label: string
  status: string
  message?: string
  sent?: number
  failed?: number
  skipped?: number
  workerRunning?: boolean
  profileId?: string
  profileName?: string
  live?: boolean
}

export type HubSummary = {
  ok: boolean
  at: string
  failures: number
  modules: HubModuleSnapshot[]
  deskOpen: number
  followUpsDue: number
  scope?: 'current' | 'all'
}

const HUB_TO_RAIL: Record<string, string> = {
  outreach: 'outreach',
  'group-poster': 'groupPoster',
  'friend-dms': 'groupPoster',
  'profile-share': 'groupPoster',
  'reddit-commenter': 'redditCommenter',
}

export function hubModuleLive(module: HubModuleSnapshot): boolean {
  return isActiveAutomation(module.status) || Boolean(module.workerRunning)
}

/** Rail ids that currently have a live hub job. */
export function railRunningFromHub(modules: HubModuleSnapshot[]): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const module of modules) {
    if (!hubModuleLive(module)) continue
    const railId = HUB_TO_RAIL[module.id]
    if (railId) out[railId] = true
  }
  return out
}

export async function fetchHubSummary(scope: 'current' | 'all' = 'current'): Promise<HubSummary | null> {
  try {
    const q = scope === 'all' ? '?scope=all' : ''
    const res = await fetch(`/api/hub-summary${q}`, { headers: authHeaders() })
    if (!res.ok) return null
    return (await res.json()) as HubSummary
  } catch {
    return null
  }
}

export async function stopHubModule(
  profileId: string,
  moduleId: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch('/api/hub-summary', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stop', profileId, moduleId }),
    })
    return (await res.json()) as { ok: boolean; message: string }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Stop failed' }
  }
}

export type AutomationFailureItem = {
  id: string
  module: string
  name: string
  path: string
  size: number
  at: string
}

export async function fetchAutomationFailures(limit = 80): Promise<AutomationFailureItem[]> {
  try {
    const res = await fetch(`/api/automation-failures?limit=${limit}`, { headers: authHeaders() })
    if (!res.ok) return []
    const data = (await res.json()) as { failures?: AutomationFailureItem[] }
    return Array.isArray(data.failures) ? data.failures : []
  } catch {
    return []
  }
}

export function automationFailureImageUrl(module: string, name: string): string {
  const q = new URLSearchParams({ module, name })
  return `/api/automation-failures?${q.toString()}`
}

export async function downloadDeskOutcomesCsv(): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch('/api/markets?action=outcomes-export', { headers: authHeaders() })
    if (!res.ok) return { ok: false, message: `Export failed (${res.status})` }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `desk-outcomes-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    return { ok: true, message: 'Desk outcomes exported' }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}
