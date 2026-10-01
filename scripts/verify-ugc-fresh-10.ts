import fs from 'node:fs'
import path from 'node:path'
import {
  attachUgcAuditExport,
  resetUgcAuditSession,
  UGC_VISION_ROOT,
  validateUgcExportPost,
} from '../server/ugc-batch-audit.ts'
import { buildBatchTemplateCaption, formatBatchDiscordCaption } from '../server/ugc-caption-format.ts'
import { UGC_DEFAULT_CTA } from '../server/ugc-cta-normalize.ts'
import { generateUgcBatchStory } from '../server/ugc-story-engine.ts'
import { pickBatchUgcThemes } from '../server/ugc-theme-pool.ts'

const target = 10
const picked = pickBatchUgcThemes(target, undefined, { testMode: true })
if (!picked.ok || !picked.themes || picked.themes.length < target) {
  throw new Error(picked.message || `Expected ${target} seasonally valid themes`)
}

resetUgcAuditSession({
  target,
  note: 'Fresh 10-post fortress verification after Aug-7 fixes',
})

const results: Array<Record<string, unknown>> = []
for (let index = 0; index < picked.themes.length; index++) {
  const theme = picked.themes[index]
  const postIndex = index + 1
  const slideCount = 4 + (index % 3)
  try {
    const story = await generateUgcBatchStory({
      topic: `${theme.hook}. ${theme.body}`,
      themeHook: theme.hook,
      themeBody: theme.body,
      slideCount,
      cta: UGC_DEFAULT_CTA,
      seed: postIndex,
      skipWarm: true,
      theme: theme.theme,
      category: 'Random theme',
    })
    const built = buildBatchTemplateCaption({
      themeHook: theme.hook,
      themeBody: theme.body,
      slides: story.slides,
      defaultCta: UGC_DEFAULT_CTA,
      seed: postIndex,
      theme: theme.theme,
      category: 'Random theme',
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
    }
    const validation = validateUgcExportPost({ caption, meta })
    attachUgcAuditExport(story.auditId || undefined, {
      caption,
      meta,
      ok: validation.ok,
      error: validation.ok ? undefined : validation.issues.join(', '),
    })
    results.push({
      postIndex,
      ok: validation.ok,
      theme: theme.theme,
      slideCount: story.slides.length,
      issues: validation.issues,
      auditId: story.auditId,
    })
    console.log(
      `${validation.ok ? 'PASS' : 'FAIL'} ${postIndex}/${target} ${theme.theme}${
        validation.issues.length ? ` [${validation.issues.join(', ')}]` : ''
      }`,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    results.push({ postIndex, ok: false, theme: theme.theme, error: message })
    console.error(`FAIL ${postIndex}/${target} ${theme.theme}: ${message}`)
  }
}

const reportPath = path.join(UGC_VISION_ROOT, 'fresh-10-verification.json')
fs.writeFileSync(reportPath, JSON.stringify(results, null, 2) + '\n', 'utf8')
const failed = results.filter((result) => result.ok !== true)
console.log(`${failed.length ? 'FAIL' : 'PASS'} fresh 10: ${target - failed.length}/${target}`)
console.log(reportPath)
process.exit(failed.length ? 1 : 0)
