import { loadVault } from './cc-services.js'
import { loadEbookEnv } from './ugc-env-bridge.js'

const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash'
const KEY_COOLDOWN_MS = 120_000
const QUOTA_COOLDOWN_MS = 3_600_000

const MODEL_ALIASES: Record<string, string> = {
  'gemini-2.5-flash': 'gemini-3.5-flash',
  'gemini-2.0-flash': 'gemini-3.5-flash',
  'gemini-2.0-flash-001': 'gemini-3.5-flash',
}

let roundRobinIndex = 0
const cooldownUntil = new Map<string, number>()

function resolveGeminiModelName(raw: string): string {
  const key = raw.trim()
  if (!key) return DEFAULT_GEMINI_MODEL
  return MODEL_ALIASES[key] || key
}

function resolveGeminiSettings(): { apiKeys: string; apiKey: string; model: string } {
  const vault = loadVault()
  const ebook = loadEbookEnv()
  return {
    apiKeys: (vault.GEMINI_API_KEYS || ebook.GEMINI_API_KEYS || '').trim(),
    apiKey: (vault.GEMINI_API_KEY || ebook.GEMINI_API_KEY || '').trim(),
    model: (vault.GEMINI_MODEL || ebook.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim(),
  }
}

export function parseGeminiApiKeys(): string[] {
  const settings = resolveGeminiSettings()
  const keys: string[] = []
  const seen = new Set<string>()
  for (const part of settings.apiKeys.split(/[,;\n]+/)) {
    const k = part.trim()
    if (k && !seen.has(k)) {
      keys.push(k)
      seen.add(k)
    }
  }
  const single = settings.apiKey.trim()
  if (single && !seen.has(single)) {
    keys.unshift(single)
  }
  return keys
}

export function resolveGeminiApiKey(): string {
  return parseGeminiApiKeys()[0] || ''
}

export function resolveGeminiModel(): string {
  return resolveGeminiModelName(resolveGeminiSettings().model || DEFAULT_GEMINI_MODEL)
}

export function isGeminiConfigured(): boolean {
  return parseGeminiApiKeys().length > 0
}

function minimumOutputTokens(model: string, requested: number): number {
  if (model.startsWith('gemini-3') && requested >= 1024) {
    return Math.min(Math.max(requested + 4096, 8192), 65536)
  }
  return Math.max(requested, 64)
}

function markKeyCooldown(apiKey: string, message: string) {
  const cooldown = /429|quota|RESOURCE_EXHAUSTED/i.test(message)
    ? QUOTA_COOLDOWN_MS
    : /503|unavailable|overloaded/i.test(message)
      ? KEY_COOLDOWN_MS
      : 0
  if (cooldown > 0) {
    cooldownUntil.set(apiKey, Date.now() + cooldown)
  }
}

async function geminiRequest(
  prompt: string,
  apiKey: string,
  model: string,
  options?: { temperature?: number; maxOutputTokens?: number },
): Promise<string> {
  const maxOutputTokens = minimumOutputTokens(model, options?.maxOutputTokens ?? 4096)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: options?.temperature ?? 0.8,
        maxOutputTokens,
      },
    }),
    signal: AbortSignal.timeout(120_000),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(errText.trim().slice(0, 240) || `Gemini error (${res.status})`)
  }
  const payload = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text?.trim()) {
    throw new Error('Gemini returned empty response')
  }
  return text.trim()
}

export async function geminiGenerateJson(
  prompt: string,
  options?: { temperature?: number; maxOutputTokens?: number },
): Promise<string> {
  const keys = parseGeminiApiKeys()
  if (!keys.length) {
    throw new Error('GEMINI_NOT_CONFIGURED')
  }
  const model = resolveGeminiModel()
  const now = Date.now()
  const errors: string[] = []
  const maxAttempts = Math.max(keys.length * 2, 2)

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const idx = (roundRobinIndex + attempt) % keys.length
    const apiKey = keys[idx]
    if ((cooldownUntil.get(apiKey) || 0) > now && attempt < keys.length) continue
    try {
      const text = await geminiRequest(prompt, apiKey, model, options)
      roundRobinIndex = (idx + 1) % keys.length
      return text
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(msg)
      markKeyCooldown(apiKey, msg)
      // Transient network blip — brief backoff then retry same/next key
      if (/fetch failed|Failed to fetch|ECONNRESET|ETIMEDOUT|unavailable|503|429/i.test(msg)) {
        await new Promise((r) => setTimeout(r, 400 + attempt * 350))
        continue
      }
    }
  }

  throw new Error(errors[0] || 'All Gemini API keys failed')
}
