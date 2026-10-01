import type { LeadAccount } from '../markets-venues.js'
import type { DeskOutcomeRow } from '../markets-outcomes.js'

export type DeskRule = {
  id: string
  label: string
  pass: boolean
  required: boolean
  note: string
}

export type DeskFactor = {
  id: string
  label: string
  score: number
  note: string
  /** Context only: contributes lightly but can never create an arm path. */
  confirmationOnly?: boolean
  tier?: 'primary' | 'confirmation'
}

export type DeskPlaybook = {
  side: 'long' | 'short' | 'flat'
  entry: number | null
  stop: number | null
  target1: number | null
  target2: number | null
  riskPct: number | null
  rewardPct: number | null
  rr: number | null
  sizeHint: string
  invalidation: string
  plan: string
}

/** Crystal-clear ticket action — what to do right now */
export type DeskDirective = {
  verb: 'BUY' | 'SELL' | 'WATCH' | 'AVOID' | "DON'T BUY"
  label: string
  tone: 'buy' | 'sell' | 'watch' | 'avoid'
}

/** High |Δ| names across watchlist + presets */
export type DeskHotMover = {
  symbol: string
  label: string
  kind: 'crypto' | 'stock'
  changePct: number
  price: number | null
  moveScore: number
  note: string
}

/** Public “what top people are doing” — Form 4 / OKX leads / options lean */
export type DeskTopPeople = {
  symbol: string
  who: string
  lean: 'buy' | 'sell' | 'call' | 'put' | 'mixed'
  activity: string
  detail: string
  source: string
}

export type DeskSignal = {
  id: string
  urgency: 'now' | 'watch' | 'avoid'
  confidence: number
  /**
   * User-facing odds: historical hit rate % when n≥30, else null.
   * NEVER a hand-tuned fake precision number.
   */
  successPct: number | null
  /** Full label for UI, e.g. "Not enough history yet (n=8)" */
  chanceLabel: string
  /** Internal heuristic only — sorting / legacy; not shown as "chance" */
  heuristicOdds: number
  /** 0–100 institutional composite used for ranking */
  edgeScore: number
  rank?: number
  play: string
  regime: 'trend' | 'mean-revert' | 'chop'
  /** Only true when every required money-printer rule passes */
  printerArmed: boolean
  rules: DeskRule[]
  /** Primary action line — BUY / SELL / WATCH / AVOID (set in finalizeDesk) */
  directive?: DeskDirective
  /** Server-generated explanation based on primary laws that actually passed. */
  plainSummary?: string
  /** Specific reason a WATCH/locked ticket cannot arm right now. */
  blockReason?: string | null
  /** Ticket-level stop-weighted risk display; does not alter portfolio math. */
  riskLabel?: string
  headline: string
  detail: string
  action: string
  whyTake: string[]
  whyNot: string[]
  risks: string[]
  factors: DeskFactor[]
  playbook: DeskPlaybook
  timing: {
    window: string
    placeBy: string
    placeByMs: number
    horizon: string
    speed: string
  }
  symbol?: string
  source: string
  venues?: string[]
  proof: string[]
  accounts?: LeadAccount[]
  at: string
}

export type DeskBoard = {
  bestPlay: string
  cashBias: 'long' | 'short' | 'flat'
  heat: number
  nowCount: number
  avoidCount: number
  watchCount: number
  tip: string
  printerArmed: boolean
  armedCount: number
  laws: string[]
  /** Board-level primary action */
  directive?: DeskDirective
  /** Historical hit rate % when enough samples; else null */
  successPct?: number | null
  chanceLabel?: string
  /** Massive movers across watchlist + presets */
  hotMovers?: DeskHotMover[]
  /** Public buys / leads / options lean on hot names */
  topPeople?: DeskTopPeople[]
  /** Portfolio risk summary (Fix 8) */
  aggregateRiskPct?: number
  aggregateRiskUsd?: number | null
  accountEquityUsd?: number | null
  riskBudgetLabel?: string
  needsAccountSize?: boolean
  totalArmedTickets?: number
  resolvedOutcomeCount?: number
  trackRecord?: DeskOutcomeRow[]
}

