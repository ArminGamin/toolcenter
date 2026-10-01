import { activeBusinessProfileId } from './business-profiles'

export type MarketKind = 'crypto' | 'stock'

export type WatchSymbol = {
  id: string
  kind: MarketKind
  symbol: string
  label: string
  tv: string
  yahoo: string
  binance?: string
  coingecko?: string
  /** Company domain for Clearbit logos (stocks). */
  domain?: string
}

export type MarketsConfig = {
  symbols: WatchSymbol[]
  alertPct: number
  discordAlerts: boolean
}

export type MarketQuote = {
  id: string
  symbol: string
  label: string
  kind: MarketKind
  price: number | null
  changePct: number | null
  tv: string
  source?: string
}

/** API durations are minutes; selector IDs preserve the distinct 60m and 1h controls. */
export const LIVE_HISTORY_WINDOW_MINUTES = [1, 5, 10, 15, 30, 45, 60, 240, 360, 720, 1440] as const
export type LiveHistoryWindowMinutes = (typeof LIVE_HISTORY_WINDOW_MINUTES)[number]

export const LIVE_HISTORY_WINDOWS = [
  { id: '1m', label: '1m', minutes: 1, unit: 'minute' },
  { id: '5m', label: '5m', minutes: 5, unit: 'minute' },
  { id: '10m', label: '10m', minutes: 10, unit: 'minute' },
  { id: '15m', label: '15m', minutes: 15, unit: 'minute' },
  { id: '30m', label: '30m', minutes: 30, unit: 'minute' },
  { id: '45m', label: '45m', minutes: 45, unit: 'minute' },
  { id: '60m', label: '60m', minutes: 60, unit: 'minute' },
  { id: '1h', label: '1h', minutes: 60, unit: 'hour' },
  { id: '4h', label: '4h', minutes: 240, unit: 'hour' },
  { id: '6h', label: '6h', minutes: 360, unit: 'hour' },
  { id: '12h', label: '12h', minutes: 720, unit: 'hour' },
  { id: '24h', label: '24h', minutes: 1440, unit: 'hour' },
] as const
export type LiveHistoryWindow = (typeof LIVE_HISTORY_WINDOWS)[number]

export type MarketPricePoint = {
  time: number
  price: number
}

export type MarketQuoteHistory = {
  id: string
  points: MarketPricePoint[]
  changePct: number | null
  source: string
}

export type NewsItem = {
  id?: string
  title: string
  url: string
  source: string
  published: string
  categories: string[]
  tier?: 'critical' | 'watch' | 'filler' | 'flash' | 'wire' | 'media'
}

export async function fetchMarketsConfig(): Promise<{
  ok: boolean
  config?: MarketsConfig
}> {
  try {
    const res = await fetch('/api/markets')
    return (await res.json()) as { ok: boolean; config?: MarketsConfig }
  } catch {
    return { ok: false }
  }
}

function ccAuthHeaders(extra?: HeadersInit): HeadersInit {
  const token =
    typeof window !== 'undefined'
      ? (window as unknown as { __CC_AUTH__?: string }).__CC_AUTH__
      : undefined
  return {
    ...(extra || {}),
    ...(token ? { 'X-CC-Token': token } : {}),
  }
}

export async function saveMarketsConfig(
  config: MarketsConfig,
): Promise<{ ok: boolean; message: string; config?: MarketsConfig }> {
  try {
    const res = await fetch('/api/markets', {
      method: 'POST',
      headers: ccAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(config),
    })
    return (await res.json()) as { ok: boolean; message: string; config?: MarketsConfig }
  } catch {
    return { ok: false, message: 'Markets bridge offline' }
  }
}

export async function fetchMarketQuotes(): Promise<{
  ok: boolean
  quotes?: MarketQuote[]
  at?: string
}> {
  try {
    const res = await fetch('/api/markets?action=quotes')
    return (await res.json()) as { ok: boolean; quotes?: MarketQuote[]; at?: string }
  } catch {
    return { ok: false }
  }
}

export async function fetchLiveMarketHistory(
  window: LiveHistoryWindowMinutes,
  opts?: { force?: boolean },
): Promise<{
  ok: boolean
  window?: LiveHistoryWindowMinutes
  histories?: MarketQuoteHistory[]
  at?: string
}> {
  try {
    const force = opts?.force ? '&force=true' : ''
    const res = await fetch(`/api/markets?action=history&window=${window}${force}`)
    return (await res.json()) as {
      ok: boolean
      window?: LiveHistoryWindowMinutes
      histories?: MarketQuoteHistory[]
      at?: string
    }
  } catch {
    return { ok: false }
  }
}

