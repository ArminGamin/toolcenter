import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.argv[2] || 'D:\\ugc-batch-vision\\audit'

function readJson(file: string): any {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

const posts = fs
  .readdirSync(ROOT)
  .filter((n) => /^post-\d+$/.test(n))
  .sort()

for (const id of posts) {
  const dir = path.join(ROOT, id)
  const req = readJson(path.join(dir, '00-request.json')) || {}
  const cat = readJson(path.join(dir, '00a-catalog-context.json'))
  const err = readJson(path.join(dir, '09-error.json'))
  const finals = readJson(path.join(dir, '06-final-slides.json'))
  const native = readJson(path.join(dir, '05b-native-rewrite.json'))
  const gate = readJson(path.join(dir, '04-story-gate-fail.json'))
  const exportMeta = readJson(path.join(dir, '11-export-meta.json'))
  console.log(`\n==================== ${id} — ${req.theme || ''}`)
  console.log(`category=${req.category} slides=${req.slideCount}`)
  if (cat) {
    console.log(
      `themeKind=${cat.themeKind} picked=[${(cat.pickedProducts || []).map((p: any) => `${p.id}:${p.name}`).join(', ')}]`,
    )
  }
  const callsDir = path.join(dir, '02-ollama-calls')
  if (fs.existsSync(callsDir)) {
    for (const f of fs.readdirSync(callsDir).sort()) {
      const c = readJson(path.join(callsDir, f))
      if (!c) continue
      const kind = /PERRAŠAI|perrašai jau parašytą/i.test(c.system || '')
        ? 'native'
        : /Kalėdų Kampelis/.test(c.system || '')
          ? 'draft'
          : 'other'
      console.log(
        `  ${f} ${kind} ${c.durationMs}ms resp=${c.responseChars} err=${c.error || '-'} num_predict=${c.options?.num_predict ?? '-'}`,
      )
    }
  }
  if (native) {
    console.log(
      `  native attempted=${native.attempted} count=${native.attemptCount} rewritten=${native.rewrittenSlideCount}`,
    )
    for (const s of native.slides || []) {
      if (s.reasons?.length) console.log(`    s${s.index ?? '?'} reasons=${s.reasons.join(',')} shipped=${s.shipped}`)
    }
  }
  if (err) console.log(`  ERROR: ${err.error}`)
  if (gate) console.log(`  GATE: ${JSON.stringify(gate.failures?.slice(0, 3))}`)
  const slides = finals || exportMeta?.story_slides
  if (slides) {
    for (const [i, s] of slides.entries()) {
      console.log(
        `  [${i + 1} ${s.role}${s.productId ? ` pid=${s.productId}` : ''}] T: ${s.title || ''} | B: ${s.body || ''} | C: ${s.cta || ''}`,
      )
    }
  }
}
