import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { Connect } from 'vite'
import {
    businessProfileFromHeader,
    createBusinessProfile,
    currentBusinessProfile,
    deleteBusinessProfile,
    listBusinessProfiles,
    renameBusinessProfile,
    runWithBusinessProfile
} from './business-profiles.js'
import { getOrCreateApiToken, requireApiToken } from './cc-auth.js'
import {
    createBackup,
    fireNotify,
    loadVault,
    saveVault,
    VAULT_FIELDS,
} from './cc-services.js'
import { createDiagnosticPack } from './diagnostic-pack.js'
import {
    appendConsole,
    clearConsole,
    ensureToolPath,
    getConsole,
    resolvePython,
    spawnEnvForTool,
    trackChild
} from './launch-runtime.js'
import { EBOOK, LAUNCH_CATALOG, listOllamaModels, ollamaExePath, resolveOllamaModel, runOllamaPull, startOllama } from './launch/ollama.js'
import { getToolSettings, loadProfile, readProfiles, saveProfile, saveToolSettings, writeProfiles } from './launch/tool-settings.js'
import { getRuntimeStatus, launchToolById, openFolderById, openPathOnDisk, stopAllTools, stopToolById } from './launch/tools-runtime.js'
import { getAllSourceHealth } from './markets-health.js'
import { ensureMarketsLive } from './markets-live.js'
import { getId, readJsonBody, sendJson } from './middleware/http.js'
import { attachAssistantRoutes } from './routes/assistant-routes.js'
import { attachGroupPosterRoutes } from './routes/group-poster-routes.js'
import { attachHubRoutes } from './routes/hub-routes.js'
import { attachMarketsRoutes } from './routes/markets-routes.js'
import { attachMediaEmbedRoutes } from './routes/media-embed-routes.js'
import { attachPathsRoutes } from './routes/paths-routes.js'
import { attachNotesRoutes } from './routes/notes-routes.js'
import { attachOneShotRoutes } from './routes/one-shot-routes.js'
import { attachOutreachRoutes } from './routes/outreach-routes.js'
import { pipelineApiMiddleware } from './routes/pipeline-routes.js'
import { attachRedditCommenterRoutes } from './routes/reddit-commenter-routes.js'
import { attachSearchRoutes } from './routes/search-routes.js'
import { attachSeoBlogRoutes } from './routes/seo-blog-routes.js'
import { attachUgcSlidesRoutes } from './routes/ugc-slides-routes.js'
import {
    clearRunErrors,
    deleteRunError,
    getRunError,
    listRunErrors,
} from './run-errors.js'
import { getAllToolReadiness } from './tool-readiness.js'
export { getToolSettings, loadProfile, saveProfile, saveToolSettings } from './launch/tool-settings.js'
export { getRuntimeStatus, launchToolById, openFolderById, openPathOnDisk, stopAllTools, stopToolById } from './launch/tools-runtime.js'

export { clearConsole, getConsole } from './launch-runtime.js'
export { LAUNCH_CATALOG, listOllamaModels, resolveOllamaPullModels, runOllamaPull, startOllama } from './launch/ollama.js'

export function runOllamaModel(model?: string): { ok: boolean; message: string } {
  const tool = LAUNCH_CATALOG.find((t) => t.id === 'ollama')
  const selected = resolveOllamaModel(model)
  const env = tool ? spawnEnvForTool(tool) : { ...process.env }
  try {
    const exe = ollamaExePath()
    const child = spawn(
      'cmd.exe',
      ['/c', 'start', '""', 'cmd.exe', '/k', `"${exe.replace(/"/g, '')}" run ${selected}`],
      {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
        env,
      },
    )
    child.unref()
    appendConsole('ollama', `ollama run ${selected}`, 'sys')
    fireNotify('Ollama run', selected, 'ok', 'ollama')
    return { ok: true, message: `ollama run ${selected}` }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    fireNotify('Ollama run failed', message, 'err', 'ollama')
    return { ok: false, message }
  }
}

