import fs from 'node:fs'
import path from 'node:path'
import { TOOLSAI_ROOT } from './cc-services.js'

/** Agent vision dump — always allowed as batch output. */
export const UGC_VISION_BATCH_ROOT = path.join(
  process.env.UGC_VISION_ROOT?.trim() || 'D:\\ugc-batch-vision',
  'batch',
)

export type SaveBatchSlide = {
  filename: string
  data: string
}

export type SaveBatchPost = {
  postIndex: number
  caption: string
  meta: Record<string, unknown>
  slides: SaveBatchSlide[]
}

function batchDirStamp(): string {
  const stamp = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `Batch_${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())}_${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}`
}

export function resolveBatchOutputRoot(userPath?: string): string {
  const trimmed = userPath?.trim()
  if (!trimmed) return UGC_VISION_BATCH_ROOT

  const resolved = path.isAbsolute(trimmed) ? trimmed : path.resolve(TOOLSAI_ROOT, trimmed)
  const normalized = path.resolve(resolved)
  const toolsaiRoot = path.resolve(TOOLSAI_ROOT)
  const visionRoot = path.resolve(process.env.UGC_VISION_ROOT?.trim() || 'D:\\ugc-batch-vision')

  const underToolsai = normalized === toolsaiRoot || normalized.startsWith(toolsaiRoot + path.sep)
  const underVision = normalized === visionRoot || normalized.startsWith(visionRoot + path.sep)
  if (!underToolsai && !underVision) {
    throw new Error('Output path must be under toolsai or D:\\ugc-batch-vision')
  }
  return normalized
}

function writeBatchPost(postDir: string, post: SaveBatchPost) {
  fs.mkdirSync(postDir, { recursive: true })
  for (const slide of post.slides) {
    if (!slide.data) continue
    fs.writeFileSync(path.join(postDir, slide.filename), Buffer.from(slide.data, 'base64'))
  }
  fs.writeFileSync(path.join(postDir, 'caption.txt'), post.caption.trim() + '\n')
  fs.writeFileSync(path.join(postDir, 'meta.json'), JSON.stringify(post.meta, null, 2) + '\n')
}

/** Append one rendered post to an existing or new batch folder (refresh-safe). */
export function saveUgcBatchPostToDisk(
  outputRoot: string | undefined,
  existingBatchDir: string | undefined,
  post: SaveBatchPost,
): { ok: true; batchDir: string } | { ok: false; message: string } {
  try {
    const root = resolveBatchOutputRoot(outputRoot)
    fs.mkdirSync(root, { recursive: true })
    const batchDir =
      existingBatchDir && fs.existsSync(existingBatchDir)
        ? existingBatchDir
        : path.join(root, batchDirStamp())
    fs.mkdirSync(batchDir, { recursive: true })
    const postDir = path.join(batchDir, `Post ${String(post.postIndex).padStart(2, '0')}`)
    writeBatchPost(postDir, post)
    return { ok: true, batchDir }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}

export function saveUgcBatchToDisk(
  outputRoot: string | undefined,
  posts: SaveBatchPost[],
): { ok: true; batchDir: string } | { ok: false; message: string } {
  if (!posts.length) return { ok: false, message: 'No posts to save' }

  try {
    const root = resolveBatchOutputRoot(outputRoot)
    fs.mkdirSync(root, { recursive: true })
    const batchDir = path.join(root, batchDirStamp())
    fs.mkdirSync(batchDir, { recursive: true })

    for (const post of posts) {
      const postDir = path.join(batchDir, `Post ${String(post.postIndex).padStart(2, '0')}`)
      writeBatchPost(postDir, post)
    }

    return { ok: true, batchDir }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}
