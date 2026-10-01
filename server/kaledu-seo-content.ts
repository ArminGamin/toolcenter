import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import type { SeoBlogDraft } from './seoBlog.js'
import type { EditorialReview } from './kaledu-seo-editorial.js'
import { giftTopicTerms, giftTopicOverlap } from './kaledu-seo-topics.js'
export { GIFT_WRITER_PROMPT } from './kaledu-seo-editorial.js'

export type GiftProduct = { slug: string; name: string; tagline: string; recipients: string[]; inStock: boolean; vibes?: string[]; priceCents?: number; specs?: { label: string; value: string }[] }
export type GiftArticle = SeoBlogDraft & {
  slug: string; title: string; h1: string; metaDescription: string; intro: string
  sections: { heading: string; paragraphs: string[] }[]; faq: { q: string; a: string }[]
  keywords: string[]; topic: string; brand: 'kaledukampelis'; llmBackend: string; mock: boolean
  editorial?: EditorialReview
}

export function topicSlug(topic: string) {
  return topic.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/€/g, 'eur').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100)
}

export function readGiftCatalog(siteRoot: string): GiftProduct[] {
  const catalog = path.join(siteRoot, 'src/lib/data/products.ts')
  if (!fs.existsSync(catalog)) throw new Error(`Product catalog missing: ${catalog}`)
  // Load the store's own typed catalog without depending on its Next.js runtime.
  const require = createRequire(import.meta.url)
  const { require: tsRequire } = require('tsx/cjs/api') as { require: (file: string, from: string) => { products: GiftProduct[] } }
  delete require.cache[require.resolve(catalog)]
  const { products } = tsRequire(catalog, pathToFileURL(import.meta.filename).href)
  const available = products.filter((p) => p.inStock).map(({ slug, name, tagline, recipients, inStock, vibes, priceCents, specs }) => ({ slug, name, tagline, recipients, inStock, ...(vibes ? { vibes } : {}), ...(priceCents === undefined ? {} : { priceCents }), ...(specs ? { specs: specs.slice(0, 8) } : {}) }))
  if (!available.length) throw new Error('No available products in the Kalėdų Kampelis catalog')
  return available
}

export function selectGiftProducts(topic: string, products: GiftProduct[]) {
  const limit = /iki\s+(\d+)\s*(?:€|eur)/i.exec(topic)
  const words = giftTopicTerms(topic)
  const colleague = /koleg|slapt.{0,4}\s+senel/iu.test(topic)
  const recipients = colleague ? ['kolegai'] : /tėči|mam|tėvam/iu.test(topic) ? ['tevams', /mam/iu.test(topic) ? 'jai' : 'jam'] : /draug/iu.test(topic) ? ['draugui'] : /vyr/iu.test(topic) ? ['jam'] : /moter/iu.test(topic) ? ['jai'] : /porai/iu.test(topic) ? ['porai'] : []
  const vibe = /prakti/iu.test(topic) ? 'praktiskas' : /jauk|rami.{0,3}\s+vakar/iu.test(topic) ? 'jaukus' : ''
  // Conditional use cases, not claims that an item was designed or tested for that hobby.
  const theme = /skait|knyg/iu.test(topic) ? /skait|pledas|puodel|arbatos|ausin/iu
    : /dekor/iu.test(topic) ? /dekor|egl|girliand|žvak|riešutų spaudikl/iu
      : /įkurtuv/iu.test(topic) ? /nam|sod|augin|puodel|arbat|pledas|vaza|žvak|lemp/iu : undefined
  const unknownTaste = /nežin.{0,12}skon/iu.test(topic)
  const eligible = products.filter((p) => p.inStock
    && (!limit || (p.priceCents !== undefined && p.priceCents <= Number(limit[1]) * 100))
    && (!theme || theme.test(`${p.name} ${p.tagline}`))
    && (!(colleague || unknownTaste) || !/kvap|aromaterap|kvepal|vonios|miego|masaž|viski|vyno|romanti/iu.test(p.name)))
  const score = (p: GiftProduct) => {
    const productWords = `${p.name} ${p.tagline}`.toLowerCase().match(/[\p{L}]+/gu) || []
    return (recipients.some((recipient) => p.recipients.includes(recipient)) ? 5 : 0)
      + words.filter((stem) => productWords.some((word) => word.startsWith(stem))).length * 3
      + (vibe && p.vibes?.includes(vibe) ? 6 : 0)
  }
  const ranked = [...eligible].sort((a, b) => score(b) - score(a))
  const matching = ranked.filter((p) => score(p) > 0)
  return (theme || !matching.length ? ranked : matching).slice(0, 3)
}

