/** Client for tools whose Python backends run behind /api/media-embed/<tool>/api/... */

export type MediaEmbedTool = 'stripper' | 'discord' | 'pictures'

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = (window as unknown as { __CC_AUTH__?: string }).__CC_AUTH__
  return { ...(extra || {}), ...(token ? { 'X-CC-Token': token } : {}) }
}

export async function mediaFetch(
  tool: MediaEmbedTool,
  apiPath: string,
  init?: { method?: string; json?: unknown; signal?: AbortSignal },
): Promise<Response> {
  const hasBody = init?.json !== undefined
  return fetch(`/api/media-embed/${tool}/api/${apiPath.replace(/^\/+/, '')}`, {
    method: init?.method || (hasBody ? 'POST' : 'GET'),
    headers: authHeaders(hasBody ? { 'Content-Type': 'application/json' } : undefined),
    body: hasBody ? JSON.stringify(init?.json) : undefined,
    signal: init?.signal,
  })
}

/** Reads FastAPI ({detail}) and stripper ({error}) error shapes. */
export async function mediaJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const detail = data.detail ?? data.error ?? data.message
    throw new Error(typeof detail === 'string' ? detail : `Request failed (${res.status})`)
  }
  return data as T
}
