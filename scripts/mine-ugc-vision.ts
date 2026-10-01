/**
 * Aggregate every archived UGC audit run: shipped slides, captions, gate reports,
 * errors and timings. Re-scans shipped copy with the CURRENT gates so we can see
 * which defects would still ship today.
 */

import fs from 'node:fs'
import path from 'node:path'
import { scanSlideQuality, scanCaption } from '../server/ugc-batch-audit.js'

const ROOT = process.argv[2] || 'D:\\ugc-batch-vision\\audit'

type Slide = { title?: string; body?: string; cta?: string; role?: string }

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T
  } catch {
    return null
  }
}

function postDirs(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string, depth: number) => {
    if (depth > 3 || !fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const full = path.join(dir, entry.name)
      if (/^post-\d+$/.test(entry.name)) out.push(full)
      else walk(full, depth + 1)
    }
  }
  walk(root, 0)
  return out
}

const issueCounts = new Map<string, number>()
const quotes = new Map<string, string[]>()
const errors = new Map<string, number>()
const durations: number[] = []
const callCounts: number[] = []
let posts = 0
let failed = 0

for (const dir of postDirs(ROOT)) {
  posts += 1
  const slides = readJson<Slide[]>(path.join(dir, '06-final-slides.json'))
  const summary = readJson<{ durationMs?: number; ollamaCalls?: number; topic?: string; extra?: Record<string, unknown> }>(
    path.join(dir, '10-summary.json'),
  )
  const err = readJson<{ error?: string }>(path.join(dir, '09-error.json'))
  const captionFile = path.join(dir, '07-caption.txt')
  const caption = fs.existsSync(captionFile) ? fs.readFileSync(captionFile, 'utf8') : ''

  if (summary?.durationMs) durations.push(summary.durationMs)
  if (summary?.ollamaCalls) callCounts.push(summary.ollamaCalls)

  if (err?.error) {
    failed += 1
    const key = err.error.replace(/Slide\s+\d+/gi, 'Slide N').replace(/\|.*$/s, '').trim().slice(0, 110)
    errors.set(key, (errors.get(key) || 0) + 1)
  }

  if (!slides?.length) continue

  const themeText = [summary?.extra?.theme, summary?.extra?.themeHook, summary?.topic]
    .filter((v): v is string => typeof v === 'string')
    .join(' ')

  for (const scan of scanSlideQuality(slides, themeText)) {
    for (const issue of scan.issues) {
      issueCounts.set(issue, (issueCounts.get(issue) || 0) + 1)
      const list = quotes.get(issue) || []
      if (list.length < 6) {
        list.push(`${[scan.title, scan.body].filter(Boolean).join(' ').slice(0, 130)}`)
        quotes.set(issue, list)
      }
    }
  }

  if (caption.trim()) {
    for (const issue of scanCaption(caption, slides).issues) {
      const key = `caption:${issue}`
      issueCounts.set(key, (issueCounts.get(key) || 0) + 1)
      const list = quotes.get(key) || []
      if (list.length < 4) {
        list.push(caption.split(/\n{2,}/).find((p) => p.trim() && !p.startsWith('📌'))?.slice(0, 130) || '')
        quotes.set(key, list)
      }
    }
  }
}

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0)

console.log(`\nposts=${posts}  failed=${failed}`)
console.log(`avg duration=${avg(durations)}ms  max=${Math.max(0, ...durations)}ms`)
console.log(`avg ollama calls=${avg(callCounts)}  max=${Math.max(0, ...callCounts)}`)

console.log('\n=== ISSUES STILL FLAGGED BY CURRENT GATES ===')
for (const [issue, count] of [...issueCounts.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`\n${count.toString().padStart(4)}  ${issue}`)
  for (const q of quotes.get(issue) || []) console.log(`        "${q}"`)
}

console.log('\n=== GENERATION ERRORS ===')
for (const [err, count] of [...errors.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`${count.toString().padStart(4)}  ${err}`)
}
