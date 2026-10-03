import fs from 'node:fs'
import path from 'node:path'
import { profileDataPath } from './business-profiles.js'
import { getProfileBrand, CHRISTMAS_PRODUCTS_DIR } from './profile-brand.js'
import { inferKaleduBgCategory } from './ugc-kaledu-bgs.js'
import { repeatsIdeaFamily } from './ugc-lt/idea-families.js'
import { isNearDuplicateSentenceKey, normalizeSentenceKey } from './ugc-lt-normalize.js'
import { rankByLedgerFreshness } from './ugc-variety-ledger.js'

export type UgcThemeKind = 'generic' | 'product'

export type KaleduCatalogProduct = {
  productId: string
  slug: string
  sku: string
  name: string
  tagline: string
  priceCents: number
  recipients: string[]
  vibes: string[]
  benefits?: string[] | undefined
  ugcFamily?: string | undefined
  ugcUseCases?: string[] | undefined
  images: string[]
  inStock: boolean
}

export type KaleduProductAssets = {
  productId: string
  name: string
  image: string
  url: string
  priceCents: number
  recipients: string[]
  vibes: string[]
  sku: string
  tagline: string
}

const STOP_WORDS = new Set([
  'rinkinys',
  'dovana',
  'dovanos',
  'namams',
  'vakaras',
  'vakarui',
  'žiema',
  'ziemos',
  'kalėdų',
  'kaledu',
  'kampelis',
])

const GENERIC_THEME_RE =
  /klaidos|patarim|mitas|kaip rinktis|kaip (?:neišleisti|išrinkti|sutaupyti|nepasiklysti)|stresas|chaosas|per daug pasirink|sąrašas be|3 klaidos/i
const ADVICE_THEME_RE =
  /kaip (?:neišleisti|išrinkti|sutaupyti|nepasiklysti|nepirkti)|chaos|stres|per daug pasirink|klaidos|patarim|mitas/i
const WEAK_VIBE_ONLY_RE =
  /^(?:[\s\p{P}]*\b(?:jauk\p{L}*|šilum\p{L}*|silum\p{L}*|namai|namų|namu|šventin\p{L}*|sventin\p{L}*|vakar\p{L}*|dovan\p{L}*|kalėd\p{L}*|kaled\p{L}*)\b[\s\p{P}]*)+$/iu

export type KaleduModeHint = 'product_led' | 'hybrid' | 'generic'
export type KaleduStoryModeKind = 'PRODUCT_LED' | 'HYBRID' | 'GENERIC'
export type KaleduIntentConfidence = 'HIGH' | 'MEDIUM' | 'LOW'

export const KALEDU_CATEGORY_MODE: Record<string, KaleduStoryModeKind> = {
  Prekės: 'PRODUCT_LED',
  'Dovanų idėjos': 'HYBRID',
  Gavėjai: 'HYBRID',
  Biudžetas: 'HYBRID',
  'Apsipirkimo skausmas': 'GENERIC',
  'Jauki Kalėdų nuotaika': 'HYBRID',
}

type UsedProductState = { used: Array<{ slug: string; at: number }> }

function usedProductsFile(): string {
  return profileDataPath('ugc-slides', 'used_products.json')
}

function loadUsedProducts(): UsedProductState {
  const file = usedProductsFile()
  if (!fs.existsSync(file)) return { used: [] }
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<UsedProductState>
    const used = Array.isArray(data.used)
      ? data.used.filter(
          (row): row is { slug: string; at: number } =>
            !!row && typeof row.slug === 'string' && typeof row.at === 'number',
        )
      : []
    return { used }
  } catch {
    return { used: [] }
  }
}

export function recordKaleduProductUsage(slugs: string[]): void {
  if (!slugs.length) return
  const state = loadUsedProducts()
  const at = Date.now()
  for (const slug of slugs) {
    state.used.push({ slug, at })
  }
  state.used = state.used.slice(-80)
  const file = usedProductsFile()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(state, null, 2) + '\n', 'utf8')
}

function nextObjectEnd(text: string, start: number): number {
  let depth = 0
  let inStr = false
  let quote = ''
  for (let j = start; j < text.length; j++) {
    const c = text[j]
    if (inStr) {
      if (c === '\\') {
        j++
        continue
      }
      if (c === quote) inStr = false
      continue
    }
    if (c === '"' || c === "'") {
      inStr = true
      quote = c
      continue
    }
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return j
    }
  }
  return -1
}

function extractProductBlocks(text: string): string[] {
  const start = text.indexOf('export const products')
  const assign = text.indexOf('=', start < 0 ? 0 : start)
  const arrStart = text.indexOf('[', assign < 0 ? 0 : assign)
  if (arrStart < 0) return []
  const blocks: string[] = []
  let i = arrStart + 1
  while (i < text.length) {
    while (i < text.length && /[\s,]/.test(text[i])) i++
    if (text[i] === ']') break
    if (text[i] !== '{') {
      i++
      continue
    }
    const end = nextObjectEnd(text, i)
    if (end < 0) break
    blocks.push(text.slice(i, end + 1))
    i = end + 1
  }
  return blocks
}

function extractString(block: string, key: string): string {
  const m = block.match(new RegExp(`${key}:\\s*"([^"]*)"`))
  return m?.[1] || ''
}

function extractNumber(block: string, key: string): number {
  const m = block.match(new RegExp(`${key}:\\s*(-?\\d+)`))
  return m ? Number(m[1]) : 0
}

function extractStringArray(block: string, key: string): string[] {
  const m = block.match(new RegExp(`${key}:\\s*\\[([^\\]]*)]`))
  if (!m) return []
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1])
}

function extractTopLevelStringArray(block: string, key: string): string[] {
  let depth = 0
  let quote = ''
  for (let i = 0; i < block.length; i++) {
    const char = block[i]
    if (quote) {
      if (char === '\\') i++
      else if (char === quote) quote = ''
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === '{') depth++
    else if (char === '}') depth--
    else if (depth === 1 && block.startsWith(key, i) && !/[\w$]/.test(block[i - 1] || '')) {
      const rest = block.slice(i + key.length)
      if (/^\s*:\s*\[/.test(rest)) return extractStringArray(block.slice(i), key)
    }
  }
  return []
}

function ugcBlock(block: string): string {
  const match = block.match(/ugc:\s*\{([^}]*)\}/)
  return match?.[1] || ''
}

function extractUgcString(block: string, key: string): string | undefined {
  const value = extractString(ugcBlock(block), key)
  return value || undefined
}

function extractUgcArray(block: string, key: string): string[] | undefined {
  const nested = ugcBlock(block)
  if (!nested) return undefined
  const values = extractStringArray(nested, key)
  return values.length ? values : undefined
}

function extractBool(block: string, key: string): boolean {
  const m = block.match(new RegExp(`${key}:\\s*(true|false)`))
  return m?.[1] === 'true'
}

export function parseKaleduCatalogText(text: string): KaleduCatalogProduct[] {
  return extractProductBlocks(text)
    .map((block): KaleduCatalogProduct | null => {
      const slug = extractString(block, 'slug')
      if (!slug) return null
      return {
        productId: slug,
        slug,
        sku: extractString(block, 'sku'),
        name: extractString(block, 'name'),
        tagline: extractString(block, 'tagline'),
        priceCents: extractNumber(block, 'priceCents'),
        recipients: extractStringArray(block, 'recipients'),
        vibes: extractStringArray(block, 'vibes'),
        benefits: extractStringArray(block, 'benefits'),
        ugcFamily: extractUgcString(block, 'family'),
        ugcUseCases: extractUgcArray(block, 'useCases'),
        images: extractTopLevelStringArray(block, 'images'),
        inStock: extractBool(block, 'inStock'),
      } satisfies KaleduCatalogProduct
    })
    .filter((row): row is KaleduCatalogProduct => Boolean(row))
}

let catalogCache: { file: string; mtime: number; items: KaleduCatalogProduct[] } | null = null

export function loadKaleduCatalog(): KaleduCatalogProduct[] {
  const brand = getProfileBrand('christmas-gifts')
  const file = brand.productCatalogFile
  if (!file || !fs.existsSync(file)) return []
  const mtime = fs.statSync(file).mtimeMs
  if (catalogCache && catalogCache.file === file && catalogCache.mtime === mtime) {
    return catalogCache.items
  }
  const items = parseKaleduCatalogText(fs.readFileSync(file, 'utf8'))
  catalogCache = { file, mtime, items }
  return items
}

export function catalogProductFilenames(): Set<string> {
  const names = new Set<string>()
  for (const item of loadKaleduCatalog()) {
    for (const img of item.images) {
      names.add(path.basename(img))
    }
  }
  return names
}

export function resolveProductAssets(slug: string): KaleduProductAssets | null {
  const id = String(slug || '').trim()
  if (!id || !/^[a-z0-9-]+$/i.test(id)) return null
  const product = loadKaleduCatalog().find((row) => row.slug === id || row.productId === id)
  if (!product) return null
  const rel = product.images[0] || ''
  const url = rel.startsWith('/') ? rel : rel ? `/products/${rel}` : ''
  const image = url ? path.join(CHRISTMAS_PRODUCTS_DIR, path.basename(url)) : ''
  if (!image || !fs.existsSync(image)) return null
  return {
    productId: product.productId,
    name: product.name,
    image,
    url,
    priceCents: product.priceCents,
    recipients: product.recipients,
    vibes: product.vibes,
    sku: product.sku,
    tagline: product.tagline,
  }
}

export function inferUgcThemeKind(
  theme: {
    theme: string
    hook?: string
    body?: string
    kind?: UgcThemeKind
    modeHint?: KaleduModeHint
    productHints?: string[]
  },
  category = '',
): UgcThemeKind {
  if (theme.kind === 'generic' || theme.kind === 'product') return theme.kind
  return routeKaleduStory({
    theme: theme.theme,
    hook: theme.hook,
    body: theme.body,
    category,
    modeHint: theme.modeHint,
    productHints: theme.productHints,
  }).mode === 'GENERIC'
    ? 'generic'
    : 'product'
}

