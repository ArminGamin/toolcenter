import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { currentBusinessProfile, profileDataPath } from './business-profiles.js'
import { getConsole } from './launch-runtime.js'
import type { ToolReadiness } from './tool-readiness.js'

function shortHash(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12)
}

export function redactDiagnosticText(input: string): string {
  return String(input || '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, (email) => `<email:${shortHash(email.toLowerCase())}>`)
    .replace(/\b(re_[A-Za-z0-9_-]{12,}|sk-[A-Za-z0-9_-]{12,}|[A-Za-z0-9_-]{32,})\b/g, '<secret:redacted>')
    .replace(/([?&](?:token|key|secret|password)=)[^&\s]+/gi, '$1<redacted>')
}

function artifactFingerprints() {
  const roots = [
    profileDataPath('group-poster', 'failures'),
    profileDataPath('group-poster', 'friend-dms', 'failures'),
  ]
  const artifacts: { kind: string; bytes: number; contentHash: string }[] = []
  for (const root of roots) {
    if (!fs.existsSync(root)) continue
    for (const name of fs.readdirSync(root).slice(-50)) {
      const file = path.join(root, name)
      try {
        const body = fs.readFileSync(file)
        artifacts.push({ kind: path.extname(name).slice(1) || 'file', bytes: body.length, contentHash: shortHash(body) })
      } catch {
        // A worker may still be writing a screenshot.
      }
    }
  }
  return artifacts
}

export function createDiagnosticPack(readiness: ToolReadiness[]) {
  const global = getConsole('__all__')
  return {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    profile: currentBusinessProfile(),
    environment: {
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      app: 'toolsai-control-center',
    },
    readiness,
    recentEvents: (global.entries || []).slice(-300).map((entry) => ({
      ...entry,
      text: redactDiagnosticText(entry.text),
    })),
    artifacts: artifactFingerprints(),
    privacy: 'Credentials, message bodies, raw emails, and screenshot filenames are excluded or redacted.',
  }
}
