/**
 * Hand-checked Lithuanian line kits for Kalėdų Kampelis (assets/ugc-slides/kaledu_kits.json).
 *
 * Theme kits: per theme-pool entry, interchangeable on-theme lines for every story role
 * (hook / context / build / close). Product kits: per catalog SKU, reveal lines (name + catalog
 * reason), a „use" line for the slide right after the reveal (pronoun only) and closing payoffs.
 * Fallback repairs try these before the generic stock pools, so a repaired slide stays on the
 * post's theme instead of drifting into generic gift-shopping advice.
 *
 * Every line was reviewed against references/lithuanian-grammar-vlkk.md and must pass the
 * deterministic gates (server/__tests__/ugc-kaledu-kits.test.ts). Leaf module: fs + path only.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export type KaleduThemeKit = {
  id: number
  theme: string
  recipient: string
  hooks: Array<{ title: string; body: string }>
  context: string[]
  build: string[]
  close: string[]
}

export type KaleduProductKit = {
  slug: string
  gender: 'm' | 'f' | 'mpl' | 'fpl'
  reveal: string[]
  use: string[]
  close: string[]
}

type KitFile = { themes: KaleduThemeKit[]; products: KaleduProductKit[] }

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const KIT_FILE = process.env.UGC_KALEDU_KITS_FILE || path.join(__dirname, '..', '..', 'assets', 'ugc-slides', 'kaledu_kits.json')

let cache: { mtime: number; data: KitFile } | null = null

function loadKits(): KitFile {
  try {
    const mtime = fs.statSync(KIT_FILE).mtimeMs
    if (cache && cache.mtime === mtime) return cache.data
    const raw = JSON.parse(fs.readFileSync(KIT_FILE, 'utf8')) as Partial<KitFile>
    const data: KitFile = { themes: raw.themes || [], products: raw.products || [] }
    cache = { mtime, data }
    return data
  } catch {
    return { themes: [], products: [] }
  }
}

export function kaleduThemeKits(): KaleduThemeKit[] {
  return loadKits().themes
}

export function kaleduProductKits(): KaleduProductKit[] {
  return loadKits().products
}

function themeKey(text: string): string {
  return String(text || '')
    .toLocaleLowerCase('lt-LT')
    .replace(/[„“"”.!?,]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The kit whose theme title appears in the post's theme text (longest match wins). */
export function findKaleduThemeKit(themeText: string): KaleduThemeKit | null {
  const probe = ` ${themeKey(themeText)} `
  let best: KaleduThemeKit | null = null
  for (const kit of kaleduThemeKits()) {
    const key = themeKey(kit.theme)
    if (key.length < 8 || !probe.includes(` ${key} `)) continue
    if (!best || key.length > themeKey(best.theme).length) best = kit
  }
  return best
}

export function findKaleduProductKit(slugOrId: string): KaleduProductKit | null {
  const id = String(slugOrId || '').trim()
  if (!id) return null
  return kaleduProductKits().find((kit) => kit.slug === id) || null
}

/** Body lines of a theme kit for one story role. */
export function themeKitLines(kit: KaleduThemeKit | null, role: string): string[] {
  if (!kit) return []
  if (role === 'context') return [...kit.context]
  if (role === 'close' || role === 'punch') return [...kit.close]
  if (role === 'build') return [...kit.build]
  return []
}

/** True when the text contains a whole line from the theme's kit (used by the theme-drift check). */
export function textUsesThemeKit(themeText: string, text: string): boolean {
  const kit = findKaleduThemeKit(themeText)
  if (!kit) return false
  const probe = themeKey(text)
  const lines = [...kit.hooks.flatMap((h) => [h.title, h.body]), ...kit.context, ...kit.build, ...kit.close]
  return lines.some((line) => {
    const key = themeKey(line)
    return key.length >= 12 && probe.includes(key)
  })
}
