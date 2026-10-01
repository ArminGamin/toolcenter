/**
 * Portfolio-level arm caps — correlation buckets + real stop-weighted risk.
 * Config: D:\toolsai\.control-center-data\desk-portfolio.json
 *
 * accountEquityUsd is optional (null until user sets it in Markets → Watchlist).
 * maxAggregateRiskPct default stays 2.0 — NOT auto-retuned when risk math changed.
 *
 * BEHAVIOR CHANGE (Fix 8): riskContribution is no longer a flat 0.75.
 * It scales with stop distance (% of price) × intended equity risk from sizeHint.
 */

import fs from 'node:fs'
import { currentProfileDataDir, profileDataPath } from './business-profiles.js'

export type CorrelationBucket =
  | 'l1_majors'
  | 'alt_l1'
  | 'meme'
  | 'mega_tech'
  | 'index_etf'
  | 'other'

/**
 * Reference stop distance (% of price). A ticket with stop = REF_STOP_PCT and
 * equity risk target E contributes exactly E to the budget.
 * Wider stops scale linearly: contribution = E * (stopPct / REF_STOP_PCT).
 */
export const REF_STOP_PCT = 1.0

/** Standard intended equity risk used only when desk copy supplies a valid value. */
export const DEFAULT_EQUITY_RISK_PCT = 0.75
/**
 * Fail-closed charge for a missing or malformed sizeHint. It deliberately matches
 * the unknown-stop penalty so an unverifiable risk budget cannot arm a ticket.
 */
export const UNPARSEABLE_SIZE_HINT_EQUITY_RISK_PCT = DEFAULT_EQUITY_RISK_PCT * 10

export type PortfolioRiskConfig = {
  maxArmed: number
  /**
   * Max sum of riskContribution across concurrently armed tickets.
   * Default 2.0 kept from prior pass — with stop-scaled risk, wide-stop tickets
   * burn this faster. Do not quietly retune; user calibrates.
   */
  maxAggregateRiskPct: number
  maxPerBucket: number
  buckets: Record<string, CorrelationBucket>
  /** Optional account equity USD — null until user sets it. No invented default. */
  accountEquityUsd: number | null
}

const portfolioFile = () => profileDataPath('desk-portfolio.json')

const DEFAULT_BUCKETS: Record<string, CorrelationBucket> = {
  BTC: 'l1_majors',
  ETH: 'l1_majors',
  SOL: 'alt_l1',
  AVAX: 'alt_l1',
  BNB: 'alt_l1',
  XRP: 'alt_l1',
  DOGE: 'meme',
  NVDA: 'mega_tech',
  AAPL: 'mega_tech',
  MSFT: 'mega_tech',
  AMZN: 'mega_tech',
  META: 'mega_tech',
  GOOGL: 'mega_tech',
  TSLA: 'mega_tech',
  SPY: 'index_etf',
  QQQ: 'index_etf',
}

export const DEFAULT_PORTFOLIO_CONFIG: PortfolioRiskConfig = {
  maxArmed: 3,
  maxAggregateRiskPct: 2.0,
  maxPerBucket: 1,
  buckets: { ...DEFAULT_BUCKETS },
  accountEquityUsd: null,
}

export function loadPortfolioConfig(): PortfolioRiskConfig {
  try {
    if (!fs.existsSync(portfolioFile())) {
      fs.mkdirSync(currentProfileDataDir(), { recursive: true })
      fs.writeFileSync(portfolioFile(), JSON.stringify(DEFAULT_PORTFOLIO_CONFIG, null, 2), 'utf8')
      return { ...DEFAULT_PORTFOLIO_CONFIG, buckets: { ...DEFAULT_BUCKETS } }
    }
    const parsed = JSON.parse(fs.readFileSync(portfolioFile(), 'utf8')) as Partial<PortfolioRiskConfig>
    return {
      maxArmed:
        typeof parsed.maxArmed === 'number' ? parsed.maxArmed : DEFAULT_PORTFOLIO_CONFIG.maxArmed,
      maxAggregateRiskPct:
        typeof parsed.maxAggregateRiskPct === 'number'
          ? parsed.maxAggregateRiskPct
          : DEFAULT_PORTFOLIO_CONFIG.maxAggregateRiskPct,
      maxPerBucket:
        typeof parsed.maxPerBucket === 'number'
          ? parsed.maxPerBucket
          : DEFAULT_PORTFOLIO_CONFIG.maxPerBucket,
      buckets: { ...DEFAULT_BUCKETS, ...(parsed.buckets || {}) },
      accountEquityUsd:
        typeof parsed.accountEquityUsd === 'number' &&
        Number.isFinite(parsed.accountEquityUsd) &&
        parsed.accountEquityUsd > 0
          ? parsed.accountEquityUsd
          : null,
    }
  } catch {
    return { ...DEFAULT_PORTFOLIO_CONFIG, buckets: { ...DEFAULT_BUCKETS } }
  }
}

export function savePortfolioConfig(
  patch: Partial<PortfolioRiskConfig>,
): { ok: boolean; message: string; config: PortfolioRiskConfig } {
  const current = loadPortfolioConfig()
  const next: PortfolioRiskConfig = {
    ...current,
    ...patch,
    buckets: patch.buckets ? { ...current.buckets, ...patch.buckets } : current.buckets,
  }
  if (patch.accountEquityUsd !== undefined) {
    next.accountEquityUsd =
      typeof patch.accountEquityUsd === 'number' &&
      Number.isFinite(patch.accountEquityUsd) &&
      patch.accountEquityUsd > 0
        ? patch.accountEquityUsd
        : null
  }
  fs.mkdirSync(currentProfileDataDir(), { recursive: true })
  fs.writeFileSync(portfolioFile(), JSON.stringify(next, null, 2), 'utf8')
  return { ok: true, message: 'Portfolio settings saved', config: next }
}

