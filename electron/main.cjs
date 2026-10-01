/**
 * ToolsAI Control Center desktop app.
 *
 * Owns the whole stack so nothing runs in a browser tab or a console window:
 * - rebuilds the UI when sources changed, then serves it with the bridge API
 *   (`vite preview` + server middleware) on 127.0.0.1:5173, restarting it if it crashes
 * - starts Ollama in the background when it is not running
 * - window + tray icon (closing hides to tray so running jobs keep going)
 * - Windows notifications when an automation finishes or errors
 */
const { app, BrowserWindow, Menu, Tray, Notification, shell, nativeImage, dialog, nativeTheme } = require('electron')
const { spawn, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const PORT = 5173
const BASE = `http://127.0.0.1:${PORT}`
const ICON = path.join(ROOT, 'toolsai-app.ico')
const OLLAMA_EXE = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe')
const BRIDGE_ENV = {
  // Same GPU settings as the old Start ToolsAI.bat (AMD RX 5700 XT on Vulkan).
  OLLAMA_VULKAN: process.env.OLLAMA_VULKAN || '1',
  OLLAMA_NUM_PARALLEL: process.env.OLLAMA_NUM_PARALLEL || '1',
  OLLAMA_MAX_LOADED_MODELS: process.env.OLLAMA_MAX_LOADED_MODELS || '1',
}

let win = null
let tray = null
let bridge = null
let ownsBridge = false
let quitting = false
let restarts = []
let logStream = null

app.setAppUserModelId('com.toolsai.controlcenter')
app.setName('ToolsAI Control Center')

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showWindow())
  app.whenReady().then(boot)
}

/* ---------------------------------------------------------------- logging */

function log(line) {
  try {
    if (!logStream) {
      const dir = path.join(app.getPath('userData'), 'logs')
      fs.mkdirSync(dir, { recursive: true })
      logStream = fs.createWriteStream(path.join(dir, 'app.log'), { flags: 'a' })
    }
    logStream.write(`[${new Date().toISOString()}] ${line}\n`)
  } catch {
    /* logging must never break the app */
  }
}

/* ----------------------------------------------------------------- helpers */

async function ok(url, timeoutMs = 1500) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    return res.ok
  } catch {
    return false
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Node executable for child processes: system Node, else Electron running as Node. */
function nodeCommand() {
  const probe = spawnSync('node', ['-v'], { windowsHide: true })
  if (probe.status === 0) return { cmd: 'node', env: {} }
  return { cmd: process.execPath, env: { ELECTRON_RUN_AS_NODE: '1' } }
}

function newestMtime(dir) {
  let newest = 0
  const stack = [dir]
  while (stack.length) {
    const current = stack.pop()
    let entries = []
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue
      const full = path.join(current, e.name)
      if (e.isDirectory()) stack.push(full)
      else {
        try {
          newest = Math.max(newest, fs.statSync(full).mtimeMs)
        } catch {
          /* ignore */
        }
      }
    }
  }
  return newest
}

function buildIsStale() {
  const built = path.join(ROOT, 'dist', 'index.html')
  if (!fs.existsSync(built)) return true
  const builtAt = fs.statSync(built).mtimeMs
  const sources = [
    newestMtime(path.join(ROOT, 'src')),
    newestMtime(path.join(ROOT, 'server')),
    newestMtime(path.join(ROOT, 'public')),
    ...['index.html', 'vite.config.ts', 'tailwind.config.js', 'package.json'].map((f) => {
      try {
        return fs.statSync(path.join(ROOT, f)).mtimeMs
      } catch {
        return 0
      }
    }),
  ]
  return Math.max(...sources) > builtAt
}

function readApiToken() {
  try {
    const html = fs.readFileSync(path.join(ROOT, 'dist', 'index.html'), 'utf8')
    return html.match(/__CC_AUTH__='([^']+)'/)?.[1] || ''
  } catch {
    return ''
  }
}

/* ------------------------------------------------------------ splash page */

