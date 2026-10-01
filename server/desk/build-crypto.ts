import {
  fetchMarketQuotes,
  fetchQuotesForSymbols,
  getMarketsConfig,
  type Quote,
} from '../markets.js'
import { fetchTraderNews } from '../markets-news.js'
import { resolveOpenOutcomes } from '../markets-outcomes.js'
import { fetchMultiVenueBias, fetchVerifiedLeadAccounts, type VenueBias } from '../markets-venues.js'
import { fetchWhaleSummaries } from '../markets-whales.js'
import type { DeskSignal, DeskTopPeople } from './types.js'
import { MONEY_PRINTER_LAWS } from './types.js'
import {
  optionalWithin,
  timingFor,
  heuristicOddsFromEdge,
  confFromEdge,
  leadFlow,
  scoreFactors,
  whyFromBiases,
  accountSummary,
  buildPlaybook,
  fetchAtr,
} from './helpers.js'
import { evaluateStrictRules } from './rules-crypto.js'
import { finalizeDesk, rankHotMovers, deskUniverseSymbols } from './finalize.js'

export async function buildCryptoDeskSignals(force = false) {
  const at = new Date().toISOString()
  const cfg = getMarketsConfig()
  const universeSyms = deskUniverseSymbols('crypto', cfg.symbols)
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
  const hotMovers = rankHotMovers('crypto', [...quoteBySym.values()])
  const hotSyms = new Set(hotMovers.map((m) => m.symbol))

  const delistNews = news
    .filter((i) => i.tier === 'critical' || i.tier === 'watch')
    .slice(0, 40)
    .filter((n) => {
      const lower = n.title.toLowerCase()
      const cats = n.categories.map((c) => c.toLowerCase())
      const isDelist =
        cats.includes('delist') ||
        lower.includes('delist') ||
        lower.includes('removal of')
      if (!isDelist) return false
      if (n.source === 'Coinbase' && !lower.includes('delist') && !lower.includes('removal')) return false
      return true
    })
  if (delistNews.length > 0) {
    const sid = 'delist:aggregate'
    const venues = [...new Set(delistNews.map((n) => n.source).filter(Boolean))]
    const primary = delistNews[0]
    signals.push({
      id: sid,
      urgency: 'avoid',
      confidence: 5,
      successPct: null,
      chanceLabel: 'n/a',
      heuristicOdds: 12,
      edgeScore: 18,
      play: 'RISK_OFF',
      regime: 'chop',
      printerArmed: false,
      rules: [
        {
          id: 'delist',
          label: 'No delist/removal risk live',
          pass: false,
          required: true,
          note: 'Official risk — printer locked',
        },
      ],
      headline:
        delistNews.length === 1
          ? `Hard risk · ${primary.source} delist/removal`
          : `Hard risk · delist/removal (${delistNews.length} official prints)`,
      detail:
        delistNews.length === 1
          ? primary.title
          : `${primary.title} · +${delistNews.length - 1} more official removal print${delistNews.length === 2 ? '' : 's'}`,
      action: 'Flat only. Official venue risk — no hero buys.',
      whyTake: [],
      whyNot: ['Official removal language', 'Liquidity gap risk'],
      risks: ['Gap-down', 'Slippage'],
      factors: [
        {
          id: 'official',
          label: 'Official print',
          score: 95,
          note:
            delistNews.length === 1
              ? primary.source
              : `${delistNews.length} venue prints (${venues.slice(0, 3).join(', ')})`,
        },
      ],
      playbook: {
        side: 'flat',
        entry: null,
        stop: null,
        target1: null,
        target2: null,
        riskPct: null,
        rewardPct: null,
        rr: null,
        sizeHint: '0% — flatten if exposed',
        invalidation: 'N/A',
        plan: 'Stay out until listing risk clears',
      },
      timing: timingFor(sid, 'avoid', 'avoid'),
      source: primary.source,
      venues,
      proof: delistNews.map((n) => n.url).filter(Boolean).slice(0, 8),
      at: primary.published,
    })
  }

  const hasDelistRisk = signals.some((s) => s.play === 'RISK_OFF')

  const cryptos = cfg.symbols.filter((s) => s.kind === 'crypto').slice(0, 6)
  // Whale and OKX-copy data are explicitly confirmation-only. Bound them so a
  // slow public RPC or copy-trading endpoint cannot delay the multi-venue
  // primary gate; absence means unavailable context, not a changed law.
  const [whaleBySymbol, packs] = await Promise.all([
    optionalWithin(fetchWhaleSummaries(cryptos.map((s) => s.symbol), 'flat', { force }), new Map(), 2_500),
    Promise.all(
      cryptos.map(async (s) => {
        const [biases, accounts, atrPack] = await Promise.all([
          fetchMultiVenueBias(s.symbol),
          optionalWithin(fetchVerifiedLeadAccounts(s.symbol), [], 2_200),
          fetchAtr(s.symbol),
        ])
        return { s, biases, accounts, atrPack }
      }),
    ),
  ])

  for (const { s, biases, accounts, atrPack } of packs) {
    if (!biases.length) continue
    const q = quoteBySym.get(s.symbol.toUpperCase())
    const pct = q?.changePct ?? null
    const price = q?.price ?? atrPack?.last ?? null
    const atr = atrPack?.atr ?? (price != null ? price * 0.008 : null)
    const whale = whaleBySymbol.get(s.symbol.toUpperCase())

    const addLong = biases.filter((b) => b.lean === 'add_long')
    const addShort = biases.filter((b) => b.lean === 'add_short')
    const crowdedLong = biases.filter((b) => b.lean === 'crowded_long')
    const crowdedShort = biases.filter((b) => b.lean === 'crowded_short')
    const neutral = biases.filter((b) => b.lean === 'neutral')
    const venueNames = biases.map((b) => `${b.venue}:${b.lean}`)
    const taker = biases.find((b) => b.takerBuySell != null)?.takerBuySell
    const hasTop = (list: VenueBias[]) => list.some((b) => b.venue === 'binance' || b.venue === 'okx')

    const proof = [
      ...biases.map((b) => `${b.label}: ${b.detail} → ${b.lean}`),
      price != null
        ? `Mark $${price.toLocaleString()} · ATR15m $${atr?.toFixed(price >= 100 ? 1 : 4) ?? 'n/a'} · 24h ${pct != null ? `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%` : 'n/a'}`
        : 'Mark n/a',
      ...accountSummary(accounts, s.symbol),
      ...(whale?.lines || []),
    ]

    // OKX verified copy-lead fills = public “what top people are doing”
    const leads = leadFlow(accounts, s.symbol)
    if (accounts.length > 0 && (leads.long > 0 || leads.short > 0)) {
      for (const a of accounts.slice(0, 3)) {
        const relevant = a.recentTrades.filter((t) =>
          t.instId.toUpperCase().startsWith(`${s.symbol.toUpperCase()}-`),
        )
        const use = relevant.length ? relevant : a.recentTrades.slice(0, 2)
        if (!use.length && !a.openSides.length) continue
        const longN = use.filter((t) => t.side === 'long').length
        const shortN = use.filter((t) => t.side === 'short').length
        const openLong = a.openSides.filter((p) => p.side === 'long').length
        const openShort = a.openSides.filter((p) => p.side === 'short').length
        const lean: DeskTopPeople['lean'] =
          longN + openLong > shortN + openShort
            ? 'buy'
            : shortN + openShort > longN + openLong
              ? 'sell'
              : 'mixed'
        topPeople.push({
          symbol: s.symbol.toUpperCase(),
          who: a.name,
          lean,
          activity: 'OKX copy-lead fill',
          detail: `${leads.note} · win ${(a.winRatio * 100).toFixed(0)}% · AUM $${Math.round(a.aum).toLocaleString()}`,
          source: 'OKX public copy-trading',
        })
      }
    }

    const pushTicket = (opts: {
      id: string
      urgency: DeskSignal['urgency']
      direction: 'long' | 'short' | 'flat' | 'fade'
      play: string
      headline: string
      detail: string
      action: string
      side: 'long' | 'short' | 'flat'
      whyTake: string[]
      whyNot: string[]
      risks: string[]
      kind: 'long' | 'short' | 'avoid' | 'conflict' | 'flat'
    }) => {
      const { factors, edgeScore, regime } = scoreFactors(
        biases,
        pct,
        accounts,
        s.symbol,
        opts.direction,
        whale
          ? {
              ...whale,
              score:
                whale.lean === 'accumulation'
                  ? opts.direction === 'long'
                    ? 72
                    : opts.direction === 'short' || opts.direction === 'fade'
                      ? 35
                      : 60
                  : whale.lean === 'sell_pressure'
                    ? opts.direction === 'short' || opts.direction === 'fade'
                      ? 74
                      : opts.direction === 'long'
                        ? 32
                        : 40
                    : 50,
            }
          : undefined,
      )
      let urgency = opts.urgency
      const heuristicOdds = heuristicOddsFromEdge(edgeScore, urgency)
      let playbook = buildPlaybook(opts.side, price, atr, urgency)
      let headline = opts.headline
      let action = opts.action
      let side = opts.side
      let play = opts.play
      let kind = opts.kind
      const timing = timingFor(opts.id, urgency, kind)
      const placeByExpired = timing.placeByMs > 0 && timing.placeByMs <= Date.now()

      const { rules, armed } = evaluateStrictRules({
        side,
        play,
        biases,
        pct,
        accounts,
        symbol: s.symbol,
        edgeScore,
        playbook,
        hasDelistRisk,
        placeByExpired,
      })

      if (side !== 'flat' && !armed) {
        const failed = rules.filter((r) => r.required && !r.pass).map((r) => r.label)
        urgency =
          play === 'FADE_CROWD' || play === 'NO_CHASE' || play === 'SQUEEZE_WATCH' ? 'avoid' : 'watch'
        headline = `LOCKED · ${s.symbol} · ${failed.length} laws failed`
        action = `Printer locked. Failed: ${failed.slice(0, 4).join(' · ') || 'strict gate'}. Cash until all green.`
        playbook = {
          side: 'flat',
          entry: price,
          stop: null,
          target1: null,
          target2: null,
          riskPct: null,
          rewardPct: null,
          rr: null,
          sizeHint: '0% — strict rules not armed',
          invalidation: failed.length ? `Need: ${failed.join(', ')}` : 'All laws',
          plan: 'Wait. Capital protection > forced trades.',
        }
        side = 'flat'
        kind = play === 'FADE_CROWD' || play === 'NO_CHASE' ? 'avoid' : 'flat'
        if (
          play === 'FLOW_LONG' ||
          play === 'FLOW_SHORT' ||
          play === 'FADE_CROWD' ||
          play === 'SQUEEZE_WATCH'
        ) {
          play = 'RULES_LOCK'
        }
      } else if (armed && side !== 'flat') {
        urgency = 'now'
        headline = `ARMED · ${opts.headline}`
        action = `STRICT PASS — ${opts.action} Follow size hint. Hard stop. No revenge.`
        playbook = {
          ...playbook,
          sizeHint:
            'ARMED · risk 0.5–0.75% equity max · hard stop · 50% off at T1 · flat if any rule flips',
        }
      }

      const confidence = confFromEdge(edgeScore)
      signals.push({
        id: opts.id,
        urgency,
        confidence,
        successPct: null,
        chanceLabel: 'Computing…',
        heuristicOdds,
        edgeScore,
        play,
        regime,
        printerArmed: armed && side !== 'flat' && !placeByExpired,
        rules,
        headline,
        detail: opts.detail,
        action,
        whyTake: opts.whyTake,
        whyNot: [
          ...opts.whyNot,
          ...(!armed && side === 'flat'
            ? ['Strict money-printer laws blocked this ticket.']
            : []),
        ],
        risks: opts.risks,
        factors,
        playbook,
        timing,
        symbol: s.symbol,
        source: 'Strict prop desk',
        venues: venueNames,
        proof,
        accounts,
        at,
      })
    }

    if (addShort.length >= 2 && addLong.length === 0 && hasTop(addShort)) {
      const tapeDown = pct != null && pct <= -1.5
      const takerSell = taker != null && taker <= 0.9
      const urgency: DeskSignal['urgency'] =
        (tapeDown || takerSell) && addShort.length >= 2 ? 'now' : 'watch'
      pushTicket({
        id: `mv-short:${s.id}`,
        urgency,
        direction: 'short',
        play: 'FLOW_SHORT',
        headline: `SHORT ticket · ${s.symbol} · fresh multi-venue sell flow`,
        detail: `${addShort.map((b) => b.venue.toUpperCase()).join(' + ')} adding shorts / cutting longs`,
        action:
          urgency === 'now'
            ? 'Work the short now — hard stop, scale at T1. Do not buy the dip.'
            : 'Arm short on failed reclaim / lower-high. No chase.',
        side: 'short',
        whyTake: whyFromBiases(biases, 'short'),
        whyNot: ['Squeeze risk if shorts already crowded', 'Δ can flip next hour'],
        risks: ['Short squeeze', 'Funding flip', 'Headline spike'],
        kind: 'short',
      })
      continue
    }

    if (addLong.length >= 2 && addShort.length === 0 && hasTop(addLong)) {
      if (!(crowdedLong.length >= 2 && addLong.length < 3)) {
        const tapeUp = pct != null && pct >= 1.5
        const takerBuy = taker != null && taker >= 1.1
        const urgency: DeskSignal['urgency'] =
          (tapeUp || takerBuy) && addLong.length >= 2 ? 'now' : 'watch'
        pushTicket({
          id: `mv-long:${s.id}`,
          urgency,
          direction: 'long',
          play: 'FLOW_LONG',
          headline: `LONG ticket · ${s.symbol} · fresh multi-venue buy flow`,
          detail: `${addLong.map((b) => b.venue.toUpperCase()).join(' + ')} actually adding longs (Δ)`,
          action:
            urgency === 'now'
              ? 'Work the long — pullback hold preferred. Hard stop. Scale at T1.'
              : 'Arm long on reclaim/hold. Do not FOMO mid-candle.',
          side: 'long',
          whyTake: whyFromBiases(biases, 'long'),
          whyNot: ['Crowded books still flush', 'Scrap if Δ turns negative'],
          risks: ['Long liquidation cascade', 'Slippage', 'Macro'],
          kind: 'long',
        })
        continue
      }
    }

    if (crowdedLong.length >= 2 && addLong.length === 0) {
      const takerWeak = taker != null && taker < 0.95
      if (takerWeak || (biases.find((b) => b.funding != null)?.funding ?? 0) > 0.00035) {
        pushTicket({
          id: `mv-fade:${s.id}`,
          urgency: 'watch',
          direction: 'fade',
          play: 'FADE_CROWD',
          headline: `FADE watch · ${s.symbol} · crowded longs`,
          detail: 'Stuck long + soft aggressive flow — mean-revert candidate, not a chase long',
          action: 'Prefer flat or small fade short with tight stop. No long chase.',
          side: 'short',
          whyTake: [],
          whyNot: whyFromBiases(biases, 'fade'),
          risks: ['Squeeze through crowded longs', 'Trend continuation'],
          kind: 'short',
        })
      } else {
        pushTicket({
          id: `mv-avoid:${s.id}`,
          urgency: 'avoid',
          direction: 'fade',
          play: 'NO_CHASE',
          headline: `AVOID · ${s.symbol} · crowded long, no edge`,
          detail: `${crowdedLong.map((b) => b.venue.toUpperCase()).join(' + ')} crowded with flat Δ`,
          action: 'Cash. Waiting for flush or genuine add_short.',
          side: 'flat',
          whyTake: [],
          whyNot: whyFromBiases(biases, 'fade'),
          risks: ['Buying the top of positioning'],
          kind: 'avoid',
        })
      }
      continue
    }

    if (crowdedShort.length >= 2 && addShort.length === 0) {
      pushTicket({
        id: `mv-squeeze:${s.id}`,
        urgency: 'watch',
        direction: 'long',
        play: 'SQUEEZE_WATCH',
        headline: `SQUEEZE watch · ${s.symbol}`,
        detail: 'Crowded shorts without fresh short adds',
        action: 'Watch cover rally; need taker buy confirm before long ticket.',
        side: 'long',
        whyTake: whyFromBiases(biases, 'long'),
        whyNot: ['Crowded short can stay crowded'],
        risks: ['Failed squeeze'],
        kind: 'long',
      })
      continue
    }

    if (addLong.length >= 1 && addShort.length >= 1) {
      pushTicket({
        id: `mv-conflict:${s.id}`,
        urgency: 'avoid',
        direction: 'flat',
        play: 'CONFLICT',
        headline: `NO TRADE · ${s.symbol} · venue conflict`,
        detail: `addL ${addLong.map((b) => b.venue).join(',')} · addS ${addShort.map((b) => b.venue).join(',')}`,
        action: 'Skip. Prop desks don’t pick a side when flow conflicts.',
        side: 'flat',
        whyTake: [],
        whyNot: whyFromBiases(biases, 'flat'),
        risks: ['Whipsaw'],
        kind: 'conflict',
      })
      continue
    }

    pushTicket({
      id: `mv-flat:${s.id}`,
      urgency: 'watch',
      direction: 'flat',
      play: 'STAND_DOWN',
      headline: `STAND DOWN · ${s.symbol} · no fresh edge`,
      detail: `${neutral.length}/${biases.length} flat · ${addLong.length} addL · ${addShort.length} addS · ${crowdedLong.length} crowded`,
      action: 'Protect capital. Structural long ≠ a long ticket.',
      side: 'flat',
      whyTake: [],
      whyNot: whyFromBiases(biases, 'flat'),
      risks: ['Forcing trades', 'Fees to noise'],
      kind: 'flat',
    })
  }

  topPeople.sort((a, b) => {
    const ah = hotSyms.has(a.symbol) ? 0 : 1
    const bh = hotSyms.has(b.symbol) ? 0 : 1
    if (ah !== bh) return ah - bh
    const leanRank = (x: DeskTopPeople) => (x.lean === 'buy' ? 0 : x.lean === 'sell' ? 1 : 2)
    return leanRank(a) - leanRank(b)
  })

  return finalizeDesk(signals, MONEY_PRINTER_LAWS, at, 'crypto', {
    hotMovers,
    topPeople: topPeople.slice(0, 10),
  })
}
