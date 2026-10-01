/**
 * On-chain whale flow — free public explorers only (no paid whale vendors).
 * Confirmation signal for crypto desk — cannot arm a ticket alone.
 *
 * Sources:
 * - BTC: blockchain.info public JSON (unconfirmed + recent)
 * - ETH: eth.blockscout.com public API (Etherscan-compatible, no key)
 * - BNB: bsc.blockscout.com public API
 * - SOL: Solana public JSON-RPC block scan (native SOL system transfers)
 * - XRP: XRPScan public validated-ledger transaction feed (native XRP Payments)
 * - DOGE: no clean free large-tx feed wired this pass (see self-check)
 *
 * Exchange-internal transfers are tagged and excluded from directional signal.
 */

import fs from 'node:fs'
import { currentProfileDataDir, profileDataPath } from './business-profiles.js'
import { markSourceAttempt, markSourceError, markSourceOk } from './markets-health.js'

export type WhaleLean = 'exchange_deposit' | 'exchange_withdrawal' | 'exchange_internal' | 'p2p_large' | 'unknown'
type WhaleChain = 'btc' | 'eth' | 'bnb' | 'sol' | 'xrp'

export type WhaleTransfer = {
  chain: WhaleChain
  symbol: string
  txid: string
  amount: number
  lean: WhaleLean
  fromLabel: string
  toLabel: string
  /** ISO time if known */
  at: string | null
  note: string
}

export type WhaleSymbolSummary = {
  symbol: string
  chain: WhaleChain | 'unsupported'
  transfers: WhaleTransfer[]
  /** Net directional lean for confirmation: deposit=sell pressure, withdrawal=accumulation */
  lean: 'sell_pressure' | 'accumulation' | 'mixed' | 'noise' | 'n/a'
  /** 0–100 factor score (50 = neutral) — confirmation only */
  score: number
  note: string
  lines: string[]
}

export type WhaleThresholds = Record<string, number>

const configFile = () => profileDataPath('whale-config.json')

/** Documented defaults — configurable via whale-config.json */
export const DEFAULT_WHALE_THRESHOLDS: WhaleThresholds = {
  BTC: 100,
  ETH: 1_000,
  BNB: 5_000,
  // Native-asset units; conservative enough to suppress ordinary wallet activity.
  SOL: 50_000,
  XRP: 1_000_000,
}

/**
 * Curated publicly documented exchange / custody hot+cold wallets.
 * Sources: explorer labels, exchange proof-of-reserves disclosures, community lists.
 * Not exhaustive — unknown↔unknown large txs stay p2p_large (weaker signal).
 */
