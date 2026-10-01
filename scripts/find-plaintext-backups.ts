/**
 * Scan Desktop (and optional dirs) for ToolsAI CC backup zips whose secrets-vault.json
 * is still plaintext (no enc:true). Does NOT delete anything.
 *
 * Usage:
 *   npx tsx scripts/find-plaintext-backups.ts
 *   npx tsx scripts/find-plaintext-backups.ts --dir "D:\path\to\folder"
 */

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const desktop = path.join(process.env.USERPROFILE || 'C:\\Users\\Public', 'Desktop')
const args = process.argv.slice(2)
const dirIdx = args.indexOf('--dir')
const scanRoots = [
  dirIdx >= 0 && args[dirIdx + 1] ? path.resolve(args[dirIdx + 1]) : desktop,
  path.join(process.env.USERPROFILE || '', 'Downloads'),
].filter((d) => d && fs.existsSync(d))

type Hit = {
  zip: string
  vaultEntry: string
  plaintext: boolean
  enc?: boolean
  note: string
}

function listZips(root: string): string[] {
  const out: string[] = []
  let entries: string[]
  try {
    entries = fs.readdirSync(root)
  } catch {
    return out
  }
  for (const name of entries) {
    if (!/^toolsai-cc-backup-.*\.zip$/i.test(name) && !/backup.*\.zip$/i.test(name)) continue
    if (!name.toLowerCase().includes('toolsai') && !name.toLowerCase().includes('cc-backup')) {
      // still allow toolsai-cc-backup-*
      if (!/^toolsai-cc-backup-/i.test(name)) continue
    }
    out.push(path.join(root, name))
  }
  return out
}

function inspectZip(zipPath: string): Hit | null {
  // Prefer PowerShell Expand-Archive to a temp peek via .NET ZipFile
  const ps = `
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$z=[System.IO.Compression.ZipFile]::OpenRead('${zipPath.replace(/'/g, "''")}')
try {
  $e=$z.Entries | Where-Object { $_.FullName -match 'secrets-vault\\.json$' } | Select-Object -First 1
  if (-not $e) { Write-Output 'NO_VAULT'; return }
  $sr=New-Object System.IO.StreamReader($e.Open())
  $text=$sr.ReadToEnd()
  $sr.Close()
  Write-Output $text
} finally { $z.Dispose() }
`.trim()
  try {
    const text = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', ps],
      { encoding: 'utf8', windowsHide: true, timeout: 30_000 },
    ).trim()
    if (text === 'NO_VAULT' || !text) {
      return {
        zip: zipPath,
        vaultEntry: '(none)',
        plaintext: false,
        note: 'No secrets-vault.json inside zip',
      }
    }
    let parsed: { enc?: boolean; v?: number }
    try {
      parsed = JSON.parse(text) as { enc?: boolean; v?: number }
    } catch {
      return {
        zip: zipPath,
        vaultEntry: 'secrets-vault.json',
        plaintext: true,
        note: 'Vault JSON failed to parse — treat as suspect/plaintext',
      }
    }
    const encrypted = parsed.enc === true && parsed.v === 1
    return {
      zip: zipPath,
      vaultEntry: 'secrets-vault.json',
      plaintext: !encrypted,
      enc: encrypted,
      note: encrypted
        ? 'Encrypted vault blob (enc:true) — OK for archives made after Fix 5'
        : 'PLAINTEXT vault keys inside this archive — review and delete/re-backup',
    }
  } catch (err) {
    return {
      zip: zipPath,
      vaultEntry: '?',
      plaintext: true,
      note: `Could not read zip: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

const hits: Hit[] = []
for (const root of scanRoots) {
  console.log(`Scanning: ${root}`)
  for (const zip of listZips(root)) {
    const hit = inspectZip(zip)
    if (hit) hits.push(hit)
  }
}

const plaintext = hits.filter((h) => h.plaintext)
console.log('\n=== Results ===')
if (!hits.length) {
  console.log('No matching toolsai-cc-backup-*.zip files found in scan roots.')
} else {
  for (const h of hits) {
    console.log(`\n${h.plaintext ? '[PLAINTEXT]' : '[OK]'} ${h.zip}`)
    console.log(`  ${h.note}`)
  }
}
console.log(
  `\nSummary: ${plaintext.length} plaintext vault archive(s) / ${hits.length} zip(s) inspected.`,
)
console.log('This script does not delete anything. Review and remove plaintext archives yourself.')
process.exit(plaintext.length ? 2 : 0)
