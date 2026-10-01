import type { Connect } from 'vite'
import { parseAssistantPrompt } from '../assistant.js'
import { readJsonBody, sendJson } from '../middleware/http.js'

export function attachAssistantRoutes(middlewares: Connect.Server) {
  middlewares.use('/api/assistant', async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, message: 'POST only' })
      return
    }
    try {
      const body = await readJsonBody(req)
      const result = await parseAssistantPrompt({
        prompt: String(body.prompt || ''),
        tools: Array.isArray(body.tools) ? body.tools : [],
      })
      sendJson(res, 200, { ok: true, ...result })
    } catch (err) {
      sendJson(res, 500, {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  })
}
