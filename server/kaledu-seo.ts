import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { currentBusinessProfile, profileDataPath, CHRISTMAS_BUSINESS_PROFILE_ID } from './business-profiles.js'
import { currentProfileBrand } from './profile-brand.js'
import { GIFT_GUIDE_TOPICS, giftSearchPlan } from './kaledu-seo-topics.js'
import { waitForGiftDeployment } from './kaledu-seo-discovery.js'
import type { SeoBlogSettings, RunState as SeoBlogRun } from './seoBlog.js'
import { GIFT_ARTICLE_SCHEMA, GIFT_WRITER_PROMPT, mockGiftArticle, parseGiftArticle, readGiftCatalog, selectGiftProducts, topicSlug, validateGiftArticle, wireGiftLinks, relatedGiftArticles, type GiftArticle } from './kaledu-seo-content.js'
import { buildGiftBrief, EDITOR_REVIEW_SCHEMA, GIFT_EDITOR_PROMPT, parseEditorialReview, editorialErrors, hasCurrentEditorialReview } from './kaledu-seo-editorial.js'

const exec = promisify(execFile)
const SITE_URL = 'https://www.kaledukampelis.com'
const slots = new Map<string, Slot>()
type Slot = { root: string; site: string; settings: SeoBlogSettings; run: SeoBlogRun; controller: AbortController | null; reviewing: boolean }
export const isKaleduSeo = () => currentBusinessProfile().id === CHRISTMAS_BUSINESS_PROFILE_ID
const defaults = (): SeoBlogSettings => ({ postsPerRun: 2, mock: false, strict: true, autoPublish: false, autoPush: false, indexnowKey: '', ollamaModel: '', topics: [...GIFT_GUIDE_TOPICS] })
const emptyRun = (): SeoBlogRun => ({ id: null, status: 'idle', stage: 'idle', message: '', error: null, startedAt: null, finishedAt: null, posts: [], updatedRelated: [], publish: {}, indexnow: {}, log: [], progressPct: 0, awaitingReview: false })
const settingsPath = (s: Slot) => path.join(s.root, 'kaledu-settings.json')
const contentDir = (s: Slot) => path.join(s.site, 'content', 'straipsniai')
const draftsDir = (s: Slot) => path.join(s.root, 'drafts')
function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temp = `${file}.tmp`
  fs.writeFileSync(temp, JSON.stringify(data, null, 2) + '\n', 'utf8')
  fs.renameSync(temp, file)
}
function articles(dir: string): GiftArticle[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((f) => /^[a-z0-9-]+\.json$/.test(f)).map((f) => {
    const post = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as GiftArticle
    if (post.brand !== 'kaledukampelis' || f !== `${post.slug}.json`) throw new Error(`Invalid Kalėdų Kampelis article: ${f}`)
    return post
  }).sort((a, b) => (b.published || '').localeCompare(a.published || ''))
}
function slot(): Slot {
  if (!isKaleduSeo()) throw new Error('Kalėdų Kampelis profile required')
  const root = profileDataPath('seo-blog')
  let s = slots.get(root)
  if (!s) {
    s = { root, site: process.env.KALEDU_SEO_SITE_ROOT || currentProfileBrand().seoSiteRoot, settings: defaults(), run: emptyRun(), controller: null, reviewing: false }
    if (fs.existsSync(settingsPath(s))) s.settings = { ...defaults(), ...JSON.parse(fs.readFileSync(settingsPath(s), 'utf8')) }
    s.site = process.env.KALEDU_SEO_SITE_ROOT || s.settings.siteRoot || s.site
    slots.set(root, s)
  }
  return s
}
function log(s: Slot, message: string, level = 'INFO') {
  s.run.log.push({ at: new Date().toISOString(), level, message })
  s.run.log = s.run.log.slice(-120)
  s.run.message = message
}
function stage(s: Slot, name: SeoBlogRun['stage'], message: string, pct: number) {
  s.run.stage = name
  s.run.progressPct = pct
  log(s, message)
}
export function getKaleduSeoSettings() { return structuredClone(slot().settings) }
export function saveKaleduSeoSettings(input: Partial<SeoBlogSettings>) {
  const s = slot()
  const old = s.settings
  const siteRoot = String(input.siteRoot ?? old.siteRoot ?? '').trim()
  if (siteRoot && !path.isAbsolute(siteRoot)) throw new Error('Publishing checkout must be an absolute path')
  if (siteRoot !== (old.siteRoot || '') && (s.controller || s.reviewing)) throw new Error('Wait for the current run before changing the publishing checkout')
  s.settings = {
    postsPerRun: Math.max(1, Math.min(10, Math.floor(Number(input.postsPerRun ?? old.postsPerRun) || 2))),
    mock: input.mock === undefined ? old.mock : Boolean(input.mock),
    strict: input.strict === undefined ? old.strict : Boolean(input.strict),
    autoPublish: input.autoPublish === undefined ? old.autoPublish : Boolean(input.autoPublish),
    autoPush: input.autoPush === undefined ? old.autoPush : Boolean(input.autoPush),
    indexnowKey: String(input.indexnowKey ?? old.indexnowKey).trim(),
    ollamaModel: String(input.ollamaModel ?? old.ollamaModel ?? '').trim(),
    topics: input.topics === undefined ? old.topics : [...new Set(input.topics.filter((t) => typeof t === 'string').map((t) => t.trim()).filter((t) => topicSlug(t)))].slice(0, 200),
    ...(siteRoot ? { siteRoot } : {}),
  }
  s.site = process.env.KALEDU_SEO_SITE_ROOT || siteRoot || currentProfileBrand().seoSiteRoot
  if (s.settings.autoPublish) s.settings.autoPush = true
  writeJson(settingsPath(s), s.settings)
  return { ok: true, settings: getKaleduSeoSettings() }
}
export function getKaleduSeoState() {
  const s = slot()
  const posts = articles(contentDir(s))
  const drafts = articles(draftsDir(s))
  return {
    ok: true, settings: getKaleduSeoSettings(), run: { ...s.run, awaitingReview: drafts.length > 0 },
    siteRoot: s.site, siteUrl: SITE_URL, seoEngine: true, engine: 'kaledu',
    topics: s.settings.topics || [], contentDir: contentDir(s), draftsDir: draftsDir(s),
    postCount: posts.length, slugs: posts.map((p) => p.slug),
    publishedPosts: posts.map((p) => ({ slug: p.slug, published: p.published, llmBackend: p.llmBackend, llmLabel: p.llmBackend, publishedMs: Date.parse(p.published || '') || 0 })),
    drafts, draftCount: drafts.length, childRunning: !!s.controller || s.reviewing,
  }
}

