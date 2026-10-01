import path from 'node:path'
import { loadVault, saveVault, TOOLSAI_ROOT } from './cc-services.js'
import { readEnvFile } from './launch-runtime.js'
import { readPostMakerDiscordApp } from './ugc-discord-settings.js'

export const EBOOK_ROOT = path.join(
  process.env.USERPROFILE || 'C:\\Users\\kajus',
  'Desktop',
  'Ebook biznis',
  'tavo-knyga-generator',
)

const POST_MAKER_ENV = path.join(TOOLSAI_ROOT, 'post-maker', '.env')

/** Default Ollama model — OpenEuroLLM GPU wrapper (real LT + 100% GPU on 8GB). */
export const UGC_DEFAULT_OLLAMA_MODEL = 'ugc-lt-gpu'

/** Upstream LT model — Modelfile forces num_gpu=1; always use ugc-lt-gpu wrapper. */
export const UGC_OPENEURO_MODEL = 'jobautomation/OpenEuroLLM-Lithuanian'
export const UGC_OPENEURO_GPU_MODEL = 'ugc-lt-gpu'

/**
 * Default ctx — 4096 leaves room for short batch SYSTEM + 3-slide JSON on 8GB AMD.
 */
export const UGC_DEFAULT_OLLAMA_NUM_CTX = 4096

/** Floor — enough for short SYSTEM + 2–3 slide JSON. */
export const UGC_MIN_OLLAMA_NUM_CTX = 3072

/** Unload model from RAM after UGC session ends. */
export const UGC_OLLAMA_KEEP_ALIVE = 0

/** Keep model loaded while generating. */
export const UGC_OLLAMA_KEEP_ALIVE_ACTIVE = '30m' as const

export function resolveUgcOllamaKeepAlive(): number {
  return UGC_OLLAMA_KEEP_ALIVE
}

export function resolveUgcOllamaKeepAliveActive(): number | string {
  const override = process.env.UGC_OLLAMA_KEEP_ALIVE?.trim()
  if (override) return override
  return UGC_OLLAMA_KEEP_ALIVE_ACTIVE
}

/** Batch ctx — match default; short SYSTEM override frees output tokens. */
export const UGC_BATCH_OLLAMA_NUM_CTX = 4096

export function resolveUgcOllamaNumCtxBatch(): number {
  return Math.min(UGC_BATCH_OLLAMA_NUM_CTX, resolveUgcOllamaNumCtx())
}

/**
 * GPU layers for UGC on 8GB cards.
 * 99 = OOM/AMD timeout. 28 = too much CPU (very slow).
 * 32 = speed/VRAM sweet spot on RX 5700 XT.
 */
export const UGC_FORCE_OLLAMA_NUM_GPU = 32

/** Hard ceiling — vault "99" used to mean full offload; clamp for 8GB safety. */
export const UGC_MAX_SAFE_OLLAMA_NUM_GPU = 34

export const UGC_DEFAULT_OLLAMA_NUM_GPU = String(UGC_FORCE_OLLAMA_NUM_GPU)

export function resolveUgcOllamaNumGpu(): number {
  const vault = loadVault()
  const raw = (vault.OLLAMA_NUM_GPU || '').trim()
  if (raw && raw !== 'auto') {
    const n = Number(raw)
    // 0–1 = Modelfile/CPU trap — never honor
    if (Number.isFinite(n) && n >= 2) {
      return Math.min(UGC_MAX_SAFE_OLLAMA_NUM_GPU, Math.round(n))
    }
  }
  return UGC_FORCE_OLLAMA_NUM_GPU
}

const LEGACY_UGC_OLLAMA_MODELS = new Set([
  '',
  'llama3.1:8b',
  'llama3.1',
  'llama3.1:latest',
  'ugc-lt-fast',
  'ugc-lt-fast:latest',
  'jobautomation/OpenEuroLLM-Lithuanian',
  'jobautomation/OpenEuroLLM-Lithuanian:latest',
  'OpenEuroLLM-Lithuanian',
  'OpenEuroLLM-Lithuanian:latest',
])

/** PostMaker Discord category (post-maker/discord_settings.json). */
export const POST_MAKER_DISCORD_CATEGORY_ID = '1519313422309654599'

/** UGC Slides Discord category (Control Center batch — separate from PostMaker). */
export const UGC_DEFAULT_DISCORD_CATEGORY_ID = '1533864166610436096'

