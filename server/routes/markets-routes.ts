
import type { Connect } from 'vite'
import {
  fetchLiveHistory,
  fetchMarketNews,
  fetchMarketQuotes,
  getMarketsConfig,
  listMarketPresets,
  saveMarketsConfig,
  type MarketsConfig,
  type WatchSymbol,
} from '../markets.js'
import { buildDeskSignals } from '../markets-desk.js'
import { getAllSourceHealth } from '../markets-health.js'
import { loadPortfolioConfig, savePortfolioConfig } from '../markets-portfolio.js'
import { attachMarketsSse, notifyWatchlistChanged } from '../markets-live.js'
import { exportDeskOutcomesCsv } from '../markets-outcomes.js'
import { readJsonBody, sendJson } from '../middleware/http.js'

export function attachMarketsRoutes(middlewares: Connect.Server) {
  middlewares.use('/api/markets/stream', (req, res) => {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    if (req.method !== 'GET') {
      sendJson(res, 405, { ok: false, message: 'GET only' })
      return
    }
    attachMarketsSse(req, res)
  })

  middlewares.use('/api/markets', async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1')
      // When mounted at /api/markets, req.url is the remainder (e.g. /stream?…)
      if (url.pathname === '/stream' || url.pathname.endsWith('/stream')) {
        attachMarketsSse(req, res)
        return
      }
      const action = url.searchParams.get('action') || ''

      if (req.method === 'GET') {
        if (action === 'quotes') {
          sendJson(res, 200, await fetchMarketQuotes())
          return
        }
        if (action === 'history') {
          const minutes = Number(url.searchParams.get('window'))
          const force = url.searchParams.get('force') === 'true'
          sendJson(res, 200, await fetchLiveHistory(minutes, { force }))
          return
        }
        if (action === 'news') {
          const force = url.searchParams.get('force') === 'true'
          const result = await fetchMarketNews({ force })
          sendJson(res, result.ok ? 200 : 502, result)
          return
        }
        if (action === 'desk') {
          const assetParam = (url.searchParams.get('asset') || 'crypto').toLowerCase()
          const asset = assetParam === 'stock' || assetParam === 'stocks' ? 'stock' : 'crypto'
          const force = url.searchParams.get('force') === 'true'
          const result = await buildDeskSignals({ asset, force })
          sendJson(res, 200, { ...result, sourceHealth: getAllSourceHealth() })
          return
        }
        if (action === 'source-health') {
          sendJson(res, 200, { ok: true, sources: getAllSourceHealth() })
          return
        }
        if (action === 'presets') {
          sendJson(res, 200, listMarketPresets())
          return
        }
        if (action === 'portfolio') {
          sendJson(res, 200, { ok: true, config: loadPortfolioConfig() })
          return
        }
        if (action === 'outcomes-export') {
          const csv = exportDeskOutcomesCsv()
          res.statusCode = 200
          res.setHeader('Content-Type', 'text/csv; charset=utf-8')
          res.setHeader('Content-Disposition', 'attachment; filename="desk-outcomes.csv"')
          res.end(csv)
          return
        }
        sendJson(res, 200, { ok: true, config: getMarketsConfig() })
        return
      }

      if (req.method === 'POST') {
        const parsed = await readJsonBody(req)
        if (parsed.action === 'portfolio') {
          const equityRaw = parsed.accountEquityUsd
          const accountEquityUsd =
            equityRaw === null || equityRaw === '' || equityRaw === undefined
              ? null
              : Number(equityRaw)
          const result = savePortfolioConfig({
            accountEquityUsd:
              accountEquityUsd != null && Number.isFinite(accountEquityUsd) && accountEquityUsd > 0
                ? accountEquityUsd
                : null,
            ...(typeof parsed.maxArmed === 'number' ? { maxArmed: parsed.maxArmed } : {}),
            ...(typeof parsed.maxAggregateRiskPct === 'number'
              ? { maxAggregateRiskPct: parsed.maxAggregateRiskPct }
              : {}),
            ...(typeof parsed.maxPerBucket === 'number' ? { maxPerBucket: parsed.maxPerBucket } : {}),
          })
          sendJson(res, 200, result)
          return
        }
        const config = {
          symbols: (parsed.symbols || []) as WatchSymbol[],
          alertPct: Number(parsed.alertPct) || 3,
          discordAlerts: parsed.discordAlerts !== false,
        } satisfies MarketsConfig
        const result = saveMarketsConfig(config)
        notifyWatchlistChanged()
        sendJson(res, 200, result)
        return
      }

      sendJson(res, 405, { ok: false, message: 'GET or POST only' })
    } catch (err) {
      sendJson(res, 500, {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  })
}
