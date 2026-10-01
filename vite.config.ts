import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { authTokenInlineJs, getOrCreateApiToken } from './server/cc-auth.js'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'toolsai-launch-bridge',
      async configureServer(server) {
        // Bind confirmed: host 127.0.0.1 only (not 0.0.0.0)
        const { attachLaunchMiddleware } = await import('./server/launch.js')
        attachLaunchMiddleware(server.middlewares)
      },
      async configurePreviewServer(server) {
        const { attachLaunchMiddleware } = await import('./server/launch.js')
        attachLaunchMiddleware(server.middlewares)
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
        '**/toolsai-app.ico',
        '**/public/media/**',
      ],
    },
  },
})
