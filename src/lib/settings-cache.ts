/**
 * Durable copy of every localStorage setting, kept by the desktop app in a file.
 *
 * Chromium's localStorage can lose recent writes when the app is killed (PC
 * shutdown, updates, tray restarts), which reset the rail, removed tools and the
 * theme back to defaults. The Electron preload exposes the last saved snapshot
 * synchronously, so it is restored before anything reads settings.
 */

type SettingsBridge = {
  snapshot: Record<string, string>
  save: (values: Record<string, string>) => void
}

declare global {
  interface Window {
    ccSettingsCache?: SettingsBridge
  }
}

/** Huge values (image data, logs) are not settings; skip them. */
const MAX_VALUE_CHARS = 512 * 1024
const SAVE_DELAY_MS = 250

let lastSent = ''
let timer: ReturnType<typeof setTimeout> | undefined

function collect(): Record<string, string> {
  const values: Record<string, string> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key == null) continue
    const value = localStorage.getItem(key)
    if (value != null && value.length <= MAX_VALUE_CHARS) values[key] = value
  }
  return values
}

function flush(bridge: SettingsBridge) {
  clearTimeout(timer)
  timer = undefined
  try {
    const values = collect()
    const serialized = JSON.stringify(values)
    if (serialized === lastSent) return
    lastSent = serialized
    bridge.save(values)
  } catch {
    /* the next write retries */
  }
}

export function installSettingsCache() {
  const bridge = window.ccSettingsCache
  if (!bridge) return
  try {
    for (const [key, value] of Object.entries(bridge.snapshot || {})) {
      if (typeof value === 'string' && localStorage.getItem(key) !== value) localStorage.setItem(key, value)
    }
  } catch {
    /* storage unavailable: run on defaults */
    return
  }

  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(() => flush(bridge), SAVE_DELAY_MS)
  }
  const proto = Storage.prototype
  const { setItem, removeItem, clear } = proto
  proto.setItem = function (this: Storage, key: string, value: string) {
    setItem.call(this, key, value)
    if (this === window.localStorage) schedule()
  }
  proto.removeItem = function (this: Storage, key: string) {
    removeItem.call(this, key)
    if (this === window.localStorage) schedule()
  }
  proto.clear = function (this: Storage) {
    clear.call(this)
    if (this === window.localStorage) schedule()
  }

  window.addEventListener('pagehide', () => flush(bridge))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(bridge)
  })
  // Capture settings that only exist in localStorage (first run with the cache).
  flush(bridge)
}
