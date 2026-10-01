import type { Connect } from 'vite'
import { readJsonBody, sendJson } from '../middleware/http.js'
import {
  encodeOneShotStillToMp4,
  generateOneShotBatch,
  generateOneShotPost,
  getOneShotOllamaStatus,
  loadOneShotDiscordSettings,
  publishOneShotToDiscord,
  saveOneShotBatchToDisk,
  type SaveOneShotPost,
} from '../one-shot.js'
import {
  getOneShotThemePoolStatus,
  resetUsedOneShotThemes,
} from '../one-shot-theme-pool.js'

export function attachOneShotRoutes(middlewares: Connect.Server) {
  middlewares.use('/api/one-shot', async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    try {
      const url = new URL(req.url || '/', 'http://local')
      const action = url.searchParams.get('action') || ''

      if (req.method === 'GET' && action === 'theme-pool-status') {
        const category = url.searchParams.get('category') || undefined
        sendJson(res, 200, { ok: true, status: getOneShotThemePoolStatus(category) })
        return
      }

      if (req.method === 'GET' && action === 'ollama-status') {
        sendJson(res, 200, { ok: true, status: await getOneShotOllamaStatus() })
        return
      }

      if (req.method === 'POST' && action === 'reset-used-themes') {
        sendJson(res, 200, resetUsedOneShotThemes())
        return
      }

      if (req.method === 'POST' && action === 'encode-video') {
        const body = await readJsonBody(req)
        const pngBase64 = typeof body.pngBase64 === 'string' ? body.pngBase64 : ''
        const result = encodeOneShotStillToMp4(pngBase64)
        sendJson(res, result.ok ? 200 : 400, result)
        return
      }

      if (req.method === 'POST' && action === 'generate') {
        const body = await readJsonBody(req)
        const result = await generateOneShotPost({
          category: typeof body.category === 'string' ? body.category : undefined,
          topic: typeof body.topic === 'string' ? body.topic : undefined,
          voice: typeof body.voice === 'string' ? body.voice : undefined,
        })
        sendJson(res, result.ok ? 200 : 400, result)
        return
      }

      if (req.method === 'POST' && action === 'generate-batch') {
        const body = await readJsonBody(req)
        const count = Number(body.count)
        const result = await generateOneShotBatch({
          count: Number.isFinite(count) ? count : 5,
          category: typeof body.category === 'string' ? body.category : undefined,
          topic: typeof body.topic === 'string' ? body.topic : undefined,
          voice: typeof body.voice === 'string' ? body.voice : undefined,
        })
        sendJson(res, result.ok ? 200 : 400, result)
        return
      }

      if (req.method === 'POST' && action === 'save-batch') {
        const body = await readJsonBody(req)
        const posts = Array.isArray(body.posts) ? (body.posts as SaveOneShotPost[]) : []
        const result = saveOneShotBatchToDisk(
          posts,
          typeof body.outputRoot === 'string' ? body.outputRoot : undefined,
          typeof body.batchDir === 'string' ? body.batchDir : undefined,
        )
        sendJson(res, result.ok ? 200 : 400, result)
        return
      }

      if (req.method === 'GET' && action === 'discord-settings') {
        sendJson(res, 200, { ok: true, settings: loadOneShotDiscordSettings() })
        return
      }

      if (req.method === 'POST' && action === 'publish-discord') {
        const body = await readJsonBody(req)
        const result = await publishOneShotToDiscord({
          caption: typeof body.caption === 'string' ? body.caption : '',
          text: typeof body.text === 'string' ? body.text : '',
          videoBase64: typeof body.videoBase64 === 'string' ? body.videoBase64 : undefined,
          videoExt: typeof body.videoExt === 'string' ? body.videoExt : undefined,
          pngBase64: typeof body.pngBase64 === 'string' ? body.pngBase64 : undefined,
          filename: typeof body.filename === 'string' ? body.filename : undefined,
          guildId: typeof body.guildId === 'string' ? body.guildId : undefined,
          categoryId: typeof body.categoryId === 'string' ? body.categoryId : undefined,
          token: typeof body.token === 'string' ? body.token : undefined,
        })
        sendJson(res, result.ok ? 200 : 400, result)
        return
      }

      sendJson(res, 405, { ok: false, message: 'Unsupported one-shot action' })
    } catch (err) {
      sendJson(res, 500, {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  })
}
