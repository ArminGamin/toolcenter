import fs from 'node:fs'
import { ensureDirs } from './paths.js'

export function readJsonFile<T>(file: string, fallback: T): T {
  ensureDirs()
  if (!fs.existsSync(file)) return fallback
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

export function writeJsonFile(file: string, data: unknown) {
  ensureDirs()
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
}

export function readEmailSet(file: string): Set<string> {
  const raw = readJsonFile<{ emails?: string[] }>(file, { emails: [] })
  return new Set((raw.emails || []).map((e) => e.toLowerCase()))
}

export function writeEmailSet(file: string, set: Set<string>) {
  writeJsonFile(file, { emails: [...set].sort() })
}