/** Hard laws — ticket cannot print money without these. Still not a guarantee. */
export const MONEY_PRINTER_LAWS: string[] = [
  'Only trade FLOW_LONG / FLOW_SHORT — never chase crowded / conflict / fade as “now”.',
  '≥2 venues must ADD in the same direction, including Binance or OKX top cohort.',
  'Zero opposing venue adds (no long+short mix).',
  'Aggressive taker must confirm (long ≥1.15 buy/sell · short ≤0.85). Missing taker = fail closed.',
  'Tape must confirm (long ≥+1.2% 24h · short ≤−1.2%) OR funding must agree.',
  'Edge score ≥ 68 (historical hit-rate is display-only until n≥30 — not used to arm).',
  'Playbook R:R ≥ 1.5 with stop risk ≤ 1.25% of price.',
  'Do not long into ≥2 crowded-long venues; do not short into ≥2 crowded-short.',
  // CONFIRMATION-ONLY: OKX leads are survivorship-biased — never sufficient alone to arm.
  'If OKX lead fills exist for the symbol, majority must lean with the trade (confirmation only).',
  'On-chain whale flow is confirmation-only: it contributes a low-weight context score and never arms a ticket.',
  'Multi-venue + Binance flow sources must be fresh (stale = fail closed).',
  'Place-by clock must not be expired.',
  'Hard stop required · risk ≤0.75% equity · scale 50% at T1 · flat if any rule flips.',
  'No ticket during official delist/removal risk on the book.',
  'Portfolio caps: max armed / aggregate risk / correlation bucket (see desk-portfolio.json).',
  'If Place-by expires or flow Δ flips — scrap immediately. No revenge size.',
]

/**
 * Stock laws. Form 4 / INSIDER is CONFIRMATION-ONLY (filings lag up to ~2 business days
 * and are often priced in). Never arm on Form 4 alone — primary = OPTIONS_FLOW or MOMENTUM.
 */
export const STOCK_PRINTER_LAWS: string[] = [
  'Primary triggers only: OPTIONS_FLOW_LONG/SHORT (Yahoo public options) or MOMENTUM_* — never Form 4 alone.',
  'OPTIONS_FLOW: put/call lean + unusual volume must agree with side; tape not collapsing against the lean.',
  // CONFIRMATION-ONLY — see Form 4 lag / priced-in note above.
  'Form 4 / EDGAR is complementary confirmation only (public filings). Age >3 trading days → reject as fresh thesis.',
  'SEC 13F holdings are structurally lagged background context (up to 45+ days after quarter-end); never arm a ticket from 13F.',
  'MOMENTUM_LONG/SHORT: |24h| ≥ 2.5% with R:R ≥ 1.5 — prefer when public options lean agrees.',
  'No arm if bankruptcy / investigation / halt language on the ticker.',
  'Edge ≥ 65 (historical hit-rate display-only until n≥30).',
  'Yahoo options source must be fresh (stale = fail closed for OPTIONS_FLOW).',
  'Hard stop · risk ≤0.75% equity · scale 50% at T1 · scrap if options/filing thesis dies.',
  'Portfolio caps apply (max armed / aggregate / correlation bucket).',
  'Waiting is allowed — cash beats a weak equity ticket.',
]

export type DeskAsset = 'crypto' | 'stock'

/**
 * Bump ONLY on a deliberate, logged rule-set change that should reset hit-rate history.
 * Threshold tweaks (edge 68→70, etc.) must NOT bump this — they keep the same lawSet id.
 * Current: v1 — post Fix-pass-1 confirmation-only Form4 + fail-closed freshness.
 */
export const LAW_SET_VERSION = 1

/** Stable history key — not derived from live threshold numbers. */
export function lawSetId(asset: DeskAsset): string {
  const base = asset === 'stock' ? 'STOCK_PRINTER_LAWS' : 'MONEY_PRINTER_LAWS'
  return `${base}:v${LAW_SET_VERSION}`
}