function splash(message) {
  if (!win) return
  const html = `<!doctype html><meta charset="utf-8"><title>ToolsAI</title>
  <style>
    :root{color-scheme:light dark}
    body{margin:0;height:100vh;display:grid;place-items:center;font:600 15px 'Segoe UI',system-ui,sans-serif;
      background:#f3f4f7;color:#111827}
    @media (prefers-color-scheme:dark){body{background:#0e1116;color:#f1f3f7}}
    .box{text-align:center} .msg{margin-top:14px;opacity:.75}
    .bar{width:220px;height:4px;margin:18px auto 0;border-radius:4px;background:rgba(127,127,127,.25);overflow:hidden}
    .bar i{display:block;width:40%;height:100%;background:#1d4ed8;border-radius:4px;animation:s 1.1s ease-in-out infinite}
    @keyframes s{0%{transform:translateX(-100%)}100%{transform:translateX(260%)}}
  </style>
  <div class="box"><div style="font-size:22px;font-weight:700">ToolsAI Control Center</div>
  <div class="msg">${message}</div><div class="bar"><i></i></div></div>`
  void win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
}

/* ------------------------------------------------------------------ bridge */

async function buildIfNeeded() {
  if (!buildIsStale()) return
  splash('Updating the app…')
  log('build: sources changed, running vite build')
  const { cmd, env } = nodeCommand()
  await new Promise((resolve) => {
    const child = spawn(cmd, [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], {
      cwd: ROOT,
      windowsHide: true,
      env: { ...process.env, ...env },
    })
    child.stdout.on('data', (d) => log(`build: ${String(d).trim()}`))
    child.stderr.on('data', (d) => log(`build! ${String(d).trim()}`))
    child.on('exit', (code) => {
      log(`build: exit ${code}`)
      resolve()
    })
  })
}

function startBridge() {
  const { cmd, env } = nodeCommand()
  bridge = spawn(
    cmd,
    [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
    { cwd: ROOT, windowsHide: true, env: { ...process.env, ...BRIDGE_ENV, ...env } },
  )
  ownsBridge = true
  log(`bridge: started pid ${bridge.pid}`)
  bridge.stdout.on('data', (d) => log(`bridge: ${String(d).trim()}`))
  bridge.stderr.on('data', (d) => log(`bridge! ${String(d).trim()}`))
  bridge.on('exit', (code) => {
    log(`bridge: exited ${code}`)
    bridge = null
    if (quitting) return
    // Supervisor: restart, but give up after 5 crashes in a minute.
    const now = Date.now()
    restarts = restarts.filter((t) => now - t < 60_000)
    restarts.push(now)
    if (restarts.length > 5) {
      notify('Control Center stopped', 'The background service keeps crashing. Open the logs from the tray menu.')
      return
    }
    setTimeout(() => {
      if (!quitting) startBridge()
    }, 1500)
  })
}

async function ensureBridge() {
  if (await ok(`${BASE}/api/runtime-status`)) {
    // A dev server (npm run dev) is already serving: use it rather than fight for the port.
    log('bridge: reusing server already on port 5173')
    return
  }
  await buildIfNeeded()
  splash('Starting services…')
  startBridge()
  for (let i = 0; i < 120; i++) {
    if (await ok(`${BASE}/api/runtime-status`)) return
    await sleep(500)
  }
  throw new Error('The background service did not start. See the log in the tray menu.')
}

function stopBridge() {
  if (!bridge || !ownsBridge) return
  try {
    // Kill the whole tree (vite + Python helpers it spawned).
    spawnSync('taskkill', ['/pid', String(bridge.pid), '/T', '/F'], { windowsHide: true })
  } catch {
    bridge.kill()
  }
  bridge = null
}

async function restartBridge() {
  stopBridge()
  await sleep(800)
  try {
    await ensureBridge()
    win?.loadURL(BASE + '/')
  } catch (err) {
    log(`bridge: restart failed ${err}`)
  }
}

/* ------------------------------------------------------------------ ollama */

async function ensureOllama() {
  if (await ok('http://127.0.0.1:11434/api/version')) return
  if (!fs.existsSync(OLLAMA_EXE)) return
  log('ollama: starting serve')
  const child = spawn(OLLAMA_EXE, ['serve'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, ...BRIDGE_ENV, OLLAMA_HOST: '127.0.0.1:11434', OLLAMA_KEEP_ALIVE: '30m' },
  })
  child.unref()
}

/* ---------------------------------------------------------- notifications */

function notify(title, body) {
  if (!Notification.isSupported()) return
  const n = new Notification({ title, body, icon: ICON, silent: false })
  n.on('click', () => showWindow())
  n.show()
}

const ACTIVE = new Set(['running', 'waiting_login', 'paused', 'waiting', 'sending'])
let lastStatus = new Map()

