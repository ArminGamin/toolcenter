import { useMemo, type Dispatch, type SetStateAction } from 'react'
import type { NewsItem } from '../../lib/markets'
import { EmptyState } from '../ui/primitives'
import { isInsiderNews, newsKindOf, type NewsKindFilter } from './markets-desk-helpers'
import type { NewsTierFilter } from './MarketsNewsSection'

export function NewsFeedSection({
  newsTiers,
  setNewsTiers,
  newsKind,
  setNewsKind,
  news,
}: {
  newsTiers: NewsTierFilter
  setNewsTiers: Dispatch<SetStateAction<NewsTierFilter>>
  newsKind: NewsKindFilter
  setNewsKind: (kind: NewsKindFilter) => void
  news: NewsItem[]
}) {
  const filteredNews = useMemo(() => {
    return news.filter((item) => {
      const raw = item.tier || 'filler'
      const tier =
        raw === 'flash' ? 'critical' : raw === 'wire' ? 'watch' : raw === 'media' ? 'filler' : raw
      const t = (tier === 'critical' || tier === 'watch' ? tier : 'filler') as keyof NewsTierFilter
      if (!newsTiers[t]) return false
      if (newsKind === 'all') return true
      if (newsKind === 'insider') return isInsiderNews(item)
      const k = newsKindOf(item)
      if (newsKind === 'sec') return k === 'sec' || k === 'insider'
      return k === newsKind
    })
  }, [news, newsTiers, newsKind])

  return (
    <>
      <div className="rounded-xl border border-lineStrong bg-panel p-3">
        <div className="mb-2 font-mono text-xs uppercase tracking-[0.16em] text-brass">
          Filters · cut the noise
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              {
                key: 'critical' as const,
                label: 'Critical',
                on: 'border-ember/40 bg-ember/15 text-ember',
              },
              {
                key: 'watch' as const,
                label: 'Watch',
                on: 'border-brass/40 bg-brass/15 text-brass',
              },
              {
                key: 'filler' as const,
                label: 'Filler',
                on: 'border-lineStrong bg-raised text-mist',
              },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setNewsTiers((prev) => ({ ...prev, [t.key]: !prev[t.key] }))}
              className={[
                'rounded-lg border px-2.5 py-1 font-mono text-xs uppercase tracking-wider transition',
                newsTiers[t.key] ? t.on : 'border-line text-fog opacity-50',
              ].join(' ')}
            >
              {newsTiers[t.key] ? '✓ ' : ''}
              {t.label}
            </button>
          ))}
          <span className="mx-1 hidden h-6 w-px bg-lineStrong sm:block" />
          {(
            [
              { id: 'all' as const, label: 'All sources' },
              { id: 'insider' as const, label: 'Verified insider' },
              { id: 'sec' as const, label: 'SEC filings' },
              { id: 'fed' as const, label: 'Fed' },
              { id: 'exchange' as const, label: 'Exchanges' },
              { id: 'rss' as const, label: 'Media RSS' },
            ] as const
          ).map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setNewsKind(k.id)}
              className={[
                'rounded-lg border px-2.5 py-1 font-mono text-xs uppercase tracking-wider transition',
                newsKind === k.id
                  ? k.id === 'insider'
                    ? 'border-brass/50 bg-brass/20 text-brass'
                    : 'border-snow/20 bg-snow/10 text-snow'
                  : 'border-line text-fog hover:text-mist',
              ].join(' ')}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>

      {filteredNews.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-lineStrong bg-panel p-6">
          <EmptyState title={news.length === 0 ? 'Loading feeds' : 'No matching news'} />
        </div>
      ) : (
        filteredNews.map((item, i) => {
          const raw = item.tier || 'filler'
          const tier =
            raw === 'flash'
              ? 'critical'
              : raw === 'wire'
                ? 'watch'
                : raw === 'media'
                  ? 'filler'
                  : raw
          const label = tier === 'critical' ? 'critical' : tier === 'watch' ? 'watch' : 'filler'
          const insider = isInsiderNews(item)
          return (
            <a
              key={`${item.id || item.url}-${i}`}
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className={[
                'block rounded-xl border px-4 py-3 transition hover:bg-raised',
                tier === 'critical'
                  ? 'border-ember/40 bg-ember/5 hover:border-ember/60'
                  : tier === 'watch'
                    ? 'border-brass/35 bg-brass/5 hover:border-brass/50'
                    : 'border-line bg-panel opacity-80 hover:opacity-100',
              ].join(' ')}
            >
              <div className="flex flex-wrap items-center gap-2 font-mono text-xs uppercase tracking-wider">
                <span
                  className={
                    tier === 'critical'
                      ? 'text-ember'
                      : tier === 'watch'
                        ? 'text-brass'
                        : 'text-fog'
                  }
                >
                  {label}
                </span>
                {insider && (
                  <span className="rounded border border-brass/40 bg-brass/15 px-1.5 py-0.5 text-brass">
                    Verified · SEC Form 4 (public)
                  </span>
                )}
                <span className="text-fog">·</span>
                <span className="text-fog">{item.source}</span>
                <span className="text-fog">·</span>
                <span className="text-fog">
                  {(() => {
                    const t = Date.parse(item.published)
                    return Number.isFinite(t) ? new Date(t).toLocaleString() : '-'
                  })()}
                </span>
              </div>
              <div
                className={[
                  'mt-1 text-sm font-medium',
                  tier === 'filler' ? 'text-mist' : 'text-snow',
                ].join(' ')}
              >
                {item.title}
              </div>
            </a>
          )
        })
      )}
    </>
  )
}
