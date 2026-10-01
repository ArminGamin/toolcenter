import { useEffect, useState } from 'react'
import {
  fetchLiveMarketHistory,
  fetchMarketQuotes,
  subscribeMarketQuotes,
  LIVE_HISTORY_WINDOWS,
  type LiveHistoryWindow,
  type MarketQuote,
  type MarketQuoteHistory,
} from '../lib/markets'

export function useMarketsLive(watchlistKey: string) {
  const [quotes, setQuotes] = useState<MarketQuote[]>([])
  const [liveWindow, setLiveWindow] = useState<LiveHistoryWindow>(
    () => LIVE_HISTORY_WINDOWS.find((window) => window.id === '24h')!,
  )
  const [liveHistoryById, setLiveHistoryById] = useState<Map<string, MarketQuoteHistory>>(
    () => new Map(),
  )
  const [liveHistoryLoading, setLiveHistoryLoading] = useState(false)
  const [quotesError, setQuotesError] = useState<string | null>(null)

  useEffect(() => {
    let unsub: (() => void) | undefined
    let cancelled = false
    void subscribeMarketQuotes((next) => {
      if (!cancelled) {
        setQuotes(next)
        if (next.length > 0) setQuotesError(null)
      }
    }).then((fn) => {
      unsub = fn
    })
    void fetchMarketQuotes().then((res) => {
      if (cancelled) return
      if (!res.ok) {
        setQuotesError('Quotes unavailable — bridge may be offline')
      } else if (res.quotes?.length) {
        setQuotesError(null)
      }
    })
    return () => {
      cancelled = true
      unsub?.()
    }
  }, [watchlistKey])

  useEffect(() => {
    let cancelled = false
    setLiveHistoryLoading(true)
    void fetchLiveMarketHistory(liveWindow.minutes).then((res) => {
      if (cancelled) return
      setLiveHistoryLoading(false)
      if (res.ok && res.histories) {
        setLiveHistoryById(new Map(res.histories.map((history) => [history.id, history])))
      }
    })
    return () => {
      cancelled = true
    }
  }, [liveWindow, watchlistKey])

  async function refreshLiveQuotes(force = false) {
    const res = await fetchMarketQuotes()
    if (res.ok && res.quotes) {
      setQuotes(res.quotes)
      setQuotesError(null)
    } else {
      setQuotesError(res.ok ? 'No quotes returned' : 'Quotes unavailable — check bridge')
    }
    if (force) {
      setLiveHistoryLoading(true)
      const hist = await fetchLiveMarketHistory(liveWindow.minutes, { force: true })
      setLiveHistoryLoading(false)
      if (hist.ok && hist.histories) {
        setLiveHistoryById(new Map(hist.histories.map((history) => [history.id, history])))
      }
    }
    return res
  }

  return {
    quotes,
    liveWindow,
    setLiveWindow,
    liveHistoryById,
    liveHistoryLoading,
    quotesError,
    refreshLiveQuotes,
  }
}