async function ollama(model: string, messages: { role: string; content: string }[], signal: AbortSignal, onProgress: (characters: number) => void, editing = false) {
  const base = (process.env.KALEDU_SEO_OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '')
  const timeout = AbortSignal.any([signal, AbortSignal.timeout(15 * 60_000)])
  if (!model) {
    const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) })
    if (!res.ok) throw new Error(`Ollama models: HTTP ${res.status}`)
    const tags = await res.json() as { models?: { name: string }[] }
    const names = (tags.models || []).map((m) => m.name).filter((n) => !/embed|ugc|tavo-knyga|vl:|vision/i.test(n))
    model = names.find((n) => /Lithuanian/i.test(n)) || names.find((n) => /^qwen3(?:[.:]|$)/i.test(n)) || names.find((n) => /qwen|gemma|llama/i.test(n)) || names[0] || ''
    if (!model) throw new Error('No writing model installed in Ollama. Set an installed model in SEO settings.')
  }
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST', signal: timeout, headers: { 'Content-Type': 'application/json' },
    // Some installed models pin one GPU layer in their Modelfile; let Ollama fit the hardware instead.
    body: JSON.stringify({ model, messages, stream: true, format: editing ? EDITOR_REVIEW_SCHEMA : GIFT_ARTICLE_SCHEMA, think: false, options: { temperature: editing ? 0.1 : 0.3, num_ctx: 4096, num_predict: editing ? 1400 : 2200, num_gpu: -1, num_batch: 64 } }),
  })
  if (!res.ok) throw new Error(`Ollama: HTTP ${res.status} — ${(await res.text()).slice(0, 250)}`)
  if (!res.body) throw new Error('Ollama returned an empty response')
  let raw = '', pending = '', done = false
  const decoder = new TextDecoder()
  const consume = (line: string) => {
    if (!line.trim()) return
    const data = JSON.parse(line) as { message?: { content?: string }; done?: boolean; done_reason?: string; error?: string }
    if (data.error) throw new Error(data.error)
    if (data.done_reason === 'length') throw new Error('Ollama truncated the article; try a shorter topic or a different model')
    raw += data.message?.content || ''
    if (raw.length > 100_000) throw new Error('Ollama article exceeded the output limit')
    done ||= data.done === true
    onProgress(raw.length)
  }
  for await (const bytes of res.body) {
    pending += decoder.decode(bytes, { stream: true })
    const lines = pending.split('\n')
    pending = lines.pop() || ''
    for (const line of lines) consume(line)
  }
  consume(pending + decoder.decode())
  if (!done || !raw) throw new Error('Ollama stream ended before the article was complete')
  return { raw, model }
}

