import fs from 'node:fs'
import path from 'node:path'
import {
  CHRISTMAS_BUSINESS_PROFILE_ID,
  DEFAULT_BUSINESS_PROFILE_ID,
  businessProfileDataDir,
  currentBusinessProfile,
} from './business-profiles.js'
import { TOOLSAI_ROOT } from './cc-services.js'
import { kaleduBgsDir } from './ugc-kaledu-bgs.js'
import { dirPath } from './paths-config.js'
import { KALEDU_DEFAULT_CAPTION_CTA, KALEDU_DEFAULT_CTA, KALEDU_WEBSITE } from './ugc-kaledu-cta.js'

export type ProfileNiche = 'weight-loss' | 'christmas-gifts'

export type ProfileBrand = {
  id: string
  name: string
  niche: ProfileNiche
  website: string
  siteHost: string
  storeRoot: string
  groupsImagesDir: string
  ugcImagesDir: string
  productCatalogFile?: string
  outreachPromoHtml: string
  seoSiteRoot: string
  seoUsesEbookGenerator: boolean
  ugcCta: string
  ugcCaptionCta: string
  ugcHashtags: string
  ugcSkill: string
}

const TAVO_EBOOK = path.join(
  process.env.USERPROFILE || 'C:\\Users\\kajus',
  'Desktop',
  'Ebook biznis',
  'tavo-knyga-generator',
)

const JAUKUMAS_ROOT = 'D:\\jaukumas'
export const CHRISTMAS_PRODUCTS_DIR = path.join(JAUKUMAS_ROOT, 'public', 'products')
const JAUKUMAS_PRODUCTS = CHRISTMAS_PRODUCTS_DIR
const JAUKUMAS_CATALOG = path.join(JAUKUMAS_ROOT, 'src', 'lib', 'data', 'products.ts')
const JAUKUMAS_PROMO = path.join(
  JAUKUMAS_ROOT,
  'emails',
  'kaledu_kampelis_kaledinis_promotional_email_v2 (1).html',
)

const TAVO_GROUPS_IMAGES = path.join(TOOLSAI_ROOT, 'facebook-group-poster', 'images')
const TAVO_PROMO = path.join(TOOLSAI_ROOT, 'newsletter-sender', 'promo-email.html')

const BRANDS: Record<string, ProfileBrand> = {
  [DEFAULT_BUSINESS_PROFILE_ID]: {
    id: DEFAULT_BUSINESS_PROFILE_ID,
    name: 'Tavo Knyga',
    niche: 'weight-loss',
    website: 'tavoknyga.com',
    siteHost: 'tavoknyga.com',
    storeRoot: TAVO_EBOOK,
    groupsImagesDir: TAVO_GROUPS_IMAGES,
    get ugcImagesDir() {
      return dirPath('ugcImages')
    },
    outreachPromoHtml: TAVO_PROMO,
    seoSiteRoot: TAVO_EBOOK,
    seoUsesEbookGenerator: true,
    ugcCta: 'Apsilankyk tavoknyga.com ir pradėk 5 min. testą! 🤩',
    ugcCaptionCta: 'Sužinok, ko tau iš tikrųjų trūksta - apsilankyk tavoknyga.com ir pradėk 5 min. testą! 🤩',
    ugcHashtags: '#tavoknyga #maistas #sveikamityba #lietuva',
    ugcSkill: '',
  },
  [CHRISTMAS_BUSINESS_PROFILE_ID]: {
    id: CHRISTMAS_BUSINESS_PROFILE_ID,
    name: 'Kalėdų Kampelis',
    niche: 'christmas-gifts',
    website: KALEDU_WEBSITE,
    siteHost: KALEDU_WEBSITE,
    storeRoot: JAUKUMAS_ROOT,
    groupsImagesDir: JAUKUMAS_PRODUCTS,
    get ugcImagesDir() {
      return kaleduBgsDir()
    },
    productCatalogFile: JAUKUMAS_CATALOG,
    outreachPromoHtml: JAUKUMAS_PROMO,
    seoSiteRoot: JAUKUMAS_ROOT,
    seoUsesEbookGenerator: false,
    ugcCta: KALEDU_DEFAULT_CTA,
    ugcCaptionCta: KALEDU_DEFAULT_CAPTION_CTA,
    ugcHashtags: '#kaledukampelis #kaledinesdovanos #dovanos #lietuva',
    ugcSkill: `Rašai lietuvišką UGC prekės ženklui „Kalėdų Kampelis" (${KALEDU_WEBSITE}) — kalėdinių dovanų parduotuvei.
Temos: kalėdinės dovanos, dovanų idėjos, šventinis pirkimas, dovanos tėvams/poroms/vyrams/moterims/draugams, paskutinės minutės dovanos, jaukios Kalėdos, dekoracijos, išpakavimas, pirkimo stresas, atgalinis skaičiavimas.
NEMINĖK svorio, treniruočių, receptų, Tavo knygos ar 5 min. testo.
CTA tik close: viena eilutė su ${KALEDU_WEBSITE}, 0–1 emoji. Pavyzdys: ${KALEDU_DEFAULT_CTA}
Mini-istorija: hook → kontekstas → atsakymas/prekė → payoff+CTA. 3–6 skaidrės. Kabliukai įvairūs, ne tik „Ar…?".
Konkrečios dovanos iš katalogo. Claims ⊆ katalogo tekstas. Jokių išgalvotų spec.
Šnekamoji lt-LT, kaip TikTok/Reels. Viena mintis sakinyje. Jei garsiai skamba keistai — perrašyk. Gramatika vienos neužtenka.`,
  },
}

