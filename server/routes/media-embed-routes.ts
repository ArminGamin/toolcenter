import type { Connect } from 'vite'
import { spawn, type ChildProcess } from 'node:child_process'
import { requireApiToken } from '../cc-auth.js'
import { sendJson } from '../middleware/http.js'
import { resolvePython } from '../launch-runtime.js'

/**
 * Runs the Video Metadata Stripper, Picture Metadata Stripper and Discord Video Drop Python backends
 * headless (no browser tab) and proxies their APIs so the Tool Center can
 * show them as in-app panels. Processing logic stays in the original tools.
 */

type Backend = {
  id: 'stripper' | 'discord' | 'pictures'
  cwd: string
  args: string[]
  port: number
  child: ChildProcess | null
  starting: Promise<void> | null
  /** Stripper guards POSTs with a per-launch token embedded in its HTML. */
  token?: string
}

const BACKENDS: Record<Backend['id'], Backend> = {
  stripper: {
    id: 'stripper',
    cwd: String.raw`D:\jaukumas\promo-vids\metadata-stripper`,
    args: ['stripper.py', '--no-browser', '--port', '8770'],
    port: 8770,
    child: null,
    starting: null,
  },
  pictures: {
    id: 'pictures',
    cwd: String.raw`D:\picture stripper metadata`,
    args: ['server.py'],
    port: 8790,
    child: null,
    starting: null,
  },
  discord: {
    id: 'discord',
    cwd: String.raw`C:\Users\kajus\Desktop\ripper\discord-uploader`,
    args: ['server.py'],
    port: 8787,
    child: null,
    starting: null,
  },
}

function baseUrl(b: Backend) {
  return `http://127.0.0.1:${b.port}`
}

async function isUp(b: Backend): Promise<boolean> {
  try {
    const probe = b.id === 'stripper' ? '/api/status' : '/api/profiles'
    const res = await fetch(baseUrl(b) + probe, { signal: AbortSignal.timeout(1500) })
    return res.ok
  } catch {
    return false
  }
}

async function readStripperToken(b: Backend): Promise<void> {
  const res = await fetch(baseUrl(b) + '/', { signal: AbortSignal.timeout(3000) })
  const html = await res.text()
  const m = html.match(/const\s+token\s*=\s*['"]([^'"]+)['"]/)
  b.token = m?.[1]
}

async function ensureBackend(b: Backend): Promise<void> {
  if (await isUp(b)) {
    if (b.id === 'stripper' && !b.token) await readStripperToken(b)
    return
  }
  if (b.starting) return b.starting
  b.starting = (async () => {
    const python = resolvePython(b.cwd)
    const child = spawn(python, b.args, {
      cwd: b.cwd,
      stdio: 'ignore',
      windowsHide: true,
      detached: false,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    })
    b.child = child
    child.on('exit', () => {
      if (b.child === child) b.child = null
      b.token = undefined
    })
    const deadline = Date.now() + 20_000
    while (Date.now() < deadline) {
      if (await isUp(b)) {
        if (b.id === 'stripper') await readStripperToken(b)
        return
      }
      await new Promise((r) => setTimeout(r, 400))
    }
    throw new Error(`${b.id === 'stripper' ? 'Metadata stripper' : b.id === 'pictures' ? 'Picture Metadata Stripper' : 'Discord Video Drop'} did not start on port ${b.port}`)
  })().finally(() => {
    b.starting = null
  })
  return b.starting
}

function readBody(req: Connect.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export function attachMediaEmbedRoutes(middlewares: Connect.Server) {
  middlewares.use('/api/media-embed', async (req, res) => {
    // Every call needs the Control Center token: profiles include a Discord bot token.
    const expectedAuthUrl = '/api/media-embed' + (req.url || '')
    if (!requireApiToken({ ...req, method: 'POST', url: expectedAuthUrl, headers: req.headers }, res)) return

    const url = new URL(req.url || '/', 'http://local')
    const [, which, ...rest] = url.pathname.split('/')
    const backend = BACKENDS[which as Backend['id']]
    if (!backend) {
      sendJson(res, 404, { ok: false, message: 'Unknown tool' })
      return
    }
    const target = '/' + rest.join('/') + url.search
    if (!target.startsWith('/api/')) {
      sendJson(res, 400, { ok: false, message: 'Only tool API paths are proxied' })
      return
    }

    try {
      await ensureBackend(backend)
      const method = (req.method || 'GET').toUpperCase()
      const body = method === 'GET' || method === 'HEAD' ? undefined : await readBody(req)
      const headers: Record<string, string> = {}
      const ct = req.headers['content-type']
      if (ct) headers['Content-Type'] = String(ct)
      if (backend.id === 'stripper' && backend.token) headers['X-Stripper-Token'] = backend.token

      const upstream = await fetch(baseUrl(backend) + target, {
        method,
        headers,
        body: body && body.length ? new Uint8Array(body) : undefined,
      })
      res.statusCode = upstream.status
      const upstreamType = upstream.headers.get('content-type') || 'application/json'
      res.setHeader('Content-Type', upstreamType)
      res.setHeader('Cache-Control', 'no-store')
      if (upstreamType.includes('text/event-stream') && upstream.body) {
        // Stream upload progress events straight through.
        const reader = upstream.body.getReader()
        req.on('close', () => void reader.cancel().catch(() => {}))
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          res.write(Buffer.from(value))
        }
        res.end()
        return
      }
      res.end(Buffer.from(await upstream.arrayBuffer()))
    } catch (err) {
      sendJson(res, 502, { ok: false, message: err instanceof Error ? err.message : String(err), error: err instanceof Error ? err.message : String(err) })
    }
  })
}
