import {
  MARKET_PRESETS,
  type Quote,
  type WatchSymbol,
} from '../markets.js'
import {
  countArmedOutcomes,
  listRecentOutcomes,
  logArmedTicket,
  queryHitRate,
} from '../markets-outcomes.js'
import {
  formatAggregateRiskDisplay,
  loadPortfolioConfig,
  portfolioArmBlockReason,
  riskContributionFromPlaybook,
} from '../markets-portfolio.js'
import { pruneSticky } from './helpers.js'
import type {
  DeskAsset,
  DeskBoard,
  DeskDirective,
  DeskSignal,
  DeskHotMover,
  DeskTopPeople,
} from './types.js'
import { lawSetId } from './types.js'
import { buildDirective, plainSummaryFor, blockReasonFor, ticketRiskLabel } from './directive.js'

export function deskUniverseSymbols(asset: DeskAsset, cfgSymbols: WatchSymbol[]): WatchSymbol[] {
  const seen = new Set<string>()
  const out: WatchSymbol[] = []
  for (const s of [...cfgSymbols, ...MARKET_PRESETS]) {
    if (s.kind !== asset) continue
    const key = s.symbol.toUpperCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
  }
  return out
}

export function rankHotMovers(asset: DeskAsset, quotes: Quote[]): DeskHotMover[] {
  return quotes
    .filter((q) => q.kind === asset && q.changePct != null && Number.isFinite(q.changePct))
    .map((q) => {
      const pct = q.changePct as number
      const abs = Math.abs(pct)
      return {
        symbol: q.symbol.toUpperCase(),
        label: q.label,
        kind: q.kind,
        changePct: pct,
        price: q.price,
        moveScore: Math.round(abs * 12 + (abs >= 3 ? 20 : 0) + (abs >= 5 ? 25 : 0)),
        note: `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}% · ${q.source || 'tape'}`,
      }
    })
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct) || b.moveScore - a.moveScore)
    .slice(0, 8)
}