const KNOWN_EXCHANGE_WALLETS: Record<string, string> = {
  // —— BTC (lowercase hex / base58 as published) ——
  bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3h: 'Binance',
  '34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo': 'Binance',
  bc1qgdjqv0av3q56jvd82tkdjpy7gdp9ut8tlqmgrpmv24sq90ecnvqqjwvw97: 'Bitfinex',
  '1P5ZEDWTKTFGxQVnn2eSXF2CJZXa9ZGcJy': 'Kraken',
  bc1qjasf9z3h7w3jspkhtga4ky7kmlxpakud2xefqt: 'OKX',
  '3LYJfcfHPXYJreMsASk2jkn69LWEYKzexb': 'Binance',
  '1NDyJtNTjmwk5xPNhjgAUe4vhLc2VvS8Zy': 'Binance',
  bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh: 'Binance',
  // —— ETH ——
  '0x28c6c06298d514db089934071355e5743bf21d60': 'Binance',
  '0x21a31a2a90da25925043eddff1081d5639623d0f': 'Binance',
  '0xf977814e90da44bfa03b6295a0616a897441acec': 'Binance',
  '0xbe0eb53f46cd790cd13851d5eff43d12404d33e8': 'Binance',
  '0xdfd5293d8e347dfe59e90efd55b2956a1343963d': 'Binance',
  '0x56eddb7aa87536c19524de2522c0dad6bb6bfa28': 'Binance',
  '0x9696f59e4d72e237be84ffd425dcad154bf96976': 'Binance',
  '0x4e9ce36e442e55ecd9025b9a6e0d88485d628a67': 'Binance',
  '0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43': 'Coinbase',
  '0x71660c4005ba85c37ccec55d0c4493e66fe775d3': 'Coinbase',
  '0x503828976d22510aad0201ac7ec88293207d0445': 'Coinbase',
  '0xddfabcdc4d8ffc6d5beaf154f18b778f892a0740': 'Coinbase',
  '0x3cd751e6b0078be393132286c442345e5dc49699': 'Coinbase',
  '0xb5d85cbf7cb3ee0d56b3bb207d5fc4b82f43f511': 'Coinbase',
  '0xeb2629a2734e272bcc07bda959863f316f4bd4cf': 'Coinbase',
  '0x2910543af39aba0cd09dbb2d50200b3e800a63d2': 'Kraken',
  '0x0a869d79a7052c7f1b55a8ebabbea3420f0d1e13': 'Kraken',
  '0xe853c56864a2ebe4576a807d26fdc4a0ada51919': 'Kraken',
  '0x267be1c1d684f78cb4f6a176c4911b741e4ffdc0': 'Kraken',
  '0x2faf487a4414fe77e2327f0bf4ae2a264a776ad2': 'FTX (legacy)',
  '0x6cc5f688a315f3dc28a7781717a9a798a59fda7b': 'OKX',
  '0x236f9f97e0e62388479bf9e5ba488809e3787020': 'OKX',
  '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45': 'Uniswap Router',
  // —— BNB (BSC, same 0x often shared by CEX) ——
  '0x8894e0a0c962cb723c1976a4421c95949be2d4e3': 'Binance BSC',
  '0xe2fc31f816a9b94326492132018c3aecc4a93ae1': 'Binance BSC',
  '0x3c783c21a0383057d128bae431894a5c19f9cf86': 'Binance BSC',
  // —— SOL (public explorer-labelled Binance hot wallets) ——
  '2ojv9BAiHUrvsm9gxDe7fJSzbNZSJcxZvf8dqmWGHG8S': 'Binance SOL',
  '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9': 'Binance SOL',
  // —— XRP (XRPScan public labels) ——
  rEy8TFcrAPvhpKrwyrscNYyqBGUkE9hKaJ: 'Binance XRP',
  rwpTh9DDa52XkM9nTKp2QrJuCGV5d1mQVP: 'Coinbase XRP',
}

function normAddr(a: string, chain: WhaleChain): string {
  const t = a.trim()
  if (chain === 'eth' || chain === 'bnb') return t.toLowerCase()
  return t
}

export function labelAddress(addr: string, chain: WhaleChain): string {
  const key = normAddr(addr, chain)
  return KNOWN_EXCHANGE_WALLETS[key] || 'unlabeled'
}

export function isKnownExchange(addr: string, chain: WhaleChain): boolean {
  return labelAddress(addr, chain) !== 'unlabeled'
}

/** Classify transfer for signal value — exchange↔exchange is noise. */
export function classifyWhaleLean(
  from: string,
  to: string,
  chain: WhaleChain,
): WhaleLean {
  const fromEx = isKnownExchange(from, chain)
  const toEx = isKnownExchange(to, chain)
  if (fromEx && toEx) return 'exchange_internal'
  if (!fromEx && toEx) return 'exchange_deposit'
  if (fromEx && !toEx) return 'exchange_withdrawal'
  return 'p2p_large'
}

function classifyWhaleLeanWithLabels(
  from: string,
  to: string,
  chain: WhaleChain,
  fromLabel: string,
  toLabel: string,
): WhaleLean {
  const isExchangeLabel = (label: string) =>
    /\b(binance|coinbase|kraken|okx|bitstamp|uphold|bitfinex|bybit|mexc|gate\.?io|huobi|crypto\.?com|kucoin)\b/i.test(
      label,
    )
  const fromEx = isKnownExchange(from, chain) || isExchangeLabel(fromLabel)
  const toEx = isKnownExchange(to, chain) || isExchangeLabel(toLabel)
  if (fromEx && toEx) return 'exchange_internal'
  if (!fromEx && toEx) return 'exchange_deposit'
  if (fromEx && !toEx) return 'exchange_withdrawal'
  return 'p2p_large'
}

