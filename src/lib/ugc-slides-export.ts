import { zipSync } from 'fflate'
import { isAbortError, type UgcRequestOptions } from './ugc-fetch'
import {
  buildUgcSlideFilename,
  canvasToPngBlob,
  ensureUgcSlideFontsReady,
  renderUgcSlide,
  type RenderSlideInput,
} from './ugc-slides-render'

export type SlideshowExportSlide = {
  image: CanvasImageSource & { width?: number; height?: number }
  imgWidth: number
  imgHeight: number
  render: Omit<RenderSlideInput, 'image' | 'imgWidth' | 'imgHeight'>
}

export function buildUgcSlideshowZipFilename(date = new Date(), profileId?: string): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  const prefix =
    profileId === 'christmas-gifts' ? 'kaledu-kampelis-ugc-slideshow' : 'tavo-knyga-ugc-slideshow'
  return `${prefix}-${stamp}.zip`
}

export function buildUgcBatchZipFilename(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  return `tavo-knyga-ugc-batch-${stamp}.zip`
}

export type BatchPostExport = {
  postIndex: number
  slides: SlideshowExportSlide[]
  caption: string
  meta: Record<string, unknown>
}

export async function exportBatchZip(
  posts: BatchPostExport[],
  canvas: HTMLCanvasElement,
  batchDirName?: string,
): Promise<Blob> {
  const entries: Record<string, Uint8Array> = {}
  const stamp = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const batchDir =
    batchDirName ||
    `Batch_${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())}_${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}`

  for (const post of posts) {
    const folder = `${batchDir}/Post ${String(post.postIndex).padStart(2, '0')}`
    const blobs = await renderSlideshowPngBlobs(post.slides, canvas)
    for (let i = 0; i < blobs.length; i++) {
      entries[`${folder}/${buildUgcSlideIndexFilename(i)}`] = new Uint8Array(
        await blobs[i].arrayBuffer(),
      )
    }
    entries[`${folder}/caption.txt`] = new TextEncoder().encode(post.caption.trim() + '\n')
    entries[`${folder}/meta.json`] = new TextEncoder().encode(
      JSON.stringify(post.meta, null, 2) + '\n',
    )
  }

  return new Blob([zipSync(entries)], { type: 'application/zip' })
}

export function batchDirStamp(): string {
  const stamp = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `Batch_${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())}_${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}`
}

export async function writeBatchToDirectory(
  root: FileSystemDirectoryHandle,
  posts: BatchPostExport[],
  canvas: HTMLCanvasElement,
  batchDirName?: string,
): Promise<string> {
  const batchDir = await root.getDirectoryHandle(batchDirName || batchDirStamp(), { create: true })
  for (const post of posts) {
    const postDir = await batchDir.getDirectoryHandle(
      `Post ${String(post.postIndex).padStart(2, '0')}`,
      { create: true },
    )
    const blobs = await renderSlideshowPngBlobs(post.slides, canvas)
    for (let i = 0; i < blobs.length; i++) {
      const name = buildUgcSlideIndexFilename(i)
      const fileHandle = await postDir.getFileHandle(name, { create: true })
      const writable = await fileHandle.createWritable()
      await writable.write(blobs[i])
      await writable.close()
    }
    const capHandle = await postDir.getFileHandle('caption.txt', { create: true })
    const capWritable = await capHandle.createWritable()
    await capWritable.write(post.caption.trim() + '\n')
    await capWritable.close()
    const metaHandle = await postDir.getFileHandle('meta.json', { create: true })
    const metaWritable = await metaHandle.createWritable()
    await metaWritable.write(JSON.stringify(post.meta, null, 2) + '\n')
    await metaWritable.close()
  }
  return batchDir.name
}

export function buildUgcSlideIndexFilename(index: number): string {
  return `slide_${String(index + 1).padStart(2, '0')}.png`
}