export function startKaleduSeoRun(opts?: { settings?: Partial<SeoBlogSettings> }) {
  const s = slot()
  if (s.controller || s.reviewing) return { ok: false, message: 'Run or review already in progress' }
  if (opts?.settings) saveKaleduSeoSettings(opts.settings)
  const settings = structuredClone(s.settings)
  const used = new Set([...articles(contentDir(s)), ...articles(draftsDir(s))].flatMap((p) => [p.slug, topicSlug(giftSearchPlan(p.topic).question)]))
  const topics = (settings.topics || []).map((t) => giftSearchPlan(t).question).filter((t) => {
    const key = topicSlug(t)
    if (used.has(key)) return false
    used.add(key)
    return true
  }).slice(0, settings.postsPerRun)
  if (!topics.length) return { ok: false, message: 'No unused topics. Add topics in Settings or reject a draft to retry it.' }
  s.run = { ...emptyRun(), id: `kaledu-seo-${Date.now()}`, status: 'running', startedAt: Date.now() }
  const controller = new AbortController()
  s.controller = controller
  void generate(s, settings, topics, controller).catch((error: unknown) => {
    s.run.status = controller.signal.aborted ? 'idle' : 'error'
    s.run.stage = controller.signal.aborted ? 'idle' : 'error'
    s.run.error = controller.signal.aborted ? null : (error instanceof Error ? error.message : String(error))
    if (s.run.error === 'fetch failed') s.run.error = 'Ollama connection failed. Check that Ollama is running and the selected model can load, then retry.'
    log(s, controller.signal.aborted ? 'Aborted — completed drafts kept for review' : s.run.error!, 'ERROR')
  }).finally(() => {
    s.run.finishedAt = Date.now()
    s.controller = null
  })
  return { ok: true, message: 'Kalėdų Kampelis writer started' }
}
async function generate(s: Slot, settings: SeoBlogSettings, topics: string[], controller: AbortController) {
  const { signal } = controller
  stage(s, 'plan', 'Reading Kalėdų Kampelis product catalog', 5)
  const products = readGiftCatalog(s.site)
  const existing = [...articles(contentDir(s)), ...articles(draftsDir(s))]
  const created: GiftArticle[] = []
  for (const [index, topic] of topics.entries()) {
    signal.throwIfAborted()
    const selected = selectGiftProducts(topic, products)
    if (!selected.length) throw new Error(`No matching products for ${topic}. Update the topic or catalog.`)
    const brief = buildGiftBrief(topic, selected, existing)
    stage(s, 'write', `Writing ${index + 1}/${topics.length}: ${topic}`, 10 + Math.round(index / topics.length * 65))
    let post: GiftArticle | undefined
    let feedback = ''
    let previousDraft: unknown
    for (let attempt = 1; attempt <= 3; attempt++) {
      signal.throwIfAborted()
      if (settings.mock) { post = mockGiftArticle(topic, products); break }
      stage(s, 'write', `${attempt > 1 ? 'Rewriting' : 'Writing'} ${topic} (attempt ${attempt}/3)`, 10 + Math.round(index / topics.length * 65))
      const answer = await ollama(settings.ollamaModel || '', [
        { role: 'system', content: GIFT_WRITER_PROMPT },
        { role: 'user', content: JSON.stringify({ brief, corrections: feedback || undefined, previousDraft }) },
      ], signal, (characters) => { s.run.message = `Writing ${index + 1}/${topics.length}: ${topic} · ${characters} characters` })
      signal.throwIfAborted()
      stage(s, 'qa', `Checking ${topic} (attempt ${attempt}/3, ${answer.model})`, 65)
      let reviewOutput: string | undefined
      try {
        post = wireGiftLinks(parseGiftArticle(answer.raw, topic, answer.model), selected)
        const errors = validateGiftArticle(post, selected, existing, settings.strict)
        if (!errors.length) {
          stage(s, 'qa', `Editorial review: ${topic}`, 72)
          const review = await ollama(answer.model, [
            { role: 'system', content: GIFT_EDITOR_PROMPT },
            { role: 'user', content: JSON.stringify({ brief, article: post }) },
          ], signal, (characters) => { s.run.message = `Editorial review: ${topic} · ${characters} characters` }, true)
          reviewOutput = review.raw
          signal.throwIfAborted()
          post.editorial = parseEditorialReview(review.raw, post, selected, review.model)
          errors.push(...editorialErrors(post.editorial))
          if (!errors.length) break
        }
        feedback = errors.join('; ')
      } catch (error) { feedback = error instanceof Error ? error.message : String(error) }
      signal.throwIfAborted()
      // Supply the failed draft to the repair call, bounded so corrupt output cannot fill the context.
      previousDraft = answer.raw.length <= 6500 ? answer.raw : undefined
      post = undefined
      fs.mkdirSync(s.root, { recursive: true })
      fs.appendFileSync(path.join(s.root, 'qa_history.jsonl'), JSON.stringify({ at: new Date().toISOString(), topic, model: answer.model, attempt, errors: feedback, output: answer.raw.slice(0, 16000), editorialOutput: reviewOutput?.slice(0, 12000) }) + '\n')
      log(s, `QA retry: ${feedback}`, 'WARN')
    }
    if (!post) throw new Error(`QA failed for ${topic}: ${feedback}. Earlier drafts remain available.`)
    signal.throwIfAborted()
    stage(s, 'links', `Saving ${post.slug} with validated product links`, 80)
    post.relatedBlogSlugs = relatedGiftArticles(post, articles(contentDir(s)))
    writeJson(path.join(draftsDir(s), `${post.slug}.json`), post)
    existing.push(post)
    created.push(post)
    s.run.posts.push({ slug: post.slug, title: post.title, h1: post.h1 })
  }
  signal.throwIfAborted()
  if (settings.autoPublish && !settings.mock) {
    stage(s, 'publish', 'Publishing Kalėdų Kampelis articles', 90)
    await publish(s, created, settings, signal)
  }
  s.run.status = 'done'
  stage(s, 'done', settings.autoPublish && !settings.mock ? `${created.length} article(s) ${s.run.publish.status === 'live' ? 'live on the website' : 'pushed — deployment pending'}` : `${created.length} draft(s) ready for review${settings.mock ? ' (mock — cannot publish)' : ''}`, 100)
}

