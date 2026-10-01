import type { DeskFactor, DeskSignal } from '../../lib/markets'
import { directiveToneClass, resolveDirective } from './markets-desk-helpers'
import { OddsBadge } from './markets-desk-ui'

export function DeskTicketCard({
  signal: s,
  deskView,
  deskAsset,
  formatPlaceBy,
}: {
  signal: DeskSignal
  deskView: 'simple' | 'advanced'
  deskAsset: 'crypto' | 'stock'
  formatPlaceBy: (placeBy: string, placeByMs?: number) => string
}) {
  const pb = s.playbook
  const dir = resolveDirective(s)
  const px = (n: number | null | undefined) =>
    n == null
      ? '-'
      : n >= 100
        ? n.toLocaleString(undefined, { maximumFractionDigits: 1 })
        : n.toPrecision(5)
  const hasInsiderProof = (s.proof || []).some((p) =>
    /form 4|edgar|verified insider|insider/i.test(p),
  )
  const insiderProofLines = (s.proof || []).filter((p) => /form 4|edgar|verified insider/i.test(p))
  const optionsProofLines = (s.proof || []).filter((p) =>
    /public options|unusual (call|put)|p\/c vol|lean:/i.test(p),
  )
  const hasOptionsProof = optionsProofLines.length > 0
  const insiderFactor = (s.factors || []).find((f) => f.id === 'insider')
  const optionsFactor = (s.factors || []).find((f) => f.id === 'options')

  return (
    <div
      className={[
        'rounded-xl border px-4 py-3',
        s.urgency === 'now'
          ? 'border-phosphor/40 bg-gradient-to-br from-phosphor/10 to-panel'
          : s.urgency === 'avoid'
            ? 'border-ember/40 bg-gradient-to-br from-ember/10 to-panel'
            : 'border-brass/35 bg-gradient-to-br from-brass/10 to-panel',
      ].join(' ')}
    >
      {deskView === 'simple' && (s.symbol || s.headline) && (
        <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
          {s.symbol && (
            <span className="text-base font-bold tracking-tight text-snow">{s.symbol}</span>
          )}
          {s.headline && <span className="text-sm leading-snug text-mist">{s.headline}</span>}
        </div>
      )}
      <div
        className={[
          'flex flex-wrap items-stretch gap-3 rounded-xl border px-3 py-2.5',
          directiveToneClass(dir.tone),
        ].join(' ')}
      >
        <div className="min-w-0 flex-1">
          <div className="font-mono text-xs uppercase tracking-[0.12em] text-snow/80">Action</div>
          <div className="mt-0.5 text-xl font-semibold tracking-tight sm:text-2xl">{dir.verb}</div>
          <div className="mt-1 text-xs leading-relaxed text-snow/90 sm:text-sm">{dir.label}</div>
        </div>
        <OddsBadge pct={s.successPct} label={s.chanceLabel} />
      </div>

      <p className="mt-3 text-sm leading-relaxed text-snow">{s.plainSummary || s.action}</p>
      <div className="mt-2 rounded-lg border border-lineStrong bg-raised px-3 py-2.5 font-mono text-xs leading-relaxed text-mist">
        {s.riskLabel ||
          'Risk unit unavailable - set account size for dollar risk when a ticket arms.'}
      </div>
      {s.blockReason && (
        <div className="mt-2 rounded-lg border border-ember/35 bg-ember/10 px-3 py-2.5">
          <div className="font-mono text-xs uppercase tracking-wider text-ember">
            Why watch / blocked
          </div>
          <p className="mt-1 text-xs leading-relaxed text-snow">{s.blockReason}</p>
        </div>
      )}

      {deskView === 'advanced' && (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-xs uppercase tracking-wider">
            {typeof s.rank === 'number' && (
              <span className="rounded bg-well px-1.5 py-0.5 text-brass">#{s.rank}</span>
            )}
            <span
              className={
                s.printerArmed
                  ? 'rounded bg-phosphor/20 px-1.5 py-0.5 text-phosphor'
                  : 'rounded bg-ember/15 px-1.5 py-0.5 text-ember'
              }
            >
              {s.printerArmed ? 'armed' : 'locked'}
            </span>
            {s.play && <span className="text-mist">{s.play}</span>}
            {hasOptionsProof && deskAsset === 'stock' && (
              <span className="rounded border border-phosphor/35 bg-phosphor/10 px-1.5 py-0.5 text-phosphor">
                Public options/flow
              </span>
            )}
            {hasInsiderProof && deskAsset === 'stock' && (
              <span className="rounded border border-brass/40 bg-brass/10 px-1.5 py-0.5 text-brass">
                Verified · SEC Form 4 (public)
              </span>
            )}
            <span
              className={
                s.urgency === 'now'
                  ? 'text-phosphor'
                  : s.urgency === 'avoid'
                    ? 'text-ember'
                    : 'text-brass'
              }
            >
              {s.urgency}
            </span>
            {typeof s.edgeScore === 'number' && (
              <>
                <span className="text-fog">·</span>
                <span className="text-snow">edge {s.edgeScore}</span>
              </>
            )}
            {typeof s.successPct === 'number' ? (
              <>
                <span className="text-fog">·</span>
                <span className="rounded border border-phosphor/30 bg-phosphor/10 px-1.5 py-0.5 text-phosphor">
                  HIT RATE {s.successPct}%
                </span>
              </>
            ) : s.chanceLabel ? (
              <>
                <span className="text-fog">·</span>
                <span className="rounded border border-brass/30 bg-brass/10 px-1.5 py-0.5 text-brass">
                  {s.chanceLabel.length > 42
                    ? `${s.chanceLabel.slice(0, 40)}…`
                    : s.chanceLabel}
                </span>
              </>
            ) : null}
            {s.regime && (
              <>
                <span className="text-fog">·</span>
                <span className="text-fog">{s.regime}</span>
              </>
            )}
            {s.symbol && (
              <>
                <span className="text-fog">·</span>
                <span className="text-mist">{s.symbol}</span>
              </>
            )}
          </div>

          <div className="mt-2 text-sm font-semibold text-snow">{s.headline}</div>
          <div className="mt-1 text-xs text-mist">{s.detail}</div>
          <div className="mt-2 text-sm text-snow/90">{s.action}</div>

          {deskAsset === 'stock' && (hasOptionsProof || optionsFactor) && (
            <div className="mt-3 rounded-lg border border-phosphor/30 bg-phosphor/5 p-3">
              <div className="font-mono text-xs uppercase tracking-wider text-phosphor">
                Public options/flow
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-mist">
                Yahoo Finance public option chain (volume, OI, unusual vol/OI). Delayed exchange
                tape - not tip leaks or private channels.
                {optionsFactor ? ` · Factor: ${optionsFactor.note} (${optionsFactor.score})` : ''}
              </p>
              {optionsProofLines.length > 0 && (
                <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-snow/90">
                  {optionsProofLines.slice(0, 5).map((line, i) => (
                    <li key={`opt-${i}`}>· {line}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {deskAsset === 'stock' && (hasInsiderProof || insiderFactor) && (
            <div className="mt-3 rounded-lg border border-brass/35 bg-brass/5 p-3">
              <div className="font-mono text-xs uppercase tracking-wider text-brass">
                Verified insider · public SEC Form 4
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-mist">
                Complementary EDGAR filings (public). Not tip leaks. Options/flow is the priority
                signal when present.
                {insiderFactor ? ` · Factor: ${insiderFactor.note} (${insiderFactor.score})` : ''}
              </p>
              {insiderProofLines.length > 0 && (
                <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-snow/90">
                  {insiderProofLines.slice(0, 4).map((line, i) => (
                    <li key={`vi-${i}`}>· {line}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {s.rules && s.rules.length > 0 && (
            <div className="mt-3 rounded-lg border border-line bg-raised p-3">
              <div className="mb-2 font-mono text-xs uppercase tracking-wider text-brass">
                Strict rule gate · {s.rules.filter((r) => r.pass).length}/{s.rules.length} pass
              </div>
              <div className="grid gap-1 sm:grid-cols-2">
                {s.rules.map((r) => (
                  <div key={r.id} className="flex items-start gap-2 font-mono text-xs">
                    <span className={r.pass ? 'text-phosphor' : 'text-ember'}>
                      {r.pass ? 'PASS' : 'FAIL'}
                    </span>
                    <span className="text-mist">
                      {r.label}
                      <span className="text-fog"> · {r.note}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {pb && (
            <div className="mt-3 grid gap-2 rounded-lg border border-line bg-raised p-3 sm:grid-cols-3 lg:grid-cols-6">
              <div>
                <div className="font-mono text-xs uppercase tracking-wider text-mist">Side</div>
                <div
                  className={[
                    'mt-0.5 text-sm font-semibold uppercase',
                    pb.side === 'long'
                      ? 'text-phosphor'
                      : pb.side === 'short'
                        ? 'text-ember'
                        : 'text-mist',
                  ].join(' ')}
                >
                  {pb.side === 'flat' ? 'FLAT · no trade' : pb.side === 'long' ? 'LONG' : 'SHORT'}
                </div>
              </div>
              <div>
                <div className="font-mono text-xs uppercase tracking-wider text-mist">Entry</div>
                <div className="mt-0.5 text-sm text-snow">{px(pb.entry)}</div>
              </div>
              <div>
                <div className="font-mono text-xs uppercase tracking-wider text-mist">Stop</div>
                <div className="mt-0.5 text-sm text-ember">{px(pb.stop)}</div>
              </div>
              <div>
                <div className="font-mono text-xs uppercase tracking-wider text-mist">T1</div>
                <div className="mt-0.5 text-sm text-phosphor">{px(pb.target1)}</div>
              </div>
              <div>
                <div className="font-mono text-xs uppercase tracking-wider text-mist">T2</div>
                <div className="mt-0.5 text-sm text-phosphor">{px(pb.target2)}</div>
              </div>
              <div>
                <div className="font-mono text-xs uppercase tracking-wider text-mist">R:R</div>
                <div className="mt-0.5 text-sm text-brass">
                  {pb.rr != null ? `${pb.rr.toFixed(2)}x` : '-'}
                </div>
              </div>
              <div className="sm:col-span-3 lg:col-span-3">
                <div className="font-mono text-xs uppercase tracking-wider text-mist">
                  Equity risk
                </div>
                <div className="mt-0.5 text-xs text-snow">{pb.sizeHint}</div>
              </div>
              <div className="sm:col-span-3 lg:col-span-3">
                <div className="font-mono text-xs uppercase tracking-wider text-mist">
                  Invalidation
                </div>
                <div className="mt-0.5 text-xs text-mist">{pb.invalidation}</div>
              </div>
            </div>
          )}

          {s.factors && s.factors.length > 0 && (
            <div className="mt-3">
              {(() => {
                const primary = s.factors.filter(
                  (factor) => !factor.confirmationOnly && factor.tier !== 'confirmation',
                )
                const context = s.factors.filter(
                  (factor) => factor.confirmationOnly || factor.tier === 'confirmation',
                )
                const renderFactor = (f: DeskFactor) => (
                  <div key={f.id} className="flex items-center gap-2" title={f.note}>
                    <div className="w-32 shrink-0 font-mono text-xs text-fog">
                      <div className="truncate">{f.label}</div>
                      {f.id === '13f' && (
                        <div className="mt-0.5 truncate text-xs leading-relaxed">{f.note}</div>
                      )}
                    </div>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink">
                      <div
                        className={[
                          'h-full rounded-full',
                          f.score >= 70 ? 'bg-phosphor' : f.score >= 50 ? 'bg-brass' : 'bg-ember',
                        ].join(' ')}
                        style={{ width: `${f.score}%` }}
                      />
                    </div>
                    <div className="w-8 text-right font-mono text-xs text-snow">{f.score}</div>
                  </div>
                )
                return (
                  <>
                    <div className="mb-1.5 font-mono text-xs uppercase tracking-wider text-brass">
                      Primary signal
                    </div>
                    <div className="grid gap-1.5 sm:grid-cols-2">{primary.map(renderFactor)}</div>
                    {context.length > 0 && (
                      <details className="mt-2 rounded-lg border border-line bg-well px-2.5 py-2">
                        <summary className="cursor-pointer font-mono text-xs uppercase tracking-wider text-mist">
                          Context only - cannot arm alone ({context.length})
                        </summary>
                        <div className="mt-2 grid gap-1.5 opacity-70 sm:grid-cols-2">
                          {context.map(renderFactor)}
                        </div>
                      </details>
                    )}
                  </>
                )
              })()}
            </div>
          )}

          {s.timing && (
            <div className="mt-3 grid gap-2 rounded-lg border border-line bg-raised p-3 sm:grid-cols-2">
              <div>
                <div className="font-mono text-xs uppercase tracking-wider text-mist">Window</div>
                <div className="mt-0.5 text-xs text-snow">{s.timing.window}</div>
              </div>
              <div>
                <div className="font-mono text-xs uppercase tracking-wider text-mist">Place by</div>
                <div className="mt-0.5 text-xs text-brass">
                  {formatPlaceBy(s.timing.placeBy, s.timing.placeByMs)}
                </div>
              </div>
            </div>
          )}

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {s.whyTake && s.whyTake.length > 0 && (
              <details className="rounded-lg border border-line bg-well px-2.5 py-2">
                <summary className="cursor-pointer font-mono text-xs uppercase tracking-wider text-phosphor">
                  Why take ({s.whyTake.length})
                </summary>
                <ul className="mt-2 space-y-1 text-xs text-mist">
                  {s.whyTake.map((line, i) => (
                    <li key={`take-${i}`}>{`· ${line}`}</li>
                  ))}
                </ul>
              </details>
            )}
            {s.whyNot && s.whyNot.length > 0 && (
              <details className="rounded-lg border border-line bg-well px-2.5 py-2">
                <summary className="cursor-pointer font-mono text-xs uppercase tracking-wider text-ember">
                  Why not ({s.whyNot.length})
                </summary>
                <ul className="mt-2 space-y-1 text-xs text-mist">
                  {s.whyNot.map((line, i) => (
                    <li key={`not-${i}`}>{`· ${line}`}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          {s.proof && s.proof.length > 0 && (
            <div className="mt-3 border-t border-line pt-2">
              <div className="font-mono text-xs uppercase tracking-wider text-brass">
                {deskAsset === 'stock'
                  ? 'Proof · public options / filings / tape'
                  : 'Proof · venue flow / on-chain whale context'}
              </div>
              <ul className="mt-1.5 space-y-1.5 text-xs leading-relaxed text-mist">
                {s.proof.slice(0, 6).map((p, i) => (
                  <li key={`proof-${i}`}>· {p}</li>
                ))}
              </ul>
            </div>
          )}

          {s.accounts && s.accounts.length > 0 && (
            <div className="mt-3 border-t border-line pt-3">
              <div className="font-mono text-xs uppercase tracking-wider text-brass">
                Lead accounts · live fills
              </div>
              <div className="mt-2 space-y-2">
                {s.accounts.slice(0, 3).map((a) => (
                  <div
                    key={a.uniqueCode}
                    className="rounded-lg border border-lineStrong bg-raised px-3 py-2 shadow-card"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <a
                        href={a.profileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-medium text-brass hover:underline"
                      >
                        {a.name}
                      </a>
                      <span className="font-mono text-xs text-fog">
                        {a.venue} · win {(a.winRatio * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
