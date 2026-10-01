import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { currentBusinessProfile, DEFAULT_BUSINESS_PROFILE_ID } from './business-profiles.js'
import { currentProfileBrand, isChristmasGiftsNiche } from './profile-brand.js'
import {
  ensureKaleduBgFallbacks,
  listKaleduBackgroundRelPaths,
  listKaleduBackgroundsInCategory,
} from './ugc-kaledu-bgs.js'
import { catalogProductFilenames } from './ugc-kaledu-catalog.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ASSETS = process.env.UGC_TEST_ASSETS || path.join(__dirname, '..', 'assets', 'ugc-slides')

function sourceImagesDir(): string {
  const fromEnv = process.env.UGC_IMAGE_SOURCE_DIR?.trim()
  if (fromEnv) return fromEnv
  return currentProfileBrand().ugcImagesDir
}

/** Folder UGC batch picks background photos from (default: D:\new-pics). */
export const NEW_IMAGES_DIR = sourceImagesDir()
export const USED_IMAGES_DIR = path.join(ASSETS, 'used-images')
const STATE_FILE = path.join(ASSETS, 'image_pool_state.json')

function usedImagesDir(): string {
  if (process.env.UGC_TEST_ASSETS || process.env.UGC_IMAGE_SOURCE_DIR) return USED_IMAGES_DIR
  const id = currentBusinessProfile().id
  if (id === DEFAULT_BUSINESS_PROFILE_ID) return USED_IMAGES_DIR
  return path.join(ASSETS, `used-images-${id}`)
}

function stateFile(): string {
  if (process.env.UGC_TEST_ASSETS || process.env.UGC_IMAGE_SOURCE_DIR) return STATE_FILE
  const id = currentBusinessProfile().id
  if (id === DEFAULT_BUSINESS_PROFILE_ID) return STATE_FILE
  return path.join(ASSETS, `image_pool_state_${id}.json`)
}

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp'])

type ImagePoolState = {
  recycleCount: number
  lastPickOrder: string[]
}

function ensureImageDirs() {
  fs.mkdirSync(usedImagesDir(), { recursive: true })
  fs.mkdirSync(ASSETS, { recursive: true })
}

function isImageFile(name: string): boolean {
  return IMAGE_EXTS.has(path.extname(name).toLowerCase())
}

function loadImagePoolState(): ImagePoolState {
  const file = stateFile()
  if (!fs.existsSync(file)) {
    return { recycleCount: 0, lastPickOrder: [] }
  }
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<ImagePoolState>
    return {
      recycleCount: typeof data.recycleCount === 'number' ? data.recycleCount : 0,
      lastPickOrder: Array.isArray(data.lastPickOrder)
        ? data.lastPickOrder.filter((x): x is string => typeof x === 'string')
        : [],
    }
  } catch {
    return { recycleCount: 0, lastPickOrder: [] }
  }
}

function saveImagePoolState(state: ImagePoolState) {
  ensureImageDirs()
  fs.writeFileSync(stateFile(), JSON.stringify(state, null, 2) + '\n', 'utf8')
}

function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function orderCandidatesForPick(candidates: string[], state: ImagePoolState): string[] {
  let ordered = shuffleArray(candidates)
  if (!ordered.length) return ordered

  if (state.recycleCount > 0 || state.lastPickOrder.length > 0) {
    const step =
      ordered.length > 1
        ? 1 + ((state.recycleCount * 17 + ordered.length * 3) % (ordered.length - 1))
        : 0
    ordered = [...ordered.slice(step), ...ordered.slice(0, step)]

    if (state.lastPickOrder.length > 0 && ordered[0] === state.lastPickOrder[0] && ordered.length > 1) {
      const swap = 1 + Math.floor(Math.random() * (ordered.length - 1))
      ;[ordered[0], ordered[swap]] = [ordered[swap], ordered[0]]
    }
    if (
      state.lastPickOrder.length > 1 &&
      ordered.length > 2 &&
      ordered[1] === state.lastPickOrder[1]
    ) {
      const swap = 2 + Math.floor(Math.random() * (ordered.length - 2))
      ;[ordered[1], ordered[swap]] = [ordered[swap], ordered[1]]
    }
  }

  return ordered
}

export function safeImageBasename(filename: string): string | null {
  const rel = safeImageRelPath(filename)
  if (!rel) return null
  if (rel !== path.basename(rel)) return null
  return rel
}

