/**
 * Public equity options / flow — Yahoo Finance option chain only.
 * Legal delayed tape (volume, OI, put/call). No Discord/Telegram leaks, no paid dark pools.
 */

import {
  markSourceAttempt,
  markSourceError,
  markSourceOk,
} from './markets-health.js'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ToolsAI-ControlCenter'

type YahooSession = { cookie: string; crumb: string; at: number }

let sessionCache: YahooSession | null = null
const flowCache = new Map<string, { at: number; flow: PublicOptionsFlow | null }>()

export type OptionsUnusual = {
  type: 'call' | 'put'
  strike: number
  volume: number
  openInterest: number
  volOi: number
  iv: number | null
}

export type OptionsLean = 'call_heavy' | 'put_heavy' | 'balanced' | 'n/a'

export type PublicOptionsFlow = {
  symbol: string
  source: string
  expiration: string | null
  underlyingPrice: number | null
  callVolume: number
  putVolume: number
  callOi: number
  putOi: number
  putCallVol: number | null
  putCallOi: number | null
  lean: OptionsLean
  unusual: OptionsUnusual[]
  unusualCallVol: number
  unusualPutVol: number
  /** 0–100 bullish-leaning factor (50 = neutral / n/a) */
  score: number
  note: string
  lines: string[]
}

type YahooOption = {
  strike?: number
  volume?: number
  openInterest?: number
  impliedVolatility?: number
}

type YahooOptionsPayload = {
  optionChain?: {
    result?: Array<{
      quote?: { regularMarketPrice?: number; symbol?: string }
      expirationDates?: number[]
      options?: Array<{
        expirationDate?: number
        calls?: YahooOption[]
        puts?: YahooOption[]
      }>
    }>
    error?: { description?: string }
  }
}

function collectCookies(res: Response, jar: string[]) {
  const sc = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []
  for (const raw of sc) {
    const part = raw.split(';')[0]?.trim()
    if (!part) continue
    const key = part.split('=')[0]
    const idx = jar.findIndex((c) => c.startsWith(`${key}=`))
    if (idx >= 0) jar[idx] = part
    else jar.push(part)
  }
}

async function getYahooSession(): Promise<YahooSession | null> {
  if (sessionCache && Date.now() - sessionCache.at < 25 * 60_000) return sessionCache
  try {
    const jar: string[] = []
    // fc.yahoo.com alone is enough for crumb — avoid finance.yahoo.com (header overflow)
    const fc = await fetch('https://fc.yahoo.com', {
      headers: { 'User-Agent': UA },
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    })
    collectCookies(fc, jar)
    const cookie = jar.join('; ')
    if (!cookie) return null
    const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': UA, Cookie: cookie },
      signal: AbortSignal.timeout(8000),
    })
    const crumb = (await crumbRes.text()).trim()
    if (!crumbRes.ok || !crumb || crumb.includes('<') || crumb.includes('{')) return null
    sessionCache = { cookie, crumb, at: Date.now() }
    return sessionCache
  } catch {
    sessionCache = null
    return null
  }
}

function sumField(rows: YahooOption[], key: 'volume' | 'openInterest'): number {
  return rows.reduce((a, r) => a + (Number(r[key]) || 0), 0)
}

function classifyLean(
  putCallVol: number | null,
  unusualCallVol: number,
  unusualPutVol: number,
): OptionsLean {
  if (putCallVol == null && unusualCallVol + unusualPutVol === 0) return 'n/a'
  const unusualTotal = unusualCallVol + unusualPutVol
  if (unusualTotal >= 800) {
    if (unusualCallVol >= unusualPutVol * 1.35) return 'call_heavy'
    if (unusualPutVol >= unusualCallVol * 1.35) return 'put_heavy'
  }
  if (putCallVol != null) {
    if (putCallVol <= 0.72) return 'call_heavy'
    if (putCallVol >= 1.18) return 'put_heavy'
  }
  return 'balanced'
}

function scoreFromFlow(
  lean: OptionsLean,
  putCallVol: number | null,
  unusualCallVol: number,
  unusualPutVol: number,
): { score: number; note: string } {
  if (lean === 'n/a') return { score: 50, note: 'options chain n/a' }
  let score = 50
  if (putCallVol != null) {
    if (putCallVol <= 0.55) score += 22
    else if (putCallVol <= 0.72) score += 14
    else if (putCallVol >= 1.35) score -= 22
    else if (putCallVol >= 1.18) score -= 14
  }
  const uTot = unusualCallVol + unusualPutVol
  if (uTot >= 500) {
    if (unusualCallVol > unusualPutVol) score += 12
    else if (unusualPutVol > unusualCallVol) score -= 12
  }
  score = Math.max(5, Math.min(95, Math.round(score)))
  const pc =
    putCallVol != null ? `P/C vol ${putCallVol.toFixed(2)}` : 'P/C vol n/a'
  const u =
    uTot > 0
      ? `unusual C ${unusualCallVol.toLocaleString()} / P ${unusualPutVol.toLocaleString()}`
      : 'no unusual prints'
  const leanNote =
    lean === 'call_heavy' ? 'call-heavy public tape' : lean === 'put_heavy' ? 'put-heavy public tape' : 'balanced'
  return { score, note: `${leanNote} · ${pc} · ${u}` }
}