export const UGC_VAULT_KEYS = [
  'OLLAMA_URL',
  'OLLAMA_MODEL',
  'OLLAMA_NUM_GPU',
  'OLLAMA_NUM_CTX',
  'DISCORD_BOT_TOKEN',
  'DISCORD_GUILD_ID',
  'DISCORD_CATEGORY_ID',
  'UGC_BATCH_TEST_MODE',
] as const

export type UgcVaultKey = (typeof UGC_VAULT_KEYS)[number]

export function loadEbookEnv(): Record<string, string> {
  return readEnvFile(path.join(EBOOK_ROOT, '.env'))
}

export function loadPostMakerEnv(): Record<string, string> {
  return readEnvFile(POST_MAKER_ENV)
}

export function resolveUgcOllamaNumCtx(): number {
  const vault = loadVault()
  const raw = (vault.OLLAMA_NUM_CTX || '').trim()
  const n = Number(raw)
  if (Number.isFinite(n) && n >= 512) {
    const floored = Math.max(UGC_MIN_OLLAMA_NUM_CTX, Math.round(n))
    if (needsUgcLiteOllama()) return Math.min(4096, floored)
    return Math.min(32768, floored)
  }
  return UGC_DEFAULT_OLLAMA_NUM_CTX
}

/**
 * Model for UGC copy.
 * Never use raw llama3.1 / ugc-lt-fast for LT slides — they emit word salad.
 * Never use upstream OpenEuroLLM (num_gpu=1) — use ugc-lt-gpu instead.
 */
export function resolveUgcOllamaModel(): string {
  const vault = loadVault()
  const postMaker = loadPostMakerEnv()
  const raw = (vault.OLLAMA_MODEL || postMaker.OLLAMA_MODEL || '').trim()
  if (!raw || LEGACY_UGC_OLLAMA_MODELS.has(raw)) return UGC_DEFAULT_OLLAMA_MODEL
  if (/openeurollm/i.test(raw) && !/ugc-lt-gpu/i.test(raw)) return UGC_OPENEURO_GPU_MODEL
  if (/ugc-lt-fast|llama3\.1/i.test(raw)) return UGC_DEFAULT_OLLAMA_MODEL
  return raw
}

/** Lithuanian-tuned / Gemma models need short prompts + tight token caps. */
export function needsUgcLiteOllama(model?: string): boolean {
  const name = (model || resolveUgcOllamaModel()).toLowerCase()
  return /openeurollm|lithuanian|eurollm|gemma|ugc-lt-gpu/i.test(name)
}

/** Vault + post-maker .env — same Ollama/Discord sources as PostMaker. */
export function resolveUgcVaultSettings(): Record<UgcVaultKey, string> {
  const vault = loadVault()
  const pm = readPostMakerDiscordApp()
  const postMaker = loadPostMakerEnv()

  return {
    OLLAMA_URL: (
      vault.OLLAMA_URL ||
      postMaker.OLLAMA_URL ||
      'http://127.0.0.1:11434'
    ).trim(),
    OLLAMA_MODEL: resolveUgcOllamaModel(),
    OLLAMA_NUM_GPU: String(resolveUgcOllamaNumGpu()),
    OLLAMA_NUM_CTX: String(resolveUgcOllamaNumCtx()),
    DISCORD_BOT_TOKEN: (vault.DISCORD_BOT_TOKEN || pm.token || '').trim(),
    DISCORD_GUILD_ID: (vault.DISCORD_GUILD_ID || pm.guildId || '').trim(),
    DISCORD_CATEGORY_ID: (
      vault.DISCORD_CATEGORY_ID ||
      UGC_DEFAULT_DISCORD_CATEGORY_ID ||
      ''
    ).trim(),
    UGC_BATCH_TEST_MODE: (vault.UGC_BATCH_TEST_MODE || 'false').trim(),
  }
}

/** Pull PostMaker Ollama settings into vault once so the UGC UI shows them. */
export function importPostMakerOllamaToVault(): boolean {
  const vault = loadVault()
  const postMaker = loadPostMakerEnv()
  const updates: Record<string, string> = {}

  if (!(vault.OLLAMA_URL || '').trim() && (postMaker.OLLAMA_URL || '').trim()) {
    updates.OLLAMA_URL = postMaker.OLLAMA_URL.trim()
  }
  // UGC uses OpenEuroLLM-Lithuanian by default — do not inherit post-maker's model.

  if (!Object.keys(updates).length) return false
  saveVault(updates)
  return true
}
