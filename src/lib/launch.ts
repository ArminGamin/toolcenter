function authHeaders(extra?: HeadersInit): HeadersInit {
  const token =
    typeof window !== 'undefined'
      ? (window as unknown as { __CC_AUTH__?: string }).__CC_AUTH__
      : undefined
  return {
    ...(extra || {}),
    ...(token ? { 'X-CC-Token': token } : {}),
  }
}

export async function launchTool(id: string, optionId?: string): Promise<{ ok: boolean; message: string }> {
  return postJson('/api/launch', { id, optionId }, 'Launch bridge offline — run npm run dev')
}

export async function stopTool(id: string): Promise<{ ok: boolean; message: string }> {
  return postJson('/api/stop', { id }, 'Stop bridge offline — run npm run dev')
}

export async function stopAllTools(): Promise<{ ok: boolean; message: string }> {
  return postJson('/api/stop-all', {}, 'Stop-all bridge offline — run npm run dev')
}

async function postOpenFolder(
  body: Record<string, unknown>,
  offlineMessage: string,
): Promise<{ ok: boolean; message: string }> {
  return postJson('/api/open-folder', body, offlineMessage)
}

export async function openFolderPath(folderPath: string): Promise<{ ok: boolean; message: string }> {
  return postOpenFolder({ path: folderPath }, 'Cannot open folder — run npm run dev')
}

export async function openToolFolder(id: string): Promise<{ ok: boolean; message: string }> {
  return postOpenFolder({ id }, 'Cannot open folder — run npm run dev')
}

export async function openToolOutputFolder(
  id: string,
  optionId?: string,
): Promise<{ ok: boolean; message: string }> {
  return postOpenFolder({ id, which: 'output', optionId }, 'Cannot open output folder — run npm run dev')
}

export async function runToolAction(
  id: string,
  action: string,
  model?: string,
): Promise<{ ok: boolean; message: string }> {
  return postJson(
    '/api/action',
    { id, action, ...(model ? { model } : {}) },
    'Action bridge offline — run npm run dev',
  )
}

export async function fetchConsole(id: string): Promise<{
  ok: boolean
  lines?: string[]
  entries?: import('./logLevels').LogEntry[]
  running?: boolean
  pid?: number
  exitCode?: number | null
}> {
  try {
    const res = await fetch(`/api/console?id=${encodeURIComponent(id)}`)
    return (await res.json()) as {
      ok: boolean
      lines?: string[]
      entries?: import('./logLevels').LogEntry[]
      running?: boolean
      pid?: number
      exitCode?: number | null
    }
  } catch {
    return { ok: false }
  }
}

export async function clearConsole(id: string): Promise<{ ok: boolean; message: string }> {
  return postJson('/api/console', { id, action: 'clear' }, 'Console bridge offline')
}

export type RunErrorMeta = {
  id: string
  toolId: string
  at: string
  exitCode: number | null
  summary: string
  lineCount: number
  bytes: number
  file: string
}

export async function fetchRunErrors(): Promise<{ ok: boolean; errors: RunErrorMeta[] }> {
  try {
    const res = await fetch('/api/run-errors', { headers: authHeaders() })
    const data = (await res.json()) as { ok?: boolean; errors?: RunErrorMeta[] }
    return { ok: Boolean(data.ok), errors: data.errors || [] }
  } catch {
    return { ok: false, errors: [] }
  }
}

export async function fetchRunError(id: string): Promise<{
  ok: boolean
  meta?: RunErrorMeta
  body?: string
  message?: string
}> {
  try {
    const res = await fetch(`/api/run-errors?id=${encodeURIComponent(id)}`, {
      headers: authHeaders(),
    })
    return (await res.json()) as {
      ok: boolean
      meta?: RunErrorMeta
      body?: string
      message?: string
    }
  } catch {
    return { ok: false, message: 'Run-errors bridge offline' }
  }
}

export async function clearRunErrors(): Promise<{ ok: boolean; message: string }> {
  return postJson('/api/run-errors', { action: 'clear' }, 'Run-errors bridge offline')
}

export async function deleteRunError(id: string): Promise<{ ok: boolean; message: string }> {
  return postJson('/api/run-errors', { action: 'delete', id }, 'Run-errors bridge offline')
}

export async function fetchVault(): Promise<{
  ok: boolean
  values?: Record<string, string>
  fields?: { key: string; label: string; type: string }[]
  message?: string
}> {
  try {
    const res = await fetch('/api/vault', {
      headers: authHeaders(),
    })
    return (await res.json()) as {
      ok: boolean
      values?: Record<string, string>
      fields?: { key: string; label: string; type: string }[]
      message?: string
    }
  } catch {
    return { ok: false, message: 'Vault bridge offline' }
  }
}

export async function saveVault(
  values: Record<string, string>,
): Promise<{ ok: boolean; message: string }> {
  return postJson('/api/vault', { values }, 'Cannot save vault — run npm run dev')
}

export async function createBackup(): Promise<{ ok: boolean; message: string; path?: string }> {
  try {
    const token =
      typeof window !== 'undefined'
        ? (window as unknown as { __CC_AUTH__?: string }).__CC_AUTH__
        : undefined
    const res = await fetch('/api/backup', {
      method: 'POST',
      headers: token ? { 'X-CC-Token': token } : {},
    })
    return (await res.json()) as { ok: boolean; message: string; path?: string }
  } catch {
    return { ok: false, message: 'Backup bridge offline — run npm run dev' }
  }
}

