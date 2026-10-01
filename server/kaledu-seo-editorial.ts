import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { GiftArticle, GiftProduct } from './kaledu-seo-content.js'
import { GIFT_SEARCH_PLANS, giftSearchPlan, giftTopicOverlap } from './kaledu-seo-topics.js'

export const EDITORIAL_CHECKS = ['intent', 'usefulness', 'facts', 'lithuanian', 'originality', 'titlePromise', 'links'] as const
type Check = { status: 'pass' | 'revise'; evidence: string; correction: string }
export type EditorialReview = {
  version: string; model: string; reviewedAt: string; articleHash: string; catalogHash: string
  checks: Record<typeof EDITORIAL_CHECKS[number], Check>
}

// Separate role-specific skills keep each local-model call focused.
export const GIFT_WRITER_PROMPT = readFileSync(new URL('./seo-skills/kaledu-short-guide.md', import.meta.url), 'utf8').trim()
export const GIFT_EDITOR_PROMPT = readFileSync(new URL('./seo-skills/kaledu-short-editor.md', import.meta.url), 'utf8').trim()
export const EDITORIAL_VERSION = 'kaledu-short-5-' + createHash('sha256').update(GIFT_WRITER_PROMPT + GIFT_EDITOR_PROMPT + JSON.stringify(GIFT_SEARCH_PLANS)).digest('hex').slice(0, 12)

export const EDITOR_REVIEW_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['checks'], properties: {
    checks: { type: 'object', additionalProperties: false, required: [...EDITORIAL_CHECKS], properties: Object.fromEntries(EDITORIAL_CHECKS.map((key) => [key, {
      type: 'object', additionalProperties: false, required: ['status', 'evidence', 'correction'], properties: {
        status: { type: 'string', enum: ['pass', 'revise'] }, evidence: { type: 'string', minLength: 8, maxLength: 140 }, correction: { type: 'string', maxLength: 180 },
      },
    }])) },
  },
}

export function buildGiftBrief(topic: string, products: GiftProduct[], existing: GiftArticle[]) {
  const plan = giftSearchPlan(topic)
  const relevance = (post: GiftArticle) => giftTopicOverlap(plan.question, `${post.title} ${post.topic}`)
  return {
    topic, locale: 'lt-LT', intentStatus: 'inferred; live SERP and search-volume data not supplied',
    searchPlan: { ...plan, intent: 'Trumpas pasirinkimo gidas, ne prekių kategorijos kopija.', answer: 'Pirmuose dviejuose sakiniuose atsakykite į question su pasirinkimo sąlyga; ne tik pažadėkite patarimus.' },
    source: 'Parduotuvės katalogas; tai nėra nepriklausomas prekių bandymas.',
    products: products.map(({ slug, name, tagline, specs }) => ({ slug, name, tagline, specs: specs?.slice(0, 4) })),
    existingTopics: existing.filter((p) => relevance(p) > 0).sort((a, b) => relevance(b) - relevance(a)).slice(0, 6)
      .map((p) => ({ title: p.title, topic: p.topic, coveredAngles: p.sections.slice(0, 3).map((s) => s.heading.slice(0, 100)) })),
  }
}

export function articleFingerprint(post: GiftArticle) {
  return createHash('sha256').update(JSON.stringify({ topic: post.topic, title: post.title, h1: post.h1, metaDescription: post.metaDescription, intro: post.intro, sections: post.sections, faq: post.faq, keywords: post.keywords })).digest('hex')
}
export function catalogFingerprint(products: GiftProduct[]) {
  return createHash('sha256').update(JSON.stringify([...products].sort((a, b) => a.slug.localeCompare(b.slug)))).digest('hex')
}
export function parseEditorialReview(raw: string, post: GiftArticle, products: GiftProduct[], model: string): EditorialReview {
  const data = JSON.parse(raw) as { checks?: Record<string, Check> }
  const normalize = (text: string) => text.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase()
  const text = normalize([post.title, post.h1, post.metaDescription, post.intro, ...post.sections.flatMap((s) => [s.heading, ...s.paragraphs]), ...post.faq.flatMap((f) => [f.q, f.a])].join(' '))
  for (const key of EDITORIAL_CHECKS) {
    const check = data.checks?.[key]
    if (!check || !['pass', 'revise'].includes(check.status) || typeof check.evidence !== 'string' || check.evidence.trim().length < 8 || typeof check.correction !== 'string' || (check.status === 'revise' && !check.correction.trim())) throw new Error(`Incomplete editorial review: ${key}`)
    if (check.status === 'pass' && check.correction.trim()) throw new Error(`Contradictory editorial review: ${key} passed but still requests a correction`)
    if (check.status === 'pass' && !text.includes(normalize(check.evidence))) throw new Error(`Editorial evidence is not a quote from the article: ${key}`)
  }
  return { version: EDITORIAL_VERSION, model, reviewedAt: new Date().toISOString(), articleHash: articleFingerprint(post), catalogHash: catalogFingerprint(products), checks: data.checks as EditorialReview['checks'] }
}
export function editorialErrors(review: EditorialReview) {
  return EDITORIAL_CHECKS.filter((key) => review.checks[key].status !== 'pass').map((key) => `${key}: ${review.checks[key].evidence} → ${review.checks[key].correction}`)
}
export function hasCurrentEditorialReview(post: GiftArticle, products: GiftProduct[]) {
  const review = post.editorial
  if (!review || review.version !== EDITORIAL_VERSION || review.articleHash !== articleFingerprint(post) || review.catalogHash !== catalogFingerprint(products)) return false
  try { return editorialErrors(parseEditorialReview(JSON.stringify({ checks: review.checks }), post, products, review.model)).length === 0 }
  catch { return false }
}
