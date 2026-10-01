import { fireNotify, loadVault } from './cc-services.js'
import { getMarketsConfig } from './markets.js'
import { markSourceAttempt, markSourceError, markSourceOk } from './markets-health.js'
import { fetchAllVenueFlash, type FlashItem } from './markets-venues.js'

/** critical = act now · watch = worth a look · filler = noise */
export type NewsTier = 'critical' | 'watch' | 'filler'

export type NewsItem = {
  id: string
  title: string
  url: string
  source: string
  published: string
  categories: string[]
  tier: NewsTier
}

const UA = 'ToolsAIControlCenter/1.0 (local markets desk; contact: local)'
/** SEC fair-access UA — must include app name + contact email or EDGAR returns 403. */
export const SEC_UA = 'ToolsAI Control Center markets@toolsai.local'

const BINANCE_CATALOGS: { id: number; label: string; limit: number }[] = [
  { id: 48, label: 'New listing', limit: 10 },
  { id: 49, label: 'Latest', limit: 8 },
  { id: 161, label: 'Delisting', limit: 8 },
  { id: 93, label: 'Maintenance', limit: 4 },
]

const RSS_FEEDS: { url: string; source: string }[] = [
  { url: 'https://www.theblock.co/rss.xml', source: 'The Block' },
  { url: 'https://cointelegraph.com/rss', source: 'CoinTelegraph' },
  { url: 'https://decrypt.co/feed', source: 'Decrypt' },
  { url: 'https://bitcoinmagazine.com/.rss/full/', source: 'Bitcoin Magazine' },
]

let lastFlashIds = new Set<string>()
let newsCache: NewsItem[] = []
let newsCacheAt = 0
// A brief shared snapshot prevents the Desk and Feed from independently
// re-running the same public-source fan-out during normal UI polling.
const NEWS_CACHE_MS = 8_000

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function safeIso(input?: string | number | null): string | null {
  if (input == null || input === '') return null
  const d = typeof input === 'number' ? new Date(input) : new Date(input)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

/** Score headline into critical / watch / filler using verified-source + language rules. */
export function classifyNewsTier(item: Omit<NewsItem, 'tier'> & { tier?: NewsTier }): NewsTier {
  const t = `${item.title} ${item.source} ${(item.categories || []).join(' ')}`.toLowerCase()
  const src = item.source.toLowerCase()

  // CRITICAL — risk / material legal prints that move books
  if (
    t.includes('delist') ||
    t.includes('removal of') ||
    t.includes('suspended') ||
    t.includes('suspension') ||
    t.includes('halt') ||
    t.includes('hack') ||
    t.includes('exploit') ||
    t.includes('insolvent') ||
    t.includes('bankrupt') ||
    (src.includes('sec') && t.includes('enforcement')) ||
    (src.includes('federal reserve') &&
      (t.includes('rate') || t.includes('fomc') || t.includes('emergency')))
  ) {
    return 'critical'
  }

  // Legal insider Form 4 + routine 8-K = worth a look (public EDGAR — not leaked chats)
  if (
    t.includes('form 4') ||
    t.includes('form4') ||
    src.includes('form 4') ||
    categoriesHas(item, 'Form4') ||
    categoriesHas(item, 'verified-insider') ||
    (src.includes('sec') && (t.includes('8-k') || categoriesHas(item, '8-K')))
  ) {
    return 'watch'
  }

  // FILLER — status pages, earn fluff, maintenance, soft media
  if (
    t.includes('status]') ||
    src.includes('status') ||
    t.includes('maintenance') ||
    t.includes('scheduled') ||
    t.includes('earn') ||
    t.includes('vip loan') ||
    t.includes('convert') ||
    t.includes('how to') ||
    t.includes('guide') ||
    t.includes('tutorial') ||
    categoriesHas(item, 'status') ||
    categoriesHas(item, 'media') ||
    src.includes('cointelegraph') ||
    src.includes('decrypt') ||
    src.includes('bitcoin magazine')
  ) {
    // Exception: listing language in media still filler; exchange listing is watch below
    if (!/\b(will list|lists |new listing|launch(?:es|ing)? .*perpetual|spot trading)\b/i.test(t)) {
      return 'filler'
    }
  }

  // WATCH — verified early prints worth eyes (listings, Fed/SEC routine, top wires)
  if (
    categoriesHas(item, 'listing') ||
    categoriesHas(item, 'delist') ||
    categoriesHas(item, 'regulatory') ||
    t.includes('will list') ||
    t.includes('new listing') ||
    t.includes('perpetual') ||
    t.includes('lists ') ||
    src.includes('okx') ||
    src.includes('bybit') ||
    src.includes('kraken') ||
    src.includes('binance') ||
    src.includes('federal reserve') ||
    src.includes('sec edgar') ||
    src.includes('the block')
  ) {
    return 'watch'
  }

  return 'filler'
}

function categoriesHas(item: { categories?: string[] }, needle: string) {
  return (item.categories || []).some((c) => c.toLowerCase().includes(needle.toLowerCase()))
}

function parseRssItems(xml: string, source: string): NewsItem[] {
  const items: NewsItem[] = []
  const blocks = xml.split(/<item[\s>]/i).slice(1)
  for (const block of blocks.slice(0, 16)) {
    const title = stripHtml(
      (block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i) || [])[1] || '',
    )
    const link =
      (block.match(/<link[^>]*>\s*([^<\s]+)/i) || [])[1]?.trim() ||
      (block.match(/<guid[^>]*>([^<]+)/i) || [])[1]?.trim() ||
      ''
    const pub =
      (block.match(/<pubDate[^>]*>([^<]+)/i) || [])[1]?.trim() ||
      (block.match(/<dc:date[^>]*>([^<]+)/i) || [])[1]?.trim() ||
      ''
    if (!title || !link) continue
    const published = safeIso(pub) || new Date().toISOString()
    const base = {
      id: `rss:${source}:${link}`,
      title,
      url: link.startsWith('http') ? link : `https://${link}`,
      source,
      published,
      categories: ['media'],
    }
    items.push({ ...base, tier: classifyNewsTier(base) })
  }
  return items
}

