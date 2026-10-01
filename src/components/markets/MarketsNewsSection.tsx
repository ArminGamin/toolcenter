import type { Dispatch, SetStateAction } from 'react'
import type { DeskBoard, DeskSignal, NewsItem, WatchSymbol } from '../../lib/markets'
import { downloadDeskOutcomesCsv } from '../../lib/hub'
import { EmptyState, ErrorRetryCallout } from '../ui/primitives'
import { deskSignalsForView, type NewsKindFilter } from './markets-desk-helpers'
import { DeskBoardPanel } from './DeskBoardPanel'
import { DeskTicketCard } from './DeskTicketCard'
import { NewsFeedSection } from './NewsFeedSection'

export type NewsTierFilter = { critical: boolean; watch: boolean; filler: boolean }
export type NewsSub = 'feed' | 'desk'

export function MarketsNewsSection({
  newsSub,
  setNewsSub,
  newsTiers,
  setNewsTiers,
  newsKind,
  setNewsKind,
  news,
  deskAsset,
  setDeskAsset,
  clearDesk,
  desk,
  deskBoard,
  deskView,
  setDeskView,
  watchById,
  busy,
  formatPlaceBy,
  onToast,
  deskError,
  deskLoading,
  onRetryDesk,
}: {
  newsSub: NewsSub
  setNewsSub: (sub: NewsSub) => void
  newsTiers: NewsTierFilter
  setNewsTiers: Dispatch<SetStateAction<NewsTierFilter>>
  newsKind: NewsKindFilter
  setNewsKind: (kind: NewsKindFilter) => void
  news: NewsItem[]
  deskAsset: 'crypto' | 'stock'
  setDeskAsset: (asset: 'crypto' | 'stock') => void
  clearDesk: () => void
  desk: DeskSignal[]
  deskBoard: DeskBoard | null
  deskView: 'simple' | 'advanced'
  setDeskView: (view: 'simple' | 'advanced') => void
  watchById: Map<string, WatchSymbol>
  busy: boolean
  formatPlaceBy: (placeBy: string, placeByMs?: number) => string
  onToast: (message: string | null) => void
  deskError?: string | null
  deskLoading?: boolean
  onRetryDesk?: () => void
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1 rounded-xl border border-lineStrong bg-well p-1">
        {(
          [
            { id: 'feed' as const, label: 'Feed' },
            { id: 'desk' as const, label: 'Desk · verified' },
          ] as const
        ).map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setNewsSub(s.id)}
            className={[
              'rounded-lg px-3 py-1.5 font-mono text-xs uppercase tracking-wider transition',
              newsSub === s.id
                ? 'bg-ember/15 text-ember shadow-[inset_0_0_0_1px_rgb(var(--accent-danger)/0.35)]'
                : 'text-fog hover:text-snow',
            ].join(' ')}
          >
            {s.label}
          </button>
        ))}
      </div>

      {newsSub === 'feed' && (
        <NewsFeedSection
          newsTiers={newsTiers}
          setNewsTiers={setNewsTiers}
          newsKind={newsKind}
          setNewsKind={setNewsKind}
          news={news}
        />
      )}

      {newsSub === 'desk' && (
        <>
          {deskError ? (
            <ErrorRetryCallout
              title="Desk signals unavailable"
              body={deskError}
              onRetry={onRetryDesk}
              retrying={deskLoading}
            />
          ) : null}
          <div className="flex flex-wrap gap-1 rounded-xl border border-lineStrong bg-well p-1">
            {(
              [
                { id: 'crypto' as const, label: 'Crypto' },
                { id: 'stock' as const, label: 'Stocks' },
              ] as const
            ).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setDeskAsset(s.id)
                  clearDesk()
                }}
                className={[
                  'rounded-lg px-3 py-1.5 font-mono text-xs uppercase tracking-wider transition',
                  deskAsset === s.id
                    ? 'bg-brass/20 text-snow shadow-[inset_0_0_0_1px_rgb(var(--accent-brass)/0.4)]'
                    : 'text-fog hover:text-snow',
                ].join(' ')}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-lineStrong bg-panel px-3 py-2">
            <p className="max-w-3xl text-xs text-mist">
              This desk has armed {deskBoard?.totalArmedTickets ?? 0} tickets total.{' '}
              {deskBoard?.successPct != null
                ? `Real hit rate is available from ${deskBoard.resolvedOutcomeCount ?? 0} resolved outcomes for this rule-set.`
                : `Odds shown are not statistically meaningful until 30+ resolved outcomes per rule-set - currently ${deskBoard?.resolvedOutcomeCount ?? 0}; showing heuristic edge only.`}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void downloadDeskOutcomesCsv().then((r) => {
                    onToast(r.message)
                    window.setTimeout(() => onToast(null), 3200)
                  })
                }}
                className="rounded-lg border border-lineStrong bg-lift px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-mist hover:text-snow disabled:opacity-50"
              >
                Export outcomes CSV
              </button>
              <div className="flex rounded-lg border border-lineStrong bg-panel p-0.5 font-mono text-xs uppercase tracking-wider">
                {(['simple', 'advanced'] as const).map((view) => (
                  <button
                    key={view}
                    type="button"
                    onClick={() => setDeskView(view)}
                    className={[
                      'rounded-md px-2 py-1 transition',
                      deskView === view ? 'bg-brass/20 text-snow' : 'text-fog hover:text-mist',
                    ].join(' ')}
                  >
                    {view}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {deskBoard && (
            <DeskBoardPanel
              deskBoard={deskBoard}
              deskAsset={deskAsset}
              watchById={watchById}
            />
          )}

          {desk.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-lineStrong bg-panel p-6">
              <EmptyState title="Desk warming up" />
            </div>
          ) : (
            deskSignalsForView(desk, deskView).map((s) => (
              <DeskTicketCard
                key={s.id}
                signal={s}
                deskView={deskView}
                deskAsset={deskAsset}
                formatPlaceBy={formatPlaceBy}
              />
            ))
          )}
          {deskBoard?.trackRecord && deskBoard.trackRecord.length > 0 && (
            <div className="rounded-xl border border-lineStrong bg-panel p-3">
              <div className="font-mono text-xs uppercase tracking-wider text-brass">
                Recent armed tickets
              </div>
              <div className="mt-2 space-y-1">
                {deskBoard.trackRecord.map((outcome) => (
                  <div
                    key={outcome.id}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line py-1.5 font-mono text-xs last:border-0"
                  >
                    <span className="text-snow">
                      {outcome.symbol} · {outcome.side.toUpperCase()}
                      {outcome.play ? ` · ${outcome.play}` : ''}
                    </span>
                    <span className="text-fog">
                      armed {new Date(outcome.armedAt).toLocaleString()}
                      {outcome.resolvedAt
                        ? ` · resolved ${new Date(outcome.resolvedAt).toLocaleString()}`
                        : ''}
                    </span>
                    <span
                      className={
                        /^hit_t/.test(outcome.status)
                          ? 'text-phosphor'
                          : outcome.status === 'stopped' || outcome.status === 'expired'
                            ? 'text-ember'
                            : 'text-brass'
                      }
                    >
                      {outcome.status.replace('_', ' ')}
                    </span>
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
