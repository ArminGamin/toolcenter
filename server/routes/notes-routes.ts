import type { Connect } from 'vite'
import { getNotes, saveNotes } from '../notes.js'
import { readJsonBody, sendJson } from '../middleware/http.js'

export function attachNotesRoutes(middlewares: Connect.Server) {
  middlewares.use('/api/notes', async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    try {
      if (req.method === 'GET') {
        sendJson(res, 200, {
          ok: true,
          data: getNotes(),
        })
        return
      }
      if (req.method === 'POST') {
        const parsed = await readJsonBody(req)
        sendJson(res, 200, saveNotes({
          notes: Array.isArray(parsed.notes) ? parsed.notes : [],
          folders: Array.isArray(parsed.folders) ? parsed.folders : [],
        }))
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