export function loadWhaleThresholds(): WhaleThresholds {
  try {
    if (!fs.existsSync(configFile())) {
      fs.mkdirSync(currentProfileDataDir(), { recursive: true })
      const seed = { thresholds: DEFAULT_WHALE_THRESHOLDS, enabled: true }
      fs.writeFileSync(configFile(), JSON.stringify(seed, null, 2), 'utf8')
      return { ...DEFAULT_WHALE_THRESHOLDS }
    }
    const parsed = JSON.parse(fs.readFileSync(configFile(), 'utf8')) as {
      thresholds?: WhaleThresholds
    }
    return { ...DEFAULT_WHALE_THRESHOLDS, ...(parsed.thresholds || {}) }
  } catch {
    return { ...DEFAULT_WHALE_THRESHOLDS }
  }
}

function scoreFromLean(
  lean: WhaleSymbolSummary['lean'],
  side: 'long' | 'short' | 'flat' | 'fade',
): number {
  if (lean === 'n/a' || lean === 'noise') return 50
  if (lean === 'accumulation') {
    if (side === 'long') return 72
    if (side === 'short' || side === 'fade') return 35
    return 60
  }
  if (lean === 'sell_pressure') {
    if (side === 'short' || side === 'fade') return 74
    if (side === 'long') return 32
    return 40
  }
  return 50
}

function summarizeTransfers(
  symbol: string,
  chain: WhaleChain,
  transfers: WhaleTransfer[],
): WhaleSymbolSummary {
  const directional = transfers.filter((t) => t.lean !== 'exchange_internal')
  const deposits = directional.filter((t) => t.lean === 'exchange_deposit')
  const withdrawals = directional.filter((t) => t.lean === 'exchange_withdrawal')
  const depAmt = deposits.reduce((s, t) => s + t.amount, 0)
  const wAmt = withdrawals.reduce((s, t) => s + t.amount, 0)
  let lean: WhaleSymbolSummary['lean'] = 'n/a'
  if (!directional.length && transfers.some((t) => t.lean === 'exchange_internal')) lean = 'noise'
  else if (!directional.length) lean = 'n/a'
  else if (depAmt > wAmt * 1.25) lean = 'sell_pressure'
  else if (wAmt > depAmt * 1.25) lean = 'accumulation'
  else if (depAmt + wAmt > 0) lean = 'mixed'
  else lean = 'noise'

  const lines = transfers.slice(0, 6).map((t) => {
    const tag =
      t.lean === 'exchange_internal'
        ? 'INTERNAL (excluded)'
        : t.lean === 'exchange_deposit'
          ? 'DEPOSIT→CEX'
          : t.lean === 'exchange_withdrawal'
            ? 'WITHDRAW←CEX'
            : t.lean
    return `${tag} ${t.amount.toFixed(2)} ${symbol} · ${t.fromLabel} → ${t.toLabel}`
  })
  const note =
    lean === 'sell_pressure'
      ? `Whale→exchange deposits ${depAmt.toFixed(1)} ${symbol} (sell-pressure lean, confirmation only)`
      : lean === 'accumulation'
        ? `Exchange→whale withdrawals ${wAmt.toFixed(1)} ${symbol} (accumulation lean, confirmation only)`
        : lean === 'noise'
          ? 'Only exchange-internal large moves (filtered — not directional)'
          : lean === 'mixed'
            ? 'Mixed whale deposit/withdrawal flow'
            : 'No large on-chain whales matched'

  return {
    symbol,
    chain,
    transfers,
    lean,
    score: 50, // filled by caller with side context
    note,
    lines,
  }
}