export function safeImageRelPath(filename: string): string | null {
  const trimmed = String(filename || '').replace(/\\/g, '/').replace(/^\/+/, '').trim()
  if (!trimmed || trimmed.includes('..') || path.isAbsolute(trimmed)) return null
  if (!isImageFile(trimmed)) return null
  return trimmed
}

function usedBasenames(): Set<string> {
  const set = new Set<string>()
  for (const name of listUsedUgcImages()) {
    set.add(name)
    set.add(name.replace(/__/g, '/'))
    set.add(path.basename(name))
  }
  return set
}

function walkImageRelPaths(dir: string, root = dir): string[] {
  if (!fs.existsSync(dir)) return []
  const out: string[] = []
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith('.')) continue
    const full = path.join(dir, name)
    const st = fs.statSync(full)
    if (st.isDirectory()) out.push(...walkImageRelPaths(full, root))
    else if (st.isFile() && isImageFile(name)) {
      out.push(path.relative(root, full).replace(/\\/g, '/'))
    }
  }
  return out.sort((a, b) => a.localeCompare(b))
}

function listAllSourceImages(): string[] {
  let names: string[]
  if (!process.env.UGC_IMAGE_SOURCE_DIR && !process.env.UGC_TEST_ASSETS && isChristmasGiftsNiche()) {
    ensureKaleduBgFallbacks()
    names = listKaleduBackgroundRelPaths()
  } else {
    const dir = sourceImagesDir()
    if (!fs.existsSync(dir)) return []
    names = walkImageRelPaths(dir)
  }
  if (!process.env.UGC_IMAGE_SOURCE_DIR && !process.env.UGC_TEST_ASSETS && isChristmasGiftsNiche()) {
    const catalog = catalogProductFilenames()
    names = names.filter((name) => !catalog.has(path.basename(name)))
  }
  return names
}

export function listUgcSourceImageNames(): string[] {
  return listAllSourceImages()
}

export function listNewUgcImages(): string[] {
  ensureImageDirs()
  const used = usedBasenames()
  return listAllSourceImages().filter((name) => !used.has(name))
}

export function listUsedUgcImages(): string[] {
  ensureImageDirs()
  const dir = usedImagesDir()
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((name) => {
      const full = path.join(dir, name)
      return fs.statSync(full).isFile() && isImageFile(name)
    })
    .sort((a, b) => a.localeCompare(b))
}

export function countUsedUgcImages(): number {
  return listUsedUgcImages().length
}

export function getUgcImagePoolStatus() {
  ensureImageDirs()
  const state = loadImagePoolState()
  const total = listAllSourceImages().length
  const used = countUsedUgcImages()
  const available = listNewUgcImages().length
  return {
    available,
    used,
    total,
    recycleCount: state.recycleCount,
    newImagesDir: sourceImagesDir(),
    usedImagesDir: usedImagesDir(),
  }
}

export function resolveNewImagePath(filename: string): string | null {
  const rel = safeImageRelPath(filename)
  if (!rel) return null
  const dir = sourceImagesDir()
  const full = path.resolve(dir, rel)
  const root = path.resolve(dir)
  const relToRoot = path.relative(root, full)
  if (relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) return null
  if (fs.existsSync(full) && fs.statSync(full).isFile()) return full
  const byBase = path.join(dir, path.basename(rel))
  if (fs.existsSync(byBase) && fs.statSync(byBase).isFile()) return byBase
  return null
}

function uniqueUsedImageDest(base: string): string {
  let dest = path.join(usedImagesDir(), base)
  if (!fs.existsSync(dest)) return dest
  const stem = path.parse(base).name
  const ext = path.parse(base).ext
  let n = 2
  while (fs.existsSync(dest)) {
    dest = path.join(usedImagesDir(), `${stem}_${n}${ext}`)
    n++
  }
  return dest
}

export function recycleUgcImages(): {
  ok: boolean
  moved: number
  recycleCount: number
  message: string
} {
  const used = listUsedUgcImages()
  if (!used.length) {
    const state = loadImagePoolState()
    return {
      ok: false,
      moved: 0,
      recycleCount: state.recycleCount,
      message: 'No used images to recycle',
    }
  }

  ensureImageDirs()
  const state = loadImagePoolState()
  let cleared = 0

  for (const name of used) {
    const file = path.join(usedImagesDir(), name)
    if (!fs.existsSync(file)) continue
    fs.unlinkSync(file)
    cleared++
  }

  state.recycleCount += 1
  saveImagePoolState(state)

  return {
    ok: true,
    moved: cleared,
    recycleCount: state.recycleCount,
    message: `Recycled ${cleared} image(s) — source folder ready for another shuffle (cycle ${state.recycleCount})`,
  }
}

