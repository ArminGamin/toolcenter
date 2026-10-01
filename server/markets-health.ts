/**
 * Per-source fetch health + staleness + structural latency honesty.
 * Laws that depend on a stale *fetch* must fail closed.
 * knownSourceLatency describes underlying data delay — separate from fetch age.
 */

export type SourceId =
  | 'yahoo_options'
  | 'edgar'
  | 'binance_flow'
  | 'okx_leads'
  | 'multi_venue'
  | 'fed_rss'
  | 'sec_rss'
  | 'yahoo_quotes'
  | 'binance_live'
  | 'onchain_whales'
  | 'edgar_13f'

export type SourceHealth = {
  id: SourceId
  label: string
  lastSuccessfulFetch: number | null
  lastAttemptAt: number | null
  lastError: string | null
  lastOk: boolean
  /** ms after which *our fetch* is considered stale for law gating */
  staleAfterMs: number
  /**
   * Static, documented estimate of how delayed the underlying feed is vs the
   * live market / real-world event. Not measured dynamically.
   */
  knownSourceLatency: string
}

const REGISTRY = new Map<SourceId, SourceHealth>()

/**
 * knownSourceLatency notes (honesty):
 * - Yahoo free options/quotes: commonly exchange-delayed ~15–20 min on retail/unofficial
 *   endpoints (data-licensing). Exact delay varies by exchange/agreement — treat as
 *   delayed, not NBBO real-time.
 * - EDGAR Form 4: law allows filing up to 2 business days after the trade.
 * - Binance public WS / futures data endpoints: near real-time for public tape.
 * - OKX copy-lead leaderboard/fills: refresh cadence not contractually documented for
 *   our use — treat as non-real-time until confirmed.
 * - Fed/SEC RSS: publication lag after the underlying event; fetch can be instant
 *   while the story is hours old.
 */
const DEFAULTS: Record<
  SourceId,
  { label: string; staleAfterMs: number; knownSourceLatency: string }
> = {
  yahoo_options: {
    label: 'Yahoo options',
    staleAfterMs: 5 * 60_000,
    knownSourceLatency: '~15–20 min exchange-delayed (free/unofficial tier — not real-time NBBO)',
  },
  edgar: {
    label: 'SEC EDGAR',
    staleAfterMs: 60 * 60_000,
    knownSourceLatency: 'Form 4 may reflect trades up to 2 business days old by law',
  },
  binance_flow: {
    label: 'Binance flow',
    staleAfterMs: 30_000,
    knownSourceLatency: 'Near real-time (public futures data endpoints)',
  },
  okx_leads: {
    label: 'OKX leads',
    staleAfterMs: 5 * 60_000,
    knownSourceLatency: 'Delay unknown — treat as non-real-time until copy-lead refresh cadence confirmed',
  },
  multi_venue: {
    label: 'Multi-venue bias',
    staleAfterMs: 60_000,
    knownSourceLatency: 'Near real-time venue stats (5m bars; not tick-perfect)',
  },
  fed_rss: {
    label: 'Fed RSS',
    staleAfterMs: 60 * 60_000,
    knownSourceLatency: 'Publication lag after the event (minutes–hours typical)',
  },
  sec_rss: {
    label: 'SEC RSS',
    staleAfterMs: 60 * 60_000,
    knownSourceLatency: 'Publication lag; Form 4/8-K timing ≠ trade instant',
  },
  yahoo_quotes: {
    label: 'Yahoo quotes',
    staleAfterMs: 2 * 60_000,
    knownSourceLatency: '~15–20 min exchange-delayed on many free Yahoo equity quotes',
  },
  binance_live: {
    label: 'Binance live',
    staleAfterMs: 15_000,
    knownSourceLatency: 'Near real-time (WebSocket public trades)',
  },
  onchain_whales: {
    label: 'On-chain whales',
    staleAfterMs: 8 * 60_000,
    knownSourceLatency:
      'Explorer API + chain confirmation: typically seconds–few minutes; not tick-perfect. Observed via free Blockscout/blockchain.info.',
  },
  edgar_13f: {
    label: 'SEC 13F',
    staleAfterMs: 24 * 60 * 60_000,
    knownSourceLatency:
      'Structurally lagged — filings due up to 45 days after quarter-end; position data can be ~45–135 days old vs when established. Background context only — never a live signal.',
  },
}