async function fetchBtcWhales(threshold: number): Promise<WhaleTransfer[]> {
  const out: WhaleTransfer[] = []
  const res = await fetch('https://blockchain.info/unconfirmed-transactions?format=json', {
    headers: { 'User-Agent': 'ToolsAIControlCenter/1.0 (public BTC whale scan)' },
    signal: AbortSignal.timeout(12_000),
  })
  if (!res.ok) throw new Error(`blockchain.info HTTP ${res.status}`)
  const data = (await res.json()) as {
    txs?: Array<{
      hash?: string
      time?: number
      inputs?: Array<{ prev_out?: { addr?: string; value?: number } }>
      out?: Array<{ addr?: string; value?: number }>
    }>
  }
  for (const tx of data.txs || []) {
    const outs = tx.out || []
    const totalBtc = outs.reduce((s, o) => s + (o.value || 0), 0) / 1e8
    if (totalBtc < threshold) continue
    // Dominant output as "to"; first input as "from"
    const topOut = [...outs].sort((a, b) => (b.value || 0) - (a.value || 0))[0]
    const fromAddr = tx.inputs?.[0]?.prev_out?.addr || ''
    const toAddr = topOut?.addr || ''
    if (!fromAddr || !toAddr) continue
    const lean = classifyWhaleLean(fromAddr, toAddr, 'btc')
    const amt = (topOut?.value || 0) / 1e8
    if (amt < threshold * 0.5) continue
    out.push({
      chain: 'btc',
      symbol: 'BTC',
      txid: tx.hash || '',
      amount: amt,
      lean,
      fromLabel: labelAddress(fromAddr, 'btc'),
      toLabel: labelAddress(toAddr, 'btc'),
      at: tx.time ? new Date(tx.time * 1000).toISOString() : null,
      note: lean === 'exchange_internal' ? 'CEX↔CEX rebalance — excluded from signal' : 'large BTC move',
    })
  }
  return out.slice(0, 20)
}

async function fetchEvmWhales(
  chain: 'eth' | 'bnb',
  symbol: string,
  threshold: number,
): Promise<WhaleTransfer[]> {
  const base =
    chain === 'eth' ? 'https://eth.blockscout.com' : 'https://bsc.blockscout.com'
  const res = await fetch(`${base}/api/v2/transactions?filter=validated`, {
    headers: { Accept: 'application/json', 'User-Agent': 'ToolsAIControlCenter/1.0' },
    signal: AbortSignal.timeout(12_000),
  })
  if (!res.ok) throw new Error(`blockscout ${chain} HTTP ${res.status}`)
  const data = (await res.json()) as {
    items?: Array<{
      hash?: string
      timestamp?: string
      value?: string
      from?: { hash?: string }
      to?: { hash?: string }
    }>
  }
  const out: WhaleTransfer[] = []
  // value is wei string
  const threshWei = BigInt(Math.floor(threshold * 1e18))
  for (const tx of data.items || []) {
    if (!tx.value || !tx.from?.hash || !tx.to?.hash) continue
    let wei: bigint
    try {
      wei = BigInt(tx.value)
    } catch {
      continue
    }
    if (wei < threshWei) continue
    const amount = Number(wei) / 1e18
    if (!Number.isFinite(amount) || amount < threshold) continue
    const from = tx.from.hash
    const to = tx.to.hash
    const lean = classifyWhaleLean(from, to, chain)
    out.push({
      chain,
      symbol,
      txid: tx.hash || '',
      amount,
      lean,
      fromLabel: labelAddress(from, chain),
      toLabel: labelAddress(to, chain),
      at: tx.timestamp || null,
      note: lean === 'exchange_internal' ? 'CEX↔CEX rebalance — excluded' : `large ${symbol} move`,
    })
  }
  return out.slice(0, 20)
}

async function solanaRpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch('https://api.mainnet.solana.com', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'ToolsAIControlCenter/1.0' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`Solana RPC HTTP ${res.status}`)
  const body = (await res.json()) as { result?: T; error?: { message?: string } }
  if (body.error || body.result == null) throw new Error(`Solana RPC ${body.error?.message || 'empty result'}`)
  return body.result
}

const SOL_MAX_BLOCKS_PER_POLL = 24
let lastProcessedSolSlot: number | null = null
let lastSolSamplingNote: string | null = null

export type SolSlotBatchPlan = {
  slots: number[]
  skipped: { from: number; to: number; count: number } | null
}

/**
 * Bounds public-RPC load while making any skipped historical range explicit.
 * The first poll samples the current confirmed block; later polls are strictly
 * cursor-based, so a completed slot is never processed again.
 */
export function planSolSlotBatch(
  lastProcessedSlot: number | null,
  currentSlot: number,
  maxBlocks = SOL_MAX_BLOCKS_PER_POLL,
): SolSlotBatchPlan {
  if (lastProcessedSlot == null) return { slots: [currentSlot], skipped: null }
  const firstUnprocessed = lastProcessedSlot + 1
  if (currentSlot < firstUnprocessed) return { slots: [], skipped: null }
  const count = currentSlot - firstUnprocessed + 1
  if (count <= maxBlocks) {
    return {
      slots: Array.from({ length: count }, (_, index) => firstUnprocessed + index),
      skipped: null,
    }
  }
  const start = currentSlot - maxBlocks + 1
  return {
    slots: Array.from({ length: maxBlocks }, (_, index) => start + index),
    skipped: { from: firstUnprocessed, to: start - 1, count: start - firstUnprocessed },
  }
}

