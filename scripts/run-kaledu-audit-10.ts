process.env.UGC_OLLAMA_KEEP_ALIVE = process.env.UGC_OLLAMA_KEEP_ALIVE || '30m'

/**
 * Christmas (Kalėdų Kampelis) 10-post audit batch — same generator path as the UI batch,
 * with full test-mode capture under D:\ugc-batch-vision\audit.
 *
 *   npx tsx scripts/run-kaledu-audit-10.ts [count]
 */
import fs from 'node:fs'
import path from 'node:path'
import { CC_DATA } from '../server/cc-services.ts'
import { CHRISTMAS_BUSINESS_PROFILE_ID, runWithBusinessProfile } from '../server/business-profiles.ts'
import {
  attachUgcAuditExport,
  resetUgcAuditSession,
  UGC_VISION_ROOT,
  validateUgcExportPost,
} from '../server/ugc-batch-audit.ts'
import { buildBatchTemplateCaption, formatBatchDiscordCaption } from '../server/ugc-caption-format.ts'
import { generateUgcBatchStory } from '../server/ugc-story-engine.ts'
import { warmUgcOllamaModel } from '../server/ugc-slides.ts'
import { pickKaleduCta } from '../server/ugc-kaledu-cta.ts'
import { kaleduInventedProductMentions, loadKaleduCatalog } from '../server/ugc-kaledu-catalog.ts'

const count = Math.max(1, Number(process.argv[2]) || 10)

const THEMES = [
  { theme: 'Dovana rytinei kavai?', hook: 'Be kavos rytas neprasideda?', body: 'Rytinė kava jau yra užuomina dovanai.', category: 'Dovanų idėjos' },
  { theme: 'Pledas ir žvakė vienam jaukiam vakarui.', hook: 'Jaukus vakaras dovanų', body: 'Pledas ir žvakė kaip viena dovana.', category: 'Prekės' },
  { theme: 'Kaip neišleisti per daug dovanoms', hook: 'Biudžetas baigiasi greičiau nei sąrašas.', body: 'Geriau mažiau dovanų, bet naudingų.', category: 'Biudžetas' },
  { theme: 'Kalėdinės dovanos iki 20 eurų', hook: 'Dovana iki 20 eurų', body: 'Nedidelis biudžetas, bet norisi gražios dovanos.', category: 'Biudžetas' },
  { theme: 'Žvakė Kalėdų vakarui', hook: 'Kvapo dovana namams', body: 'Žvakė su mediniu dagčiu tinka mamai ar kolegei.', category: 'Prekės' },
  { theme: 'Kalėdinio apsipirkimo chaosas', hook: 'Sąrašas ilgėja, o laiko mažėja.', body: 'Sutrauk jį iki kelių universalių dovanų.', category: 'Apsipirkimo skausmas' },
  { theme: 'Termosas kelionėms žiemą', hook: 'Kava kelionėje', body: 'Kai žiemą daug laiko praleidi kelyje.', category: 'Prekės' },
  { theme: 'Dovana mamai, kuri atrodo apgalvota', hook: 'Dovana mamai', body: 'Mamai norisi ne dar vienos smulkmenos.', category: 'Dovanų idėjos' },
  { theme: 'Per daug pasirinkimų ir nė vieno sprendimo.', hook: 'Atidarai dešimt parduotuvių ir vis dar nieko.', body: 'Pirmiausia nuspręsk, kam pirksi.', category: 'Apsipirkimo skausmas' },
  { theme: 'Dovana porai, kuria abu džiaugtųsi', hook: 'Dovana porai', body: 'Viena dovana dviem žmonėms.', category: 'Gavėjai' },
]

const rateFile = path.join(CC_DATA, 'ollama-eval-rate.json')
if (!fs.existsSync(rateFile)) {
  fs.writeFileSync(rateFile, JSON.stringify({ tokensPerSec: 5, at: new Date().toISOString(), seeded: 'audit-2026-09-23' }) + '\n')
}

