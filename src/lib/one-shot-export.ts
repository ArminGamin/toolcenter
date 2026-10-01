import { zipSync } from 'fflate'
import {
  canvasToStaticVideoBlob,
  videoExtForMime,
} from './one-shot-video'
import {
  canvasToPngBlob,
  ensureOneShotFontReady,
  renderOneShotSlide,
} from './one-shot-render'

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function stamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

export function buildOneShotVideoFilename(ext = 'mp4', date = new Date()): string {
  return `one-shot-${stamp(date)}.${ext}`
}

export function buildOneShotZipFilename(date = new Date()): string {
  return `one-shot-batch-${stamp(date)}.zip`
}

export type OneShotExportPost = {
  postIndex: number
  text: string
  width: number
  height: number
  meta: Record<string, unknown>
}

function authHeaders(extra?: HeadersInit): HeadersInit {
  const token =
    typeof window !== 'undefined'
      ? (window as unknown as { __CC_AUTH__?: string }).__CC_AUTH__
      : undefined
  return { ...(extra || {}), ...(token ? { 'X-CC-Token': token } : {}) }
}

async function encodeStillMp4FromPng(png: Blob): Promise<Blob | null> {
  const pngBase64 = await blobToBase64(png)
  const res = await fetch('/api/one-shot?action=encode-video', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ pngBase64 }),
  })
  const data = (await res.json()) as {
    ok?: boolean
    videoBase64?: string
  }
  if (!data.ok || !data.videoBase64) return null
  const binary = atob(data.videoBase64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: 'video/mp4' })
}

export async function renderOneShotVideo(
  canvas: HTMLCanvasElement,
  text: string,
  width: number,
  height: number,
): Promise<{ blob: Blob; ext: string }> {
  await ensureOneShotFontReady()
  renderOneShotSlide(canvas, { text, width, height })
  try {
    const png = await canvasToPngBlob(canvas)
    const blob = await encodeStillMp4FromPng(png)
    if (!blob) throw new Error('ffmpeg encode failed')
    return { blob, ext: 'mp4' }
  } catch {
    const blob = await canvasToStaticVideoBlob(canvas)
    return { blob, ext: videoExtForMime(blob.type) }
  }
}

export async function downloadOneShotVideo(
  canvas: HTMLCanvasElement,
  text: string,
  width: number,
  height: number,
) {
  const { blob, ext } = await renderOneShotVideo(canvas, text, width, height)
  downloadBlob(blob, buildOneShotVideoFilename(ext))
}

export async function exportOneShotZip(
  posts: OneShotExportPost[],
  canvas: HTMLCanvasElement,
): Promise<Blob> {
  await ensureOneShotFontReady()
  const entries: Record<string, Uint8Array> = {}
  for (const post of posts) {
    const folder = `post_${String(post.postIndex).padStart(2, '0')}`
    const { blob, ext } = await renderOneShotVideo(canvas, post.text, post.width, post.height)
    entries[`${folder}/${folder}.${ext}`] = new Uint8Array(await blob.arrayBuffer())
    entries[`${folder}/text.txt`] = new TextEncoder().encode(post.text.trim() + '\n')
    const caption = String(post.meta.caption || '').trim()
    if (caption) {
      entries[`${folder}/caption.txt`] = new TextEncoder().encode(caption + '\n')
    }
    entries[`${folder}/meta.json`] = new TextEncoder().encode(
      JSON.stringify(post.meta, null, 2) + '\n',
    )
  }
  return new Blob([zipSync(entries)], { type: 'application/zip' })
}

export async function saveOneShotBatchToServer(
  posts: {
    postIndex: number
    text: string
    meta: Record<string, unknown>
    videoBase64: string
    videoExt: string
  }[],
): Promise<{ ok: boolean; batchDir?: string; message?: string }> {
  try {
    const res = await fetch('/api/one-shot?action=save-batch', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ posts }),
    })
    return (await res.json()) as { ok: boolean; batchDir?: string; message?: string }
  } catch {
    return { ok: false, message: 'Failed to save batch to disk' }
  }
}
