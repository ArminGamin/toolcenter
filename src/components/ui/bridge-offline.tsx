import { AppLogo } from '../AppLogo'

export const BRIDGE_OFFLINE_TITLE = 'Bridge offline'
export const BRIDGE_OFFLINE_HINT =
  'The local API is not reachable. Start the dev server or use the desktop icon (ToolsAI Control Center) or Start ToolsAI.bat.'

export function BridgeOfflinePanel({
  onRetry,
  compact,
}: {
  onRetry?: () => void
  compact?: boolean
}) {
  return (
    <div
      className={[
        'flex flex-col items-center justify-center gap-3 text-center',
        compact ? 'px-4 py-6' : 'gap-4 px-6',
      ].join(' ')}
    >
      <AppLogo size={compact ? 72 : 96} className="rounded-2xl shadow-glow" />
      <p className="font-mono text-sm text-ember">{BRIDGE_OFFLINE_TITLE}</p>
      <p className="max-w-md text-[13px] text-fog">{BRIDGE_OFFLINE_HINT}</p>
      {!compact && (
        <pre className="rounded-lg border border-lineStrong bg-well px-4 py-3 font-mono text-xs text-snow max-w-full overflow-x-auto">
          cd D:\toolsai\control-center{'\n'}npm run dev
        </pre>
      )}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-[44px] rounded-lg border border-brass/40 bg-brass/15 px-4 py-2 font-mono text-[11px] uppercase tracking-wide text-brass"
        >
          Retry
        </button>
      ) : null}
    </div>
  )
}

export function BridgeOfflineBanner({
  message,
  onRetry,
}: {
  message?: string | null
  onRetry?: () => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ember/40 bg-ember/10 px-3 py-2">
      <span className="font-mono text-xs text-ember">
        {message || BRIDGE_OFFLINE_TITLE}
      </span>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-[36px] rounded-md border border-ember/30 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-ember hover:bg-ember/10"
        >
          Retry
        </button>
      ) : null}
    </div>
  )
}
