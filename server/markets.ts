import fs from 'node:fs'
import { fireNotify, loadVault } from './cc-services.js'
import { currentProfileDataDir, profileDataPath } from './business-profiles.js'
import { fetchTraderNews, type NewsItem } from './markets-news.js'

export type { NewsItem } from './markets-news.js'

export type MarketKind = 'crypto' | 'stock'

export type WatchSymbol = {
  id: string
  kind: MarketKind
  symbol: string
  label: string
  /** TradingView symbol e.g. BINANCE:SOLUSD or NASDAQ:NVDA */
  tv: string
  yahoo: string
  /** Binance spot pair — prefer *USD to match TradingView BINANCE pages */
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

const watchFile = () => profileDataPath('markets-watchlist.json')

/** Curated presets — TV symbols match tradingview.com/symbols/XXXUSD/?exchange=BINANCE */
export const MARKET_PRESETS: WatchSymbol[] = [
  { id: 'btc', kind: 'crypto', symbol: 'BTC', label: 'Bitcoin', tv: 'BINANCE:BTCUSD', yahoo: 'BTC-USD', binance: 'BTCUSD', coingecko: 'bitcoin' },
  { id: 'eth', kind: 'crypto', symbol: 'ETH', label: 'Ethereum', tv: 'BINANCE:ETHUSD', yahoo: 'ETH-USD', binance: 'ETHUSD', coingecko: 'ethereum' },
  { id: 'sol', kind: 'crypto', symbol: 'SOL', label: 'Solana', tv: 'BINANCE:SOLUSD', yahoo: 'SOL-USD', binance: 'SOLUSD', coingecko: 'solana' },
  { id: 'xrp', kind: 'crypto', symbol: 'XRP', label: 'XRP', tv: 'BINANCE:XRPUSD', yahoo: 'XRP-USD', binance: 'XRPUSD', coingecko: 'ripple' },
  { id: 'nvda', kind: 'stock', symbol: 'NVDA', label: 'NVIDIA', tv: 'NASDAQ:NVDA', yahoo: 'NVDA', domain: 'nvidia.com' },
  { id: 'tsla', kind: 'stock', symbol: 'TSLA', label: 'Tesla', tv: 'NASDAQ:TSLA', yahoo: 'TSLA', domain: 'tesla.com' },
  { id: 'aapl', kind: 'stock', symbol: 'AAPL', label: 'Apple', tv: 'NASDAQ:AAPL', yahoo: 'AAPL', domain: 'apple.com' },
  { id: 'msft', kind: 'stock', symbol: 'MSFT', label: 'Microsoft', tv: 'NASDAQ:MSFT', yahoo: 'MSFT', domain: 'microsoft.com' },
  { id: 'amzn', kind: 'stock', symbol: 'AMZN', label: 'Amazon', tv: 'NASDAQ:AMZN', yahoo: 'AMZN', domain: 'amazon.com' },
  { id: 'meta', kind: 'stock', symbol: 'META', label: 'Meta', tv: 'NASDAQ:META', yahoo: 'META', domain: 'meta.com' },
  { id: 'googl', kind: 'stock', symbol: 'GOOGL', label: 'Alphabet', tv: 'NASDAQ:GOOGL', yahoo: 'GOOGL', domain: 'google.com' },
  { id: 'spy', kind: 'stock', symbol: 'SPY', label: 'S&P 500 ETF', tv: 'AMEX:SPY', yahoo: 'SPY', domain: 'ssga.com' },
  { id: 'qqq', kind: 'stock', symbol: 'QQQ', label: 'Nasdaq 100 ETF', tv: 'NASDAQ:QQQ', yahoo: 'QQQ', domain: 'invesco.com' },
  { id: 'doge', kind: 'crypto', symbol: 'DOGE', label: 'Dogecoin', tv: 'BINANCE:DOGEUSD', yahoo: 'DOGE-USD', binance: 'DOGEUSD', coingecko: 'dogecoin' },
  { id: 'bnb', kind: 'crypto', symbol: 'BNB', label: 'BNB', tv: 'BINANCE:BNBUSD', yahoo: 'BNB-USD', binance: 'BNBUSD', coingecko: 'binancecoin' },
]

const DEFAULT_CONFIG: MarketsConfig = {
  symbols: MARKET_PRESETS.filter((p) =>
    ['btc', 'eth', 'sol', 'xrp', 'nvda'].includes(p.id),
  ),
  alertPct: 3,
  discordAlerts: true,
}

let lastAlertAt = new Map<string, number>()

function ensureDataDir() {
  fs.mkdirSync(currentProfileDataDir(), { recursive: true })
}

/** Upgrade old USDT TV symbols → USD so they match TradingView BINANCE pages. */
function normalizeSymbol(s: WatchSymbol): WatchSymbol {
  const preset = MARKET_PRESETS.find((p) => p.id === s.id || p.symbol === s.symbol)
  if (preset) {
    return {
      ...s,
      tv: preset.tv || s.tv,
      binance: s.binance || preset.binance,
      yahoo: s.yahoo || preset.yahoo,
      coingecko: s.coingecko || preset.coingecko,
      domain: s.domain || preset.domain,
    }
  }
  if (s.kind === 'crypto' && /USDT$/.test(s.tv)) {
    return {
      ...s,
      tv: s.tv.replace(/USDT$/, 'USD'),
      binance: (s.binance || s.symbol + 'USDT').replace(/USDT$/, 'USD'),
    }
  }
  return s
}

export function getMarketsConfig(): MarketsConfig {
  ensureDataDir()
  if (!fs.existsSync(watchFile())) {
    saveMarketsConfig(DEFAULT_CONFIG)
    return structuredClone(DEFAULT_CONFIG)
  }
  try {
    const raw = JSON.parse(fs.readFileSync(watchFile(), 'utf8')) as Partial<MarketsConfig>
    const symbols = (
      Array.isArray(raw.symbols) && raw.symbols.length ? raw.symbols : DEFAULT_CONFIG.symbols
    ).map(normalizeSymbol)
    return {
      symbols,
      alertPct: typeof raw.alertPct === 'number' ? raw.alertPct : 3,
      discordAlerts: raw.discordAlerts !== false,
    }
  } catch {
    return structuredClone(DEFAULT_CONFIG)
  }
}

export function saveMarketsConfig(cfg: MarketsConfig): { ok: boolean; message: string; config: MarketsConfig } {
  ensureDataDir()
  const next: MarketsConfig = {
    symbols: (cfg.symbols || []).map(normalizeSymbol),
    alertPct: Math.max(0.1, Number(cfg.alertPct) || 3),
    discordAlerts: Boolean(cfg.discordAlerts),
  }
  fs.writeFileSync(watchFile(), JSON.stringify(next, null, 2), 'utf8')
  return { ok: true, message: 'Watchlist saved', config: next }
}

export type Quote = {
  id: string
  symbol: string
  label: string
  kind: MarketKind
  price: number | null
  changePct: number | null
  tv: string
  source?: string
}

/** Allowed LIVE history windows, represented as a number of minutes. */
export const LIVE_HISTORY_WINDOWS = [1, 5, 10, 15, 30, 45, 60, 240, 360, 720, 1440] as const
export type LiveHistoryWindowMinutes = (typeof LIVE_HISTORY_WINDOWS)[number]

export type PricePoint = {
  time: number
  price: number
}

export type QuoteHistory = {
  id: string
  points: PricePoint[]
  changePct: number | null
  source: string
}

type YahooChartResult = {
  timestamp?: number[]
  indicators?: { quote?: Array<{ close?: Array<number | null> }> }
}

const liveHistoryCache = new Map<
  LiveHistoryWindowMinutes,
  { at: number; histories: QuoteHistory[] }
>()

function isLiveHistoryWindow(value: number): value is LiveHistoryWindowMinutes {
  return LIVE_HISTORY_WINDOWS.includes(value as LiveHistoryWindowMinutes)
}

function historyChange(points: PricePoint[]): number | null {
  const first = points[0]?.price
  const last = points.at(-1)?.price
  if (first == null || last == null || first <= 0) return null
  return Math.round((((last - first) / first) * 100) * 100) / 100
}

function binanceHistoryInterval(minutes: LiveHistoryWindowMinutes): '1m' | '5m' | '15m' {
  if (minutes <= 30) return '1m'
  if (minutes <= 360) return '5m'
  return '15m'
}

async function fetchBinanceHistory(
  s: WatchSymbol,
  minutes: LiveHistoryWindowMinutes,
): Promise<QuoteHistory | null> {
  const pairs = [binancePairFor(s)]
  if (pairs[0].endsWith('USD') && !pairs[0].endsWith('USDT')) {
    pairs.push(pairs[0].replace(/USD$/, 'USDT'))
  }

  const startTime = Date.now() - minutes * 60_000
  for (const pair of pairs) {
    try {
      const params = new URLSearchParams({
        symbol: pair,
        interval: binanceHistoryInterval(minutes),
        startTime: String(startTime),
        limit: '500',
      })
      const res = await fetch(`https://api.binance.com/api/v3/klines?${params}`, {
        signal: AbortSignal.timeout(7000),
      })
      if (!res.ok) continue
      const rows = (await res.json()) as unknown
      if (!Array.isArray(rows)) continue
      const points = rows.flatMap((row): PricePoint[] => {
        if (!Array.isArray(row)) return []
        const time = Number(row[0])
        const price = Number(row[4])
        return Number.isFinite(time) && Number.isFinite(price) && price > 0 ? [{ time, price }] : []
      })
      if (points.length) {
        return {
          id: s.id,
          points,
          changePct: historyChange(points),
          source: 'Binance',
        }
      }
    } catch {
      /* try the USDT fallback */
    }
  }
  return null
}

async function fetchYahooHistory(
  s: WatchSymbol,
  minutes: LiveHistoryWindowMinutes,
): Promise<QuoteHistory | null> {
  try {
    // One-minute bars are a best-effort Yahoo free-feed request and may be unavailable.
    // Returning its empty result preserves market-closed and unavailable-data gaps honestly.
    const interval = minutes <= 60 ? '1m' : '5m'
    const range = minutes <= 60 ? '1d' : '5d'
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s.yahoo)}?interval=${interval}&range=${range}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 ToolsAI-ControlCenter' },
      signal: AbortSignal.timeout(7000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { chart?: { result?: YahooChartResult[] } }
    const result = data.chart?.result?.[0]
    const timestamps = result?.timestamp || []
    const closes = result?.indicators?.quote?.[0]?.close || []
    const cutoffSeconds = Math.floor(Date.now() / 1000) - minutes * 60
    const points = timestamps.flatMap((time, i): PricePoint[] => {
      const price = closes[i]
      return time >= cutoffSeconds && typeof price === 'number' && Number.isFinite(price) && price > 0
        ? [{ time: time * 1000, price }]
        : []
    })
    return {
      id: s.id,
      points,
      changePct: historyChange(points),
      source: 'Yahoo',
    }
  } catch {
    return null
  }
}