export function pickBatchUgcImages(
  count: number,
  options?: { testMode?: boolean; categories?: string[] },
): {
  ok: boolean
  message?: string
  images?: { filename: string }[]
  recycled?: boolean
  recycleCount?: number
} {
  const n = Math.max(1, Math.min(500, Math.floor(count)))
  const testMode = options?.testMode === true
  let recycled = false
  let recycleMessage = ''

  let candidates = testMode ? listAllSourceImages() : listNewUgcImages()
  if (!testMode && candidates.length < n) {
    const recycle = recycleUgcImages()
    if (!recycle.ok) {
      if (!candidates.length) {
        return {
          ok: false,
          message:
            recycle.moved === 0 && countUsedUgcImages() === 0
              ? `No images in ${sourceImagesDir()}. Add JPG/PNG/WEBP files there first.`
              : recycle.message,
        }
      }
      return {
        ok: false,
        message: `Only ${candidates.length} unused image(s) left (need ${n}).`,
      }
    }
    recycled = true
    recycleMessage = recycle.message
    candidates = testMode ? listAllSourceImages() : listNewUgcImages()
  }

  if (candidates.length < n) {
    return {
      ok: false,
      message: `Only ${candidates.length} image(s) in pool (need ${n}).`,
    }
  }

  const state = loadImagePoolState()
  const ordered = orderCandidatesForPick(candidates, state)
  const picked: string[] = []
  const seen = new Set<string>()
  const cats =
    options?.categories?.length &&
    isChristmasGiftsNiche() &&
    !process.env.UGC_IMAGE_SOURCE_DIR &&
    !process.env.UGC_TEST_ASSETS
      ? options.categories
      : null
  if (cats) {
    for (let i = 0; i < n; i++) {
      const cat = cats[i] || cats[cats.length - 1]
      const prefer = listKaleduBackgroundsInCategory(cat).filter(
        (name) => ordered.includes(name) && !seen.has(name),
      )
      const any = ordered.filter((name) => !seen.has(name))
      const choice = prefer[0] || any[0]
      if (!choice) break
      picked.push(choice)
      seen.add(choice)
    }
  } else {
    for (const name of ordered) {
      if (seen.has(name)) continue
      picked.push(name)
      seen.add(name)
      if (picked.length >= n) break
    }
  }

  if (picked.length < n) {
    return {
      ok: false,
      message: `Only ${picked.length} unique image(s) in pool (need ${n}).`,
    }
  }

  state.lastPickOrder = ordered
  saveImagePoolState(state)

  return {
    ok: true,
    images: picked.map((filename) => ({ filename })),
    recycled,
    recycleCount: state.recycleCount,
    message: recycled ? recycleMessage : undefined,
  }
}

export function pickKaleduSlideBackgrounds(
  categories: string[],
  options?: { testMode?: boolean },
): {
  ok: boolean
  message?: string
  images?: { filename: string }[]
  recycled?: boolean
  recycleCount?: number
} {
  const n = Math.max(1, categories.length)
  return pickBatchUgcImages(n, { testMode: options?.testMode, categories })
}

export function consumeUgcImage(filename: string): { ok: boolean; message?: string } {
  const src = resolveNewImagePath(filename)
  if (!src) {
    return { ok: false, message: `Image not found in source folder: ${filename}` }
  }
  const rel = safeImageRelPath(filename) || path.basename(src)
  const destName = rel.includes('/') ? rel.replace(/\//g, '__') : path.basename(src)
  if (usedBasenames().has(destName) || usedBasenames().has(path.basename(src))) {
    return { ok: false, message: `Image already marked used: ${destName}` }
  }
  ensureImageDirs()
  const dest = uniqueUsedImageDest(destName)
  try {
    fs.copyFileSync(src, dest)
    return { ok: true, message: `Marked used (copy in used-images/${path.basename(dest)})` }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}

export function imageContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  return 'image/jpeg'
}

/** Test helper — reset shuffle cycle state. */
export function resetUgcImagePoolState(): void {
  saveImagePoolState({ recycleCount: 0, lastPickOrder: [] })
}
