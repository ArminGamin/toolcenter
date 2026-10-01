import type { LeadAccount, VenueBias } from '../markets-venues.js'
import type { WhaleSymbolSummary } from '../markets-whales.js'
import type { DeskFactor, DeskPlaybook, DeskSignal } from './types.js'

const placeBySticky = new Map<string, number>()
/**
 * Context feeds must not hold up a primary desk decision. They remain best-effort
 * confirmation only; an unavailable result is represented as no context, never
 * as a fabricated neutral or a relaxed strict-law result.
 */
export async function optionalWithin<T>(work: Promise<T>, fallback: T, timeoutMs: number): Promise<T> {
  return Promise.race([
    work.catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeoutMs)),
  ])
}

export function pruneSticky(activeIds: Set<string>) {
  for (const id of placeBySticky.keys()) {
    if (!activeIds.has(id)) placeBySticky.delete(id)
  }
}

export function timingFor(
  signalId: string,
  urgency: 'now' | 'watch' | 'avoid',
  kind: 'long' | 'short' | 'avoid' | 'conflict' | 'flat',
): DeskSignal['timing'] {
  const now = Date.now()
  if (kind === 'avoid' || kind === 'conflict' || kind === 'flat') {
    placeBySticky.delete(signalId)
    return {
      window:
        kind === 'flat'
          ? 'No ticket — wait for flow regime change'
          : 'Do not open risk on this print',
      placeBy: kind === 'flat' ? 'No entry clock' : 'N/A (flat)',
      placeByMs: 0,
      horizon:
        kind === 'flat'
          ? 'Re-score when ≥2 venues print add_long / add_short'
          : 'Until crowding / risk clears',
      speed: kind === 'flat' ? 'Stand down' : 'Risk live',
    }
  }
  const ttlMs = urgency === 'now' ? 8 * 60_000 : 25 * 60_000
  let by = placeBySticky.get(signalId)
  // Lock once — do NOT slide forward after expiry (that made Place-by run away)
  if (by == null) {
    by = now + ttlMs
    placeBySticky.set(signalId, by)
  }
  const leftMin = Math.max(0, Math.round((by - now) / 60_000))
  const expired = by <= now
  return {
    window: expired
      ? 'Clock expired — re-validate flow before any entry'
      : urgency === 'now'
        ? 'Execute window: next 5–15 min (flow still hot)'
        : 'Arm window: next 15–40 min — need trigger',
    placeBy: new Date(by).toLocaleTimeString(),
    placeByMs: by,
    horizon: expired
      ? 'Ticket stale — wait for a fresh Δ print or scrap'
      : `Kill ticket if flow flips · ~${leftMin}m left on clock`,
    speed: expired ? 'Do not chase' : urgency === 'now' ? 'Hit / work limit' : 'Confirm then size',
  }
}

export async function fetchAtr(symbol: string): Promise<{ atr: number; last: number } | null> {
  try {
    const pair = `${symbol.toUpperCase()}USDT`
    const res = await fetch(
      `https://fapi.binance.com/fapi/v1/klines?symbol=${pair}&interval=15m&limit=48`,
      { headers: { 'User-Agent': 'ToolsAIControlCenter/1.0' }, signal: AbortSignal.timeout(8000) },
    )
    if (!res.ok) return null
    const rows = (await res.json()) as string[][]
    if (!rows?.length) return null
    const trs: number[] = []
    for (let i = 1; i < rows.length; i++) {
      const high = Number(rows[i][2])
      const low = Number(rows[i][3])
      const prevClose = Number(rows[i - 1][4])
      trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)))
    }
    const slice = trs.slice(-14)
    if (!slice.length) return null
    const atr = slice.reduce((a, b) => a + b, 0) / slice.length
    return { atr, last: Number(rows[rows.length - 1][4]) }
  } catch {
    return null
  }
}

