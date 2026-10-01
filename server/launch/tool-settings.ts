/** Per-tool settings and saved tool profiles. (Split out of launch.ts.) */

import fs from 'node:fs'
import path from 'node:path'
import {
    currentBusinessProfile,
    profileDataPath
} from '../business-profiles.js'
import {
    fireNotify,
    loadVault,
    saveVault
} from '../cc-services.js'
import {
    ensureToolPath,
    loadProfileToolSnapshot,
    saveProfileToolSnapshot,
    SETTINGS_DEFAULTS
} from '../launch-runtime.js'
import {
    importPostMakerOllamaToVault,
    resolveUgcVaultSettings,
} from '../ugc-env-bridge.js'
import { LAUNCH_CATALOG } from './ollama.js'

export function getToolSettings(id: string): {
  ok: boolean
  message?: string
  values?: Record<string, string>
  assets?: Record<string, string>
  file?: string
} {
  const tool = LAUNCH_CATALOG.find((t) => t.id === id)
  if (!tool) return { ok: false, message: 'Unknown tool' }

  const values: Record<string, string> = {}
  if (tool.settingsKeys?.length) {
    const defaults = SETTINGS_DEFAULTS[tool.id] || {}
    if (tool.id === 'ugc_slides') {
      importPostMakerOllamaToVault()
      const merged = resolveUgcVaultSettings()
      for (const key of tool.settingsKeys) {
        values[key] = merged[key as keyof typeof merged] ?? defaults[key] ?? ''
      }
    } else if (tool.settingsFile) {
      const loaded = loadProfileToolSnapshot(tool).values
      for (const key of tool.settingsKeys) {
        if (Object.prototype.hasOwnProperty.call(loaded, key) && loaded[key] !== '') {
          values[key] = loaded[key]
        } else if (defaults[key] !== undefined && defaults[key] !== '') {
          values[key] = defaults[key]
        } else {
          values[key] = loadVault()[key] ?? ''
        }
      }
    } else {
      const vault = loadVault()
      for (const key of tool.settingsKeys) {
        values[key] = vault[key] ?? defaults[key] ?? ''
      }
    }
  }

  const snapshot = loadProfileToolSnapshot(tool)
  const assets: Record<string, string> = {}
  for (const asset of tool.assets || []) assets[asset.key] = snapshot.assets[asset.key] || ''

  return {
    ok: true,
    values,
    assets,
    file: tool.settingsFile ? `${currentBusinessProfile().name} profile` : undefined,
  }
}

export function saveToolSettings(
  id: string,
  updates: Record<string, string>,
  assetUpdates?: Record<string, string>,
): { ok: boolean; message: string } {
  const tool = LAUNCH_CATALOG.find((t) => t.id === id)
  if (!tool) return { ok: false, message: 'Unknown tool' }
  if (!ensureToolPath(tool)) {
    return { ok: false, message: `Folder missing: ${tool.path}` }
  }

  const saved: string[] = []

  if (tool.settingsFile && tool.settingsKeys?.length) {
    saveProfileToolSnapshot(tool, updates, assetUpdates || {})
    saved.push(`${currentBusinessProfile().name} settings`)
  } else if (tool.settingsKeys?.length) {
    const vaultUpdates: Record<string, string> = {}
    for (const key of tool.settingsKeys) {
      if (Object.prototype.hasOwnProperty.call(updates, key)) {
        vaultUpdates[key] = updates[key]
      }
    }
    if (Object.keys(vaultUpdates).length) {
      const res = saveVault(vaultUpdates)
      if (res.ok) saved.push('vault')
    }
  }

  if (assetUpdates && tool.assets?.length && !tool.settingsFile) {
    saveProfileToolSnapshot(tool, {}, assetUpdates)
    saved.push(`${currentBusinessProfile().name} assets`)
  }

  if (!saved.length) {
    return { ok: false, message: 'Nothing to save for this tool' }
  }
  fireNotify(`Settings saved · ${id}`, saved.join(', '), 'info', id)
  return { ok: true, message: `Saved ${saved.join(', ')}` }
}

export const PROFILES_LEGACY = 'control-center-profiles.json'

export type ProfilesFile = { profiles: Array<{
  name: string
  updatedAt: string
  settings: Record<string, string>
  assets: Record<string, string>
}> }

export function profilesPath(toolPath: string, toolId?: string) {
  const name = toolId ? `control-center-profiles-${toolId}.json` : PROFILES_LEGACY
  return profileDataPath('legacy-tool-profiles', path.basename(toolPath), name)
}

export function readProfiles(toolPath: string, toolId?: string): ProfilesFile {
  const preferred = profilesPath(toolPath, toolId)
  const legacy = profilesPath(toolPath)
  const file = fs.existsSync(preferred) ? preferred : legacy
  if (!fs.existsSync(file)) return { profiles: [] }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as ProfilesFile
    return { profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [] }
  } catch {
    return { profiles: [] }
  }
}

export function writeProfiles(toolPath: string, data: ProfilesFile, toolId?: string) {
  const file = profilesPath(toolPath, toolId)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
}

export function saveProfile(
  id: string,
  name: string,
  settings: Record<string, string>,
  assets: Record<string, string>,
): { ok: boolean; message: string } {
  const tool = LAUNCH_CATALOG.find((t) => t.id === id)
  if (!tool) return { ok: false, message: 'Unknown tool' }
  if (!ensureToolPath(tool)) return { ok: false, message: `Folder missing: ${tool.path}` }
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, message: 'Profile name required' }

  const data = readProfiles(tool.path, tool.id)
  const next = {
    name: trimmed,
    updatedAt: new Date().toISOString(),
    settings: settings || {},
    assets: assets || {},
  }
  const idx = data.profiles.findIndex((p) => p.name.toLowerCase() === trimmed.toLowerCase())
  if (idx >= 0) data.profiles[idx] = next
  else data.profiles.push(next)
  writeProfiles(tool.path, data, tool.id)
  return { ok: true, message: `Profile “${trimmed}” saved` }
}

export function loadProfile(
  id: string,
  name: string,
): {
  ok: boolean
  message: string
  settings?: Record<string, string>
  assets?: Record<string, string>
} {
  const tool = LAUNCH_CATALOG.find((t) => t.id === id)
  if (!tool) return { ok: false, message: 'Unknown tool' }
  const data = readProfiles(tool.path, tool.id)
  const profile = data.profiles.find((p) => p.name.toLowerCase() === name.trim().toLowerCase())
  if (!profile) return { ok: false, message: `Profile “${name}” not found` }

  // Apply into tool files immediately
  const apply = saveToolSettings(id, profile.settings || {}, profile.assets || {})
  if (!apply.ok && (Object.keys(profile.settings || {}).length || Object.keys(profile.assets || {}).length)) {
    // still return values even if nothing configured to write
  }

  return {
    ok: true,
    message: `Loaded “${profile.name}”${apply.ok ? ` — ${apply.message}` : ''}`,
    settings: profile.settings || {},
    assets: profile.assets || {},
  }
}