export function getProfileBrand(profileId?: string): ProfileBrand {
  const id = profileId || currentBusinessProfile().id
  return BRANDS[id] || BRANDS[DEFAULT_BUSINESS_PROFILE_ID]
}

export function currentProfileBrand(): ProfileBrand {
  return getProfileBrand(currentBusinessProfile().id)
}

export function isChristmasGiftsNiche(profileId?: string): boolean {
  return getProfileBrand(profileId).niche === 'christmas-gifts'
}

const CATALOG_IMAGE_RE = /(?:images:\s*\[[^\]]*|"\/products\/[a-z0-9-]+\.(?:png|jpg|jpeg|webp)"|image:\s*"(\/products\/[a-z0-9-]+\.(?:png|jpg|jpeg|webp))")/gi
const PRODUCT_FILE_RE = /\/products\/([a-z0-9-]+\.(?:png|jpg|jpeg|webp))/gi

function catalogProductFiles(catalogFile: string): string[] {
  if (!fs.existsSync(catalogFile)) return []
  const text = fs.readFileSync(catalogFile, 'utf8')
  const names = new Set<string>()
  for (const match of text.matchAll(PRODUCT_FILE_RE)) {
    if (match[1]) names.add(match[1])
  }
  return [...names]
}

/** Product / campaign images for Groups, Friend DMs, and UGC. Tavo keeps diet photos. */
export function getProfileImages(profileId?: string): string[] {
  const brand = getProfileBrand(profileId)
  const dir = brand.groupsImagesDir
  if (!fs.existsSync(dir)) return []
  const allowed = brand.productCatalogFile
    ? new Set(catalogProductFiles(brand.productCatalogFile))
    : null
  return fs
    .readdirSync(dir)
    .filter((name) => /\.(png|jpe?g|webp)$/i.test(name))
    .filter((name) => !allowed || allowed.has(name))
    .map((name) => path.join(dir, name))
}

export function profileImagesDir(profileId?: string): string {
  return getProfileBrand(profileId).groupsImagesDir
}

/** Catalog-only folder for Groups/DMs. Tavo returns the diet images dir. */
export function ensureCampaignImagesDir(profileId?: string): string {
  const brand = getProfileBrand(profileId)
  if (!brand.productCatalogFile) return brand.groupsImagesDir
  const dir = path.join(businessProfileDataDir(brand.id), 'campaign-images')
  fs.mkdirSync(dir, { recursive: true })
  const wanted = new Set(catalogProductFiles(brand.productCatalogFile))
  for (const name of fs.readdirSync(dir)) {
    if (!wanted.has(name)) {
      try {
        fs.unlinkSync(path.join(dir, name))
      } catch {
        /* ignore */
      }
    }
  }
  for (const name of wanted) {
    const dest = path.join(dir, name)
    if (fs.existsSync(dest)) continue
    const src = path.join(brand.groupsImagesDir, name)
    if (!fs.existsSync(src)) continue
    try {
      fs.linkSync(src, dest)
    } catch {
      fs.copyFileSync(src, dest)
    }
  }
  return dir
}

export const KALEDU_SEO_TOPICS = [
  'Kalėdinės dovanos',
  'Kalėdinių dovanų idėjos',
  'Dovanos vyrui',
  'Dovanos moteriai',
  'Dovanos mamai',
  'Dovanos tėčiui',
  'Dovanos porai',
  'Dovanos draugams',
  'Dovanos iki 20 €',
  'Dovanos iki 30 €',
  'Dovanos iki 50 €',
  'Paskutinės minutės dovanos',
  'Originalios kalėdinės dovanos',
  'Praktiškos dovanos',
  'Jaukios kalėdinės dovanos',
  'Kalėdų dekoracijos',
  'Slaptasis Senelis',
  'Kalėdiniai pirkiniai Lietuvoje',
]

void CATALOG_IMAGE_RE