export function buildPlaybook(
  side: 'long' | 'short' | 'flat',
  price: number | null,
  atr: number | null,
  urgency: DeskSignal['urgency'],
): DeskPlaybook {
  if (side === 'flat' || price == null || !(atr && atr > 0) || !Number.isFinite(price) || !Number.isFinite(atr)) {
    return {
      side: 'flat',
      entry: price != null && Number.isFinite(price) ? price : null,
      stop: null,
      target1: null,
      target2: null,
      riskPct: null,
      rewardPct: null,
      rr: null,
      sizeHint: '0% risk — no ticket',
      invalidation: 'Any forced direction without fresh multi-venue Δ',
      plan: 'Cash / wait. Structural futures long is not an edge.',
    }
  }
  // Asymmetric R:R — stop tighter than T1 (prop-style)
  const stopDist = atr * (urgency === 'now' ? 1.15 : 1.35)
  const t1Dist = atr * (urgency === 'now' ? 1.9 : 2.1)
  const t2Dist = atr * (urgency === 'now' ? 3.1 : 3.4)
  const fmt = (n: number) => (price >= 100 ? Number(n.toFixed(1)) : Number(n.toPrecision(5)))
  if (side === 'long') {
    const stop = fmt(price - stopDist)
    const t1 = fmt(price + t1Dist)
    const t2 = fmt(price + t2Dist)
    const riskPct = (stopDist / price) * 100
    const rewardPct = (t1Dist / price) * 100
    return {
      side,
      entry: fmt(price),
      stop,
      target1: t1,
      target2: t2,
      riskPct,
      rewardPct,
      rr: riskPct > 0 ? rewardPct / riskPct : null,
      sizeHint:
        urgency === 'now'
          ? 'Risk 0.5–0.75% equity · hard stop · scale 50% at T1'
          : 'Risk ≤0.4% equity · wait trigger · no chase',
      invalidation: `Close below $${stop} or venues flip to add_short`,
      plan: 'Buy strength on pullback hold · stop under structure · trail after T1',
    }
  }
  const stop = fmt(price + stopDist)
  const t1 = fmt(price - t1Dist)
  const t2 = fmt(price - t2Dist)
  const riskPct = (stopDist / price) * 100
  const rewardPct = (t1Dist / price) * 100
  return {
    side,
    entry: fmt(price),
    stop,
    target1: t1,
    target2: t2,
    riskPct,
    rewardPct,
    rr: riskPct > 0 ? rewardPct / riskPct : null,
    sizeHint:
      urgency === 'now'
        ? 'Risk 0.5–0.75% equity · hard stop · cover 50% at T1'
        : 'Risk ≤0.4% equity · wait lower-high · no market dump chase',
    invalidation: `Close above $${stop} or venues flip to add_long`,
    plan: 'Short weakness / failed reclaim · stop above structure · cover into flush',
  }
}

export function leadFlow(accounts: LeadAccount[], symbol: string): { long: number; short: number; score: number; note: string } {
  const sym = symbol.toUpperCase()
  let long = 0
  let short = 0
  for (const a of accounts) {
    const relevant = a.recentTrades.filter((t) => t.instId.startsWith(`${sym}-`))
    const use = relevant.length ? relevant : a.recentTrades.slice(0, 3)
    for (const t of use) {
      if (t.side === 'long') long++
      else short++
    }
  }
  const total = long + short
  if (!total) return { long: 0, short: 0, score: 50, note: 'No lead fills matched' }
  const longPct = long / total
  const score = Math.round(longPct * 100)
  return {
    long,
    short,
    score,
    note: `Lead fills ${long}L / ${short}S on/near ${sym}`,
  }
}