async function fetchBinanceFlash(): Promise<NewsItem[]> {
  const out: NewsItem[] = []
  await Promise.all(
    BINANCE_CATALOGS.map(async (cat) => {
      try {
        const url = `https://www.binance.com/bapi/composite/v1/public/cms/article/catalog/list/query?catalogId=${cat.id}&pageNo=1&pageSize=${cat.limit}`
        const res = await fetch(url, {
          headers: { 'User-Agent': UA, lang: 'en' },
          signal: AbortSignal.timeout(8000),
        })
        if (!res.ok) return
        const data = (await res.json()) as {
          data?: {
            articles?: Array<{
              title?: string
              code?: string
              releaseDate?: number | string | null
            }>
          }
        }
        for (const a of data.data?.articles || []) {
          if (!a.title || !a.code) continue
          let published = new Date().toISOString()
          if (typeof a.releaseDate === 'number' && a.releaseDate > 1e12) {
            published = new Date(a.releaseDate).toISOString()
          } else if (typeof a.releaseDate === 'number' && a.releaseDate > 1e9) {
            published = new Date(a.releaseDate * 1000).toISOString()
          } else if (typeof a.releaseDate === 'string' && a.releaseDate) {
            const d = new Date(a.releaseDate)
            if (!Number.isNaN(d.getTime())) published = d.toISOString()
          }
          const base = {
            id: `binance:${a.code}`,
            title: a.title,
            url: `https://www.binance.com/en/support/announcement/${a.code}`,
            source: `Binance · ${cat.label}`,
            published,
            categories: ['exchange', cat.label],
          }
          out.push({ ...base, tier: classifyNewsTier(base) })
        }
      } catch {
        /* ignore catalog */
      }
    }),
  )
  return out
}

