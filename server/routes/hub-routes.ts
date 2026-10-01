import type { Connect } from 'vite'
import { listAutomationFailures, readAutomationFailure } from '../automation-failures.js'
import { getHubSummary, stopHubModule } from '../hub-summary.js'
import { readJsonBody, sendJson } from '../middleware/http.js'
import { dismissAlert, dismissAllAlerts, listAlerts } from '../alerts.js'

export function attachHubRoutes(middlewares: Connect.Server) {
  middlewares.use('/api/alerts', async (req, res) => {
    if (req.method === 'GET') {
      sendJson(res, 200, { ok: true, alerts: listAlerts() })
      return
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req)
      if (body.action === 'dismiss-all') dismissAllAlerts()
      else if (body.action === 'dismiss') dismissAlert(String(body.id || ''))
      sendJson(res, 200, { ok: true, alerts: listAlerts() })
      return
    }
    sendJson(res, 405, { ok: false, message: 'GET or POST only' })
  })

  middlewares.use('/api/hub-summary', async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    const incoming = (req as { originalUrl?: string }).originalUrl || req.url || '/'
    const url = new URL(incoming, 'http://127.0.0.1')
    if (req.method === 'GET') {
      const scope = url.searchParams.get('scope') === 'all' ? 'all' : 'current'
      sendJson(res, 200, getHubSummary({ scope }))
      return
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req)
      if (body.action === 'stop') {
        const profileId = String(body.profileId || '')
        const moduleId = String(body.moduleId || '')
        if (!profileId || !moduleId) {
          sendJson(res, 400, { ok: false, message: 'profileId and moduleId required' })
          return
        }
        const result = stopHubModule(profileId, moduleId)
        sendJson(res, result.ok ? 200 : 400, result)
        return
      }
      sendJson(res, 400, { ok: false, message: 'Unknown action' })
      return
    }
    sendJson(res, 405, { ok: false, message: 'GET or POST' })
  })
  middlewares.use('/api/automation-failures', async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    if (req.method === 'GET') {
      const module = url.searchParams.get('module') || ''
      const name = url.searchParams.get('name') || ''
      if (module && name) {
        const hit = readAutomationFailure(module, name)
        if (!hit.ok || !hit.buffer) {
          sendJson(res, 404, { ok: false, message: hit.message || 'Not found' })
          return
        }
        res.statusCode = 200
        res.setHeader('Content-Type', 'image/png')
        res.setHeader('Cache-Control', 'no-store')
        res.end(hit.buffer)
        return
      }
      const limit = Math.min(200, Math.max(10, Number(url.searchParams.get('limit') || 80) || 80))
      sendJson(res, 200, { ok: true, failures: listAutomationFailures(limit) })
      return
    }
    sendJson(res, 405, { ok: false, message: 'GET only' })
  })
}
