export const KALEDU_WEBSITE = 'kaledukampelis.com'

export const KALEDU_DEFAULT_CTA = `Rask dovaną Kalėdų Kampelyje - ${KALEDU_WEBSITE} 🎁`
export const KALEDU_DEFAULT_CAPTION_CTA = KALEDU_DEFAULT_CTA

export const KALEDU_CTA_BANK = {
  couple: [
    `Rask dovaną porai - ${KALEDU_WEBSITE} 🎁`,
    `Kartu jaukiau: ${KALEDU_WEBSITE} 🎁`,
  ],
  budget: [
    `Dovanos pagal biudžetą: ${KALEDU_WEBSITE} 🎁`,
    `Rask dovaną iki 30€ - ${KALEDU_WEBSITE} 🎁`,
  ],
  cozy: [
    `Daugiau dovanų idėjų rasi ${KALEDU_WEBSITE} 🎁`,
    `Daugiau dovanų idėjų rasi ${KALEDU_WEBSITE} 🎁`,
  ],
  generic: [
    KALEDU_DEFAULT_CTA,
    `Daugiau dovanų idėjų rasi ${KALEDU_WEBSITE} 🎁`,
    `Dar nežinai, ką dovanoti? Užsuk į ${KALEDU_WEBSITE} 🎁`,
    `Atrask daugiau kalėdinių dovanų ${KALEDU_WEBSITE} 🎁`,
    `Daugiau idėjų: ${KALEDU_WEBSITE} 🎁`,
  ],
} as const

export type KaleduCtaThemeKey = keyof typeof KALEDU_CTA_BANK

const ALL_KALEDU_CTAS = Object.values(KALEDU_CTA_BANK).flat()

export function kaleduCtaThemeKey(theme = '', category = ''): KaleduCtaThemeKey {
  const blob = `${theme} ${category}`.toLocaleLowerCase('lt-LT')
  if (/porai|porom|dviese|partner/i.test(blob)) return 'couple'
  if (/iki\s*(20|30|50)|biudžet|pigiau|maža dovana/i.test(blob)) return 'budget'
  if (/jauk|pled|žvak|namuose|vakarui/i.test(blob)) return 'cozy'
  return 'generic'
}

export const KALEDU_CTA_TAIL = `${KALEDU_WEBSITE} 🎁`

export function finalizeKaleduCta(raw: string): string {
  let lead = String(raw || '')
  lead = lead.replace(/https?:\/\/\S+/gi, ' ')
  lead = lead.replace(/kaledukampelis\.(?:com|lt)/gi, ' ')
  lead = lead.replace(/\p{Extended_Pictographic}/gu, ' ')
  lead = lead.replace(/\s+/g, ' ').trim()
  lead = lead.replace(/[\s.!?]+$/u, '').trim()
  if (!lead) lead = 'Daugiau dovanų idėjų rasi'
  return `${lead} ${KALEDU_CTA_TAIL}`
}

export function withKaleduGiftEmoji(cta: string): string {
  return finalizeKaleduCta(cta)
}

export function pickKaleduCta(theme = '', seed = 0, category = ''): string {
  const key = kaleduCtaThemeKey(theme, category)
  const bank = KALEDU_CTA_BANK[key]
  return withKaleduGiftEmoji(bank[Math.abs(seed) % bank.length])
}

export function isAllowedKaleduCta(cta: string): boolean {
  const t = String(cta || '').trim()
  if (!t) return false
  if (!new RegExp(KALEDU_WEBSITE.replace(/\./g, '\\.'), 'i').test(t)) return false
  if (/kaledukampelis\.lt|tavoknyga|5\s*min\.?\s*test/i.test(t)) return false
  const emoji = t.match(/\p{Extended_Pictographic}/gu) || []
  if (emoji.length > 1) return false
  return t.length <= 72
}

export function listKaleduCtaBank(): string[] {
  return [...ALL_KALEDU_CTAS]
}

