import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { readVaultFile, writeEncryptedVault } from './vault-crypto.js'
import {
  BUSINESS_PROFILES_DIR,
  GLOBAL_CC_DATA,
  currentBusinessProfile,
  currentProfileDataDir,
  ensureBusinessProfiles,
} from './business-profiles.js'

const execFileAsync = promisify(execFile)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const TOOLSAI_ROOT = path.resolve(__dirname, '..', '..')
/** Machine-level root retained for runtime/model data and backwards-compatible imports. */
export const CC_DATA = GLOBAL_CC_DATA
const SYSTEM_VAULT_FILE = path.join(CC_DATA, 'system-vault.json')

export function vaultFilePath() {
  return path.join(currentProfileDataDir(), 'secrets-vault.json')
}

/** Internal keys persisted in vault but not shown in Vault UI */
/**
 * Internal values are encrypted with the rest of the vault but are never
 * surfaced in the shared Vault modal. Keep credentials that belong only to a
 * feature here rather than writing another plaintext settings file.
 */
const INTERNAL_VAULT_KEYS = [
  'CC_API_TOKEN',
  'OUTREACH_SECRETS',
  'GROUP_POSTER_SECRETS',
  'REDDIT_COMMENTER_SECRETS',
  'UGC_BATCH_TEST_MODE',
] as const

/** Keys shown in the shared vault UI. */
export const VAULT_FIELDS = [
  {
    key: 'DISCORD_STATUS_WEBHOOK',
    label: 'Status Discord webhook',
    type: 'password' as const,
  },
  {
    key: 'DISCORD_NEWSLETTER_SEND_WEBHOOK_URL',
    label: 'Email send Discord webhook',
    type: 'password' as const,
  },
  {
    key: 'DISCORD_BOT_TOKEN',
    label: 'Discord bot token',
    type: 'password' as const,
  },
  {
    key: 'DISCORD_GUILD_ID',
    label: 'Discord guild ID',
    type: 'text' as const,
  },
  {
    key: 'DISCORD_CATEGORY_ID',
    label: 'Discord category ID',
    type: 'text' as const,
  },
  {
    key: 'OLLAMA_URL',
    label: 'Ollama URL',
    type: 'text' as const,
  },
  {
    key: 'OLLAMA_MODEL',
    label: 'Ollama model',
    type: 'text' as const,
  },
  {
    key: 'GEMINI_API_KEYS',
    label: 'Gemini API keys (rotation pool)',
    type: 'password' as const,
  },
  {
    key: 'GEMINI_API_KEY',
    label: 'Gemini API key (fallback)',
    type: 'password' as const,
  },
  {
    key: 'GEMINI_MODEL',
    label: 'Gemini model',
    type: 'text' as const,
  },
  {
    key: 'RESEND_API_KEY',
    label: 'Resend API key',
    type: 'password' as const,
  },
  {
    key: 'RESEND_FROM',
    label: 'Resend from address',
    type: 'text' as const,
  },
  {
    key: 'CRYPTOCOMPARE_API_KEY',
    label: 'CryptoCompare API key',
    type: 'password' as const,
  },
] as const

const DEFAULT_VAULT: Record<string, string> = {}

/**
 * DPAPI decryption shells out to PowerShell on Windows. Repeating it for every
 * local API poll blocks Node's event loop and can make the UI look offline.
 * Cache by file mtime so external vault edits are still picked up safely.
 */
const vaultCache = new Map<string, { values: Record<string, string>; mtimeMs: number }>()
let systemVaultCache: { values: Record<string, string>; mtimeMs: number } | null = null

