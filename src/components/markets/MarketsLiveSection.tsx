import type { MarketQuote, MarketQuoteHistory, LiveHistoryWindow } from '../../lib/markets'
import { LIVE_HISTORY_WINDOWS } from '../../lib/markets'
import type { WatchSymbol } from '../../lib/markets'
import { SymbolLogo } from '../SymbolLogo'
import { EmptyState } from '../ui/primitives'
import { LiveSparkline } from './LiveSparkline'

export function MarketsLiveSection({
  quotes,
  liveWindow,
  setLiveWindow,
  liveHistoryById,
  liveHistoryLoading,
  watchById,
  onOpenChart,
}: {
  quotes: MarketQuote[]
  liveWindow: LiveHistoryWindow
  setLiveWindow: (w: LiveHistoryWindow) => void
  liveHistoryById: Map<string, MarketQuoteHistory>
  liveHistoryLoading: boolean
  watchById: Map<string, WatchSymbol>
  onOpenChart: (tv: string) => void
}) {
  return (
    <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-lineStrong bg-raised px-3 py-2">
            <div>
              <div className="font-mono text-xs uppercase tracking-[0.16em] text-brass">
                Price path · selected window
              </div>
              <p className="mt-0.5 text-xs text-mist">
                Change compares the first and latest available intraday print in the selected window.
              </p>
            </div>
            <div
              aria-label="Live chart timeframe"
              className="flex flex-wrap items-center gap-1 rounded-lg border border-lineStrong bg-well p-0.5 font-mono text-xs uppercase tracking-wider"
            >
              <div aria-label="Minute windows" className="flex">
                {LIVE_HISTORY_WINDOWS.filter((window) => window.unit === 'minute').map((window) => (
                  <button
                    key={window.id}
                    type="button"
                    onClick={() => setLiveWindow(window)}
                    aria-pressed={liveWindow.id === window.id}
                    className={[
                      'rounded-md px-2 py-1 transition',
                      liveWindow.id === window.id
                        ? 'bg-brass/20 text-snow shadow-[inset_0_0_0_1px_rgb(var(--accent-brass)/0.4)]'
                        : 'text-fog hover:text-mist',
                    ].join(' ')}
                  >
                    {window.label}
                  </button>
                ))}
              </div>
              <span aria-hidden className="h-4 w-px bg-lineStrong" />
              <div aria-label="Hour windows" className="flex">
                {LIVE_HISTORY_WINDOWS.filter((window) => window.unit === 'hour').map((window) => (
                  <button
                    key={window.id}
                    type="button"
                    onClick={() => setLiveWindow(window)}
                    aria-pressed={liveWindow.id === window.id}
                    className={[
                      'rounded-md px-2 py-1 transition',
                      liveWindow.id === window.id
                        ? 'bg-brass/20 text-snow shadow-[inset_0_0_0_1px_rgb(var(--accent-brass)/0.4)]'
                        : 'text-fog hover:text-mist',
                    ].join(' ')}
                  >
                    {window.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 min-[1400px]:grid-cols-4 min-[1600px]:grid-cols-5">
            {quotes.length === 0 ? (
              <div className="col-span-full">
                <EmptyState title="No quotes yet" />
              </div>
            ) : (
              quotes.map((q) => {
                const history = liveHistoryById.get(q.id)
                const changePct = history?.changePct ?? null
                const up = (changePct ?? 0) >= 0
                const isCrypto = q.kind === 'crypto'
                const watch = watchById.get(q.id)
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => {
                      onOpenChart(q.tv)
                    }}
                    className={[
                      'group relative overflow-hidden rounded-2xl border p-4 text-left transition',
                      'border-lineStrong bg-raised',
                      'hover:border-brass/40 hover:shadow-[0_0_0_1px_rgb(var(--accent-brass)/0.12)]',
                    ].join(' ')}
                  >
                    <div
                      aria-hidden
                      className={[
                        'pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full blur-2xl',
                        up ? 'bg-phosphor/10' : 'bg-ember/10',
                      ].join(' ')}
                    />
                    <div className="relative flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <SymbolLogo
                          symbol={q.symbol}
                          kind={q.kind}
                          coingecko={watch?.coingecko}
                          domain={watch?.domain}
                          size={40}
                          className="mt-0.5"
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={[
                                'rounded px-1.5 py-1 font-mono text-xs uppercase tracking-wider',
                                isCrypto
                                  ? 'border border-brass/30 bg-brass/10 text-brass'
                                  : 'border border-snow/15 bg-snow/5 text-mist',
                              ].join(' ')}
                            >
                              {q.kind}
                            </span>
                            {isCrypto && (
                              <span className="inline-flex items-center gap-1 font-mono text-xs uppercase tracking-wider text-phosphor/80">
                                <span className="h-1 w-1 animate-pulse rounded-full bg-phosphor" />
                                tape
                              </span>
                            )}
                          </div>
                          <div className="mt-1.5 text-lg font-semibold tracking-tight text-snow">
                            {q.symbol}
                          </div>
                          <div className="truncate text-xs text-mist">{q.label}</div>
                        </div>
                      </div>
                      <div
                        className={[
                          'rounded-lg border px-2 py-1 font-mono text-xs tabular-nums',
                          up
                            ? 'border-phosphor/30 bg-phosphor/15 text-phosphor'
                            : 'border-ember/30 bg-ember/15 text-ember',
                        ].join(' ')}
                      >
                        {changePct == null ? '-' : `${up ? '+' : ''}${changePct.toFixed(2)}%`}
                        <span className="ml-1 text-xs text-fog">· {liveWindow.label}</span>
                      </div>
                    </div>
                    <div className="relative mt-4 font-mono text-2xl tabular-nums tracking-tight text-snow">
                      {q.price == null
                        ? '-'
                        : `$${q.price.toLocaleString(undefined, {
                            maximumFractionDigits: q.price >= 100 ? 2 : 6,
                          })}`}
                    </div>
                    <div className="relative mt-3 border-y border-line py-2">
                      <div className="mb-1 flex items-center justify-between font-mono text-xs uppercase tracking-wider">
                        <span className="text-fog">
                          {liveHistoryLoading ? 'Refreshing path…' : `Path · ${liveWindow.label}`}
                        </span>
                        <span className={up ? 'text-phosphor/80' : 'text-ember/80'}>
                          {history?.points.length ? `${history.points.length} prints` : 'No prints'}
                        </span>
                      </div>
                      <LiveSparkline
                        points={history?.points || []}
                        up={up}
                        label={`${q.symbol} price path over the last ${liveWindow.label}`}
                      />
                    </div>
                    <div className="relative mt-2 flex items-center justify-between font-mono text-xs uppercase tracking-wider text-mist">
                      <span>{history?.source || q.source || 'quote'}</span>
                      <span className="text-brass/70 opacity-0 transition group-hover:opacity-100">
                        open full chart →
                      </span>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
  )
}