export type KaleduCtaIntent =
  | 'GIFT_DISCOVERY'
  | 'SHOPPING_STRESS'
  | 'RECIPIENT'
  | 'BUDGET'
  | 'PRODUCT'
  | 'COZY_MOOD'
  | 'LAST_MINUTE'
  | 'COUPLE'
  | 'PRACTICAL'
  | 'GENERIC'

const RECIPIENT_FORMS: Array<{ re: RegExp; form: string }> = [
  { re: /koleg/iu, form: 'kolegai' },
  { re: /mam/iu, form: 'mamai' },
  { re: /tėt|teti|tėč/iu, form: 'tėčiui' },
  { re: /seser|sesė|sesei/iu, form: 'sesei' },
  { re: /brol/iu, form: 'broliui' },
  { re: /paaugl/iu, form: 'paaugliui' },
  { re: /močiut|mociut/iu, form: 'močiutei' },
  { re: /senel/iu, form: 'seneliui' },
]

const CTA_LEADS: Record<KaleduCtaIntent, string[]> = {
  SHOPPING_STRESS: [
    'Rask dovaną be ilgo blaškymosi –',
    'Palengvink dovanų paiešką –',
    'Mažiau paieškų, daugiau aiškių idėjų –',
  ],
  LAST_MINUTE: ['Rask dovaną greičiau –', 'Dar neišrinkai dovanos? Užsuk į'],
  BUDGET: [],
  PRODUCT: ['Šį ir daugiau jaukių dovanų rasi', 'Daugiau praktiškų dovanų rasi'],
  COUPLE: ['Rask tinkamą dovaną porai –', 'Šias ir daugiau jaukių dovanų rasi'],
  RECIPIENT: [],
  COZY_MOOD: ['Dar daugiau jaukumo Kalėdoms rasi', 'Jaukias dovanas žiemos vakarams rasi'],
  PRACTICAL: ['Daugiau praktiškų dovanų rasi', 'Rask tinkamą variantą –'],
  GIFT_DISCOVERY: ['Daugiau dovanų idėjų rasi', 'Rask tinkamą variantą –'],
  GENERIC: ['Daugiau dovanų idėjų rasi'],
}

const recentCtaLeads: string[] = []

function storyBlob(parts: string[]): string {
  return parts.filter(Boolean).join(' ').toLocaleLowerCase('lt-LT')
}

function leadWords(lead: string): string[] {
  return lead
    .toLocaleLowerCase('lt-LT')
    .split(/[^\p{L}0-9]+/u)
    .filter((w) => w.length >= 5)
}

function overlapsClose(lead: string, closeBody: string): boolean {
  const words = leadWords(lead)
  if (!words.length) return false
  const close = closeBody.toLocaleLowerCase('lt-LT')
  const hits = words.filter((w) => close.includes(w))
  return hits.length >= Math.min(2, words.length) && hits.length / words.length >= 0.5
}

export function inferKaleduCtaIntent(blob: string, opts: { mode?: string; productCount?: number }): KaleduCtaIntent {
  if (/paskutin|skub|jau\s+čia|liko\s+mažai|minut/iu.test(blob)) return 'LAST_MINUTE'
  if (/iki\s*(20|30|40|50)\s*(?:€|eur)/iu.test(blob)) return 'BUDGET'
  if (opts.mode === 'PRODUCT_LED' && (opts.productCount || 0) > 0) return 'PRODUCT'
  if (/porai|dviese/iu.test(blob)) return 'COUPLE'
  if (RECIPIENT_FORMS.some((row) => row.re.test(blob))) return 'RECIPIENT'
  if (/chaos|stres|pasirink|nežinai|blašk|per\s+daug/iu.test(blob)) return 'SHOPPING_STRESS'
  if (/jauk|atmosfer|žiemos\s+vakar|film/iu.test(blob)) return 'COZY_MOOD'
  if (/praktišk/iu.test(blob)) return 'PRACTICAL'
  return 'GENERIC'
}