function ensureDataDir() {
  ensureBusinessProfiles()
  const dir = currentProfileDataDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

export function loadVault(): Record<string, string> {
  ensureDataDir()
  const file = vaultFilePath()
  if (!fs.existsSync(file)) {
    const initial = { ...DEFAULT_VAULT }
    writeEncryptedVault(file, initial)
    vaultCache.set(file, { values: initial, mtimeMs: fs.statSync(file).mtimeMs })
    return { ...initial }
  }
  try {
    const mtimeMs = fs.statSync(file).mtimeMs
    const cached = vaultCache.get(file)
    if (cached && cached.mtimeMs === mtimeMs) return { ...cached.values }
    const { values, wasPlaintext } = readVaultFile(file)
    const merged = { ...DEFAULT_VAULT, ...values }
    // Migrate legacy plaintext → encrypted at rest
    if (wasPlaintext) {
      try {
        writeEncryptedVault(file, merged)
      } catch {
        /* keep serving plaintext if encrypt fails */
      }
    }
    vaultCache.set(file, {
      values: merged,
      mtimeMs: wasPlaintext ? fs.statSync(file).mtimeMs : mtimeMs,
    })
    return merged
  } catch {
    return { ...DEFAULT_VAULT }
  }
}

export function saveVault(updates: Record<string, string>): { ok: boolean; message: string } {
  ensureDataDir()
  const file = vaultFilePath()
  const current = loadVault()
  const next = { ...current }
  for (const field of VAULT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(updates, field.key)) {
      next[field.key] = String(updates[field.key] ?? '')
    }
  }
  for (const key of INTERNAL_VAULT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      next[key] = String(updates[key] ?? '')
    }
  }
  writeEncryptedVault(file, next)
  vaultCache.set(file, { values: next, mtimeMs: fs.statSync(file).mtimeMs })
  return { ok: true, message: `Vault saved for ${currentBusinessProfile().name} (encrypted at rest)` }
}

/** Machine-only encrypted values such as the localhost API token. */
export function loadSystemVault(): Record<string, string> {
  fs.mkdirSync(CC_DATA, { recursive: true })
  if (!fs.existsSync(SYSTEM_VAULT_FILE)) {
    writeEncryptedVault(SYSTEM_VAULT_FILE, {})
    systemVaultCache = { values: {}, mtimeMs: fs.statSync(SYSTEM_VAULT_FILE).mtimeMs }
    return {}
  }
  try {
    const mtimeMs = fs.statSync(SYSTEM_VAULT_FILE).mtimeMs
    if (systemVaultCache?.mtimeMs === mtimeMs) return { ...systemVaultCache.values }
    const { values, wasPlaintext } = readVaultFile(SYSTEM_VAULT_FILE)
    if (wasPlaintext) writeEncryptedVault(SYSTEM_VAULT_FILE, values)
    systemVaultCache = {
      values,
      mtimeMs: fs.statSync(SYSTEM_VAULT_FILE).mtimeMs,
    }
    return { ...values }
  } catch {
    return {}
  }
}

export function saveSystemVault(updates: Record<string, string>) {
  const next = { ...loadSystemVault(), ...updates }
  writeEncryptedVault(SYSTEM_VAULT_FILE, next)
  systemVaultCache = { values: next, mtimeMs: fs.statSync(SYSTEM_VAULT_FILE).mtimeMs }
  return next
}

const COLOR = {
  ok: 0x5ec4b4,
  info: 0xd4a35c,
  warn: 0xe2a24c,
  err: 0xe06a55,
  stop: 0x7b8cff,
  /** Extreme / serious — pings @everyone */
  critical: 0xff2d2d,
}

let lastErrorNotifyAt = 0
let lastCriticalNotifyAt = 0
/** Drop identical Discord payloads (survives brief races / restarts within window). */
const recentNotifyHashes = new Map<string, number>()

function notifyFingerprint(title: string, description: string, kind: string, toolId?: string) {
  return `${kind}|${toolId || ''}|${title}|${description}`.slice(0, 500)
}

function pruneNotifyHashes(now: number) {
  for (const [k, at] of recentNotifyHashes) {
    if (now - at > 60 * 60_000) recentNotifyHashes.delete(k)
  }
}

