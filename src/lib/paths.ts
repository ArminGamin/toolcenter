/** Client for /api/paths: tool and data folder locations (stored per machine). */

export type ToolFolder = { id: string; path: string; defaultPath: string; overridden: boolean; exists: boolean }
export type DataFolder = {
  key: string
  label: string
  help: string
  path: string
  default: string
  overridden: boolean
  envLocked: boolean
  exists: boolean
}
export type PathsSnapshot = { tools: ToolFolder[]; dirs: DataFolder[] }

function headers(json = false): Record<string, string> {
  const token = (window as unknown as { __CC_AUTH__?: string }).__CC_AUTH__
  return { ...(json ? { 'Content-Type': 'application/json' } : {}), ...(token ? { 'X-CC-Token': token } : {}) }
}

async function parse(res: Response): Promise<PathsSnapshot> {
  const data = (await res.json().catch(() => ({}))) as PathsSnapshot & { ok?: boolean; message?: string }
  if (!res.ok || data.ok === false) throw new Error(data.message || `Request failed (${res.status})`)
  return { tools: data.tools || [], dirs: data.dirs || [] }
}

export async function fetchPaths(): Promise<PathsSnapshot> {
  return parse(await fetch('/api/paths', { headers: headers() }))
}

export async function updatePath(
  body:
    | { action: 'set-tool'; id: string; path: string }
    | { action: 'reset-tool'; id: string }
    | { action: 'set-dir'; key: string; path: string }
    | { action: 'reset-dir'; key: string },
): Promise<PathsSnapshot> {
  return parse(await fetch('/api/paths', { method: 'POST', headers: headers(true), body: JSON.stringify(body) }))
}
