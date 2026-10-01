import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ASSETS = path.join(__dirname, '..', 'assets', 'one-shot')
const POOL_FILE = path.join(ASSETS, 'theme_pool.json')
const USED_FILE = path.join(ASSETS, 'used_themes.json')

export type OneShotThemePool = {
  version: number
  language: string
  format: string
  categories: Record<string, string[]>
}

let poolCache: OneShotThemePool | null = null

export function invalidateOneShotThemePoolCache() {
  poolCache = null
}

function themeFingerprint(theme: string): string {
  return theme.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function loadOneShotThemePool(): OneShotThemePool {
  if (poolCache) return poolCache
  const raw = JSON.parse(fs.readFileSync(POOL_FILE, 'utf8')) as OneShotThemePool
  const categories: Record<string, string[]> = { ...raw.categories }
  const extraFiles = fs
    .readdirSync(ASSETS)
    .filter((file) => file.startsWith('theme_pool') && file.endsWith('.json') && file !== 'theme_pool.json')
    .sort()
  for (const file of extraFiles) {
    const extra = JSON.parse(fs.readFileSync(path.join(ASSETS, file), 'utf8')) as {
      categories?: Record<string, string[]>
    }
    for (const [category, themes] of Object.entries(extra.categories || {})) {
      const seen = new Set((categories[category] || []).map(themeFingerprint))
      const merged = [...(categories[category] || [])]
      for (const theme of themes) {
        const fp = themeFingerprint(theme)
        if (!fp || seen.has(fp)) continue
        seen.add(fp)
        merged.push(theme)
      }
      categories[category] = merged
    }
  }
  poolCache = { ...raw, categories }
  return poolCache
}

export function listOneShotCategories(): string[] {
  return Object.keys(loadOneShotThemePool().categories).sort()
}

export function getAllOneShotThemes(): { category: string; theme: string }[] {
  const pool = loadOneShotThemePool()
  const out: { category: string; theme: string }[] = []
  for (const [category, themes] of Object.entries(pool.categories)) {
    for (const theme of themes) out.push({ category, theme })
  }
  return out
}

export function getOneShotThemesForCategory(category: string): { category: string; theme: string }[] {
  const themes = loadOneShotThemePool().categories[category] ?? []
  return themes.map((theme) => ({ category, theme }))
}

export function countOneShotThemes(): number {
  return getAllOneShotThemes().length
}

export function loadUsedOneShotThemes(): Set<string> {
  if (!fs.existsSync(USED_FILE)) return new Set()
  try {
    const data = JSON.parse(fs.readFileSync(USED_FILE, 'utf8')) as { used?: string[] }
    return new Set((data.used ?? []).map(themeFingerprint))
  } catch {
    return new Set()
  }
}

function persistUsed(used: Set<string>) {
  fs.mkdirSync(ASSETS, { recursive: true })
  fs.writeFileSync(USED_FILE, JSON.stringify({ used: [...used] }, null, 2) + '\n', 'utf8')
}

export function getOneShotThemePoolStatus(category?: string) {
  const used = loadUsedOneShotThemes()
  const categories = listOneShotCategories()
  const catKey = category && category !== 'Random (all)' ? category : undefined
  const candidates = catKey ? getOneShotThemesForCategory(catKey) : getAllOneShotThemes()
  const available = candidates.filter((e) => !used.has(themeFingerprint(e.theme))).length
  return {
    categories,
    total: countOneShotThemes(),
    used: used.size,
    available,
    totalInScope: candidates.length,
    category: catKey || 'Random (all)',
  }
}

export function pickUnusedOneShotTheme(category?: string): { category: string; theme: string } | null {
  const used = loadUsedOneShotThemes()
  const catKey = category && category !== 'Random (all)' ? category : undefined
  const candidates = (catKey ? getOneShotThemesForCategory(catKey) : getAllOneShotThemes()).filter(
    (e) => !used.has(themeFingerprint(e.theme)),
  )
  if (!candidates.length) return null
  const pick = candidates[Math.floor(Math.random() * candidates.length)]
  used.add(themeFingerprint(pick.theme))
  persistUsed(used)
  return pick
}

export function pickBatchOneShotThemes(
  count: number,
  category?: string,
): { ok: boolean; message?: string; themes?: { category: string; theme: string }[] } {
  const n = Math.max(1, Math.min(50, Math.floor(count)))
  const used = loadUsedOneShotThemes()
  const catKey = category && category !== 'Random (all)' ? category : undefined
  const candidates = (catKey ? getOneShotThemesForCategory(catKey) : getAllOneShotThemes()).filter(
    (e) => !used.has(themeFingerprint(e.theme)),
  )
  if (!candidates.length) {
    return {
      ok: false,
      message: 'No unused themes left. Reset the theme pool in Settings.',
    }
  }
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
  }
  const picked = candidates.slice(0, n)
  for (const entry of picked) used.add(themeFingerprint(entry.theme))
  persistUsed(used)
  return { ok: true, themes: picked }
}

export function resetUsedOneShotThemes(): { ok: boolean; message: string } {
  invalidateOneShotThemePoolCache()
  persistUsed(new Set())
  const total = countOneShotThemes()
  return { ok: true, message: `Theme pool reset. All ${total} themes available again.` }
}