/**
 * Intraday paths behind the LIVE cards. This is deliberately separate from
 * quote/alert changes: quotes retain their source-native daily semantics.
 */
export async function fetchLiveHistory(
  requestedMinutes: number,
  opts?: { force?: boolean },
): Promise<{ ok: boolean; window: LiveHistoryWindowMinutes; histories: QuoteHistory[]; at: string }> {
  const window: LiveHistoryWindowMinutes = isLiveHistoryWindow(requestedMinutes) ? requestedMinutes : 1440
  const cached = liveHistoryCache.get(window)
  if (!opts?.force && cached && Date.now() - cached.at < 15_000) {
    return { ok: true, window, histories: cached.histories, at: new Date(cached.at).toISOString() }
  }

  const cfg = getMarketsConfig()
  const results = await Promise.all(
    cfg.symbols.map((s) =>
      s.kind === 'crypto' ? fetchBinanceHistory(s, window) : fetchYahooHistory(s, window),
    ),
  )
  const histories = results.filter((history): history is QuoteHistory => history != null)
  liveHistoryCache.set(window, { at: Date.now(), histories })
  return { ok: true, window, histories, at: new Date().toISOString() }
}

async function fetchYahooQuote(symbol: string): Promise<{ price: number; changePct: number } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 ToolsAI-ControlCenter' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      chart?: {
        result?: Array<{
          meta?: { regularMarketPrice?: number; previousClose?: number; chartPreviousClose?: number }
        }>
      }
    }
    const meta = data.chart?.result?.[0]?.meta
    const price = meta?.regularMarketPrice
    if (typeof price !== 'number') return null
    const prev = meta?.previousClose ?? meta?.chartPreviousClose
    const changePct =
      typeof prev === 'number' && prev !== 0 ? ((price - prev) / prev) * 100 : null
    return { price, changePct: changePct ?? 0 }
  } catch {
    return null
  }
}

