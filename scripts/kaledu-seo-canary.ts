import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// A real-model evaluation using a temporary profile and catalog, with no publishing.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kaledu-editorial-canary-'))
process.env.CC_DATA_DIR = path.join(root, 'data')
process.env.KALEDU_SEO_SITE_ROOT = path.join(root, 'store')
const catalogDir = path.join(process.env.KALEDU_SEO_SITE_ROOT, 'src/lib/data')
fs.mkdirSync(catalogDir, { recursive: true })
const { readGiftCatalog } = await import('../server/kaledu-seo-content.js')
const products = readGiftCatalog(process.env.KALEDU_CANARY_CATALOG_ROOT || 'D:/jaukumas')
fs.writeFileSync(path.join(catalogDir, 'products.ts'), `export const products = ${JSON.stringify(products)}`)
const { runWithBusinessProfile, CHRISTMAS_BUSINESS_PROFILE_ID } = await import('../server/business-profiles.js')
const { startKaleduSeoRun, getKaleduSeoState, abortKaleduSeoRun } = await import('../server/kaledu-seo.js')
const kk = <T>(fn: () => T) => runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, fn)
console.log(JSON.stringify({ root, model: process.argv[2] || 'jobautomation/OpenEuroLLM-Lithuanian:latest' }))
kk(() => startKaleduSeoRun({ settings: { topics: ['Kaip išrinkti dovaną žmogui, mėgstančiam skaityti'], postsPerRun: 1, ollamaModel: process.argv[2] || 'jobautomation/OpenEuroLLM-Lithuanian:latest', mock: false, strict: true, autoPublish: false, autoPush: false } }))
const deadline = Date.now() + 15 * 60_000
let last = ''
while (kk(getKaleduSeoState).childRunning && Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 10_000))
  const state = kk(getKaleduSeoState)
  const message = `${state.run.stage}: ${state.run.message}`
  if (message !== last) { console.log(message); last = message }
}
const timedOut = kk(getKaleduSeoState).childRunning
if (timedOut) {
  kk(abortKaleduSeoRun)
  await new Promise((resolve) => setTimeout(resolve, 1000))
}
const state = kk(getKaleduSeoState)
fs.writeFileSync(path.join(root, 'result.json'), JSON.stringify({ ...state, evaluationTimedOut: timedOut }, null, 2))
console.log(JSON.stringify({ root, status: state.run.status, timedOut, error: state.run.error, drafts: state.draftCount }))
process.exitCode = state.draftCount > 0 ? 0 : 1