type SolBlock = {
  blockTime?: number | null
  transactions?: Array<{
    meta?: { err?: unknown }
    transaction?: {
      signatures?: string[]
      message?: {
        instructions?: Array<{
          program?: string
          parsed?: { type?: string; info?: { source?: string; destination?: string; lamports?: number } }
        }>
      }
    }
  }>
}

async function fetchSolBlockWhales(slot: number, threshold: number): Promise<WhaleTransfer[]> {
  const block = await solanaRpc<SolBlock>('getBlock', [
    slot,
    {
      commitment: 'confirmed',
      encoding: 'jsonParsed',
      transactionDetails: 'full',
      rewards: false,
      maxSupportedTransactionVersion: 0,
    },
  ])
  const out: WhaleTransfer[] = []
  for (const tx of block.transactions || []) {
    if (tx.meta?.err) continue
    for (const ix of tx.transaction?.message?.instructions || []) {
      const info = ix.program === 'system' && ix.parsed?.type === 'transfer' ? ix.parsed.info : null
      if (!info?.source || !info.destination || typeof info.lamports !== 'number') continue
      const amount = info.lamports / 1e9
      if (!Number.isFinite(amount) || amount < threshold) continue
      const fromLabel = labelAddress(info.source, 'sol')
      const toLabel = labelAddress(info.destination, 'sol')
      const lean = classifyWhaleLeanWithLabels(info.source, info.destination, 'sol', fromLabel, toLabel)
      out.push({
        chain: 'sol',
        symbol: 'SOL',
        txid: tx.transaction?.signatures?.[0] || '',
        amount,
        lean,
        fromLabel,
        toLabel,
        at: block.blockTime ? new Date(block.blockTime * 1000).toISOString() : null,
        note: lean === 'exchange_internal' ? 'CEX↔CEX rebalance — excluded' : 'large native SOL transfer',
      })
    }
  }
  return out
}

async function fetchSolWhales(threshold: number): Promise<{ transfers: WhaleTransfer[]; note: string | null }> {
  const currentSlot = await solanaRpc<number>('getSlot', [{ commitment: 'confirmed' }])
  const plan = planSolSlotBatch(lastProcessedSolSlot, currentSlot)
  const transfers: WhaleTransfer[] = []
  let processedThrough = lastProcessedSolSlot
  const notes: string[] = []
  if (plan.skipped) {
    notes.push(
      `SOL sampling gap: skipped ${plan.skipped.count} confirmed slots (${plan.skipped.from}–${plan.skipped.to}) after lag; resumed at ${plan.slots[0]}`,
    )
  }
  for (const slot of plan.slots) {
    try {
      transfers.push(...(await fetchSolBlockWhales(slot, threshold)))
      processedThrough = slot
    } catch (err) {
      notes.push(
        `SOL block ${slot} unavailable; cursor held at ${processedThrough ?? 'initial'} (${err instanceof Error ? err.message : String(err)})`,
      )
      break
    }
  }
  if (processedThrough != null) lastProcessedSolSlot = processedThrough
  lastSolSamplingNote = notes.length
    ? notes.join(' · ')
    : `SOL cursor through confirmed slot ${lastProcessedSolSlot ?? currentSlot} (${plan.slots.length} block${plan.slots.length === 1 ? '' : 's'} scanned)`
  return { transfers: transfers.slice(0, 20), note: lastSolSamplingNote }
}

function xrpAmount(value: unknown): number | null {
  const drops =
    typeof value === 'string' || typeof value === 'number'
      ? Number(value)
      : typeof value === 'object' && value && 'currency' in value && (value as { currency?: string }).currency === 'XRP'
        ? Number((value as { value?: unknown }).value)
        : NaN
  return Number.isFinite(drops) && drops > 0 ? drops / 1e6 : null
}