const LT_ROOT_ENDINGS = [
  'iuose',
  'iomis',
  'iaus',
  'iams',
  'iems',
  'iais',
  'omis',
  'ėmis',
  'ioms',
  'iose',
  'uose',
  'ėse',
  'ose',
  'oje',
  'ėje',
  'yje',
  'uje',
  'iai',
  'ius',
  'iui',
  'iam',
  'ių',
  'ais',
  'ams',
  'oms',
  'ėms',
  'ies',
  'ys',
  'is',
  'as',
  'us',
  'ės',
  'es',
  'os',
  'ai',
  'ei',
  'io',
  'iu',
  'ui',
  'ą',
  'ę',
  'į',
  'ų',
  'ė',
  'a',
  'o',
  'e',
  'i',
  'u',
  'y',
]

/** Case-insensitive LT noun root (min 3 letters) — equality, never prefix, so žvakė ≠ žvakidė. */
export function ltNounRoot(word: string): string {
  const t = String(word || '').toLocaleLowerCase('lt-LT')
  for (const ending of LT_ROOT_ENDINGS) {
    if (t.length - ending.length >= 3 && t.endsWith(ending)) return t.slice(0, -ending.length)
  }
  return t
}

function ltWords(text: string): string[] {
  return String(text || '')
    .toLocaleLowerCase('lt-LT')
    .split(/[^\p{L}0-9]+/u)
    .filter(Boolean)
}

/** Roots plus raw words, so exact-form heads (viskio) match without colliding with viską. */
function textRootSet(text: string): Set<string> {
  const words = ltWords(text)
  return new Set([...words, ...words.map(ltNounRoot)])
}

const GENERIC_CONTAINER_ROOTS = new Set(['rinkin', 'komplekt', 'dėžut'])

/** Heads that also parse as common verbs/nouns — require a qualifier instead. */
const AMBIGUOUS_HEAD_ROOTS = new Set(['stov', 'mini', 'lent'])

const HEAD_OVERRIDES: Record<string, string[]> = {
  'amzinoji-roze-gaubte': ['rož'],
  'telefono-stovas-stalas': ['telefon'],
  'serviravimo-lenta-vakariene': ['serviravim', 'lent'],
  'vaistazoliu-auginimo-rinkinys': ['sod', 'vaistažol'],
  'viskio-akmenu-ir-stiklo-rinkinys': ['viskio'],
  'vaiku-kaledinis-zaidimas': ['vaik'],
  'menulio-lempa-3d': ['mėnul'],
  'saulelydzio-lempa': ['saulėlyd'],
  'galaktikos-projektorius-zvaigzdziu-kelione': ['galaktik'],
  'kaledu-dovanu-kojine-staigmena': ['kojinė'],
}