export async function notifyDiscord(opts: {
  title: string
  description: string
  kind?: keyof typeof COLOR
  toolId?: string
  /** Force @everyone — only for real process crashes. Default: never for markets. */
  pingEveryone?: boolean
}): Promise<void> {
  const vault = loadVault()
  const url = (vault.DISCORD_STATUS_WEBHOOK || '').trim()
  if (!url.startsWith('https://discord.com/api/webhooks/')) return

  const kind = opts.kind || 'info'
  const now = Date.now()
  pruneNotifyHashes(now)

  const fp = notifyFingerprint(opts.title, opts.description, kind, opts.toolId)
  const prev = recentNotifyHashes.get(fp) || 0
  // Same exact alert — ignore for 45 minutes
  if (now - prev < 45 * 60_000) return
  recentNotifyHashes.set(fp, now)

  if (kind === 'err') {
    if (now - lastErrorNotifyAt < 30_000) return
    lastErrorNotifyAt = now
  }
  if (kind === 'critical') {
    // @everyone at most once per 5 minutes
    if (now - lastCriticalNotifyAt < 300_000) return
    lastCriticalNotifyAt = now
  }

  // Markets / routine noise never pings everyone — only explicit crash criticals
  const pingEveryone =
    opts.pingEveryone === true || (kind === 'critical' && opts.toolId !== 'markets')

  const body: Record<string, unknown> = {
    username: 'ToolsAI Control Center',
    embeds: [
      {
        title: (pingEveryone ? '🚨 CRITICAL · ' : '') + opts.title.slice(0, 220),
        description: opts.description.slice(0, 1900),
        color: COLOR[kind],
        timestamp: new Date().toISOString(),
        footer: opts.toolId ? { text: `tool · ${opts.toolId}` } : undefined,
      },
    ],
  }

  if (pingEveryone) {
    body.content = '@everyone — extreme / serious Control Center alert'
    body.allowed_mentions = { parse: ['everyone'] }
  }

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    })
  } catch {
    /* never block the launcher on Discord */
  }
}

export function fireNotify(
  title: string,
  description: string,
  kind: keyof typeof COLOR = 'info',
  toolId?: string,
  opts?: { pingEveryone?: boolean },
) {
  void notifyDiscord({
    title,
    description,
    kind,
    toolId,
    pingEveryone: opts?.pingEveryone,
  })
}

export type LogLevel = 'info' | 'noise' | 'warn' | 'critical'

export type LogEntry = {
  text: string
  level: LogLevel
  toolId: string
  at: string
  profileId?: string
  profileName?: string
}