function ensure(id: SourceId): SourceHealth {
  let row = REGISTRY.get(id)
  if (!row) {
    const d = DEFAULTS[id]
    row = {
      id,
      label: d.label,
      lastSuccessfulFetch: null,
      lastAttemptAt: null,
      lastError: null,
      lastOk: false,
      staleAfterMs: d.staleAfterMs,
      knownSourceLatency: d.knownSourceLatency,
    }
    REGISTRY.set(id, row)
  }
  return row
}

export function markSourceAttempt(id: SourceId) {
  const row = ensure(id)
  row.lastAttemptAt = Date.now()
}

export function markSourceOk(id: SourceId) {
  const row = ensure(id)
  const now = Date.now()
  row.lastAttemptAt = now
  row.lastSuccessfulFetch = now
  row.lastError = null
  row.lastOk = true
}

export function markSourceError(id: SourceId, err: string) {
  const row = ensure(id)
  row.lastAttemptAt = Date.now()
  row.lastError = err.slice(0, 240)
  row.lastOk = false
}

export function isSourceStale(id: SourceId, now = Date.now()): boolean {
  const row = ensure(id)
  if (row.lastSuccessfulFetch == null) return true
  return now - row.lastSuccessfulFetch > row.staleAfterMs
}

export function sourceStaleAgeMs(id: SourceId, now = Date.now()): number | null {
  const row = ensure(id)
  if (row.lastSuccessfulFetch == null) return null
  return Math.max(0, now - row.lastSuccessfulFetch)
}

export function sourceStaleReason(id: SourceId, now = Date.now()): string | null {
  if (!isSourceStale(id, now)) return null
  const row = ensure(id)
  if (row.lastSuccessfulFetch == null) {
    return `${row.label} never fetched successfully${row.lastError ? ` (${row.lastError})` : ''}`
  }
  const ageMin = Math.round((now - row.lastSuccessfulFetch) / 60_000)
  return `${row.label} ${ageMin}min stale (limit ${Math.round(row.staleAfterMs / 60_000)}min)`
}

export function getAllSourceHealth(now = Date.now()): Array<
  SourceHealth & {
    stale: boolean
    ageMs: number | null
    reason: string | null
    /** Short chip text: fetch freshness + structural latency */
    chipLabel: string
  }
> {
  const ids = Object.keys(DEFAULTS) as SourceId[]
  return ids.map((id) => {
    const row = ensure(id)
    const stale = isSourceStale(id, now)
    const ageMs = sourceStaleAgeMs(id, now)
    const agePart =
      ageMs == null
        ? 'never fetched'
        : ageMs < 60_000
          ? `fetched ${Math.round(ageMs / 1000)}s ago`
          : `fetched ${Math.round(ageMs / 60_000)}m ago`
    const fetchPart = stale ? `STALE (${agePart})` : `fresh (${agePart})`
    return {
      ...row,
      stale,
      ageMs,
      reason: stale ? sourceStaleReason(id, now) : null,
      chipLabel: `${row.label}: ${fetchPart} · ${row.knownSourceLatency}`,
    }
  })
}

/** For tests / manual simulation */
export function __forceSourceLastOk(id: SourceId, atMs: number | null, err?: string) {
  const row = ensure(id)
  row.lastSuccessfulFetch = atMs
  row.lastAttemptAt = atMs ?? Date.now()
  row.lastOk = atMs != null
  row.lastError = err ?? null
}
