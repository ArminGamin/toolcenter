import { useCallback, useEffect, useState } from 'react'
import { fetchHubSummary, hubModuleLive } from '../lib/hub'

type UpdateStatus = { available: boolean; ui: boolean; server: boolean }

type DesktopBridge = {
  updateStatus: () => Promise<UpdateStatus>
  applyUpdate: () => Promise<{ ok: boolean; message?: string }>
}

declare global {
  interface Window {
    ccDesktop?: DesktopBridge
  }
}

const CHECK_EVERY_MS = 60_000

/**
 * The desktop app no longer rebuilds itself on start; new code waits here until
 * you choose to apply it (rebuilds the UI if needed and restarts the services).
 */
export function UpdateButton() {
  const desktop = window.ccDesktop
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [busy, setBusy] = useState(false)

  const check = useCallback(async () => {
    if (!desktop) return
    try {
      setStatus(await desktop.updateStatus())
    } catch {
      /* main process busy */
    }
  }, [desktop])

  useEffect(() => {
    void check()
    const id = window.setInterval(() => void check(), CHECK_EVERY_MS)
    return () => window.clearInterval(id)
  }, [check])

  if (!desktop) return null
  const available = Boolean(status?.available)

  async function apply() {
    if (!desktop || busy) return
    const summary = await fetchHubSummary('all')
    const live = (summary?.modules || []).filter(hubModuleLive).map((m) => m.label)
    if (live.length && !window.confirm(`${live.join(', ')} still running. Updating restarts the services and stops ${live.length === 1 ? 'it' : 'them'}. Update anyway?`)) {
      return
    }
    setBusy(true)
    try {
      const result = await desktop.applyUpdate()
      if (!result.ok) window.alert(result.message || 'Update failed.')
    } finally {
      setBusy(false)
    }
  }

  const label = busy ? 'Updating…' : available ? 'Update ready' : 'Up to date'
  return (
    <div className="mt-2 flex w-full shrink-0 justify-center max-[860px]:mt-0 max-[860px]:w-auto">
      <button
        type="button"
        onClick={() => void (available ? apply() : check())}
        disabled={busy}
        aria-label={available ? 'Install update' : 'Check for updates'}
        title={available ? 'Install the latest changes' : 'No changes waiting. Click to check again.'}
        className={[
          'group relative flex h-11 w-11 items-center justify-center rounded-2xl border transition disabled:opacity-60',
          available
            ? 'border-emerald-400 bg-emerald-500 text-white shadow-[0_0_18px_rgba(16,185,129,0.55)] hover:bg-emerald-400'
            : 'border-lineStrong text-fog hover:bg-lift hover:text-snow',
        ].join(' ')}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={busy ? 'animate-spin' : ''}>
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <path d="M21 4v5h-5" />
        </svg>
        {available && !busy ? (
          <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-panel bg-emerald-300 animate-pulse" aria-hidden="true" />
        ) : null}
        <span className="pointer-events-none absolute left-[60px] top-1/2 z-30 -translate-y-1/2 -translate-x-1 whitespace-nowrap rounded-lg border border-lineStrong bg-lift px-2.5 py-1 font-mono text-[11px] text-snow opacity-0 shadow-panel transition group-hover:translate-x-0 group-hover:opacity-100 max-[860px]:hidden">
          {label}
        </span>
      </button>
    </div>
  )
}