/** Classify a console line for UI color + Discord severity. */
export function classifyLogLevel(raw: string, stream: 'out' | 'err' | 'sys' = 'out'): LogLevel {
  const t = raw.trim()
  if (!t) return 'info'

  if (
    /\b(traceback \(most recent|fatal error|panic:|segfault|segmentation fault|out of memory|oom killed|access violation|stack overflow|unhandled exception|spawn error)\b/i.test(
      t,
    )
  ) {
    return 'critical'
  }

  if (
    stream === 'err' ||
    /\b(error|exception|failed|traceback|exit(?:ed)? code=[1-9])\b/i.test(t)
  ) {
    // Soft / ignorable noise — still visible, not a real break
    if (
      /\b(deprecated|deprecation|warning:|warn:|userwarning|futurewarning|debug:|note:|info:)\b/i.test(
        t,
      )
    ) {
      return 'noise'
    }
    return 'warn'
  }

  if (
    /\b(deprecated|deprecation|warning:|warn:|userwarning|futurewarning|debug)\b/i.test(t)
  ) {
    return 'noise'
  }

  if (stream === 'sys') return 'info'
  return 'info'
}

export function maybeNotifyConsoleError(toolId: string, line: string) {
  const level = classifyLogLevel(line, 'err')
  if (level === 'critical') {
    fireNotify(`${toolId} crash / fatal`, line.trim().slice(0, 500), 'critical', toolId, {
      pingEveryone: true,
    })
    return
  }
  if (level === 'warn') {
    fireNotify(`⚠ ${toolId}`, line.trim().slice(0, 500), 'err', toolId)
  }
}

/** Zip env + profiles + vault + assets to Desktop. */
export async function createBackup(): Promise<{ ok: boolean; message: string; path?: string }> {
  ensureDataDir()
  loadVault()
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const desktop = path.join(process.env.USERPROFILE || 'C:\\Users\\Public', 'Desktop')
  const staging = path.join(CC_DATA, `_backup_staging_${stamp}`)
  const zipPath = path.join(desktop, `toolsai-cc-backup-${stamp}.zip`)

  try {
    fs.mkdirSync(staging, { recursive: true })
    ensureBusinessProfiles()
    if (fs.existsSync(BUSINESS_PROFILES_DIR)) {
      fs.cpSync(BUSINESS_PROFILES_DIR, path.join(staging, 'profiles'), { recursive: true })
    }
    if (fs.existsSync(SYSTEM_VAULT_FILE)) {
      fs.copyFileSync(SYSTEM_VAULT_FILE, path.join(staging, 'system-vault.json'))
    }

    const catalogRoots: { root: string; assets?: string[] }[] = [
      { root: path.join(TOOLSAI_ROOT, 'scraper') },
      { root: path.join(TOOLSAI_ROOT, 'dc scraper') },
      {
        root: path.join(TOOLSAI_ROOT, 'newsletter-sender'),
        assets: ['promo-email.html', 'subjects.txt'],
      },
      { root: path.join(TOOLSAI_ROOT, 'post-maker') },
      { root: path.join(TOOLSAI_ROOT, 'ai-lead-finder') },
      { root: path.join(TOOLSAI_ROOT, 'gmail script') },
      { root: path.join(TOOLSAI_ROOT, 'motion blur') },
      { root: path.join(TOOLSAI_ROOT, 'Video Creator') },
      { root: path.join(TOOLSAI_ROOT, '.control-center-data', 'ollama') },
      {
        root: path.join(
          process.env.USERPROFILE || '',
          'Desktop',
          'Ebook biznis',
          'tavo-knyga-generator',
        ),
      },
    ]

    for (const entry of catalogRoots) {
      const root = entry.root
      if (!root || !fs.existsSync(root)) continue
      const safe = root.replace(/^[A-Za-z]:\\/, '').replace(/[\\/]/g, '__')
      const destDir = path.join(staging, 'tools', safe)
      fs.mkdirSync(destDir, { recursive: true })
      for (const name of ['.env', 'control-center.env']) {
        const src = path.join(root, name)
        if (fs.existsSync(src)) fs.copyFileSync(src, path.join(destDir, name))
      }
      for (const file of fs.readdirSync(root)) {
        if (file.startsWith('control-center-profiles') && file.endsWith('.json')) {
          fs.copyFileSync(path.join(root, file), path.join(destDir, file))
        }
      }
      for (const asset of entry.assets || []) {
        const src = path.join(root, asset)
        if (fs.existsSync(src)) fs.copyFileSync(src, path.join(destDir, asset))
      }
    }

    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath)
    await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `Compress-Archive -Path '${staging.replace(/'/g, "''")}\\*' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`,
      ],
      { windowsHide: true, timeout: 120_000 },
    )

    fs.rmSync(staging, { recursive: true, force: true })
    fireNotify('Backup created', zipPath, 'ok')
    return { ok: true, message: `Backup saved to Desktop`, path: zipPath }
  } catch (err) {
    try {
      fs.rmSync(staging, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
    const message = err instanceof Error ? err.message : String(err)
    fireNotify('Backup failed', message, 'critical')
    return { ok: false, message }
  }
}
