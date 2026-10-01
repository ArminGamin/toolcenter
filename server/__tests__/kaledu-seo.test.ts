import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CHRISTMAS_BUSINESS_PROFILE_ID, DEFAULT_BUSINESS_PROFILE_ID, runWithBusinessProfile } from '../business-profiles.js'
import { getSeoBlogState, getSeoBlogSettings, startSeoBlogRun, saveSeoBlogSettings, acceptSeoBlogDraft, rejectAllSeoBlogDrafts, abortSeoBlogRun } from '../seoBlog.js'
import { parseGiftArticle, readGiftCatalog, selectGiftProducts, topicSlug, validateGiftArticle, wireGiftLinks, relatedGiftArticles, giftArticleWordCount } from '../kaledu-seo-content.js'
import { EDITORIAL_CHECKS, parseEditorialReview, hasCurrentEditorialReview, buildGiftBrief } from '../kaledu-seo-editorial.js'
import { GIFT_GUIDE_TOPICS, giftSearchPlan } from '../kaledu-seo-topics.js'
import { KALEDU_SEO_TOPICS } from '../profile-brand.js'

const site = fs.mkdtempSync(path.join(os.tmpdir(), 'kaledu-seo-site-'))
process.env.KALEDU_SEO_SITE_ROOT = site
fs.mkdirSync(path.join(site, 'src/lib/data'), { recursive: true })
const products = [
  { slug: 'pledas', name: 'Vilnonis pledas', tagline: 'Šiluma namams', recipients: ['jai'], inStock: true },
  { slug: 'puodelis', name: 'Keraminis puodelis', tagline: 'Arbatos pertraukai', recipients: ['jam'], inStock: true },
]
fs.writeFileSync(path.join(site, 'src/lib/data/products.ts'), `export const products = ${JSON.stringify(products)}`)
const kk = <T>(fn: () => T) => runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, fn)
const state = () => kk(getSeoBlogState)
const fixture = (topic = 'Dovanos skaitytojui') => ({
  title: topic, h1: topic,
  metaDescription: 'Atraskite praktiškas dovanų idėjas žmogui, mėgstančiam ramius vakarus namuose. Patarimai padės pasirinkti pagal įpročius ir poreikius.',
  intro: `${topic}. Pasirinkdami dovaną pagalvokite apie žmogaus įpročius ir tai, kas jam kasdien teikia džiaugsmo. Dėmesys mažoms detalėms padeda pastebėti konkrečius poreikius.`,
  keywords: [topic], sections: [
    { heading: 'Pirmiausia išsiaiškinkite, kur dovana bus naudojama', paragraphs: [
      'Prisiminkite paskutinį pokalbį apie laisvalaikį. Ar žmogus po darbo ilsisi namuose, ar dažniau išvyksta? Atsakymas padės atskirti daiktą, kuris turės nuolatinę vietą, nuo dovanos, kuri liks spintoje. Jei sunku nuspręsti, paklauskite, ką jis norėtų pakeisti savo poilsio kampelyje.',
      'Namų vakarams gali tikti [Vilnonis pledas](/produktai/pledas). Prieš rinkdamiesi patikrinkite matmenis ir sudėtį prekės puslapyje: vien pavadinimas nepasako, ar audinys patiks gavėjui. Jei žmogus jau turi mėgstamą pledą, dar vienas nebūtinai bus naudingas.',
    ] },
    { heading: 'Mažai kasdienei pertraukai', paragraphs: [
      'Žmogui, kuris kas rytą ruošia arbatą, verta apsvarstyti [Keraminis puodelis](/produktai/puodelis). Tai galėtų būti dovana darbo stalui ar virtuvei. Vis dėlto pirmiausia sužinokite, ar gavėjas naudojasi vienu mėgstamu puodeliu, ar mielai keičia indus pagal nuotaiką.',
      'Jei vietos lentynose trūksta, mažesnė dovana ne visada išsprendžia problemą. Tokiu atveju geriau susitarti dėl bendro laiko: pasivaikščiojimo ar ramaus vakaro kartu. Dėmesį parodo tai, kad atsižvelgėte į žmogaus kasdienybę, o ne į pakuotės dydį.',
    ] },
    { heading: 'Kaip apsispręsti tarp dviejų variantų', paragraphs: [
      'Palyginkite, kurį daiktą gavėjas naudotų dažniau ir kuriam jau turi tinkamą vietą. Pledas labiau siejasi su poilsiu, puodelis – su gėrimo ritualu. Jei abu variantai vienodai tikėtini, pasirinkimą gali nulemti tai, ko žmogus dar neturi.',
      'Prieš užsakydami patikrinkite dabartinę kainą ir pristatymo informaciją. Pridėkite trumpą kortelę su konkrečiu palinkėjimu, pavyzdžiui, skirti vakarą mėgstamai veiklai. Toks sakinys paaiškina, kodėl parinkote būtent šią dovaną, ir nereikalauja ilgo, iškilmingo sveikinimo.',
    ] },
  ], faq: [],
})
const reviewFixture = () => ({ checks: Object.fromEntries(EDITORIAL_CHECKS.map((key) => [key, { status: 'pass', evidence: 'Pasirinkdami dovaną pagalvokite apie žmogaus įpročius', correction: '' }])) })
const isReview = (init?: RequestInit) => JSON.parse(String(init?.body)).format.required.includes('checks')
const responseFor = (article: unknown, init?: RequestInit) => new Response(JSON.stringify({ done: true, message: { content: JSON.stringify(isReview(init) ? reviewFixture() : article) } }))
const waitDone = async () => { await vi.waitFor(() => expect(state().childRunning).toBe(false), { timeout: 5000 }); return state() }
afterEach(async () => {
  kk(abortSeoBlogRun)
  await waitDone()
  kk(rejectAllSeoBlogDrafts)
  const content = path.join(site, 'content/straipsniai')
  if (fs.existsSync(content)) for (const file of fs.readdirSync(content).filter((name) => name.endsWith('.json'))) fs.unlinkSync(path.join(content, file))
  vi.restoreAllMocks()
})