export async function fetchMarketNews(opts?: {
  force?: boolean
}): Promise<{
  ok: boolean
  items?: NewsItem[]
  message?: string
}> {
  try {
    const force = opts?.force ? '&force=true' : ''
    const res = await fetch(`/api/markets?action=news${force}`)
    return (await res.json()) as { ok: boolean; items?: NewsItem[]; message?: string }
  } catch {
    return { ok: false, message: 'News offline' }
  }
}

export async function fetchMarketPresets(): Promise<{
  ok: boolean
  presets?: WatchSymbol[]
}> {
  try {
    const res = await fetch('/api/markets?action=presets')
    return (await res.json()) as { ok: boolean; presets?: WatchSymbol[] }
  } catch {
    return { ok: false }
  }
}

export type DeskRule = {
  id: string
  label: string
  pass: boolean
  required: boolean
  note: string
}

export type DeskFactor = {
  id: string
  label: string
  score: number
  note: string
  confirmationOnly?: boolean
  tier?: 'primary' | 'confirmation'
}

export type DeskPlaybook = {
  side: 'long' | 'short' | 'flat'
  entry: number | null
  stop: number | null
  target1: number | null
  target2: number | null
  riskPct: number | null
  rewardPct: number | null
  rr: number | null
  sizeHint: string
  invalidation: string
  plan: string
}

export type DeskBoard = {
  bestPlay: string
  cashBias: 'long' | 'short' | 'flat'
  heat: number
  nowCount: number
  avoidCount: number
  watchCount: number
  tip: string
  printerArmed?: boolean
  armedCount?: number
  laws?: string[]
  directive?: DeskDirective
  successPct?: number | null
  chanceLabel?: string
  hotMovers?: DeskHotMover[]
  topPeople?: DeskTopPeople[]
  aggregateRiskPct?: number
  aggregateRiskUsd?: number | null
  accountEquityUsd?: number | null
  riskBudgetLabel?: string
  needsAccountSize?: boolean
  totalArmedTickets?: number
  resolvedOutcomeCount?: number
  trackRecord?: DeskOutcome[]
}

export type DeskDirective = {
  verb: 'BUY' | 'SELL' | 'WATCH' | 'AVOID' | "DON'T BUY"
  label: string
  tone: 'buy' | 'sell' | 'watch' | 'avoid'
}

export type DeskHotMover = {
  symbol: string
  label: string
  kind: 'crypto' | 'stock'
  changePct: number
  price: number | null
  moveScore: number
  note: string
}

export type DeskTopPeople = {
  symbol: string
  who: string
  lean: 'buy' | 'sell' | 'call' | 'put' | 'mixed'
  activity: string
  detail: string
  source: string
}

export type DeskSignal = {
  id: string
  urgency: 'now' | 'watch' | 'avoid'
  confidence?: number
  /** Historical hit rate when n≥30; else null */
  successPct?: number | null
  chanceLabel?: string
  heuristicOdds?: number
  edgeScore?: number
  rank?: number
  play?: string
  regime?: 'trend' | 'mean-revert' | 'chop'
  printerArmed?: boolean
  rules?: DeskRule[]
  directive?: DeskDirective
  plainSummary?: string
  blockReason?: string | null
  riskLabel?: string
  headline: string
  detail: string
  action: string
  whyTake?: string[]
  whyNot?: string[]
  risks?: string[]
  factors?: DeskFactor[]
  playbook?: DeskPlaybook
  timing?: {
    window: string
    placeBy: string
    placeByMs: number
    horizon: string
    speed: string
  }
  symbol?: string
  source: string
  venues?: string[]
  proof?: string[]
  accounts?: {
    venue: string
    name: string
    uniqueCode: string
    aum: number
    pnlRatio: number
    winRatio: number
    copyTraders: number
    profileUrl: string
    openSides: { side: string; lever: string; upl: number; uplRatio: number; margin: number }[]
    recentTrades: {
      instId: string
      side: 'long' | 'short'
      openPx: number
      closePx: number
      pnl: number
      pnlRatio: number
      openTime: string
      closeTime: string
    }[]
  }[]
  at: string
}

export type DeskOutcome = {
  id: string
  armedAt: string
  asset: 'crypto' | 'stock'
  symbol: string
  side: 'long' | 'short'
  play: string
  status: 'open' | 'hit_t1' | 'hit_t2' | 'stopped' | 'expired' | 'laws_flipped' | 'unresolved'
  resolvedAt?: string
}

