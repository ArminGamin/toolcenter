import type { DeskAsset, DeskBoard, DeskSignal } from './types.js'
import { buildCryptoDeskSignals } from './build-crypto.js'
import { buildStockDeskSignals } from './build-stock.js'

export * from './types.js'
export { evaluateStrictRules } from './rules-crypto.js'
export { evaluateStockStrictRules, fetchYahooAtr } from './rules-stock.js'
export { buildDirective } from './directive.js'

const deskCacheByAsset = new Map<
  DeskAsset,
  { at: number; payload: Awaited<ReturnType<typeof buildDeskSignals>> }
>()
const deskInFlightByAsset = new Map<
  DeskAsset,
  Promise<Awaited<ReturnType<typeof buildDeskSignals>>>
>()
const DESK_CACHE_MS = 7_000

export async function buildDeskSignals(opts?: {
  asset?: DeskAsset
  force?: boolean
}): Promise<{
  ok: boolean
  signals: DeskSignal[]
  board: DeskBoard
  disclaimer: string
  at: string
  asset: DeskAsset
}> {
  const asset: DeskAsset = opts?.asset === 'stock' ? 'stock' : 'crypto'
  const force = opts?.force ?? false
  if (force) deskCacheByAsset.delete(asset)
  const cached = deskCacheByAsset.get(asset)
  if (!force && cached && Date.now() - cached.at < DESK_CACHE_MS) return cached.payload
  const inFlight = !force ? deskInFlightByAsset.get(asset) : undefined
  if (inFlight) return inFlight

  const build =
    asset === 'stock' ? () => buildStockDeskSignals(force) : () => buildCryptoDeskSignals(force)
  const pending = build()
  deskInFlightByAsset.set(asset, pending)
  try {
    const payload = await pending
    deskCacheByAsset.set(asset, { at: Date.now(), payload })
    return payload
  } finally {
    deskInFlightByAsset.delete(asset)
  }
}
