/**
 * Fail-closed desk unit tests — no live Yahoo/EDGAR/exchange calls.
 */
import { describe, expect, it, beforeEach } from 'vitest'
import {
  evaluateStockStrictRules,
  evaluateStrictRules,
  type DeskFactor,
  type DeskPlaybook,
} from '../markets-desk.js'
import { __forceSourceLastOk } from '../markets-health.js'
import {
  portfolioArmBlockReason,
  riskContributionFromPlaybook,
  type PortfolioRiskConfig,
} from '../markets-portfolio.js'
import type { VenueBias } from '../markets-venues.js'
import type { PublicOptionsFlow } from '../markets-options.js'

const flatPb: DeskPlaybook = {
  side: 'flat',
  entry: 100,
  stop: null,
  target1: null,
  target2: null,
  riskPct: null,
  rewardPct: null,
  rr: null,
  sizeHint: '0%',
  invalidation: 'n/a',
  plan: 'cash',
}

const longPb: DeskPlaybook = {
  side: 'long',
  entry: 100,
  stop: 99,
  target1: 102,
  target2: 104,
  riskPct: 1.0,
  rewardPct: 2.0,
  rr: 2.0,
  sizeHint: '0.75%',
  invalidation: 'stop',
  plan: 'long',
}

function bias(partial: Partial<VenueBias> & Pick<VenueBias, 'venue' | 'lean'>): VenueBias {
  return {
    label: partial.venue,
    ls: 1.2,
    ls1h: 1.0,
    lsDelta: 0.2,
    longPct: 0.55,
    shortPct: 0.45,
    takerBuySell: 1.2,
    funding: 0.00005,
    detail: 'test',
    ...partial,
  }
}

const callHeavy: PublicOptionsFlow = {
  symbol: 'NVDA',
  source: 'test',
  expiration: '2026-01-01',
  underlyingPrice: 100,
  callVolume: 10_000,
  putVolume: 2_000,
  callOi: 5_000,
  putOi: 4_000,
  putCallVol: 0.2,
  putCallOi: 0.8,
  lean: 'call_heavy',
  unusual: [],
  unusualCallVol: 5_000,
  unusualPutVol: 100,
  score: 80,
  note: 'call heavy test',
  lines: ['test'],
}

beforeEach(() => {
  // Fresh sources by default
  __forceSourceLastOk('yahoo_options', Date.now())
  __forceSourceLastOk('multi_venue', Date.now())
  __forceSourceLastOk('binance_flow', Date.now())
})

describe('Fix 4 — INSIDER_BUY cannot arm alone', () => {
  it('fails allowed-play law when play is INSIDER_BUY', () => {
    const { rules, armed } = evaluateStockStrictRules({
      side: 'long',
      play: 'INSIDER_BUY',
      pct: 3,
      edgeScore: 80,
      playbook: longPb,
      hasInsiderBuy: true,
      hasInsiderSell: false,
      hasRiskFiling: false,
      options: callHeavy,
      form4AgeDays: 1,
      placeByExpired: false,
    })
    expect(armed).toBe(false)
    const play = rules.find((r) => r.id === 'play')
    expect(play?.pass).toBe(false)
    expect(play?.note).toMatch(/cannot arm alone/i)
  })

  it('can arm OPTIONS_FLOW_LONG when laws pass', () => {
    const { armed, rules } = evaluateStockStrictRules({
      side: 'long',
      play: 'OPTIONS_FLOW_LONG',
      pct: 0.5,
      edgeScore: 70,
      playbook: longPb,
      hasInsiderBuy: false,
      hasInsiderSell: false,
      hasRiskFiling: false,
      options: callHeavy,
      form4AgeDays: null,
      placeByExpired: false,
    })
    expect(rules.find((r) => r.id === 'play')?.pass).toBe(true)
    expect(armed).toBe(true)
  })
})

