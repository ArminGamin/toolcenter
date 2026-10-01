/**
 * Folder locations that used to be hard-coded. Defaults stay the same; any
 * folder can be changed from the app (tool Settings → Folder, or More → Folders)
 * and is stored in <data>/paths.json for this machine.
 */
import fs from 'node:fs'
import path from 'node:path'
import { GLOBAL_CC_DATA } from './business-profiles.js'

export type DirKey = 'ugcImages' | 'ugcVisionRoot' | 'kaleduBackgrounds'

export const DIR_DEFAULTS: Record<DirKey, { label: string; help: string; default: string; env?: string }> = {
  ugcImages: {
    label: 'UGC photo pool (Tavo Knyga)',
    help: 'Batch picks background photos from this folder.',
    default: String.raw`D:\new-pics`,
    env: 'UGC_IMAGE_SOURCE_DIR',
  },
  kaleduBackgrounds: {
    label: 'Kalėdų Kampelis backgrounds',
    help: 'Background photos for Kalėdų Kampelis UGC slides.',
    default: String.raw`D:\jaukumas\ugc pics`,
  },
  ugcVisionRoot: {
    label: 'UGC batch output & audit',
    help: 'Batch folders, audit captures and PC logs. Applies after Restart services.',
    default: String.raw`D:\ugc-batch-vision`,
    env: 'UGC_VISION_ROOT',
  },
}

type PathsFile = { tools?: Record<string, string>; dirs?: Partial<Record<DirKey, string>> }

const FILE = path.join(GLOBAL_CC_DATA, 'paths.json')
let cache: { mtimeMs: number; data: PathsFile } | null = null

function read(): PathsFile {
  try {
    const st = fs.statSync(FILE)
    if (cache && cache.mtimeMs === st.mtimeMs) return cache.data
    const data = JSON.parse(fs.readFileSync(FILE, 'utf8')) as PathsFile
    cache = { mtimeMs: st.mtimeMs, data }
    return data
  } catch {
    return {}
  }
}

function write(data: PathsFile) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true })
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n', 'utf8')
  cache = null
}

export function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}

/** Environment variable (tests, power users) → saved override → built-in default. */
export function dirPath(key: DirKey): string {
  const spec = DIR_DEFAULTS[key]
  const fromEnv = spec.env ? process.env[spec.env]?.trim() : ''
  return fromEnv || read().dirs?.[key]?.trim() || spec.default
}

export function toolPathOverride(id: string): string | undefined {
  const value = read().tools?.[id]?.trim()
  return value || undefined
}

function validateFolder(folder: string): string {
  const clean = folder.trim().replace(/^["']|["']$/g, '')
  if (!clean) throw new Error('Folder path is empty')
  if (!path.isAbsolute(clean)) throw new Error('Use a full path, e.g. D:\\tools\\my-tool')
  if (!isDirectory(clean)) throw new Error(`Folder not found: ${clean}`)
  return path.normalize(clean)
}

export function setDirPath(key: DirKey, folder: string | null) {
  if (!(key in DIR_DEFAULTS)) throw new Error('Unknown folder')
  const data = read()
  const dirs = { ...(data.dirs || {}) }
  if (folder === null) delete dirs[key]
  else dirs[key] = validateFolder(folder)
  write({ ...data, dirs })
}

export function setToolPathOverride(id: string, folder: string | null) {
  const data = read()
  const tools = { ...(data.tools || {}) }
  if (folder === null) delete tools[id]
  else tools[id] = validateFolder(folder)
  write({ ...data, tools })
}