export function runToolAction(
  id: string,
  action: string,
  extra?: { model?: string },
): { ok: boolean; message: string } {
  if (action === 'ollama_start') return startOllama(extra?.model)
  if (action === 'ollama_pull') return runOllamaPull(extra?.model)
  if (action === 'ollama_run') return runOllamaModel(extra?.model)
  if (action === 'ollama_setup') {
    const script = path.join(EBOOK, 'scripts', 'setup_ollama.py')
    if (!fs.existsSync(script)) return { ok: false, message: 'setup_ollama.py not found' }
    const py = resolvePython(EBOOK)
    const tool = LAUNCH_CATALOG.find((t) => t.id === 'ollama')
    const child = spawn(py, [script], {
      cwd: EBOOK,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: false,
      env: tool ? spawnEnvForTool(tool) : process.env,
    })
    trackChild('ollama', child, 'setup_ollama.py', { sideJob: true })
    fireNotify('Ollama setup', 'setup_ollama.py', 'info', 'ollama')
    return { ok: true, message: 'Running setup_ollama.py' }
  }

  const tool = LAUNCH_CATALOG.find((t) => t.id === id)
  if (!tool) return { ok: false, message: `Unknown tool: ${id}` }
  if (!fs.existsSync(tool.path)) return { ok: false, message: `Folder missing: ${tool.path}` }

  const py = resolvePython(tool.path)
  const commands: Record<string, string[]> = {
    fetch_seeds: ['scripts/fetch_internet_recipe_seeds.py'],
    build_db: [
      'build_recipe_database.py',
      '--target',
      '5400',
      '--drafter',
      'template',
      '--workers',
      '4',
    ],
    build_report: ['build_recipe_database.py', '--report'],
    strict_readiness: ['build_recipe_database.py', '--strict-readiness'],
  }

  const args = commands[action]
  if (!args) return { ok: false, message: `Unknown action: ${action}` }

  try {
    const child = spawn(py, args, {
      cwd: tool.path,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: false,
      env: spawnEnvForTool(tool),
    })
    trackChild(id, child, `python ${args.join(' ')}`)
    fireNotify(`Action · ${id}`, action, 'info', id)
    return { ok: true, message: `Started: python ${args.join(' ')}` }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    fireNotify(`Action failed · ${id}`, message, 'err', id)
    return { ok: false, message }
  }
}

export function listProfiles(id: string): {
  ok: boolean
  message?: string
  profiles?: { name: string; updatedAt: string }[]
} {
  const tool = LAUNCH_CATALOG.find((t) => t.id === id)
  if (!tool) return { ok: false, message: 'Unknown tool' }
  if (!ensureToolPath(tool)) {
    return { ok: false, message: `Folder missing: ${tool.path}` }
  }
  const data = readProfiles(tool.path, tool.id)
  return {
    ok: true,
    profiles: data.profiles.map((p) => ({ name: p.name, updatedAt: p.updatedAt })),
  }
}

export function deleteProfile(id: string, name: string): { ok: boolean; message: string } {
  const tool = LAUNCH_CATALOG.find((t) => t.id === id)
  if (!tool) return { ok: false, message: 'Unknown tool' }
  const data = readProfiles(tool.path, tool.id)
  const before = data.profiles.length
  data.profiles = data.profiles.filter((p) => p.name.toLowerCase() !== name.trim().toLowerCase())
  if (data.profiles.length === before) return { ok: false, message: `Profile “${name}” not found` }
  writeProfiles(tool.path, data, tool.id)
  return { ok: true, message: `Deleted “${name}”` }
}




