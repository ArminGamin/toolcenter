/**
 * Outcome log for armed desk tickets.
 * successPct shown to users MUST come from this log — never invent win rates.
 * Heuristic edge→odds formulas remain internal only (see markets-desk.ts heuristicOdds).
 *
 * Needs ~N weeks of live armed tickets before rates mean anything.
 * Display threshold: MIN_N = 30 samples in the lookback window.
 */

import fs from 'node:fs'
import { currentProfileDataDir, profileDataPath } from './business-profiles.js'

const outcomesFile = () => profileDataPath('desk-outcomes.jsonl')
export const MIN_HISTORY_N = 30
export const HISTORY_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000

export type DeskOutcomeStatus =
  | 'open'
  | 'hit_t1'
  | 'hit_t2'
  | 'stopped'
  | 'expired'
  | 'laws_flipped'
  | 'unresolved'

export type DeskOutcomeRow = {
  id: string
  armedAt: string
  asset: 'crypto' | 'stock'
  symbol: string
  side: 'long' | 'short'
  play: string
  lawSet: string
  edgeScore: number
  heuristicOdds: number
  entry: number | null
  stop: number | null
  target1: number | null
  target2: number | null
  riskPct: number | null
  rulesSnapshot: { id: string; pass: boolean; label: string }[]
  status: DeskOutcomeStatus
  resolvedAt?: string
  resolveNote?: string
  lastPrice?: number | null
}

function ensureDir() {
  fs.mkdirSync(currentProfileDataDir(), { recursive: true })
}

function readAll(): DeskOutcomeRow[] {
  ensureDir()
  if (!fs.existsSync(outcomesFile())) return []
  const text = fs.readFileSync(outcomesFile(), 'utf8')
  const rows: DeskOutcomeRow[] = []
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t) continue
    try {
      rows.push(JSON.parse(t) as DeskOutcomeRow)
    } catch {
      /* skip bad line */
    }
  }
  return rows
}

function rewriteAll(rows: DeskOutcomeRow[]) {
  ensureDir()
  const body = rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '')
  fs.writeFileSync(outcomesFile(), body, 'utf8')
}

/** Log a newly armed ticket (idempotent per id). */
export function logArmedTicket(row: Omit<DeskOutcomeRow, 'status'> & { status?: DeskOutcomeStatus }): void {
  ensureDir()
  const existing = readAll()
  if (existing.some((r) => r.id === row.id && r.status === 'open')) return
  // Allow re-arm after resolve with new id suffix — skip exact open dupes only
  if (existing.some((r) => r.id === row.id && !r.resolvedAt)) return
  const full: DeskOutcomeRow = { ...row, status: row.status || 'open' }
  fs.appendFileSync(outcomesFile(), JSON.stringify(full) + '\n', 'utf8')
}

export function listOpenOutcomes(): DeskOutcomeRow[] {
  return readAll().filter((r) => r.status === 'open')
}

/** Recent armed tickets for the desk's lightweight track-record view. */
export function listRecentOutcomes(
  asset: 'crypto' | 'stock',
  limit = 12,
): DeskOutcomeRow[] {
  return readAll()
    .filter((row) => row.asset === asset)
    .sort((a, b) => Date.parse(b.armedAt) - Date.parse(a.armedAt))
    .slice(0, limit)
}

/** Count all armed rows for the current asset without fabricating a sample size. */
export function countArmedOutcomes(asset: 'crypto' | 'stock'): number {
  return readAll().filter((row) => row.asset === asset).length
}

export function updateOutcome(
  id: string,
  patch: Partial<Pick<DeskOutcomeRow, 'status' | 'resolvedAt' | 'resolveNote' | 'lastPrice'>>,
): boolean {
  const rows = readAll()
  const i = rows.findIndex((r) => r.id === id)
  if (i < 0) return false
  rows[i] = { ...rows[i], ...patch }
  rewriteAll(rows)
  return true
}

export type HitRateResult = {
  /** null when n < MIN_HISTORY_N — UI must not show a fake % */
  ratePct: number | null
  n: number
  wins: number
  label: string
  lookbackDays: number
}

function isWin(status: DeskOutcomeStatus): boolean {
  return status === 'hit_t1' || status === 'hit_t2'
}

function isResolvedLoss(status: DeskOutcomeStatus): boolean {
  return status === 'stopped' || status === 'expired' || status === 'laws_flipped'
}

/**
 * Historical hit rate for tickets that armed under the same law-set.
 * Only counts resolved rows in the lookback window.
 */