async function git(s: Slot, args: string[], signal?: AbortSignal) {
  const result = await exec('git', args, { cwd: s.site, windowsHide: true, timeout: 120_000, maxBuffer: 512_000, signal })
  return result.stdout.trim()
}
async function publish(s: Slot, posts: GiftArticle[], settings: SeoBlogSettings, signal?: AbortSignal) {
  if (posts.some((p) => p.mock)) throw new Error('Mock drafts cannot be published. Reject them and generate real articles.')
  // A path-limited commit must not include unrelated staged work from the store.
  if (settings.autoPush) {
    await git(s, ['rev-parse', '--show-toplevel'], signal)
    await git(s, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], signal)
    const changes = await git(s, ['status', '--porcelain', '--untracked-files=normal'], signal)
    if (changes.split('\n').some((line) => line && !/^.. content\/straipsniai\//.test(line))) {
      throw new Error('Store has other uncommitted changes. Commit/deploy the store changes first, or turn off Auto git push to save articles locally.')
    }
    await git(s, ['pull', '--ff-only'], signal)
  }
  const products = readGiftCatalog(s.site)
  const existing = articles(contentDir(s))
  for (const p of posts) {
    const errors = validateGiftArticle(p, selectGiftProducts(p.topic, products), existing, settings.strict)
    if (errors.length) throw new Error(`${p.slug}: ${errors.join('; ')}`)
    if (!hasCurrentEditorialReview(p, selectGiftProducts(p.topic, products))) throw new Error(`${p.slug}: regenerate this draft; its editorial review is missing, outdated, or the article/catalog has changed.`)
  }
  for (const post of posts) {
    signal?.throwIfAborted()
    const file = path.join(contentDir(s), `${post.slug}.json`)
    if (fs.existsSync(file)) {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8')) as GiftArticle
      if (JSON.stringify({ ...saved, published: undefined }) !== JSON.stringify({ ...post, published: undefined })) throw new Error(`Refusing to overwrite an existing article: ${post.slug}`)
      post.published = saved.published
    } else {
      post.published = new Date().toISOString()
      writeJson(file, post)
    }
  }
  s.run.publish = { status: 'saved', paths: posts.map((p) => `content/straipsniai/${p.slug}.json`) }
  if (settings.autoPush) {
    const files = posts.map((p) => `content/straipsniai/${p.slug}.json`)
    await git(s, ['add', '--', ...files], signal)
    if (await git(s, ['status', '--porcelain', '--', ...files], signal)) await git(s, ['commit', '--only', '-m', `Publish Kalėdų Kampelis gift guides`, '--', ...files], signal)
    const branch = await git(s, ['branch', '--show-current'], signal)
    const remote = await git(s, ['config', '--get', `branch.${branch}.remote`], signal)
    const target = await git(s, ['config', '--get', `branch.${branch}.merge`], signal)
    if (!branch || !remote || remote === '.' || !target.startsWith('refs/heads/')) throw new Error('Configure a remote publishing branch first')
    await git(s, ['push', remote, `HEAD:${target}`], signal)
    s.run.publish = { ...s.run.publish, status: 'pushed' }
    const sitemap = `${SITE_URL}/sitemap.xml`
    s.run.sitemap = { ok: true, sitemap, status: 'ready' }
    log(s, `Sitemap URL ready: ${sitemap}`)
    if (settings.indexnowKey) {
      try {
        const key = settings.indexnowKey
        if (!/^[a-zA-Z0-9-]{8,128}$/.test(key)) throw new Error('IndexNow key must contain 8–128 letters, numbers or hyphens')
        const urls = [`${SITE_URL}/straipsniai`, ...posts.map((p) => `${SITE_URL}/straipsniai/${p.slug}`)]
        log(s, 'Git push complete — waiting for live articles and sitemap before IndexNow')
        await waitForGiftDeployment(SITE_URL, urls, signal)
        s.run.publish = { ...s.run.publish, status: 'live' }
        s.run.sitemap = { ok: true, sitemap, status: 'live' }
        const keyResponse = await fetch(`${SITE_URL}/${key}.txt`, { signal: AbortSignal.timeout(10_000) })
        if (!keyResponse.ok || (await keyResponse.text()).trim() !== key) throw new Error('Host the matching IndexNow key file on the website first')
        const response = await fetch('https://api.indexnow.org/indexnow', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host: new URL(SITE_URL).hostname, key, keyLocation: `${SITE_URL}/${key}.txt`, urlList: urls }), signal: AbortSignal.timeout(10_000) })
        if (!response.ok) throw new Error(`IndexNow HTTP ${response.status}`)
        s.run.indexnow = { status: 'submitted' }
      } catch (error) { s.run.indexnow = { status: 'warning', message: String(error) }; log(s, `Articles pushed; IndexNow: ${String(error)}`, 'WARN') }
    }
  }
  for (const post of posts) fs.unlinkSync(path.join(draftsDir(s), `${post.slug}.json`))
}

