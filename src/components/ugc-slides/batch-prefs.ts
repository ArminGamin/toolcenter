
export const BATCH_PREFS_KEY = 'cc-ugc-batch-prefs-v3'

export const BATCH_DISCORD_POSTED_KEY = 'cc-ugc-batch-discord-posted'

export function loadDiscordPosted(): Set<number> {
  try {
    const raw = sessionStorage.getItem(BATCH_DISCORD_POSTED_KEY)
    return raw ? new Set(JSON.parse(raw) as number[]) : new Set()
  } catch {
    return new Set()
  }
}

export type BatchPrefs = {
  batchCount: string
  slideMin: string
  slideMax: string
  outputFolder: string
  postToDiscord: boolean
  category: string
}

export const VISION_BATCH_OUTPUT = 'D:\\ugc-batch-vision\\batch'

export function loadPrefs(): BatchPrefs {
  try {
    let raw = localStorage.getItem(BATCH_PREFS_KEY)
    if (!raw) {
      raw = localStorage.getItem('cc-ugc-batch-prefs-v2')
    }
    if (!raw) {
      raw = localStorage.getItem('cc-ugc-batch-prefs-v1')
    }
    if (!raw) throw new Error('empty')
    const p = JSON.parse(raw) as Partial<BatchPrefs>
    return {
      batchCount: '5',
      slideMin: p.slideMin ?? '3',
      slideMax: p.slideMax ?? '7',
      outputFolder: VISION_BATCH_OUTPUT,
      postToDiscord: p.postToDiscord ?? true,
      category: p.category ?? 'Random theme',
    }
  } catch {
    return {
      batchCount: '5',
      slideMin: '3',
      slideMax: '7',
      outputFolder: VISION_BATCH_OUTPUT,
      postToDiscord: true,
      category: 'Random theme',
    }
  }
}

export function savePrefs(prefs: BatchPrefs) {
  try {
    let raw = localStorage.getItem(BATCH_PREFS_KEY)
    const existing = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    localStorage.setItem(BATCH_PREFS_KEY, JSON.stringify({ ...existing, ...prefs }))
  } catch {
    localStorage.setItem(BATCH_PREFS_KEY, JSON.stringify(prefs))
  }
}

export function estimateMinutes(count: number, slideMin: number, slideMax: number, discord: boolean) {
  const avgSlides = (slideMin + slideMax) / 2
  const chunks = Math.ceil(avgSlides / 3)
  const warmSec = 45
  const perCallSec = 55
  const perPostSec = warmSec / count + chunks * 2 * perCallSec + (discord ? 10 : 0)
  const totalMin = Math.ceil((count * perPostSec) / 60)
  const min = Math.max(2, Math.floor(totalMin * 0.85))
  const max = Math.max(min + 2, Math.ceil(totalMin * 1.25))
  const discordExtra = discord ? ' + Discord' : ''
  return `Est. ~${min}-${max} min for ${count} posts (≤${slideMax} slides, ~${chunks} chunk(s)/post)${discordExtra}`
}

export function saveDiscordPosted(set: Set<number>) {
  sessionStorage.setItem(BATCH_DISCORD_POSTED_KEY, JSON.stringify([...set]))
}

export function clearDiscordPosted() {
  sessionStorage.removeItem(BATCH_DISCORD_POSTED_KEY)
}
