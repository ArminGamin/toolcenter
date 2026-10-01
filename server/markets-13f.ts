/**
 * SEC 13F-HR institutional holdings, using EDGAR's public filings only.
 * 13F is deliberately background context: filings can be 45+ days behind
 * quarter-end and holdings are not a live trade signal.
 */
import { markSourceAttempt, markSourceError, markSourceOk } from './markets-health.js'
import { loadSecTickerMap, padCik, secFetch, type SecTickerRow } from './markets-news.js'

const DAY_MS = 24 * 60 * 60_000
const CACHE_MS = 8 * 60 * 60_000
const FORM_LABEL =
  '13F holdings (institutional, up to 45+ days lagged — background context, not a live signal)'

export type ThirteenFHolding = {
  symbol: string
  issuer: string
  manager: string
  filingDate: string
  reportPeriod: string | null
  /** Conservative age from quarter-end; use alongside filingLagDays. */
  lagDays: number
  /** Age from when EDGAR accepted the filing. */
  filingLagDays: number
  shares: number | null
  valueUsd: number | null
  change: 'increased' | 'decreased' | 'none'
  score: number
  label: string
  note: string
  lines: string[]
}

type Watch = { symbol: string; label: string }
type Filing = { cik: string; manager: string; indexUrl: string; filingDate: string }
type RawHolding = { issuer: string; shares: number | null; valueUsd: number | null }

let cache: { at: number; bySymbol: Map<string, ThirteenFHolding> } | null = null

