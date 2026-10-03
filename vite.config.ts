import { defineConfig } from 'vite'
import type { Connect } from 'vite'
import react from '@vitejs/plugin-react'
import { GLOBAL_CC_DATA } from './server/business-profiles.js'
import { authTokenInlineJs, getOrCreateApiToken } from './server/cc-auth.js'

type Handler = Connect.NextHandleFunction

/**
 * Serves the UI immediately and loads the bridge API in the background.
 * Importing server/launch takes seconds (vault decryption, process scans), so
 * /api requests wait for it while pages and assets are served right away.
 */
function attachLazyBridge(middlewares: Connect.Server) {
  const routes: Array<{ route: string; handle: Handler }> = []
  const collector = {
    use(route: string | Handler, handle?: Handler) {
      if (typeof route === 'function') routes.push({ route: '', handle: route })
      else if (handle) routes.push({ route, handle })
      return collector
    },
  } as unknown as Connect.Server

  let ready: Promise<void> | null = null
  const load = () =>
    (ready ??= Promise.all([
      import('./server/launch.js'),
      // Decrypt all vaults in one background call while the API modules load.
      Promise.race([
        import('./server/vault-crypto.js').then(({ prewarmVaults }) => prewarmVaults(GLOBAL_CC_DATA)),
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ]),
    ]).then(([{ attachLaunchMiddleware }]) => {
      attachLaunchMiddleware(collector)
    }))
  // Give the window time to fetch the page and its assets first.
  setTimeout(() => void load(), 600).unref?.()

  middlewares.use((req, res, next) => {
    const url = req.url || ''
    if (!url.startsWith('/api/')) {
      if (url.startsWith('/assets/')) {
        // Hashed build files never change: let the window cache them for good.
        const setHeader = res.setHeader.bind(res)
        res.setHeader = (name, value) =>
          setHeader(name, name.toLowerCase() === 'cache-control' ? 'public, max-age=31536000, immutable' : value)
      }
      next()
      return
    }
    load().then(
      () => {
        let index = 0
        const step = (err?: unknown) => {
          req.url = url
          if (err) return next(err)
          const entry = routes[index++]
          if (!entry) return next()
          const path = url.split('?')[0]
          if (entry.route) {
            const matches = path === entry.route || path.startsWith(`${entry.route}/`)
            if (!matches) return step()
            // Same as connect: handlers see the URL relative to their mount point.
            req.url = url.slice(entry.route.length) || '/'
            if (!req.url.startsWith('/')) req.url = `/${req.url}`
          }
          try {
            entry.handle(req, res, step)
          } catch (e) {
            step(e)
          }
        }
        step()
      },
      (err) => next(err),
    )
  })
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'toolsai-launch-bridge',
      configureServer(server) {
        // Bind confirmed: host 127.0.0.1 only (not 0.0.0.0)
        attachLazyBridge(server.middlewares)
      },
      configurePreviewServer(server) {
        attachLazyBridge(server.middlewares)
      },
      transformIndexHtml() {
        getOrCreateApiToken()
        return [
          {
            tag: 'script',
            children: authTokenInlineJs(),
            injectTo: 'head',
          },
        ]
      },
    },
  ],
  server: {
    // Localhost only — Fix 6: not exposed on LAN
    host: '127.0.0.1',
    port: 5173,
    watch: {
      // Large binary media can lock on Windows (EBUSY) if Vite tries to watch it.
      ignored: [
        '**/Start ToolsAI.bat',
        '**/wait-and-open.ps1',
        '**/toolsai.ico',
        '**/toolsai-icon.ico',
        '**/public/media/**',
      ],
    },
  },
})