export async function renderSlideshowPngBlobs(
  slides: SlideshowExportSlide[],
  canvas: HTMLCanvasElement,
): Promise<Blob[]> {
  await ensureUgcSlideFontsReady()
  const blobs: Blob[] = []
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i]
    renderUgcSlide(canvas, {
      image: slide.image,
      imgWidth: slide.imgWidth,
      imgHeight: slide.imgHeight,
      ...slide.render,
      slideIndex: slide.render.slideIndex ?? i,
      slideTotal: slide.render.slideTotal ?? slides.length,
    })
    blobs.push(await canvasToPngBlob(canvas))
  }
  return blobs
}

export async function exportSlideshowZip(
  slides: SlideshowExportSlide[],
  canvas: HTMLCanvasElement,
  caption?: string,
): Promise<Blob> {
  const blobs = await renderSlideshowPngBlobs(slides, canvas)
  const entries: Record<string, Uint8Array> = {}
  for (let i = 0; i < blobs.length; i++) {
    const buf = new Uint8Array(await blobs[i].arrayBuffer())
    entries[buildUgcSlideIndexFilename(i)] = buf
  }
  if (caption?.trim()) {
    entries['caption.txt'] = new TextEncoder().encode(caption.trim())
  }
  const zipped = zipSync(entries)
  return new Blob([zipped], { type: 'application/zip' })
}

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

function authHeaders(extra?: HeadersInit): HeadersInit {
  const token =
    typeof window !== 'undefined'
      ? (window as unknown as { __CC_AUTH__?: string }).__CC_AUTH__
      : undefined
  return { ...(extra || {}), ...(token ? { 'X-CC-Token': token } : {}) }
}

export type SaveBatchServerPost = {
  postIndex: number
  caption: string
  meta: Record<string, unknown>
  slides: { filename: string; data: string }[]
}

export async function buildBatchServerPayload(
  posts: BatchPostExport[],
  canvas: HTMLCanvasElement,
): Promise<SaveBatchServerPost[]> {
  const payload: SaveBatchServerPost[] = []
  for (const post of posts) {
    const slides: { filename: string; data: string }[] = []
    for (let i = 0; i < post.slides.length; i++) {
      renderUgcSlide(canvas, {
        image: post.slides[i].image,
        imgWidth: post.slides[i].imgWidth,
        imgHeight: post.slides[i].imgHeight,
        ...post.slides[i].render,
        slideIndex: post.slides[i].render.slideIndex ?? i,
        slideTotal: post.slides[i].render.slideTotal ?? post.slides.length,
      })
      const blob = await canvasToPngBlob(canvas)
      slides.push({
        filename: buildUgcSlideIndexFilename(i),
        data: await blobToBase64(blob),
      })
    }
    payload.push({
      postIndex: post.postIndex,
      caption: post.caption,
      meta: post.meta,
      slides,
    })
  }
  return payload
}

export async function saveUgcBatchToServer(
  posts: SaveBatchServerPost[],
  outputRoot?: string,
  options?: UgcRequestOptions,
): Promise<{ ok: boolean; batchDir?: string; message?: string }> {
  try {
    const res = await fetch('/api/ugc-slides?action=save-batch', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ posts, outputRoot: outputRoot?.trim() || undefined }),
      signal: options?.signal,
    })
    return (await res.json()) as { ok: boolean; batchDir?: string; message?: string }
  } catch (err) {
    if (options?.signal?.aborted || isAbortError(err)) throw err
    return { ok: false, message: 'Failed to save batch to disk' }
  }
}

export async function downloadSingleSlidePng(
  slide: SlideshowExportSlide,
  canvas: HTMLCanvasElement,
) {
  await ensureUgcSlideFontsReady()
  renderUgcSlide(canvas, {
    image: slide.image,
    imgWidth: slide.imgWidth,
    imgHeight: slide.imgHeight,
    ...slide.render,
  })
  const blob = await canvasToPngBlob(canvas)
  downloadBlob(blob, buildUgcSlideFilename())
}
