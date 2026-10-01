/**
 * Multi-venue official first-print + verified top-trader stats.
 * Only public exchange/regulatory APIs — no private/insider channels.
 *
 * OKX copy-lead accounts are a survivorship-biased sample (leaderboards show recent
 * winners). Treat lead agreement as CONFIRMATION-ONLY — never as a primary arm trigger.
 * See evaluateStrictRules flow-play gate in markets-desk.ts.
 */
import { markSourceAttempt, markSourceError, markSourceOk } from './markets-health.js'

const UA = 'ToolsAIControlCenter/1.0 (local markets desk)'

export type VenueId = 'binance' | 'okx' | 'bybit' | 'coinbase' | 'kraken' | 'sec' | 'fed'

export type FlashItem = {
  id: string
  venue: VenueId
  title: string
  url: string
  published: string
  kind: 'listing' | 'delist' | 'product' | 'status' | 'regulatory'
}

export type VenueBias = {
  venue: VenueId
  label: string
  /** long/short ratio (>1 = more long) */
  ls: number
  /** L/S ~1h ago (12×5m bars) */
  ls1h: number
  /** change over ~1h */
  lsDelta: number
  longPct: number
  shortPct: number
  retailLs?: number
  takerBuySell?: number
  funding?: number
  oiDeltaPct?: number
  /** Flow lean — NOT raw structural long */
  lean: 'add_long' | 'add_short' | 'crowded_long' | 'crowded_short' | 'neutral'
  detail: string
}

export type LeadTrade = {
  instId: string
  side: 'long' | 'short'
  openPx: number
  closePx: number
  pnl: number
  pnlRatio: number
  openTime: string
  closeTime: string
}

export type LeadAccount = {
  venue: 'okx'
  name: string
  uniqueCode: string
  aum: number
  pnlRatio: number
  winRatio: number
  copyTraders: number
  profileUrl: string
  openSides: { side: string; lever: string; upl: number; uplRatio: number; margin: number }[]
  recentTrades: LeadTrade[]
}

