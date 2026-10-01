/**
 * Fill Control Center vault empties from tool .env files + known defaults.
 * Run: npx tsx scripts/fill-vault-from-tools.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadVault, saveVault, VAULT_FIELDS } from '../server/cc-services.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TOOLSAI = path.resolve(__dirname, '..', '..')

const ENV_FILES = [
  path.join(TOOLSAI, 'newsletter-sender', '.env'),
  path.join(TOOLSAI, 'post-maker', '.env'),
  path.join(TOOLSAI, 'ai-lead-finder', '.env'),
  path.join(TOOLSAI, 'ai-lead-finder', 'control-center.env'),
  path.join(TOOLSAI, 'dc scraper', '.env'),
  path.join(TOOLSAI, 'dc scraper', 'control-center.env'),
  path.join(
    process.env.USERPROFILE || 'C:\\Users\\kajus',
    'Desktop',
    'Ebook biznis',
    'tavo-knyga-generator',
    '.env',
  ),
]

const KEY_MAP: Record<string, string> = {
  RESEND_API_KEY: 'RESEND_API_KEY',
  RESEND_FROM: 'RESEND_FROM',
  OLLAMA_URL: 'OLLAMA_URL',
  OLLAMA_HOST: 'OLLAMA_URL',
  OLLAMA_MODEL: 'OLLAMA_MODEL',
  GEMINI_API_KEY: 'GEMINI_API_KEY',
  GEMINI_API_KEYS: 'GEMINI_API_KEYS',
  GEMINI_MODEL: 'GEMINI_MODEL',
  DISCORD_BOT_TOKEN: 'DISCORD_BOT_TOKEN',
  CRYPTOCOMPARE_API_KEY: 'CRYPTOCOMPARE_API_KEY',
  DISCORD_STATUS_WEBHOOK: 'DISCORD_STATUS_WEBHOOK',
}

const FALLBACKS: Record<string, string> = {
  OLLAMA_URL: 'http://127.0.0.1:11434',
  OLLAMA_MODEL: 'llama3.1:8b',
}

function parseEnv(file: string): Record<string, string> {
  if (!fs.existsSync(file)) return {}
  const out: Record<string, string> = {}
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const i = line.indexOf('=')
    const key = line.slice(0, i).trim()
    let val = line.slice(i + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (key && val) out[key] = val
  }
  return out
}

function normalizeOllamaUrl(value: string): string {
  const v = value.trim()
  if (!v) return v
  if (v.startsWith('http://') || v.startsWith('https://')) return v
  return `http://${v}`
}

const collected: Record<string, string> = {}
const sources: Record<string, string> = {}

for (const file of ENV_FILES) {
  const env = parseEnv(file)
  for (const [srcKey, vaultKey] of Object.entries(KEY_MAP)) {
    const val = env[srcKey]
    if (!val) continue
    // Prefer first non-empty; don't overwrite with later weaker sources
    if (collected[vaultKey]) continue
    let final = val
    if (vaultKey === 'OLLAMA_URL') final = normalizeOllamaUrl(val)
    collected[vaultKey] = final
    sources[vaultKey] = path.relative(TOOLSAI, file)
  }
}

for (const [k, v] of Object.entries(FALLBACKS)) {
  if (!collected[k]) {
    collected[k] = v
    sources[k] = 'defaults'
  }
}

const current = loadVault()
const updates: Record<string, string> = {}
const vaultKeys = new Set(VAULT_FIELDS.map((f) => f.key))

for (const [key, value] of Object.entries(collected)) {
  if (!vaultKeys.has(key as (typeof VAULT_FIELDS)[number]['key'])) continue
  const existing = (current[key] || '').trim()
  // Always fill empty; also fill Resend if empty even when Discord status already set
  if (!existing) {
    updates[key] = value
  }
}

const result = saveVault(updates)
const filled = Object.keys(updates)

console.log(result.ok ? 'Vault updated' : `Vault save failed: ${result.message}`)
console.log('Filled fields:')
for (const key of filled) {
  const v = updates[key]
  const masked =
    key.includes('KEY') || key.includes('TOKEN') || key.includes('WEBHOOK')
      ? `${v.slice(0, 6)}…(${v.length} chars)`
      : v
  console.log(`  ${key} ← ${sources[key]} · ${masked}`)
}
if (!filled.length) {
  console.log('  (nothing empty to fill — vault already had values)')
}
