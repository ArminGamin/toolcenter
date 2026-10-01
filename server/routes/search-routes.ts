import type { Connect } from 'vite'
import { unifiedSearch } from '../unified-search.js'
import { sendJson } from '../middleware/http.js'

export function attachSearchRoutes(middlewares: Connect.Server) {
  middlewares.use('/api/search', async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    if (req.method !== 'GET') {
      sendJson(res, 405, { ok: false, message: 'GET only' })
      return
    }
    try {
      const url = new URL(req.url || '/', 'http://local')
      const q = url.searchParams.get('q') || ''
      const limit = Number(url.searchParams.get('limit') || '24')
      const hits = unifiedSearch(q, limit)
      sendJson(res, 200, { ok: true, q, hits })
    } catch (err) {
      sendJson(res, 500, {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
        hits: [],
      })
    }
  })
}