export async function fetchOllamaModels(): Promise<{
  ok: boolean
  models?: string[]
  message?: string
}> {
  try {
    const res = await fetch('/api/ollama-models')
    return (await res.json()) as { ok: boolean; models?: string[]; message?: string }
  } catch {
    return { ok: false, models: [], message: 'Ollama models bridge offline' }
  }
}

export async function fetchToolSettings(id: string): Promise<{
  ok: boolean
  values?: Record<string, string>
  assets?: Record<string, string>
  message?: string
}> {
  try {
    const res = await fetch(`/api/settings?id=${encodeURIComponent(id)}`, {
      headers: authHeaders(),
    })
    return (await res.json()) as {
      ok: boolean
      values?: Record<string, string>
      assets?: Record<string, string>
      message?: string
    }
  } catch {
    return { ok: false, message: 'Settings bridge offline' }
  }
}

export async function saveToolSettings(
  id: string,
  values: Record<string, string>,
  assets: Record<string, string> = {},
): Promise<{ ok: boolean; message: string }> {
  return postJson('/api/settings', { id, values, assets }, 'Cannot save — run npm run dev')
}

export async function fetchProfiles(
  id: string,
): Promise<{ ok: boolean; profiles?: { name: string; updatedAt: string }[]; message?: string }> {
  try {
    const res = await fetch(`/api/profiles?id=${encodeURIComponent(id)}`, {
      headers: authHeaders(),
    })
    const data = (await res.json()) as {
      ok: boolean
      profiles?: { name: string; updatedAt: string }[]
      message?: string
    }
    if (!res.ok) {
      return {
        ok: false,
        profiles: [],
        message: data.message || `Profiles HTTP ${res.status}`,
      }
    }
    return {
      ok: Boolean(data.ok),
      profiles: data.profiles || [],
      message: data.message,
    }
  } catch {
    return { ok: false, profiles: [], message: 'Profiles bridge offline' }
  }
}

export async function saveProfile(
  id: string,
  name: string,
  settings: Record<string, string>,
  assets: Record<string, string>,
): Promise<{ ok: boolean; message: string }> {
  return postJson(
    '/api/profiles',
    { id, action: 'save', name, settings, assets },
    'Cannot save profile — run npm run dev',
  )
}

export async function loadProfile(id: string, name: string): Promise<{
  ok: boolean
  message: string
  settings?: Record<string, string>
  assets?: Record<string, string>
}> {
  try {
    const res = await fetch('/api/profiles', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(typeof window !== 'undefined' &&
        (window as unknown as { __CC_AUTH__?: string }).__CC_AUTH__
          ? { 'X-CC-Token': (window as unknown as { __CC_AUTH__?: string }).__CC_AUTH__! }
          : {}),
      },
      body: JSON.stringify({ id, action: 'load', name }),
    })
    return (await res.json()) as {
      ok: boolean
      message: string
      settings?: Record<string, string>
      assets?: Record<string, string>
    }
  } catch {
    return { ok: false, message: 'Cannot load profile — run npm run dev' }
  }
}

export async function deleteProfile(
  id: string,
  name: string,
): Promise<{ ok: boolean; message: string }> {
  return postJson(
    '/api/profiles',
    { id, action: 'delete', name },
    'Cannot delete profile — run npm run dev',
  )
}

export async function fetchRuntimeStatus(): Promise<{
  ok: boolean
  ollama?: boolean
  tools?: Record<string, boolean>
}> {
  try {
    const res = await fetch('/api/runtime-status')
    return (await res.json()) as {
      ok: boolean
      ollama?: boolean
      tools?: Record<string, boolean>
    }
  } catch {
    return { ok: false }
  }
}

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

export async function fetchToolReadiness(id: string): Promise<ToolReadiness | null> {
  try {
    const res = await fetch('/api/readiness')
    const data = (await res.json()) as { ok?: boolean; tools?: ToolReadiness[] }
    return data.tools?.find((tool) => tool.id === id) || null
  } catch {
    return null
  }
}

export async function downloadDiagnosticPack(): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch('/api/diagnostic-pack', { headers: authHeaders() })
    if (!res.ok) return { ok: false, message: `Diagnostic export failed (HTTP ${res.status})` }
    const blob = await res.blob()
    const href = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = href
    link.download = `toolsai-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    link.click()
    URL.revokeObjectURL(href)
    return { ok: true, message: 'Diagnostic pack downloaded' }
  } catch {
    return { ok: false, message: 'Diagnostic export bridge offline' }
  }
}

async function postJson(
  url: string,
  body: Record<string, unknown>,
  offlineMessage: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const token =
      typeof window !== 'undefined'
        ? (window as unknown as { __CC_AUTH__?: string }).__CC_AUTH__
        : undefined
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'X-CC-Token': token } : {}),
      },
      body: JSON.stringify(body),
    })
    const data = (await res.json()) as { ok?: boolean; message?: string }
    return {
      ok: Boolean(data.ok),
      message: data.message || (res.ok ? 'Done' : 'Request failed'),
    }
  } catch {
    return { ok: false, message: offlineMessage }
  }
}
