import { UGC_DEFAULT_CTA } from '../../lib/ugc-cta'
import {
    type UgcSlidesDraft,
    type UgcSlideshowSlideCopy
} from '../../lib/ugc-slides'
import { renderUgcSlide, type UgcTemplate } from '../../lib/ugc-slides-render'

export function mapStorySlidesToRender(
  slides: UgcSlideshowSlideCopy[],
  defaultCta: string,
): Array<{
  title: string
  body: string
  cta: string
  productId?: string
  productVariantId?: string
  showProductPrice?: boolean
  productPriceLabel?: string
  role?: string
}> {
  return slides.map((slide, i) => {
    const role = slide.role
    const extra = {
      productId: slide.productId,
      productVariantId: slide.productVariantId,
      showProductPrice: slide.showProductPrice,
      productPriceLabel: slide.productPriceLabel,
      role,
    }
    if (role === 'hook' || (!role && i === 0)) {
      return { title: slide.title, body: slide.body, cta: '', ...extra }
    }
    if (role === 'close' || role === 'punch' || i === slides.length - 1) {
      return {
        title: '',
        body: slide.body,
        cta: slide.cta?.trim() || defaultCta,
        ...extra,
      }
    }
    return { title: '', body: slide.body, cta: '', ...extra }
  })
}

export function renderStorySlide(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  copy: {
    title: string
    body: string
    cta: string
    productId?: string
    showProductPrice?: boolean
    productPriceLabel?: string
    role?: string
  },
  draft: UgcSlidesDraft,
  slideWidth: number,
  slideHeight: number,
  slideIndex: number,
  slideTotal: number,
  productImg?: HTMLImageElement | null,
) {
  const base = {
    focalX: 50,
    focalY: 50,
    placement: draft.placement,
    slideWidth,
    slideHeight,
    slideIndex,
    slideTotal,
  }
  const hasCta = Boolean(copy.cta.trim())
  let template: UgcTemplate = hasCta ? 'headline_body_cta' : draft.template
  let title = copy.title
  let body = copy.body
  let cta = copy.cta

  const tryRender = (t: UgcTemplate, ti: string, b: string, c: string) =>
    renderUgcSlide(canvas, {
      image: img,
      imgWidth: img.naturalWidth,
      imgHeight: img.naturalHeight,
      template: t,
      ...base,
      title: ti,
      body: b,
      cta: c,
      productImage: productImg || undefined,
      productImgWidth: productImg?.naturalWidth,
      productImgHeight: productImg?.naturalHeight,
      showProductPrice: copy.showProductPrice,
      productPriceLabel: copy.productPriceLabel,
      productRole: copy.role,
    }).overflow

  let overflow = tryRender(template, title, body, cta)

  // Clip on a sentence, then a word - a mid-word "…" reads as a defect.
  const clipCopy = (text: string, maxLen: number): string => {
    if (text.length <= maxLen) return text
    const slice = text.slice(0, maxLen)
    const sentenceEnd = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '))
    if (sentenceEnd > maxLen * 0.5) return slice.slice(0, sentenceEnd + 1).trim()
    const wordEnd = slice.lastIndexOf(' ')
    return `${(wordEnd > maxLen * 0.5 ? slice.slice(0, wordEnd) : slice).trimEnd()}…`
  }

  const shrinkToFit = (t: UgcTemplate, source: string, c: string): string | null => {
    for (let maxLen = Math.min(source.length, 220); maxLen >= 24; maxLen -= 16) {
      const trial = clipCopy(source, maxLen)
      if (!tryRender(t, '', trial, c)) return trial
    }
    return null
  }

  if (overflow && hasCta) {
    template = 'headline_body_cta'
    title = ''
    cta = copy.cta.trim() || UGC_DEFAULT_CTA
    const fitted = shrinkToFit(template, body, cta)
    if (fitted != null) {
      body = fitted
      overflow = false
    } else {
      body = ''
      overflow = tryRender('headline_body_cta', '', '', cta)
    }
  } else if (overflow) {
    template = 'single_statement'
    title = ''
    cta = ''
    const source = [copy.title, copy.body].filter(Boolean).join(' ')
    const fitted = shrinkToFit(template, source, '')
    body = fitted ?? clipCopy(source, 24)
    overflow = fitted == null ? tryRender(template, '', body, '') : false
  }

  return {
    overflow,
    render: {
      ...base,
      template,
      title,
      body,
      cta,
      productImage: productImg || undefined,
      productImgWidth: productImg?.naturalWidth,
      productImgHeight: productImg?.naturalHeight,
      showProductPrice: copy.showProductPrice,
      productPriceLabel: copy.productPriceLabel,
      productRole: copy.role,
    },
  }
}