function clean(s: string): string {
  return s.replace(/&amp;/gi, '&').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function xmlValue(xml: string, tag: string): string | null {
  return clean((xml.match(new RegExp(`<${tag}[^>]*>\\s*([^<]+)\\s*</${tag}>`, 'i')) || [])[1] || '') || null
}

function dayAge(date: string | null | undefined, now = Date.now()): number {
  const ms = date ? Date.parse(date) : NaN
  return Number.isFinite(ms) ? Math.max(0, Math.floor((now - ms) / DAY_MS)) : 0
}

export function score13fChange(change: ThirteenFHolding['change']): number {
  return change === 'increased' ? 60 : change === 'decreased' ? 40 : 50
}

/** Explicit, conservative lag text used in factors and tests. */
export function format13fLag(reportPeriod: string | null, filingDate: string, now = Date.now()): {
  lagDays: number
  filingLagDays: number
  note: string
} {
  const lagDays = dayAge(reportPeriod || filingDate, now)
  const filingLagDays = dayAge(filingDate, now)
  return {
    lagDays,
    filingLagDays,
    note: reportPeriod
      ? `Quarter ended ${reportPeriod} · ${lagDays}d since period end; filed ${filingDate} (${filingLagDays}d ago)`
      : `Filing ${filingDate} · quarter end unavailable; ${filingLagDays}d since filing`,
  }
}

function normalName(s: string): string {
  return s
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/\b(INC|INCORPORATED|CORP|CORPORATION|LTD|LIMITED|PLC|LLC|CO|COMPANY|HOLDINGS?|CLASS [A-Z]|ORDINARY SHARES?|COMMON STOCK)\b\.?/g, ' ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function matchSymbol(issuer: string, watch: Watch[], tickerMap: Map<string, SecTickerRow>): string | null {
  const name = normalName(issuer)
  for (const row of tickerMap.values()) {
    const w = watch.find((x) => x.symbol.toUpperCase() === row.ticker)
    if (!w) continue
    const candidates = [normalName(w.label), normalName(row.title)].filter((x) => x.length >= 4)
    if (candidates.some((candidate) => name === candidate || name.includes(candidate) || candidate.includes(name))) {
      return row.ticker
    }
  }
  // Custom symbols may be absent from SEC's ticker map; only accept unambiguous label matches.
  for (const w of watch) {
    const candidate = normalName(w.label)
    if (candidate.length >= 5 && (name === candidate || name.includes(candidate))) return w.symbol.toUpperCase()
  }
  return null
}

function parse13fAtom(xml: string): Filing[] {
  return xml.split(/<entry[\s>]/i).slice(1).flatMap((entry) => {
    const title = clean((entry.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '')
    const form = clean((entry.match(/<filing-type>([^<]+)<\/filing-type>/i) || [])[1] || '')
    if (!/13F-HR/i.test(`${title} ${form}`)) return []
    const href =
      (entry.match(/<filing-href>([^<]+)<\/filing-href>/i) || [])[1] ||
      (entry.match(/<link[^>]+href="([^"]+-index\.htm[^"]*)"/i) || [])[1]
    const cik =
      (entry.match(/<company-cik>(\d+)<\/company-cik>/i) || [])[1] ||
      (href || '').match(/edgar\/data\/(\d+)\//i)?.[1]
    const filingDate =
      clean((entry.match(/<filing-date>([^<]+)<\/filing-date>/i) || [])[1] || '') ||
      clean((entry.match(/<updated[^>]*>([^<]+)<\/updated>/i) || [])[1] || '')
    if (!href || !cik || !filingDate) return []
    return [{
      cik: padCik(cik),
      manager: title.replace(/^13F-HR\s*-?\s*/i, '').replace(/\s*\(\d+\).*$/, '').trim() || 'Institutional manager',
      indexUrl: href.startsWith('http') ? href : `https://www.sec.gov${href}`,
      filingDate: filingDate.slice(0, 10),
    }]
  })
}

function indexLinks(html: string, indexUrl: string): string[] {
  const base = indexUrl.slice(0, indexUrl.lastIndexOf('/') + 1)
  const links = [...html.matchAll(/href="([^"]+\.xml)"/gi)].map((m) => m[1])
  return links
    .filter((link) => !/xsl|ownership/i.test(link))
    .map((link) => (link.startsWith('http') ? link : link.startsWith('/') ? `https://www.sec.gov${link}` : `${base}${link}`))
}

function parseInfoTable(xml: string): { reportPeriod: string | null; holdings: RawHolding[] } {
  const reportPeriod = xmlValue(xml, 'reportCalendarOrQuarter') || xmlValue(xml, 'periodOfReport')
  const blocks = xml.split(/<infoTable[\s>]/i).slice(1)
  const holdings = blocks.flatMap((block) => {
    const issuer = xmlValue(block, 'nameOfIssuer')
    if (!issuer) return []
    const sharesRaw = xmlValue(block, 'sshPrnamt')
    const valueThousands = xmlValue(block, 'value')
    const shares = sharesRaw ? Number(sharesRaw.replace(/,/g, '')) : null
    const value = valueThousands ? Number(valueThousands.replace(/,/g, '')) * 1000 : null
    return [{ issuer, shares: Number.isFinite(shares) ? shares : null, valueUsd: Number.isFinite(value) ? value : null }]
  })
  return { reportPeriod, holdings }
}

async function pause() {
  await new Promise((resolve) => setTimeout(resolve, 125))
}

async function fetchFilingHoldings(filing: Filing): Promise<{ reportPeriod: string | null; holdings: RawHolding[] }> {
  const index = await secFetch(filing.indexUrl, 10_000)
  if (!index?.ok) return { reportPeriod: null, holdings: [] }
  const links = indexLinks(await index.text(), filing.indexUrl).slice(0, 4)
  let reportPeriod: string | null = null
  let holdings: RawHolding[] = []
  for (const link of links) {
    await pause()
    const res = await secFetch(link, 10_000)
    if (!res?.ok) continue
    const parsed = parseInfoTable(await res.text())
    reportPeriod ||= parsed.reportPeriod
    if (parsed.holdings.length) holdings = parsed.holdings
  }
  return { reportPeriod, holdings }
}

/**
 * Fetch a small set of recent 13F-HR filings and return watchlist-matched positions.
 * We intentionally do not infer STOCK Act activity: there is no clean free normalized source.
 */
export async function fetch13fHoldings(
  symbols: Watch[],
  opts?: { force?: boolean },
): Promise<Map<string, ThirteenFHolding>> {
  const now = Date.now()
  if (!opts?.force && cache && now - cache.at < CACHE_MS) return new Map(cache.bySymbol)

  markSourceAttempt('edgar_13f')
  const bySymbol = new Map<string, ThirteenFHolding>()
  try {
    const watch = symbols.filter((s) => s.symbol && s.label).slice(0, 12)
    if (!watch.length) {
      markSourceOk('edgar_13f')
      return bySymbol
    }
    const { byTicker } = await loadSecTickerMap()
    const atom = await secFetch(
      'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=13F-HR&count=40&output=atom',
      15_000,
    )
    if (!atom?.ok) throw new Error(`SEC 13F Atom HTTP ${atom?.status ?? 'network'}`)
    const filings = parse13fAtom(await atom.text()).slice(0, 8)
    for (const filing of filings) {
      await pause()
      const table = await fetchFilingHoldings(filing)
      for (const holding of table.holdings) {
        const symbol = matchSymbol(holding.issuer, watch, byTicker)
        if (!symbol || bySymbol.has(symbol)) continue
        const lag = format13fLag(table.reportPeriod, filing.filingDate, now)
        const change: ThirteenFHolding['change'] = 'none' // no prior manager filing parsed in this bounded scan
        bySymbol.set(symbol, {
          symbol,
          issuer: holding.issuer,
          manager: filing.manager,
          filingDate: filing.filingDate,
          reportPeriod: table.reportPeriod,
          lagDays: lag.lagDays,
          filingLagDays: lag.filingLagDays,
          shares: holding.shares,
          valueUsd: holding.valueUsd,
          change,
          score: score13fChange(change),
          label: FORM_LABEL,
          note: `${lag.note} · position disclosed by ${filing.manager}; change baseline unavailable`,
          lines: [
            `${FORM_LABEL}`,
            `${holding.issuer} · ${filing.manager}`,
            lag.note,
            holding.shares != null ? `${holding.shares.toLocaleString()} shares reported` : 'Share count unavailable',
          ],
        })
      }
    }
    markSourceOk('edgar_13f')
    cache = { at: now, bySymbol }
    return bySymbol
  } catch (err) {
    markSourceError('edgar_13f', err instanceof Error ? err.message : String(err))
    return bySymbol
  }
}

export { FORM_LABEL as THIRTEEN_F_LABEL }
