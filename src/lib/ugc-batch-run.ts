import type { UgcSlideshowSlideCopy } from './ugc-slides'

export type UgcBatchRunPostView = {
  postIndex: number
  theme: { theme: string; hook: string; body: string }
  slideCount: number
  imageNames: string[]
  copyStatus: 'pending' | 'generating' | 'ready' | 'failed'
  saved: boolean
  slides?: UgcSlideshowSlideCopy[]
  caption?: string
  meta?: Record<string, unknown>
  arcName?: string
  hookStyle?: string
  storyArc?: string
  auditId?: string | null
  error?: string
}

export type UgcBatchRunView = {
  runId?: string
  status: 'idle' | 'running' | 'ready' | 'done' | 'error' | 'aborted' | 'stale'
  message: string
  progress: number
  startedAt: number
  finishedAt?: number
  abortRequested: boolean
  count: number
  okCount: number
  outputFolder: string
  batchDir?: string
  options: {
    slideMin: number
    slideMax: number
    category: string
    testMode: boolean
    defaultCta: string
    useFolderImages: boolean
  }
  posts: UgcBatchRunPostView[]
  lines: Array<{ ok: boolean; text: string; detail?: string }>
}

async function postJson<T>(action: string, body?: unknown): Promise<T | null> {
  try {
    const token =
      typeof window !== 'undefined'
        ? (window as unknown as { __CC_AUTH__?: string }).__CC_AUTH__
        : undefined
    const res = await fetch(`/api/ugc-slides?action=${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'X-CC-Token': token } : {}),
      },
      body: body != null ? JSON.stringify(body) : undefined,
    })
    return (await res.json()) as T
  } catch {
    return null
  }
}

export async function fetchUgcBatchRun(): Promise<UgcBatchRunView | null> {
  try {
    const res = await fetch('/api/ugc-slides?action=batch-run-status')
    const data = (await res.json()) as { ok?: boolean; run?: UgcBatchRunView }
    return data?.run ?? null
  } catch {
    return null
  }
}

export async function startUgcBatchRun(body: {
  count: number
  slideMin: number
  slideMax: number
  category: string
  testMode: boolean
  outputFolder: string
  defaultCta: string
  universalDescription?: string
  useFolderImages: boolean
}): Promise<{ ok: boolean; message?: string; run?: UgcBatchRunView } | null> {
  return postJson('batch-run-start', body)
}

export async function abortUgcBatchRun(): Promise<{ ok: boolean; message: string } | null> {
  return postJson('batch-run-abort')
}

export async function clearUgcBatchRun(): Promise<{ ok: boolean; message: string } | null> {
  return postJson('batch-run-clear')
}

export async function forceKillUgcBatchRun(): Promise<{ ok: boolean; message: string } | null> {
  return postJson('batch-run-force-kill')
}

export async function saveUgcBatchRunPost(body: {
  postIndex: number
  caption: string
  meta: Record<string, unknown>
  slides: Array<{ filename: string; data: string }>
}): Promise<{ ok: boolean; message?: string; batchDir?: string } | null> {
  return postJson('batch-run-save-post', body)
}

export function isUgcBatchRunActive(run: UgcBatchRunView | null): boolean {
  return Boolean(run && (run.status === 'running' || run.status === 'ready'))
}
