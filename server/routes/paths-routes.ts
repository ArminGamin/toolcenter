import type { Connect } from 'vite'
import { LAUNCH_CATALOG, applyToolPathOverrides, defaultToolPath } from '../launch/catalog.js'
import { readJsonBody, sendJson } from '../middleware/http.js'
import {
  DIR_DEFAULTS,
  dirPath,
  isDirectory,
  setDirPath,
  setToolPathOverride,
  toolPathOverride,
  type DirKey,
} from '../paths-config.js'

function snapshot() {
  return {
    ok: true,
    tools: LAUNCH_CATALOG.map((t) => ({
      id: t.id,
      path: t.path,
      defaultPath: defaultToolPath(t.id) || t.path,
      overridden: Boolean(toolPathOverride(t.id)),
      exists: isDirectory(t.path),
    })),
    dirs: (Object.keys(DIR_DEFAULTS) as DirKey[]).map((key) => {
      const spec = DIR_DEFAULTS[key]
      const current = dirPath(key)
      return {
        key,
        label: spec.label,
        help: spec.help,
        path: current,
        default: spec.default,
        overridden: current !== spec.default,
        envLocked: Boolean(spec.env && process.env[spec.env]?.trim()),
        exists: isDirectory(current),
      }
    }),
  }
}

/** Folder locations for tools and UGC data (More → Folders, tool Settings → Folder). */
export function attachPathsRoutes(middlewares: Connect.Server) {
  middlewares.use('/api/paths', async (req, res) => {
    try {
      if (req.method === 'GET') {
        sendJson(res, 200, snapshot())
        return
      }
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, message: 'GET or POST only' })
        return
      }
      const body = await readJsonBody(req)
      const action = String(body.action || '')
      if (action === 'set-tool' || action === 'reset-tool') {
        const id = String(body.id || '')
        if (!LAUNCH_CATALOG.some((t) => t.id === id)) throw new Error('Unknown tool')
        setToolPathOverride(id, action === 'reset-tool' ? null : String(body.path || ''))
        applyToolPathOverrides()
      } else if (action === 'set-dir' || action === 'reset-dir') {
        setDirPath(String(body.key || '') as DirKey, action === 'reset-dir' ? null : String(body.path || ''))
      } else {
        throw new Error('Unknown action')
      }
      sendJson(res, 200, snapshot())
    } catch (err) {
      sendJson(res, 400, { ok: false, message: err instanceof Error ? err.message : String(err) })
    }
  })
}