const textSchema = { type: 'string' }
export const GIFT_ARTICLE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['title', 'h1', 'metaDescription', 'intro', 'keywords', 'sections', 'faq'],
  properties: {
    title: { type: 'string', minLength: 15, maxLength: 90 }, h1: textSchema,
    metaDescription: { type: 'string', minLength: 80, maxLength: 180 }, intro: { type: 'string', maxLength: 350 },
    keywords: { type: 'array', items: textSchema, minItems: 1, maxItems: 3 },
    sections: { type: 'array', minItems: 3, maxItems: 3, items: {
      type: 'object', additionalProperties: false, required: ['heading', 'paragraphs'],
      properties: { heading: textSchema, paragraphs: { type: 'array', minItems: 1, maxItems: 2, items: { type: 'string', minLength: 40, maxLength: 700 } } },
    } },
    faq: { type: 'array', maxItems: 1, items: {
      type: 'object', additionalProperties: false, required: ['q', 'a'], properties: { q: textSchema, a: textSchema },
    } },
  },
}

export function parseGiftArticle(raw: string, topic: string, model: string, mock = false): GiftArticle {
  const data = JSON.parse(raw.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')) as Record<string, unknown>
  const str = (x: unknown) => typeof x === 'string' ? x.trim() : ''
  return {
    slug: topicSlug(topic), topic, brand: 'kaledukampelis', llmBackend: model, mock,
    title: str(data.title), h1: str(data.h1), metaDescription: str(data.metaDescription), intro: str(data.intro),
    keywords: Array.isArray(data.keywords) ? data.keywords.map(str).filter(Boolean) : [topic],
    sections: Array.isArray(data.sections) ? data.sections.map((s) => ({ heading: str(s?.heading), paragraphs: Array.isArray(s?.paragraphs) ? s.paragraphs.map(str).filter(Boolean) : [] })) : [],
    faq: Array.isArray(data.faq) ? data.faq.map((f) => ({ q: str(f?.q), a: str(f?.a) })) : [],
  }
}

export function wireGiftLinks(post: GiftArticle, products: GiftProduct[]): GiftArticle {
  const linked = new Set([...JSON.stringify(post).matchAll(/\/produktai\/([a-z0-9-]+)/g)].map((m) => m[1]))
  const ordered = [...products].sort((a, b) => b.name.length - a.name.length)
  const linkText = (text: string) => text.split(/(\[[^\]]+\]\([^)]+\))/g).map((part) => {
    const existing = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part)
    if (existing) {
      const product = products.find((p) => `/produktai/${p.slug}` === existing[2])
      return product && topicSlug(existing[1]) === product.slug ? `[${product.name}](${existing[2]})` : part
    }
    let result = ''
    while (part) {
      const candidates = ordered.filter((p) => !linked.has(p.slug)).map((p) => ({ p, index: part.toLowerCase().indexOf(p.name.toLowerCase()) })).filter((c) => c.index >= 0).sort((a, b) => a.index - b.index)
      const next = candidates[0]
      if (!next) return result + part
      result += `${part.slice(0, next.index)}[${part.slice(next.index, next.index + next.p.name.length)}](/produktai/${next.p.slug})`
      part = part.slice(next.index + next.p.name.length)
      linked.add(next.p.slug)
    }
    return result
  }).join('')
  return { ...post, intro: linkText(post.intro), sections: post.sections.map((section) => ({ ...section, paragraphs: section.paragraphs.map(linkText) })) }
}