export async function acceptKaleduSeo(slug?: string) {
  const s = slot()
  if (s.controller || s.reviewing) return { ok: false, message: 'Wait for the current run or review to finish' }
  if (slug !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return { ok: false, message: 'Invalid slug' }
  const posts = articles(draftsDir(s)).filter((p) => slug === undefined || p.slug === slug)
  if (!posts.length) return { ok: false, message: 'No matching drafts' }
  s.reviewing = true
  const settings = structuredClone(s.settings)
  try {
    await publish(s, posts, settings)
    const message = settings.autoPush ? `${posts.length} article(s) ${s.run.publish.status === 'live' ? 'live on the website' : 'pushed — deployment pending'}` : `${posts.length} article(s) saved to the store. Deploy the store to make them live.`
    log(s, message)
    return { ok: true, message }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log(s, message, 'ERROR')
    return { ok: false, message }
  } finally { s.reviewing = false }
}
export function rejectKaleduSeo(slug?: string) {
  const s = slot()
  if (s.controller || s.reviewing) return { ok: false, message: 'Wait for the current run or review to finish' }
  if (slug !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return { ok: false, message: 'Invalid slug' }
  const posts = articles(draftsDir(s)).filter((p) => slug === undefined || p.slug === slug)
  for (const post of posts) fs.unlinkSync(path.join(draftsDir(s), `${post.slug}.json`))
  return { ok: posts.length > 0, message: posts.length ? `Rejected ${posts.length} draft(s)` : 'No matching drafts' }
}
export function abortKaleduSeo() { const s = slot(); s.controller?.abort(); return { ok: true, message: s.reviewing ? 'Publishing in progress; wait for it to finish' : 'Abort requested' } }
export function clearKaleduSeo() {
  const s = slot()
  if (s.controller || s.reviewing) return { ok: false, message: 'Stop the current run first' }
  s.run = emptyRun()
  return { ok: true, message: 'Cleared' }
}