describe('confirmation-only factors', () => {
  it('are display/composite metadata and cannot create a stock arm path', () => {
    const thirteenF: DeskFactor = {
      id: '13f',
      label: '13F holdings (institutional, up to 45+ days lagged — background context, not a live signal)',
      score: 60,
      note: 'Quarter-ended holding',
      confirmationOnly: true,
      tier: 'confirmation',
    }
    expect(thirteenF.confirmationOnly).toBe(true)

    // The strict evaluator intentionally receives no factor input; only an allowed
    // primary play (options/momentum) can arm, so a 13F score cannot create a path.
    const { armed, rules } = evaluateStockStrictRules({
      side: 'long',
      play: 'INSIDER_BUY',
      pct: 3,
      edgeScore: thirteenF.score,
      playbook: longPb,
      hasInsiderBuy: false,
      hasInsiderSell: false,
      hasRiskFiling: false,
      options: callHeavy,
      form4AgeDays: null,
      placeByExpired: false,
    })
    expect(armed).toBe(false)
    expect(rules.find((r) => r.id === 'play')?.pass).toBe(false)
  })
})

describe('Fix 2 — stale source fails closed', () => {
  it('OPTIONS_FLOW fails options-fresh when Yahoo is stale', () => {
    __forceSourceLastOk('yahoo_options', Date.now() - 22 * 60_000, 'simulated stale')
    const { rules, armed } = evaluateStockStrictRules({
      side: 'long',
      play: 'OPTIONS_FLOW_LONG',
      pct: 0.5,
      edgeScore: 70,
      playbook: longPb,
      hasInsiderBuy: false,
      hasInsiderSell: false,
      hasRiskFiling: false,
      options: callHeavy,
      form4AgeDays: null,
      placeByExpired: false,
    })
    expect(armed).toBe(false)
    const fresh = rules.find((r) => r.id === 'options-fresh')
    expect(fresh?.pass).toBe(false)
    expect(fresh?.note).toMatch(/stale|blocked/i)
  })

  it('FLOW fails data-fresh when multi_venue is stale', () => {
    __forceSourceLastOk('multi_venue', Date.now() - 10 * 60_000)
    __forceSourceLastOk('binance_flow', Date.now())
    const biases = [
      bias({ venue: 'binance', lean: 'add_long', takerBuySell: 1.3 }),
      bias({ venue: 'okx', lean: 'add_long' }),
    ]
    const { rules, armed } = evaluateStrictRules({
      side: 'long',
      play: 'FLOW_LONG',
      biases,
      pct: 2,
      accounts: [],
      symbol: 'BTC',
      edgeScore: 80,
      playbook: { ...longPb, riskPct: 1.0 },
      hasDelistRisk: false,
      placeByExpired: false,
    })
    expect(armed).toBe(false)
    expect(rules.find((r) => r.id === 'data-fresh')?.pass).toBe(false)
  })
})

describe('Fix 7 — null / expiry fail closed', () => {
  it('fails taker when takerBuySell is missing', () => {
    const biases = [
      bias({ venue: 'binance', lean: 'add_long', takerBuySell: undefined }),
      bias({ venue: 'okx', lean: 'add_long' }),
    ]
    const { rules, armed } = evaluateStrictRules({
      side: 'long',
      play: 'FLOW_LONG',
      biases,
      pct: 2,
      accounts: [],
      symbol: 'BTC',
      edgeScore: 80,
      playbook: longPb,
      hasDelistRisk: false,
      placeByExpired: false,
    })
    expect(armed).toBe(false)
    expect(rules.find((r) => r.id === 'taker')?.pass).toBe(false)
    expect(rules.find((r) => r.id === 'taker')?.note).toMatch(/fail closed/i)
  })

  it('fails R:R when rr is null', () => {
    const biases = [
      bias({ venue: 'binance', lean: 'add_long', takerBuySell: 1.3 }),
      bias({ venue: 'okx', lean: 'add_long' }),
    ]
    const { rules, armed } = evaluateStrictRules({
      side: 'long',
      play: 'FLOW_LONG',
      biases,
      pct: 2,
      accounts: [],
      symbol: 'BTC',
      edgeScore: 80,
      playbook: { ...longPb, rr: null, riskPct: 1.0 },
      hasDelistRisk: false,
      placeByExpired: false,
    })
    expect(armed).toBe(false)
    expect(rules.find((r) => r.id === 'rr')?.pass).toBe(false)
  })

  it('fails place-by when expired', () => {
    const biases = [
      bias({ venue: 'binance', lean: 'add_long', takerBuySell: 1.3 }),
      bias({ venue: 'okx', lean: 'add_long' }),
    ]
    const { rules, armed } = evaluateStrictRules({
      side: 'long',
      play: 'FLOW_LONG',
      biases,
      pct: 2,
      accounts: [],
      symbol: 'BTC',
      edgeScore: 80,
      playbook: longPb,
      hasDelistRisk: false,
      placeByExpired: true,
    })
    expect(armed).toBe(false)
    expect(rules.find((r) => r.id === 'place-by')?.pass).toBe(false)
  })

  it('stock fails stop when riskPct null', () => {
    const { rules, armed } = evaluateStockStrictRules({
      side: 'long',
      play: 'OPTIONS_FLOW_LONG',
      pct: 0.5,
      edgeScore: 70,
      playbook: { ...longPb, riskPct: null, stop: null },
      hasInsiderBuy: false,
      hasInsiderSell: false,
      hasRiskFiling: false,
      options: callHeavy,
      form4AgeDays: null,
      placeByExpired: false,
    })
    expect(armed).toBe(false)
    expect(rules.find((r) => r.id === 'stop')?.pass).toBe(false)
  })
})