async function fetchXrpWhales(threshold: number): Promise<WhaleTransfer[]> {
  const res = await fetch('https://api.xrpscan.com/api/v1/ledger/validated/transactions', {
    headers: { Accept: 'application/json', 'User-Agent': 'ToolsAIControlCenter/1.0' },
    signal: AbortSignal.timeout(12_000),
  })
  if (!res.ok) throw new Error(`XRPScan HTTP ${res.status}`)
  const txs = (await res.json()) as Array<{
    Account?: string
    Destination?: string
    Amount?: unknown
    hash?: string
    date?: string
    TransactionType?: string
    meta?: { TransactionResult?: string; delivered_amount?: unknown }
    AccountName?: { name?: string }
    DestinationName?: { name?: string }
  }>
  const out: WhaleTransfer[] = []
  for (const tx of txs) {
    if (
      tx.TransactionType !== 'Payment' ||
      tx.meta?.TransactionResult !== 'tesSUCCESS' ||
      !tx.Account ||
      !tx.Destination
    ) continue
    const amount = xrpAmount(tx.meta.delivered_amount ?? tx.Amount)
    if (amount == null || amount < threshold) continue
    const fromLabel = tx.AccountName?.name || labelAddress(tx.Account, 'xrp')
    const toLabel = tx.DestinationName?.name || labelAddress(tx.Destination, 'xrp')
    const lean = classifyWhaleLeanWithLabels(tx.Account, tx.Destination, 'xrp', fromLabel, toLabel)
    out.push({
      chain: 'xrp',
      symbol: 'XRP',
      txid: tx.hash || '',
      amount,
      lean,
      fromLabel,
      toLabel,
      at: tx.date || null,
      note: lean === 'exchange_internal' ? 'CEX↔CEX rebalance — excluded' : 'large native XRP Payment',
    })
  }
  return out.slice(0, 20)
}

let cache: { at: number; bySym: Map<string, WhaleSymbolSummary> } | null = null

/**
 * Fetch whale summaries for supported chains. SOL follows an in-memory confirmed
 * slot cursor in bounded public-RPC batches; XRP scans XRPScan's latest validated-ledger feed. Both are best-effort,
 * confirmation-only context and have materially thinner labelling/coverage than
 * the existing BTC/EVM feeds.
 */
export async function fetchWhaleSummaries(
  symbols: string[],
  sideForScore: 'long' | 'short' | 'flat' | 'fade' = 'flat',
  opts?: { force?: boolean },
): Promise<Map<string, WhaleSymbolSummary>> {
  const now = Date.now()
  // SOL needs a shorter cache window so its 24-block public-RPC batch can keep
  // up with normal confirmed-slot production without routinely creating gaps.
  const cacheMs = symbols.some((symbol) => symbol.toUpperCase() === 'SOL') ? 8_000 : 45_000
  if (!opts?.force && cache && now - cache.at < cacheMs) {
    // re-score for side
    const mapped = new Map<string, WhaleSymbolSummary>()
    for (const [k, v] of cache.bySym) {
      mapped.set(k, { ...v, score: scoreFromLean(v.lean, sideForScore) })
    }
    return mapped
  }

  markSourceAttempt('onchain_whales')
  const thresholds = loadWhaleThresholds()
  const bySym = new Map<string, WhaleSymbolSummary>()
  const want = new Set(symbols.map((s) => s.toUpperCase()))

  try {
    const jobs: Promise<void>[] = []

    if (want.has('BTC')) {
      jobs.push(
        (async () => {
          const transfers = await fetchBtcWhales(thresholds.BTC ?? 100)
          const sum = summarizeTransfers('BTC', 'btc', transfers)
          sum.score = scoreFromLean(sum.lean, sideForScore)
          bySym.set('BTC', sum)
        })(),
      )
    }
    if (want.has('ETH')) {
      jobs.push(
        (async () => {
          const transfers = await fetchEvmWhales('eth', 'ETH', thresholds.ETH ?? 1000)
          const sum = summarizeTransfers('ETH', 'eth', transfers)
          sum.score = scoreFromLean(sum.lean, sideForScore)
          bySym.set('ETH', sum)
        })(),
      )
    }
    if (want.has('BNB')) {
      jobs.push(
        (async () => {
          const transfers = await fetchEvmWhales('bnb', 'BNB', thresholds.BNB ?? 5000)
          const sum = summarizeTransfers('BNB', 'bnb', transfers)
          sum.score = scoreFromLean(sum.lean, sideForScore)
          bySym.set('BNB', sum)
        })(),
      )
    }
    if (want.has('SOL')) {
      jobs.push(
        (async () => {
          const result = await fetchSolWhales(thresholds.SOL ?? 50_000)
          const sum = summarizeTransfers('SOL', 'sol', result.transfers)
          if (result.note) sum.note = `${sum.note} · ${result.note}`
          sum.score = scoreFromLean(sum.lean, sideForScore)
          bySym.set('SOL', sum)
        })(),
      )
    }
    if (want.has('XRP')) {
      jobs.push(
        (async () => {
          const transfers = await fetchXrpWhales(thresholds.XRP ?? 1_000_000)
          const sum = summarizeTransfers('XRP', 'xrp', transfers)
          sum.score = scoreFromLean(sum.lean, sideForScore)
          bySym.set('XRP', sum)
        })(),
      )
    }

    await Promise.all(jobs)

    for (const sym of want) {
      if (bySym.has(sym)) continue
      bySym.set(sym, {
        symbol: sym,
        chain: 'unsupported',
        transfers: [],
        lean: 'n/a',
        score: 50,
        note: `${sym}: no free on-chain whale feed wired this pass (confirmation n/a)`,
        lines: [],
      })
    }

    if ([...bySym.values()].some((v) => v.chain !== 'unsupported' && v.transfers.length >= 0)) {
      markSourceOk('onchain_whales')
    } else {
      markSourceError('onchain_whales', 'No whale chains returned')
    }
    cache = { at: now, bySym }
    return bySym
  } catch (err) {
    markSourceError('onchain_whales', err instanceof Error ? err.message : String(err))
    for (const sym of want) {
      bySym.set(sym, {
        symbol: sym,
        chain: 'unsupported',
        transfers: [],
        lean: 'n/a',
        score: 50,
        note: `Whale fetch failed: ${err instanceof Error ? err.message : String(err)}`,
        lines: [],
      })
    }
    return bySym
  }
}

