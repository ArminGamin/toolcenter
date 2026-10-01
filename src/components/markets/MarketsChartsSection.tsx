import type { MarketsConfig } from '../../lib/markets'

export function MarketsChartsSection({
  config,
  activeTv,
  setChartSymbol,
}: {
  config: MarketsConfig | null
  activeTv: string
  setChartSymbol: (tv: string) => void
}) {
  return (
    <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5 rounded-xl border border-lineStrong bg-well p-2">
            {(config?.symbols || []).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setChartSymbol(s.tv)}
                className={[
                  'rounded-lg border px-2.5 py-1 font-mono text-xs transition',
                  activeTv === s.tv
                    ? 'border-brass/40 bg-brass/20 text-snow'
                    : 'border-transparent text-mist hover:border-lineStrong hover:text-snow',
                ].join(' ')}
              >
                {s.symbol}
                <span className="ml-1 text-xs text-fog">{s.kind === 'stock' ? 'eq' : 'fx'}</span>
              </button>
            ))}
          </div>
          <div className="overflow-hidden rounded-2xl border border-brass/20 bg-ink shadow-[inset_0_1px_0_rgb(var(--accent-brass)/0.08)]">
            <iframe
              title={`TradingView ${activeTv}`}
              src={`https://www.tradingview.com/widgetembed/?frameElementId=tv_${encodeURIComponent(activeTv)}&symbol=${encodeURIComponent(activeTv)}&interval=15&hidesidetoolbar=0&hidetoptoolbar=0&symboledit=1&saveimage=0&toolbarbg=0f1e33&studies=%5B%5D&theme=dark&style=1&timezone=Etc%2FUTC&withdateranges=1&hideideas=1&hidevolume=0&allow_symbol_change=1`}
              className="h-[max(340px,calc(100dvh-420px))] w-full border-0"
              allowFullScreen
            />
          </div>
        </div>
  )
}
