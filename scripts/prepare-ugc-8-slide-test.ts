/**
 * Reset vision audit for a single 8-slide post test.
 * Usage: npx tsx scripts/prepare-ugc-8-slide-test.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { resetUgcAuditSession, UGC_VISION_ROOT } from '../server/ugc-batch-audit.ts'

const audit = resetUgcAuditSession({
  target: 1,
  note: '8-slide single-post test — full vision capture',
})

const marker = path.join(UGC_VISION_ROOT, 'TEST-8-SLIDE.md')
fs.writeFileSync(
  marker,
  `# 8-slide test

- **Posts:** 1 (audit session reset)
- **Slides:** Batch tab → min **8**, max **8**
- **Output:** \`D:\\ugc-batch-vision\\batch\`
- **Audit:** \`${audit.root}\`
- **PC logs:** \`${path.join(UGC_VISION_ROOT, 'pc-logs', 'server.jsonl')}\`

## Logged per post

\`post-01/\` — Ollama calls, timeline, finals, quality scan, caption, export path, client render (\`13-client-render.json\`)

## After run

\`\`\`
npx tsx scripts/rescan-ugc-audit.ts D:\\ugc-batch-vision\\audit
\`\`\`

Ask agent: mine D:\\ugc-batch-vision for fortress deltas.
`,
  'utf8',
)

console.log(JSON.stringify({ ok: true, audit, marker }, null, 2))