function pickUnusual(calls: YahooOption[], puts: YahooOption[]): OptionsUnusual[] {
  const map = (rows: YahooOption[], type: 'call' | 'put'): OptionsUnusual[] =>
    rows
      .map((r) => {
        const volume = Number(r.volume) || 0
        const openInterest = Number(r.openInterest) || 0
        const strike = Number(r.strike) || 0
        const volOi = openInterest > 0 ? volume / openInterest : volume > 0 ? 99 : 0
        return {
          type,
          strike,
          volume,
          openInterest,
          volOi,
          iv: typeof r.impliedVolatility === 'number' ? r.impliedVolatility : null,
        }
      })
      .filter((x) => x.volume >= 200 && x.volOi >= 1.15)
  return [...map(calls, 'call'), ...map(puts, 'put')]
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 6)
}

/** Nearest-expiry public options summary + unusual volume (Yahoo). */
export async function fetchPublicOptionsFlow(
  yahoo: string,
  opts?: { force?: boolean },
): Promise<PublicOptionsFlow | null> {
  const sym = yahoo.toUpperCase().replace(/^\^/, '')
  const cached = flowCache.get(sym)
  if (!opts?.force && cached && Date.now() - cached.at < 60_000) return cached.flow

  markSourceAttempt('yahoo_options')

  const empty = (): PublicOptionsFlow => ({
    symbol: sym,
    source: 'Yahoo Finance (public options)',
    expiration: null,
    underlyingPrice: null,
    callVolume: 0,
    putVolume: 0,
    callOi: 0,
    putOi: 0,
    putCallVol: null,
    putCallOi: null,
    lean: 'n/a',
    unusual: [],
    unusualCallVol: 0,
    unusualPutVol: 0,
    score: 50,
    note: 'options chain unavailable',
    lines: ['Public options: chain unavailable (Yahoo crumb / delay)'],
  })

  try {
    const session = await getYahooSession()
    if (!session) {
      markSourceError('yahoo_options', 'Yahoo session/crumb failed')
      const flow = empty()
      flowCache.set(sym, { at: Date.now(), flow })
      return flow
    }
    const url = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(sym)}?crumb=${encodeURIComponent(session.crumb)}`
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Cookie: session.cookie, Accept: 'application/json' },
      signal: AbortSignal.timeout(12_000),
    })
    if (res.status === 401 || res.status === 403) {
      sessionCache = null
      const retry = await getYahooSession()
      if (!retry) {
        markSourceError('yahoo_options', 'Yahoo auth 401/403')
        const flow = empty()
        flowCache.set(sym, { at: Date.now(), flow })
        return flow
      }
      const res2 = await fetch(
        `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(sym)}?crumb=${encodeURIComponent(retry.crumb)}`,
        {
          headers: { 'User-Agent': UA, Cookie: retry.cookie, Accept: 'application/json' },
          signal: AbortSignal.timeout(12_000),
        },
      )
      if (!res2.ok) {
        markSourceError('yahoo_options', `Yahoo options HTTP ${res2.status}`)
        const flow = empty()
        flowCache.set(sym, { at: Date.now(), flow })
        return flow
      }
      const flow = finalizeFlow(sym, (await res2.json()) as YahooOptionsPayload)
      if (flow.lean !== 'n/a' || flow.callVolume + flow.putVolume > 0) markSourceOk('yahoo_options')
      else markSourceError('yahoo_options', 'Yahoo options empty chain')
      return flow
    }
    if (!res.ok) {
      markSourceError('yahoo_options', `Yahoo options HTTP ${res.status}`)
      const flow = empty()
      flowCache.set(sym, { at: Date.now(), flow })
      return flow
    }
    const flow = finalizeFlow(sym, (await res.json()) as YahooOptionsPayload)
    if (flow.lean !== 'n/a' || flow.callVolume + flow.putVolume > 0) markSourceOk('yahoo_options')
    else markSourceError('yahoo_options', 'Yahoo options empty chain')
    return flow
  } catch (err) {
    markSourceError('yahoo_options', err instanceof Error ? err.message : String(err))
    const flow = empty()
    flowCache.set(sym, { at: Date.now(), flow })
    return flow
  }
}

function finalizeFlow(sym: string, data: YahooOptionsPayload): PublicOptionsFlow {
  const result = data.optionChain?.result?.[0]
  const chain = result?.options?.[0]
  const calls = chain?.calls || []
  const puts = chain?.puts || []
  if (!calls.length && !puts.length) {
    const flow: PublicOptionsFlow = {
      symbol: sym,
      source: 'Yahoo Finance (public options)',
      expiration: null,
      underlyingPrice: result?.quote?.regularMarketPrice ?? null,
      callVolume: 0,
      putVolume: 0,
      callOi: 0,
      putOi: 0,
      putCallVol: null,
      putCallOi: null,
      lean: 'n/a',
      unusual: [],
      unusualCallVol: 0,
      unusualPutVol: 0,
      score: 50,
      note: 'empty chain',
      lines: ['Public options: empty nearest expiry'],
    }
    flowCache.set(sym, { at: Date.now(), flow })
    return flow
  }

  const callVolume = sumField(calls, 'volume')
  const putVolume = sumField(puts, 'volume')
  const callOi = sumField(calls, 'openInterest')
  const putOi = sumField(puts, 'openInterest')
  const putCallVol = callVolume > 0 ? putVolume / callVolume : null
  const putCallOi = callOi > 0 ? putOi / callOi : null
  const unusual = pickUnusual(calls, puts)
  const unusualCallVol = unusual.filter((u) => u.type === 'call').reduce((a, u) => a + u.volume, 0)
  const unusualPutVol = unusual.filter((u) => u.type === 'put').reduce((a, u) => a + u.volume, 0)
  const lean = classifyLean(putCallVol, unusualCallVol, unusualPutVol)
  const { score, note } = scoreFromFlow(lean, putCallVol, unusualCallVol, unusualPutVol)
  const expSec = chain?.expirationDate ?? result?.expirationDates?.[0]
  const expMs = typeof expSec === 'number' ? expSec * 1000 : NaN
  const expiration =
    Number.isFinite(expMs) && expMs > 0 ? new Date(expMs).toISOString().slice(0, 10) : null

  const lines: string[] = [
    `Public options (Yahoo) · nearest ${expiration || 'expiry'} · P/C vol ${putCallVol != null ? putCallVol.toFixed(2) : 'n/a'} · P/C OI ${putCallOi != null ? putCallOi.toFixed(2) : 'n/a'}`,
    `Call vol ${callVolume.toLocaleString()} · put vol ${putVolume.toLocaleString()} · call OI ${callOi.toLocaleString()} · put OI ${putOi.toLocaleString()}`,
    `Lean: ${lean.replace('_', ' ')} — public exchange-published tape, not tip leaks`,
  ]
  for (const u of unusual.slice(0, 4)) {
    lines.push(
      `Unusual ${u.type} ${u.strike}: vol ${u.volume.toLocaleString()} / OI ${u.openInterest.toLocaleString()} (${u.volOi.toFixed(1)}×)`,
    )
  }

  const flow: PublicOptionsFlow = {
    symbol: sym,
    source: 'Yahoo Finance (public options)',
    expiration,
    underlyingPrice: result?.quote?.regularMarketPrice ?? null,
    callVolume,
    putVolume,
    callOi,
    putOi,
    putCallVol,
    putCallOi,
    lean,
    unusual,
    unusualCallVol,
    unusualPutVol,
    score,
    note,
    lines,
  }
  flowCache.set(sym, { at: Date.now(), flow })
  return flow
}

/** Strong enough public options lean to drive an OPTIONS_FLOW_* ticket. */
export function optionsFlowActionable(flow: PublicOptionsFlow | null | undefined): boolean {
  if (!flow || flow.lean === 'n/a' || flow.lean === 'balanced') return false
  const unusualTot = flow.unusualCallVol + flow.unusualPutVol
  const pcExtreme =
    flow.putCallVol != null && (flow.putCallVol <= 0.65 || flow.putCallVol >= 1.25)
  return unusualTot >= 600 || pcExtreme || flow.unusual.length >= 2
}

export function optionsAgreesWithSide(
  flow: PublicOptionsFlow | null | undefined,
  side: 'long' | 'short' | 'flat',
): boolean {
  if (!flow || side === 'flat' || flow.lean === 'n/a') return false
  if (side === 'long') return flow.lean === 'call_heavy'
  return flow.lean === 'put_heavy'
}