function budgetLead(blob: string): string | null {
  const m = blob.match(/iki\s*(20|30|40|50)\s*(?:€|eur)/iu)
  if (!m) return null
  return `Rask dovanų iki ${m[1]} € –`
}

function recipientLead(blob: string): string | null {
  const row = RECIPIENT_FORMS.find((item) => item.re.test(blob))
  if (!row) return null
  return `Rask tinkamą dovaną ${row.form} –`
}

function productLeads(productCount: number, hasVisibleProduct: boolean): string[] {
  if (productCount >= 2 && hasVisibleProduct) return ['Šias ir daugiau jaukių dovanų rasi']
  if (hasVisibleProduct) return ['Šį ir daugiau jaukių dovanų rasi', 'Daugiau praktiškų dovanų rasi']
  return ['Daugiau praktiškų dovanų rasi']
}

export type KaleduCtaPick = {
  cta: string
  intent: KaleduCtaIntent
  leadIn: string
  ctaTail: string
  repeated: boolean
  issues: string[]
}

export function pickStoryAwareKaleduCta(opts: {
  theme?: string
  category?: string
  slides: Array<{ title?: string; body?: string; role?: string; productId?: string }>
  products?: Array<{ name?: string; sku?: string; slug?: string }>
  mode?: string
  seed?: number
}): KaleduCtaPick {
  const close = [...opts.slides].reverse().find((s) => s.role === 'close') || opts.slides.at(-1)
  const blob = storyBlob([
    opts.theme || '',
    opts.category || '',
    ...opts.slides.map((s) => `${s.title || ''} ${s.body || ''}`),
    ...(opts.products || []).map((p) => `${p.name || ''} ${p.sku || ''}`),
  ])
  const visible = opts.slides.some((s) => s.productId)
  const productCount = (opts.products || []).filter((p) => p.slug || p.sku).length
  const intent = inferKaleduCtaIntent(blob, { mode: opts.mode, productCount })
  let leads = [...(CTA_LEADS[intent] || CTA_LEADS.GENERIC)]
  if (intent === 'BUDGET') {
    const budget = budgetLead(blob)
    leads = budget ? [budget, 'Daugiau dovanų tavo biudžetui rasi'] : ['Daugiau dovanų idėjų rasi']
  }
  if (intent === 'RECIPIENT') {
    const rec = recipientLead(blob)
    leads = rec ? [rec, 'Daugiau dovanų idėjų rasi'] : ['Daugiau dovanų idėjų rasi']
  }
  if (intent === 'PRODUCT') leads = productLeads(productCount, visible)
  const closeBody = `${close?.title || ''} ${close?.body || ''}`
  const fresh = leads.filter((lead) => !recentCtaLeads.includes(lead) && !overlapsClose(lead, closeBody))
  const pool = fresh.length ? fresh : leads.filter((lead) => !overlapsClose(lead, closeBody))
  const usable = pool.length ? pool : leads
  const leadIn = usable[Math.abs(opts.seed || 0) % usable.length]
  const repeated = recentCtaLeads.includes(leadIn)
  recentCtaLeads.push(leadIn)
  if (recentCtaLeads.length > 12) recentCtaLeads.shift()
  const cta = finalizeKaleduCta(leadIn)
  const issues: string[] = []
  if (!cta.endsWith(KALEDU_CTA_TAIL) || (cta.match(/🎁/gu) || []).length !== 1) issues.push('cta_tail_invalid')
  if (repeated) issues.push('cta_repetition')
  if (overlapsClose(leadIn, closeBody)) issues.push('cta_semantic_repeat')
  const euro = cta.match(/iki\s*(\d+)\s*€/iu)
  if (euro && !new RegExp(`iki\\s*${euro[1]}\\s*(?:€|eur)`, 'iu').test(blob)) issues.push('cta_wrong_budget')
  if (/šį|šią|šias|šiuos/iu.test(leadIn) && !visible) issues.push('cta_wrong_product')
  return { cta, intent, leadIn, ctaTail: KALEDU_CTA_TAIL, repeated, issues }
}
