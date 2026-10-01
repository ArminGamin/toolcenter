/** Ollama start/pull/model listing for the launch bridge. (Split out of launch.ts.) */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import {
    fireNotify,
    loadVault
} from '../cc-services.js'
import {
    appendConsole,
    loadProfileToolSnapshot,
    spawnEnvForTool,
    type LaunchEntry
} from '../launch-runtime.js'
import { UGC_DEFAULT_OLLAMA_MODEL } from '../ugc-env-bridge.js'
import { LAUNCH_CATALOG, OLLAMA_EXE } from './catalog.js'
export { EBOOK, LAUNCH_CATALOG, OLLAMA_EXE, ONE_SHOT_KEYS, SEO_BLOG_KEYS, TAVO_KEYS, UGC_SLIDES_KEYS } from './catalog.js'

export function resolveOllamaBaseUrl(tool?: LaunchEntry): string {
  const loaded = tool ? loadProfileToolSnapshot(tool).values : {}
  const vault = loadVault()
  const raw = (
    loaded.OLLAMA_HOST ||
    loaded.OLLAMA_URL ||
    vault.OLLAMA_HOST ||
    vault.OLLAMA_URL ||
    '127.0.0.1:11434'
  ).trim()
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/$/, '')
  return `http://${raw.replace(/\/$/, '')}`
}

export function resolveOllamaModel(model?: string): string {
  const tool = LAUNCH_CATALOG.find((t) => t.id === 'ollama')
  return (
    (model && model.trim()) ||
    (tool && (loadProfileToolSnapshot(tool).values.OLLAMA_MODEL || loadVault().OLLAMA_MODEL)) ||
    'llama3.1:8b'
  )
}

export function normalizeOllamaModelKey(name: string): string {
  return name.trim().replace(/:latest$/i, '').toLowerCase()
}

/** Models to pull: selected/default tool model + UGC Lithuanian model (deduped). */
export function resolveOllamaPullModels(model?: string): string[] {
  const primary = resolveOllamaModel(model)
  const out: string[] = []
  const seen = new Set<string>()
  for (const name of [primary, UGC_DEFAULT_OLLAMA_MODEL]) {
    const trimmed = name.trim()
    if (!trimmed) continue
    const key = normalizeOllamaModelKey(trimmed)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
  }
  return out
}

export function ollamaExePath(): string {
  return fs.existsSync(OLLAMA_EXE) ? OLLAMA_EXE : 'ollama'
}

/** Open interactive CMD: `ollama pull <model>` (progress bars need a real TTY). */
export function openOllamaPullWindow(model?: string): {
  ok: boolean
  message: string
  model: string
  models: string[]
} {
  const pullModels = resolveOllamaPullModels(model)
  const pullModel = pullModels[0] || resolveOllamaModel(model)
  const tool = LAUNCH_CATALOG.find((t) => t.id === 'ollama')
  const env = tool ? spawnEnvForTool(tool) : { ...process.env }
  try {
    const exe = ollamaExePath()
    const quotedExe = `"${exe.replace(/"/g, '')}"`
    const pullCmd = pullModels.map((m) => `${quotedExe} pull ${m}`).join(' && ')
    const child = spawn(
      'cmd.exe',
      ['/c', 'start', '""', 'cmd.exe', '/k', pullCmd],
      {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
        env,
      },
    )
    child.unref()
    appendConsole('ollama', pullCmd, 'sys')
    const message =
      pullModels.length > 1
        ? `Pulling ${pullModels.join(' + ')}`
        : `ollama pull ${pullModel}`
    fireNotify('Ollama pull', message, 'info', 'ollama')
    return { ok: true, message, model: pullModel, models: pullModels }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    fireNotify('Ollama pull failed', message, 'err', 'ollama')
    return { ok: false, message, model: pullModel, models: pullModels }
  }
}

export function ensureOllamaServeBackground(): void {
  const tool = LAUNCH_CATALOG.find((t) => t.id === 'ollama')
  const env = tool ? spawnEnvForTool(tool) : { ...process.env }
  try {
    const exe = ollamaExePath()
    const child = spawn(exe, ['serve'], {
      stdio: ['ignore', 'ignore', 'ignore'],
      windowsHide: true,
      shell: false,
      detached: true,
      env,
    })
    child.unref()
    appendConsole('ollama', 'Started ollama serve (background)', 'sys')
  } catch {
    // Tray/app may already be serving — pull window still works if so
  }
}

export function startOllama(model?: string): { ok: boolean; message: string } {
  // Start = ensure serve, then open the same pull flow the user expects in CMD
  ensureOllamaServeBackground()
  const result = openOllamaPullWindow(model)
  return { ok: result.ok, message: result.message }
}

export function runOllamaPull(model?: string): { ok: boolean; message: string } {
  const result = openOllamaPullWindow(model)
  return { ok: result.ok, message: result.message }
}

export async function listOllamaModels(): Promise<{
  ok: boolean
  models: string[]
  message?: string
}> {
  const tool = LAUNCH_CATALOG.find((t) => t.id === 'ollama')
  const base = resolveOllamaBaseUrl(tool)
  try {
    const res = await fetch(`${base}/api/tags`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      return { ok: false, models: [], message: `Ollama HTTP ${res.status}` }
    }
    const data = (await res.json()) as { models?: { name?: string; model?: string }[] }
    const models = (data.models || [])
      .map((m) => m.name || m.model || '')
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
    return { ok: true, models }
  } catch (err) {
    return {
      ok: false,
      models: [],
      message: err instanceof Error ? err.message : 'Ollama offline',
    }
  }
}
