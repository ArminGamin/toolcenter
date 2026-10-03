/**
 * Encrypt vault secrets at rest.
 * Windows: DPAPI via PowerShell ProtectedData (CurrentUser scope).
 * Other OS: AES-256-GCM with key derived from machine id + username (weaker — documented).
 */

import { execFile, execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { GLOBAL_CC_DATA } from './business-profiles.js'

export type EncryptedVaultFile = {
  v: 1
  enc: true
  algo: 'dpapi' | 'dpapi-key' | 'aes-gcm'
  payload: string
}

function isEncryptedBlob(parsed: unknown): parsed is EncryptedVaultFile {
  return (
    !!parsed &&
    typeof parsed === 'object' &&
    (parsed as EncryptedVaultFile).enc === true &&
    (parsed as EncryptedVaultFile).v === 1 &&
    typeof (parsed as EncryptedVaultFile).payload === 'string'
  )
}

function dpapiProtect(plainUtf8: string): string {
  const b64 = Buffer.from(plainUtf8, 'utf8').toString('base64')
  const script = `
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
$bytes=[Convert]::FromBase64String('${b64}')
$prot=[System.Security.Cryptography.ProtectedData]::Protect($bytes,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser)
[Convert]::ToBase64String($prot)
`.trim()
  const out = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { encoding: 'utf8', windowsHide: true, timeout: 15_000 },
  )
  return out.trim()
}

/**
 * Decrypted DPAPI payloads, keyed by ciphertext (a changed vault has a new payload).
 * Kept on globalThis so the early prewarm and the bridge share it even when they
 * load separate copies of this module.
 */
const g = globalThis as typeof globalThis & { __ccDpapiPlain?: Map<string, string> }
const dpapiPlain = (g.__ccDpapiPlain ??= new Map<string, string>())

function dpapiUnprotect(payloadB64: string): string {
  const cached = dpapiPlain.get(payloadB64)
  if (cached !== undefined) return cached
  const plain = dpapiUnprotectUncached(payloadB64)
  dpapiPlain.set(payloadB64, plain)
  return plain
}

/**
 * Decrypts every DPAPI vault under `root` with one background PowerShell call,
 * so the first API requests do not each pay a ~1.5s blocking PowerShell start.
 */
