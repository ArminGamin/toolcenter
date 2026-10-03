/**
 * ToolsAI Control Center desktop app.
 *
 * Owns the whole stack so nothing runs in a browser tab or a console window:
 * - rebuilds the UI when sources changed, then serves it with the bridge API
 *   (`vite preview` + server middleware) on 127.0.0.1:5173, restarting it if it crashes
 * - keeps a durable copy of the UI settings (rail, tools, theme) in userData
 * - window + tray icon (closing hides to tray so running jobs keep going)
 * - Windows notifications when an automation finishes or errors
 */
const { app, BrowserWindow, Menu, Tray, Notification, shell, nativeImage, dialog, nativeTheme, ipcMain, session } = require('electron')
const { spawn, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const PORT = 5173
const BASE = `http://127.0.0.1:${PORT}`
const ICON = path.join(ROOT, 'toolsai-icon.ico')
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

// v2: a fresh id so Windows re-reads the taskbar icon from the shortcut.
const APP_ID = 'com.toolsai.controlcenter.v2'
app.setAppUserModelId(APP_ID)
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

let nodeCmd = null

/** Node executable for child processes: system Node, else Electron running as Node. */
function nodeCommand() {
  if (nodeCmd) return nodeCmd
  const probe = spawnSync('node', ['-v'], { windowsHide: true })
  nodeCmd = probe.status === 0 ? { cmd: 'node', env: {} } : { cmd: process.execPath, env: { ELECTRON_RUN_AS_NODE: '1' } }
  return nodeCmd
}

function newestMtime(dir, skipTests = false) {
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
      if (skipTests && (e.name === '__tests__' || /.test.[cm]?[jt]sx?$/.test(e.name))) continue
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
    // server/ is loaded fresh by `vite preview` on every start; only the UI needs a rebuild.
    newestMtime(path.join(ROOT, 'src')),
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

/** Server code changed since the running services started (applied by restarting them). */
function serverIsStale() {
  if (!bridgeStartedAt) return false
  let configAt = 0
  try {
    configAt = fs.statSync(path.join(ROOT, 'vite.config.ts')).mtimeMs
  } catch {
    /* ignore */
  }
  return Math.max(newestMtime(path.join(ROOT, 'server'), true), configAt) > bridgeStartedAt
}

function readApiToken() {
  try {
    const html = fs.readFileSync(path.join(ROOT, 'dist', 'index.html'), 'utf8')
    return html.match(/__CC_AUTH__='([^']+)'/)?.[1] || ''
  } catch {
    return ''
  }
}

/* --------------------------------------------------------- settings cache */

const SETTINGS_MAX_BYTES = 8 * 1024 * 1024
let settingsCache = null

function settingsFile() {
  return path.join(app.getPath('userData'), 'settings-cache.json')
}

function readSettingsCache() {
  if (settingsCache) return settingsCache
  for (const file of [settingsFile(), `${settingsFile()}.bak`]) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (data && data.values && typeof data.values === 'object') {
        settingsCache = data.values
        return settingsCache
      }
    } catch {
      /* missing or torn: try the backup */
    }
  }
  settingsCache = {}
  return settingsCache
}

