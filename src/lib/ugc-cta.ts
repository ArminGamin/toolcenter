export const UGC_CTA_MAX = 72
export const UGC_DEFAULT_CTA = 'Apsilankyk tavoknyga.com ir pradėk 5 min. testą! 🤩'

export function clipUgcCta(text: string, max = UGC_CTA_MAX): string {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  if (!t) return UGC_DEFAULT_CTA
  if (t.length <= max) return t
  return `${t.slice(0, max - 1).trimEnd()}…`
}

export function ensureUgcWebsiteCta(_cta?: string, _fallback = UGC_DEFAULT_CTA): string {
  return UGC_DEFAULT_CTA
}
