import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  getMarketsConfig,
  type Quote,
  type WatchSymbol,
} from './markets.js'

type SseClient = {
  res: ServerResponse
  alive: boolean
}

type DayState = {
  open: number
  changePct: number
}

const sseClients = new Set<SseClient>()
const liveById = new Map<string, Quote>()
const dayByPair = new Map<string, DayState>()
const pairToIds = new Map<string, string[]>() // BINANCE PAIR -> watchlist ids

let ws: WebSocket | null = null
let wsKey = ''
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let stockTimer: ReturnType<typeof setInterval> | null = null
let started = false

function binancePair(s: WatchSymbol): string {
  if (s.binance) return s.binance.toUpperCase()
  if (s.tv.startsWith('BINANCE:')) return s.tv.slice(8).toUpperCase()
  return `${s.symbol}USD`.toUpperCase()
}

function broadcast(payload: unknown) {
  const line = `data: ${JSON.stringify(payload)}\n\n`
  for (const client of sseClients) {
    if (!client.alive) continue
    try {
      client.res.write(line)
    } catch {
      client.alive = false
    }
  }
  for (const client of [...sseClients]) {
    if (!client.alive) {
      sseClients.delete(client)
      try {
        client.res.end()
      } catch {
        /* ignore */
      }
    }
  }
}

function snapshot(): Quote[] {
  const cfg = getMarketsConfig()
  return cfg.symbols.map((s) => {
    const live = liveById.get(s.id)
    return (
      live || {
        id: s.id,
        symbol: s.symbol,
        label: s.label,
        kind: s.kind,
        price: null,
        changePct: null,
        tv: s.tv,
        source: s.kind === 'crypto' ? 'Binance' : 'Yahoo',
      }
    )
  })
}

function pushSnapshot() {
  broadcast({ type: 'quotes', quotes: snapshot(), at: Date.now() })
}

function prevChange(ids: string[]): number | null {
  for (const id of ids) {
    const c = liveById.get(id)?.changePct
    if (c != null) return c
  }
  return null
}

function applyTrade(pair: string, price: number) {
  const ids = pairToIds.get(pair) || pairToIds.get(pair.replace(/USD$/, 'USDT')) || []
  if (!ids.length) return

  const day =
    dayByPair.get(pair) ||
    dayByPair.get(pair.replace(/USDT$/, 'USD')) ||
    dayByPair.get(pair.replace(/USD$/, 'USDT'))
  const changePct =
    day && day.open > 0
      ? ((price - day.open) / day.open) * 100
      : prevChange(ids)

  let changed = false
  for (const id of ids) {
    const prev = liveById.get(id)
    if (!prev) continue
    if (prev.price === price && prev.changePct === changePct) continue
    liveById.set(id, {
      ...prev,
      price,
      changePct,
      source: 'Binance live',
    })
    changed = true
  }
  if (changed) {
    // Push only the hot symbols for minimal payload / max speed
    broadcast({
      type: 'tick',
      at: Date.now(),
      updates: ids.map((id) => liveById.get(id)).filter(Boolean),
    })
  }
}

async function seedDayStats(pairs: string[]) {
  await Promise.all(
    pairs.map(async (pair) => {
      const tryPairs = pair.endsWith('USD') && !pair.endsWith('USDT')
        ? [pair, pair.replace(/USD$/, 'USDT')]
        : [pair, pair.replace(/USDT$/, 'USD')]
      for (const p of tryPairs) {
        try {
          const res = await fetch(
            `https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(p)}`,
            { signal: AbortSignal.timeout(5000) },
          )
          if (!res.ok) continue
          const data = (await res.json()) as {
            lastPrice?: string
            openPrice?: string
            priceChangePercent?: string
          }
          const price = Number(data.lastPrice)
          const open = Number(data.openPrice)
          const changePct = Number(data.priceChangePercent)
          if (!Number.isFinite(price)) continue
          dayByPair.set(p, {
            open: Number.isFinite(open) && open > 0 ? open : price,
            changePct: Number.isFinite(changePct) ? changePct : 0,
          })
          // Seed live prices for all ids mapped to this family
          const ids =
            pairToIds.get(pair) ||
            pairToIds.get(p) ||
            pairToIds.get(p.replace(/USDT$/, 'USD')) ||
            []
          for (const id of ids) {
            const prev = liveById.get(id)
            if (!prev) continue
            liveById.set(id, {
              ...prev,
              price,
              changePct: Number.isFinite(changePct) ? changePct : prev.changePct,
              source: 'Binance live',
            })
          }
          return
        } catch {
          /* next */
        }
      }
    }),
  )
}

