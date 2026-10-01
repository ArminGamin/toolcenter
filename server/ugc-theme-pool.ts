import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { adaptUgcThemeForSeason, isUgcThemeSeasonallyValid } from './ugc-season-context.js'
import { currentProfileBrand } from './profile-brand.js'
import { profileDataPath } from './business-profiles.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ASSETS = process.env.UGC_TEST_ASSETS || path.join(__dirname, '..', 'assets', 'ugc-slides')
const TAVO_POOL_FILE = path.join(ASSETS, 'theme_pool.json')
const KALEDU_POOL_FILE = path.join(ASSETS, 'theme_pool_kaledu.json')
const TAVO_USED_FILE = path.join(ASSETS, 'used_themes.json')
const KALEDU_USED_FILE = path.join(ASSETS, 'used_themes_kaledu.json')

function isChristmasUgc(): boolean {
  return currentProfileBrand().niche === 'christmas-gifts'
}

function poolFile(): string {
  return isChristmasUgc() ? KALEDU_POOL_FILE : TAVO_POOL_FILE
}

function usedFile(): string {
  if (process.env.UGC_TEST_ASSETS) {
    return isChristmasUgc() ? KALEDU_USED_FILE : TAVO_USED_FILE
  }
  return profileDataPath('ugc-slides', 'used_themes.json')
}

function ensureUsedFile(): string {
  const file = usedFile()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  if (!fs.existsSync(file) && !isChristmasUgc() && !process.env.UGC_TEST_ASSETS && fs.existsSync(TAVO_USED_FILE)) {
    fs.copyFileSync(TAVO_USED_FILE, file)
  }
  return file
}

export type UgcThemeEntry = {
  theme: string
  hook: string
  body: string
  kind?: 'generic' | 'product'
  modeHint?: 'product_led' | 'hybrid' | 'generic'
  productHints?: string[]
}

export type UgcThemePool = {
  version: number
  product: string
  language: string
  format: string
  total: number
  categories: Record<string, UgcThemeEntry[]>
}

let poolCache: { key: string; pool: UgcThemePool } | null = null

export function loadUgcThemePool(): UgcThemePool {
  const file = poolFile()
  if (poolCache?.key === file) return poolCache.pool
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as UgcThemePool
  raw.total = Object.values(raw.categories || {}).reduce((n, list) => n + list.length, 0)
  poolCache = { key: file, pool: raw }
  return raw
}

export function listUgcThemeCategories(): string[] {
  return Object.keys(loadUgcThemePool().categories).sort()
}

export function countUgcThemes(category?: string): number {
  const pool = loadUgcThemePool()
  if (category && pool.categories[category]) {
    return pool.categories[category].length
  }
  return pool.total
}

export function getUgcThemesForCategory(category: string): UgcThemeEntry[] {
  return loadUgcThemePool().categories[category] ?? []
}

export function getAllUgcThemes(): UgcThemeEntry[] {
  const pool = loadUgcThemePool()
  return Object.values(pool.categories).flat()
}

function themeFingerprint(theme: string): string {
  return theme.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function loadUsedUgcThemes(): Set<string> {
  const file = ensureUsedFile()
  if (!fs.existsSync(file)) return new Set()
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { used?: string[] }
    return new Set((data.used ?? []).map(themeFingerprint))
  } catch {
    return new Set()
  }
}

export function pickUnusedUgcTheme(category?: string): UgcThemeEntry | null {
  const used = loadUsedUgcThemes()
  const christmas = isChristmasUgc()
  const candidates = (category ? getUgcThemesForCategory(category) : getAllUgcThemes()).filter(
    (e) => !used.has(themeFingerprint(e.theme)),
  )
  const pool = christmas
    ? candidates
    : candidates
        .filter((entry) => isUgcThemeSeasonallyValid(entry))
        .map((entry) => adaptUgcThemeForSeason(entry))
  for (const entry of pool) {
    return entry
  }
  return null
}

export function countAvailableUgcThemes(category?: string): number {
  const used = loadUsedUgcThemes()
  const candidates = category
    ? getUgcThemesForCategory(category)
    : getAllUgcThemes()
  return candidates.filter((e) => !used.has(themeFingerprint(e.theme))).length
}

export function getUgcThemePoolStatus(category?: string) {
  const pool = loadUgcThemePool()
  const used = loadUsedUgcThemes()
  const categories = listUgcThemeCategories()
  const catKey = category && category !== 'Random theme' ? category : undefined
  const candidates = catKey ? getUgcThemesForCategory(catKey) : getAllUgcThemes()
  const available = candidates.filter((e) => !used.has(themeFingerprint(e.theme))).length
  const totalInScope = candidates.length
  return {
    categories,
    total: pool.total,
    used: used.size,
    available,
    totalInScope,
    category: catKey || 'Random theme',
  }
}

export function pickBatchUgcThemes(
  count: number,
  category?: string,
  options?: { testMode?: boolean },
): {
  ok: boolean
  message?: string
  themes?: UgcThemeEntry[]
} {
  const n = Math.max(1, Math.min(500, Math.floor(count)))
  const testMode = options?.testMode === true
  const used = testMode ? new Set<string>() : loadUsedUgcThemes()
  const catKey = category && category !== 'Random theme' ? category : undefined
  let candidates = (catKey ? getUgcThemesForCategory(catKey) : getAllUgcThemes()).filter(
    (e) => !used.has(themeFingerprint(e.theme)),
  )
  if (!isChristmasUgc()) {
    candidates = candidates
      .filter((entry) => isUgcThemeSeasonallyValid(entry))
      .map((entry) => adaptUgcThemeForSeason(entry))
  }
  if (!candidates.length) {
    return {
      ok: false,
      message: testMode
        ? 'No themes in this category.'
        : `No unused themes left. Delete used_themes.json to reset.`,
    }
  }
  // Fisher–Yates shuffle
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
  }
  const picked = candidates.slice(0, n)
  if (!testMode) {
    for (const entry of picked) {
      used.add(themeFingerprint(entry.theme))
    }
    fs.mkdirSync(path.dirname(usedFile()), { recursive: true })
    fs.writeFileSync(
      usedFile(),
      JSON.stringify({ used: [...used] }, null, 2) + '\n',
      'utf8',
    )
  }
  return { ok: true, themes: picked }
}

export function resetUsedUgcThemes(): { ok: boolean; message: string } {
  fs.mkdirSync(path.dirname(usedFile()), { recursive: true })
  fs.writeFileSync(usedFile(), JSON.stringify({ used: [] }, null, 2) + '\n', 'utf8')
  const total = loadUgcThemePool().total
  return { ok: true, message: `Theme pool reset — all ${total} themes available again.` }
}

export function markUgcThemeUsed(theme: string): void {
  const used = loadUsedUgcThemes()
  used.add(themeFingerprint(theme))
  fs.mkdirSync(path.dirname(usedFile()), { recursive: true })
  fs.writeFileSync(
    usedFile(),
    JSON.stringify({ used: [...used] }, null, 2) + '\n',
    'utf8',
  )
}
