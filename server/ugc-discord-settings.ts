import fs from 'node:fs'
import path from 'node:path'
import { saveVault, TOOLSAI_ROOT } from './cc-services.js'
import { resolveUgcVaultSettings, UGC_DEFAULT_DISCORD_CATEGORY_ID } from './ugc-env-bridge.js'

export type UgcDiscordSettings = {
  guildId: string
  categoryId: string
}

export type UgcDiscordSettingsView = UgcDiscordSettings & {
  tokenConfigured: boolean
  source: 'post-maker' | 'vault' | 'empty'
}

/** PostMaker discord_settings.json — single source of truth (1:1 with post-maker/discord_publisher.py). */
export const POST_MAKER_DISCORD_FILE = path.join(
  TOOLSAI_ROOT,
  'post-maker',
  'assets',
  'post_maker_presets',
  'discord_settings.json',
)

function readJsonFile(file: string): Record<string, unknown> {
  try {
    if (!fs.existsSync(file)) return {}
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function writePostMakerDiscordJson(data: Record<string, unknown>) {
  fs.mkdirSync(path.dirname(POST_MAKER_DISCORD_FILE), { recursive: true })
  fs.writeFileSync(POST_MAKER_DISCORD_FILE, JSON.stringify(data, null, 2), 'utf8')
}

export function readPostMakerDiscordApp(): {
  token: string
  guildId: string
  categoryId: string
} {
  const data = readJsonFile(POST_MAKER_DISCORD_FILE)
  return {
    token: String(data.token || '').trim(),
    guildId: String(data.guild_id || '').trim(),
    categoryId: String(data.category_id || '').trim(),
  }
}

export function savePostMakerDiscordApp(settings: {
  token?: string
  guildId?: string
  categoryId?: string
}) {
  const data = readJsonFile(POST_MAKER_DISCORD_FILE)
  if (settings.token !== undefined) data.token = settings.token.trim()
  if (settings.guildId !== undefined) data.guild_id = settings.guildId.trim()
  if (settings.categoryId !== undefined) data.category_id = settings.categoryId.trim()
  writePostMakerDiscordJson(data)
}

export function loadUgcDiscordSettings(): UgcDiscordSettingsView {
  const merged = resolveUgcVaultSettings()
  const pm = readPostMakerDiscordApp()
  const tokenConfigured = Boolean(merged.DISCORD_BOT_TOKEN)
  const guildId = merged.DISCORD_GUILD_ID || pm.guildId
  const categoryId = merged.DISCORD_CATEGORY_ID || UGC_DEFAULT_DISCORD_CATEGORY_ID
  const source = guildId ? (pm.guildId ? 'post-maker' : 'vault') : 'empty'
  return { guildId, categoryId, tokenConfigured, source }
}

export function saveUgcDiscordSettings(settings: UgcDiscordSettings): { ok: boolean; message: string } {
  return saveVault({
    DISCORD_GUILD_ID: settings.guildId,
    DISCORD_CATEGORY_ID: settings.categoryId,
  })
}

export function resolveDiscordBotToken(): string {
  return resolveUgcVaultSettings().DISCORD_BOT_TOKEN
}

export function resolveDiscordCredentials(
  overrides?: Partial<UgcDiscordSettings>,
): { token: string; guildId: string; categoryId: string } {
  const merged = resolveUgcVaultSettings()
  const pm = readPostMakerDiscordApp()
  return {
    token: merged.DISCORD_BOT_TOKEN,
    guildId: (overrides?.guildId || merged.DISCORD_GUILD_ID || pm.guildId || '').trim(),
    categoryId: (
      overrides?.categoryId ||
      merged.DISCORD_CATEGORY_ID ||
      UGC_DEFAULT_DISCORD_CATEGORY_ID ||
      ''
    ).trim(),
  }
}

type CounterEntry = { next_post?: number; nextPost?: number }

function legacyCategoryKeys(categoryId: string, guildId: string): string[] {
  if (categoryId) return [categoryId, `${guildId}:${categoryId}`]
  return [`guild:${guildId}`]
}

function safeNextPost(entry?: CounterEntry | null): number {
  if (!entry) return 1
  const raw = entry.next_post ?? entry.nextPost
  const n = Number(raw)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1
}

export function readCategoryCounters(): Record<string, CounterEntry> {
  const raw = readJsonFile(POST_MAKER_DISCORD_FILE).category_counters
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, CounterEntry> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v && typeof v === 'object') out[k] = v as CounterEntry
  }
  return out
}

function counterEntry(
  counters: Record<string, CounterEntry>,
  categoryKey: string,
  categoryId: string,
  guildId: string,
): { entry: CounterEntry | null; isNewCategory: boolean } {
  if (counters[categoryKey]) {
    return { entry: counters[categoryKey], isNewCategory: false }
  }
  for (const legacy of legacyCategoryKeys(categoryId, guildId)) {
    if (counters[legacy]) {
      return { entry: counters[legacy], isNewCategory: false }
    }
  }
  return { entry: null, isNewCategory: true }
}

/** Match post-maker/discord_publisher.py _plan_post_numbers for a single post. */
export function planNextPostNumber(
  taken: Set<number>,
  categoryKey: string,
  guildId: string,
  categoryId: string,
): number {
  const counters = readCategoryCounters()
  const { entry, isNewCategory } = counterEntry(counters, categoryKey, categoryId, guildId)

  let cursor: number
  if (isNewCategory) {
    cursor = taken.size === 0 ? 1 : Math.max(...taken) + 1
  } else {
    const persisted = safeNextPost(entry)
    cursor = Math.max(persisted, taken.size ? Math.max(...taken) + 1 : 1)
  }

  while (taken.has(cursor)) cursor += 1
  return cursor
}

export function saveCategoryNextPost(
  categoryKey: string,
  nextPost: number,
  guildId: string,
  categoryId: string,
) {
  const data = readJsonFile(POST_MAKER_DISCORD_FILE)
  const counters = readCategoryCounters()
  for (const legacy of legacyCategoryKeys(categoryId, guildId)) {
    delete counters[legacy]
  }
  counters[categoryKey] = { next_post: Math.max(1, nextPost) }
  data.category_counters = counters
  writePostMakerDiscordJson(data)
}
