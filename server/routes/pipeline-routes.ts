import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect } from 'vite'
import {
  exportPipelineSegment,
  getPipeline,
  getPipelineSummary,
  importFromOutreach,
  savePipeline,
  type PipelineExportSegment,
} from '../pipeline.js'
import { readJsonBody, sendJson } from '../middleware/http.js'

const SEGMENTS: PipelineExportSegment[] = ['engaged', 'replied', 'due-today', 'active']

export async function pipelineApiMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }
  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    const action = url.searchParams.get('action')

    if (req.method === 'GET') {
      if (action === 'export') {
        const segment = url.searchParams.get('segment') || 'active'
        const picked = SEGMENTS.includes(segment as PipelineExportSegment)
          ? (segment as PipelineExportSegment)
          : 'active'
        const result = exportPipelineSegment(picked)
        res.statusCode = 200
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.setHeader('X-CC-Count', String(result.count))
        res.end(result.text)
        return
      }
      sendJson(res, 200, {
        ok: true,
        data: getPipeline(),
        summary: getPipelineSummary(),
      })
      return
    }

    if (req.method === 'POST') {
      const parsed = await readJsonBody(req)
      if (parsed.action === 'import-outreach') {
        const result = importFromOutreach()
        sendJson(res, 200, {
          ok: result.ok,
          message: result.message,
          added: result.added,
          skipped: result.skipped,
          data: result.data,
          summary: getPipelineSummary(),
        })
        return
      }
      const result = savePipeline({
        contacts: Array.isArray(parsed.contacts) ? parsed.contacts : [],
      })
      sendJson(res, 200, {
        ...result,
        summary: getPipelineSummary(),
      })
      return
    }

    sendJson(res, 405, { ok: false, message: 'GET or POST only' })
  } catch (err) {
    sendJson(res, 500, {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    })
  }
}

/** Mount on the launch middleware stack (call from launch.ts, not only via attach). */
export function attachPipelineRoutes(middlewares: Connect.Server) {
  middlewares.use('/api/pipeline', pipelineApiMiddleware)
}