export function scoreFactors(
  biases: VenueBias[],
  pct: number | null,
  accounts: LeadAccount[],
  symbol: string,
  direction: 'long' | 'short' | 'flat' | 'fade',
  whale?: WhaleSymbolSummary,
): { factors: DeskFactor[]; edgeScore: number; regime: DeskSignal['regime'] } {
  const addLong = biases.filter((b) => b.lean === 'add_long').length
  const addShort = biases.filter((b) => b.lean === 'add_short').length
  const crowdedLong = biases.filter((b) => b.lean === 'crowded_long').length
  const bn = biases.find((b) => b.venue === 'binance')
  const taker = bn?.takerBuySell
  const funding = bn?.funding
  const oi = bn?.oiDeltaPct
  const retailGap =
    bn?.retailLs != null ? bn.ls - bn.retailLs : null
  const leads = leadFlow(accounts, symbol)

  const flowScore =
    direction === 'long'
      ? Math.min(100, 35 + addLong * 22 - addShort * 25 - crowdedLong * 8)
      : direction === 'short'
        ? Math.min(100, 35 + addShort * 22 - addLong * 25)
        : direction === 'fade'
          ? Math.min(100, 40 + crowdedLong * 18 - addLong * 20)
          : 28

  const smartScore =
    retailGap == null
      ? 50
      : direction === 'short'
        ? retailGap < -0.1
          ? 78
          : retailGap < 0
            ? 62
            : 38
        : direction === 'long'
          ? retailGap > 0.15
            ? 72
            : retailGap > 0
              ? 58
              : 40
          : 45

  const takerScore =
    taker == null
      ? 50
      : direction === 'long'
        ? taker >= 1.15
          ? 82
          : taker >= 1.0
            ? 60
            : 32
        : direction === 'short' || direction === 'fade'
          ? taker <= 0.85
            ? 84
            : taker <= 1.0
              ? 58
              : 30
          : 50

  const fundingScore =
    funding == null
      ? 50
      : direction === 'short' || direction === 'fade'
        ? funding > 0.0004
          ? 80
          : funding > 0
            ? 58
            : 40
        : direction === 'long'
          ? funding < 0
            ? 75
            : funding < 0.00025
              ? 60
              : 35
          : 50

  const oiScore =
    oi == null
      ? 50
      : direction === 'long'
        ? oi > 1 && (pct ?? 0) > 0
          ? 78
          : oi < -1 && (pct ?? 0) > 0
            ? 40
            : 55
        : direction === 'short'
          ? oi > 1 && (pct ?? 0) < 0
            ? 78
            : oi < -1
              ? 45
              : 55
          : 50

  const tapeScore =
    pct == null
      ? 50
      : direction === 'long'
        ? pct >= 2
          ? 80
          : pct >= 0.5
            ? 62
            : 40
        : direction === 'short' || direction === 'fade'
          ? pct <= -2
            ? 82
            : pct <= -0.5
              ? 60
              : 38
          : 50

  const leadScore =
    direction === 'long'
      ? leads.score
      : direction === 'short' || direction === 'fade'
        ? 100 - leads.score
        : 50

  const factors: DeskFactor[] = [
    { id: 'flow', label: 'Multi-venue Δ flow', score: Math.max(0, Math.min(100, flowScore)), note: `${addLong} addL · ${addShort} addS · ${crowdedLong} crowdedL` },
    { id: 'smart', label: 'Smart vs retail', score: smartScore, note: retailGap == null ? 'n/a' : `tops−retail ${retailGap >= 0 ? '+' : ''}${retailGap.toFixed(3)}` },
    { id: 'taker', label: 'Aggressive taker', score: takerScore, note: taker == null ? 'n/a' : `buy/sell ${taker.toFixed(3)}` },
    { id: 'funding', label: 'Funding pressure', score: fundingScore, note: funding == null ? 'n/a' : `${(funding * 100).toFixed(4)}%` },
    { id: 'oi', label: 'Exchange OI x price', score: oiScore, note: oi == null ? 'n/a' : `OI 1h ${oi >= 0 ? '+' : ''}${oi.toFixed(1)}%` },
    { id: 'tape', label: 'Tape confirm', score: tapeScore, note: pct == null ? 'n/a' : `24h ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%` },
    { id: 'leads', label: 'Lead account fills', score: leadScore, note: leads.note, confirmationOnly: true, tier: 'confirmation' },
    {
      id: 'whales',
      label: 'On-chain whale flow (confirmation only)',
      score: whale?.score ?? 50,
      note: whale?.note || 'Whale feed n/a',
      confirmationOnly: true,
      tier: 'confirmation',
    },
  ]

  // Whales are intentionally low-weight context so explorer observations cannot dominate live venue flow.
  const edgeScore = Math.round(
    (flowScore + smartScore + takerScore + fundingScore + oiScore + tapeScore + leadScore * 0.65 + (whale?.score ?? 50) * 0.25) /
      (6 + 0.65 + 0.25),
  )

  let regime: DeskSignal['regime'] = 'chop'
  if (Math.abs(pct ?? 0) >= 2 && (addLong >= 2 || addShort >= 2)) regime = 'trend'
  else if (crowdedLong >= 2 || (funding != null && Math.abs(funding) > 0.0005)) regime = 'mean-revert'

  return { factors, edgeScore, regime }
}