async function fetchBinanceTicker(
  pair: string,
): Promise<{ price: number; changePct: number } | null> {
  const tryPairs = [pair]
  if (pair.endsWith('USD') && !pair.endsWith('USDT')) {
    tryPairs.push(pair.replace(/USD$/, 'USDT'))
  } else if (pair.endsWith('USDT')) {
    tryPairs.push(pair.replace(/USDT$/, 'USD'))
  }

  for (const p of tryPairs) {
    try {
      const res = await fetch(
        `https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(p)}`,
        { signal: AbortSignal.timeout(6000) },
      )
      if (!res.ok) continue
      const data = (await res.json()) as { lastPrice?: string; priceChangePercent?: string }
      const price = Number(data.lastPrice)
      const changePct = Number(data.priceChangePercent)
      if (!Number.isFinite(price)) continue
      return {
        price,
        changePct: Number.isFinite(changePct) ? changePct : 0,
      }
    } catch {
      /* try next */
    }
  }
  return null
}

function binancePairFor(s: WatchSymbol): string {
  if (s.binance) return s.binance
  if (s.tv.startsWith('BINANCE:')) return s.tv.slice('BINANCE:'.length)
  return `${s.symbol}USD`
}

/** Quote a symbol list (watchlist, presets, or both). No Discord alerts. */
export async function fetchQuotesForSymbols(symbols: WatchSymbol[]): Promise<Quote[]> {
  const quotes: Quote[] = []
  await Promise.all(
    symbols.map(async (s) => {
      let price: number | null = null
      let changePct: number | null = null
      let source = ''

      if (s.kind === 'crypto') {
        const bn = await fetchBinanceTicker(binancePairFor(s))
        if (bn) {
          price = bn.price
          changePct = bn.changePct
          source = 'Binance'
        }
      }

      if (price == null) {
        const y = await fetchYahooQuote(s.yahoo)
        if (y) {
          price = y.price
          changePct = y.changePct
          source = 'Yahoo'
        }
      }

      quotes.push({
        id: s.id,
        symbol: s.symbol,
        label: s.label,
        kind: s.kind,
        price: price != null && Number.isFinite(price) ? price : null,
        changePct:
          changePct != null && Number.isFinite(changePct)
            ? Math.round(changePct * 100) / 100
            : null,
        tv: s.tv,
        source,
      })
    }),
  )
  return quotes
}