async function fetchRssFeeds(): Promise<NewsItem[]> {
  const batches = await Promise.all(
    RSS_FEEDS.map(async (feed) => {
      try {
        const res = await fetch(feed.url, {
          headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml, */*' },
          signal: AbortSignal.timeout(8000),
          redirect: 'follow',
        })
        if (!res.ok) return [] as NewsItem[]
        return parseRssItems(await res.text(), feed.source)
      } catch {
        return [] as NewsItem[]
      }
    }),
  )
  return batches.flat()
}

export type SecTickerRow = { cik: string; ticker: string; title: string }

let secTickerCache: { at: number; byCik: Map<string, SecTickerRow>; byTicker: Map<string, SecTickerRow> } | null =
  null

export function padCik(raw: string | number): string {
  return String(raw).replace(/\D/g, '').padStart(10, '0')
}

export async function secFetch(url: string, timeoutMs = 10_000): Promise<Response | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': SEC_UA,
        Accept: 'application/atom+xml, application/xml, text/xml, application/json, */*',
        'Accept-Encoding': 'gzip, deflate',
      },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    })
    return res
  } catch {
    return null
  }
}

export async function loadSecTickerMap(): Promise<{
  byCik: Map<string, SecTickerRow>
  byTicker: Map<string, SecTickerRow>
}> {
  if (secTickerCache && Date.now() - secTickerCache.at < 24 * 60 * 60_000) {
    return { byCik: secTickerCache.byCik, byTicker: secTickerCache.byTicker }
  }
  const byCik = new Map<string, SecTickerRow>()
  const byTicker = new Map<string, SecTickerRow>()
  const res = await secFetch('https://www.sec.gov/files/company_tickers.json', 15_000)
  if (!res?.ok) {
    if (secTickerCache) return { byCik: secTickerCache.byCik, byTicker: secTickerCache.byTicker }
    return { byCik, byTicker }
  }
  try {
    const data = (await res.json()) as Record<string, { cik_str?: number | string; ticker?: string; title?: string }>
    for (const row of Object.values(data)) {
      if (!row?.ticker || row.cik_str == null) continue
      const entry: SecTickerRow = {
        cik: padCik(row.cik_str),
        ticker: String(row.ticker).toUpperCase(),
        title: String(row.title || ''),
      }
      byCik.set(entry.cik, entry)
      byTicker.set(entry.ticker, entry)
    }
    secTickerCache = { at: Date.now(), byCik, byTicker }
  } catch {
    /* keep empty maps */
  }
  return { byCik, byTicker }
}

type AtomEntry = {
  title: string
  link: string
  updated: string
  cik: string | null
  role: 'issuer' | 'reporting' | 'unknown'
  filingHref: string | null
}

function parseAtomEntries(xml: string): AtomEntry[] {
  const chunks = xml.split(/<entry[\s>]/i).slice(1)
  const out: AtomEntry[] = []
  for (const e of chunks) {
    const title = stripHtml(
      (e.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i) || [])[1] || '',
    )
    const link =
      (e.match(/<link[^>]+href="([^"]+)"/i) || [])[1] ||
      (e.match(/<filing-href>([^<]+)/i) || [])[1] ||
      (e.match(/<id[^>]*>([^<]+)/i) || [])[1] ||
      ''
    const updated =
      (e.match(/<updated[^>]*>([^<]+)/i) || [])[1] ||
      (e.match(/<filing-date>([^<]+)/i) || [])[1] ||
      (e.match(/<published[^>]*>([^<]+)/i) || [])[1] ||
      ''
    if (!title || !link) continue
    const cikMatch =
      title.match(/\((\d{6,10})\)/) ||
      e.match(/<issuerCik>(\d+)<\/issuerCik>/i) ||
      e.match(/edgar\/data\/(\d+)\//i) ||
      link.match(/edgar\/data\/(\d+)\//i)
    const cik = cikMatch ? padCik(cikMatch[1]) : null
    const role: AtomEntry['role'] = /\(Issuer\)/i.test(title)
      ? 'issuer'
      : /\(Reporting\)/i.test(title)
        ? 'reporting'
        : 'unknown'
    const filingHref =
      (e.match(/<filing-href>([^<]+)/i) || [])[1] ||
      (link.includes('-index.htm') ? link : null)
    out.push({ title, link, updated, cik, role, filingHref })
  }
  return out
}

function matchWatchlistTickers(
  entry: AtomEntry,
  watch: { symbol: string; label: string }[],
  byCik: Map<string, SecTickerRow>,
): string[] {
  const matched = new Set<string>()
  const titleU = entry.title.toUpperCase()
  if (entry.cik) {
    const row = byCik.get(entry.cik)
    if (row) {
      for (const w of watch) {
        if (w.symbol.toUpperCase() === row.ticker) matched.add(row.ticker)
      }
    }
  }
  for (const w of watch) {
    const sym = w.symbol.toUpperCase()
    if (
      titleU.includes(` ${sym} `) ||
      titleU.includes(`(${sym})`) ||
      titleU.includes(`· ${sym}`) ||
      titleU.startsWith(`${sym} `)
    ) {
      matched.add(sym)
    }
    const company = w.label
      .toUpperCase()
      .replace(/\b(INC|CORP|LTD|LLC|CO|CLASS [A-Z]|ETF|PLC)\b\.?/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    const first = company.split(/\s+/)[0]
    if (first && first.length >= 4 && titleU.includes(first)) matched.add(sym)
    if (company.length >= 5 && titleU.includes(company)) matched.add(sym)
  }
  return [...matched]
}

type Form4Lean = 'buy' | 'sell' | 'other' | 'unknown'

async function enrichForm4Lean(indexUrl: string): Promise<{
  lean: Form4Lean
  symbol?: string
  name?: string
  reportingOwnerName?: string
  reportingOwnerRole?: string
  transactionDate?: string
  /** Days from earliest transactionDate → now (proxy for filing lag until Atom published is compared in desk) */
  ageDays?: number
}> {
  try {
    const idxRes = await secFetch(indexUrl, 8_000)
    if (!idxRes?.ok) return { lean: 'unknown' }
    const html = await idxRes.text()
    // Prefer raw ownership XML (not the xslF345X* HTML transform)
    const xmls = [...html.matchAll(/href="([^"]+\.xml)"/gi)].map((m) => m[1])
    const rawPath =
      xmls.find((h) => !/xslF345/i.test(h) && /form4|ownership|wk-form4/i.test(h)) ||
      xmls.find((h) => !/xslF345/i.test(h)) ||
      xmls[0]
    if (!rawPath) return { lean: 'unknown' }
    const xmlUrl = rawPath.startsWith('http') ? rawPath : `https://www.sec.gov${rawPath}`
    const xmlRes = await secFetch(xmlUrl, 8_000)
    if (!xmlRes?.ok) return { lean: 'unknown' }
    const xml = await xmlRes.text()
    const codes = [...xml.matchAll(/<transactionCode>\s*([A-Z])\s*<\/transactionCode>/gi)].map((m) =>
      m[1].toUpperCase(),
    )
    const symbol = (xml.match(/<issuerTradingSymbol>\s*([^<]+)/i) || [])[1]?.trim().toUpperCase()
    const name = (xml.match(/<issuerName>\s*([^<]+)/i) || [])[1]?.trim()
    const reportingOwnerName = (xml.match(/<rptOwnerName>\s*([^<]+)/i) || [])[1]?.trim()
    const officerTitle = (xml.match(/<officerTitle>\s*([^<]+)/i) || [])[1]?.trim()
    const isOfficer = /<isOfficer>\s*(?:1|true)\s*<\/isOfficer>/i.test(xml)
    const isDirector = /<isDirector>\s*(?:1|true)\s*<\/isDirector>/i.test(xml)
    const reportingOwnerRole = [
      officerTitle || (isOfficer ? 'Officer' : ''),
      isDirector ? 'Director' : '',
    ]
      .filter(Boolean)
      .join(' · ')
      || undefined
    const txDates = [...xml.matchAll(/<transactionDate>\s*<value>\s*([^<]+)/gi)].map((m) => m[1].trim())
    const period = (xml.match(/<periodOfReport>\s*([^<]+)/i) || [])[1]?.trim()
    const earliest = [...txDates, period].filter(Boolean).sort()[0]
    let transactionDate: string | undefined
    let ageDays: number | undefined
    if (earliest) {
      const ms = Date.parse(earliest)
      if (Number.isFinite(ms)) {
        transactionDate = new Date(ms).toISOString().slice(0, 10)
        ageDays = Math.max(0, Math.round((Date.now() - ms) / (24 * 60 * 60 * 1000)))
      }
    }
    const meta = {
      symbol,
      name,
      reportingOwnerName,
      reportingOwnerRole,
      transactionDate,
      ageDays,
    }
    if (codes.some((c) => c === 'S')) return { lean: 'sell', ...meta }
    if (codes.some((c) => c === 'P')) return { lean: 'buy', ...meta }
    if (codes.length) return { lean: 'other', ...meta }
    return { lean: 'unknown', ...meta }
  } catch {
    return { lean: 'unknown' }
  }
}

function leanLabel(lean: Form4Lean): string {
  if (lean === 'buy') return 'open-market purchase'
  if (lean === 'sell') return 'open-market sale'
  if (lean === 'other') return 'non-open-market / award / other'
  return 'transaction type n/a in title'
}

/** 8-K + Form 4 = legal, verified insider / corporate first prints (public EDGAR only). */
async function fetchSecAtom(): Promise<NewsItem[]> {
  const watch = getMarketsConfig()
    .symbols.filter((s) => s.kind === 'stock')
    .slice(0, 8)
    .map((s) => ({ symbol: s.symbol.toUpperCase(), label: s.label }))

  const { byCik, byTicker } = await loadSecTickerMap()

  type FeedSpec = {
    url: string
    form: '4' | '8-K'
    forcedTicker?: string
    preferIssuer?: boolean
    limit: number
  }

  const feedSpecs: FeedSpec[] = [
    {
      url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&owner=include&count=100&output=atom',
      form: '4',
      preferIssuer: true,
      limit: 40,
    },
    {
      url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&owner=include&count=40&output=atom',
      form: '8-K',
      limit: 25,
    },
    ...watch.map((w) => {
      const row = byTicker.get(w.symbol)
      const cikOrTicker = row?.cik || w.symbol
      return {
        url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${encodeURIComponent(cikOrTicker)}&type=4&owner=include&count=8&output=atom`,
        form: '4' as const,
        forcedTicker: w.symbol,
        limit: 6,
      }
    }),
  ]

  // Sequential SEC pulls — fair-access policy is ~10 req/s; bursts get empty/403.
  const feedBatches: { entry: AtomEntry; form: '4' | '8-K'; forcedTicker?: string }[][] = []
  for (const feed of feedSpecs) {
    const res = await secFetch(feed.url)
    if (!res?.ok) {
      feedBatches.push([])
      await new Promise((r) => setTimeout(r, 120))
      continue
    }
    const xml = await res.text()
    let entries = parseAtomEntries(xml)
    if (feed.preferIssuer) {
      entries = entries.filter((e) => e.role !== 'reporting')
    }
    feedBatches.push(
      entries.slice(0, feed.limit).map((entry) => ({
        entry,
        form: feed.form,
        forcedTicker: feed.forcedTicker,
      })),
    )
    await new Promise((r) => setTimeout(r, 120))
  }

  type Draft = {
    entry: AtomEntry
    form: '4' | '8-K'
    matched: string[]
    lean: Form4Lean
    reportingOwnerName?: string
    reportingOwnerRole?: string
    form4AgeDays?: number
    transactionDate?: string
  }
  const drafts: Draft[] = []
  const seenLinks = new Set<string>()

  for (const batch of feedBatches) {
    for (const { entry, form, forcedTicker } of batch) {
      const key = entry.link.replace(/#.*$/, '')
      if (seenLinks.has(key)) continue
      seenLinks.add(key)

      const matched = new Set(matchWatchlistTickers(entry, watch, byCik))
      if (forcedTicker) matched.add(forcedTicker)
      if (entry.cik) {
        const row = byCik.get(entry.cik)
        if (row && watch.some((w) => w.symbol === row.ticker)) matched.add(row.ticker)
      }

      drafts.push({
        entry,
        form,
        matched: [...matched],
        lean: 'unknown',
      })
    }
  }

  // Enrich watchlist-matched Form 4s with ownership XML (P/S + officer/director
  // relationship). Two concurrent public SEC requests stay well below fair-access
  // limits while avoiding a long serial wait for every filing.
  const enrichTargets = drafts.filter((d) => d.form === '4' && d.matched.length > 0).slice(0, 6)
  for (let offset = 0; offset < enrichTargets.length; offset += 2) {
    await Promise.all(
      enrichTargets.slice(offset, offset + 2).map(async (d) => {
        const indexUrl =
          d.entry.filingHref || (d.entry.link.includes('-index.htm') ? d.entry.link : null)
        if (!indexUrl) return
        const info = await enrichForm4Lean(indexUrl)
        d.lean = info.lean
        d.reportingOwnerName = info.reportingOwnerName
        d.reportingOwnerRole = info.reportingOwnerRole
        d.form4AgeDays = info.ageDays
        d.transactionDate = info.transactionDate
        if (info.symbol && watch.some((w) => w.symbol === info.symbol)) {
          if (!d.matched.includes(info.symbol)) d.matched.push(info.symbol)
        }
      }),
    )
    if (offset + 2 < enrichTargets.length) {
      await new Promise((r) => setTimeout(r, 120))
    }
  }

  const items: NewsItem[] = []
  let generalForm4 = 0
  let general8k = 0
  const seenIssuerCiks = new Set<string>()

  for (const d of drafts) {
    const watchHit = d.matched.length > 0
    if (d.form === '4') {
      if (!watchHit) {
        // One general print per issuer CIK — avoid 12 identical Keenova rows
        if (d.entry.cik) {
          if (seenIssuerCiks.has(d.entry.cik)) continue
          seenIssuerCiks.add(d.entry.cik)
        }
        if (generalForm4 >= 12) continue
        generalForm4++
      }
    } else if (!watchHit) {
      if (general8k >= 10) continue
      general8k++
    }

    const tickPart = d.matched.length ? d.matched.join('/') : ''
    const cleanedTitle = d.entry.title
      .replace(/^4(?:\/A)?\s*-?\s*/i, '')
      .replace(/^8-K(?:\/A)?\s*-?\s*/i, '')
      .replace(/\s*\(\d{6,10}\).*$/, '')
      .replace(/\s*\((?:Issuer|Reporting)\)\s*$/i, '')
      .trim()
    const companyHint =
      (d.matched[0] && byTicker.get(d.matched[0])?.title) ||
      (d.entry.cik && byCik.get(d.entry.cik)?.title) ||
      cleanedTitle ||
      d.entry.title

    const cats: string[] = ['regulatory', 'w0']
    let title: string
    let source: string

    if (d.form === '4') {
      source = 'SEC EDGAR · Form 4 (public)'
      title = tickPart
        ? `Verified · SEC Form 4 (public) · ${tickPart} · ${companyHint} · ${leanLabel(d.lean)}`
        : `Verified · SEC Form 4 (public) · ${companyHint}`
      cats.push('Form4', 'insider', 'verified-insider')
      if (d.lean === 'buy') cats.push('form4-buy')
      if (d.lean === 'sell') cats.push('form4-sell')
      if (typeof d.form4AgeDays === 'number') cats.push(`form4-age-days:${d.form4AgeDays}`)
      if (d.transactionDate) cats.push(`form4-tx:${d.transactionDate}`)
      if (d.reportingOwnerName) cats.push(`form4-owner:${encodeURIComponent(d.reportingOwnerName)}`)
      if (d.reportingOwnerRole) {
        cats.push(`form4-role:${encodeURIComponent(d.reportingOwnerRole)}`, 'form4-executive')
      }
      // Confirmation-only signal — lagging public disclosure, not a primary arm trigger
      cats.push('confirmation-only')
    } else {
      source = 'SEC EDGAR · 8-K (public)'
      title = tickPart
        ? `SEC 8-K (public) · ${tickPart} · ${companyHint}`
        : `SEC 8-K (public) · ${companyHint}`
      cats.push('8-K', 'filing')
    }
    for (const tk of d.matched) cats.push(`tick:${tk}`)

    const base = {
      id: `sec:${d.form}:${d.entry.link}`,
      title,
      url: d.entry.link.startsWith('http') ? d.entry.link : `https://www.sec.gov${d.entry.link}`,
      source,
      published: safeIso(d.entry.updated) || new Date().toISOString(),
      categories: cats,
    }
    items.push({ ...base, tier: classifyNewsTier(base) })
  }

  return items
}

async function fetchCryptoCompare(): Promise<NewsItem[]> {
  const vault = loadVault()
  const key = (vault.CRYPTOCOMPARE_API_KEY || '').trim()
  const url = key
    ? `https://min-api.cryptocompare.com/data/v2/news/?lang=EN&api_key=${encodeURIComponent(key)}`
    : 'https://min-api.cryptocompare.com/data/v2/news/?lang=EN'
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': UA } })
    if (!res.ok) return []
    const data = (await res.json()) as {
      Data?: Array<{
        id?: string | number
        title?: string
        url?: string
        source?: string
        source_info?: { name?: string }
        published_on?: number
        categories?: string
      }>
    }
    return (data.Data || []).slice(0, 20).map((n) => {
      const base = {
        id: `cc:${n.id || n.url}`,
        title: n.title || 'Untitled',
        url: n.url || '#',
        source: n.source_info?.name || n.source || 'CryptoCompare',
        published: n.published_on
          ? new Date(n.published_on * 1000).toISOString()
          : new Date().toISOString(),
        categories: (n.categories || '')
          .split('|')
          .map((c) => c.trim())
          .filter(Boolean)
          .concat(['media']),
      }
      return { ...base, tier: classifyNewsTier(base) }
    })
  } catch {
    return []
  }
}

function dedupe(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>()
  const out: NewsItem[] = []
  for (const item of items) {
    // Prefer stable URL/id so multiple Form 4s for the same issuer stay distinct
    const key =
      (item.id && item.id.length > 8 ? item.id : '') ||
      item.url ||
      item.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 80)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

function tierRank(t: NewsTier): number {
  if (t === 'critical') return 0
  if (t === 'watch') return 1
  return 2
}

/** Keep feed diverse — don't let Binance/Coinbase drown OKX/Bybit/SEC/Fed. */
function diversify(items: NewsItem[], limit = 90): NewsItem[] {
  const byTier: Record<NewsTier, NewsItem[]> = { critical: [], watch: [], filler: [] }
  for (const i of items) byTier[i.tier].push(i)

  const pickBalanced = (list: NewsItem[], max: number) => {
    const perSource = new Map<string, number>()
    const out: NewsItem[] = []
    const tryAdd = (item: NewsItem) => {
      if (out.length >= max) return false
      if (out.some((x) => x.id === item.id)) return false
      const src = item.source.split('·')[0].trim().toLowerCase()
      const cats = item.categories || []
      const isVerifiedForm4 = cats.includes('Form4') || cats.includes('verified-insider')
      const isSec = src.includes('sec')
      const bucket = isSec ? (isVerifiedForm4 ? `${src}#form4` : `${src}#other`) : src
      const n = perSource.get(bucket) || 0
      const cap = isSec ? (isVerifiedForm4 ? 12 : 10) : 8
      if (n >= cap && item.tier !== 'critical') return false
      perSource.set(bucket, n + 1)
      out.push(item)
      return true
    }

    // Reserve verified public Form 4 first (capped) so exchange flash cannot starve EDGAR
    let reservedForm4 = 0
    for (const item of list) {
      const cats = item.categories || []
      if (!(cats.includes('Form4') || cats.includes('verified-insider'))) continue
      if (reservedForm4 >= 12) break
      if (tryAdd(item)) reservedForm4++
    }
    for (const item of list) tryAdd(item)
    return out
  }

  return [
    ...pickBalanced(byTier.critical, 25),
    ...pickBalanced(byTier.watch, 45),
    ...pickBalanced(byTier.filler, 25),
  ].slice(0, limit)
}

function maybeDiscordFlash(items: NewsItem[]) {
  const vault = loadVault()
  if (!vault.DISCORD_STATUS_WEBHOOK) return

  const risk = items.filter((i) => {
    if (i.tier !== 'critical') return false
    if (lastFlashIds.has(i.id)) return false
    const t = `${i.title} ${i.source}`.toLowerCase()
    return (
      t.includes('delist') ||
      t.includes('removal of') ||
      t.includes('suspended') ||
      t.includes('halt') ||
      t.includes('form 4') ||
      t.includes('hack') ||
      t.includes('exploit')
    )
  })

  for (const item of risk.slice(0, 2)) {
    lastFlashIds.add(item.id)
    fireNotify(`Critical · ${item.source}`, `${item.title}\n${item.url}`, 'warn', 'markets')
  }

  for (const i of items.filter((x) => x.tier === 'critical')) lastFlashIds.add(i.id)
  if (lastFlashIds.size > 400) {
    lastFlashIds = new Set([...lastFlashIds].slice(-200))
  }
}

function venuesToNews(items: FlashItem[]): NewsItem[] {
  const sourceLabel: Record<FlashItem['venue'], string> = {
    binance: 'Binance',
    okx: 'OKX',
    bybit: 'Bybit',
    coinbase: 'Coinbase',
    kraken: 'Kraken',
    sec: 'SEC',
    fed: 'Federal Reserve',
  }
  return items.map((v) => {
    const base = {
      id: v.id,
      title: v.title,
      url: v.url,
      source: sourceLabel[v.venue] || v.venue,
      published: v.published,
      categories: [v.kind, 'w0'],
    }
    return { ...base, tier: classifyNewsTier(base) }
  })
}

export async function fetchTraderNews(opts?: {
  force?: boolean
}): Promise<{ ok: boolean; items: NewsItem[]; message?: string; at: string }> {
  const now = Date.now()
  if (!opts?.force && newsCache.length && now - newsCacheAt < NEWS_CACHE_MS) {
    return { ok: true, items: newsCache, at: new Date(newsCacheAt).toISOString() }
  }

  const [binance, venues, rss, sec, cc] = await Promise.all([
    fetchBinanceFlash(),
    fetchAllVenueFlash(),
    fetchRssFeeds(),
    (async () => {
      markSourceAttempt('edgar')
      markSourceAttempt('sec_rss')
      try {
        const items = await fetchSecAtom()
        if (items.length > 0) {
          markSourceOk('edgar')
          markSourceOk('sec_rss')
        } else {
          markSourceError('edgar', 'SEC Atom empty')
          markSourceError('sec_rss', 'SEC Atom empty')
        }
        return items
      } catch (err) {
        markSourceError('edgar', err instanceof Error ? err.message : String(err))
        markSourceError('sec_rss', err instanceof Error ? err.message : String(err))
        return [] as NewsItem[]
      }
    })(),
    fetchCryptoCompare(),
  ])

  // Fed items arrive via venue flash — mark fed if any present
  if (venues.some((v) => v.venue === 'fed')) markSourceOk('fed_rss')
  else markSourceAttempt('fed_rss')

  const venueNews = venuesToNews(venues)
  const all = dedupe([...binance, ...venueNews, ...sec, ...rss, ...cc]).map((item) => ({
    ...item,
    tier: classifyNewsTier(item),
    categories: item.categories.filter((c) => !/^w\d+$/.test(c)),
  }))

  const sorted = all.sort((a, b) => {
    const tr = tierRank(a.tier) - tierRank(b.tier)
    if (tr !== 0) return tr
    return Date.parse(b.published) - Date.parse(a.published)
  })

  newsCache = diversify(sorted, 90)
  newsCacheAt = now
  maybeDiscordFlash(newsCache)

  const counts = { critical: 0, watch: 0, filler: 0 }
  const sources = new Map<string, number>()
  for (const i of newsCache) {
    counts[i.tier]++
    const s = i.source.split('·')[0].trim()
    sources.set(s, (sources.get(s) || 0) + 1)
  }
  const srcPart = [...sources.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k, n]) => `${k} ${n}`)
    .join(' · ')

  return {
    ok: newsCache.length > 0,
    items: newsCache,
    message: `Critical ${counts.critical} · Watch ${counts.watch} · Filler ${counts.filler} · ${srcPart}`,
    at: new Date(newsCacheAt).toISOString(),
  }
}

export function getCachedTraderNews(): NewsItem[] {
  return newsCache
}
