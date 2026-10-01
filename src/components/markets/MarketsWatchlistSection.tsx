import type { Dispatch, SetStateAction } from 'react'
import type { MarketsConfig, WatchSymbol } from '../../lib/markets'
import { savePortfolioConfig } from '../../lib/markets'
import { SymbolLogo } from '../SymbolLogo'

export function MarketsWatchlistSection({
  config,
  setConfig,
  persist,
  busy,
  setBusy,
  accountEquityDraft,
  setAccountEquityDraft,
  accountEquityUsd,
  setAccountEquityUsd,
  onToast,
  presets,
  watchedIds,
  togglePreset,
  removeSymbol,
  customSymbol,
  setCustomSymbol,
  customKind,
  setCustomKind,
  addCustom,
}: {
  config: MarketsConfig
  setConfig: Dispatch<SetStateAction<MarketsConfig | null>>
  persist: (next: MarketsConfig) => Promise<void>
  busy: boolean
  setBusy: (busy: boolean) => void
  accountEquityDraft: string
  setAccountEquityDraft: (draft: string) => void
  accountEquityUsd: number | null
  setAccountEquityUsd: (usd: number | null) => void
  onToast: (message: string | null) => void
  presets: WatchSymbol[]
  watchedIds: Set<string>
  togglePreset: (p: WatchSymbol) => void
  removeSymbol: (id: string) => void
  customSymbol: string
  setCustomSymbol: (sym: string) => void
  customKind: 'crypto' | 'stock'
  setCustomKind: (kind: 'crypto' | 'stock') => void
  addCustom: () => void
}) {
  return (
        <div className="fit-stack space-y-5">
          <div className="rounded-xl border border-lineStrong bg-panel p-4">
            <h3 className="text-sm font-semibold text-snow">Alert settings</h3>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="font-mono text-xs uppercase tracking-wider text-mist">
                  Alert % move
                </span>
                <input
                  type="number"
                  value={config.alertPct}
                  onChange={(e) =>
                    setConfig({ ...config, alertPct: Number(e.target.value) || 3 })
                  }
                  className="mt-1 block w-24 rounded-lg border border-lineStrong bg-well px-3 py-2 font-mono text-sm text-snow placeholder:text-fog"
                />
              </label>
              <label className="flex items-center gap-2 pb-2 font-mono text-xs text-mist">
                <input
                  type="checkbox"
                  checked={config.discordAlerts}
                  onChange={(e) =>
                    setConfig({ ...config, discordAlerts: e.target.checked })
                  }
                />
                Discord alerts
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() => void persist(config)}
                className="rounded-lg border border-brass/40 bg-brass/15 px-3 py-2 font-mono text-xs text-brass hover:bg-brass/25 disabled:opacity-40"
              >
                Save alerts
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-lineStrong bg-panel p-4">
            <h3 className="text-sm font-semibold text-snow">Account equity (desk risk)</h3>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="font-mono text-xs uppercase tracking-wider text-mist">
                  Account size (USD)
                </span>
                <input
                  type="number"
                  min={0}
                  step={100}
                  placeholder="e.g. 30000"
                  value={accountEquityDraft}
                  onChange={(e) => setAccountEquityDraft(e.target.value)}
                  className="mt-1 block w-40 rounded-lg border border-lineStrong bg-well px-3 py-2 font-mono text-sm text-snow placeholder:text-fog"
                />
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void (async () => {
                    setBusy(true)
                    const raw = accountEquityDraft.trim()
                    const n = raw === '' ? null : Number(raw)
                    const res = await savePortfolioConfig({
                      accountEquityUsd: n != null && Number.isFinite(n) && n > 0 ? n : null,
                    })
                    setBusy(false)
                    if (res.ok && res.config) {
                      setAccountEquityUsd(res.config.accountEquityUsd)
                      setAccountEquityDraft(
                        res.config.accountEquityUsd != null
                          ? String(res.config.accountEquityUsd)
                          : '',
                      )
                      onToast(res.message || 'Account size saved')
                    } else {
                      onToast(res.message || 'Save failed')
                    }
                  })()
                }}
                className="rounded-lg border border-brass/40 bg-brass/15 px-3 py-2 font-mono text-xs text-brass hover:bg-brass/25 disabled:opacity-40"
              >
                Save account size
              </button>
              {accountEquityUsd == null && (
                <span className="pb-2 font-mono text-xs text-brass">
                  Unset - desk shows % budget only, not dollars
                </span>
              )}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-snow">On your list</h3>
            <div className="flex flex-wrap gap-2">
              {config.symbols.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => removeSymbol(s.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-lineStrong bg-raised px-2 py-1.5 font-mono text-xs text-mist hover:border-ember/40 hover:text-ember"
                  title="Remove"
                >
                  <SymbolLogo
                    symbol={s.symbol}
                    kind={s.kind}
                    coingecko={s.coingecko}
                    domain={s.domain}
                    size={20}
                  />
                  {s.symbol}
                  <span className="text-fog">{s.kind === 'stock' ? 'eq' : 'fx'}</span> ×
                </button>
              ))}
              {config.symbols.length === 0 && (
                <span className="text-sm text-fog">Empty - pick presets below</span>
              )}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-snow">Add from presets</h3>
            <div className="flex flex-wrap gap-2">
              {presets.map((p) => {
                const on = watchedIds.has(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePreset(p)}
                    className={[
                      'rounded-lg border px-2.5 py-1.5 font-mono text-xs transition',
                      on
                        ? 'border-phosphor/40 bg-phosphor/10 text-phosphor'
                        : 'border-lineStrong text-mist hover:text-snow',
                    ].join(' ')}
                  >
                    {on ? '✓ ' : '+ '}
                    {p.symbol}
                    <span className="ml-1 text-fog">{p.kind}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-lineStrong bg-panel p-4">
            <h3 className="text-sm font-semibold text-snow">Custom ticker</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              <select
                value={customKind}
                onChange={(e) => setCustomKind(e.target.value as 'crypto' | 'stock')}
                className="rounded-lg border border-lineStrong bg-well px-2 py-2 font-mono text-xs text-mist"
              >
                <option value="stock">Stock</option>
                <option value="crypto">Crypto</option>
              </select>
              <input
                value={customSymbol}
                onChange={(e) => setCustomSymbol(e.target.value)}
                placeholder={customKind === 'crypto' ? 'e.g. AVAX' : 'e.g. AMD'}
                className="min-w-[140px] flex-1 rounded-lg border border-lineStrong bg-well px-3 py-2 font-mono text-sm uppercase text-snow placeholder:text-fog"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addCustom()
                  }
                }}
              />
              <button
                type="button"
                onClick={addCustom}
                className="rounded-lg border border-brass/40 bg-brass/15 px-3 py-2 font-mono text-xs text-brass"
              >
                Add
              </button>
            </div>
          </div>
        </div>
  )
}