/** Unit-test helper examples */
export function exampleClassify(): {
  internal: WhaleLean
  deposit: WhaleLean
  withdrawal: WhaleLean
} {
  return {
    internal: classifyWhaleLean(
      '0x28c6c06298d514db089934071355e5743bf21d60',
      '0xf977814e90da44bfa03b6295a0616a897441acec',
      'eth',
    ),
    deposit: classifyWhaleLean(
      '0x1111111111111111111111111111111111111111',
      '0x28c6c06298d514db089934071355e5743bf21d60',
      'eth',
    ),
    withdrawal: classifyWhaleLean(
      '0x28c6c06298d514db089934071355e5743bf21d60',
      '0x2222222222222222222222222222222222222222',
      'eth',
    ),
  }
}

/** Unit-test helper examples for the SOL/XRP exchange-filtering paths. */
export function exampleClassifySolAndXrp(): {
  sol: { internal: WhaleLean; deposit: WhaleLean; withdrawal: WhaleLean }
  xrp: { internal: WhaleLean; deposit: WhaleLean; withdrawal: WhaleLean }
} {
  const solExchangeA = '2ojv9BAiHUrvsm9gxDe7fJSzbNZSJcxZvf8dqmWGHG8S'
  const solExchangeB = '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9'
  const xrpExchangeA = 'rEy8TFcrAPvhpKrwyrscNYyqBGUkE9hKaJ'
  const xrpExchangeB = 'rwpTh9DDa52XkM9nTKp2QrJuCGV5d1mQVP'
  return {
    sol: {
      internal: classifyWhaleLean(solExchangeA, solExchangeB, 'sol'),
      deposit: classifyWhaleLean('11111111111111111111111111111111', solExchangeA, 'sol'),
      withdrawal: classifyWhaleLean(solExchangeA, 'So11111111111111111111111111111111111111112', 'sol'),
    },
    xrp: {
      internal: classifyWhaleLean(xrpExchangeA, xrpExchangeB, 'xrp'),
      deposit: classifyWhaleLean('rG1QQv2nh2gr7RCZ1P8YYcBUKCCN633jCn', xrpExchangeA, 'xrp'),
      withdrawal: classifyWhaleLean(xrpExchangeA, 'r3kmLJN5D28dHuH8vZNUZpMC43pEHpaocV', 'xrp'),
    },
  }
}