export function attachLaunchMiddleware(middlewares: Connect.Server) {
  ensureMarketsLive()
  // Ensure API token exists (encrypted vault) before serving
  getOrCreateApiToken()

  // Gate mutating /api/* + sensitive GETs (vault/settings/profiles)
  middlewares.use((req, res, next) => {
    const url = req.url || ''
    if (!url.startsWith('/api/')) {
      next()
      return
    }
    if (!requireApiToken(req, res)) return
    next()
  })

  middlewares.use('/api/business-profiles', async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    try {
      if (req.method === 'GET') {
        sendJson(res, 200, { ok: true, profiles: listBusinessProfiles() })
        return
      }
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, message: 'GET or POST only' })
        return
      }
      const parsed = await readJsonBody(req)
      const action = String(parsed.action || '')
      if (action === 'create') {
        const profile = createBusinessProfile(String(parsed.name || ''))
        sendJson(res, 201, { ok: true, profile, profiles: listBusinessProfiles() })
        return
      }
      if (action === 'rename') {
        const profile = renameBusinessProfile(String(parsed.id || ''), String(parsed.name || ''))
        sendJson(res, 200, { ok: true, profile, profiles: listBusinessProfiles() })
        return
      }
      if (action === 'delete') {
        const result = deleteBusinessProfile(String(parsed.id || ''))
        sendJson(res, 200, {
          ok: true,
          deleted: result.deleted,
          recoverable: true,
          profiles: listBusinessProfiles(),
        })
        return
      }
      sendJson(res, 400, { ok: false, message: 'action must be create|rename|delete' })
    } catch (err) {
      sendJson(res, 400, {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  })

  middlewares.use('/api', (req, res, next) => {
    try {
      const queryProfile = new URL(req.url || '/', 'http://localhost').searchParams.get('profile')
      const profile = businessProfileFromHeader(req.headers['x-cc-profile'] || queryProfile)
      res.setHeader('X-CC-Profile', profile.id)
      runWithBusinessProfile(profile.id, next)
    } catch (err) {
      sendJson(res, 400, {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  })

  middlewares.use('/api/health', (_req, res) => {
    sendJson(res, 200, {
      ok: true,
      tools: LAUNCH_CATALOG.length,
      profile: currentBusinessProfile(),
    })
  })

  middlewares.use('/api/source-health', (_req, res) => {
    sendJson(res, 200, { ok: true, sources: getAllSourceHealth() })
  })

  middlewares.use('/api/runtime-status', async (_req, res) => {
    try {
      const status = await getRuntimeStatus()
      sendJson(res, 200, { ok: true, ...status })
    } catch (err) {
      sendJson(res, 500, {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  })

  middlewares.use('/api/readiness', (_req, res) => {
    const tools = getAllToolReadiness(LAUNCH_CATALOG)
    sendJson(res, 200, {
      ok: true,
      ready: tools.filter((tool) => tool.ready).length,
      total: tools.length,
      tools,
    })
  })

  middlewares.use('/api/diagnostic-pack', (_req, res) => {
    const body = createDiagnosticPack(getAllToolReadiness(LAUNCH_CATALOG))
    res.setHeader('Content-Disposition', `attachment; filename="toolsai-diagnostics-${Date.now()}.json"`)
    sendJson(res, 200, body)
  })

  attachHubRoutes(middlewares)
  attachAssistantRoutes(middlewares)
  attachNotesRoutes(middlewares)
  attachSearchRoutes(middlewares)
  middlewares.use('/api/pipeline', pipelineApiMiddleware)
  attachMarketsRoutes(middlewares)
  attachOutreachRoutes(middlewares)
  attachSeoBlogRoutes(middlewares)
  attachGroupPosterRoutes(middlewares)
  attachRedditCommenterRoutes(middlewares)
  attachUgcSlidesRoutes(middlewares)
  attachOneShotRoutes(middlewares)
  attachMediaEmbedRoutes(middlewares)
  attachPathsRoutes(middlewares)

  middlewares.use('/api/launch', async (req, res) => {
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
      const parsed = await readJsonBody(req)
      const result = launchToolById(getId(req, parsed), typeof parsed.optionId === 'string' ? parsed.optionId : undefined)
      sendJson(res, result.ok ? 200 : 400, result)
    } catch {
      sendJson(res, 400, { ok: false, message: 'Invalid JSON' })
    }
  })

  middlewares.use('/api/open-folder', async (req, res) => {
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
      const parsed = await readJsonBody(req)
      if (typeof parsed.path === 'string' && parsed.path.trim()) {
        const result = openPathOnDisk(parsed.path.trim())
        sendJson(res, result.ok ? 200 : 400, result)
        return
      }
      const which = parsed.which === 'output' ? 'output' : 'tool'
      const result = openFolderById(getId(req, parsed), {
        which,
        optionId: typeof parsed.optionId === 'string' ? parsed.optionId : undefined,
      })
      sendJson(res, result.ok ? 200 : 400, result)
    } catch {
      sendJson(res, 400, { ok: false, message: 'Invalid JSON' })
    }
  })

  middlewares.use('/api/action', async (req, res) => {
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
      const parsed = await readJsonBody(req)
      const id = getId(req, parsed)
      const action = String(parsed.action || '')
      const model = typeof parsed.model === 'string' ? parsed.model : undefined
      const result = runToolAction(id, action, { model })
      sendJson(res, result.ok ? 200 : 400, result)
    } catch {
      sendJson(res, 400, { ok: false, message: 'Invalid JSON' })
    }
  })

  middlewares.use('/api/settings', async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    try {
      if (req.method === 'GET') {
        const id = getId(req, {})
        const result = getToolSettings(id)
        sendJson(res, result.ok ? 200 : 400, result)
        return
      }
      if (req.method === 'POST') {
        const parsed = await readJsonBody(req)
        const id = getId(req, parsed)
        const values = (parsed.values || {}) as Record<string, string>
        const assets = (parsed.assets || {}) as Record<string, string>
        const result = saveToolSettings(id, values, assets)
        sendJson(res, result.ok ? 200 : 400, result)
        return
      }
      sendJson(res, 405, { ok: false, message: 'GET or POST only' })
    } catch {
      sendJson(res, 400, { ok: false, message: 'Invalid request' })
    }
  })

  middlewares.use('/api/profiles', async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    try {
      if (req.method === 'GET') {
        const id = getId(req, {})
        const result = listProfiles(id)
        sendJson(res, result.ok ? 200 : 400, result)
        return
      }
      if (req.method === 'POST') {
        const parsed = await readJsonBody(req)
        const id = getId(req, parsed)
        const action = String(parsed.action || '')
        const name = String(parsed.name || '')
        if (action === 'save') {
          const result = saveProfile(
            id,
            name,
            (parsed.settings || {}) as Record<string, string>,
            (parsed.assets || {}) as Record<string, string>,
          )
          sendJson(res, result.ok ? 200 : 400, result)
          return
        }
        if (action === 'load') {
          const result = loadProfile(id, name)
          sendJson(res, result.ok ? 200 : 400, result)
          return
        }
        if (action === 'delete') {
          const result = deleteProfile(id, name)
          sendJson(res, result.ok ? 200 : 400, result)
          return
        }
        sendJson(res, 400, { ok: false, message: 'action must be save|load|delete' })
        return
      }
      sendJson(res, 405, { ok: false, message: 'GET or POST only' })
    } catch {
      sendJson(res, 400, { ok: false, message: 'Invalid request' })
    }
  })

  middlewares.use('/api/ollama-models', async (_req, res) => {
    try {
      const result = await listOllamaModels()
      sendJson(res, result.ok ? 200 : 503, result)
    } catch (err) {
      sendJson(res, 500, {
        ok: false,
        models: [],
        message: err instanceof Error ? err.message : String(err),
      })
    }
  })

  middlewares.use('/api/stop', async (req, res) => {
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
      const parsed = await readJsonBody(req)
      const result = await stopToolById(getId(req, parsed))
      sendJson(res, result.ok ? 200 : 400, result)
    } catch {
      sendJson(res, 400, { ok: false, message: 'Invalid JSON' })
    }
  })

  middlewares.use('/api/stop-all', async (req, res) => {
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
      const result = await stopAllTools()
      sendJson(res, 200, result)
    } catch (err) {
      sendJson(res, 500, {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  })

  middlewares.use('/api/console', async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    try {
      if (req.method === 'GET') {
        const id = getId(req, {})
        sendJson(res, 200, getConsole(id))
        return
      }
      if (req.method === 'POST') {
        const parsed = await readJsonBody(req)
        const id = getId(req, parsed)
        const action = String(parsed.action || 'clear')
        if (action === 'clear') {
          sendJson(res, 200, clearConsole(id))
          return
        }
        sendJson(res, 400, { ok: false, message: 'Unknown console action' })
        return
      }
      sendJson(res, 405, { ok: false, message: 'GET or POST only' })
    } catch {
      sendJson(res, 400, { ok: false, message: 'Invalid request' })
    }
  })

  middlewares.use('/api/run-errors', async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    try {
      if (req.method === 'GET') {
        const url = new URL(req.url || '/', 'http://127.0.0.1')
        const id = url.searchParams.get('id') || ''
        if (id) {
          sendJson(res, 200, getRunError(id))
          return
        }
        sendJson(res, 200, { ok: true, errors: listRunErrors() })
        return
      }
      if (req.method === 'POST') {
        const parsed = await readJsonBody(req)
        const action = String(parsed.action || '')
        if (action === 'clear') {
          sendJson(res, 200, clearRunErrors())
          return
        }
        if (action === 'delete') {
          sendJson(res, 200, deleteRunError(String(parsed.id || '')))
          return
        }
        sendJson(res, 400, { ok: false, message: 'Unknown run-errors action' })
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

  middlewares.use('/api/vault', async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    try {
      if (req.method === 'GET') {
        const values = { ...loadVault() }
        delete values.CC_API_TOKEN
        delete values.OUTREACH_SECRETS
        sendJson(res, 200, { ok: true, values, fields: VAULT_FIELDS })
        return
      }
      if (req.method === 'POST') {
        const parsed = await readJsonBody(req)
        const values = (parsed.values || {}) as Record<string, string>
        const result = saveVault(values)
        if (result.ok) fireNotify('Vault updated', 'Shared secrets saved', 'info')
        sendJson(res, result.ok ? 200 : 400, result)
        return
      }
      sendJson(res, 405, { ok: false, message: 'GET or POST only' })
    } catch {
      sendJson(res, 400, { ok: false, message: 'Invalid request' })
    }
  })

  middlewares.use('/api/backup', async (req, res) => {
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
      const result = await createBackup()
      sendJson(res, result.ok ? 200 : 400, result)
    } catch (err) {
      sendJson(res, 500, {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  })

}