export function queryHitRate(opts: {
  asset: 'crypto' | 'stock'
  lawSet: string
  now?: number
}): HitRateResult {
  const now = opts.now ?? Date.now()
  const since = now - HISTORY_LOOKBACK_MS
  const rows = readAll().filter((r) => {
    if (r.asset !== opts.asset) return false
    if (r.lawSet !== opts.lawSet) return false
    const t = Date.parse(r.armedAt)
    if (!Number.isFinite(t) || t < since) return false
    return isWin(r.status) || isResolvedLoss(r.status)
  })
  const wins = rows.filter((r) => isWin(r.status)).length
  const n = rows.length
  const lookbackDays = Math.round(HISTORY_LOOKBACK_MS / (24 * 60 * 60 * 1000))
  if (n < MIN_HISTORY_N) {
    return {
      ratePct: null,
      n,
      wins,
      lookbackDays,
      label: `Not enough history yet (n=${n}, need ≥${MIN_HISTORY_N})`,
    }
  }
  const ratePct = Math.round((wins / n) * 100)
  return {
    ratePct,
    n,
    wins,
    lookbackDays,
    label: `Historical hit rate: ${ratePct}% (n=${n}, last ${lookbackDays} days)`,
  }
}

/**
 * Resolve open tickets against a current price map.
 * Call from desk build / quotes refresh — does not invent history.
 */
export function resolveOpenOutcomes(
  prices: Map<string, number>,
  now = Date.now(),
): { resolved: number } {
  const rows = readAll()
  let resolved = 0
  const MAX_OPEN_MS = 7 * 24 * 60 * 60 * 1000
  for (const row of rows) {
    if (row.status !== 'open') continue
    const px = prices.get(row.symbol.toUpperCase())
    if (px == null || !Number.isFinite(px)) continue
    row.lastPrice = px
    const armedMs = Date.parse(row.armedAt)
    if (row.side === 'long') {
      if (row.stop != null && px <= row.stop) {
        row.status = 'stopped'
        row.resolvedAt = new Date(now).toISOString()
        row.resolveNote = `price ${px} ≤ stop ${row.stop}`
        resolved++
        continue
      }
      if (row.target2 != null && px >= row.target2) {
        row.status = 'hit_t2'
        row.resolvedAt = new Date(now).toISOString()
        row.resolveNote = `price ${px} ≥ T2 ${row.target2}`
        resolved++
        continue
      }
      if (row.target1 != null && px >= row.target1) {
        row.status = 'hit_t1'
        row.resolvedAt = new Date(now).toISOString()
        row.resolveNote = `price ${px} ≥ T1 ${row.target1}`
        resolved++
        continue
      }
    } else {
      if (row.stop != null && px >= row.stop) {
        row.status = 'stopped'
        row.resolvedAt = new Date(now).toISOString()
        row.resolveNote = `price ${px} ≥ stop ${row.stop}`
        resolved++
        continue
      }
      if (row.target2 != null && px <= row.target2) {
        row.status = 'hit_t2'
        row.resolvedAt = new Date(now).toISOString()
        row.resolveNote = `price ${px} ≤ T2 ${row.target2}`
        resolved++
        continue
      }
      if (row.target1 != null && px <= row.target1) {
        row.status = 'hit_t1'
        row.resolvedAt = new Date(now).toISOString()
        row.resolveNote = `price ${px} ≤ T1 ${row.target1}`
        resolved++
        continue
      }
    }
    if (Number.isFinite(armedMs) && now - armedMs > MAX_OPEN_MS) {
      row.status = 'expired'
      row.resolvedAt = new Date(now).toISOString()
      row.resolveNote = 'open >7d without T1/stop'
      resolved++
    }
  }
  if (resolved > 0) rewriteAll(rows)
  return { resolved }
}

export function readDeskOutcomes(limit = 500): DeskOutcomeRow[] {
  const rows = readAll()
  return rows.slice(-Math.max(1, limit))
}

export function exportDeskOutcomesCsv(): string {
  const rows = readAll()
  const header =
    'id,armedAt,asset,symbol,side,play,lawSet,edgeScore,status,resolvedAt,entry,stop,target1,target2,resolveNote'
  const lines = rows.map((r) =>
    [
      r.id,
      r.armedAt,
      r.asset,
      r.symbol,
      r.side,
      JSON.stringify(r.play),
      r.lawSet,
      r.edgeScore,
      r.status,
      r.resolvedAt || '',
      r.entry ?? '',
      r.stop ?? '',
      r.target1 ?? '',
      r.target2 ?? '',
      JSON.stringify(r.resolveNote || ''),
    ].join(','),
  )
  return [header, ...lines].join('\n')
}