export function bucketForSymbol(symbol: string, cfg = loadPortfolioConfig()): CorrelationBucket {
  return cfg.buckets[symbol.toUpperCase()] || 'other'
}

export type ArmedCandidate = {
  symbol: string
  riskPct: number | null
  riskContribution: number
}

/**
 * Parse intended equity risk % from sizeHint text, e.g. "0.5–0.75% equity" → 0.75
 * (use the upper bound when a range is given — conservative budget spend).
 */
export function parseEquityRiskPctFromSizeHint(sizeHint: string | null | undefined): number {
  if (!sizeHint) return UNPARSEABLE_SIZE_HINT_EQUITY_RISK_PCT
  const range = sizeHint.match(/(\d+(?:\.\d+)?)\s*[–—-]\s*(\d+(?:\.\d+)?)\s*%/)
  if (range) {
    const a = Number(range[1])
    const b = Number(range[2])
    if (Number.isFinite(a) && Number.isFinite(b)) return Math.max(a, b)
  }
  const single = sizeHint.match(/(\d+(?:\.\d+)?)\s*%\s*equity/i)
  if (single) {
    const n = Number(single[1])
    if (Number.isFinite(n) && n > 0) return n
  }
  return UNPARSEABLE_SIZE_HINT_EQUITY_RISK_PCT
}

/**
 * Real portfolio risk contribution (% of equity budget).
 *
 * Formula:
 *   riskContribution = equityRiskPct × (stopDistancePct / REF_STOP_PCT)
 *
 * - stopDistancePct = playbook.riskPct (stop as % of entry price) — already on ticket
 * - equityRiskPct = intended equity risk parsed from sizeHint
 * - missing/malformed sizeHint → 7.5% fail-closed charge (not the 0.75% desk target)
 * - REF_STOP_PCT = 1.0 so a 1% stop + 0.75% equity risk → contribution 0.75
 *
 * Meaning: we budget as if position size were set for a 1% stop; a wider stop
 * with the same equity-risk *intent* either implies a smaller size OR (if size
 * is not shrunk) more capital at risk — we charge the wider stop more so the
 * cap measures stop risk, not ticket count.
 *
 * If stop distance unknown → fail closed with a large contribution (blocks arming
 * via portfolio check when used); callers should usually not arm without a stop.
 */
export function riskContributionFromPlaybook(playbook: {
  riskPct: number | null
  sizeHint?: string
  side?: string
}): number {
  if (playbook.side === 'flat') return 0
  const stopPct = playbook.riskPct
  if (stopPct == null || !Number.isFinite(stopPct) || stopPct <= 0) {
    // Fail closed: unknown stop burns the whole default budget alone
    return DEFAULT_EQUITY_RISK_PCT * 10
  }
  const equityRiskPct = parseEquityRiskPctFromSizeHint(playbook.sizeHint)
  return equityRiskPct * (stopPct / REF_STOP_PCT)
}

export function portfolioArmBlockReason(
  alreadyArmed: ArmedCandidate[],
  next: ArmedCandidate,
  cfg = loadPortfolioConfig(),
): string | null {
  if (alreadyArmed.length >= cfg.maxArmed) {
    return `Would exceed max armed tickets (${cfg.maxArmed})`
  }
  const nextRisk = next.riskContribution
  const agg = alreadyArmed.reduce((s, a) => s + a.riskContribution, 0) + nextRisk
  if (agg > cfg.maxAggregateRiskPct + 1e-9) {
    const usdNote =
      cfg.accountEquityUsd != null
        ? ` (~$${Math.round((agg / 100) * cfg.accountEquityUsd)} of $${Math.round(cfg.accountEquityUsd)})`
        : ''
    return `Would exceed aggregate risk cap (${agg.toFixed(2)}% > ${cfg.maxAggregateRiskPct}%${usdNote})`
  }
  const bucket = bucketForSymbol(next.symbol, cfg)
  const sameBucket = alreadyArmed.filter((a) => bucketForSymbol(a.symbol, cfg) === bucket)
  if (sameBucket.length >= cfg.maxPerBucket) {
    return `Would exceed correlated-${bucket.replace(/_/g, '-')} exposure cap (max ${cfg.maxPerBucket})`
  }
  return null
}

/** Aggregate risk summary for desk UI */
export function formatAggregateRiskDisplay(
  contributions: number[],
  cfg = loadPortfolioConfig(),
): {
  aggregateRiskPct: number
  aggregateRiskUsd: number | null
  accountEquityUsd: number | null
  label: string
  needsAccountSize: boolean
} {
  const aggregateRiskPct = contributions.reduce((a, b) => a + b, 0)
  const accountEquityUsd = cfg.accountEquityUsd
  const aggregateRiskUsd =
    accountEquityUsd != null ? (aggregateRiskPct / 100) * accountEquityUsd : null
  if (accountEquityUsd == null) {
    return {
      aggregateRiskPct,
      aggregateRiskUsd: null,
      accountEquityUsd: null,
      needsAccountSize: true,
      label:
        aggregateRiskPct > 0
          ? `Aggregate risk: ${aggregateRiskPct.toFixed(2)}% of equity budget (set account size for $)`
          : 'Aggregate risk: 0% — set account size in Markets → Watchlist for dollar caps',
    }
  }
  return {
    aggregateRiskPct,
    aggregateRiskUsd,
    accountEquityUsd,
    needsAccountSize: false,
    label: `Aggregate risk: ${aggregateRiskPct.toFixed(2)}% (~$${Math.round(aggregateRiskUsd!)} of $${Math.round(accountEquityUsd)})`,
  }
}
