import { currentProfileBrand, isChristmasGiftsNiche } from './profile-brand.js'
import { isAllowedKaleduCta } from './ugc-kaledu-cta.js'

export const UGC_CTA_MAX = 72

/** Canonical close-slide CTA for Tavo Knyga — tests and default profile. */
export const UGC_DEFAULT_CTA = 'Apsilankyk tavoknyga.com ir pradėk 5 min. testą! 🤩'

export function ugcActiveCta(): string {
  return currentProfileBrand().ugcCta || UGC_DEFAULT_CTA
}

export function ugcActiveHashtags(): string {
  return currentProfileBrand().ugcHashtags || '#tavoknyga #maistas #sveikamityba #lietuva'
}

export function ugcActiveCaptionCta(): string {
  return currentProfileBrand().ugcCaptionCta || currentProfileBrand().ugcCta || UGC_DEFAULT_CTA
}

export function clipUgcCta(text: string, max = UGC_CTA_MAX): string {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  if (!t) return ugcActiveCta()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1).trimEnd()}…`
}

/** Always force the branded CTA on close slides. Christmas may use a bank variant. */
export function finalizeCloseSlideCta(_cta?: string, _fallback = UGC_DEFAULT_CTA): string {
  if (isChristmasGiftsNiche()) {
    const cand = String(_cta || '').trim()
    if (isAllowedKaleduCta(cand)) return clipUgcCta(cand)
    const fb = String(_fallback || '').trim()
    if (isAllowedKaleduCta(fb)) return clipUgcCta(fb)
  }
  return ugcActiveCta()
}

/** Ensure close-slide CTA is the canonical branded line. */
export function ensureUgcWebsiteCta(_cta?: string, _fallback = UGC_DEFAULT_CTA): string {
  return finalizeCloseSlideCta(_cta, _fallback)
}