const ollamaHost = process.env.OLLAMA_HOST?.trim() || 'http://127.0.0.1:11434'
try {
  const res = await fetch(`${ollamaHost.replace(/\/$/, '')}/api/tags`, { signal: AbortSignal.timeout(5000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
} catch (err) {
  console.error(`Ollama not reachable at ${ollamaHost} (${err instanceof Error ? err.message : err}). Start Ollama first — refusing to run an all-fallback audit.`)
  process.exit(2)
}

await runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, async () => {
  const runId = `kaledu-audit-${Date.now()}`
  resetUgcAuditSession({ target: count, runId, note: `Fortress v2 Christmas audit — ${count} posts` })
  console.log('Warming ugc-lt-gpu…')
  await warmUgcOllamaModel()

  const results: Array<Record<string, unknown>> = []
  const catalog = loadKaleduCatalog()
  for (let index = 0; index < count; index++) {
    const theme = THEMES[index % THEMES.length]
    const postIndex = index + 1
    const slideCount = 4 + (index % 3)
    const started = Date.now()
    const category = 'category' in theme && theme.category ? theme.category : 'Random theme'
    const defaultCta = pickKaleduCta(theme.theme, postIndex, category)
    try {
      const story = await generateUgcBatchStory({
        topic: `${theme.hook}. ${theme.body}`,
        themeHook: theme.hook,
        themeBody: theme.body,
        slideCount,
        cta: defaultCta,
        seed: postIndex,
        skipWarm: true,
        theme: theme.theme,
        category,
        onProgress: (msg) => console.log(`  [${postIndex}] ${msg}`),
      })
      const built = buildBatchTemplateCaption({
        themeHook: theme.hook,
        themeBody: theme.body,
        slides: story.slides,
        defaultCta,
        seed: postIndex,
        theme: theme.theme,
        category,
      })
      const caption = formatBatchDiscordCaption(built.description, {
        opener: built.hook,
        seed: postIndex,
        themeBlob: `${theme.theme} ${theme.hook} ${theme.body}`,
      })
      const meta = {
        theme: theme.theme,
        hook: theme.hook,
        body: theme.body,
        category: 'Random theme',
        story_slides: story.slides,
        auditId: story.auditId,
        picked_products: story.pickedProducts || [],
      }
      const validation = validateUgcExportPost({ caption, meta })
      attachUgcAuditExport(story.auditId || undefined, {
        caption,
        meta,
        ok: validation.ok,
        error: validation.ok ? undefined : validation.issues.join(', '),
      })
      const pickedSlugs = new Set(story.pickedProducts || [])
      const picked = catalog.filter((p) => pickedSlugs.has(p.slug))
      const attached = catalog.filter(
        (p) => pickedSlugs.has(p.slug) || story.slides.some((s) => s.productId === p.productId),
      )
      const invented = story.slides.flatMap((s) => kaleduInventedProductMentions(`${s.title} ${s.body}`, attached))
      results.push({
        postIndex,
        ok: validation.ok,
        theme: theme.theme,
        auditId: story.auditId,
        durationMs: Date.now() - started,
        pickedProducts: picked.map((p) => p.slug),
        productIds: story.slides.map((s) => s.productId).filter(Boolean),
        invented,
        issues: validation.issues,
        slides: story.slides.map((s) => ({ role: s.role, title: s.title, body: s.body, cta: s.cta, productId: s.productId })),
      })
      console.log(`${validation.ok ? 'PASS' : 'FAIL'} ${postIndex}/${count} ${theme.theme} (${Math.round((Date.now() - started) / 1000)}s)${validation.issues.length ? ` [${validation.issues.join(', ')}]` : ''}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      results.push({ postIndex, ok: false, theme: theme.theme, error: message, durationMs: Date.now() - started })
      console.log(`FAIL ${postIndex}/${count} ${theme.theme}: ${message}`)
    }
  }

  const reportPath = path.join(UGC_VISION_ROOT, 'audit', `FORTRESS-V2-${runId}.json`)
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2) + '\n', 'utf8')
  const passed = results.filter((r) => r.ok === true).length
  console.log(`DONE ${passed}/${count} passed → ${reportPath}`)
})
process.exit(0)