function writeSettingsCache(values) {
  const clean = {}
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === 'string') clean[key] = value
  }
  const body = JSON.stringify({ savedAt: new Date().toISOString(), values: clean })
  if (body.length > SETTINGS_MAX_BYTES) return
  settingsCache = clean
  const file = settingsFile()
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`)
    fs.writeFileSync(`${file}.tmp`, body)
    fs.renameSync(`${file}.tmp`, file)
  } catch (err) {
    log(`settings: save failed ${err}`)
  }
}

function fromApp(event) {
  try {
    return Boolean(event.senderFrame?.url?.startsWith(BASE))
  } catch {
    return false
  }
}

ipcMain.on('cc-settings:load', (event) => {
  event.returnValue = fromApp(event) ? readSettingsCache() : {}
})
ipcMain.on('cc-settings:save', (event, values) => {
  if (fromApp(event) && values && typeof values === 'object') writeSettingsCache(values)
})

/** Saved Light/Dark choice, so the window and splash never flash the wrong theme. */
function savedDark() {
  try {
    const appearance = JSON.parse(readSettingsCache()['cc.appearance.v2'] || 'null')
    if (appearance?.theme === 'slate') return true
    if (appearance?.theme === 'paper') return false
  } catch {
    /* fall through */
  }
  return nativeTheme.shouldUseDarkColors
}

function flushStorage() {
  try {
    session.defaultSession.flushStorageData()
  } catch {
    /* best effort */
  }
}

/* ------------------------------------------------------------ splash page */

let splashLoaded = null

function splash(message, pct) {
  if (!win) return
  if (!splashLoaded) {
    splashLoaded = win
      .loadFile(path.join(__dirname, 'splash.html'), {
        query: { theme: savedDark() ? 'dark' : 'light', msg: message, pct: String(pct ?? '') },
      })
      .catch(() => {})
    return
  }
  const call = `window.__splash?.(${JSON.stringify(message)}, ${Number(pct) || 'undefined'})`
  void splashLoaded.then(() => win?.webContents.executeJavaScript(call, true).catch(() => {}))
}

async function leaveSplash() {
  if (!win || !splashLoaded) return
  try {
    await splashLoaded
    await win.webContents.executeJavaScript('window.__splashLeave?.()', true)
    await sleep(300)
  } catch {
    /* already gone */
  }
  splashLoaded = null
}

/* ------------------------------------------------------------------ bridge */

/** Rebuilds the UI. On start this only runs when no build exists; updates are applied from the Update button. */
async function buildIfNeeded({ onlyIfMissing = false } = {}) {
  if (onlyIfMissing ? fs.existsSync(path.join(ROOT, 'dist', 'index.html')) : !buildIsStale()) return 0
  splash('Applying the latest update…', 20)
  log('build: sources changed, running vite build')
  const { cmd, env } = nodeCommand()
  return new Promise((resolve) => {
    const child = spawn(cmd, [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], {
      cwd: ROOT,
      windowsHide: true,
      env: { ...process.env, ...env },
    })
    child.stdout.on('data', (d) => log(`build: ${String(d).trim()}`))
    child.stderr.on('data', (d) => log(`build! ${String(d).trim()}`))
    child.on('exit', (code) => {
      log(`build: exit ${code}`)
      resolve(code ?? 1)
    })
  })
}

let bridgeStartedAt = 0

function startBridge() {
  const { cmd, env } = nodeCommand()
  bridgeStartedAt = Date.now()
  const child = spawn(
    cmd,
    [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
    { cwd: ROOT, windowsHide: true, env: { ...process.env, ...BRIDGE_ENV, ...env } },
  )
  bridge = child
  ownsBridge = true
  log(`bridge: started pid ${bridge.pid}`)
  bridge.stdout.on('data', (d) => log(`bridge: ${String(d).trim()}`))
  bridge.stderr.on('data', (d) => log(`bridge! ${String(d).trim()}`))
  bridge.on('exit', (code) => {
    log(`bridge: exited ${code}`)
    // Stopped on purpose (update/restart): stopBridge already cleared it.
    if (bridge !== child) return
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
  if (await ok(`${BASE}/`, 800)) {
    // A dev server (npm run dev) is already serving: use it rather than fight for the port.
    log('bridge: reusing server already on port 5173')
    return
  }
  await buildIfNeeded({ onlyIfMissing: true })
  splash('Starting services…', 45)
  startBridge()
  // The UI is served as soon as Vite is up; the API finishes loading in the background.
  for (let i = 0; i < 600; i++) {
    if (await ok(`${BASE}/`, 800)) return
    if (i === 10) splash('Warming up the engine…', 70)
    await sleep(100)
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

/* ----------------------------------------------------------------- updates */

let updating = false

ipcMain.handle('cc-update:status', (event) => {
  if (!fromApp(event)) return { available: false, ui: false, server: false }
  const ui = buildIsStale()
  const server = ownsBridge && serverIsStale()
  return { available: ui || server, ui, server }
})

ipcMain.handle('cc-update:apply', async (event) => {
  if (!fromApp(event) || !win) return { ok: false, message: 'Not allowed' }
  if (updating) return { ok: false, message: 'An update is already running' }
  updating = true
  log('update: applying')
  try {
    splashLoaded = null
    titleBarKey = ''
    applyTitleBar(savedDark(), true)
    splash('Applying the latest update…', 10)
    const code = await buildIfNeeded()
    if (code !== 0) throw new Error('The UI build failed. Open the logs folder from the tray menu for details.')
    if (ownsBridge) {
      stopBridge()
      await sleep(600)
      await ensureBridge()
    }
    splash('Opening your workspace…', 92)
    await leaveSplash()
    applyTitleBar(savedDark())
    await win.loadURL(BASE + '/')
    return { ok: true }
  } catch (err) {
    log(`update: failed ${err}`)
    const message = err instanceof Error ? err.message : String(err)
    applyTitleBar(savedDark())
    await win.loadURL(BASE + '/').catch(() => {})
    dialog.showErrorBox('Update failed', message)
    return { ok: false, message }
  } finally {
    updating = false
  }
})

/* ---------------------------------------------------------- notifications */

function notify(title, body) {
  if (!Notification.isSupported()) return
  const n = new Notification({ title, body, icon: ICON, silent: false })
  n.on('click', () => showWindow())
  n.show()
}

const seenAlerts = new Set()
let alertsPrimed = false

/** Desktop notification for each new "something failed" alert from the bridge. */
async function notifyNewAlerts(token) {
  const res = await fetch(`${BASE}/api/alerts`, {
    headers: token ? { 'X-CC-Token': token } : {},
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) return
  const { alerts = [] } = await res.json()
  for (const a of alerts) {
    const key = `${a.id}:${a.count}`
    if (seenAlerts.has(key)) continue
    seenAlerts.add(key)
    // On the first poll, only announce failures from the last two minutes.
    if (!alertsPrimed && Date.now() - Date.parse(a.at) > 120_000) continue
    notify(`Something failed: ${a.title}`, a.detail || 'Open the Control Center for details.')
  }
  alertsPrimed = true
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
    await notifyNewAlerts(token)
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
      applyTitleBar(want === 'system' ? nativeTheme.shouldUseDarkColors : want === 'dark')
    }
  } catch {
    /* page loading */
  }
  setTimeout(syncTitleBarTheme, 2000)
}

/**
 * Custom title bar: the page draws its own top bar and Windows only paints the
 * min/max/close buttons over it, in the app's colours.
 */
const TITLE_BAR_HEIGHT = 40
const TITLE_BAR = {
  dark: { color: '#0e1116', symbolColor: '#cdd3de', splash: '#06080c' },
  light: { color: '#f3f4f7', symbolColor: '#334155', splash: '#f4f5f9' },
}
let titleBarKey = ''

function applyTitleBar(dark, onSplash = false) {
  if (!win || win.isDestroyed() || process.platform !== 'win32') return
  const look = dark ? TITLE_BAR.dark : TITLE_BAR.light
  const color = onSplash ? look.splash : look.color
  const key = `${color}|${look.symbolColor}`
  if (key === titleBarKey) return
  titleBarKey = key
  try {
    win.setTitleBarOverlay({ color, symbolColor: look.symbolColor, height: TITLE_BAR_HEIGHT })
  } catch {
    /* overlay unavailable */
  }
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
    backgroundColor: savedDark() ? '#06080c' : '#f4f5f9',
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: savedDark() ? TITLE_BAR.dark.splash : TITLE_BAR.light.splash,
      symbolColor: savedDark() ? TITLE_BAR.dark.symbolColor : TITLE_BAR.light.symbolColor,
      height: TITLE_BAR_HEIGHT,
    },
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      spellcheck: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })
  win.removeMenu()
  if (process.platform === 'win32') {
    // Taskbar button icon (otherwise Windows shows the stock electron.exe icon).
    win.setAppDetails({
      appId: APP_ID,
      appIconPath: ICON,
      appIconIndex: 0,
      relaunchCommand: `"${process.execPath}" "${ROOT}"`,
      relaunchDisplayName: 'ToolsAI Control Center',
    })
  }
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
    if (!url.startsWith(BASE) && !url.startsWith('data:') && !url.startsWith('file:')) {
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
    flushStorage()
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

/**
 * Windows takes the taskbar icon from the shortcut that carries this app's
 * AppUserModelId; without one it falls back to the stock electron.exe icon.
 */
function ensureShortcuts() {
  if (process.platform !== 'win32') return
  const options = {
    target: process.execPath,
    args: `"${ROOT}"`,
    cwd: ROOT,
    icon: ICON,
    iconIndex: 0,
    appUserModelId: APP_ID,
    description: 'ToolsAI Control Center',
  }
  const startMenu = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'ToolsAI Control Center.lnk')
  const desktop = path.join(app.getPath('desktop'), 'ToolsAI Control Center.lnk')
  try {
    shell.writeShortcutLink(startMenu, fs.existsSync(startMenu) ? 'replace' : 'create', options)
    if (fs.existsSync(desktop)) shell.writeShortcutLink(desktop, 'replace', options)
  } catch (err) {
    log(`shortcuts: ${err}`)
  }
}

function quit() {
  quitting = true
  flushStorage()
  stopBridge()
  app.quit()
}

/* -------------------------------------------------------------------- boot */

async function boot() {
  if (savedDark()) nativeTheme.themeSource = 'dark'
  createWindow()
  createTray()
  ensureShortcuts()
  splash('Starting…', 12)
  win.show()
  try {
    await ensureBridge()
    splash('Opening your workspace…', 92)
    await leaveSplash()
    applyTitleBar(savedDark())
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
  flushStorage()
  stopBridge()
})
app.on('window-all-closed', () => {
  /* stay alive in the tray */
})