export async function fetchMarketQuotes(): Promise<{ ok: boolean; quotes: Quote[]; at: string }> {
  const cfg = getMarketsConfig()
  const quotes = await fetchQuotesForSymbols(cfg.symbols)

  for (const q of quotes) {
    const s = cfg.symbols.find((x) => x.id === q.id)
    if (
      s &&
      cfg.discordAlerts &&
      q.price != null &&
      q.changePct != null &&
      Math.abs(q.changePct) >= cfg.alertPct
    ) {
      maybeDiscordMove(s, q.price, q.changePct, cfg.alertPct)
    }
  }

  // Keep watchlist order
  const order = new Map(cfg.symbols.map((s, i) => [s.id, i]))
  quotes.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))

  return { ok: true, quotes, at: new Date().toISOString() }
}

function maybeDiscordMove(s: WatchSymbol, price: number, changePct: number, threshold: number) {
  const now = Date.now()
  const prev = lastAlertAt.get(s.id) || 0
  // One price ping per symbol per 45 minutes — not every poll
  if (now - prev < 45 * 60_000) return
  // Set cooldown BEFORE notify to kill parallel fetch races
  lastAlertAt.set(s.id, now)

  const vault = loadVault()
  if (!vault.DISCORD_STATUS_WEBHOOK) return

  const dir = changePct >= 0 ? '▲' : '▼'
  const pct = Math.round(changePct * 100) / 100
  // Quiet market note — never critical / @everyone
  fireNotify(
    `${dir} ${s.symbol} ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`,
    `${s.label} · $${price.toLocaleString(undefined, { maximumFractionDigits: price > 100 ? 2 : 6 })} (24h ≥ ${threshold}%)`,
    Math.abs(pct) >= threshold * 2.5 ? 'warn' : 'info',
    'markets',
  )
}

export async function fetchMarketNews(opts?: {
  force?: boolean
}): Promise<{
  ok: boolean
  items: NewsItem[]
  message?: string
  at?: string
}> {
  return fetchTraderNews({ force: opts?.force ?? false })
}

export function listMarketPresets() {
  return { ok: true, presets: MARKET_PRESETS }
}
