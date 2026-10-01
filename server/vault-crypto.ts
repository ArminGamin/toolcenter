/**
 * Encrypt vault secrets at rest.
 * Windows: DPAPI via PowerShell ProtectedData (CurrentUser scope).
 * Other OS: AES-256-GCM with key derived from machine id + username (weaker — documented).
 */

import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export type EncryptedVaultFile = {
  v: 1
  enc: true
  algo: 'dpapi' | 'aes-gcm'
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

function dpapiUnprotect(payloadB64: string): string {
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

function aesEncrypt(plain: string): string {
  const key = fallbackKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

function aesDecrypt(payloadB64: string): string {
  const buf = Buffer.from(payloadB64, 'base64')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const data = buf.subarray(28)
  const key = fallbackKey()
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

export function encryptVaultJson(plainObject: Record<string, string>): EncryptedVaultFile {
  const plain = JSON.stringify(plainObject)
  if (process.platform === 'win32') {
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
    parsed.algo === 'dpapi' && process.platform === 'win32'
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
