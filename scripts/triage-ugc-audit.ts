/**
 * Bucket UGC audit failures into triage lanes before proposing PHRASE_FIXES.
 * Lane A — generalize gates; Lane B — new rule class; Lane C — copy quality (no gate).
 *
 * By default only scans the active audit root (post-NN directly under ROOT).
 * Archived sessions under ROOT/archive/* are counted separately as legacy_rescan.
 */

import fs from 'node:fs'
import path from 'node:path'
import { scanSlideQuality, scanCaption } from '../server/ugc-batch-audit.js'

const ROOT = process.argv[2] || 'D:\\ugc-batch-vision\\audit'
const OUT = path.join(ROOT, 'TRIAGE.json')
const INCLUDE_ARCHIVE = process.argv.includes('--include-archive')

export type TriageLane = 'gate_generalize' | 'rule_class' | 'copy_quality'
export type TriageRelevance = 'current' | 'legacy_rescan' | 'generation_error'

type Slide = { title?: string; body?: string; cta?: string; role?: string }

type TriageItem = {
  postId: string
  lane: TriageLane
  relevance: TriageRelevance
  source: 'error' | 'quality_scan' | 'caption'
  code: string
  detail: string
  quote?: string
  postPath?: string
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T
  } catch {
    return null
  }
}

function emptyCounts(): Record<TriageLane, number> {
  return { gate_generalize: 0, rule_class: 0, copy_quality: 0 }
}

function postDirs(root: string, opts: { includeArchive?: boolean }): Array<{ dir: string; relevance: TriageRelevance }> {
  const out: Array<{ dir: string; relevance: TriageRelevance }> = []
  const walk = (dir: string, depth: number, inArchive: boolean) => {
    if (depth > 4 || !fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const full = path.join(dir, entry.name)
      const archived = inArchive || entry.name.toLowerCase() === 'archive'
      if (/^post-\d+$/i.test(entry.name)) {
        const relevance: TriageRelevance = archived ? 'legacy_rescan' : 'current'
        if (!archived || opts.includeArchive) out.push({ dir: full, relevance })
        continue
      }
      if (entry.name.toLowerCase() === 'archive') {
        if (opts.includeArchive) walk(full, depth + 1, true)
        continue
      }
      walk(full, depth + 1, archived)
    }
  }
  walk(root, 0, false)
  return out.sort((a, b) => a.dir.localeCompare(b.dir))
}

function classifyIssue(code: string, detail: string): TriageLane {
  const blob = `${code} ${detail}`.toLowerCase()
  if (
    /case_agreement|case_error|declarative_question|paraphrase|near.?dup|gibberish|known_bad_stem|grammar_defect.*case|sukelia|ruošti maisto|verb cue|reflexive/.test(
      blob,
    )
  ) {
    return 'gate_generalize'
  }
  if (
    /generic_template|weak.*cta|hook.*generic|caption:|filler|thin caption|brand_drift|solution_pitch/.test(
      blob,
    )
  ) {
    return 'copy_quality'
  }
  return 'rule_class'
}

function classifyError(error: string): TriageLane {
  const e = error.toLowerCase()
  if (/case agreement|declarative|question mark|sukelia|ruošti maisto|paraphrase|near.?dup|verb cue/.test(e)) {
    return 'gate_generalize'
  }
  if (/generic|hook|caption|cta|filler|template/.test(e)) return 'copy_quality'
  return 'rule_class'
}

const items: TriageItem[] = []
const countsAll = emptyCounts()
const countsCurrent = emptyCounts()
const countsLegacy = emptyCounts()

const session = readJson<{ startedAt?: string; runId?: string }>(path.join(ROOT, 'SESSION.json'))