describe('Fix 3 — portfolio cap', () => {
  it('downgrades when correlated bucket already filled', () => {
    const cfg: PortfolioRiskConfig = {
      maxArmed: 5,
      maxAggregateRiskPct: 10,
      maxPerBucket: 1,
      buckets: { BTC: 'l1_majors', ETH: 'l1_majors' },
      accountEquityUsd: null,
    }
    const reason = portfolioArmBlockReason(
      [{ symbol: 'BTC', riskPct: 1, riskContribution: 0.75 }],
      { symbol: 'ETH', riskPct: 1, riskContribution: 0.75 },
      cfg,
    )
    expect(reason).toMatch(/correlated-l1-majors/i)
  })

  it('downgrades when aggregate risk-unit cap exceeded', () => {
    const cfg: PortfolioRiskConfig = {
      maxArmed: 5,
      maxAggregateRiskPct: 1.0,
      maxPerBucket: 5,
      buckets: {},
      accountEquityUsd: null,
    }
    const reason = portfolioArmBlockReason(
      [{ symbol: 'SOL', riskPct: 1, riskContribution: 0.75 }],
      { symbol: 'XRP', riskPct: 1, riskContribution: 0.75 },
      cfg,
    )
    expect(reason).toMatch(/aggregate risk/i)
  })
})

describe('Fix 8 — real risk weighting', () => {
  it('1% stop contributes less than 8% stop at same equity risk intent', () => {
    const tight = riskContributionFromPlaybook({
      riskPct: 1,
      sizeHint: 'Risk 0.75% equity · hard stop',
      side: 'long',
    })
    const wide = riskContributionFromPlaybook({
      riskPct: 8,
      sizeHint: 'Risk 0.75% equity · hard stop',
      side: 'long',
    })
    expect(tight).toBeCloseTo(0.75, 5)
    expect(wide).toBeCloseTo(6.0, 5)
    expect(wide).toBeGreaterThan(tight)
  })

  it('charges malformed or missing sizeHint as fail-closed high risk', () => {
    const missing = riskContributionFromPlaybook({ riskPct: 1, side: 'long' })
    const malformed = riskContributionFromPlaybook({
      riskPct: 1,
      sizeHint: 'position sized by vibes',
      side: 'long',
    })
    expect(missing).toBeCloseTo(7.5, 5)
    expect(malformed).toBeCloseTo(7.5, 5)
    expect(missing).toBeGreaterThan(0.75)
  })
})

describe('sanity', () => {
  it('flat playbook path stays unarmed', () => {
    const { armed } = evaluateStockStrictRules({
      side: 'flat',
      play: 'STAND_DOWN',
      pct: null,
      edgeScore: 10,
      playbook: flatPb,
      hasInsiderBuy: false,
      hasInsiderSell: false,
      hasRiskFiling: false,
      options: null,
      form4AgeDays: null,
      placeByExpired: false,
    })
    expect(armed).toBe(false)
  })
})