export function prewarmVaults(root: string): Promise<void> {
  if (process.platform !== 'win32') return Promise.resolve()
  const payloads = new Set<string>()
  const walk = (dir: string, depth: number) => {
    let entries: fs.Dirent[] = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (depth > 0 && !entry.name.startsWith('.') && entry.name !== 'node_modules') walk(full, depth - 1)
      } else if (/vault.*\.json$/i.test(entry.name)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(full, 'utf8')) as unknown
          if (isEncryptedBlob(parsed) && parsed.algo === 'dpapi' && !dpapiPlain.has(parsed.payload)) payloads.add(parsed.payload)
        } catch {
          /* not a vault */
        }
      }
    }
  }
  walk(root, 4)
  if (!payloads.size) return prepareDataKey()
  const list = [...payloads]
  const script = `
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
foreach ($p in @(${list.map((p) => `'${p.replace(/'/g, "''")}'`).join(',')})) {
  try {
    $bytes=[System.Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($p),$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser)
    [Convert]::ToBase64String($bytes)
  } catch { '-' }
}
`.trim()
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { encoding: 'utf8', windowsHide: true, timeout: 20_000, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout) => {
        if (!err) {
          const lines = String(stdout).split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
          if (lines.length === list.length) {
            lines.forEach((line, i) => {
              if (line !== '-') dpapiPlain.set(list[i], Buffer.from(line, 'base64').toString('utf8'))
            })
          }
        }
        void prepareDataKey().then(resolve)
      },
    )
  })
}

function dpapiUnprotectUncached(payloadB64: string): string {
  const script = `
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
$prot=[Convert]::FromBase64String('${payloadB64.replace(/'/g, "''")}')
$bytes=[System.Security.Cryptography.ProtectedData]::Unprotect($prot,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser)
[System.Text.Encoding]::UTF8.GetString($bytes)
`.trim()
  const out = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { encoding: 'utf8', windowsHide: true, timeout: 15_000 },
  )
  return out.trim()
}

function fallbackKey(): Buffer {
  const material = `${os.hostname()}|${os.userInfo().username}|toolsai-cc-vault-v1`
  return crypto.scryptSync(material, 'toolsai-control-center-vault', 32)
}

function aesEncrypt(plain: string, key: Buffer = fallbackKey()): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

function aesDecrypt(payloadB64: string, key: Buffer = fallbackKey()): string {
  const buf = Buffer.from(payloadB64, 'base64')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const data = buf.subarray(28)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

/**
 * Envelope encryption: vaults are sealed with a random AES key, and only that key
 * is DPAPI-protected (CurrentUser). Saving a vault is then plain in-process crypto
 * instead of a ~1.5s blocking PowerShell call. Keep vault-key.json with the vaults:
 * without it, 'dpapi-key' vaults cannot be opened.
 */
const DATA_KEY_FILE = path.join(GLOBAL_CC_DATA, 'vault-key.json')
const gk = globalThis as typeof globalThis & { __ccVaultDataKey?: Buffer }

function vaultDataKey(): Buffer {
  if (gk.__ccVaultDataKey) return gk.__ccVaultDataKey
  if (fs.existsSync(DATA_KEY_FILE)) {
    const parsed = JSON.parse(fs.readFileSync(DATA_KEY_FILE, 'utf8')) as unknown
    if (!isEncryptedBlob(parsed) || parsed.algo !== 'dpapi') throw new Error('Unrecognized vault key file')
    gk.__ccVaultDataKey = Buffer.from(dpapiUnprotect(parsed.payload), 'base64')
    return gk.__ccVaultDataKey
  }
  const key = crypto.randomBytes(32)
  if (!storeDataKey(key, dpapiProtect(key.toString('base64')))) return vaultDataKey()
  gk.__ccVaultDataKey = key
  return key
}

/** Writes the protected key once; false when another writer got there first. */
function storeDataKey(key: Buffer, protectedB64: string): boolean {
  const blob: EncryptedVaultFile = { v: 1, enc: true, algo: 'dpapi', payload: protectedB64 }
  fs.mkdirSync(path.dirname(DATA_KEY_FILE), { recursive: true })
  try {
    fs.writeFileSync(DATA_KEY_FILE, JSON.stringify(blob, null, 2), { encoding: 'utf8', flag: 'wx' })
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return false
    throw err
  }
  dpapiPlain.set(protectedB64, key.toString('base64'))
  return true
}

/** Creates the vault key in the background so even the first save is instant. */
function prepareDataKey(): Promise<void> {
  if (process.platform !== 'win32' || gk.__ccVaultDataKey || fs.existsSync(DATA_KEY_FILE)) return Promise.resolve()
  const key = crypto.randomBytes(32)
  const script = `Add-Type -AssemblyName System.Security; [Convert]::ToBase64String([System.Security.Cryptography.ProtectedData]::Protect([System.Text.Encoding]::UTF8.GetBytes('${key.toString('base64')}'),$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser))`
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true, timeout: 20_000 }, (err, stdout) => {
      try {
        if (!err && !gk.__ccVaultDataKey && storeDataKey(key, String(stdout).trim())) gk.__ccVaultDataKey = key
      } catch {
        /* the first save creates it instead */
      }
      resolve()
    })
  })
}

export function encryptVaultJson(plainObject: Record<string, string>): EncryptedVaultFile {
  const plain = JSON.stringify(plainObject)
  if (process.platform === 'win32') {
    try {
      return { v: 1, enc: true, algo: 'dpapi-key', payload: aesEncrypt(plain, vaultDataKey()) }
    } catch {
      /* fall through */
    }
    try {
      return { v: 1, enc: true, algo: 'dpapi', payload: dpapiProtect(plain) }
    } catch {
      /* fall through */
    }
  }
  return { v: 1, enc: true, algo: 'aes-gcm', payload: aesEncrypt(plain) }
}

export function decryptVaultFile(raw: string): Record<string, string> {
  const parsed = JSON.parse(raw) as unknown
  if (!isEncryptedBlob(parsed)) {
    // Legacy plaintext object
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>
    }
    throw new Error('Unrecognized vault format')
  }
  const plain =
    parsed.algo === 'dpapi-key'
      ? aesDecrypt(parsed.payload, vaultDataKey())
      : parsed.algo === 'dpapi' && process.platform === 'win32'
        ? dpapiUnprotect(parsed.payload)
        : aesDecrypt(parsed.payload)
  return JSON.parse(plain) as Record<string, string>
}

export function writeEncryptedVault(filePath: string, values: Record<string, string>) {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const blob = encryptVaultJson(values)
  fs.writeFileSync(filePath, JSON.stringify(blob, null, 2), 'utf8')
}

export function readVaultFile(filePath: string): {
  values: Record<string, string>
  wasPlaintext: boolean
} {
  const raw = fs.readFileSync(filePath, 'utf8')
  const parsed = JSON.parse(raw) as unknown
  if (isEncryptedBlob(parsed)) {
    return { values: decryptVaultFile(raw), wasPlaintext: false }
  }
  return { values: parsed as Record<string, string>, wasPlaintext: true }
}