async function watchJobs() {
  const token = readApiToken()
  try {
    const res = await fetch(`${BASE}/api/hub-summary`, {
      headers: token ? { 'X-CC-Token': token } : {},
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) {
      const data = await res.json()
      const next = new Map()
      for (const m of data.modules || []) {
        const live = ACTIVE.has(m.status) || Boolean(m.workerRunning)
        next.set(m.id, { live, status: m.status, label: m.label, message: m.message })
        const prev = lastStatus.get(m.id)
        if (prev?.live && !live) {
          if (m.status === 'error') notify(`${m.label} failed`, m.message || 'Open the Control Center for details.')
          else notify(`${m.label} finished`, m.message || 'Done.')
        }
        if (prev && prev.status !== 'waiting_login' && m.status === 'waiting_login') {
          notify(`${m.label} needs you`, 'Log in in the browser window to continue.')
        }
      }
      lastStatus = next
      updateTray([...next.values()].filter((v) => v.live).map((v) => v.label))
    }
  } catch {
    /* bridge restarting */
  }
  setTimeout(watchJobs, 10_000)
}

/* ------------------------------------------------------------ title bar */

/** Keep the Windows title bar in step with the in-app Light/Dark choice. */
async function syncTitleBarTheme() {
  if (!win || win.isDestroyed()) return
  try {
    if (win.webContents.getURL().startsWith(BASE)) {
      const theme = await win.webContents.executeJavaScript(
        "document.documentElement.dataset.colorTheme || ''",
        true,
      )
      const want = theme === 'slate' ? 'dark' : theme === 'paper' ? 'light' : 'system'
      if (nativeTheme.themeSource !== want) nativeTheme.themeSource = want
    }
  } catch {
    /* page loading */
  }
  setTimeout(syncTitleBarTheme, 2000)
}

/* ------------------------------------------------------------ window/tray */

function showWindow() {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 960,
    minWidth: 960,
    minHeight: 640,
    title: 'ToolsAI Control Center',
    icon: ICON,
    backgroundColor: '#0e1116',
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: true },
  })
  win.removeMenu()
  win.once('ready-to-show', () => {
    win.maximize()
    win.show()
  })

  // Links to other sites open in the normal browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(BASE)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(BASE) && !url.startsWith('data:')) {
      event.preventDefault()
      void shell.openExternal(url)
    }
  })
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) {
      win.webContents.reload()
      event.preventDefault()
    }
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      win.webContents.toggleDevTools()
      event.preventDefault()
    }
  })

  // Closing hides to the tray so running automations keep going.
  let hintShown = false
  win.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    win.hide()
    if (!hintShown) {
      hintShown = true
      notify('Still running in the tray', 'Jobs keep going. Right-click the tray icon to quit.')
    }
  })
}

function updateTray(liveLabels = []) {
  if (!tray) return
  tray.setToolTip(liveLabels.length ? `ToolsAI: ${liveLabels.join(', ')} running` : 'ToolsAI Control Center')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Control Center', click: showWindow },
      ...(liveLabels.length
        ? [{ type: 'separator' }, ...liveLabels.map((l) => ({ label: `● ${l} running`, enabled: false }))]
        : []),
      { type: 'separator' },
      { label: 'Restart services', click: () => void restartBridge() },
      { label: 'Open logs folder', click: () => void shell.openPath(path.join(app.getPath('userData'), 'logs')) },
      { type: 'separator' },
      { label: 'Quit', click: () => quit() },
    ]),
  )
}

function createTray() {
  const image = nativeImage.createFromPath(ICON)
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image.resize({ width: 16, height: 16 }))
  tray.on('click', showWindow)
  updateTray()
}

function quit() {
  quitting = true
  stopBridge()
  app.quit()
}

/* -------------------------------------------------------------------- boot */

async function boot() {
  createWindow()
  createTray()
  splash('Starting…')
  win.show()
  void ensureOllama()
  try {
    await ensureBridge()
    await win.loadURL(BASE + '/')
    void syncTitleBarTheme()
    setTimeout(watchJobs, 5000)
  } catch (err) {
    log(`boot failed: ${err}`)
    dialog.showErrorBox('ToolsAI Control Center', String(err instanceof Error ? err.message : err))
  }
}

app.on('before-quit', () => {
  quitting = true
  stopBridge()
})
app.on('window-all-closed', () => {
  /* stay alive in the tray */
})