function classifyLean(input: {
  ls: number
  lsDelta: number
  retailLs?: number
  takerBuySell?: number
}): VenueBias['lean'] {
  const { ls, lsDelta, retailLs, takerBuySell } = input
  // Fresh flow beats static "everyone is long" structure
  if (lsDelta >= 0.07) return 'add_long'
  if (lsDelta <= -0.07) return 'add_short'
  // Tops vs retail divergence
  if (retailLs != null && ls <= 0.95 && retailLs >= 1.25) return 'add_short'
  if (retailLs != null && ls >= 1.45 && retailLs <= 0.9) return 'add_long'
  // Crowding without fresh adds = risk, not a buy
  if (ls >= 2.05 && Math.abs(lsDelta) < 0.04) return 'crowded_long'
  if (ls <= 0.55 && Math.abs(lsDelta) < 0.04) return 'crowded_short'
  // Taker flow can tip a flat book
  if (takerBuySell != null && takerBuySell >= 1.25 && lsDelta > 0.02) return 'add_long'
  if (takerBuySell != null && takerBuySell <= 0.8 && lsDelta < -0.02) return 'add_short'
  return 'neutral'
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { 'User-Agent': UA, ...(init?.headers || {}) },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

async function getText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml, */*' },
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function safeIso(input?: string | number | null): string {
  if (input == null || input === '') return new Date().toISOString()
  const d = typeof input === 'number' ? new Date(input) : new Date(input)
  if (Number.isNaN(d.getTime())) return new Date().toISOString()
  return d.toISOString()
}

function parseRss(xml: string, venue: VenueId, sourceName: string, kind: FlashItem['kind']): FlashItem[] {
  const out: FlashItem[] = []
  for (const block of xml.split(/<item[\s>]/i).slice(1, 16)) {
    const title = stripHtml(
      (block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i) || [])[1] || '',
    )
    const link =
      (block.match(/<link[^>]*>\s*([^<\s]+)/i) || [])[1]?.trim() ||
      (block.match(/<guid[^>]*>([^<]+)/i) || [])[1]?.trim() ||
      ''
    const pub = (block.match(/<pubDate[^>]*>([^<]+)/i) || [])[1]?.trim() || ''
    if (!title || !link) continue
    out.push({
      id: `${venue}:${link}`,
      venue,
      title: `[${sourceName}] ${title}`,
      url: link.startsWith('http') ? link : `https://${link}`,
      published: safeIso(pub || null),
      kind,
    })
  }
  return out
}

export async function fetchOkxListings(): Promise<FlashItem[]> {
  const data = await getJson<{
    code?: string
    data?: Array<{ details?: Array<{ title?: string; url?: string; pTime?: string }> }>
  }>('https://www.okx.com/api/v5/support/announcements?annType=announcements-new-listings&page=1')
  const details = data?.data?.[0]?.details || []
  return details.slice(0, 12).map((d) => ({
    id: `okx:${d.url || d.title}`,
    venue: 'okx' as const,
    title: d.title || 'OKX listing',
    url: d.url || 'https://www.okx.com/help',
    published: d.pTime ? safeIso(Number(d.pTime)) : safeIso(null),
    kind: 'listing' as const,
  }))
}

export async function fetchBybitAnnouncements(): Promise<FlashItem[]> {
  const data = await getJson<{
    retCode?: number
    result?: {
      list?: Array<{
        title?: string
        url?: string
        publishTime?: number
        type?: { title?: string; key?: string }
      }>
    }
  }>('https://api.bybit.com/v5/announcements/index?locale=en-US&limit=12')
  return (data?.result?.list || []).map((a) => {
    const key = (a.type?.key || '').toLowerCase()
    const kind: FlashItem['kind'] =
      key.includes('delist') || (a.title || '').toLowerCase().includes('delist')
        ? 'delist'
        : key.includes('list') || (a.title || '').toLowerCase().includes('list')
          ? 'listing'
          : 'product'
    return {
      id: `bybit:${a.url || a.title}`,
      venue: 'bybit' as const,
      title: a.title || 'Bybit notice',
      url: a.url || 'https://announcements.bybit.com',
      published: a.publishTime ? safeIso(a.publishTime) : safeIso(null),
      kind,
    }
  })
}

export async function fetchCoinbaseQuietSources(): Promise<FlashItem[]> {
  // Public but under-followed: Coinbase Status history (retail rarely watches this)
  const statusXml = await getText('https://status.coinbase.com/history.rss')
  if (!statusXml) return []
  return parseRss(statusXml, 'coinbase', 'Coinbase Status', 'status').slice(0, 12)
}

export async function fetchKrakenQuiet(): Promise<FlashItem[]> {
  const xml = await getText('https://blog.kraken.com/feed/')
  if (!xml) return []
  return parseRss(xml, 'kraken', 'Kraken Blog', 'product').slice(0, 8)
}

export async function fetchFedQuiet(): Promise<FlashItem[]> {
  const xml = await getText('https://www.federalreserve.gov/feeds/press_all.xml')
  if (!xml) return []
  return parseRss(xml, 'fed', 'Federal Reserve', 'regulatory').slice(0, 8)
}

export async function fetchAllVenueFlash(): Promise<FlashItem[]> {
  const [okx, bybit, cb, kraken, fed] = await Promise.all([
    fetchOkxListings(),
    fetchBybitAnnouncements(),
    fetchCoinbaseQuietSources(),
    fetchKrakenQuiet(),
    fetchFedQuiet(),
  ])
  return [...okx, ...bybit, ...cb, ...kraken, ...fed]
}

/** Verified top-cohort positioning across major venues (public APIs only). */
export async function fetchMultiVenueBias(symbol: string): Promise<VenueBias[]> {
  const sym = symbol.toUpperCase()
  const biases: VenueBias[] = []
  const pair = `${sym}USDT`
  markSourceAttempt('multi_venue')
  markSourceAttempt('binance_flow')

  // Binance Top Traders + retail + taker + OI + funding
  try {
    const base = 'https://fapi.binance.com/futures/data'
    const [acct, pos, retail, taker, oi, premium] = await Promise.all([
      getJson<Array<{ longAccount?: string; shortAccount?: string; longShortRatio?: string }>>(
        `${base}/topLongShortAccountRatio?symbol=${pair}&period=5m&limit=24`,
      ),
      getJson<Array<{ longShortRatio?: string; longPosition?: string; shortPosition?: string }>>(
        `${base}/topLongShortPositionRatio?symbol=${pair}&period=5m&limit=24`,
      ),
      getJson<Array<{ longShortRatio?: string }>>(
        `${base}/globalLongShortAccountRatio?symbol=${pair}&period=5m&limit=24`,
      ),
      getJson<Array<{ buySellRatio?: string }>>(
        `${base}/takerlongshortRatio?symbol=${pair}&period=5m&limit=3`,
      ),
      getJson<Array<{ sumOpenInterestValue?: string }>>(
        `${base}/openInterestHist?symbol=${pair}&period=5m&limit=24`,
      ),
      getJson<{ lastFundingRate?: string }>(
        `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${pair}`,
      ),
    ])
    const aNow = acct?.[acct.length - 1]
    const pNow = pos?.[pos.length - 1]
    // ~1h ago = 12×5m bars back (not full series)
    const i1h = Math.max(0, (acct?.length || 1) - 13)
    const aOld = acct?.[i1h]
    const pOld = pos?.[i1h]
    if (aNow?.longShortRatio && pNow?.longShortRatio) {
      const ls = (Number(aNow.longShortRatio) + Number(pNow.longShortRatio)) / 2
      const ls1h = aOld?.longShortRatio
        ? (Number(aOld.longShortRatio) + Number(pOld?.longShortRatio || aOld.longShortRatio)) / 2
        : ls
      const lsDelta = ls - ls1h
      const longPct = Number(aNow.longAccount)
      const shortPct = Number(aNow.shortAccount)
      const retailLs = retail?.length ? Number(retail[retail.length - 1].longShortRatio) : undefined
      const takerBuySell = taker?.length
        ? Number(taker[taker.length - 1].buySellRatio)
        : undefined
      let oiDeltaPct: number | undefined
      if (oi && oi.length >= 2) {
        const oiOld = oi[Math.max(0, oi.length - 13)]
        const oiNow = oi[oi.length - 1]
        const a = Number(oiOld.sumOpenInterestValue)
        const b = Number(oiNow.sumOpenInterestValue)
        if (a > 0 && Number.isFinite(a) && Number.isFinite(b)) oiDeltaPct = ((b - a) / a) * 100
      }
      const funding = premium?.lastFundingRate != null ? Number(premium.lastFundingRate) : undefined
      if (![ls, lsDelta, longPct, shortPct].every((n) => Number.isFinite(n))) {
        /* skip corrupt row */
      } else {
        const lean = classifyLean({ ls, lsDelta, retailLs, takerBuySell })
        biases.push({
          venue: 'binance',
          label: 'Binance Top Traders (top 20% margin)',
          ls,
          ls1h,
          lsDelta,
          longPct,
          shortPct,
          retailLs,
          takerBuySell,
          funding,
          oiDeltaPct,
          lean,
          detail: `L/S ${ls.toFixed(3)} (1h Δ ${lsDelta >= 0 ? '+' : ''}${lsDelta.toFixed(3)}) · acct long ${(longPct * 100).toFixed(0)}%${
            retailLs != null ? ` · retail L/S ${retailLs.toFixed(3)}` : ''
          }${takerBuySell != null ? ` · taker ${takerBuySell.toFixed(3)}` : ''}`,
        })
      }
    }
  } catch {
    /* ignore */
  }

  // OKX Top Traders — history for delta
  try {
    const instId = `${sym}-USDT-SWAP`
    const [acct, pos] = await Promise.all([
      getJson<{ code?: string; data?: Array<[string, string]> }>(
        `https://www.okx.com/api/v5/rubik/stat/contracts/long-short-account-ratio-contract-top-trader?instId=${encodeURIComponent(instId)}&period=5m`,
      ),
      getJson<{ code?: string; data?: Array<[string, string]> }>(
        `https://www.okx.com/api/v5/rubik/stat/contracts/long-short-position-ratio-contract-top-trader?instId=${encodeURIComponent(instId)}&period=5m`,
      ),
    ])
    const rowsA = acct?.data || []
    const rowsP = pos?.data || []
    if (rowsA.length && rowsP.length) {
      // OKX returns newest first — take ~1h back (12×5m), not the oldest bar in a long series
      const a = rowsA[0]
      const p = rowsP[0]
      const i1h = Math.min(rowsA.length - 1, 12)
      const aOld = rowsA[i1h]
      const pOld = rowsP[Math.min(rowsP.length - 1, i1h)]
      const ls = (Number(a[1]) + Number(p[1])) / 2
      const ls1h = (Number(aOld[1]) + Number(pOld[1])) / 2
      const lsDelta = ls - ls1h
      if ([ls, ls1h, lsDelta].every((n) => Number.isFinite(n))) {
        const longPct = ls / (1 + ls)
        const lean = classifyLean({ ls, lsDelta })
        biases.push({
          venue: 'okx',
          label: 'OKX Top Traders',
          ls,
          ls1h,
          lsDelta,
          longPct,
          shortPct: 1 - longPct,
          lean,
          detail: `L/S ${ls.toFixed(3)} (1h Δ ${lsDelta >= 0 ? '+' : ''}${lsDelta.toFixed(3)}) · top long ~${(longPct * 100).toFixed(0)}%`,
        })
      }
    }
  } catch {
    /* ignore */
  }

  // Bybit account long/short — history for delta
  try {
    const data = await getJson<{
      retCode?: number
      result?: { list?: Array<{ buyRatio?: string; sellRatio?: string }> }
    }>(
      `https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=${sym}USDT&period=5min&limit=24`,
    )
    const list = data?.result?.list || []
    const row = list[0] // newest first
    const i1h = Math.min(list.length - 1, 12)
    const old = list[i1h]
    if (row?.buyRatio && row?.sellRatio) {
      const buy = Number(row.buyRatio)
      const sell = Number(row.sellRatio)
      if (sell > 0 && Number.isFinite(buy) && Number.isFinite(sell)) {
        const ls = buy / sell
        const ls1h =
          old?.buyRatio && old?.sellRatio && Number(old.sellRatio) > 0
            ? Number(old.buyRatio) / Number(old.sellRatio)
            : ls
        const lsDelta = ls - ls1h
        if ([ls, ls1h, lsDelta].every((n) => Number.isFinite(n))) {
          const lean = classifyLean({ ls, lsDelta })
          biases.push({
            venue: 'bybit',
            label: 'Bybit account long/short',
            ls,
            ls1h,
            lsDelta,
            longPct: buy,
            shortPct: sell,
            lean,
            detail: `L/S ${ls.toFixed(3)} (1h Δ ${lsDelta >= 0 ? '+' : ''}${lsDelta.toFixed(3)}) · buy ${(buy * 100).toFixed(0)}%`,
          })
        }
      }
    }
  } catch {
    /* ignore — fail closed at law layer if empty */
  }

  if (biases.some((b) => b.venue === 'binance')) markSourceOk('binance_flow')
  else markSourceError('binance_flow', `No Binance bias for ${sym}`)
  if (biases.length > 0) markSourceOk('multi_venue')
  else markSourceError('multi_venue', `No venue bias for ${sym}`)

  return biases
}

/** OKX verified copy-lead accounts + their recent public trades (for a symbol). */
let leadRanksCache: {
  at: number
  ranks: Array<{
    nickName?: string
    uniqueCode?: string
    aum?: string
    pnlRatio?: string
    winRatio?: string
    copyTraderNum?: string
    traderInsts?: string[]
    portLink?: string
  }>
} | null = null
const leadAccountCache = new Map<string, { at: number; account: LeadAccount }>()

async function fetchOkxLeadRanks() {
  if (leadRanksCache && Date.now() - leadRanksCache.at < 60_000) return leadRanksCache.ranks
  const data = await getJson<{
    code?: string
    data?: Array<{
      ranks?: Array<{
        nickName?: string
        uniqueCode?: string
        aum?: string
        pnlRatio?: string
        winRatio?: string
        copyTraderNum?: string
        traderInsts?: string[]
        portLink?: string
      }>
    }>
  }>('https://www.okx.com/api/v5/copytrading/public-lead-traders?instType=SWAP')
  const ranks = data?.data?.[0]?.ranks || []
  leadRanksCache = { at: Date.now(), ranks }
  return ranks
}

async function fetchLeadAccountDetail(r: {
  nickName?: string
  uniqueCode?: string
  aum?: string
  pnlRatio?: string
  winRatio?: string
  copyTraderNum?: string
}): Promise<LeadAccount | null> {
  const code = r.uniqueCode
  if (!code) return null
  const hit = leadAccountCache.get(code)
  if (hit && Date.now() - hit.at < 45_000) return hit.account

  const [open, hist] = await Promise.all([
    getJson<{
      code?: string
      data?: Array<{
        posSide?: string
        lever?: string
        upl?: string
        uplRatio?: string
        margin?: string
      }>
    }>(
      `https://www.okx.com/api/v5/copytrading/public-current-subpositions?instType=SWAP&uniqueCode=${code}`,
    ),
    getJson<{
      code?: string
      data?: Array<{
        instId?: string
        posSide?: string
        openAvgPx?: string
        closeAvgPx?: string
        pnl?: string
        pnlRatio?: string
        openTime?: string
        closeTime?: string
      }>
    }>(
      `https://www.okx.com/api/v5/copytrading/public-subpositions-history?instType=SWAP&uniqueCode=${code}&limit=12`,
    ),
  ])

  const recentTrades: LeadTrade[] = (hist?.data || [])
    .filter((t) => t.instId && t.posSide)
    .slice(0, 6)
    .map((t) => ({
      instId: t.instId!,
      side: (t.posSide || 'long').toLowerCase() === 'short' ? 'short' : 'long',
      openPx: Number(t.openAvgPx || 0),
      closePx: Number(t.closeAvgPx || 0),
      pnl: Number(t.pnl || 0),
      pnlRatio: Number(t.pnlRatio || 0),
      openTime: t.openTime ? safeIso(Number(t.openTime)) : '',
      closeTime: t.closeTime ? safeIso(Number(t.closeTime)) : '',
    }))

  const account: LeadAccount = {
    venue: 'okx',
    name: r.nickName || code.slice(0, 8),
    uniqueCode: code,
    aum: Number(r.aum || 0),
    pnlRatio: Number(r.pnlRatio || 0),
    winRatio: Number(r.winRatio || 0),
    copyTraders: Number(r.copyTraderNum || 0),
    profileUrl: `https://www.okx.com/copy-trading/account/${code}`,
    openSides: (open?.data || []).slice(0, 5).map((p) => ({
      side: (p.posSide || '?').toLowerCase(),
      lever: p.lever || '?',
      upl: Number(p.upl || 0),
      uplRatio: Number(p.uplRatio || 0),
      margin: Number(p.margin || 0),
    })),
    recentTrades,
  }
  leadAccountCache.set(code, { at: Date.now(), account })
  return account
}

export async function fetchVerifiedLeadAccounts(symbol: string): Promise<LeadAccount[]> {
  const sym = symbol.toUpperCase()
  const want = `${sym}-USDT-SWAP`
  markSourceAttempt('okx_leads')
  const ranks = await fetchOkxLeadRanks()

  const matched = ranks
    .filter((r) => (r.traderInsts || []).includes(want) && r.uniqueCode)
    .sort((a, b) => Number(b.pnlRatio || 0) - Number(a.pnlRatio || 0))
    .slice(0, 5)

  const accounts = (
    await Promise.all(matched.map((r) => fetchLeadAccountDetail(r)))
  ).filter((a): a is LeadAccount => Boolean(a))

  for (const a of accounts) {
    a.recentTrades.sort((x, y) => {
      const ah = x.instId.startsWith(`${sym}-`) ? 0 : 1
      const bh = y.instId.startsWith(`${sym}-`) ? 0 : 1
      return ah - bh
    })
  }

  const out = accounts.filter((a) => a.recentTrades.length > 0 || a.openSides.length > 0)
  if (out.length > 0 || ranks.length > 0) markSourceOk('okx_leads')
  else markSourceError('okx_leads', 'OKX lead ranks empty')
  return out
}