async function seedStocks(symbols: WatchSymbol[]) {
  const stocks = symbols.filter((s) => s.kind === 'stock')
  await Promise.all(
    stocks.map(async (s) => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s.yahoo)}?interval=1m&range=1d`
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 ToolsAI-ControlCenter' },
          signal: AbortSignal.timeout(6000),
        })
        if (!res.ok) return
        const data = (await res.json()) as {
          chart?: {
            result?: Array<{
              meta?: { regularMarketPrice?: number; previousClose?: number; chartPreviousClose?: number }
            }>
          }
        }
        const meta = data.chart?.result?.[0]?.meta
        const price = meta?.regularMarketPrice
        if (typeof price !== 'number') return
        const prev = meta?.previousClose ?? meta?.chartPreviousClose
        const changePct =
          typeof prev === 'number' && prev !== 0 ? ((price - prev) / prev) * 100 : null
        liveById.set(s.id, {
          id: s.id,
          symbol: s.symbol,
          label: s.label,
          kind: 'stock',
          price,
          changePct,
          tv: s.tv,
          source: 'Yahoo',
        })
      } catch {
        /* ignore */
      }
    }),
  )
}

function closeWs() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (ws) {
    try {
      ws.onclose = null
      ws.close()
    } catch {
      /* ignore */
    }
    ws = null
  }
  wsKey = ''
}

function connectBinance(pairs: string[]) {
  closeWs()
  if (!pairs.length) return

  // Prefer USD; also subscribe USDT fallbacks so we never miss ticks
  const streams: string[] = []
  for (const p of pairs) {
    const lower = p.toLowerCase()
    streams.push(`${lower}@trade`)
    if (lower.endsWith('usd') && !lower.endsWith('usdt')) {
      streams.push(`${lower.replace(/usd$/, 'usdt')}@trade`)
    }
  }
  const unique = [...new Set(streams)]
  const key = unique.sort().join(',')
  if (key === wsKey && ws && ws.readyState === WebSocket.OPEN) return
  wsKey = key

  const url = `wss://stream.binance.com:9443/stream?streams=${unique.join('/')}`
  const socket = new WebSocket(url)
  ws = socket

  socket.onmessage = (ev) => {
    try {
      const raw = typeof ev.data === 'string' ? ev.data : String(ev.data)
      const msg = JSON.parse(raw) as {
        stream?: string
        data?: { s?: string; p?: string; e?: string }
      }
      const data = msg.data
      if (!data?.s || !data.p) return
      const price = Number(data.p)
      if (!Number.isFinite(price)) return
      applyTrade(data.s.toUpperCase(), price)
    } catch {
      /* ignore bad frames */
    }
  }

  socket.onclose = () => {
    if (ws === socket) ws = null
    reconnectTimer = setTimeout(() => {
      rebuildStreams()
    }, 800)
  }

  socket.onerror = () => {
    try {
      socket.close()
    } catch {
      /* ignore */
    }
  }
}

export async function rebuildStreams() {
  const cfg = getMarketsConfig()
  pairToIds.clear()
  liveById.clear()

  for (const s of cfg.symbols) {
    liveById.set(s.id, {
      id: s.id,
      symbol: s.symbol,
      label: s.label,
      kind: s.kind,
      price: null,
      changePct: null,
      tv: s.tv,
      source: s.kind === 'crypto' ? 'Binance live' : 'Yahoo',
    })
    if (s.kind === 'crypto') {
      const pair = binancePair(s)
      const list = pairToIds.get(pair) || []
      list.push(s.id)
      pairToIds.set(pair, list)
      // Also map USDT twin so either stream updates the card
      const twin = pair.endsWith('USDT') ? pair.replace(/USDT$/, 'USD') : `${pair.replace(/USD$/, '')}USDT`
      if (twin !== pair) {
        const t = pairToIds.get(twin) || []
        t.push(s.id)
        pairToIds.set(twin, t)
      }
    }
  }

  const cryptoPairs = [...new Set(
    cfg.symbols.filter((s) => s.kind === 'crypto').map(binancePair),
  )]

  await seedDayStats(cryptoPairs)
  await seedStocks(cfg.symbols)
  pushSnapshot()
  connectBinance(cryptoPairs)

  if (stockTimer) clearInterval(stockTimer)
  stockTimer = setInterval(() => {
    void seedStocks(getMarketsConfig().symbols).then(() => pushSnapshot())
  }, 15_000)
}

export function ensureMarketsLive() {
  if (started) return
  started = true
  void rebuildStreams()
}

export function attachMarketsSse(_req: IncomingMessage, res: ServerResponse) {
  ensureMarketsLive()

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.write(': connected\n\n')

  const client: SseClient = { res, alive: true }
  sseClients.add(client)

  // Immediate snapshot
  try {
    res.write(`data: ${JSON.stringify({ type: 'quotes', quotes: snapshot(), at: Date.now() })}\n\n`)
  } catch {
    client.alive = false
  }

  // Keepalive comments so proxies don't drop the stream
  const ping = setInterval(() => {
    if (!client.alive) {
      clearInterval(ping)
      return
    }
    try {
      res.write(`: ping ${Date.now()}\n\n`)
    } catch {
      client.alive = false
      clearInterval(ping)
      sseClients.delete(client)
    }
  }, 20000)

  const onClose = () => {
    client.alive = false
    clearInterval(ping)
    sseClients.delete(client)
  }
  _req.on('close', onClose)
  _req.on('error', onClose)
}

export function notifyWatchlistChanged() {
  void rebuildStreams()
}
