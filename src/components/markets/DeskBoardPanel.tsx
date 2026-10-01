import type { DeskBoard, DeskDirective, WatchSymbol } from '../../lib/markets'
import { SymbolLogo } from '../SymbolLogo'
import { directiveToneClass } from './markets-desk-helpers'
import { OddsBadge } from './markets-desk-ui'

export function DeskBoardPanel({
  deskBoard,
  deskAsset,
  watchById,
}: {
  deskBoard: DeskBoard
  deskAsset: 'crypto' | 'stock'
  watchById: Map<string, WatchSymbol>
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-lineStrong bg-panel p-4">
        <div className="font-mono text-xs uppercase tracking-[0.16em] text-brass">
          Money printer · {deskAsset === 'stock' ? 'stocks' : 'crypto'} · strict laws
        </div>
        {(() => {
          const d =
            deskBoard.directive ||
            ({
              verb: 'WATCH',
              label: 'WATCH - wait for all laws green',
              tone: 'watch',
            } satisfies DeskDirective)
          return (
            <div className="mt-3 flex flex-wrap items-stretch gap-3">
              <div
                className={[
                  'min-w-0 flex-1 rounded-xl border px-4 py-3.5',
                  directiveToneClass(d.tone),
                ].join(' ')}
              >
                <div className="font-mono text-xs uppercase tracking-[0.12em] text-snow/80">
                  Do this
                </div>
                <div className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                  {d.verb}
                </div>
                <div className="mt-1.5 text-sm leading-relaxed text-snow/90">{d.label}</div>
              </div>
              {(typeof deskBoard.successPct === 'number' || deskBoard.chanceLabel) && (
                <OddsBadge pct={deskBoard.successPct} label={deskBoard.chanceLabel} large />
              )}
            </div>
          )
        })()}
        {(deskBoard.riskBudgetLabel || deskBoard.needsAccountSize) && (
          <div
            className={[
              'mt-2 rounded-lg border px-3 py-2.5 font-mono text-xs leading-relaxed',
              deskBoard.needsAccountSize
                ? 'border-brass/35 bg-brass/10 text-brass'
                : 'border-lineStrong bg-raised text-mist',
            ].join(' ')}
          >
            {deskBoard.riskBudgetLabel ||
              'Set account size in Markets → Watchlist for dollar-based risk caps'}
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className={[
              'rounded px-2 py-0.5 font-mono text-xs uppercase tracking-wider',
              deskBoard.printerArmed ? 'bg-phosphor/20 text-phosphor' : 'bg-ember/20 text-ember',
            ].join(' ')}
          >
            {deskBoard.printerArmed ? `ARMED ×${deskBoard.armedCount ?? 1}` : 'LOCKED'}
          </span>
          <span className="text-sm text-mist">{deskBoard.bestPlay}</span>
        </div>
        <p className="mt-2 max-w-xl text-xs leading-relaxed text-mist">{deskBoard.tip}</p>
        <div className="mt-3 flex flex-wrap gap-2 font-mono text-xs uppercase tracking-wider">
          <div className="rounded border border-lineStrong px-2 py-1 text-mist">
            Bias{' '}
            <span
              className={
                deskBoard.cashBias === 'long'
                  ? 'text-phosphor'
                  : deskBoard.cashBias === 'short'
                    ? 'text-ember'
                    : 'text-snow'
              }
            >
              {deskBoard.cashBias}
            </span>
          </div>
          <div className="rounded border border-lineStrong px-2 py-1 text-mist">
            Heat <span className="text-snow">{deskBoard.heat}</span>
          </div>
          <div className="rounded border border-lineStrong px-2 py-1 text-phosphor">
            Armed {deskBoard.nowCount}
          </div>
          <div className="rounded border border-lineStrong px-2 py-1 text-brass">
            Watch {deskBoard.watchCount}
          </div>
          <div className="rounded border border-lineStrong px-2 py-1 text-ember">
            Avoid {deskBoard.avoidCount}
          </div>
        </div>
        {deskBoard.laws && deskBoard.laws.length > 0 && (
          <details className="mt-3 border-t border-line pt-3">
            <summary className="cursor-pointer font-mono text-xs uppercase tracking-wider text-brass">
              Strict laws the printer must follow
            </summary>
            <ol className="mt-2.5 list-decimal space-y-2 pl-4 text-xs leading-relaxed text-mist">
              {deskBoard.laws.map((law) => (
                <li key={law}>{law}</li>
              ))}
            </ol>
          </details>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-ember/25 bg-gradient-to-br from-ember/10 to-panel p-4">
          <div className="font-mono text-xs uppercase tracking-[0.16em] text-ember">
            Hot movement
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-mist">
            Biggest tape movers across watchlist + presets (public quotes).
          </p>
          <div className="mt-3 space-y-1.5">
            {(deskBoard.hotMovers || []).slice(0, 6).map((m) => {
              const watch = [...watchById.values()].find(
                (symbol) => symbol.symbol.toUpperCase() === m.symbol.toUpperCase(),
              )
              return (
                <div
                  key={`hot-${m.symbol}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-lineStrong bg-raised px-3 py-2.5 shadow-card"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <SymbolLogo
                      symbol={m.symbol}
                      kind={m.kind}
                      domain={watch?.domain}
                      coingecko={watch?.coingecko}
                      size={26}
                    />
                    <div className="min-w-0">
                      <div className="text-base font-bold tracking-tight text-snow">{m.symbol}</div>
                      <div className="truncate font-mono text-xs text-fog">
                        {m.label} · {m.note}
                      </div>
                    </div>
                  </div>
                  <div
                    className={[
                      'shrink-0 font-mono text-base font-bold tabular-nums',
                      m.changePct >= 0 ? 'text-phosphor' : 'text-ember',
                    ].join(' ')}
                  >
                    {m.changePct >= 0 ? '+' : ''}
                    {m.changePct.toFixed(2)}%
                  </div>
                </div>
              )
            })}
            {!deskBoard.hotMovers?.length && (
              <div className="text-xs text-fog">No large movers yet.</div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-phosphor/25 bg-gradient-to-br from-phosphor/10 to-panel p-4">
          <div className="font-mono text-xs uppercase tracking-[0.16em] text-phosphor">
            What top people are doing
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-mist">
            {deskAsset === 'stock'
              ? 'Named executive Form 4 activity + Yahoo options/flow - public legal tape only.'
              : 'OKX verified copy-lead fills. Executive Form 4 is a stock-desk EDGAR source.'}
          </p>
          <div className="mt-3 space-y-1.5">
            {(deskBoard.topPeople || []).slice(0, 6).map((p, i) => (
              <div
                key={`tp-${p.symbol}-${i}`}
                className="rounded-lg border border-lineStrong bg-raised px-3 py-2.5 shadow-card"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-bold tracking-tight text-snow">{p.symbol}</span>
                  <span
                    className={[
                      'rounded px-1.5 py-1 font-mono text-xs uppercase tracking-wider',
                      p.lean === 'buy' || p.lean === 'call'
                        ? 'bg-phosphor/15 text-phosphor'
                        : p.lean === 'sell' || p.lean === 'put'
                          ? 'bg-ember/15 text-ember'
                          : 'bg-brass/15 text-brass',
                    ].join(' ')}
                  >
                    {p.lean}
                  </span>
                  <span className="font-mono text-xs text-mist">{p.activity}</span>
                </div>
                <div className="mt-1 truncate text-xs leading-relaxed text-fog">{p.who}</div>
                <div className="mt-1 truncate font-mono text-xs leading-relaxed text-fog">
                  {p.detail}
                </div>
              </div>
            ))}
            {!deskBoard.topPeople?.length && (
              <div className="text-xs text-fog">
                {deskAsset === 'stock'
                  ? 'No named executive Form 4 or public options lean prints yet.'
                  : 'No public OKX copy-lead fills. No public executive Form 4 on crypto desk - switch to Stocks for CEO/officer EDGAR filings.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
