import { activeBusinessProfileId } from './business-profiles'
import { isAbortError, type UgcRequestOptions } from './ugc-fetch'

export type UgcImagePoolStatus = {
  available: number
  used: number
  total: number
  recycleCount: number
  newImagesDir: string
  usedImagesDir: string
}

function authHeaders(extra?: HeadersInit): HeadersInit {
  const token =
    typeof window !== 'undefined'
      ? (window as unknown as { __CC_AUTH__?: string }).__CC_AUTH__
      : undefined
  return { ...(extra || {}), ...(token ? { 'X-CC-Token': token } : {}) }
}

export function buildUgcImageServeUrl(filename: string, cacheBust?: string | number): string {
  const params = new URLSearchParams({
    action: 'serve-image',
    file: filename,
    profile: activeBusinessProfileId(),
  })
  if (cacheBust !== undefined) params.set('v', String(cacheBust))
  return `/api/ugc-slides?${params}`
}

export function buildUgcProductServeUrl(slug: string, cacheBust?: string | number, variantId?: string): string {
  const params = new URLSearchParams({
    action: 'serve-product',
    slug,
    profile: activeBusinessProfileId(),
  })
  if (variantId) params.set('variant', variantId)
  if (cacheBust !== undefined) params.set('v', String(cacheBust))
  return `/api/ugc-slides?${params}`
}

export async function fetchUgcImagePoolStatus(): Promise<UgcImagePoolStatus | null> {
  try {
    const res = await fetch('/api/ugc-slides?action=image-pool-status', {
      headers: authHeaders(),
    })
    const data = (await res.json()) as { ok?: boolean; status?: UgcImagePoolStatus }
    return data.status ?? null
  } catch {
    return null
  }
}

export async function pickUgcImageBatch(
  count: number,
  testMode?: boolean,
  options?: UgcRequestOptions,
): Promise<{
  ok: boolean
  images?: { filename: string }[]
  message?: string
  recycled?: boolean
  recycleCount?: number
}> {
  try {
    const res = await fetch('/api/ugc-slides?action=pick-images', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ count, testMode: testMode === true }),
      signal: options?.signal,
    })
    return (await res.json()) as {
      ok: boolean
      images?: { filename: string }[]
      message?: string
      recycled?: boolean
      recycleCount?: number
    }
  } catch (err) {
    if (options?.signal?.aborted || isAbortError(err)) throw err
    return { ok: false, message: 'Failed to pick images from image pool' }
  }
}

export async function consumeUgcImage(
  filename: string,
  options?: UgcRequestOptions,
): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetch('/api/ugc-slides?action=consume-image', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ filename }),
      signal: options?.signal,
    })
    return (await res.json()) as { ok: boolean; message?: string }
  } catch (err) {
    if (options?.signal?.aborted || isAbortError(err)) throw err
    return { ok: false, message: 'Failed to mark image as used' }
  }
}
