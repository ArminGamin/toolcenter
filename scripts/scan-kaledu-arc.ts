/**
 * Scan every Kalėdų Kampelis final in the audit logs (current + archive) for story-arc and
 * language issues, and print a per-slide quality score.
 * Usage:
 *   npx tsx scripts/scan-kaledu-arc.ts
 *   npx tsx scripts/scan-kaledu-arc.ts D:\ugc-batch-vision\audit --since 2026-10-01 --quiet
 */
import fs from 'node:fs'
import path from 'node:path'
import { kaleduDeterministicQa, isSpellNoteOnly } from '../server/ugc-kaledu-final-qa.ts'
import { ensureLtSpeller } from '../server/ugc-lt-spellcheck.ts'
import { collectKaleduArcIssues } from '../server/ugc-story/arc-guard.ts'
import { copyNamesProduct, loadKaleduCatalog } from '../server/ugc-kaledu-catalog.ts'
import { CHRISTMAS_BUSINESS_PROFILE_ID, runWithBusinessProfile } from '../server/business-profiles.ts'
import {
  UGC_KALEDU_FALLBACK_BUILD_BODIES,
  UGC_KALEDU_FALLBACK_CLOSE_BODIES,
  UGC_KALEDU_FALLBACK_CONTEXT_BODIES,
} from '../server/ugc-story/fallbacks.ts'
import { detectKaleduRecipient, personalizeForRecipient } from '../server/ugc-lt/recipient.ts'

const STOCK = [...UGC_KALEDU_FALLBACK_BUILD_BODIES, ...UGC_KALEDU_FALLBACK_CLOSE_BODIES, ...UGC_KALEDU_FALLBACK_CONTEXT_BODIES]
const bare = (t: string) => t.replace(/[.!?…]+$/u, '').trim()
function isStockLine(body: string, themeText: string): boolean {
  const r = detectKaleduRecipient(themeText)
  const pool = r ? [...STOCK, ...STOCK.map((line) => personalizeForRecipient(line, r) || line)] : STOCK
  return pool.some((line) => bare(line) === bare(body))
}
import type { UgcStorySlide } from '../server/ugc-story/text.ts'

const args = process.argv.slice(2)
const root = path.resolve(args.find((a) => !a.startsWith('--') && !/^\d{4}-/.test(a)) || 'D:\\ugc-batch-vision\\audit')
const sinceIdx = args.indexOf('--since')
const since = sinceIdx >= 0 ? args[sinceIdx + 1] : ''
const quiet = args.includes('--quiet')

function findPosts(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const p = path.join(dir, entry.name)
    if (fs.existsSync(path.join(p, '06-final-slides.json'))) out.push(p)
    else findPosts(p, out)
  }
  return out
}

async function main() {
  await ensureLtSpeller()
  const catalog = loadKaleduCatalog()
  let stock = 0
  let productPosts = 0
  let productMissing = 0
  let posts = 0
  let slidesTotal = 0
  let slidesBad = 0
  const byCode = new Map<string, number>()
  for (const dir of findPosts(root)) {
    const file = path.join(dir, '06-final-slides.json')
    const mtime = fs.statSync(file).mtime.toISOString()
    if (since && mtime < since) continue
    const slides = JSON.parse(fs.readFileSync(file, 'utf8')) as UgcStorySlide[]
    if (!/kaledukampel|kalėd|dovan/iu.test(JSON.stringify(slides))) continue
    posts++
    let themeText = ''
    let productLed = false
    try {
      const req = JSON.parse(fs.readFileSync(path.join(dir, '00-request.json'), 'utf8')) as Record<string, unknown>
      themeText = [req.theme, req.themeHook, req.themeBody].filter((v) => typeof v === 'string').join(' ')
      const ctx = JSON.parse(fs.readFileSync(path.join(dir, '00a-catalog-context.json'), 'utf8')) as { storyMode?: { mode?: string } }
      productLed = ctx.storyMode?.mode === 'PRODUCT_LED'
    } catch {
      // older audit folders
    }
    const bad = new Map<number, string[]>()
    const note = (i: number, row: string) => bad.set(i, [...(bad.get(i) || []), row])
    slides.forEach((slide, i) => {
      if (isStockLine(slide.body || '', themeText)) stock++
      if (!slide.productId) return
      const product = catalog.find((p) => p.slug === slide.productId || p.productId === slide.productId)
      const text = `${slide.title || ''} ${slide.body || ''}`
      if (!product || !copyNamesProduct(text, product)) note(i, 'product_id_unnamed: image would show under copy that never names the product')
      else if ((slide.body || '').split(/(?<=[.!?…])\s+/u).filter(Boolean).length < 2) note(i, 'product_bare: names the product but gives no reason')
    })
    if (productLed) {
      productPosts++
      if (!slides.some((slide) => slide.productId)) {
        productMissing++
        note(0, 'product_missing: product-led theme but no product slide')
      }
    }
    for (const issue of collectKaleduArcIssues(slides, themeText)) {
      bad.set(issue.slide - 1, [...(bad.get(issue.slide - 1) || []), `${issue.code}: ${issue.message}`])
    }
    for (const flag of kaleduDeterministicQa(slides, { theme: '', allowed: [], productTruth: false })) {
      if (isSpellNoteOnly(flag)) continue
      bad.set(flag.index, [...(bad.get(flag.index) || []), ...flag.details])
    }
    slidesTotal += slides.length
    slidesBad += bad.size
    for (const rows of bad.values()) for (const row of rows) {
      const code = row.split(':')[0]
      byCode.set(code, (byCode.get(code) || 0) + 1)
    }
    if (quiet || !bad.size) continue
    console.log(`\n=== ${path.relative(root, dir)} (${mtime.slice(0, 16)})`)
    slides.forEach((slide, i) => {
      const rows = bad.get(i)
      const text = `${slide.title ? `${slide.title} | ` : ''}${slide.body}`
      console.log(`${rows ? '✗' : '✓'} ${i + 1} [${slide.role}] ${text}`)
      for (const row of rows || []) console.log(`     → ${row}`)
    })
  }
  console.log(`\nStock-line density: ${stock}/${slidesTotal} slides (${slidesTotal ? Math.round((stock / slidesTotal) * 100) : 0}%) · product-led posts missing a product slide: ${productMissing}/${productPosts}`)
  const good = slidesTotal - slidesBad
  console.log(`\nPosts: ${posts} · slides: ${slidesTotal} · clean: ${good} (${slidesTotal ? Math.round((good / slidesTotal) * 100) : 0}%)`)
  console.log('Issues by code:', Object.fromEntries([...byCode.entries()].sort((a, b) => b[1] - a[1])))
}

void runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, main)
