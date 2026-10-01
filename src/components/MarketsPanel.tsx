import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import {
  fetchMarketNews,
  fetchMarketPresets,
  fetchMarketsConfig,
  fetchPortfolioConfig,
  saveMarketsConfig,
  type MarketsConfig,
  type NewsItem,
  type WatchSymbol,
} from '../lib/markets'
import { STOCK_LOGO_DOMAINS } from '../lib/symbol-logos'
import { useMarketsDesk } from '../hooks/useMarketsDesk'
import { useMarketsLive } from '../hooks/useMarketsLive'
import { MarketsLiveSection } from './markets/MarketsLiveSection'
import { MarketsChartsSection } from './markets/MarketsChartsSection'
import {
  MarketsNewsSection,
  type NewsSub,
  type NewsTierFilter,
} from './markets/MarketsNewsSection'
import { MarketsWatchlistSection } from './markets/MarketsWatchlistSection'
import { type NewsKindFilter } from './markets/markets-desk-helpers'
import { ErrorRetryCallout } from './ui/primitives'

type Tab = 'live' | 'charts' | 'news' | 'watchlist'

const NEWS_FILTER_KEY = 'cc-markets-news-filters'

function loadNewsFilters(): {
  tiers: NewsTierFilter
  kind: NewsKindFilter
} {
  try {
    const raw = localStorage.getItem(NEWS_FILTER_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { tiers?: NewsTierFilter; kind?: NewsKindFilter }
      return {
        tiers: parsed.tiers || { critical: true, watch: true, filler: false },
        kind: parsed.kind || 'all',
      }
    }
  } catch {
    /* ignore */
  }
  return { tiers: { critical: true, watch: true, filler: false }, kind: 'all' }
}

interface MarketsPanelProps {
  onHome: () => void
  /** False when user left Markets but panel stays mounted for warm cache. */
  active?: boolean
  /** Bind manual refresh into the app Topbar (Markets-only). */
  onRefreshBinding?: (binding: {
    refresh: () => Promise<void>
    refreshing: boolean
    lastLabel: string | null
  } | null) => void
}