export function finalizeDesk(
  signals: DeskSignal[],
  laws: string[],
  at: string,
  asset: DeskAsset,
  extras?: {
    hotMovers?: DeskHotMover[]
    topPeople?: DeskTopPeople[]
  },
): {
  ok: true
  signals: DeskSignal[]
  board: DeskBoard
  disclaimer: string
  at: string
  asset: DeskAsset
} {
  pruneSticky(new Set(signals.map((s) => s.id)))

  const lawSet = lawSetId(asset)
  const hit = queryHitRate({ asset, lawSet })

  // Attach historical chance labels (never heuristic) to every ticket
  for (const s of signals) {
    s.successPct = hit.ratePct
    s.chanceLabel = hit.label
  }

  // Portfolio caps: disarm excess correlated / over-risk tickets (WATCH + reason)
  const cfg = loadPortfolioConfig()
  const keptArmed: {
    symbol: string
    riskPct: number | null
    riskContribution: number
  }[] = []
  // Process in edge order so highest-edge keeps the arm slots
  const byEdge = [...signals].sort((a, b) => b.edgeScore - a.edgeScore)
  for (const s of byEdge) {
    if (!s.printerArmed || s.playbook.side === 'flat') continue
    const cand = {
      symbol: s.symbol || '?',
      riskPct: s.playbook.riskPct,
      riskContribution: riskContributionFromPlaybook(s.playbook),
    }
    const block = portfolioArmBlockReason(keptArmed, cand, cfg)
    if (block) {
      s.printerArmed = false
      s.urgency = 'watch'
      s.play = 'PORTFOLIO_CAP'
      s.headline = `WATCH · ${s.symbol || ''} · portfolio cap`
      s.action = block
      s.rules = [
        ...(s.rules || []),
        {
          id: 'portfolio',
          label: 'Portfolio risk / correlation cap',
          pass: false,
          required: true,
          note: block,
        },
      ]
      s.playbook = {
        ...s.playbook,
        side: 'flat',
        stop: null,
        target1: null,
        target2: null,
        sizeHint: '0% — portfolio cap',
        invalidation: block,
        plan: block,
      }
      continue
    }
    keptArmed.push(cand)
  }

  for (const s of signals) {
    s.directive = buildDirective({
      printerArmed: s.printerArmed,
      side: s.playbook?.side || 'flat',
      urgency: s.urgency,
      play: s.play,
      symbol: s.symbol,
      rules: s.rules,
    })
    s.plainSummary = plainSummaryFor(s)
    s.blockReason = blockReasonFor(s)
    s.riskLabel = ticketRiskLabel(s, cfg)
  }
  signals.sort((a, b) => {
    const armed = Number(b.printerArmed) - Number(a.printerArmed)
    if (armed !== 0) return armed
    if (b.edgeScore !== a.edgeScore) return b.edgeScore - a.edgeScore
    // Secondary sort: heuristic odds (internal only)
    return (b.heuristicOdds || 0) - (a.heuristicOdds || 0)
  })
  signals.forEach((s, i) => {
    s.rank = i + 1
  })

  // Log newly armed tickets for future hit-rate (needs weeks of data)
  for (const s of signals) {
    if (!s.printerArmed || !s.symbol) continue
    if (s.playbook.side !== 'long' && s.playbook.side !== 'short') continue
    logArmedTicket({
      id: `${s.id}@${at.slice(0, 16)}`,
      armedAt: at,
      asset,
      symbol: s.symbol,
      side: s.playbook.side,
      play: s.play,
      lawSet,
      edgeScore: s.edgeScore,
      heuristicOdds: s.heuristicOdds,
      entry: s.playbook.entry,
      stop: s.playbook.stop,
      target1: s.playbook.target1,
      target2: s.playbook.target2,
      riskPct: s.playbook.riskPct,
      rulesSnapshot: (s.rules || []).map((r) => ({ id: r.id, pass: r.pass, label: r.label })),
    })
  }

  const armedList = signals.filter((s) => s.printerArmed)
  const best = armedList[0] || null
  const oddsAnchor = best || signals.find((s) => s.urgency === 'watch') || signals[0] || null
  const longN = armedList.filter((s) => s.playbook.side === 'long').length
  const shortN = armedList.filter((s) => s.playbook.side === 'short').length
  const boardDirective: DeskDirective = best?.directive ?? {
    verb: 'WATCH',
    label: `WATCH — no ${asset} ticket passed all laws`,
    tone: 'watch',
  }
  const riskDisp = formatAggregateRiskDisplay(
    keptArmed.map((a) => a.riskContribution),
    cfg,
  )
  const board: DeskBoard = {
    bestPlay: best
      ? `ARMED #${best.rank} ${best.play} ${best.symbol || ''} · edge ${best.edgeScore}`
      : `Printer LOCKED — no ${asset} ticket passed all laws`,
    cashBias: longN > shortN ? 'long' : shortN > longN ? 'short' : 'flat',
    heat: best?.edgeScore ?? oddsAnchor?.edgeScore ?? 0,
    nowCount: signals.filter((s) => s.urgency === 'now' && s.printerArmed).length,
    avoidCount: signals.filter((s) => s.urgency === 'avoid').length,
    watchCount: signals.filter((s) => s.urgency === 'watch').length,
    tip: best
      ? best.action
      : asset === 'stock'
        ? 'Strict stock mode: 13F/Form 4 are lagged confirmation only; wait for a primary trigger and every law green.'
        : 'Strict crypto mode: on-chain whales and OKX leads are confirmation only; wait for live flow and every law green.',
    printerArmed: armedList.length > 0,
    armedCount: armedList.length,
    laws,
    directive: boardDirective,
    successPct: hit.ratePct,
    chanceLabel: hit.label,
    hotMovers: extras?.hotMovers?.length ? extras.hotMovers : undefined,
    topPeople: extras?.topPeople?.length ? extras.topPeople : undefined,
    aggregateRiskPct: riskDisp.aggregateRiskPct,
    aggregateRiskUsd: riskDisp.aggregateRiskUsd,
    accountEquityUsd: riskDisp.accountEquityUsd,
    riskBudgetLabel: riskDisp.label,
    needsAccountSize: riskDisp.needsAccountSize,
    totalArmedTickets: countArmedOutcomes(asset),
    resolvedOutcomeCount: hit.n,
    trackRecord: listRecentOutcomes(asset),
  }

  return {
    ok: true,
    signals: signals.slice(0, 24),
    board,
    disclaimer:
      asset === 'stock'
        ? 'STOCK desk: Public options/flow primary + Form 4 and SEC 13F confirmation-only. 13F holdings can be 45–135 days behind position establishment. Chance % = historical hit rate only when n≥30 — not a guarantee.'
        : 'CRYPTO desk: multi-venue flow primary + OKX leads and on-chain whale flow confirmation-only. Whale explorer observations are not tick-perfect. Chance % = historical hit rate only when n≥30 — not a guarantee.',
    at,
    asset,
  }
}