describe('independent Kalėdų Kampelis SEO writer', () => {
  it('gives each seed a distinct decision question, preserves custom topics and retrieves relevant prior topics', () => {
    expect(new Set(GIFT_GUIDE_TOPICS).size).toBe(KALEDU_SEO_TOPICS.length)
    for (const seed of KALEDU_SEO_TOPICS) {
      const plan = giftSearchPlan(seed)
      expect(plan.question).not.toBe(seed)
      expect(giftSearchPlan(plan.question)).toEqual(plan)
    }
    expect(giftSearchPlan('Kaip supakuoti apvalią dovaną?').question).toBe('Kaip supakuoti apvalią dovaną?')
    const relevant = parseGiftArticle(JSON.stringify(fixture('Slaptojo Senelio dovana kolegai iki 20 €')), 'Slaptojo Senelio dovana kolegai iki 20 €', 'test')
    const unrelated = parseGiftArticle(JSON.stringify(fixture('Namų tekstilės priežiūra')), 'Namų tekstilės priežiūra', 'test')
    const brief = buildGiftBrief('Dovanos iki 20 €', products, [...Array(8).fill(unrelated), relevant])
    expect(brief.searchPlan.question).toContain('iki 20 €')
    expect(brief.searchPlan.decisionPoints).toContain('pristatymu')
    expect(brief.intentStatus).toContain('inferred')
    expect(brief.existingTopics[0].topic).toBe(relevant.topic)
    expect(brief.existingTopics).toHaveLength(1)
    expect(brief.existingTopics[0].coveredAngles).toEqual(relevant.sections.map((s) => s.heading))
  })

  it('resolves saved category seeds at generation and suppresses old/new aliases without changing user settings', async () => {
    const seed = 'Kalėdinės dovanos'
    const question = giftSearchPlan(seed).question
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => responseFor(fixture(question), init))
    kk(() => saveSeoBlogSettings({ topics: [seed, question], postsPerRun: 2, ollamaModel: 'test-model', mock: false, autoPublish: false, autoPush: false }))
    expect(kk(startSeoBlogRun).ok).toBe(true)
    const done = await waitDone()
    expect(done.run.status, done.run.error || '').toBe('done')
    expect(done.drafts.map((p) => p.topic)).toEqual([question])
    expect(kk(getSeoBlogSettings).topics).toEqual([seed, question])
    for (const [, init] of fetchMock.mock.calls) {
      const brief = JSON.parse(JSON.parse(String(init?.body)).messages[1].content).brief
      expect(brief.searchPlan.question).toBe(question)
    }
    kk(rejectAllSeoBlogDrafts)
    const legacy = parseGiftArticle(JSON.stringify(fixture(seed)), seed, 'test')
    const content = path.join(site, 'content/straipsniai')
    fs.mkdirSync(content, { recursive: true })
    fs.writeFileSync(path.join(content, `${legacy.slug}.json`), JSON.stringify(legacy))
    expect(kk(startSeoBlogRun).message).toMatch(/No unused topics/)
  })

  it('loads the store catalog and validates brand, links, duplicate text and safe slugs', () => {
    expect(readGiftCatalog(site)).toEqual(products)
    expect(topicSlug('Dovanos iki 20 €')).toBe('dovanos-iki-20-eur')
    const post = parseGiftArticle(JSON.stringify(fixture()), 'Dovanos skaitytojui', 'test-model')
    expect(validateGiftArticle(post, products, [])).toEqual([])
    expect(validateGiftArticle({ ...post, intro: 'Tavo Knyga https://tavoknyga.com' }, products, []).join()).toMatch(/Foreign brand/)
    expect(validateGiftArticle({ ...post, intro: '[Netikra](/produktai/neegzistuoja)' }, products, []).join()).toMatch(/catalog links/)
    expect(validateGiftArticle(post, products, [{ ...post, slug: 'kitas' }]).join()).toMatch(/copied/)
    expect(selectGiftProducts('Dovanos iki 20 €', [{ ...products[0], priceCents: 1900 }, { ...products[1], priceCents: 3000 }]).map((p) => p.slug)).toEqual(['pledas'])
    const budget = parseGiftArticle(JSON.stringify(fixture('Dovanos iki 20 €')), 'Dovanos iki 20 €', 'test-model')
    expect(validateGiftArticle(budget, products, [])).toEqual([])
    const unlinked = structuredClone(post)
    unlinked.sections[0].paragraphs = unlinked.sections[0].paragraphs.map((p) => p.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'))
    expect(validateGiftArticle(wireGiftLinks(unlinked, products), products, [])).toEqual([])
  })

  it('generates a draft, pins it to the Christmas profile, saves locally on Accept, and skips the topic', async () => {
    const tavoBefore = runWithBusinessProfile(DEFAULT_BUSINESS_PROFILE_ID, getSeoBlogSettings)
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => responseFor(fixture(), init))
    kk(() => saveSeoBlogSettings({ topics: ['Dovanos skaitytojui'], postsPerRun: 1, ollamaModel: 'test-model', autoPublish: false, autoPush: false, mock: false }))
    expect(kk(startSeoBlogRun).ok).toBe(true)
    // An unrelated request must not redirect an in-flight write.
    runWithBusinessProfile(DEFAULT_BUSINESS_PROFILE_ID, getSeoBlogSettings)
    const done = await waitDone()
    expect(done.run.status).toBe('done')
    expect(done.drafts).toHaveLength(1)
    expect(done.drafts[0]).toHaveProperty('editorial.checks.lithuanian.status', 'pass')
    expect(done.postCount).toBe(0)
    const accepted = await kk(() => acceptSeoBlogDraft('dovanos-skaitytojui'))
    expect(accepted.ok).toBe(true)
    expect(accepted.message).toMatch(/Deploy the store/)
    expect(state().draftCount).toBe(0)
    expect(state().postCount).toBe(1)
    expect(kk(startSeoBlogRun).message).toMatch(/No unused topics/)
    expect(runWithBusinessProfile(DEFAULT_BUSINESS_PROFILE_ID, getSeoBlogSettings)).toEqual(tavoBefore)
    expect(fs.existsSync(path.join(site, 'content/straipsniai/dovanos-skaitytojui.json'))).toBe(true)
  }, 20_000)

  it('never publishes mock drafts, even with automatic publishing enabled', async () => {
    kk(() => saveSeoBlogSettings({ topics: ['Mock dovanos'], mock: true, autoPublish: true }))
    kk(startSeoBlogRun)
    const done = await waitDone()
    expect(done.run.status).toBe('done')
    const result = await kk(() => acceptSeoBlogDraft('mock-dovanos'))
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/Mock drafts cannot/)
    expect(fs.existsSync(path.join(site, 'content/straipsniai/mock-dovanos.json'))).toBe(false)
  })

  it('rejects padded prose, unsupported claims, misleading anchors and stale reviews', () => {
    const post = parseGiftArticle(JSON.stringify(fixture()), 'Dovanos skaitytojui', 'test-model')
    const repeated = structuredClone(post)
    repeated.sections[1].paragraphs[0] += ' ' + post.sections[0].paragraphs[0]
    expect(validateGiftArticle(repeated, products, []).join()).toMatch(/Repeated sentence/)
    const near = structuredClone(post)
    near.sections[1].paragraphs[0] = post.sections[0].paragraphs[0].replace('pokalbį', 'pokalbius').replace('laisvalaikį', 'pomėgius')
    expect(validateGiftArticle(near, products, []).join()).toMatch(/Near-duplicate/)
    expect(validateGiftArticle({ ...post, intro: 'Išbandėme visas dovanas ir garantuotai pristatysime rytoj.' }, products, []).join()).toMatch(/Unsupported/)
    expect(validateGiftArticle({ ...post, intro: 'Pasirinkite dovaną iki N €.' }, products, []).join()).toMatch(/placeholder/)
    const anchor = structuredClone(post)
    anchor.sections[0].paragraphs[1] = anchor.sections[0].paragraphs[1].replace('[Vilnonis pledas]', '[Keraminis puodelis]')
    expect(validateGiftArticle(anchor, products, []).join()).toMatch(/label must match/)
    post.editorial = parseEditorialReview(JSON.stringify(reviewFixture()), post, products, 'test-model')
    expect(hasCurrentEditorialReview(post, products)).toBe(true)
    expect(hasCurrentEditorialReview({ ...post, title: 'Naujas pažadas' }, products)).toBe(false)
    expect(hasCurrentEditorialReview(post, [{ ...products[0], tagline: 'Kitas audinys' }, products[1]])).toBe(false)
    expect(() => parseEditorialReview('{"checks":{}}', post, products, 'test-model')).toThrow(/Incomplete/)
    const fabricated = reviewFixture()
    fabricated.checks.facts.evidence = 'Everything looks excellent.'
    expect(() => parseEditorialReview(JSON.stringify(fabricated), post, products, 'test-model')).toThrow(/not a quote/)
    const contradictory = reviewFixture()
    contradictory.checks.lithuanian.correction = 'Pataisykite linksnius.'
    expect(() => parseEditorialReview(JSON.stringify(contradictory), post, products, 'test-model')).toThrow(/Contradictory/)
    const hiddenLeak = structuredClone(post)
    hiddenLeak.sections[0].heading = 'https://tavoknyga.com'
    expect(validateGiftArticle(hiddenLeak, products, []).join()).toMatch(/Foreign brand/)
    expect(validateGiftArticle(post, products, [{ ...post, slug: 'kitas-straipsnis' }]).join()).toMatch(/Duplicate title/)
  })

  it('adds non-nested product links and chooses related articles by useful topic overlap', () => {
    const post = parseGiftArticle(JSON.stringify(fixture()), 'Dovanos skaitytojui', 'test-model')
    const overlap = [...products, { ...products[0], slug: 'kitas-pledas', name: 'Pledas' }]
    const linked = wireGiftLinks({ ...post, intro: 'Vilnonis pledas ir Pledas.', sections: [], faq: [] }, overlap)
    expect(linked.intro).toBe('[Vilnonis pledas](/produktai/pledas) ir [Pledas](/produktai/kitas-pledas).')
    expect(wireGiftLinks({ ...post, intro: '[pledas](/produktai/pledas)' }, products).intro).toBe('[Vilnonis pledas](/produktai/pledas)')
    const unrelatedProduct = { ...products[0], slug: 'gua-sha', name: 'Veido masažuoklis', tagline: 'Dovana žmogui, mėgstančiam rūpintis savimi' }
    expect(selectGiftProducts('Kaip išrinkti dovaną žmogui, mėgstančiam skaityti', [unrelatedProduct, ...products]).map((p) => p.slug)).toEqual(['pledas', 'puodelis'])
    const related = { ...post, slug: 'skaitymo-kampelis', title: 'Skaitytojo kampelis', topic: 'Skaitytojo kampelis', keywords: ['skaitytojui'] }
    const unrelated = { ...post, slug: 'dekoracijos', title: 'Kalėdų dekoracijos', topic: 'Kalėdų dekoracijos', keywords: ['dekoracijos'] }
    expect(relatedGiftArticles(post, [unrelated, related])).toEqual(['skaitymo-kampelis'])
  })

  it('keeps short guides substantive and rejects excess length without demanding FAQs', () => {
    const post = parseGiftArticle(JSON.stringify(fixture()), 'Dovanos skaitytojui', 'test-model')
    expect(giftArticleWordCount(post)).toBeGreaterThanOrEqual(220)
    expect(giftArticleWordCount(post)).toBeLessThanOrEqual(350)
    expect(post.faq).toEqual([])
    expect(validateGiftArticle(post, products, [])).toEqual([])
    const long = structuredClone(post)
    long.sections[2].paragraphs.push(Array.from({ length: 451 }, (_, i) => `žodis${i}`).join(' '))
    expect(validateGiftArticle(long, products, []).join()).toMatch(/Short-guide limit/)
    expect(giftArticleWordCount({ ...post, intro: '[Vilnonis pledas](/produktai/ilgai-pavadinta-preke)', sections: [], faq: [] })).toBe(2)
    expect(selectGiftProducts('Dovanos', Array.from({ length: 8 }, (_, i) => ({ ...products[0], slug: `p${i}` })))).toHaveLength(3)
  })

  it('matches useful words and catalog tags without treating pagal as a pillow recommendation', () => {
    const pillow = { ...products[0], slug: 'pagalve', name: 'Šilkinis pagalvės užvalkalas', tagline: 'Poilsiui' }
    expect(selectGiftProducts('Kaip išrinkti dovaną pagal žmogaus pomėgį?', [...products, pillow]).map((p) => p.slug)).toEqual(['pledas', 'puodelis', 'pagalve'])
    const practical = { ...products[1], slug: 'ikroviklis', name: 'Įkroviklis', tagline: 'Darbo stalui', vibes: ['praktiskas'] }
    expect(selectGiftProducts('Praktiškos dovanos vyrui', [...products, practical])[0].slug).toBe('ikroviklis')
    const friend = { ...products[1], slug: 'uzrasine', name: 'Užrašinė', tagline: 'Užrašams', recipients: ['draugui'] }
    expect(selectGiftProducts('Dovana draugui', [...products, friend])[0].slug).toBe('uzrasine')
    expect(selectGiftProducts('Dovanos', [{ ...products[0], inStock: false }])).toEqual([])
  })

  it('uses contextual recommendations and never substitutes unrelated items for an empty themed catalog', () => {
    const bath = { ...products[0], slug: 'vonia', name: 'Vonios rinkinys', tagline: 'Poilsiui', recipients: ['kolegai'], priceCents: 1500 }
    const mug = { ...products[1], recipients: ['kolegai'], priceCents: 1500 }
    const candle = { ...products[0], slug: 'zvake', name: 'Aromaterapijos žvakė', tagline: 'Namams', priceCents: 1500 }
    expect(selectGiftProducts('Slaptojo Senelio dovana iki 20 €', [bath, candle, mug]).map((p) => p.slug)).toEqual(['puodelis'])
    expect(selectGiftProducts('Dovana moteriai, kai nežinote jos skonio', [candle, ...products]).map((p) => p.slug)).not.toContain('zvake')
    expect(selectGiftProducts('Kalėdų dekoracijos', [bath, candle, mug]).map((p) => p.slug)).toEqual(['zvake'])
    expect(selectGiftProducts('Kalėdų dekoracijos', [bath, mug])).toEqual([])
    expect(selectGiftProducts('Dovana skaitytojui', [bath])).toEqual([])
    expect(selectGiftProducts('Įkurtuvių dovana iki 20 €', [bath, mug]).map((p) => p.slug)).toEqual(['puodelis'])
  })

  it('does not link unrelated guides just because both say how to choose a gift', () => {
    const current = parseGiftArticle(JSON.stringify(fixture('Kaip išrinkti dovaną skaitytojui?')), 'Kaip išrinkti dovaną skaitytojui?', 'test')
    const unrelated = parseGiftArticle(JSON.stringify(fixture('Kaip išrinkti dovaną kolegai?')), 'Kaip išrinkti dovaną kolegai?', 'test')
    expect(relatedGiftArticles(current, [unrelated])).toEqual([])
    expect(buildGiftBrief(current.topic, products, [unrelated]).existingTopics).toEqual([])
  })

  it('uses editorial feedback and the failed draft for a targeted repair', async () => {
    let reviews = 0
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      if (!isReview(init)) return responseFor(fixture(), init)
      const review = reviewFixture()
      if (++reviews === 1) review.checks.lithuanian = { status: 'revise', evidence: 'Keraminis puodelis', correction: 'Įveskite nuorodą gramatiškai taisyklingu sakiniu.' }
      return new Response(JSON.stringify({ done: true, message: { content: JSON.stringify(review) } }))
    })
    kk(() => saveSeoBlogSettings({ topics: ['Dovanos skaitytojui'], mock: false, autoPublish: false, autoPush: false }))
    kk(startSeoBlogRun)
    expect((await waitDone()).run.status).toBe('done')
    expect(fetch).toHaveBeenCalledTimes(4)
    const repair = JSON.parse(JSON.parse(String(fetch.mock.calls[2][1]?.body)).messages[1].content)
    expect(repair.corrections).toContain('lithuanian:')
    expect(repair.previousDraft).toContain('Vilnonis pledas')
  })

  it('never auto-publishes fluent-looking text when editorial review fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      if (!isReview(init)) return responseFor(fixture(), init)
      const review = reviewFixture()
      review.checks.facts = { status: 'revise', evidence: 'Nepatvirtinta prekės savybė.', correction: 'Pašalinkite katalogu nepagrįstą teiginį.' }
      return new Response(JSON.stringify({ done: true, message: { content: JSON.stringify(review) } }))
    })
    kk(() => saveSeoBlogSettings({ topics: ['Dovanos skaitytojui'], mock: false, autoPublish: true, strict: false }))
    kk(startSeoBlogRun)
    const done = await waitDone()
    expect(done.run.status).toBe('error')
    expect(done.run.error).toMatch(/facts:/)
    expect(done.draftCount).toBe(0)
    expect(done.postCount).toBe(0)
    kk(() => saveSeoBlogSettings({ strict: true }))
  })

  it('retries invalid output and never stages or publishes rejected articles', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ done: true, message: { content: '{"title":"Bad"}' } })))
    kk(() => saveSeoBlogSettings({ topics: ['Netinkamas straipsnis'], mock: false, autoPublish: false, autoPush: false }))
    kk(startSeoBlogRun)
    const done = await waitDone()
    expect(done.run.status).toBe('error')
    expect(done.run.error).toMatch(/QA failed/)
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(done.draftCount).toBe(0)
    expect((await kk(() => acceptSeoBlogDraft('../outside'))).ok).toBe(false)
  })

  it('aborts generation without writing late output', async () => {
    let finish!: (response: Response) => void
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    kk(() => saveSeoBlogSettings({ topics: ['Nutrauktas straipsnis'], mock: false }))
    kk(startSeoBlogRun)
    kk(abortSeoBlogRun)
    finish(new Response(JSON.stringify({ done: true, message: { content: JSON.stringify(fixture()) } })))
    const done = await waitDone()
    expect(done.run.status).toBe('idle')
    expect(done.draftCount).toBe(0)
  })

  it('assembles streamed UTF-8 chunks and requires the final completion event', async () => {
    const topic = 'Srauto dovana'
    const raw = JSON.stringify(fixture(topic))
    const payload = new TextEncoder().encode(JSON.stringify({ message: { content: raw.slice(0, 600) } }) + '\n' + JSON.stringify({ done: true, message: { content: raw.slice(600) } }) + '\n')
    const split = payload.findIndex((byte) => byte >= 192) + 1
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => isReview(init) ? responseFor(null, init) : new Response(new ReadableStream({ start(controller) {
      controller.enqueue(payload.slice(0, split))
      controller.enqueue(payload.slice(split))
      controller.close()
    } })))
    kk(() => saveSeoBlogSettings({ topics: [topic], autoPush: false, autoPublish: false, mock: false }))
    kk(startSeoBlogRun)
    expect((await waitDone()).run.status).toBe('done')
    expect(state().drafts[0].h1).toBe(topic)
    const request = JSON.parse(String(fetch.mock.calls[0][1]?.body))
    expect(request.stream).toBe(true)
    expect(request.format.required).toContain('sections')
    kk(rejectAllSeoBlogDrafts)
    fetch.mockImplementation(async () => new Response(JSON.stringify({ message: { content: raw } }) + '\n'))
    kk(startSeoBlogRun)
    const failed = await waitDone()
    expect(failed.run.status).toBe('error')
    expect(failed.run.error).toMatch(/stream ended/)
    expect(failed.draftCount).toBe(0)
  })

  it('blocks dirty-store pushes and retains drafts after failed pushes so publication can be retried', async () => {
    const git = (...args: string[]) => execFileSync('git', args, { cwd: site, windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
    const remote = fs.mkdtempSync(path.join(os.tmpdir(), 'kaledu-seo-remote-'))
    execFileSync('git', ['init', '--bare', remote], { windowsHide: true, stdio: 'pipe' })
    git('init')
    git('config', 'user.name', 'SEO test')
    git('config', 'user.email', 'seo-test@example.invalid')
    git('add', '.')
    git('commit', '-m', 'Initial store')
    git('remote', 'add', 'origin', remote)
    git('push', '-u', 'origin', 'HEAD')
    const topic = 'Dovanos keliautojui'
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => responseFor(fixture(topic), init))
    kk(() => saveSeoBlogSettings({ topics: [topic], mock: false, autoPublish: false, autoPush: true }))
    kk(startSeoBlogRun)
    expect((await waitDone()).run.status).toBe('done')
    fs.writeFileSync(path.join(site, 'unrelated.txt'), 'preserve this')
    const blocked = await kk(() => acceptSeoBlogDraft('dovanos-keliautojui'))
    expect(blocked.ok).toBe(false)
    expect(blocked.message).toMatch(/other uncommitted changes/)
    expect(state().draftCount).toBe(1)
    expect(fs.existsSync(path.join(site, 'content/straipsniai/dovanos-keliautojui.json'))).toBe(false)
    git('add', 'unrelated.txt')
    git('commit', '-m', 'Separate store change')
    git('push')
    git('remote', 'set-url', 'origin', path.join(remote, 'missing'))
    const failed = await kk(() => acceptSeoBlogDraft('dovanos-keliautojui'))
    expect(failed.ok).toBe(false)
    expect(state().draftCount).toBe(1)
    git('remote', 'set-url', 'origin', remote)
    // Local branch names may differ from the production upstream.
    git('branch', '-m', 'seo-local')
    kk(() => saveSeoBlogSettings({ indexnowKey: 'kaledu-test-indexnow-key' }))
    fetch.mockImplementation(async (url, init) => {
      if (String(url).endsWith('/sitemap.xml')) return new Response('<urlset><url><loc>https://www.kaledukampelis.com/straipsniai/dovanos-keliautojui</loc></url></urlset>')
      if (String(url).endsWith('/kaledu-test-indexnow-key.txt')) return new Response('kaledu-test-indexnow-key')
      if (String(url) === 'https://api.indexnow.org/indexnow') {
        const payload = JSON.parse(String(init?.body))
        expect(payload.keyLocation).toBe('https://www.kaledukampelis.com/kaledu-test-indexnow-key.txt')
        expect(payload.urlList).toEqual(['https://www.kaledukampelis.com/straipsniai', 'https://www.kaledukampelis.com/straipsniai/dovanos-keliautojui'])
      }
      return new Response('ok')
    })
    const retried = await kk(() => acceptSeoBlogDraft('dovanos-keliautojui'))
    expect(retried.ok).toBe(true)
    expect(state().draftCount).toBe(0)
    expect(git('status', '--porcelain')).toBe('')
    expect(git('log', '-1', '--pretty=%s')).toBe('Publish Kalėdų Kampelis gift guides')
    expect(state().run.publish.status).toBe('live')
    expect(state().run.indexnow.status).toBe('submitted')
    expect(state().run.sitemap).toMatchObject({ status: 'live', sitemap: 'https://www.kaledukampelis.com/sitemap.xml' })
    expect(state().run.log.some((entry) => entry.message.includes('Sitemap URL ready:'))).toBe(true)
  }, 30_000)
})