export function giftArticleWordCount(post: GiftArticle) {
  const text = [post.intro, ...post.sections.flatMap((s) => s.paragraphs), ...post.faq.flatMap((f) => [f.q, f.a])].join(' ').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  return text.match(/[\p{L}\p{N}]+(?:[-’'][\p{L}\p{N}]+)*/gu)?.length || 0
}

export function validateGiftArticle(post: GiftArticle, products: GiftProduct[], existing: GiftArticle[], strict = true): string[] {
  const errors: string[] = []
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug) || post.brand !== 'kaledukampelis') errors.push('Invalid article identity')
  if (!post.title || post.title.length > 90 || !post.h1 || !post.intro) errors.push('Missing or oversized title, H1 or intro')
  if (post.metaDescription.length < 80 || post.metaDescription.length > 180) errors.push('Meta description must be 80–180 characters')
  if (post.sections.length !== 3 || post.sections.some((s) => !s.heading || !s.paragraphs.length || s.paragraphs.length > 2)) errors.push('Use exactly 3 distinct sections with 1–2 short paragraphs each')
  if (post.faq.length > 1 || post.faq.some((f) => !f.q || !f.a)) errors.push('Use 0–1 complete, useful FAQs')
  const paragraphs = [post.intro, ...post.sections.flatMap((s) => s.paragraphs)]
  const body = paragraphs.join(' ')
  const all = [post.title, post.h1, post.metaDescription, body, ...post.sections.map((s) => s.heading), ...post.keywords, ...post.faq.flatMap((f) => [f.q, f.a])].join(' ')
  // A stub guard, not a ranking target. Semantic completeness is checked by the editor.
  const wordCount = giftArticleWordCount(post)
  if (wordCount < 160) errors.push(`Only ${wordCount} words: article is an incomplete stub. Aim for 220–350 words; give each section a concrete criterion, comparison or practical limitation instead of repeating general advice.`)
  if (wordCount > 450) errors.push(`Short-guide limit exceeded (${wordCount} words): remove tangents and aim for 220–350 useful words`)
  if (all.length > 6500 || post.intro.length > 350 || paragraphs.some((p) => p.length > 700)) errors.push('Tighten oversized paragraphs; remove filler before editorial review')
  if (!/[ąčęėįšųūž]/i.test(all)) errors.push('Write in Lithuanian with diacritics')
  if (/iki\s+N\s*(?:€|eur)|lorem ipsum|\[(?:įrašyk|insert|TODO)/iu.test(all)) errors.push('Unresolved template placeholder')
  if (/tavo\s*knyga|tavoknyga|mitybos plan|\/quiz|<[^>]+>|https?:\/\//i.test(all)) errors.push('Foreign brand, HTML or external URL detected')
  const budget = /iki\s+(\d+)\s*(?:€|eur)/i.exec(post.topic)
  const withoutBudget = budget ? all.replace(new RegExp(`iki\\s+${budget[1]}\\s*(?:€|eur(?:ų|u)?)`, 'gi'), '') : all
  if (/\d[\d,.]*\s*(?:€|eur\b)|(?:€|eur)\s*\d/i.test(withoutBudget)) errors.push('Do not invent numeric prices')
  const allowed = new Set(['/rask-dovana', '/dovanos/visos-dovanos', ...products.map((p) => `/produktai/${p.slug}`)])
  const links = [...all.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((m) => m[1])
  if (links.some((link) => !allowed.has(link))) errors.push('Use only supplied catalog links')
  if (!links.some((link) => link.startsWith('/produktai/'))) errors.push('Link a relevant catalog recommendation')
  for (const match of all.matchAll(/\[([^\]]+)\]\((\/produktai\/[^)]+)\)/g)) {
    const product = products.find((p) => `/produktai/${p.slug}` === match[2])
    if (product && match[1].toLowerCase() !== product.name.toLowerCase()) errors.push('Product link label must match its catalog product')
  }
  if (/\[[^\]]*\[|\]\([^)]*\(/.test(all)) errors.push('Malformed or nested Markdown link')
  if (/(?:^|[^\p{L}])(?:išbandėme|testavome|apklausėme|garantuojame|garantuotai|bestseleris)(?:$|[^\p{L}])/iu.test(all)) errors.push('Unsupported testing, popularity or guarantee claim')
  if (/(?:pristatysime|pristatome)\s+(?:rytoj|per\s+\d)|(?:gydo|išgydo)\s/iu.test(all)) errors.push('Unsupported delivery or medical claim')
  const normalize = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
  const normalized = paragraphs.map(normalize)
  if (new Set(normalized).size !== normalized.length) errors.push('Repeated paragraph')
  const sentences = [...body.matchAll(/[^.!?]+[.!?](?:\s|$)/g)].map((m) => normalize(m[0])).filter((s) => s.length > 65)
  if (new Set(sentences).size !== sentences.length) errors.push('Repeated sentence; remove padding')
  const tokens = (text: string) => new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])
  const similar = (a: string, b: string) => {
    const left = tokens(a), right = tokens(b)
    const shared = [...left].filter((w) => right.has(w)).length
    return left.size >= 18 && right.size >= 18 && shared / new Set([...left, ...right]).size > 0.82
  }
  if (strict && paragraphs.some((p, i) => paragraphs.slice(i + 1).some((q) => similar(p, q)))) errors.push('Near-duplicate paragraphs; each section must add a new decision or detail')
  for (const previous of existing.filter((p) => p.slug !== post.slug)) {
    if (normalize(post.title) === normalize(previous.title) || normalize(post.h1) === normalize(previous.h1)) errors.push(`Duplicate title or H1 from ${previous.slug}; choose a distinct reader question`)
    const old = new Set([previous.intro, ...previous.sections.flatMap((s) => s.paragraphs)].map(normalize))
    if (normalized.some((p) => p.length > 100 && old.has(p))) errors.push(`Paragraph copied from ${previous.slug}`)
    if (strict && paragraphs.some((p) => previous.sections.flatMap((s) => s.paragraphs).some((q) => similar(p, q)))) errors.push(`Near-duplicate content from ${previous.slug}`)
  }
  return [...new Set(errors)]
}

export function relatedGiftArticles(post: GiftArticle, existing: GiftArticle[]) {
  const text = (article: GiftArticle) => `${article.topic} ${article.title} ${article.keywords.join(' ')}`
  return existing.filter((p) => p.slug !== post.slug).map((p) => ({ slug: p.slug, overlap: giftTopicOverlap(text(post), text(p)) }))
    .filter((p) => p.overlap > 0).sort((a, b) => b.overlap - a.overlap).slice(0, 3).map((p) => p.slug)
}

export function mockGiftArticle(topic: string, products: GiftProduct[]): GiftArticle {
  return parseGiftArticle(JSON.stringify({
    title: `${topic}: bandomasis straipsnis`, h1: topic,
    metaDescription: 'Bandomasis Kalėdų Kampelio straipsnis skirtas patikrinti juodraščių peržiūrą. Tai nėra publikavimui paruoštas dovanų gidas.',
    intro: 'Tai techninis juodraščio pavyzdys. Tikras straipsnis bus sukurtas išjungus Mock režimą.',
    sections: [{ heading: 'Katalogo pavyzdžiai', paragraphs: products.slice(0, 2).map((p) => `[${p.name}](/produktai/${p.slug})`) }],
    faq: [{ q: 'Ar šis tekstas bus publikuojamas?', a: 'Ne, bandomųjų juodraščių publikuoti negalima.' }], keywords: [topic],
  }), topic, 'mock', true)
}
