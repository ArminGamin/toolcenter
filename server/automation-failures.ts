import fs from 'node:fs'
import path from 'node:path'
import { profileDataPath } from './business-profiles.js'

export type AutomationFailureItem = {
  id: string
  module: 'friend-dms' | 'group-poster' | 'outreach' | 'seo-blog' | 'other'
  name: string
  path: string
  size: number
  at: string
}

const failureRoots = (): { module: AutomationFailureItem['module']; dir: string }[] => [
  { module: 'friend-dms', dir: profileDataPath('group-poster', 'friend-dms', 'failures') },
  { module: 'group-poster', dir: profileDataPath('group-poster', 'failures') },
  { module: 'group-poster', dir: profileDataPath('group-poster', 'profile-share', 'failures') },
]

function safeStat(file: string): fs.Stats | null {
  try {
    return fs.statSync(file)
  } catch {
    return null
  }
}

export function listAutomationFailures(limit = 80): AutomationFailureItem[] {
  const out: AutomationFailureItem[] = []
  for (const { module, dir } of failureRoots()) {
    if (!fs.existsSync(dir)) continue
    for (const name of fs.readdirSync(dir)) {
      if (!/\.(png|jpg|jpeg|webp)$/i.test(name)) continue
      const full = path.join(dir, name)
      const st = safeStat(full)
      if (!st || !st.isFile()) continue
      out.push({
        id: `${module}:${name}`,
        module,
        name,
        path: full,
        size: st.size,
        at: st.mtime.toISOString(),
      })
    }
  }
  out.sort((a, b) => b.at.localeCompare(a.at))
  return out.slice(0, Math.max(1, Math.min(limit, 200)))
}

export function readAutomationFailure(
  module: string,
  name: string,
): { ok: boolean; buffer?: Buffer; message?: string } {
  const roots = failureRoots().filter((root) => root.module === module)
  if (!roots.length) return { ok: false, message: 'Unknown module' }
  const safe = path.basename(name)
  if (safe !== name || safe.includes('..')) return { ok: false, message: 'Invalid name' }
  for (const root of roots) {
    const full = path.join(root.dir, safe)
    if (!fs.existsSync(full)) continue
    try {
      return { ok: true, buffer: fs.readFileSync(full) }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  }
  return { ok: false, message: 'Not found' }
}
