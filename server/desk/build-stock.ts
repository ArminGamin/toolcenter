import {
  fetchMarketQuotes,
  fetchQuotesForSymbols,
  getMarketsConfig,
  MARKET_PRESETS,
  type Quote,
} from '../markets.js'
import { fetchTraderNews } from '../markets-news.js'
import { fetchPublicOptionsFlow, optionsFlowActionable } from '../markets-options.js'
import { fetch13fHoldings, THIRTEEN_F_LABEL } from '../markets-13f.js'
import { resolveOpenOutcomes } from '../markets-outcomes.js'
import type { DeskFactor, DeskSignal, DeskTopPeople } from './types.js'
import { STOCK_PRINTER_LAWS } from './types.js'
import {
  optionalWithin,
  timingFor,
  heuristicOddsFromEdge,
  confFromEdge,
  buildPlaybook,
} from './helpers.js'
import {
  evaluateStockStrictRules,
  fetchYahooAtr,
  newsMatchesEquity,
  isForm4Buy,
  isForm4Sell,
} from './rules-stock.js'
import { finalizeDesk, deskUniverseSymbols, rankHotMovers } from './finalize.js'

export async function buildStockDeskSignals(force = false) {
  const at = new Date().toISOString()
  const cfg = getMarketsConfig()
  const universeSyms = deskUniverseSymbols('stock', cfg.symbols)
  const [newsRes, quotesRes, universeQuotes] = await Promise.all([
    fetchTraderNews({ force }),
    fetchMarketQuotes(),
    fetchQuotesForSymbols(universeSyms),
  ])
  const priceMap = new Map<string, number>()
  for (const q of [...(quotesRes.quotes || []), ...universeQuotes]) {
    if (q.price != null) priceMap.set(q.symbol.toUpperCase(), q.price)
  }
  resolveOpenOutcomes(priceMap)
  const news = newsRes.items || []
  const quotes: Quote[] = quotesRes.quotes || []
  const quoteBySym = new Map(
    [...quotes, ...universeQuotes].map((q) => [q.symbol.toUpperCase(), q]),
  )
  const signals: DeskSignal[] = []
  const topPeople: DeskTopPeople[] = []
  const hotMovers = rankHotMovers('stock', [...quoteBySym.values()])
  const hotSyms = new Set(hotMovers.map((m) => m.symbol))

  const stocks = cfg.symbols.filter((s) => s.kind === 'stock').slice(0, 8)
  // If watchlist has no stocks, use presets so the tab isn't empty
  const universe =
    stocks.length > 0
      ? stocks
      : MARKET_PRESETS.filter((p) => p.kind === 'stock').slice(0, 6)

  // 13F is lagged confirmation only, so it cannot delay the public options/tape
  // path. Its bounded result fills in when available, otherwise the desk remains
  // accurate with "no recent matched 13F" context.
  const [thirteenFBySymbol, packs] = await Promise.all([
    optionalWithin(
      fetch13fHoldings(universe.map((s) => ({ symbol: s.symbol, label: s.label })), { force }),
      new Map(),
      3_000,
    ),
    Promise.all(
      universe.map(async (s) => ({
        s,
        atrPack: await fetchYahooAtr(s.yahoo || s.symbol),
        options: await fetchPublicOptionsFlow(s.yahoo || s.symbol, { force }),
      })),
    ),
  ])

  for (const { s, atrPack, options } of packs) {
    const q = quoteBySym.get(s.symbol.toUpperCase())
    const pct = q?.changePct ?? null
    const price = q?.price ?? atrPack?.last ?? options?.underlyingPrice ?? null
    const atr = atrPack?.atr ?? (price != null ? price * 0.015 : null)
    const sym = s.symbol.toUpperCase()
    const thirteenF = thirteenFBySymbol.get(sym)

    const related = news.filter((n) => newsMatchesEquity(n, sym, s.label))
    const hasInsiderBuy = related.some((n) => isForm4Buy(n))
    const hasInsiderSell = related.some((n) => isForm4Sell(n))
    const hasRiskFiling = related.some((n) => {
      const t = n.title.toLowerCase()
      return (
        t.includes('bankrupt') ||
        t.includes('investigation') ||
        t.includes('halt') ||
        t.includes('delist') ||
        t.includes('going concern')
      )
    })
    const insiderHits = related.filter(
      (n) =>
        n.categories?.includes('Form4') ||
        n.categories?.includes('verified-insider') ||
        n.source.toLowerCase().includes('form 4') ||
        n.title.toLowerCase().includes('form 4'),
    )
    const form4AgeDays = (() => {
      for (const n of insiderHits) {
        const tag = (n.categories || []).find((c) => c.startsWith('form4-age-days:'))
        if (tag) {
          const nDays = Number(tag.split(':')[1])
          if (Number.isFinite(nDays)) return nDays
        }
      }
      return null as number | null
    })()

    // Named officers/directors from the public Form 4 ownership XML. Other
    // reporting owners (for example, 10% holders) stay in filing proof but do
    // not appear as an executive activity row.
    for (const n of insiderHits.filter((item) => item.categories.includes('form4-executive')).slice(0, 3)) {
      const ownerTag = n.categories.find((item) => item.startsWith('form4-owner:'))
      const roleTag = n.categories.find((item) => item.startsWith('form4-role:'))
      const owner = ownerTag ? decodeURIComponent(ownerTag.slice('form4-owner:'.length)) : 'Named reporting owner'
      const role = roleTag ? decodeURIComponent(roleTag.slice('form4-role:'.length)) : 'Officer / Director'
      if (isForm4Buy(n)) {
        topPeople.push({
          symbol: sym,
          who: `${owner} · ${role}`,
          lean: 'buy',
          activity: 'Executive Form 4 open-market buy',
          detail: `${n.source} · public EDGAR · confirmation only`,
          source: n.source,
        })
      } else if (isForm4Sell(n)) {
        topPeople.push({
          symbol: sym,
          who: `${owner} · ${role}`,
          lean: 'sell',
          activity: 'Executive Form 4 open-market sell',
          detail: `${n.source} · public EDGAR · confirmation only`,
          source: n.source,
        })
      }
    }
    if (options && options.lean !== 'n/a' && optionsFlowActionable(options)) {
      const lean: DeskTopPeople['lean'] =
        options.lean === 'call_heavy' ? 'call' : options.lean === 'put_heavy' ? 'put' : 'mixed'
      topPeople.push({
        symbol: sym,
        who: `Public options · ${sym}`,
        lean,
        activity:
          lean === 'call'
            ? 'Unusual call lean'
            : lean === 'put'
              ? 'Unusual put lean'
              : 'Balanced options flow',
        detail: options.note || `P/C vol ${options.putCallVol?.toFixed(2) ?? 'n/a'}`,
        source: options.source || 'Yahoo options',
      })
    }

    const factors: DeskFactor[] = [
      {
        id: 'options',
        label: 'Public options/flow',
        score: options?.score ?? 50,
        note: options?.note || 'n/a',
      },
      {
        id: 'tape',
        label: 'Daily tape',
        score:
          pct == null
            ? 40
            : Math.max(5, Math.min(95, 50 + pct * 8)),
        note: pct == null ? 'n/a' : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`,
      },
      {
        id: 'insider',
        label: 'Verified insider (Form 4)',
        score: hasInsiderBuy ? 82 : hasInsiderSell ? 25 : 50,
        note: hasInsiderBuy
          ? 'public EDGAR buy'
          : hasInsiderSell
            ? 'public EDGAR sell'
            : 'no Form 4 match',
        confirmationOnly: true,
        tier: 'confirmation',
      },
      {
        id: '13f',
        label: THIRTEEN_F_LABEL,
        score: thirteenF?.score ?? 50,
        note: thirteenF?.note || 'No recent matched 13F holding in bounded EDGAR scan',
        confirmationOnly: true,
        tier: 'confirmation',
      },
      {
        id: 'risk',
        label: 'Filing risk',
        score: hasRiskFiling ? 15 : 75,
        note: hasRiskFiling ? 'risk language' : 'clear',
      },
      {
        id: 'atr',
        label: 'ATR structure',
        score: atr && price ? Math.min(90, 40 + (atr / price) * 800) : 45,
        note: atr && price ? `ATR ~$${atr.toFixed(2)}` : 'n/a',
      },
    ]
    // Weight public options/flow higher in the composite (priority signal)
    const edgeScore = Math.round(
      (factors.find((f) => f.id === 'options')!.score * 1.35 +
        factors.find((f) => f.id === 'tape')!.score * 1.0 +
        factors.find((f) => f.id === 'insider')!.score * 0.65 +
        factors.find((f) => f.id === '13f')!.score * 0.25 +
        factors.find((f) => f.id === 'risk')!.score * 0.85 +
        factors.find((f) => f.id === 'atr')!.score * 0.7) /
        (1.35 + 1 + 0.65 + 0.25 + 0.85 + 0.7),
    )

    const pushStock = (opts: {
      id: string
      play: string
      side: 'long' | 'short' | 'flat'
      urgency: DeskSignal['urgency']
      headline: string
      detail: string
      action: string
      whyTake: string[]
      whyNot: string[]
      risks: string[]
      kind: 'long' | 'short' | 'avoid' | 'flat'
    }) => {
      let urgency = opts.urgency
      let side = opts.side
      let play = opts.play
      let headline = opts.headline
      let action = opts.action
      let playbook = buildPlaybook(side, price, atr, urgency)
      const heuristicOdds = heuristicOddsFromEdge(edgeScore, urgency)
      const timing = timingFor(
        opts.id,
        urgency,
        opts.kind === 'avoid' ? 'avoid' : side === 'flat' ? 'flat' : side,
      )
      const placeByExpired = timing.placeByMs > 0 && timing.placeByMs <= Date.now()
      const { rules, armed } = evaluateStockStrictRules({
        side,
        play,
        pct,
        edgeScore,
        playbook,
        hasInsiderBuy,
        hasInsiderSell,
        hasRiskFiling,
        options,
        form4AgeDays,
        placeByExpired,
      })

      if (side !== 'flat' && !armed) {
        const failed = rules.filter((r) => r.required && !r.pass).map((r) => r.label)
        urgency =
          play.startsWith('MOMENTUM') ||
          play === 'INSIDER_BUY' ||
          play.startsWith('OPTIONS_FLOW')
            ? 'watch'
            : 'avoid'
        headline = `LOCKED · ${sym} · ${failed.length} laws failed`
        action = `Stock printer locked. Failed: ${failed.slice(0, 3).join(' · ')}. Cash until green.`
        playbook = {
          side: 'flat',
          entry: price,
          stop: null,
          target1: null,
          target2: null,
          riskPct: null,
          rewardPct: null,
          rr: null,
          sizeHint: '0% — strict stock rules not armed',
          invalidation: failed.length ? `Need: ${failed.join(', ')}` : 'All laws',
          plan: 'Wait for public options lean + tape confluence (Form 4 confirmation-only).',
        }
        side = 'flat'
        play = 'RULES_LOCK'
      } else if (armed && side !== 'flat') {
        urgency = 'now'
        headline = `ARMED · ${opts.headline}`
        action = `STRICT STOCK PASS — ${opts.action}`
        playbook = {
          ...playbook,
          sizeHint:
            'ARMED · risk 0.5–0.75% equity · hard stop · 50% at T1 · flat if options/filing thesis dies',
        }
      }

      signals.push({
        id: opts.id,
        urgency,
        confidence: confFromEdge(edgeScore),
        successPct: null,
        chanceLabel: 'Computing…',
        heuristicOdds,
        edgeScore,
        play,
        regime: Math.abs(pct ?? 0) >= 2.5 ? 'trend' : 'chop',
        printerArmed: armed && side !== 'flat' && !placeByExpired,
        rules,
        headline,
        detail: opts.detail,
        action,
        whyTake: opts.whyTake,
        whyNot: opts.whyNot,
        risks: opts.risks,
        factors,
        playbook,
        timing,
        symbol: s.symbol,
        source: 'Strict stock desk',
        venues: ['Yahoo options', 'Yahoo tape', 'SEC EDGAR'],
        proof: [
          price != null
            ? `${sym} $${price.toLocaleString()} · 24h ${pct != null ? `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%` : 'n/a'}`
            : 'price n/a',
          ...(options?.lines || ['Public options: n/a']),
          hasInsiderBuy
            ? 'Verified insider · SEC Form 4 purchase (public EDGAR — complementary, not a tip leak)'
            : hasInsiderSell
              ? 'Verified insider · SEC Form 4 sale (public EDGAR filing)'
              : insiderHits.length
                ? 'Verified insider · SEC Form 4 on file (public EDGAR — lean unclear / non-open-market)'
                : 'No Form 4 match on this ticker yet (options/flow is primary)',
          ...insiderHits.slice(0, 2).map((n) => `${n.source}: ${n.title.slice(0, 100)}`),
          ...(thirteenF?.lines || ['SEC 13F: no recent matched holding (bounded EDGAR scan)']),
          ...related
            .filter((n) => !insiderHits.includes(n))
            .slice(0, 1)
            .map((n) => `${n.source}: ${n.title.slice(0, 90)}`),
        ],
        at,
      })
    }

    if (hasRiskFiling) {
      pushStock({
        id: `eq-risk:${s.id}`,
        play: 'RISK_OFF',
        side: 'flat',
        urgency: 'avoid',
        headline: `RISK OFF · ${sym}`,
        detail: 'Risk language in SEC/news match',
        action: 'Flat. Do not buy risk filings.',
        whyTake: [],
        whyNot: related.slice(0, 2).map((n) => n.title),
        risks: ['Gap', 'Headline'],
        kind: 'avoid',
      })
      continue
    }

    // Priority: public options/flow tickets first
    if (optionsFlowActionable(options) && options?.lean === 'call_heavy') {
      pushStock({
        id: `eq-opt-long:${s.id}`,
        play: 'OPTIONS_FLOW_LONG',
        side: 'long',
        urgency: 'watch',
        headline: `PUBLIC OPTIONS FLOW LONG · ${sym}`,
        detail: `Yahoo public options: ${options.note}`,
        action: 'Arm long only if strict laws pass — public options tape, not tips.',
        whyTake: [
          options.note,
          options.putCallVol != null ? `P/C vol ${options.putCallVol.toFixed(2)}` : 'P/C vol n/a',
          hasInsiderBuy ? 'Complementary Form 4 buy on file' : 'Form 4 optional / complementary',
          pct != null ? `Tape ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%` : 'Tape n/a',
        ],
        whyNot: ['Options lean can flip intraday', 'Delayed public chain — not dark-pool tips'],
        risks: ['IV crush', 'Mean-revert'],
        kind: 'long',
      })
      continue
    }

    if (optionsFlowActionable(options) && options?.lean === 'put_heavy') {
      pushStock({
        id: `eq-opt-short:${s.id}`,
        play: 'OPTIONS_FLOW_SHORT',
        side: 'short',
        urgency: 'watch',
        headline: `PUBLIC OPTIONS FLOW SHORT · ${sym}`,
        detail: `Yahoo public options: ${options.note}`,
        action: 'Arm short only if strict laws pass — public put-heavy tape, not tips.',
        whyTake: [
          options.note,
          options.putCallVol != null ? `P/C vol ${options.putCallVol.toFixed(2)}` : 'P/C vol n/a',
          pct != null ? `Tape ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%` : 'Tape n/a',
        ],
        whyNot: ['Short squeeze risk', 'Public options ≠ guaranteed direction'],
        risks: ['Squeeze', 'IV crush'],
        kind: 'short',
      })
      continue
    }

    if (hasInsiderBuy && !hasInsiderSell) {
      // Confirmation-only: never a primary arm path — surfaces Form 4 for awareness
      pushStock({
        id: `eq-insider:${s.id}`,
        play: 'INSIDER_BUY',
        side: 'long',
        urgency: 'watch',
        headline: `FORM 4 CONFIRMATION · ${sym} (cannot arm alone)`,
        detail:
          'Public SEC Form 4 purchase — lagging disclosure (often priced in). Confirmation only; primary = options/momentum.',
        action: 'WATCH. Do not treat Form 4 as a standalone BUY trigger.',
        whyTake: [
          'Verified via SEC EDGAR Form 4 (public filing).',
          typeof form4AgeDays === 'number' ? `Transaction age ~${form4AgeDays}d` : 'Age n/a',
          options?.lean && options.lean !== 'n/a'
            ? `Public options lean: ${options.lean.replace('_', ' ')}`
            : 'Options lean n/a',
        ],
        whyNot: [
          'Form 4 can lag the trade by up to ~2 business days',
          'Often already in the price by filing time',
          'Cannot satisfy arm laws alone (see STOCK_PRINTER_LAWS)',
        ],
        risks: ['Lag', 'Sector dump'],
        kind: 'long',
      })
      continue
    }

    if (pct != null && pct >= 2.5) {
      pushStock({
        id: `eq-mom-long:${s.id}`,
        play: 'MOMENTUM_LONG',
        side: 'long',
        urgency: 'watch',
        headline: `MOMENTUM LONG · ${sym}`,
        detail: `Strong daily tape ${pct.toFixed(2)}%${
          options?.lean && options.lean !== 'n/a' ? ` · options ${options.lean.replace('_', ' ')}` : ''
        }`,
        action: 'Only if strict laws arm — pullback preferred, hard stop.',
        whyTake: [`24h ${pct.toFixed(2)}%`, options?.note || 'options n/a'],
        whyNot: ['Momentum can reverse fast'],
        risks: ['Mean-revert'],
        kind: 'long',
      })
      continue
    }

    if (pct != null && pct <= -2.5) {
      pushStock({
        id: `eq-mom-short:${s.id}`,
        play: 'MOMENTUM_SHORT',
        side: 'short',
        urgency: 'watch',
        headline: `MOMENTUM SHORT · ${sym}`,
        detail: `Weak daily tape ${pct.toFixed(2)}%${
          options?.lean && options.lean !== 'n/a' ? ` · options ${options.lean.replace('_', ' ')}` : ''
        }`,
        action: 'Only if strict laws arm — no naked chase without stop.',
        whyTake: [`24h ${pct.toFixed(2)}%`, options?.note || 'options n/a'],
        whyNot: ['Short squeeze risk'],
        risks: ['Squeeze'],
        kind: 'short',
      })
      continue
    }

    pushStock({
      id: `eq-flat:${s.id}`,
      play: 'STAND_DOWN',
      side: 'flat',
      urgency: 'watch',
      headline: `STAND DOWN · ${sym}`,
      detail: 'No actionable public options lean + no Form 4 buy + no strong tape',
      action: 'WATCH. Wait for public options/flow or verified filing / momentum threshold.',
      whyTake: [],
      whyNot: ['No equity edge print'],
      risks: ['Forcing trades'],
      kind: 'flat',
    })
  }

  // Prefer top-people rows on high-movement names, then any public buys
  topPeople.sort((a, b) => {
    const ah = hotSyms.has(a.symbol) ? 0 : 1
    const bh = hotSyms.has(b.symbol) ? 0 : 1
    if (ah !== bh) return ah - bh
    const leanRank = (x: DeskTopPeople) =>
      x.lean === 'buy' || x.lean === 'call' ? 0 : x.lean === 'sell' || x.lean === 'put' ? 1 : 2
    return leanRank(a) - leanRank(b)
  })

  return finalizeDesk(signals, STOCK_PRINTER_LAWS, at, 'stock', {
    hotMovers,
    topPeople: topPeople.slice(0, 10),
  })
}