/** Product type phrase = name before the quoted marketing title („Žiemos šiluma“ is not a noun claim). */
export function productTypePhrase(product: KaleduCatalogProduct): string {
  return product.name.split(/[„“"]/)[0].trim()
}

/** Roots that must appear in copy for it to name this SKU. */
/** Strict head roots (shop-noun detection) plus every content word of the type phrase. */
export function productNameRoots(product: KaleduCatalogProduct): string[] {
  const words = ltWords(productTypePhrase(product))
  const roots = words.map(ltNounRoot)
  // Every content word of the product type counts as naming it on its own slide: the reveal
  // „Gali rinktis saulėlydžio lempą“ must match even when the head is an ambiguous noun.
  const content = roots.filter((root) => root.length >= 3 && !isGenericProductRoot(root) && !RECIPIENT_PRODUCT_ROOTS.has(root))
  return [...new Set([...productHeadRoots(product), ...content])]
}

export function productHeadRoots(product: KaleduCatalogProduct): string[] {
  const override = HEAD_OVERRIDES[product.slug]
  if (override) return override
  const words = ltWords(productTypePhrase(product))
  if (!words.length) return []
  const roots = words.map(ltNounRoot)
  const head = roots[roots.length - 1]
  if (GENERIC_CONTAINER_ROOTS.has(head)) {
    return roots.slice(0, -1).filter((root) => root.length >= 3 && !isGenericProductRoot(root))
  }
  if (AMBIGUOUS_HEAD_ROOTS.has(head)) {
    return roots.slice(0, -1).filter((root) => root.length >= 3)
  }
  return [head]
}

/** Common gift nouns — naming one claims the shop sells it. Generic words (dovana, daiktas, dekoracija) are absent. */
const STATIC_CONCRETE_PRODUCT_ROOTS = [
  'pled',
  'antklod',
  'žvak',
  'žvakid',
  'puodel',
  'termos',
  'gertuv',
  'difuzor',
  'kvepal',
  'pinigin',
  'ausin',
  'rankšluost',
  'rankšluosč',
  'kosmetik',
  'knyg',
  'kalendor',
  'laikrod',
  'šalik',
  'pirštin',
  'kepur',
  'megztin',
  'chalat',
  'pižam',
  'kojin',
  'šlepet',
  'lemp',
  'žibint',
  'girliand',
  'žaisliuk',
  'žaisl',
  'lėl',
  'dėlion',
  'konstruktor',
  'kilim',
  'užvalkal',
  'patalyn',
  'auskar',
  'apyrank',
  'kaklaskar',
  'vyn',
  'šampan',
  'šokolad',
  'saldain',
  'sausain',
  'projektor',
  'drėkintuv',
  'masažuokl',
  'dėkl',
  'užrašin',
  'sąsiuvin',
  'dienoraš',
  'albom',
  'rėmel',
  'vaz',
  'arbatinuk',
  'krepš',
  'krem',
  'muil',
  'planšet',
  'garsiakalb',
  'baterij',
  'įkrovikl',
  'purškikl',
  'plakikl',
  'pakabuk',
  'šildykl',
  'rož',
]

let concreteRootCache: { items: KaleduCatalogProduct[]; roots: Set<string> } | null = null

export function kaleduConcreteProductRoots(): Set<string> {
  const items = loadKaleduCatalog()
  if (concreteRootCache && concreteRootCache.items === items) return concreteRootCache.roots
  const roots = new Set(STATIC_CONCRETE_PRODUCT_ROOTS)
  for (const product of items) {
    for (const root of productHeadRoots(product)) roots.add(root)
  }
  concreteRootCache = { items, roots }
  return roots
}

/** Catalog products whose head noun the theme names explicitly (pledas, termosas…). */
export function themeExplicitCatalogProducts(theme: string): KaleduCatalogProduct[] {
  const roots = textRootSet(theme)
  return loadKaleduCatalog().filter((product) => {
    const heads = productHeadRoots(product)
    return heads.length > 0 && heads.some((root) => roots.has(root))
  })
}

/** Concrete gift nouns named in copy, with the matched root. */
export function kaleduConcreteProductNouns(text: string): Array<{ word: string; root: string }> {
  const concrete = kaleduConcreteProductRoots()
  const out: Array<{ word: string; root: string }> = []
  for (const word of ltWords(text)) {
    const root = ltNounRoot(word)
    if (concrete.has(word)) out.push({ word, root: word })
    else if (concrete.has(root)) out.push({ word, root })
  }
  return out
}

export function kaleduBudgetCapCents(theme = '', category = ''): number | null {
  const blob = `${theme} ${category}`
  const m = blob.match(/iki\s*(20|30|50)/i)
  if (m) return Number(m[1]) * 100
  return null
}

export function isKaleduBudgetTheme(theme = '', category = ''): boolean {
  return kaleduBudgetCapCents(theme, category) != null || /biudžet/i.test(`${theme} ${category}`)
}

function inferRecipients(theme: string, category: string): string[] {
  const blob = `${theme} ${category}`.toLocaleLowerCase('lt-LT')
  const out = new Set<string>()
  if (/mamai|jai|moter/i.test(blob)) out.add('jai')
  if (/tėč|tėtis|tetis|\bjam\b|vyrui|vyrams/i.test(blob)) out.add('jam')
  if (/porai|porom|partner/i.test(blob)) out.add('porai')
  if (/tėvam|tevam|šeim|seim/i.test(blob)) {
    out.add('tevams')
    out.add('seimai')
  }
  if (/koleg/i.test(blob)) out.add('kolegai')
  if (/draug/i.test(blob)) out.add('draugui')
  return [...out]
}

function giftCountFromTheme(theme: string): number | null {
  const m = theme.match(/(\d+)\s*dovan/i)
  return m ? Number(m[1]) : null
}

function tokensOf(text: string): string[] {
  return text
    .toLocaleLowerCase('lt-LT')
    .replace(/[„“"']/g, ' ')
    .split(/[^\p{L}0-9]+/u)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w))
}

export function productMatchTokens(product: KaleduCatalogProduct): string[] {
  const fromName = tokensOf(product.name)
  const fromSlug = product.slug.split('-').filter((w) => w.length >= 4)
  return [...new Set([...fromName, ...fromSlug, product.sku.toLowerCase()])]
}

const LT_CASE_ENDINGS = [
  'iais',
  'omis',
  'iams',
  'ims',
  'ėse',
  'ose',
  'yje',
  'uje',
  'ius',
  'iam',
  'ais',
  'ams',
  'oms',
  'io',
  'iu',
  'ui',
  'is',
  'as',
  'ys',
  'ės',
  'os',
  'ą',
  'ę',
  'į',
  'ų',
  'ė',
  'a',
  'o',
  'e',
  'i',
  'u',
  'y',
]

export function normalizeKaleduProductToken(token: string): string {
  let t = token.toLocaleLowerCase('lt-LT')
  if (t.length < 4) return t
  for (const ending of LT_CASE_ENDINGS) {
    if (t.length - ending.length >= 4 && t.endsWith(ending)) return t.slice(0, -ending.length)
  }
  return t
}

export function buildProductMatchTokens(product: KaleduCatalogProduct): string[] {
  return [
    ...new Set(
      tokensOf(product.name)
        .map(normalizeKaleduProductToken)
        .filter((root) => root.length >= 4),
    ),
  ]
}

/** Copy names this exact SKU by its type head noun (any LT inflection). */
export function copyMatchesSelectedProduct(text: string, product: KaleduCatalogProduct): boolean {
  const heads = productNameRoots(product)
  if (!heads.length) return false
  const roots = textRootSet(text)
  return heads.some((root) => roots.has(root))
}

export type KaleduProductSlideVerdict = 'ok' | 'no_product' | 'unknown_product' | 'image_missing' | 'copy_mismatch'

export function kaleduProductSlideVerdict(slide: {
  title?: string
  body?: string
  productId?: string
}): KaleduProductSlideVerdict {
  const id = String(slide.productId || '').trim()
  if (!id) return 'no_product'
  const product = loadKaleduCatalog().find((row) => row.slug === id || row.productId === id)
  if (!product) return 'unknown_product'
  if (!resolveProductAssets(id)) return 'image_missing'
  if (!copyMatchesSelectedProduct(`${slide.title || ''} ${slide.body || ''}`, product)) return 'copy_mismatch'
  return 'ok'
}

/**
 * Concrete product slide = productId + matching copy + resolvable image.
 * Anything else is downgraded to a generic slide before the renderer sees it.
 */
export function enforceKaleduProductSlide<
  T extends { title?: string; body?: string; productId?: string; showProductPrice?: boolean; productPriceLabel?: string },
>(slide: T, opts: InventedProductRepairOpts = {}): T {
  const verdict = kaleduProductSlideVerdict(slide)
  if (verdict === 'ok' || verdict === 'no_product') return slide
  const id = String(slide.productId || '').trim()
  if (verdict === 'image_missing') {
    console.warn(`PRODUCT_IMAGE_MISSING productId=${id}`)
  }
  const body = repairInventedProductCopy(String(slide.body || ''), [], opts)
  const bodyChanged = body !== String(slide.body || '')
  return {
    ...slide,
    productId: undefined,
    showProductPrice: false,
    productPriceLabel: undefined,
    body: bodyChanged || kaleduConcreteProductNouns(body).length
      ? body
      : String(slide.body || ''),
  }
}

export function copyNamesProduct(text: string, product: KaleduCatalogProduct): boolean {
  return copyMatchesSelectedProduct(text, product)
}

/**
 * Stricter than copyNamesProduct: the copy actually presents this SKU — its quoted marketing
 * name, or every content word of its type phrase („keramikos arbatos rinkinys“). A passing
 * „užsiplikys arbatos“ names a habit, not the product, and must not carry its picture.
 */
export function copyRevealsProduct(text: string, product: KaleduCatalogProduct): boolean {
  const source = String(text || '')
  const mkt = productMarketingName(product).toLocaleLowerCase('lt-LT')
  if (mkt && source.toLocaleLowerCase('lt-LT').includes(mkt)) return true
  const roots = textRootSet(source)
  const typeRoots = ltWords(productTypePhrase(product))
    .map(ltNounRoot)
    .filter((root) => root.length >= 3 && !RECIPIENT_PRODUCT_ROOTS.has(root))
  if (!typeRoots.length) return copyMatchesSelectedProduct(source, product)
  return typeRoots.every((root) => roots.has(root))
}

const GENERIC_PRODUCT_ROOTS = ['dovan', 'jauk', 'švent', 'staig', 'idėj', 'žmog', 'vakar', 'puik', 'nam']

/** People / recipients — never treat as shop SKU nouns (even if a catalog title starts with Vaikų…). */
const RECIPIENT_PRODUCT_ROOTS = new Set([
  'vaik',
  'mam',
  'tėv',
  'tev',
  'tėč',
  'tet',
  'senel',
  'močiut',
  'mociut',
  'anūk',
  'anuk',
  'broli',
  'seser',
  'draug',
  'koleg',
  'por',
  'partner',
  'vyr',
  'moter',
  'paaugl',
])

function isGenericProductRoot(root: string): boolean {
  return GENERIC_PRODUCT_ROOTS.some((prefix) => root.startsWith(prefix))
}

function isRecipientProductRoot(root: string): boolean {
  return [...RECIPIENT_PRODUCT_ROOTS].some((prefix) => root === prefix || root.startsWith(prefix))
}

function allowedHeadRoots(allowed: KaleduCatalogProduct[]): Set<string> {
  const roots = new Set<string>()
  for (const product of allowed) {
    for (const root of productHeadRoots(product)) roots.add(root)
    for (const root of ltWords(productTypePhrase(product)).map(ltNounRoot)) roots.add(root)
  }
  return roots
}

function allowedMarketingNames(allowed: KaleduCatalogProduct[]): Set<string> {
  const names = new Set<string>()
  for (const product of allowed) {
    const quoted = product.name.match(/[„“"]([^„“"]+)[„“"]/)?.[1]
    if (quoted) names.add(quoted.toLocaleLowerCase('lt-LT').trim())
  }
  return names
}

const CONTAINER_SHAPE_RE = /(\p{L}{4,})\s+(komplekt\p{L}*|rinkin\p{L}*)/giu
const QUOTED_NAME_RE = /[„“"]([^„“"]{3,40})[„“"]/gu
const BRAND_QUOTES = new Set(['kalėdų kampelis', 'kalėdų kampelio', 'kalėdų kampelyje'])
const RECOMMENDATION_CUE_RE =
  /gali\s+rinktis|rinkis|siūlau|tinka\s+dovanai|puiki\s+dovana|(?<!\p{L})(?:šis|ši|šie|šios|mūsų)(?!\p{L})/iu
const AMBIENCE_FOLLOW_RE = /^(?:švies|kvap|nuotaik|atmosfer)/u

function splitSentences(text: string): string[] {
  return String(text || '')
    .split(/(?<=[.!?…])\s+/u)
    .map((part) => part.trim())
    .filter(Boolean)
}

function isRecommendationSentence(sentence: string): boolean {
  return RECOMMENDATION_CUE_RE.test(sentence) || /[„“"]/u.test(sentence)
}

/** Genitive family noun modifying light/scent/mood, not a product claim. */
function isAmbienceMention(sentence: string, word: string): boolean {
  const words = ltWords(sentence)
  const at = words.indexOf(word.toLocaleLowerCase('lt-LT'))
  if (at < 0 || at + 1 >= words.length) return false
  return AMBIENCE_FOLLOW_RE.test(words[at + 1])
}

function slideProduct(allowed: KaleduCatalogProduct[], productId = ''): KaleduCatalogProduct | undefined {
  const id = productId.trim()
  if (!id) return undefined
  return allowed.find((p) => p.slug === id || p.productId === id)
}

/**
 * Concrete product claims not backed by PRODUCTS_ALLOWED.
 * allowed=[] means every concrete product noun is invented; generic gift words stay legal.
 */
export function kaleduInventedProductMentions(text: string, allowed: KaleduCatalogProduct[]): string[] {
  const found = new Set<string>()
  const source = String(text || '')
  const allowedRoots = allowedHeadRoots(allowed)
  for (const { word, root } of kaleduConcreteProductNouns(source)) {
    if (allowedRoots.has(root)) continue
    if (isRecipientProductRoot(root)) continue
    if (isAmbienceMention(source, word)) continue
    found.add(word)
  }
  CONTAINER_SHAPE_RE.lastIndex = 0
  for (const match of source.matchAll(CONTAINER_SHAPE_RE)) {
    const qualifier = ltNounRoot(match[1] || '')
    if (isGenericProductRoot(qualifier) || allowedRoots.has(qualifier)) continue
    if (GENERIC_CONTAINER_ROOTS.has(qualifier)) continue
    if (/^(šventin|kalėdin|dovan|jauk|gražu|mažas|didel|nauj|toks|tok)/u.test(qualifier)) continue
    found.add(match[0].trim())
  }
  const marketing = allowedMarketingNames(allowed)
  QUOTED_NAME_RE.lastIndex = 0
  for (const match of source.matchAll(QUOTED_NAME_RE)) {
    const name = (match[1] || '').toLocaleLowerCase('lt-LT').trim()
    if (!name || BRAND_QUOTES.has(name) || marketing.has(name)) continue
    found.add(`„${match[1]}“`)
  }
  return [...found]
}

/**
 * A recommendation/reveal (gali rinktis, quoted catalog name, …) must name the slide's productId.
 * A plain family mention is not a reveal and is handled by kaleduInventedProductMentions.
 */
export function kaleduUngroundedRecommendations(
  text: string,
  storyAllowed: KaleduCatalogProduct[],
  productId = '',
): string[] {
  const product = slideProduct(storyAllowed, productId)
  const slideRoots = new Set(product ? productNameRoots(product) : [])
  const marketing = product ? allowedMarketingNames([product]) : new Set<string>()
  const found = new Set<string>()
  for (const sentence of splitSentences(text)) {
    if (!isRecommendationSentence(sentence)) continue
    for (const { word, root } of kaleduConcreteProductNouns(sentence)) {
      if (!slideRoots.has(root)) found.add(word)
    }
    QUOTED_NAME_RE.lastIndex = 0
    for (const match of sentence.matchAll(QUOTED_NAME_RE)) {
      const name = (match[1] || '').toLocaleLowerCase('lt-LT').trim()
      if (!name || BRAND_QUOTES.has(name) || marketing.has(name)) continue
      found.add(`„${match[1]}“`)
    }
  }
  return [...found]
}

export type KaleduSlideIntent = 'GENERIC' | 'PRODUCT_REFERENCE' | 'PRODUCT_RECOMMENDATION'

const DEICTIC_GIFT_RE =
  /(?<!\p{L})(?:šit(?:as|a|ą|o|ai|ų|iem)?|šitas|šitą)\s+(?:dovan\p{L}*|daikt\p{L}*|prek\p{L}*)|(?<!\p{L})(?:šis|ši|šio|šią)\s+(?:dovan\p{L}*|daikt\p{L}*|prek\p{L}*|pled\p{L}*|puodel\p{L}*|žvak\p{L}*|termos\p{L}*)/iu
const GIFT_REC_CUE_RE =
  /gali\s+rinktis|(?<!\p{L})rinkis(?!\p{L})|siūlau|puiki\s+dovana|tinka\s+dovanai|galima\s+padovanoti|(?<!\p{L})mūsų\s+\p{L}{4,}/iu

export function classifyKaleduSlideIntent(text: string, _allowed: KaleduCatalogProduct[] = []): KaleduSlideIntent {
  const source = String(text || '')
  const nouns = kaleduConcreteProductNouns(source)
  const quoted = [...source.matchAll(QUOTED_NAME_RE)].some((m) => {
    const name = (m[1] || '').toLocaleLowerCase('lt-LT').trim()
    return Boolean(name && !BRAND_QUOTES.has(name))
  })
  const deictic = DEICTIC_GIFT_RE.test(source) || GIFT_REC_CUE_RE.test(source)
  const concreteAnswer = nouns.some(({ word }) => !isAmbienceMention(source, word))
  if (deictic || quoted || concreteAnswer) return 'PRODUCT_RECOMMENDATION'
  if (nouns.length) return 'PRODUCT_REFERENCE'
  return 'GENERIC'
}

const GENERIC_DEICTIC_REWRITE = 'Net maža, apgalvota dovana gali pradžiuginti.'

export function repairKaleduProductConsistency<
  T extends { title?: string; body?: string; productId?: string; showProductPrice?: boolean },
>(slide: T, allowed: KaleduCatalogProduct[]): { slide: T; intent: KaleduSlideIntent; code?: string } {
  const text = `${slide.title || ''} ${slide.body || ''}`.trim()
  const intent = classifyKaleduSlideIntent(text, allowed)
  if (intent !== 'PRODUCT_RECOMMENDATION') return { slide, intent }
  const current = slideProduct(allowed, slide.productId || '')
  if (current && resolveProductAssets(current.slug) && copyNamesProduct(text, current)) {
    const body = String(slide.body || '')
    const short = body.length > 200 ? body.split(/(?<=[.!?])\s+/u)[0] : body
    return { slide: short === body ? slide : { ...slide, body: short }, intent }
  }
  const named = allowed.find((p) => copyNamesProduct(text, p) && resolveProductAssets(p.slug))
  if (named) {
    return {
      slide: { ...slide, productId: named.productId || named.slug, showProductPrice: false },
      intent,
      code: 'missing_product_visual',
    }
  }
  return {
    slide: { ...slide, title: '', body: GENERIC_DEICTIC_REWRITE, productId: undefined, showProductPrice: false },
    intent: 'GENERIC',
    code: 'product_reference_without_product',
  }
}

type LtAgreementClass = 'masc_sg' | 'fem_sg' | 'masc_pl' | 'fem_pl' | 'other'

function agreementClassOf(word: string): LtAgreementClass {
  const w = word.toLocaleLowerCase('lt-LT')
  if (/(iai|ai)$/u.test(w)) return 'masc_pl'
  if (/(ės)$/u.test(w)) return 'fem_pl'
  if (/(ius|is|ys|as|us)$/u.test(w)) return 'masc_sg'
  if (/(ė|a)$/u.test(w)) return 'fem_sg'
  return 'other'
}

function toAccusativeWord(word: string, cls: LtAgreementClass): string {
  const keepCase = /^[A-ZĄČĘĖĮŠŲŪŽ]{2,}$/u.test(word)
  const lower = keepCase ? word : word.toLocaleLowerCase('lt-LT')
  const swap = (from: number, to: string) => `${lower.slice(0, -from)}${to}`
  if (cls === 'masc_sg') {
    if (lower.endsWith('ius')) return swap(3, 'ių')
    if (lower.endsWith('is') || lower.endsWith('ys')) return swap(2, 'į')
    if (lower.endsWith('us')) return swap(2, 'ų')
    if (lower.endsWith('as')) return swap(2, 'ą')
  }
  if (cls === 'fem_sg') {
    if (lower.endsWith('ė')) return swap(1, 'ę')
    if (lower.endsWith('a')) return swap(1, 'ą')
  }
  if (cls === 'fem_pl' && lower.endsWith('ės')) return swap(2, 'es')
  if (cls === 'masc_pl') {
    if (lower.endsWith('iai')) return swap(3, 'ius')
    if (lower.endsWith('ai')) return swap(2, 'us')
  }
  return lower
}

const ACCUSATIVE_OVERRIDES: Record<string, string> = {
  'amzinoji-roze-gaubte': 'rožę stikliniame gaubte',
}

/** Type phrase in accusative: only words agreeing with the head noun change (eglutės stays genitive). */
export function productAccusativePhrase(product: KaleduCatalogProduct): string {
  const override = ACCUSATIVE_OVERRIDES[product.slug]
  if (override) return override
  const words = productTypePhrase(product).split(/\s+/).filter(Boolean)
  if (!words.length) return ''
  const headClass = agreementClassOf(words[words.length - 1])
  return words
    .map((word, i) => {
      const agrees = i === words.length - 1 || agreementClassOf(word) === headClass
      if (!agrees) return /^[A-ZĄČĘĖĮŠŲŪŽ]{2,}$/u.test(word) ? word : word.toLocaleLowerCase('lt-LT')
      return toAccusativeWord(word, headClass)
    })
    .join(' ')
}

function productMarketingName(product: KaleduCatalogProduct): string {
  return product.name.match(/[„“"]([^„“"]+)[„“"]/)?.[1]?.trim() || ''
}

/** Deterministic lines that never name a concrete product. */
export const KALEDU_GENERIC_GIFT_SENTENCES = [
  'Gali rinktis jaukią dovaną, kuri tiktų tam žmogui.',
  'Užtenka vienos apgalvotos dovanos, kuri tinka žmogui.',
  'Svarbiau ne kaina, o tai, ar dovana tiks žmogui.',
  'Rinkis dovaną, kurią žmogus tikrai naudos kasdien.',
  'Pagalvok, ko žmogui trūksta namuose, ir nuo to pradėk dovanos paiešką.',
  'Ieškok dovanos pagal tai, kaip žmogus leidžia laisvus vakarus.',
  'Paprasta ir praktiška dovana dažnai pradžiugina labiau nei brangi.',
  'Geriausia dovana ta, kurią žmogus naudos ne vieną kartą.',
]

export type InventedProductRepairOpts = {
  priorText?: string
}

function priorSentenceKeys(priorText: string): string[] {
  return String(priorText || '')
    .split(/(?<=[.!?…])\s+/)
    .map((s) => normalizeSentenceKey(s.trim()))
    .filter((key) => key.split(' ').filter(Boolean).length >= 4)
}

function pickFreshSentence(candidates: string[], priorText = ''): string {
  const priorKeys = priorSentenceKeys(priorText)
  const ranked = rankByLedgerFreshness(candidates)
  const fresh = ranked.filter((candidate) => {
    const key = normalizeSentenceKey(candidate)
    return !priorKeys.includes(key) && !isNearDuplicateSentenceKey(key, priorKeys, 0.7)
  })
  // Prefer a line that does not repeat an idea already in the post ("tinka žmogui" twice).
  return fresh.find((candidate) => !repeatsIdeaFamily(candidate, priorText)) || fresh[0] || ranked[0] || candidates[0]
}

export function pickGenericGiftSentence(priorText = ''): string {
  return pickFreshSentence(KALEDU_GENERIC_GIFT_SENTENCES, priorText)
}

export function rewriteInventedProductSentence(
  _sentence: string,
  allowed: KaleduCatalogProduct[],
  opts: InventedProductRepairOpts = {},
): string {
  const product = allowed[0]
  if (!product) return pickGenericGiftSentence(opts.priorText)
  const acc = productAccusativePhrase(product)
  const mkt = productMarketingName(product)
  const tail = mkt ? ` „${mkt}“` : ''
  return pickFreshSentence(
    [
      `Rinkis ${acc}${tail}.`,
      `Pažiūrėk į ${acc}${tail}.`,
      `Gali rinktis ${acc}${tail}.`,
    ],
    opts.priorText,
  )
}

export function repairInventedProductCopy(
  text: string,
  allowed: KaleduCatalogProduct[],
  opts: InventedProductRepairOpts = {},
): string {
  const parts = String(text || '')
    .split(/(?<=[.!?])\s+/)
    .filter((part) => part.trim())
  if (!parts.length) return text
  let priorAcc = String(opts.priorText || '')
  const rewritePart = (part: string): string => {
    if (!kaleduInventedProductMentions(part, allowed).length) return part
    const rewritten = rewriteInventedProductSentence(part, allowed, { priorText: priorAcc })
    priorAcc = `${priorAcc} ${rewritten}`.trim()
    return rewritten
  }
  let next = parts.map(rewritePart).join(' ')
  if (kaleduInventedProductMentions(next, allowed).length) {
    priorAcc = String(opts.priorText || '')
    next = parts
      .map((part) => {
        if (!kaleduInventedProductMentions(part, allowed).length) return part
        if (allowed.length) {
          const rewritten = rewriteInventedProductSentence(part, allowed, { priorText: priorAcc })
          priorAcc = `${priorAcc} ${rewritten}`.trim()
          return rewritten
        }
        const generic = pickGenericGiftSentence(priorAcc)
        priorAcc = `${priorAcc} ${generic}`.trim()
        return generic
      })
      .join(' ')
  }
  return next
}

function recentUsagePenalty(slug: string, used: UsedProductState): number {
  const recent = used.used.slice(-8)
  return recent.filter((row) => row.slug === slug).length * 50
}

function scoreProduct(
  product: KaleduCatalogProduct,
  opts: { theme: string; category: string; recipients: string[]; cap: number | null; used: UsedProductState },
): number {
  if (!product.inStock) return -1
  if (opts.cap != null && product.priceCents > opts.cap) return -1
  let score = 10
  for (const rec of opts.recipients) {
    if (product.recipients.includes(rec)) score += 30
  }
  const blob = `${opts.theme} ${opts.category}`.toLocaleLowerCase('lt-LT')
  for (const vibe of product.vibes) {
    if (blob.includes(vibe)) score += 15
  }
  const themeRoots = textRootSet(blob)
  if (productHeadRoots(product).some((root) => themeRoots.has(root))) score += 400
  score -= recentUsagePenalty(product.slug, opts.used)
  return score
}

/**
 * Strong use-case / lifestyle cues mapped to real catalog slugs.
 * If the SKU is missing, out of stock, or has no image, the cue is ignored.
 */
export type KaleduLifestyleIntent = {
  label: string
  confidence: 'HIGH' | 'MEDIUM'
  theme: RegExp
  slugs: string[]
  products?: RegExp[]
  context: string[]
  why: string[]
  copy: RegExp
}

/**
 * Why-lines for products no lifestyle intent covers. Every product slide needs a reason, not
 * just „Gali rinktis X.“ Claims stay inside the catalog tagline/benefits.
 */
export const KALEDU_PRODUCT_WHY: Record<string, string[]> = {
  'egluciu-zaisliukai-stiklas': ['Rankų pūsto stiklo žaisliukai eglutę puoš ne vienus metus.'],
  'odinis-korteliu-deklas': ['Plonas dėklas telpa kišenėje, todėl kortelės visada po ranka.'],
  'uzrasine-aukso-krastu': ['Tokia užrašinė tiks kasdieniams planams ir mintims.'],
  'lietaus-debesies-drekinuvas': ['Drėkintuvas sudrėkina sausą žiemos orą ir švelniai kvepia.'],
  'megzta-sildykle-2l': ['Megzta šildyklė ilgai išlaiko šilumą šaltais vakarais.'],
  'raktu-pakabukas-namai': ['Mažas pakabukas su eglute primins šventes kiekvieną kartą paėmus raktus.'],
  'slepetes-minksta-peda': ['Minkštos šlepetės sušildys kojas kiekvieną žiemos vakarą namuose.'],
  'sniego-gaublys-ziemos-pasaka': ['Papurčius gaublį, viduje pradeda snigti, o tai džiugina ir vaikus, ir suaugusius.'],
  'stalo-takelis-siaures-rastas': ['Šventinis takelis per kelias sekundes papuošia visą Kalėdų stalą.'],
  'riesutu-spaudiklis-sargybinis': ['Medinis sargybinis puošia lentyną ir tikrai praverčia riešutams gliaudyti.'],
  'egles-sijonas-sventinis-ratas': ['Aksominis sijonas paslepia eglutės stovą ir gražiai įrėmina dovanas.'],
  'keramikinis-zibintas-ziemos-namelis': ['Šiltai šviečiantis namelis sukuria jaukumą be jokios liepsnos.'],
  'kaledinis-megztinis-sventinis-rastas': ['Ryškus megztinis su eglutėmis tiks šventinėms nuotraukoms ir vakarėliams.'],
  'seimos-megztiniai-kaledu-dziaugsmas': ['Derantys megztiniai tiks bendrai šeimos nuotraukai prie eglutės.'],
  'seimos-megztiniai-siaures-rastas': ['Derantys megztiniai tiks bendrai šeimos nuotraukai prie eglutės.'],
  'kalediniai-megztiniai-sniego-duetas': ['Derantys megztiniai tiks bendrai poros nuotraukai prie eglutės.'],
}

/** Reason lines for one product: its own lifestyle intent first, then the per-product list. */
export function kaleduProductReasonLines(product: KaleduCatalogProduct): string[] {
  const fromIntents = KALEDU_LIFESTYLE_INTENTS.filter((intent) => intent.slugs.includes(product.slug)).flatMap(
    (intent) => intent.why,
  )
  return [...fromIntents, ...(KALEDU_PRODUCT_WHY[product.slug] || [])]
}

export const KALEDU_LIFESTYLE_INTENTS: KaleduLifestyleIntent[] = [
  {
    label: 'latte',
    confidence: 'HIGH',
    theme: /latte|cappuccin|kavos\s+put|pieno\s+put/iu,
    slugs: ['pieno-plakiklis-usb'],
    context: ['Jei jis namie plaka pieną latte ar kakavai, dovanos kryptis jau aiški.'],
    why: ['Putos namie atsiras per kelias sekundes.'],
    copy: /latte|put|plakikl|kav|kakav/iu,
  },
  {
    label: 'kava',
    confidence: 'HIGH',
    theme: /(?<!\p{L})kav(?:a|ą|os|ai|oje|uką|ukas)(?!\p{L})|kavos\s+mėgėj|(?<!\p{L})kakav|rytin\p{L}*\s+kav/iu,
    slugs: ['kaledinis-puodelis-kakava'],
    products: [/puodel/iu],
    context: [
      'Jei žmogaus rytas prasideda nuo kavos, tai jau gera užuomina dovanai.',
      'Kai kava yra kasdienis ritualas, verta ieškoti dovanos, kuri tam ritualui praverstų.',
    ],
    why: ['Tiks kiekvieną rytą, kai ruošia kavą ar kakavą.', 'Tokia dovana kasdien bus po ranka virtuvėje.'],
    copy: /kav|ryt|puodel|gėrim|kakav|arbat/iu,
  },
  {
    label: 'arbata',
    confidence: 'HIGH',
    theme: /arbat/iu,
    slugs: ['keramikos-arbatos-rinkinys-po-vakara'],
    products: [/arbat/iu],
    context: ['Jei vakare jis visada užsiplikys arbatos, dovanos idėja jau beveik aiški.'],
    why: ['Tiks ramiam vakarui po ilgos dienos.'],
    copy: /arbat|vakar|puodel|šilt/iu,
  },
  {
    label: 'kelionė',
    confidence: 'HIGH',
    theme: /kelion|keliauj|kelyj|kelyje|žiemos\s+pasivaikšč|karšt\p{L}*\s+gėrim/iu,
    slugs: ['termosas-kelionemis-500ml'],
    products: [/termos/iu],
    context: ['Kai žiemą daug laiko praleidi kelyje, karštas gėrimas labai praverčia.'],
    why: ['Gėrimas ilgai išlieka karštas net ilgoje kelionėje.'],
    copy: /kelion|kelyj|kelio|termos|karšt|gėrim|pasivaikšč/iu,
  },
  {
    label: 'šaltas vakaras',
    confidence: 'HIGH',
    theme: /susisupt|šalt\p{L}*\s+vakar|vės\p{L}*\s+vakar|\bsof[aoą]\b|sušil/iu,
    slugs: ['vilnonis-pledas-jaukumas'],
    products: [/pled/iu],
    context: ['Šaltais vakarais norisi tiesiog susisupti ir niekur neskubėti.'],
    why: ['Tiks šaltiems vakarams, kai norisi susisupti ant sofos.'],
    copy: /šalt|vės|vakar|susisup|šil|pled|sof/iu,
  },
  {
    label: 'kojinės',
    confidence: 'HIGH',
    theme: /šiltos\s+kojos|žiemos\s+kojin|vilnonės\s+kojin|kojin/iu,
    slugs: ['vilnones-kojines-ziemos-jaukumas'],
    // vilnonės kojinės only — the Christmas gift stocking („dovanų kojinė“) is not for warm feet
    products: [/vilnon\p{L}*\s+kojin/iu],
    context: ['Šaltomis kojomis sunku jaustis jaukiai net šiltuose namuose.'],
    why: ['Kojoms bus šilta visą žiemą.'],
    copy: /koj|šilt|žiem/iu,
  },
  {
    label: 'žvakių lempa',
    confidence: 'HIGH',
    theme: /žvakių\s+(?:švies|lemp)|žvakiu\s+(?:svies|lemp)/iu,
    slugs: ['zvakiu-sildymo-lempa'],
    context: ['Žvakių šviesa be atviros liepsnos tinka ramesniam vakarui.'],
    why: ['Kvapas sklinda be dūmų ir atviros ugnies.'],
    copy: /žvak|lemp|švies|kvap/iu,
  },
  {
    label: 'žvakė',
    confidence: 'HIGH',
    theme: /žvak(?!id)|zvak(?!id)/iu,
    slugs: ['aromaterapijos-zvake-zvakiu-vakaras'],
    context: ['Kai vakare užsidegi žvakę, namuose iškart tampa jaukiau.'],
    why: ['Uždegta žvakė kvepia ir šviečia visą vakarą.'],
    copy: /žvak|kvap|vakar/iu,
  },
  {
    label: 'namų kvapas',
    confidence: 'HIGH',
    theme: /namų\s+kvap|kvap\p{L}*\s+nam/iu,
    slugs: ['kvapo-difuzorius-lazdelemis', 'kvapo-purskiklis-namai'],
    products: [/difuzori/iu, /purškikl/iu],
    context: ['Namų kvapas daug pasako apie jaukumą, nors dažnai apie jį net nepagalvoji.'],
    why: ['Namuose kvepės jaukiai ir be jokios liepsnos.'],
    copy: /kvap|kvep|aromat|nam/iu,
  },
  {
    label: 'girlianda',
    confidence: 'HIGH',
    theme: /girliand|šilta\s+švies/iu,
    slugs: ['led-girlianda-siltas'],
    products: [/girliand/iu],
    context: ['Šilta šviesa dažnai pakeičia kambario nuotaiką greičiau nei nauji baldai.'],
    why: ['Šilta šviesa lieka ir po švenčių.'],
    copy: /girliand|švies|šilt/iu,
  },
  {
    label: 'filmų vakaras',
    confidence: 'HIGH',
    theme: /film\p{L}*\s+vakar|kino\s+vakar|namų\s+kin/iu,
    slugs: ['namu-kino-projektorius'],
    products: [/projektor/iu],
    context: ['Filmų vakaras namuose dažnai būna geresnis nei išėjimas į miestą.'],
    why: ['Tiks kiekvienam filmų vakarui namuose.'],
    copy: /film|kin|vakar|projektor/iu,
  },
  {
    label: 'šeimos žaidimas',
    confidence: 'HIGH',
    theme: /šeimos\s+vakar|stalo\s+žaid|žaidim/iu,
    slugs: ['zaidimu-vakaro-rinkinys'],
    products: [/žaidim/iu],
    context: ['Šeimos vakaras prie stalo dažnai prisimenamas ilgiau nei daiktas lentynoje.'],
    why: ['Tiks vakarui, kai visi nori būti prie stalo, ne prie ekranų.'],
    copy: /žaid|šeim|stalo|vakar/iu,
  },
  {
    label: 'mėnulis',
    confidence: 'HIGH',
    theme: /mėnul|menul/iu,
    slugs: ['menulio-lempa-3d'],
    products: [/mėnul|menul/iu],
    context: ['Mėnulio lempa vakare duoda švelnią, ramią šviesą.'],
    why: ['Švelni šviesa lieka prie lovos.'],
    copy: /mėnul|menul|lemp|nakt/iu,
  },
  {
    label: 'saulėlydis',
    confidence: 'HIGH',
    theme: /saulėlyd|saulelyd/iu,
    slugs: ['saulelydzio-lempa'],
    products: [/saulėlyd|saulelyd/iu],
    context: ['Saulėlydžio šviesa ant sienos pakeičia kambarį per kelias sekundes.'],
    why: ['Šilta šviesa atsiranda be remonto ir be programėlės.'],
    copy: /saulėlyd|saulelyd|sien|švies/iu,
  },
  {
    label: 'galaktika',
    confidence: 'HIGH',
    theme: /galaktik|žvaigžd/iu,
    slugs: ['galaktikos-projektorius-zvaigzdziu-kelione'],
    products: [/galaktik/iu],
    context: ['Žvaigždės ant lubų tinka ir vaikų kambariui, ir vakarui dviese.'],
    why: ['Lubos tampa žvaigždėtos be jokio remonto.'],
    copy: /galaktik|žvaigžd|lub|projektor/iu,
  },
  {
    label: 'dovanų kojinė',
    confidence: 'HIGH',
    theme: /dovanų\s+kojin|kojinė|kojine/iu,
    slugs: ['kaledu-dovanu-kojine-staigmena'],
    products: [/kojinė|kojine/iu],
    context: ['Kalėdų kojinė prie židinio yra dovana, kurią užpildai pats.'],
    why: ['Tiks po eglute ir prie židinio.'],
    copy: /kojinė|kojine|židin|eglut/iu,
  },
  {
    label: 'vaikų žaidimas',
    confidence: 'HIGH',
    theme: /vaik\p{L}*.{0,24}žaid|žaid\p{L}*.{0,24}vaik/iu,
    slugs: ['vaiku-kaledinis-zaidimas'],
    context: ['Vaikams žaidimas dažnai būna geresnė dovana nei dar vienas daiktas į dėžę.'],
    why: ['Tiks šventiniam vakarui su vaikais.'],
    copy: /vaik|žaid|švent/iu,
  },
  {
    label: 'viskis',
    confidence: 'HIGH',
    theme: /viski|vakaro\s+ritual/iu,
    slugs: ['viskio-akmenu-ir-stiklo-rinkinys'],
    context: ['Vakaro ritualui tinka tai, ką žmogus naudoja ramiai, ne paskubomis.'],
    why: ['Tiks ramesniam vakarui su gėrimu.'],
    copy: /viski|ritual|vakar/iu,
  },
  {
    label: 'pakavimas',
    confidence: 'HIGH',
    theme: /pakavim|dovanų\s+pakav/iu,
    slugs: ['dovanu-pakavimas-sventine'],
    context: ['Dovanų pakavimas dažnai paliekamas paskutiniam vakarui, kai jau trūksta laiko.'],
    why: ['Pakuoti bus paprasčiau, kai viskas jau po ranka.'],
    copy: /pakav|dėž|popier/iu,
  },
  {
    label: 'adventas',
    confidence: 'HIGH',
    theme: /advent|atgalin\p{L}*\s+skaičiav/iu,
    slugs: ['advento-kalendorius-24'],
    context: ['Atgalinis skaičiavimas iki švenčių veikia tada, kai kiekviena diena turi savo ritualą.'],
    why: ['Kiekviena diena iki švenčių turės savo momentą.'],
    copy: /advent|skaičiav|dien/iu,
  },
  {
    label: 'rožė',
    confidence: 'HIGH',
    theme: /romantišk\p{L}*\s+dovan|\brož/iu,
    slugs: ['amzinoji-roze-gaubte'],
    context: ['Romantiškai dovanai dažnai užtenka vieno daikto, kuris lieka ir po švenčių.'],
    why: ['Rožė stikle lieka, kai tikros gėlės jau nuvysta.'],
    copy: /rož|romanti|gaubt/iu,
  },
  {
    label: 'telefonas',
    confidence: 'HIGH',
    theme: /telefon|įkrovim|ikrovim/iu,
    slugs: ['belaidis-ikroviklis-medis'],
    products: [/įkrovikl|ikrovikl/iu],
    context: ['Kai įkroviklis visada toje pačioje vietoje, krauti tampa paprasčiau.'],
    why: ['Užtenka padėti ant įkroviklio, ir nereikia ieškoti laido.'],
    copy: /telefon|įkrov|krov/iu,
  },
  {
    label: 'power bank',
    confidence: 'HIGH',
    theme: /power\s*bank|kelion\p{L}*.{0,20}telefon|telefon\p{L}*.{0,20}kelion/iu,
    slugs: ['isoreine-baterija-kelione'],
    context: ['Kelyje baterija išsikrauna greičiau, nei spėji rasti rozetę.'],
    why: ['Baterija kelionėje gelbsti, kai rozetės nėra.'],
    copy: /bater|telefon|kelion/iu,
  },
  {
    label: 'telefono stovas',
    confidence: 'HIGH',
    theme: /telefono\s+stov/iu,
    slugs: ['telefono-stovas-stalas'],
    context: ['Telefonui ant stalo reikia vietos, kur jis nestovėtų veidu žemyn.'],
    why: ['Telefonas stovės patogiai ir kraunantis, ir filmui.'],
    copy: /telefon|stov/iu,
  },
  {
    label: 'ausinės',
    confidence: 'HIGH',
    theme: /ausin|muzik/iu,
    slugs: ['ausines-kisenines'],
    products: [/ausin/iu],
    context: ['Muzika kelyje ar darbe dažnai būna geriausia maža kasdienė dovana.'],
    why: ['Tiks kasdien, kai nori savo muzikos.'],
    copy: /ausin|muzik/iu,
  },
  {
    label: 'nuotrauka',
    confidence: 'HIGH',
    theme: /nuotrauk|prisiminim/iu,
    slugs: ['nuotrauku-remelis-akimirka'],
    products: [/rėmel|remel/iu],
    context: ['Prisiminimas ant lentynos dažnai veikia geriau nei dar viena smulkmena į stalčių.'],
    why: ['Nuotrauka turės savo vietą namuose, o ne tik ekrane.'],
    copy: /nuotrauk|rėmel|akimirk|prisimin/iu,
  },
  {
    label: 'pora',
    confidence: 'MEDIUM',
    theme: /(?<!(?:\d|trys|tris|dvi|kelios|keturios|penkios)\s{0,2})(?<!\p{L})por(?:a|ą|os|ai|oms)(?!\p{L})(?!\s+(?:\p{L}+\s+){0,2}kojin)|vakaras\s+dviese|vakarienė\s+dviese/iu,
    slugs: ['poros-knyga-musu-istorija', 'zaidimu-vakaro-rinkinys', 'serviravimo-lenta-vakariene'],
    context: ['Porai geriau tinka tai, ką naudos kartu, o ne du atskiri daiktai.'],
    why: ['Tiks vakarui, kai abu nori pabūti kartu.'],
    copy: /por|dviese|kartu|vakar/iu,
  },
  {
    label: 'ramybė',
    confidence: 'MEDIUM',
    theme: /ramyb|spa\b|laikas\s+sau|sau\s+laik/iu,
    slugs: ['sventinis-vonios-rinkinys', 'mini-masazo-pistoletas', 'gua-sha-rinkinys-roze'],
    context: ['Kai žmogus vertina ramybę, dovana turi padėti sulėtinti vakarą, ne jį užpildyti.'],
    why: ['Tiks vakarui, kai nori laiko sau.'],
    copy: /ramyb|voni|masaž|sau/iu,
  },
  {
    label: 'miegas',
    confidence: 'MEDIUM',
    theme: /mieg|naktis|poils/iu,
    slugs: ['silkinis-miego-rinkinys-miegas', 'silkinis-pagalves-uzvalkalas', 'pizama-vakaro-komplektas'],
    context: ['Poilsio dovanai svarbu tai, ką žmogus naudoja kiekvieną naktį.'],
    why: ['Tiks kiekvienai nakčiai, ne tik šventėms.'],
    copy: /mieg|nakt|poils|šilk|pagalv|pižam/iu,
  },
  {
    label: 'nauji namai',
    confidence: 'MEDIUM',
    theme: /nauji\s+nam|interjer|dekorac/iu,
    slugs: ['vaistazoliu-auginimo-rinkinys', 'nuotrauku-remelis-akimirka', 'kilimas-silta-grindys'],
    context: ['Naujiems namams tinka daiktas, kuris lieka matomas, ne į stalčių.'],
    why: ['Papildys namus, o ne stalčių.'],
    copy: /nam|interjer|dekor|sod|rėmel|kilim/iu,
  },
  {
    label: 'džemperis',
    confidence: 'HIGH',
    theme: /džemper|dzemper/iu,
    slugs: ['dzemperis-siltas-uztrauktukas'],
    products: [/džemper|dzemper/iu],
    context: ['Užsegamas džemperis su gobtuvu yra dovana, kurią dėvi ir namie, ir išėjus.'],
    why: ['Tiks kasdien, kai norisi šilumos ir patogumo.'],
    copy: /džemper|dzemper|gobtuv|užtraukt/iu,
  },
  {
    label: 'kardiganas',
    confidence: 'HIGH',
    theme: /kardigan/iu,
    slugs: ['kardiganas-atviras-siltis'],
    products: [/kardigan/iu],
    context: ['Kardiganą patogu užsimesti ir ryte, ir vakare namuose.'],
    why: ['Tiks mamai ar sau, kai namuose vakare vėsu.'],
    copy: /kardigan|sag|megzt/iu,
  },
  {
    label: 'golfas',
    confidence: 'HIGH',
    theme: /\bgolf/iu,
    slugs: ['golfas-aukstas-kaklas'],
    products: [/golf/iu],
    context: ['Plonas golfas tinka ir vienas, ir kaip šiltas sluoksnis žiemą.'],
    why: ['Tiks kasdien, kai žiemą norisi šilto kaklo.'],
    copy: /golf|apykakl|sluoksn/iu,
  },
  {
    label: 'megztinis',
    confidence: 'HIGH',
    theme: /megztin/iu,
    slugs: ['megztinis-kasdienis-siltis'],
    products: [/megztin/iu],
    context: ['Šilti drabužiai žiemą dėvimi kasdien, todėl tokia dovana nelieka spintoje.'],
    why: ['Tiks kasdien, kai norisi šilumos be papildomo sluoksnio.'],
    copy: /megztin|viln|oversize/iu,
  },
  {
    label: 'drabužiai',
    confidence: 'MEDIUM',
    theme: /drabuž|drabuz|\brūbai\b|\brubai\b/iu,
    slugs: [
      'megztinis-kasdienis-siltis',
      'dzemperis-siltas-uztrauktukas',
      'kardiganas-atviras-siltis',
      'golfas-aukstas-kaklas',
      'pizama-vakaro-komplektas',
    ],
    context: ['Šilti drabužiai žiemą dėvimi kasdien, todėl tokia dovana nelieka spintoje.'],
    why: ['Tiks kasdien, kai norisi šilumos.'],
    copy: /drabuž|drabuz|rūb|rub|megztin|džemper|kardigan|pižam|golf/iu,
  },
  {
    label: 'pižama',
    confidence: 'HIGH',
    theme: /pižam|pizam/iu,
    slugs: ['pizama-vakaro-komplektas'],
    products: [/pižam/iu],
    context: ['Šventinę pižamą šeimos dažnai užsisako ne vieną, o visiems namams.'],
    why: ['Tiks Kūčių vakarui ir kiekvienai šaltai nakčiai po to.'],
    copy: /pižam|nakt|mieg|komplekt/iu,
  },
]

function productBlob(product: KaleduCatalogProduct): string {
  return `${product.slug} ${product.name} ${product.tagline}`
}

function productEligible(product: KaleduCatalogProduct, cap: number | null): boolean {
  if (!product.inStock) return false
  if (cap != null && product.priceCents > cap) return false
  return Boolean(resolveProductAssets(product.slug))
}

export function resolveKaleduIntentProducts(
  intent: KaleduLifestyleIntent,
  cap: number | null = null,
): KaleduCatalogProduct[] {
  const catalog = loadKaleduCatalog()
  const fromSlugs = intent.slugs
    .map((id) => catalog.find((p) => p.slug === id || p.sku === id))
    .filter((p): p is KaleduCatalogProduct => Boolean(p && productEligible(p, cap)))
  if (fromSlugs.length) return fromSlugs
  const extras = (intent.products || []).flatMap((re) =>
    catalog.filter((p) => re.test(productBlob(p)) && productEligible(p, cap)),
  )
  return [...new Map(extras.map((p) => [p.slug, p])).values()]
}

/** Lifestyle intents in the theme that a stocked catalog SKU with an image can satisfy. */
export function kaleduLifestyleMatches(
  theme: string,
  cap: number | null = null,
): Array<{ intent: KaleduLifestyleIntent; products: KaleduCatalogProduct[] }> {
  const out: Array<{ intent: KaleduLifestyleIntent; products: KaleduCatalogProduct[] }> = []
  for (const intent of KALEDU_LIFESTYLE_INTENTS) {
    if (!intent.theme.test(theme)) continue
    const products = resolveKaleduIntentProducts(intent, cap)
    if (products.length) out.push({ intent, products })
  }
  return out
}

export type KaleduStoryMode = {
  mode: KaleduStoryModeKind
  reason: 'explicit_product' | 'lifestyle_intent' | 'category_prior' | 'product_index' | null
  confidence: KaleduIntentConfidence
  intent: KaleduLifestyleIntent | null
  products: KaleduCatalogProduct[]
}

export type KaleduRouteOpts = {
  theme: string
  hook?: string
  body?: string
  category?: string
  kind?: UgcThemeKind
  modeHint?: KaleduModeHint
  productHints?: string[]
}

function emptyStoryMode(mode: KaleduStoryModeKind = 'GENERIC'): KaleduStoryMode {
  return { mode, reason: null, confidence: 'LOW', intent: null, products: [] }
}

export type ProductResolutionSlot = {
  index: number
  productId: string
  preferredRole: 'build'
  required: true
}

/** Reserve build slides for required products before generation. Hook and close stay free. */
export function planRequiredProductSlots(slideCount: number, productIds: string[]): ProductResolutionSlot[] {
  const builds: number[] = []
  for (let i = 1; i < slideCount - 1; i++) builds.push(i)
  const start = builds.length >= 3 ? 1 : 0
  const slots: ProductResolutionSlot[] = []
  productIds.forEach((productId, n) => {
    const index = builds[start + n]
    if (index == null) return
    slots.push({ index, productId, preferredRole: 'build', required: true })
  })
  return slots
}

/** Next build/context slide that can inherit an unresolved product. Never the close. */
export function nextBuildForProductDebt(roles: Array<string | undefined>, fromIndex: number): number | null {
  const usable = (role: string | undefined) => role === 'build' || role === 'context'
  for (let i = fromIndex + 1; i < roles.length - 1; i++) {
    if (usable(roles[i])) return i
  }
  for (let i = 1; i < Math.min(fromIndex, roles.length - 1); i++) {
    if (usable(roles[i])) return i
  }
  return null
}

export function requiredKaleduProductIds(mode: KaleduStoryMode): string[] {
  if (mode.mode === 'GENERIC') return []
  const ids = mode.products.map((product) => product.slug || product.productId).filter(Boolean)
  if (mode.mode === 'PRODUCT_LED') return ids
  return ids.slice(0, 1)
}

export function buildKaleduProductContract(mode: KaleduStoryMode, slideCount: number) {
  const requiredProductIds = requiredKaleduProductIds(mode)
  const productResolutionPlan = planRequiredProductSlots(slideCount, requiredProductIds)
  return {
    mode: mode.mode,
    selectedProducts: mode.products.map((product) => product.slug || product.productId),
    requiredProductResolution: requiredProductIds.length > 0,
    requiredProductIds,
    productResolutionPlan,
  }
}

export function productResolutionPromptLines(opts: {
  slideStart: number
  roles: string[]
  slots: ProductResolutionSlot[]
  debt: string[]
  products: KaleduCatalogProduct[]
}): string {
  const lines: string[] = []
  const owed = [...opts.debt]
  opts.roles.forEach((role, offset) => {
    if (role === 'hook' || role === 'close') return
    const index = opts.slideStart - 1 + offset
    const slot = opts.slots.find((row) => row.index === index)
    const id = slot?.productId || (role === 'build' ? owed.shift() : undefined)
    if (!id) return
    const product = opts.products.find((row) => row.slug === id || row.productId === id)
    const phrase = product ? productTypePhrase(product) : id
    lines.push(`Skaidrė ${index + 1} privalo natūraliai parodyti ${phrase}. Grąžink productId=${id}.`)
  })
  return lines.join('\n')
}

export function applyReservedProductResolution<
  T extends { title?: string; body?: string; productId?: string; role?: string },
>(
  slides: T[],
  chunkStart: number,
  slots: ProductResolutionSlot[],
  products: KaleduCatalogProduct[],
  debt: string[],
): {
  slides: T[]
  debt: string[]
  events: Array<{ slide: number; productId: string | null; debtMovedTo: number | null }>
} {
  const next = slides.map((slide) => ({ ...slide }))
  const still = [...debt]
  const events: Array<{ slide: number; productId: string | null; debtMovedTo: number | null }> = []
  next.forEach((slide, offset) => {
    if (slide.role === 'hook' || slide.role === 'close') return
    const global = chunkStart + offset
    const slot = slots.find((row) => row.index === global)
    const owed = slot?.productId || (slide.role === 'build' ? still[0] : undefined)
    if (!owed) return
    const product = products.find((row) => row.slug === owed || row.productId === owed)
    if (!product) return
    const text = `${slide.title || ''} ${slide.body || ''}`
    if (!copyNamesProduct(text, product)) {
      if (slot && !still.includes(slot.productId)) still.push(slot.productId)
      events.push({ slide: global + 1, productId: null, debtMovedTo: null })
      return
    }
    slide.productId = product.slug || product.productId
    const at = still.indexOf(owed)
    if (at >= 0) still.splice(at, 1)
    events.push({ slide: global + 1, productId: slide.productId, debtMovedTo: null })
  })
  if (events.some((event) => !event.productId) && still.length) {
    const last = events.filter((event) => !event.productId).at(-1)
    if (last) last.debtMovedTo = last.slide + 1
  }
  return { slides: next, debt: still, events }
}

function categoryPrior(category = ''): KaleduStoryModeKind | null {
  return KALEDU_CATEGORY_MODE[category.trim()] || null
}

export function kaleduModeFromMatch(opts: {
  confidence: KaleduIntentConfidence
  products: KaleduCatalogProduct[]
  category?: string
  advice?: boolean
  kind?: UgcThemeKind
  modeHint?: KaleduModeHint
}): KaleduStoryModeKind {
  if (opts.modeHint === 'generic') return 'GENERIC'
  if (opts.advice && opts.confidence !== 'HIGH') return 'GENERIC'
  if (!opts.products.length) {
    const prior = categoryPrior(opts.category)
    if (opts.advice || prior === 'GENERIC') return 'GENERIC'
    return prior === 'HYBRID' || opts.kind === 'product' || opts.modeHint === 'hybrid' ? 'HYBRID' : 'GENERIC'
  }
  if (opts.confidence === 'HIGH') return 'PRODUCT_LED'
  if (opts.confidence === 'MEDIUM') return 'HYBRID'
  return 'GENERIC'
}

function pickExplicitByThemeRoots(
  blob: string,
  cap: number | null,
  score: (product: KaleduCatalogProduct) => number,
): KaleduCatalogProduct[] {
  const themeRoots = textRootSet(blob)
  const namedConcrete = [...kaleduConcreteProductRoots()].filter((root) => themeRoots.has(root))
  const explicit = themeExplicitCatalogProducts(blob).filter((p) => productEligible(p, cap))
  if (!namedConcrete.length) return explicit.slice(0, 2)
  const picked: KaleduCatalogProduct[] = []
  for (const root of namedConcrete) {
    const best = explicit
      .filter((product) => productHeadRoots(product).includes(root) && !picked.includes(product))
      .map((product) => ({ product, score: score(product) }))
      .filter((row) => row.score >= 0)
      .sort((a, b) => b.score - a.score)[0]
    if (best) picked.push(best.product)
  }
  return picked.slice(0, 2)
}

/**
 * Theme + catalog → story mode. Catalog is the only inventory source.
 * HIGH + real SKU → PRODUCT_LED. MEDIUM → HYBRID. LOW / no SKU → GENERIC.
 */
export function routeKaleduStory(opts: KaleduRouteOpts): KaleduStoryMode {
  const category = opts.category || ''
  const hintText = (opts.productHints || []).join(' ')
  const blob = `${opts.theme} ${opts.hook || ''} ${opts.body || ''} ${category} ${hintText}`
  if (opts.kind === 'generic' || opts.modeHint === 'generic') return emptyStoryMode('GENERIC')
  const hinted = (opts.productHints || [])
    .map((id) => loadKaleduCatalog().find((row) => row.slug === id || row.sku === id || row.productId === id))
    .filter((row): row is KaleduCatalogProduct => Boolean(row && productEligible(row, kaleduBudgetCapCents(opts.theme, category))))
  if (hinted.length) {
    return {
      mode: 'PRODUCT_LED',
      reason: 'explicit_product',
      confidence: 'HIGH',
      intent: null,
      products: hinted.slice(0, 2),
    }
  }
  const cap = kaleduBudgetCapCents(opts.theme, category)
  const recipients = inferRecipients(blob, category)
  const used = loadUsedProducts()
  const score = (product: KaleduCatalogProduct) =>
    scoreProduct(product, { theme: opts.theme, category, recipients, cap, used })
  const advice = ADVICE_THEME_RE.test(blob) || GENERIC_THEME_RE.test(blob)
  const explicit = pickExplicitByThemeRoots(blob, cap, score)
  const lifestyle = kaleduLifestyleMatches(blob, cap)
  const highLife = lifestyle.find((row) => row.intent.confidence === 'HIGH')
  const midLife = lifestyle.find((row) => row.intent.confidence === 'MEDIUM')

  if (explicit.length) {
    const intent = lifestyle[0]?.intent || null
    return {
      mode: 'PRODUCT_LED',
      reason: 'explicit_product',
      confidence: 'HIGH',
      intent,
      products: explicit,
    }
  }
  if (highLife) {
    return {
      mode: 'PRODUCT_LED',
      reason: 'lifestyle_intent',
      confidence: 'HIGH',
      intent: highLife.intent,
      products: [highLife.products[0]],
    }
  }
  if (midLife && !advice) {
    return {
      mode: 'HYBRID',
      reason: 'lifestyle_intent',
      confidence: 'MEDIUM',
      intent: midLife.intent,
      products: [midLife.products[0]],
    }
  }

  const wanted = giftCountFromTheme(opts.theme)
  const allowBudgetPick = Boolean(
    wanted ||
      opts.kind === 'product' ||
      opts.modeHint === 'product_led' ||
      (isKaleduBudgetTheme(opts.theme, category) && opts.kind === 'product'),
  )
  if (allowBudgetPick && !advice && !WEAK_VIBE_ONLY_RE.test(blob.trim())) {
    const ranked = loadKaleduCatalog()
      .map((product) => ({ product, score: score(product) }))
      .filter((row) => row.score >= 0 && productEligible(row.product, cap))
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(2, Math.max(1, wanted || 1)))
      .map((row) => row.product)
    if (ranked.length) {
      return {
        mode: 'HYBRID',
        reason: 'category_prior',
        confidence: 'MEDIUM',
        intent: null,
        products: ranked,
      }
    }
  }

  const prior = categoryPrior(category)
  const mode = kaleduModeFromMatch({
    confidence: 'LOW',
    products: [],
    category,
    advice,
    kind: opts.kind,
    modeHint: opts.modeHint,
  })
  if (mode === 'GENERIC' || prior === 'GENERIC') return emptyStoryMode('GENERIC')
  return { mode: prior === 'PRODUCT_LED' ? 'GENERIC' : mode, reason: null, confidence: 'LOW', intent: null, products: [] }
}

export function kaleduStoryMode(
  theme: string,
  picked: KaleduCatalogProduct[] = [],
  category = '',
  extra: Omit<KaleduRouteOpts, 'theme' | 'category'> = {},
): KaleduStoryMode {
  const routed = routeKaleduStory({ theme, category, ...extra })
  if (routed.products.length) return routed
  const withImage = picked.filter((p) => productEligible(p, kaleduBudgetCapCents(theme, category)))
  if (!withImage.length) return routed
  return { ...routed, products: withImage.slice(0, 2), mode: routed.mode === 'GENERIC' ? 'HYBRID' : routed.mode }
}

/**
 * Explicit product nouns outrank lifestyle, then vibe.
 * No confident catalog match → [].
 */
export function pickKaleduProductsForTheme(opts: KaleduRouteOpts): KaleduCatalogProduct[] {
  return routeKaleduStory(opts).products
}

function formatEuro(cents: number): string {
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`
}

export function formatKaleduProductBrief(products: KaleduCatalogProduct[]): string {
  if (!products.length) return ''
  const lines = products.map((p) => {
    const euros = (p.priceCents / 100).toFixed(2).replace('.', ',')
    return `- ${p.name} [productId=${p.slug}] (${euros} €) - ${p.tagline || p.vibes.join(', ')}`
  })
  return `PRODUCTS_ALLOWED
Concrete product recommendations may mention ONLY products from PRODUCTS_ALLOWED. If none fits naturally, write a generic gift suggestion. Never invent store inventory.
${lines.join('\n')}
Jei temoje daugiau dovanų nei čia - rašyk TIEK, kiek yra, nepridėk trečios.
JSON: "productId" = slug TIK toje skaidrėje, kurioje pavadini prekę. Hook ir close dažniausiai be productId.`
}

export type KaleduStorySlideFields = {
  id?: string
  title?: string
  body?: string
  cta?: string
  role?: string
  productId?: string
  visualIntent?: string
  showProductPrice?: boolean
  productPriceLabel?: string
}

export function attachKaleduSlideProducts<T extends KaleduStorySlideFields>(
  slides: T[],
  products: KaleduCatalogProduct[],
  opts: { theme: string; category?: string; kind?: UgcThemeKind },
): T[] {
  const kind = opts.kind || inferUgcThemeKind({ theme: opts.theme }, opts.category || '')
  const budget = isKaleduBudgetTheme(opts.theme, opts.category || '')
  const unused = [...products]
  return slides.map((slide, i) => {
    const role = slide.role || (i === 0 ? 'hook' : i === slides.length - 1 ? 'close' : 'build')
    const text = `${slide.title || ''} ${slide.body || ''}`
    const visualIntent = inferKaleduBgCategory(text, role)
    if (kind !== 'product') {
      return { ...slide, productId: undefined, visualIntent, showProductPrice: false }
    }
    if (role === 'hook' || role === 'close') {
      const named = products.find((p) => copyNamesProduct(text, p))
      const showPrice = Boolean(named && budget)
      return {
        ...slide,
        productId: named?.productId,
        visualIntent,
        showProductPrice: showPrice,
        productPriceLabel: showPrice && named ? formatEuro(named.priceCents) : undefined,
      }
    }
    const named = unused.find((p) => copyNamesProduct(text, p)) || products.find((p) => copyNamesProduct(text, p))
    if (named) {
      const idx = unused.findIndex((p) => p.slug === named.slug)
      if (idx >= 0) unused.splice(idx, 1)
    }
    const showPrice = Boolean(named && budget)
    return {
      ...slide,
      productId: named?.productId,
      visualIntent,
      showProductPrice: showPrice,
      productPriceLabel: showPrice && named ? formatEuro(named.priceCents) : undefined,
    }
  })
}

export function kaleduProductExportIssues(
  slides: Array<{ title?: string; body?: string; role?: string; productId?: string }>,
  theme = '',
  category = '',
  opts?: { hook?: string; body?: string; kind?: UgcThemeKind; picked?: string[] },
): string[] {
  const issues: string[] = []
  const slideCopy = slides.map((s) => `${s.title || ''} ${s.body || ''}`).join(' ')
  const kind =
    opts?.kind ||
    inferUgcThemeKind(
      {
        theme,
        hook: opts?.hook,
        body: [opts?.body, slideCopy].filter(Boolean).join(' '),
      },
      category,
    )
  const cap = kaleduBudgetCapCents(theme, category)
  const catalog = loadKaleduCatalog()
  const pickedSlugs = new Set(opts?.picked || [])
  const attached = catalog.filter(
    (row) =>
      pickedSlugs.has(row.slug) ||
      slides.some((slide) => {
        const pid = slide.productId?.trim()
        return pid && (row.slug === pid || row.productId === pid)
      }),
  )
  for (const [i, slide] of slides.entries()) {
    const invented = kaleduInventedProductMentions(`${slide.title || ''} ${slide.body || ''}`, attached)
    if (invented.length) issues.push(`slide_${i + 1}:invented_product(${invented.slice(0, 3).join('|')})`)
  }
  for (const [i, slide] of slides.entries()) {
    const pid = slide.productId?.trim()
    if (!pid) continue
    const text = `${slide.title || ''} ${slide.body || ''}`
    const product = catalog.find((row) => row.slug === pid || row.productId === pid)
    const namedInCopy = Boolean(product && copyNamesProduct(text, product))
    if (kind === 'generic' && !namedInCopy) {
      issues.push(`slide_${i + 1}:product_on_generic`)
      continue
    }
    const assets = resolveProductAssets(pid)
    if (!assets || !product) {
      issues.push(`slide_${i + 1}:product_image_missing`)
      continue
    }
    if (!namedInCopy) issues.push(`slide_${i + 1}:product_name_mismatch`)
    if (cap != null && product.priceCents > cap) issues.push(`slide_${i + 1}:budget_over_cap`)
  }
  return issues
}
