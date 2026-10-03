import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import type { LaunchEntry } from './launch-runtime.js'
import { loadToolEnv, resolveLaunchEntry } from './launch-runtime.js'

export type ToolReadiness = {
  id: string
  ready: boolean
  code: 'ready' | 'folder_missing' | 'entry_missing' | 'runtime_missing' | 'settings_missing'
  folderExists: boolean
  entryExists: boolean
  runtimeAvailable: boolean
  missingSettingNames: string[]
  checkedAt: string
}

/** `where.exe` lookups cost ~100ms each; installed commands rarely change. */
const commandCache = new Map<string, { ok: boolean; at: number }>()
const COMMAND_CACHE_MS = 10 * 60_000

function commandAvailable(command: string): boolean {
  if (path.isAbsolute(command)) return fs.existsSync(command)
  const key = command.toLowerCase()
  const cached = commandCache.get(key)
  if (cached && Date.now() - cached.at < COMMAND_CACHE_MS) return cached.ok
  const found = spawnSync('where.exe', [command], { windowsHide: true, encoding: 'utf8' })
  commandCache.set(key, { ok: found.status === 0, at: Date.now() })
  return found.status === 0
}

export function inspectToolReadiness(
  tool: LaunchEntry,
  opts?: { runtimeAvailable?: boolean; env?: Record<string, string> },
): ToolReadiness {
  if (tool.launchOptions?.length) {
    const results = tool.launchOptions.map((option) => inspectToolReadiness(resolveLaunchEntry(tool, option.id)!, opts))
    return results.find((result) => !result.ready) || results[0]
  }
  const folderExists = fs.existsSync(tool.path)
  const cmd = tool.launch.trim()
  const parts = cmd ? cmd.split(/\s+/) : []
  const runtime = parts[0] || ''
  const relativeEntry =
    !cmd ? '' : /^pythonw?(?:\.exe)?$/i.test(runtime) ? parts[1] || '' : /\.(?:bat|cmd|exe)$/i.test(runtime) ? runtime : ''
  const entryExists = !relativeEntry || fs.existsSync(path.isAbsolute(relativeEntry) ? relativeEntry : path.join(tool.path, relativeEntry))
  const runtimeAvailable =
    opts?.runtimeAvailable ?? (!runtime || /\.(?:bat|cmd)$/i.test(runtime) || commandAvailable(/^pythonw?(?:\.exe)?$/i.test(runtime) ? 'python.exe' : runtime))
  const env = opts?.env ?? loadToolEnv(tool)
  const missingSettingNames = (tool.settingsKeys || []).filter((key) => !(key in env))
  const code: ToolReadiness['code'] = !folderExists
    ? 'folder_missing'
    : !entryExists
      ? 'entry_missing'
      : !runtimeAvailable
        ? 'runtime_missing'
        : missingSettingNames.length
          ? 'settings_missing'
          : 'ready'
  return {
    id: tool.id,
    ready: code === 'ready',
    code,
    folderExists,
    entryExists,
    runtimeAvailable,
    missingSettingNames,
    checkedAt: new Date().toISOString(),
  }
}

let readinessCache: { at: number; value: ToolReadiness[] } | null = null

export function getAllToolReadiness(catalog: LaunchEntry[], maxAgeMs = 5000): ToolReadiness[] {
  const now = Date.now()
  if (readinessCache && now - readinessCache.at < maxAgeMs) return readinessCache.value
  const value = catalog.map((tool) => inspectToolReadiness(tool))
  readinessCache = { at: now, value }
  return value
}
