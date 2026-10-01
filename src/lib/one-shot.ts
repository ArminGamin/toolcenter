import { resolveExportSize, type OneShotSizeId } from './one-shot-render'

export type OneShotVoice = 'auto' | 'i' | 'you'

export type OneShotPost = {
  text: string
  caption: string
  captions: string[]
  voice: 'i' | 'you' | 'mixed'
  theme: string
  category: string
  words: number
}

export type OneShotThemeStatus = {
  categories: string[]
  total: number
  used: number
  available: number
  totalInScope: number
  category: string
}

export type OneShotOllamaStatus = {
  ok: boolean
  online: boolean
  url: string | null
  model: string
  modelReady: boolean
  models: string[]
  message?: string
}

export const DEFAULT_ONE_SHOT_SETTINGS = {
  OLLAMA_URL: 'http://127.0.0.1:11434',
  OLLAMA_MODEL: 'llama3.1:8b',
  OLLAMA_NUM_GPU: '32',
  DISCORD_BOT_TOKEN: '',
  DISCORD_GUILD_ID: '',
  DISCORD_CATEGORY_ID: '',
}

export { resolveExportSize }
export type { OneShotSizeId }

function authHeaders(extra?: HeadersInit): HeadersInit {
  const token =
    typeof window !== 'undefined'
      ? (window as unknown as { __CC_AUTH__?: string }).__CC_AUTH__
      : undefined
  return { ...(extra || {}), ...(token ? { 'X-CC-Token': token } : {}) }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: authHeaders() })
  return (await res.json()) as T
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  })
  return (await res.json()) as T
}

export async function fetchOneShotThemeStatus(category?: string): Promise<OneShotThemeStatus> {
  const qs = category ? `&category=${encodeURIComponent(category)}` : ''
  const data = await getJson<{ ok: boolean; status: OneShotThemeStatus }>(
    `/api/one-shot?action=theme-pool-status${qs}`,
  )
  return data.status
}

export async function fetchOneShotOllamaStatus(): Promise<OneShotOllamaStatus> {
  const data = await getJson<{ ok: boolean; status: OneShotOllamaStatus }>(
    '/api/one-shot?action=ollama-status',
  )
  return data.status
}

export async function resetOneShotThemes(): Promise<{ ok: boolean; message: string }> {
  return postJson('/api/one-shot?action=reset-used-themes', {})
}

export async function generateOneShot(input: {
  category?: string
  topic?: string
  voice?: OneShotVoice
}): Promise<{ ok: boolean; post?: OneShotPost; message?: string }> {
  return postJson('/api/one-shot?action=generate', input)
}

export async function generateOneShotBatch(input: {
  count: number
  category?: string
  topic?: string
  voice?: OneShotVoice
}): Promise<{ ok: boolean; posts?: OneShotPost[]; message?: string }> {
  return postJson('/api/one-shot?action=generate-batch', input)
}

export type OneShotDiscordSettings = {
  guildId: string
  categoryId: string
  tokenConfigured: boolean
}

export async function fetchOneShotDiscordSettings(): Promise<OneShotDiscordSettings | null> {
  try {
    const data = await getJson<{ ok?: boolean; settings?: OneShotDiscordSettings }>(
      '/api/one-shot?action=discord-settings',
    )
    return data.settings || null
  } catch {
    return null
  }
}

export async function publishOneShotToDiscord(input: {
  caption: string
  text?: string
  videoBase64: string
  videoExt?: string
  filename?: string
  guildId?: string
  categoryId?: string
}): Promise<{ ok: boolean; channel?: string; channelId?: string; error?: string; message?: string }> {
  return postJson('/api/one-shot?action=publish-discord', input)
}

export function shortOllamaModelName(model: string): string {
  const trimmed = model.trim()
  if (!trimmed) return 'No model'
  const slash = trimmed.lastIndexOf('/')
  return slash >= 0 ? trimmed.slice(slash + 1) : trimmed
}
