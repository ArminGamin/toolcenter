/**
 * Re-scan audit finals under the current shipable gate.
 * Usage:
 *   npx tsx scripts/rescan-ugc-audit.ts
 *   npx tsx scripts/rescan-ugc-audit.ts D:\ugc-batch-vision\audit
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { scanCaption, scanSlideQuality } from '../server/ugc-batch-audit.ts'

const defaultRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'output', 'ugc-audit')
const root = path.resolve(process.argv[2] || defaultRoot)

type Slide = { title?: string; body?: string; role?: string; cta?: string }

function main() {
  if (!fs.existsSync(root)) {
    console.log('No audit folder at', root)
    process.exit(0)
  }
  const posts = fs
    .readdirSync(root)
    .filter((d) => d.startsWith('post-'))
    .sort()
  let issues = 0
  let scanned = 0
  for (const post of posts) {
    const file = path.join(root, post, '06-final-slides.json')
    if (!fs.existsSync(file)) continue
    const slides = JSON.parse(fs.readFileSync(file, 'utf8')) as Slide[]
    const requestPath = path.join(root, post, '00-request.json')
    const request = fs.existsSync(requestPath)
      ? (JSON.parse(fs.readFileSync(requestPath, 'utf8')) as Record<string, unknown>)
      : {}
    const themeText = [request.theme, request.themeHook, request.themeBody, request.category]
      .filter((value): value is string => typeof value === 'string')
      .join(' ')
    const slideScan = scanSlideQuality(slides, themeText)
    for (let i = 0; i < slideScan.length; i++) {
      scanned++
      const scan = slideScan[i]
      if (scan.issues.length) {
        issues += scan.issues.length
        console.log(
          `${post} slide-${i + 1} FAIL [${scan.issues.join(', ')}]`,
        )
        console.log('  title:', scan.title)
        console.log('  body:', (scan.body || '').slice(0, 160))
      }
    }
    const captionPath = path.join(root, post, '07-caption.txt')
    if (fs.existsSync(captionPath)) {
      const captionIssues = scanCaption(fs.readFileSync(captionPath, 'utf8'), slides).issues
      if (captionIssues.length) {
        issues += captionIssues.length
        console.log(`${post} CAPTION FAIL [${captionIssues.join(', ')}]`)
      }
    }
  }
  console.log(
    issues === 0
      ? `OK: ${scanned} raw finals shipable (${root})`
      : `FAIL: ${issues}/${scanned} slides still not shipable (${root})`,
  )
  process.exit(issues === 0 ? 0 : 1)
}

main()
