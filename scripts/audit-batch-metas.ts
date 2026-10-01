/**
 * Scan output/batch meta.json files for known bad LT stems (local QA).
 * Usage: npx tsx scripts/audit-batch-metas.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { LT_SCREENSHOT_STEMS } from '../server/ugc-lt-normalize.ts'
import { UGC_DEFAULT_CTA } from '../server/ugc-cta-normalize.ts'

const ROOT = path.join(process.cwd(), 'output', 'batch')

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    const st = fs.statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (name === 'meta.json') out.push(p)
  }
  return out
}

let bad = 0
const files = walk(ROOT)
for (const file of files) {
  const meta = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    story_slides?: Array<{ title?: string; body?: string; cta?: string; role?: string }>
  }
  for (const s of meta.story_slides || []) {
    const blob = `${s.title || ''} ${s.body || ''} ${s.cta || ''}`
    if (LT_SCREENSHOT_STEMS.test(blob)) {
      console.log('STEM', file, blob.slice(0, 100))
      bad++
    }
    if (s.role === 'close' || s.cta) {
      if (s.cta && s.cta !== UGC_DEFAULT_CTA && !/tavoknyga\.com/i.test(s.cta)) {
        console.log('CTA', file, s.cta)
        bad++
      }
    }
  }
}
console.log(`Scanned ${files.length} metas; issues=${bad}`)
process.exit(bad > 0 ? 1 : 0)
