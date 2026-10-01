import type { MarketKind, WatchSymbol } from './markets'

/** CoinGecko CDN image id + filename (see coin-images.coingecko.com). */
const COINGECKO_LOGO: Record<string, { imageId: number; file: string }> = {
  bitcoin: { imageId: 1, file: 'bitcoin.png' },
  ethereum: { imageId: 279, file: 'ethereum.png' },
  solana: { imageId: 4128, file: 'solana.png' },
  ripple: { imageId: 44, file: 'xrp.png' },
  dogecoin: { imageId: 5, file: 'dogecoin.png' },
  binancecoin: { imageId: 825, file: 'binance-coin-logo.png' },
}

/**
 * Ticker → company domain for favicon / logo CDNs.
 * Custom tickers can set `domain` on WatchSymbol.
 */
export const STOCK_LOGO_DOMAINS: Record<string, string> = {
  NVDA: 'nvidia.com',
  TSLA: 'tesla.com',
  AAPL: 'apple.com',
  MSFT: 'microsoft.com',
  AMZN: 'amazon.com',
  META: 'meta.com',
  GOOGL: 'abc.xyz',
  GOOG: 'abc.xyz',
  AMD: 'amd.com',
  INTC: 'intel.com',
  NFLX: 'netflix.com',
  AVGO: 'broadcom.com',
  CRM: 'salesforce.com',
  ORCL: 'oracle.com',
  SPY: 'ssga.com',
  QQQ: 'invesco.com',
  IWM: 'ishares.com',
  DIA: 'spdrs.com',
  VOO: 'vanguard.com',
}

/** Symbol → CoinGecko id when watchlist entry lacks coingecko. */
const CRYPTO_CG_BY_SYMBOL: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  XRP: 'ripple',
  DOGE: 'dogecoin',
  BNB: 'binancecoin',
  ADA: 'cardano',
  AVAX: 'avalanche-2',
  DOT: 'polkadot',
  LINK: 'chainlink',
  MATIC: 'matic-network',
  POL: 'polygon-ecosystem-token',
  PEPE: 'pepe',
  SHIB: 'shiba-inu',
  TRX: 'tron',
  TON: 'the-open-network',
  LTC: 'litecoin',
  UNI: 'uniswap',
  ATOM: 'cosmos',
}

export function symbolMonogram(ticker: string): string {
  const clean = ticker.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  if (clean.length <= 2) return clean || '?'
  return clean.slice(0, 2)
}

function cryptoLogoFromCoingecko(coingeckoId: string, size: number): string | null {
  const entry = COINGECKO_LOGO[coingeckoId]
  if (!entry) return null
  const px = size <= 32 ? 'small' : 'thumb'
  return `https://coin-images.coingecko.com/coins/images/${entry.imageId}/${px}/${entry.file}`
}

function cryptoLogoCandidates(symbol: string, coingecko: string | undefined, size: number): string[] {
  const sym = symbol.toLowerCase()
  const cgId = coingecko || CRYPTO_CG_BY_SYMBOL[symbol.toUpperCase()]
  const out: string[] = []
  if (cgId) {
    const fromCg = cryptoLogoFromCoingecko(cgId, size)
    if (fromCg) out.push(fromCg)
  }
  const px = size <= 32 ? 32 : 64
  out.push(
    `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/${px}/color/${sym}.png`,
  )
  out.push(`https://assets.coincap.io/assets/icons/${sym}@2x.png`)
  return [...new Set(out)]
}

function stockLogoCandidates(domain: string, size: number): string[] {
  const sz = size <= 32 ? 64 : 128
  return [
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${sz}`,
    `https://icons.duckduckgo.com/ip3/${domain}.ico`,
    `https://logo.clearbit.com/${domain}?size=${sz}`,
  ]
}

export function resolveStockDomain(input: Pick<WatchSymbol, 'symbol' | 'domain'>): string | null {
  if (input.domain) return input.domain
  return STOCK_LOGO_DOMAINS[input.symbol.toUpperCase()] || null
}

export type SymbolLogoInput = {
  symbol: string
  kind: MarketKind
  coingecko?: string
  domain?: string
}

/** Ordered CDN candidates; UI tries next URL on error. */
export function resolveSymbolLogoCandidates(input: SymbolLogoInput, size = 32): string[] {
  if (input.kind === 'crypto') {
    return cryptoLogoCandidates(input.symbol, input.coingecko, size)
  }
  const domain = resolveStockDomain(input)
  if (!domain) return []
  return stockLogoCandidates(domain, size)
}

/** Best-effort first CDN URL (compat). */
export function resolveSymbolLogoUrl(input: SymbolLogoInput, size = 32): string | null {
  return resolveSymbolLogoCandidates(input, size)[0] || null
}

export function watchSymbolLogoInput(s: WatchSymbol): SymbolLogoInput {
  return {
    symbol: s.symbol,
    kind: s.kind,
    coingecko: s.coingecko,
    domain: s.domain,
  }
}
