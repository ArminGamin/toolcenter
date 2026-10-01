import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_UGC_VAULT_SETTINGS,
  fetchUgcOllamaStatus,
  shortOllamaModelName,
  type UgcOllamaStatusView,
  type UgcVaultSettings,
} from '../../lib/ugc-slides'
import { inputCls } from '../ui/primitives'

const POLL_MS = 25_000

function useUgcOllamaStatus(active: boolean, model: string) {
  const [status, setStatus] = useState<UgcOllamaStatusView | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const next = await fetchUgcOllamaStatus()
      setStatus(next)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!active) return
    void refresh()
    const id = window.setInterval(() => void refresh(), POLL_MS)
    return () => window.clearInterval(id)
  }, [active, refresh, model])

  return { status, loading, refresh }
}

type Props = {
  active: boolean
  vaultSettings: UgcVaultSettings
  onModelChange: (model: string) => void
  compact?: boolean
}

export function UgcOllamaModelBar({
  active,
  vaultSettings,
  onModelChange,
  compact = false,
}: Props) {
  const selectedModel = vaultSettings.OLLAMA_MODEL || DEFAULT_UGC_VAULT_SETTINGS.OLLAMA_MODEL
  const { status, loading, refresh } = useUgcOllamaStatus(active, selectedModel)

  const online = status?.online === true
  const modelReady = status?.modelReady === true
  const models = status?.models ?? []
  const effectiveModel = status?.model || selectedModel

  const statusLabel = !online
    ? 'Offline'
    : modelReady
      ? 'Ready'
      : 'Model missing'

  const statusColor = !online
    ? 'bg-ember shadow-[0_0_8px_rgb(var(--accent-danger)/0.5)]'
    : modelReady
      ? 'bg-phosphor shadow-[0_0_8px_rgb(var(--accent-success)/0.45)]'
      : 'bg-brass shadow-[0_0_8px_rgb(var(--accent-brass)/0.45)]'

  const statusTextColor = !online ? 'text-ember' : modelReady ? 'text-phosphor' : 'text-brass'

  return (
    <div
      className={[
        'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-panel',
        compact ? 'px-3 py-2' : 'px-4 py-3',
      ].join(' ')}
    >
      <div className="flex items-center gap-2">
        <span
          className={['h-2.5 w-2.5 shrink-0 rounded-full', statusColor].join(' ')}
          title={statusLabel}
          aria-hidden
        />
        <span className={`font-mono text-[10px] uppercase tracking-wide ${statusTextColor}`}>
          {statusLabel}
        </span>
        {online && status?.url ? (
          <span className="hidden font-mono text-[10px] text-fog sm:inline" title={status.url}>
            Ollama
          </span>
        ) : null}
      </div>

      <span className="hidden h-4 w-px bg-lineStrong sm:block" aria-hidden />

      <div className="grid min-w-0 flex-1 basis-full grid-cols-[minmax(0,1fr)_44px] items-center gap-2 sm:flex sm:basis-0">
        <label
          htmlFor="ugc-ollama-model"
          className="col-span-2 shrink-0 font-mono text-[10px] uppercase tracking-wide text-fog"
        >
          AI model
        </label>
        <select
          id="ugc-ollama-model"
          className={`${inputCls} min-w-0 max-w-full flex-1 sm:min-w-[12rem]`}
          value={selectedModel}
          onChange={(e) => onModelChange(e.target.value)}
        >
          {!models.length ? (
            <option value={selectedModel}>{shortOllamaModelName(selectedModel)}</option>
          ) : null}
          {models
            .slice()
            .sort((a, b) => {
              const rank = (m: string) =>
                /^ugc-lt-gpu/i.test(m) ? 0 : /^ugc-lt-fast/i.test(m) ? 2 : /openeurollm/i.test(m) ? 3 : 1
              return rank(a) - rank(b) || a.localeCompare(b)
            })
            .map((m) => (
            <option key={m} value={m}>
              {shortOllamaModelName(m)}
              {/^ugc-lt-gpu/i.test(m)
                ? ' (LT quality + GPU)'
                : /^ugc-lt-fast/i.test(m)
                  ? ' (fast EN - avoid for LT)'
                  : ''}
            </option>
          ))}
          {selectedModel && !models.includes(selectedModel) ? (
            <option value={selectedModel}>{shortOllamaModelName(selectedModel)}</option>
          ) : null}
        </select>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="min-h-11 shrink-0 rounded-lg border border-lineStrong bg-well px-3 py-2 text-sm text-mist hover:border-brass/30 disabled:opacity-50"
          title="Refresh Ollama status"
        >
          {loading ? '…' : '↻'}
        </button>
      </div>

      <div className="w-full text-xs text-fog sm:w-auto sm:max-w-[min(100%,28rem)]">
        <span className="font-mono text-[10px] uppercase tracking-wide text-mist">Active </span>
        <span className="text-snow" title={effectiveModel}>
          {shortOllamaModelName(effectiveModel)}
        </span>
        {status?.message && !modelReady ? (
          <p className="mt-1 font-mono text-[10px] leading-snug text-fog">{status.message}</p>
        ) : online && modelReady ? (
          <p className="mt-0.5 font-mono text-[10px] text-fog">Lithuanian copy via local Ollama</p>
        ) : null}
      </div>
    </div>
  )
}