for (const { dir, relevance } of postDirs(ROOT, { includeArchive: INCLUDE_ARCHIVE })) {
  const postId = path.basename(dir)
  const slides = readJson<Slide[]>(path.join(dir, '06-final-slides.json'))
  const summary = readJson<{ topic?: string; at?: string; extra?: Record<string, unknown> }>(
    path.join(dir, '10-summary.json'),
  )
  const err = readJson<{ error?: string }>(path.join(dir, '09-error.json'))

  if (err?.error) {
    const lane = classifyError(err.error)
    const item: TriageItem = {
      postId,
      lane,
      relevance: relevance === 'legacy_rescan' ? 'legacy_rescan' : 'generation_error',
      source: 'error',
      code: 'generation_error',
      detail: err.error.slice(0, 240),
      postPath: dir,
    }
    items.push(item)
    countsAll[lane] += 1
    if (item.relevance === 'current' || item.relevance === 'generation_error') countsCurrent[lane] += 1
    else countsLegacy[lane] += 1
  }

  if (slides?.length) {
    const themeText = [summary?.extra?.theme, summary?.extra?.themeHook, summary?.topic]
      .filter((v): v is string => typeof v === 'string')
      .join(' ')
    for (const scan of scanSlideQuality(slides, themeText)) {
      for (const issue of scan.issues) {
        const lane = classifyIssue(issue, issue)
        const quote = [scan.title, scan.body].filter(Boolean).join(' ').slice(0, 140)
        const item: TriageItem = {
          postId,
          lane,
          relevance,
          source: 'quality_scan',
          code: issue,
          detail: issue,
          quote,
          postPath: dir,
        }
        items.push(item)
        countsAll[lane] += 1
        if (relevance === 'current') countsCurrent[lane] += 1
        else countsLegacy[lane] += 1
      }
    }
    const captionPath = path.join(dir, '07-caption.txt')
    const caption = fs.existsSync(captionPath) ? fs.readFileSync(captionPath, 'utf8') : ''
    if (caption.trim()) {
      for (const issue of scanCaption(caption, slides).issues) {
        const code = `caption:${issue}`
        const lane = classifyIssue(code, issue)
        const item: TriageItem = {
          postId,
          lane,
          relevance,
          source: 'caption',
          code,
          detail: issue,
          quote: caption.split(/\n{2,}/).find((p) => p.trim() && !p.startsWith('📌'))?.slice(0, 140),
          postPath: dir,
        }
        items.push(item)
        countsAll[lane] += 1
        if (relevance === 'current') countsCurrent[lane] += 1
        else countsLegacy[lane] += 1
      }
    }
  }
}

const currentPosts = postDirs(ROOT, { includeArchive: false }).length
const legacyPosts = INCLUDE_ARCHIVE
  ? postDirs(ROOT, { includeArchive: true }).filter((p) => p.relevance === 'legacy_rescan').length
  : 0

const report = {
  root: ROOT,
  generatedAt: new Date().toISOString(),
  session: session || null,
  postCount: currentPosts,
  legacyPostCount: legacyPosts,
  includeArchive: INCLUDE_ARCHIVE,
  counts: countsAll,
  countsCurrent,
  countsLegacy,
  items,
}

fs.mkdirSync(ROOT, { recursive: true })
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

console.log(`\nTriage written: ${OUT}`)
console.log(`current posts=${currentPosts}  legacy posts=${legacyPosts}${INCLUDE_ARCHIVE ? ' (included)' : ' (excluded — use --include-archive)'}`)
console.log('\n=== CURRENT (actionable) ===')
console.log(`lane A=${countsCurrent.gate_generalize}  B=${countsCurrent.rule_class}  C=${countsCurrent.copy_quality}`)
if (legacyPosts > 0) {
  console.log('\n=== LEGACY RESCAN (old shipped copy re-flagged by new gates) ===')
  console.log(`lane A=${countsLegacy.gate_generalize}  B=${countsLegacy.rule_class}  C=${countsLegacy.copy_quality}`)
}
console.log('\n=== ALL (if archive included) ===')
console.log(`lane A=${countsAll.gate_generalize}  B=${countsAll.rule_class}  C=${countsAll.copy_quality}`)

const topA = items.filter((i) => i.lane === 'gate_generalize' && i.relevance !== 'legacy_rescan').slice(0, 8)
if (topA.length) {
  console.log('\n=== Current lane A samples ===')
  for (const item of topA) {
    console.log(`${item.postId}  ${item.code}${item.quote ? `  "${item.quote}"` : ''}`)
  }
}