export function MarketsPanel({ onHome, onRefreshBinding, active = true }: MarketsPanelProps) {
  const [tab, setTab] = useState<Tab>('live')
  const [config, setConfig] = useState<MarketsConfig | null>(null)
  const [presets, setPresets] = useState<WatchSymbol[]>([])
  const [news, setNews] = useState<NewsItem[]>([])
  const [newsSub, setNewsSub] = useState<NewsSub>('feed')
  const {
    deskAsset,
    setDeskAsset,
    desk,
    deskBoard,
    sourceHealth,
    deskView,
    setDeskView,
    deskError,
    deskLoading,
    refreshDesk,
    clearDesk,
  } = useMarketsDesk(tab, newsSub)
  const [accountEquityDraft, setAccountEquityDraft] = useState<string>('')
  const [accountEquityUsd, setAccountEquityUsd] = useState<number | null>(null)
  const [chartSymbol, setChartSymbol] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [customSymbol, setCustomSymbol] = useState('')
  const [customKind, setCustomKind] = useState<'crypto' | 'stock'>('stock')
  const [nowMs, setNowMs] = useState(() => Date.now())
  const initialFilters = useMemo(() => loadNewsFilters(), [])
  const [newsTiers, setNewsTiers] = useState<NewsTierFilter>(initialFilters.tiers)
  const [newsKind, setNewsKind] = useState<NewsKindFilter>(initialFilters.kind)
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null)
  const [configError, setConfigError] = useState<string | null>(null)
  const watchlistKey = config?.symbols.map((s) => s.id).join(',') || ''
  const {
    quotes,
    liveWindow,
    setLiveWindow,
    liveHistoryById,
    liveHistoryLoading,
    quotesError,
    refreshLiveQuotes,
  } = useMarketsLive(watchlistKey)

  useEffect(() => {
    try {
      localStorage.setItem(NEWS_FILTER_KEY, JSON.stringify({ tiers: newsTiers, kind: newsKind }))
    } catch {
      /* ignore */
    }
  }, [newsTiers, newsKind])

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const formatLastRefreshed = useCallback((): string | null => {
    if (lastRefreshedAt == null) return null
    const sec = Math.max(0, Math.round((nowMs - lastRefreshedAt) / 1000))
    if (sec < 5) return 'just now'
    if (sec < 60) return `${sec}s ago`
    return `${Math.round(sec / 60)}m ago`
  }, [lastRefreshedAt, nowMs])

  const handleRefresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      const tasks: Promise<void>[] = [
        refreshLiveQuotes(true).then(() => undefined),
        refreshDesk(true).then(() => undefined),
      ]

      if (tab === 'news' && newsSub === 'feed') {
        tasks.push(
          fetchMarketNews({ force: true }).then((res) => {
            setNews(res.items || [])
          }),
        )
      }

      await Promise.all(tasks)
      setLastRefreshedAt(Date.now())
    } finally {
      setRefreshing(false)
    }
  }

  const handleRefreshRef = useRef(handleRefresh)
  handleRefreshRef.current = handleRefresh

  useEffect(() => {
    if (!onRefreshBinding) return
    if (!active) {
      onRefreshBinding(null)
      return
    }
    onRefreshBinding({
      refresh: () => handleRefreshRef.current(),
      refreshing,
      lastLabel: formatLastRefreshed(),
    })
  }, [onRefreshBinding, refreshing, lastRefreshedAt, nowMs, active, formatLastRefreshed])

  useEffect(() => {
    return () => onRefreshBinding?.(null)
  }, [onRefreshBinding])

  function formatPlaceBy(placeBy: string, placeByMs?: number): string {
    if (
      !placeByMs ||
      placeByMs <= 0 ||
      /^N\/A/i.test(placeBy) ||
      /no entry|wait\b|stay out|flat/i.test(placeBy)
    ) {
      return placeBy
    }
    const left = placeByMs - nowMs
    const clock = new Date(placeByMs).toLocaleTimeString()
    if (left <= 0) return `EXPIRED · ${clock}`
    const m = Math.floor(left / 60_000)
    const s = Math.floor((left % 60_000) / 1000)
    return `${clock} · ${m}m ${String(s).padStart(2, '0')}s left`
  }

  useEffect(() => {
    void fetchMarketsConfig().then((res) => {
      if (res.ok && res.config) {
        setConfig(res.config)
        setChartSymbol(res.config.symbols[0]?.tv || null)
        setConfigError(null)
      } else {
        setConfigError('Could not load markets config')
      }
    })
    void fetchMarketPresets().then((res) => {
      if (res.ok && res.presets) setPresets(res.presets)
    })
    void fetchPortfolioConfig().then((res) => {
      if (res.ok && res.config) {
        setAccountEquityUsd(res.config.accountEquityUsd)
        setAccountEquityDraft(
          res.config.accountEquityUsd != null ? String(res.config.accountEquityUsd) : '',
        )
      }
    })
  }, [])

  useEffect(() => {
    if (tab !== 'news' || newsSub !== 'feed') return
    let cancelled = false
    async function loadFeed() {
      const res = await fetchMarketNews()
      if (cancelled) return
      setNews(res.items || [])
    }
    void loadFeed()
    const refreshId = window.setInterval(() => void loadFeed(), 15_000)
    return () => {
      cancelled = true
      window.clearInterval(refreshId)
    }
  }, [tab, newsSub])

  const activeTv = chartSymbol || config?.symbols[0]?.tv || 'BINANCE:BTCUSDT'

  const watchedIds = useMemo(
    () => new Set((config?.symbols || []).map((s) => s.id)),
    [config],
  )

  const watchById = useMemo(() => {
    const map = new Map<string, WatchSymbol>()
    for (const s of config?.symbols || []) map.set(s.id, s)
    for (const p of presets) {
      if (!map.has(p.id)) map.set(p.id, p)
    }
    return map
  }, [config, presets])

  async function persist(next: MarketsConfig) {
    setBusy(true)
    const res = await saveMarketsConfig(next)
    setBusy(false)
    if (res.ok && res.config) {
      setConfig(res.config)
      setToast(res.message)
      if (!res.config.symbols.find((s) => s.tv === chartSymbol)) {
        setChartSymbol(res.config.symbols[0]?.tv || null)
      }
    } else {
      setToast(res.message || 'Save failed')
    }
    window.setTimeout(() => setToast(null), 2200)
  }

  function togglePreset(p: WatchSymbol) {
    if (!config) return
    const exists = config.symbols.some((s) => s.id === p.id)
    const symbols = exists
      ? config.symbols.filter((s) => s.id !== p.id)
      : [...config.symbols, p]
    void persist({ ...config, symbols })
  }

  function removeSymbol(id: string) {
    if (!config) return
    void persist({ ...config, symbols: config.symbols.filter((s) => s.id !== id) })
  }

  function addCustom() {
    if (!config) return
    const sym = customSymbol.trim().toUpperCase()
    if (!sym) return
    const id = `${customKind}-${sym.toLowerCase()}`
    if (config.symbols.some((s) => s.id === id || s.symbol === sym)) {
      setToast('Already on watchlist')
      return
    }
    const entry: WatchSymbol =
      customKind === 'crypto'
        ? {
            id,
            kind: 'crypto',
            symbol: sym,
            label: sym,
            tv: `BINANCE:${sym}USD`,
            yahoo: `${sym}-USD`,
            binance: `${sym}USD`,
          }
        : {
            id,
            kind: 'stock',
            symbol: sym,
            label: sym,
            tv: `NASDAQ:${sym}`,
            yahoo: sym,
            domain: STOCK_LOGO_DOMAINS[sym],
          }
    void persist({ ...config, symbols: [...config.symbols, entry] })
    setCustomSymbol('')
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'live', label: 'Live' },
    { id: 'charts', label: 'Charts' },
    { id: 'news', label: 'News' },
    { id: 'watchlist', label: 'Watchlist' },
  ]

  const liveUp = quotes.filter((q) => (q.changePct ?? 0) > 0).length
  const liveDown = quotes.filter((q) => (q.changePct ?? 0) < 0).length

  return (
    <div className="relative mx-auto max-w-none px-2 sm:px-0">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-4 -top-6 h-40 bg-[radial-gradient(ellipse_at_top,_rgb(var(--accent-brass)/0.12),_transparent_65%)]"
      />

      <button
        type="button"
        onClick={onHome}
        className="relative mb-4 font-mono text-xs uppercase tracking-[0.14em] text-mist transition hover:text-brass"
      >
        ← All tools
      </button>

      <div className="relative mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-brass/20 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-brass">
              Markets desk
            </p>
            <span
              className="inline-flex items-center gap-1.5 rounded border border-brass/30 bg-brass/10 px-2 py-1 font-mono text-xs uppercase tracking-wider text-brass"
            >
              polled · not tick-perfect
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-snow sm:text-3xl">
            Crypto · Stocks · News
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-mist">
            Multi-venue flash + verified desk confluence. Stocks prioritize public options/flow
            (Yahoo) - Form 4 is complementary EDGAR, never tip leaks.
          </p>
          {sourceHealth.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {sourceHealth
                .filter((s) =>
                  ['yahoo_options', 'edgar', 'edgar_13f', 'onchain_whales', 'binance_flow', 'multi_venue', 'okx_leads', 'binance_live'].includes(
                    s.id,
                  ),
                )
                .map((s) => (
                  <span
                    key={s.id}
                    title={s.chipLabel || s.knownSourceLatency || s.reason || undefined}
                    className={[
                      'max-w-full rounded border px-2.5 py-1.5 font-mono text-xs leading-relaxed tracking-wide',
                      s.stale
                        ? 'border-ember/40 bg-ember/10 text-ember'
                        : 'border-phosphor/30 bg-phosphor/10 text-phosphor',
                    ].join(' ')}
                  >
                    {s.chipLabel ||
                      `${s.label}: ${s.stale ? 'STALE' : 'fresh'} · ${s.knownSourceLatency || 'latency n/a'}`}
                  </span>
                ))}
            </div>
          )}
        </div>
        <div className="relative -mx-1 overflow-x-auto px-1 scrollbar-thin">
          <div className="cc-tabs" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className="cc-tab shrink-0"
            >
              {t.label}
            </button>
          ))}
          </div>
        {quotes.length > 0 && (
          <div className="flex gap-2 font-mono text-xs uppercase tracking-wider">
            <div className="rounded border border-lineStrong bg-raised px-2.5 py-1.5 text-mist">
              Book <span className="text-snow">{quotes.length}</span>
            </div>
            <div className="rounded border border-phosphor/25 bg-phosphor/5 px-2.5 py-1.5 text-phosphor">
              ↑ {liveUp}
            </div>
            <div className="rounded border border-ember/25 bg-ember/5 px-2.5 py-1.5 text-ember">
              ↓ {liveDown}
            </div>
          </div>
        )}
      </div>

      </div>

      {configError && (
        <ErrorRetryCallout
          title="Markets config failed to load"
          body={configError}
          onRetry={() => {
            void fetchMarketsConfig().then((res) => {
              if (res.ok && res.config) {
                setConfig(res.config)
                setConfigError(null)
              }
            })
          }}
        />
      )}

      {tab === 'live' && quotesError && (
        <ErrorRetryCallout
          title="Live quotes unavailable"
          body={quotesError}
          onRetry={() => void refreshLiveQuotes(true)}
          retrying={refreshing}
        />
      )}

      {tab === 'live' && (
        <MarketsLiveSection
          quotes={quotes}
          liveWindow={liveWindow}
          setLiveWindow={setLiveWindow}
          liveHistoryById={liveHistoryById}
          liveHistoryLoading={liveHistoryLoading}
          watchById={watchById}
          onOpenChart={(tv) => {
            setChartSymbol(tv)
            setTab('charts')
          }}
        />
      )}

      {tab === 'charts' && (
        <MarketsChartsSection
          config={config}
          activeTv={activeTv}
          setChartSymbol={setChartSymbol}
        />
      )}

      {tab === 'news' && (
        <MarketsNewsSection
          newsSub={newsSub}
          setNewsSub={setNewsSub}
          newsTiers={newsTiers}
          setNewsTiers={setNewsTiers}
          newsKind={newsKind}
          setNewsKind={setNewsKind}
          news={news}
          deskAsset={deskAsset}
          setDeskAsset={setDeskAsset}
          clearDesk={clearDesk}
          desk={desk}
          deskBoard={deskBoard}
          deskView={deskView}
          setDeskView={setDeskView}
          watchById={watchById}
          busy={busy}
          formatPlaceBy={formatPlaceBy}
          onToast={setToast}
          deskError={deskError}
          deskLoading={deskLoading}
          onRetryDesk={() => void refreshDesk(true)}
        />
      )}

      {tab === 'watchlist' && config && (
        <MarketsWatchlistSection
          config={config}
          setConfig={setConfig}
          persist={persist}
          busy={busy}
          setBusy={setBusy}
          accountEquityDraft={accountEquityDraft}
          setAccountEquityDraft={setAccountEquityDraft}
          accountEquityUsd={accountEquityUsd}
          setAccountEquityUsd={setAccountEquityUsd}
          onToast={setToast}
          presets={presets}
          watchedIds={watchedIds}
          togglePreset={togglePreset}
          removeSymbol={removeSymbol}
          customSymbol={customSymbol}
          setCustomSymbol={setCustomSymbol}
          customKind={customKind}
          setCustomKind={setCustomKind}
          addCustom={addCustom}
        />
      )}

      {toast && (
        <div className="mt-4 rounded-xl border border-brass/30 bg-lift px-3 py-2 font-mono text-xs text-snow">
          {toast}
        </div>
      )}
    </div>
  )
}