export type SourceHealthRow = {
  id: string
  label: string
  stale: boolean
  reason: string | null
  lastSuccessfulFetch: number | null
  lastError: string | null
  knownSourceLatency?: string
  chipLabel?: string
  ageMs?: number | null
}

export type PortfolioConfig = {
  maxArmed: number
  maxAggregateRiskPct: number
  maxPerBucket: number
  accountEquityUsd: number | null
}

export async function fetchPortfolioConfig(): Promise<{
  ok: boolean
  config?: PortfolioConfig
}> {
  try {
    const res = await fetch('/api/markets?action=portfolio')
    return (await res.json()) as { ok: boolean; config?: PortfolioConfig }
  } catch {
    return { ok: false }
  }
}

export async function savePortfolioConfig(patch: {
  accountEquityUsd?: number | null
}): Promise<{ ok: boolean; message?: string; config?: PortfolioConfig }> {
  try {
    const res = await fetch('/api/markets', {
      method: 'POST',
      headers: ccAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ action: 'portfolio', ...patch }),
    })
    return (await res.json()) as { ok: boolean; message?: string; config?: PortfolioConfig }
  } catch {
    return { ok: false, message: 'Portfolio save offline' }
  }
}

export async function fetchDeskSignals(
  asset: 'crypto' | 'stock' = 'crypto',
  opts?: { force?: boolean },
): Promise<{
  ok: boolean
  signals?: DeskSignal[]
  board?: DeskBoard
  disclaimer?: string
  message?: string
  asset?: string
  sourceHealth?: SourceHealthRow[]
}> {
  try {
    const force = opts?.force ? '&force=true' : ''
    const res = await fetch(`/api/markets?action=desk&asset=${asset}${force}`)
    return (await res.json()) as {
      ok: boolean
      signals?: DeskSignal[]
      board?: DeskBoard
      disclaimer?: string
      message?: string
      asset?: string
      sourceHealth?: SourceHealthRow[]
    }
  } catch {
    return { ok: false, message: 'Desk offline' }
  }
}

export async function fetchSourceHealth(): Promise<{
  ok: boolean
  sources?: SourceHealthRow[]
}> {
  try {
    const res = await fetch('/api/markets?action=source-health')
    return (await res.json()) as { ok: boolean; sources?: SourceHealthRow[] }
  } catch {
    return { ok: false }
  }
}

/** Live Binance trade stream via SSE — updates on every trade. */
export async function subscribeMarketQuotes(
  onQuotes: (quotes: MarketQuote[]) => void,
): Promise<() => void> {
  let es: EventSource | null = null
  let pollId: number | null = null
  let stopped = false
  const quotesById = new Map<string, MarketQuote>()
  let order: string[] = []

  const emit = () => {
    const list =
      order.length > 0
        ? order.map((id) => quotesById.get(id)).filter((q): q is MarketQuote => Boolean(q))
        : [...quotesById.values()]
    onQuotes(list)
  }

  const applyList = (list: MarketQuote[], replaceOrder: boolean) => {
    for (const q of list) quotesById.set(q.id, q)
    if (replaceOrder && list.length) order = list.map((q) => q.id)
    emit()
  }

  const startPoll = () => {
    if (pollId != null) return
    const tick = async () => {
      if (stopped) return
      const res = await fetchMarketQuotes()
      if (res.ok && res.quotes) applyList(res.quotes, true)
    }
    void tick()
    pollId = window.setInterval(() => void tick(), 2000)
  }

  const stopPoll = () => {
    if (pollId != null) {
      window.clearInterval(pollId)
      pollId = null
    }
  }

  try {
    const profile = encodeURIComponent(activeBusinessProfileId())
    es = new EventSource(`/api/markets/stream?profile=${profile}`)
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as {
          type?: string
          quotes?: MarketQuote[]
          updates?: MarketQuote[]
        }
        if (msg.type === 'quotes' && msg.quotes) {
          applyList(msg.quotes, true)
          stopPoll()
        } else if (msg.type === 'tick' && msg.updates) {
          applyList(msg.updates, false)
          stopPoll()
        }
      } catch {
        /* ignore */
      }
    }
    es.onerror = () => {
      startPoll()
    }
  } catch {
    startPoll()
  }

  void fetchMarketQuotes().then((res) => {
    if (!stopped && res.ok && res.quotes) applyList(res.quotes, true)
  })

  return () => {
    stopped = true
    stopPoll()
    es?.close()
  }
}

