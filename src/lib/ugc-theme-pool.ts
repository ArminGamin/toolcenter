import { isAbortError, type UgcRequestOptions } from './ugc-fetch'

export type UgcThemeEntry = {
  theme: string
  hook: string
  body: string
  kind?: 'generic' | 'product'
}

export type UgcThemePoolStatus = {
  categories: string[]
  total: number
  used: number
  available: number
  totalInScope: number
  category: string
}

function authHeaders(extra?: HeadersInit): HeadersInit {
  const token =
    typeof window !== 'undefined'
      ? (window as unknown as { __CC_AUTH__?: string }).__CC_AUTH__
      : undefined
  return { ...(extra || {}), ...(token ? { 'X-CC-Token': token } : {}) }
}

export async function fetchUgcThemePoolStatus(
  category?: string,
): Promise<UgcThemePoolStatus | null> {
  try {
    const qs =
      category && category !== 'Random theme'
        ? `&category=${encodeURIComponent(category)}`
        : ''
    const res = await fetch(`/api/ugc-slides?action=theme-pool-status${qs}`, {
      headers: authHeaders(),
    })
    const data = (await res.json()) as { ok?: boolean; status?: UgcThemePoolStatus }
    return data.status ?? null
  } catch {
    return null
  }
}

export async function pickUgcThemeBatch(
  count: number,
  category?: string,
  testMode?: boolean,
  options?: UgcRequestOptions,
): Promise<{ ok: boolean; themes?: UgcThemeEntry[]; message?: string }> {
  try {
    const res = await fetch('/api/ugc-slides?action=pick-themes', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ count, category, testMode: testMode === true }),
      signal: options?.signal,
    })
    return (await res.json()) as { ok: boolean; themes?: UgcThemeEntry[]; message?: string }
  } catch (err) {
    if (options?.signal?.aborted || isAbortError(err)) throw err
    return { ok: false, message: 'Failed to pick themes from pool' }
  }
}

export async function resetUgcThemePool(): Promise<{
  ok: boolean
  message?: string
  status?: UgcThemePoolStatus
}> {
  try {
    const res = await fetch('/api/ugc-slides?action=reset-used-themes', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: '{}',
    })
    return (await res.json()) as { ok: boolean; message?: string; status?: UgcThemePoolStatus }
  } catch {
    return { ok: false, message: 'Failed to reset theme pool' }
  }
}