export function whyFromBiases(biases: VenueBias[], direction: 'long' | 'short' | 'flat' | 'fade'): string[] {
  const lines: string[] = []
  for (const b of biases) {
    const d = `${b.lsDelta >= 0 ? '+' : ''}${b.lsDelta.toFixed(3)}`
    if (b.lean === 'add_long') lines.push(`${b.label}: ADDING longs — L/S ${b.ls.toFixed(2)} (1h Δ ${d}).`)
    else if (b.lean === 'add_short') lines.push(`${b.label}: ADDING shorts — L/S ${b.ls.toFixed(2)} (1h Δ ${d}).`)
    else if (b.lean === 'crowded_long') lines.push(`${b.label}: CROWDED long L/S ${b.ls.toFixed(2)} · flat Δ ${d}.`)
    else if (b.lean === 'crowded_short') lines.push(`${b.label}: CROWDED short L/S ${b.ls.toFixed(2)} · flat Δ ${d}.`)
    else lines.push(`${b.label}: no fresh flow — L/S ${b.ls.toFixed(2)} (Δ ${d}).`)
    if (b.retailLs != null) {
      lines.push(`  Retail ${b.retailLs.toFixed(2)} vs tops ${b.ls.toFixed(2)}.`)
    }
    if (b.takerBuySell != null) lines.push(`  Taker ${b.takerBuySell.toFixed(2)}.`)
    if (b.funding != null) lines.push(`  Funding ${(b.funding * 100).toFixed(4)}%.`)
    if (b.oiDeltaPct != null) lines.push(`  OI 1h ${b.oiDeltaPct >= 0 ? '+' : ''}${b.oiDeltaPct.toFixed(1)}%.`)
  }
  if (direction === 'flat') lines.push('No ticket until Δ flow agrees across venues.')
  if (direction === 'fade') lines.push('Crowding + soft aggressive flow = do not chase.')
  return lines.slice(0, 10)
}

export function accountSummary(accounts: LeadAccount[], symbol: string): string[] {
  const sym = symbol.toUpperCase()
  return accounts.slice(0, 4).map((a) => {
    const relevant = a.recentTrades.filter((t) => t.instId.startsWith(`${sym}-`))
    const sample = (relevant.length ? relevant : a.recentTrades).slice(0, 2)
    const tradeBits = sample
      .map((t) => `${t.side.toUpperCase()} ${t.instId.replace('-USDT-SWAP', '')} $${Math.round(t.pnl)}`)
      .join('; ')
    return `OKX ${a.name} · ROI ${(a.pnlRatio * 100).toFixed(0)}% · win ${(a.winRatio * 100).toFixed(0)}%${tradeBits ? ` · ${tradeBits}` : ''}`
  })
}

/** Internal heuristic only — NEVER show as user-facing "chance". */
export function heuristicOddsFromEdge(edge: number, urgency: DeskSignal['urgency']): number {
  let pct = Math.round(edge * 0.62 + (urgency === 'now' ? 8 : urgency === 'watch' ? 2 : -6))
  return Math.max(18, Math.min(74, pct))
}

export function confFromEdge(edge: number): number {
  if (edge >= 72) return 5
  if (edge >= 62) return 4
  if (edge >= 52) return 3
  if (edge >= 42) return 2
  return 1
}

export function leadLeanPct(accounts: LeadAccount[], symbol: string, side: 'long' | 'short'): {
  pct: number
  n: number
  note: string
} {
  const sym = symbol.toUpperCase()
  let withSide = 0
  let n = 0
  for (const a of accounts) {
    const relevant = a.recentTrades.filter((t) => t.instId.startsWith(`${sym}-`))
    for (const t of relevant) {
      n++
      if (t.side === side) withSide++
    }
  }
  if (!n) return { pct: 50, n: 0, note: 'No symbol lead fills (rule waived)' }
  return {
    pct: Math.round((withSide / n) * 100),
    n,
    note: `${withSide}/${n} recent ${sym} lead fills are ${side}`,
  }
}
