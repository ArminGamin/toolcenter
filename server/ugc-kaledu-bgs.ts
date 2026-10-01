import { dirPath } from './paths-config.js'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

export const KALEDU_BG_CATEGORIES = [
  'COZY_HOME',
  'CHRISTMAS_TREE',
  'GIFT_WRAPPING',
  'TABLE_SETTING',
  'WINTER_WINDOW',
  'UNBOXING',
  'LIGHTS',
] as const

export type KaleduBgCategory = (typeof KALEDU_BG_CATEGORIES)[number]

/** Kalėdų background folder (default D:\jaukumas\ugc pics; change under More → Folders). */
export function kaleduBgsDir(): string {
  return dirPath('kaleduBackgrounds')
}
export const KALEDU_BGS_DIR = kaleduBgsDir()

const BG_COLORS: Record<KaleduBgCategory, [number, number, number]> = {
  COZY_HOME: [120, 72, 48],
  CHRISTMAS_TREE: [28, 88, 48],
  GIFT_WRAPPING: [160, 36, 36],
  TABLE_SETTING: [140, 110, 72],
  WINTER_WINDOW: [72, 110, 148],
  UNBOXING: [180, 140, 80],
  LIGHTS: [180, 140, 40],
}

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp'])

function crc32(buf: Buffer): number {
  let crc = ~0
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

export function encodeSolidPng(width: number, height: number, rgb: [number, number, number]): Buffer {
  const rowBytes = width * 3 + 1
  const raw = Buffer.alloc(rowBytes * height)
  for (let y = 0; y < height; y++) {
    const row = y * rowBytes
    raw[row] = 0
    for (let x = 0; x < width; x++) {
      const o = row + 1 + x * 3
      raw[o] = rgb[0]
      raw[o + 1] = rgb[1]
      raw[o + 2] = rgb[2]
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function isImageFile(name: string): boolean {
  return IMAGE_EXTS.has(path.extname(name).toLowerCase())
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

export function ensureKaleduBgFallbacks(dir = kaleduBgsDir()): void {
  fs.mkdirSync(dir, { recursive: true })
  if (walkImageRelPaths(dir).length > 0) return
  for (const cat of KALEDU_BG_CATEGORIES) {
    const folder = path.join(dir, cat)
    fs.mkdirSync(folder, { recursive: true })
    const existing = fs.readdirSync(folder).filter((name) => isImageFile(name))
    if (existing.length) continue
    const file = path.join(folder, `${cat.toLowerCase()}-fallback.png`)
    fs.writeFileSync(file, encodeSolidPng(540, 960, BG_COLORS[cat]))
  }
}

export function listKaleduBackgroundRelPaths(dir = kaleduBgsDir()): string[] {
  ensureKaleduBgFallbacks(dir)
  return walkImageRelPaths(dir)
}

export function listKaleduBackgroundsInCategory(
  category: string,
  dir = kaleduBgsDir(),
): string[] {
  ensureKaleduBgFallbacks(dir)
  const key = KALEDU_BG_CATEGORIES.includes(category as KaleduBgCategory)
    ? category
    : 'COZY_HOME'
  const folder = path.join(dir, key)
  if (!fs.existsSync(folder)) return []
  return fs
    .readdirSync(folder)
    .filter((name) => isImageFile(name))
    .map((name) => `${key}/${name}`)
    .sort((a, b) => a.localeCompare(b))
}

export function inferKaleduBgCategory(text: string, role?: string): KaleduBgCategory {
  const blob = `${text} ${role || ''}`.toLocaleLowerCase('lt-LT')
  if (/eglut|medis|eglut/i.test(blob)) return 'CHRISTMAS_TREE'
  if (/pakuoj|dėžut|popier|kaspin/i.test(blob)) return 'GIFT_WRAPPING'
  if (/išpaku|unbox/i.test(blob)) return 'UNBOXING'
  if (/stalas|vakarien|kūč/i.test(blob)) return 'TABLE_SETTING'
  if (/lang|sniegas|lauke/i.test(blob)) return 'WINTER_WINDOW'
  if (/žvak|švies|girliand|žibint/i.test(blob)) return 'LIGHTS'
  return 'COZY_HOME'
}
