import {
  abortSeoBlogRun,
  acceptAllSeoBlogDrafts,
  acceptSeoBlogDraft,
  clearSeoBlogRun,
  getSeoBlogSettings,
  getSeoBlogState,
  rejectAllSeoBlogDrafts,
  rejectSeoBlogDraft,
  saveSeoBlogSettings,
  startSeoBlogRun,
  type SeoBlogSettings,
} from '../seoBlog.js'
import type { Connect } from 'vite'
import { readJsonBody, sendJson } from '../middleware/http.js'

export function attachSeoBlogRoutes(middlewares: Connect.Server) {
  middlewares.use('/api/seo-blog', async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    try {
      const incoming = (req as { originalUrl?: string }).originalUrl || req.url || '/'
      const url = new URL(incoming, 'http://127.0.0.1')
      const action = url.searchParams.get('action') || ''

      if (req.method === 'GET') {
        if (action === 'state' || action === 'poll' || action === '') {
          sendJson(res, 200, getSeoBlogState())
          return
        }
        if (action === 'settings') {
          sendJson(res, 200, { ok: true, settings: getSeoBlogSettings() })
          return
        }
        sendJson(res, 400, { ok: false, message: 'Unknown GET action' })
        return
      }

      if (req.method === 'POST') {
        const parsed = await readJsonBody(req)
        if (action === 'settings') {
          sendJson(res, 200, saveSeoBlogSettings(parsed as Partial<SeoBlogSettings>))
          return
        }
        if (action === 'start') {
          const result = startSeoBlogRun({
            settings: parsed.settings as Partial<SeoBlogSettings> | undefined,
          })
          sendJson(res, result.ok ? 200 : 400, result)
          return
        }
        if (action === 'abort') {
          sendJson(res, 200, abortSeoBlogRun())
          return
        }
        if (action === 'clear-run') {
          sendJson(res, 200, clearSeoBlogRun())
          return
        }
        if (action === 'accept') {
          const slug = typeof parsed.slug === 'string' ? parsed.slug : ''
          const result = await acceptSeoBlogDraft(slug)
          sendJson(res, result.ok ? 200 : 400, result)
          return
        }
        if (action === 'reject') {
          const slug = typeof parsed.slug === 'string' ? parsed.slug : ''
          const result = rejectSeoBlogDraft(slug)
          sendJson(res, result.ok ? 200 : 400, result)
          return
        }
        if (action === 'accept-all') {
          const result = await acceptAllSeoBlogDrafts()
          sendJson(res, result.ok ? 200 : 400, result)
          return
        }
        if (action === 'reject-all') {
          const result = rejectAllSeoBlogDrafts()
          sendJson(res, result.ok ? 200 : 400, result)
          return
        }
        sendJson(res, 400, { ok: false, message: 'Unknown POST action' })
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
