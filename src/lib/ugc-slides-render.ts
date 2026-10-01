import { CHRISTMAS_BUSINESS_PROFILE_ID, activeBusinessProfileId } from './business-profiles'
import { APPLE_EMOJI_ASSETS, appleEmojiAsset } from './ugc-apple-emoji-assets'
import {
  cardRectsFromLayout,
  chooseKaleduProductRect,
  containRect,
  pickKaleduProductLayoutId,
  type KaleduProductLayoutId,
  type LayoutRect,
} from './ugc-kaledu-layout'
import { KALEDU_WATERMARK, ugcWatermarkConfig, watermarkBounds } from './ugc-watermark'

export const SLIDE_WIDTH = 1080
export const SLIDE_HEIGHT = 1920
export const UGC_SLIDE_FONT = '"TikTok Sans", system-ui, sans-serif'
/** Brand mark in public/ — black bg is stripped to transparent at load. */
export const UGC_BRAND_LOGO_URL = '/ugc/tavo-knyga-logo.png?v=2'
export const KALEDU_BRAND_LOGO_URL = '/ugc/brands/kaledu-kampelis/watermark.png'
/** Brand logo height at 1080×1920 (bigger than 120, not huge). */
export const UGC_BRAND_LOGO_HEIGHT = 152
/** Gap from canvas bottom edge to logo bottom. */
export const UGC_BRAND_LOGO_GAP_RATIO = 0.055
/** Extra pad above logo so caption cards never overlap chrome. */
export const UGC_BRAND_FOOTER_PAD = 24

const UGC_FONT_PROBE = 'ėįųščž'

let brandLogoCache = new Map<string, HTMLCanvasElement | null>()
let brandLogoLoad = new Map<string, Promise<HTMLCanvasElement | null>>()
const appleEmojiCache = new Map<string, HTMLImageElement>()

export async function loadAppleEmojiAssets(): Promise<void> {
  if (typeof document === 'undefined') return
  await Promise.all(
    Object.entries(APPLE_EMOJI_ASSETS).map(async ([emoji, url]) => {
      if (appleEmojiCache.has(emoji)) return
      try {
        const img = new Image()
        img.src = url
        await img.decode()
        if (img.naturalWidth) {
          appleEmojiCache.set(emoji, img)
          console.info(`EMOJI_RENDER ${emoji} -> ${url}`)
        } else {
          console.warn(`EMOJI_RENDER_FAILED emoji=${emoji} asset=${url}`)
        }
      } catch {
        console.warn(`EMOJI_RENDER_FAILED emoji=${emoji} asset=${url}`)
      }
    }),
  )
}

export function ugcBrandLogoUrl(profileId = typeof window === 'undefined' ? '' : activeBusinessProfileId()): string {
  return ugcWatermarkConfig(profileId)?.src || UGC_BRAND_LOGO_URL
}

/** Sync access after ensureUgcSlideFontsReady / loadUgcBrandLogo. */
export function getUgcBrandLogo(url = ugcBrandLogoUrl()): HTMLCanvasElement | null {
  return brandLogoCache.get(url) ?? null
}

/** Load brand logo once; convert near-black pixels to alpha so it sits on photo BGs. */
export async function loadUgcBrandLogo(url = ugcBrandLogoUrl()): Promise<HTMLCanvasElement | null> {
  if (!url) return null
  if (brandLogoCache.has(url)) return brandLogoCache.get(url) ?? null
  if (typeof document === 'undefined') return null
  let pending = brandLogoLoad.get(url)
  if (!pending) {
    pending = (async () => {
      try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image()
          const timer = window.setTimeout(() => {
            el.onload = null
            el.onerror = null
            reject(new Error('Brand logo timed out'))
          }, 4000)
          el.onload = () => {
            window.clearTimeout(timer)
            resolve(el)
          }
          el.onerror = () => {
            window.clearTimeout(timer)
            reject(new Error('Brand logo failed to load'))
          }
          el.src = url
        })
        const canvas = url.includes('kaledu-kampelis/watermark') ? copyImage(img) : stripNearBlackToTransparent(img)
        brandLogoCache.set(url, canvas)
        return canvas
      } catch {
        if (url.includes('kaledu-kampelis/watermark')) console.warn('[kaledu-watermark] asset unavailable')
        brandLogoCache.set(url, null)
        return null
      }
    })()
    brandLogoLoad.set(url, pending)
  }
  return pending
}

function copyImage(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = img.naturalWidth || img.width
  c.height = img.naturalHeight || img.height
  c.getContext('2d')?.drawImage(img, 0, 0)
  return c
}

function stripNearBlackToTransparent(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = img.naturalWidth || img.width
  c.height = img.naturalHeight || img.height
  const ctx = c.getContext('2d')
  if (!ctx) return c
  ctx.drawImage(img, 0, 0)
  const frame = ctx.getImageData(0, 0, c.width, c.height)
  const d = frame.data
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] < 28 && d[i + 1] < 28 && d[i + 2] < 28) d[i + 3] = 0
  }
  ctx.putImageData(frame, 0, 0)
  return c
}

/** Wait for TikTok Sans + brand logo only — never `document.fonts.ready` (Google Fonts can hang it). */
export async function ensureUgcSlideFontsReady(): Promise<void> {
  const loads = Promise.all([
    document.fonts.load(`600 46px "TikTok Sans"`, UGC_FONT_PROBE),
    document.fonts.load(`700 60px "TikTok Sans"`, UGC_FONT_PROBE),
    document.fonts.load(`700 46px "TikTok Sans"`, UGC_FONT_PROBE),
    loadUgcBrandLogo(),
    loadAppleEmojiAssets(),
  ])
  await Promise.race([
    loads,
    new Promise<void>((resolve) => window.setTimeout(resolve, 3000)),
  ])
}

/** Footer band = scaled logo height + bottom gap + pad (single source of truth). */
export function ugcFooterReserve(slideHeight = SLIDE_HEIGHT, profileId = typeof window === 'undefined' ? '' : activeBusinessProfileId()): number {
  if (profileId === CHRISTMAS_BUSINESS_PROFILE_ID) {
    return slideHeight - watermarkBounds(SLIDE_WIDTH, slideHeight, KALEDU_WATERMARK).safe.y
  }
  const scale = slideHeight / SLIDE_HEIGHT
  const logoH = Math.round(UGC_BRAND_LOGO_HEIGHT * scale)
  const gap = Math.round(slideHeight * UGC_BRAND_LOGO_GAP_RATIO)
  return logoH + gap + Math.round(UGC_BRAND_FOOTER_PAD * scale)
}
export const MARGIN_X = 84
/** TikTok-style caption pill padding (generous white band). */
export const CARD_PAD_X = 44
export const CARD_PAD_Y = 28
/** Tighter vertical padding for short, single-line "pill" captions — TikTok's native
 *  one-line stickers hug the text much more closely than multi-line paragraph cards. */
export const CARD_PAD_Y_TIGHT = 16
export const CARD_RADIUS = 64
export const CARD_GAP = 64
export const TEXT_COLOR = '#171717'
export const CARD_FILL = '#FFFFFF'
export const CARD_LINE_HEIGHT = 1.28

export type UgcTemplate = 'headline_body' | 'single_statement' | 'problem_solution' | 'headline_body_cta'
export type UgcPlacement = 'top' | 'center' | 'bottom'

export type TextMeasureFn = (text: string, fontSize: number, weight?: 'bold' | 'semibold') => number

export type WrappedLine = { text: string; fontSize: number; weight: 'bold' | 'semibold' }

export type SlideCardLayout = {
  lines: WrappedLine[]
  width: number
  height: number
  label?: string
}

export type SlideLayoutResult = {
  cards: SlideCardLayout[]
  totalHeight: number
  groupTop: number
  overflow: boolean
  marginX: number
}

/** object-fit: cover source rect from focal point 0–100 */
export function computeCoverSourceRect(
  imgW: number,
  imgH: number,
  focalX: number,
  focalY: number,
  destW = SLIDE_WIDTH,
  destH = SLIDE_HEIGHT,
): { sx: number; sy: number; sw: number; sh: number } {
  if (imgW <= 0 || imgH <= 0) {
    return { sx: 0, sy: 0, sw: destW, sh: destH }
  }
  const destAspect = destW / destH
  const srcAspect = imgW / imgH
  let sw: number
  let sh: number
  if (srcAspect > destAspect) {
    sh = imgH
    sw = imgH * destAspect
  } else {
    sw = imgW
    sh = imgW / destAspect
  }
  const maxSx = Math.max(0, imgW - sw)
  const maxSy = Math.max(0, imgH - sh)
  const fx = Math.min(100, Math.max(0, focalX)) / 100
  const fy = Math.min(100, Math.max(0, focalY)) / 100
  return {
    sx: maxSx * fx,
    sy: maxSy * fy,
    sw,
    sh,
  }
}

export function wrapWordsAtBoundaries(
  text: string,
  maxWidth: number,
  measure: TextMeasureFn,
  fontSize: number,
  weight: 'bold' | 'semibold' = 'bold',
): string[] {
  const words = String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!words.length) return []
  const lines: string[] = []
  let current = words[0]
  for (let i = 1; i < words.length; i++) {
    const next = `${current} ${words[i]}`
    if (measure(next, fontSize, weight) <= maxWidth) {
      current = next
    } else {
      lines.push(current)
      current = words[i]
    }
  }
  lines.push(current)
  return lines
}

function fitTextInCard(
  text: string,
  maxWidth: number,
  maxHeight: number,
  measure: TextMeasureFn,
  maxFont: number,
  minFont: number,
  weight: 'bold' | 'semibold',
  lineHeightRatio = CARD_LINE_HEIGHT,
): { lines: WrappedLine[]; fontSize: number; overflow: boolean } {
  for (let fontSize = maxFont; fontSize >= minFont; fontSize -= 1) {
    const wrapped = wrapWordsAtBoundaries(text, maxWidth, measure, fontSize, weight)
    const lineHeight = fontSize * lineHeightRatio
    const padY = wrapped.length === 1 ? CARD_PAD_Y_TIGHT : CARD_PAD_Y
    const height = wrapped.length * lineHeight + padY * 2
    if (height <= maxHeight) {
      return {
        lines: wrapped.map((t) => ({ text: t, fontSize, weight })),
        fontSize,
        overflow: false,
      }
    }
  }
  const fontSize = minFont
  const wrapped = wrapWordsAtBoundaries(text, maxWidth, measure, fontSize, weight)
  const lineHeight = fontSize * lineHeightRatio
  const fallbackPadY = wrapped.length === 1 ? CARD_PAD_Y_TIGHT : CARD_PAD_Y
  const maxLines = Math.max(1, Math.floor((maxHeight - fallbackPadY * 2) / lineHeight))
  const clipped = wrapped.slice(0, maxLines)
  return {
    lines: clipped.map((t) => ({ text: t, fontSize, weight })),
    fontSize,
    overflow: wrapped.length > maxLines,
  }
}

function cardHeight(lines: WrappedLine[], label?: string): number {
  const lineHeight = (lines[0]?.fontSize || 34) * CARD_LINE_HEIGHT
  const labelH = label ? 28 : 0
  const padY = !label && lines.length === 1 ? CARD_PAD_Y_TIGHT : CARD_PAD_Y
  return padY * 2 + labelH + lines.length * lineHeight
}

/** TikTok-style corner radius — pill caps on short single-line cards. */
export function captionCardRadius(height: number, lineCount: number): number {
  if (lineCount <= 1 && height <= 130) {
    return Math.max(28, height / 2 - 1)
  }
  return Math.min(CARD_RADIUS, Math.max(40, Math.round(height * 0.18)))
}

export function placementGroupTop(
  placement: UgcPlacement,
  groupHeight: number,
  slideHeight = SLIDE_HEIGHT,
  marginX = MARGIN_X,
  footerReserve = ugcFooterReserve(slideHeight),
): number {
  const safeTop = marginX
  const safeBottom = slideHeight - Math.max(marginX, footerReserve)
  if (placement === 'top') {
    return Math.max(safeTop, Math.round(slideHeight * 0.18))
  }
  if (placement === 'bottom') {
    const bottomAnchor = Math.round(slideHeight * 0.72)
    return Math.max(safeTop, Math.min(bottomAnchor - groupHeight, safeBottom - groupHeight))
  }
  const centerY = Math.round(slideHeight * 0.5)
  return Math.max(safeTop, Math.min(centerY - Math.round(groupHeight / 2), safeBottom - groupHeight))
}

export function layoutSlideOverlay(opts: {
  template: UgcTemplate
  placement: UgcPlacement
  title: string
  body: string
  cta: string
  measure: TextMeasureFn
  maxCardWidth?: number
  slideWidth?: number
  slideHeight?: number
}): SlideLayoutResult {
  const slideW = opts.slideWidth ?? SLIDE_WIDTH
  const slideH = opts.slideHeight ?? SLIDE_HEIGHT
  const marginX = Math.round(MARGIN_X * (slideW / SLIDE_WIDTH))
  const cardWidth = opts.maxCardWidth ?? slideW - marginX * 2
  const innerWidth = cardWidth - CARD_PAD_X * 2
  const maxCardHeight = Math.floor(slideH * 0.42)
  const cards: SlideCardLayout[] = []
  let overflow = false

  if (opts.template === 'single_statement') {
    const statement = [opts.title, opts.body].filter(Boolean).join(' ').trim()
    if (statement) {
      const fit = fitTextInCard(statement, innerWidth, maxCardHeight, opts.measure, 64, 48, 'bold')
      overflow = overflow || fit.overflow
      cards.push({ lines: fit.lines, width: cardWidth, height: cardHeight(fit.lines) })
    }
  } else if (opts.template === 'problem_solution') {
    const problemTitle = opts.title.trim()
    const solutionBody = opts.body.trim()
    if (problemTitle) {
      const problem = fitTextInCard(problemTitle, innerWidth, maxCardHeight * 0.45, opts.measure, 50, 36, 'bold')
      overflow = overflow || problem.overflow
      cards.push({
        lines: problem.lines,
        width: cardWidth,
        height: cardHeight(problem.lines),
      })
    }
    if (solutionBody) {
      const solution = fitTextInCard(solutionBody, innerWidth, maxCardHeight * 0.45, opts.measure, 50, 36, 'semibold')
      overflow = overflow || solution.overflow
      cards.push({
        lines: solution.lines,
        width: cardWidth,
        height: cardHeight(solution.lines),
      })
    }
  } else {
    const titleText = opts.title.trim()
    const bodyText = opts.body.trim()
    const hasCta = opts.template === 'headline_body_cta' && Boolean(opts.cta.trim())
    // Reserve vertical room for the website CTA pill (can wrap 2–3 lines)
    const titleBudget = hasCta ? maxCardHeight * 0.28 : maxCardHeight * 0.35
    const bodyBudget = hasCta ? maxCardHeight * 0.38 : maxCardHeight * 0.55
    if (titleText) {
      const titleFit = fitTextInCard(
        titleText,
        innerWidth,
        titleBudget,
        opts.measure,
        hasCta ? 52 : 60,
        hasCta ? 36 : 48,
        'bold',
      )
      overflow = overflow || titleFit.overflow
      cards.push({ lines: titleFit.lines, width: cardWidth, height: cardHeight(titleFit.lines) })
    }
    if (bodyText) {
      const bodyFit = fitTextInCard(
        bodyText,
        innerWidth,
        bodyBudget,
        opts.measure,
        hasCta ? 48 : 58,
        hasCta ? 32 : 46,
        'bold',
      )
      overflow = overflow || bodyFit.overflow
      cards.push({ lines: bodyFit.lines, width: cardWidth, height: cardHeight(bodyFit.lines) })
    }
    if (hasCta) {
      const ctaFit = fitTextInCard(opts.cta.trim(), innerWidth, 220, opts.measure, 42, 28, 'bold')
      overflow = overflow || ctaFit.overflow
      cards.push({ lines: ctaFit.lines, width: cardWidth, height: cardHeight(ctaFit.lines) })
    }
  }

  const totalHeight =
    cards.reduce((sum, c) => sum + c.height, 0) + Math.max(0, cards.length - 1) * CARD_GAP
  const groupTop = placementGroupTop(
    opts.placement,
    totalHeight,
    slideH,
    marginX,
    ugcFooterReserve(slideH),
  )
  return { cards, totalHeight, groupTop, overflow, marginX }
}

export function buildUgcSlideFilename(date = new Date(), profileId?: string): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  const prefix =
    profileId === CHRISTMAS_BUSINESS_PROFILE_ID ? 'kaledu-kampelis-ugc-slide' : 'tavo-knyga-ugc-slide'
  return `${prefix}-${stamp}.png`
}

export type RenderSlideInput = {
  image: CanvasImageSource & { width?: number; height?: number }
  imgWidth: number
  imgHeight: number
  focalX: number
  focalY: number
  template: UgcTemplate
  placement: UgcPlacement
  title: string
  body: string
  cta: string
  slideWidth?: number
  slideHeight?: number
  /** 0-based index for discreet counter (e.g. 1 / 4). */
  slideIndex?: number
  slideTotal?: number
  /** Optional override; defaults to cached brand logo from loadUgcBrandLogo. */
  brandLogo?: CanvasImageSource | null
  /** Hide logo + counter (tests / rare exports). Default: show when available. */
  showBrandChrome?: boolean
  productImage?: CanvasImageSource & { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number }
  productImgWidth?: number
  productImgHeight?: number
  productOpaque?: boolean
  showProductPrice?: boolean
  productPriceLabel?: string
  productRole?: string
  productId?: string
  visualReady?: boolean
}

export type ProductRenderMeta = {
  expected: boolean
  rendered: boolean
  productId?: string
  reason?: 'product_visual_missing'
  cause?: 'image_src_missing' | 'layout_skipped_product' | 'renderer_did_not_draw_product'
  bounds?: { x: number; y: number; w: number; h: number } | null
}

export function fitProductSlideBody(text: string, maxLen = 220): string {
  const source = String(text || '').trim()
  if (source.length <= maxLen) return source
  const slice = source.slice(0, maxLen)
  const sentenceEnd = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '))
  if (sentenceEnd > maxLen * 0.45) return slice.slice(0, sentenceEnd + 1).trim()
  const wordEnd = slice.lastIndexOf(' ')
  const cut = (wordEnd > maxLen * 0.45 ? slice.slice(0, wordEnd) : slice).trimEnd()
  return `${cut}…`
}

/** Long product copy is shortened. The product image and product layout stay. */
export function resolveProductSlidePaint<T>(opts: {
  title?: string
  body: string
  productImage: T | null
}): { layoutId: KaleduProductLayoutId; productImage: T | null; body: string } {
  if (!opts.productImage) {
    return {
      layoutId: pickKaleduProductLayoutId({ textLen: opts.body.length, hasProduct: false }),
      productImage: null,
      body: opts.body,
    }
  }
  const body = fitProductSlideBody(opts.body)
  const textLen = `${opts.title || ''} ${body}`.trim().length
  return {
    layoutId: pickKaleduProductLayoutId({ textLen, hasProduct: true, role: 'build' }),
    productImage: opts.productImage,
    body,
  }
}

export function renderUgcSlide(
  canvas: HTMLCanvasElement,
  input: RenderSlideInput,
): { overflow: boolean } {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D unavailable')

  const slideW = input.slideWidth ?? SLIDE_WIDTH
  const slideH = input.slideHeight ?? SLIDE_HEIGHT

  canvas.width = slideW
  canvas.height = slideH

  const measure: TextMeasureFn = (text, fontSize, weight = 'bold') => {
    ctx.font = `${weight === 'bold' ? '700' : '600'} ${fontSize}px ${UGC_SLIDE_FONT}`
    return ctx.measureText(text).width
  }

  const crop = computeCoverSourceRect(input.imgWidth, input.imgHeight, input.focalX, input.focalY, slideW, slideH)
  ctx.drawImage(
    input.image,
    crop.sx,
    crop.sy,
    crop.sw,
    crop.sh,
    0,
    0,
    slideW,
    slideH,
  )

  const paint = resolveProductSlidePaint({
    title: input.title,
    body: input.body,
    productImage: input.productImage ?? null,
  })
  const body = paint.body
  const hasProduct = Boolean(paint.productImage)
  const layoutId = paint.layoutId
  const pw =
    input.productImgWidth ||
    (input.productImage && 'naturalWidth' in input.productImage
      ? input.productImage.naturalWidth
      : undefined) ||
    input.productImage?.width ||
    1
  const ph =
    input.productImgHeight ||
    (input.productImage && 'naturalHeight' in input.productImage
      ? input.productImage.naturalHeight
      : undefined) ||
    input.productImage?.height ||
    1
  const aspect = Number(pw) / Math.max(1, Number(ph))
  const probe = chooseKaleduProductRect({
    layoutId,
    cardRects: [],
    productAspect: aspect,
    slideW,
    slideH,
  })

  const layout = layoutSlideOverlay({
    template: input.template,
    placement: hasProduct && layoutId !== 'F' ? 'top' : input.placement,
    title: input.title,
    body,
    cta: input.cta,
    measure,
    slideWidth: slideW,
    slideHeight: slideH,
    maxCardWidth: probe.cardMaxWidth,
  })
  const cardOffsetX = probe.cardOffsetX || 0
  const cardRects = cardRectsFromLayout(
    layout.groupTop,
    layout.cards,
    layout.marginX,
    CARD_GAP,
    cardOffsetX,
  )
  const placed = chooseKaleduProductRect({
    layoutId: layout.overflow ? 'F' : layoutId,
    cardRects,
    productAspect: aspect,
    slideW,
    slideH,
  })

  const expectProduct = Boolean(input.visualReady && input.productId)
  if (expectProduct && !input.productImage) {
    return {
      overflow: true,
      product: {
        expected: true,
        rendered: false,
        productId: input.productId,
        reason: 'product_visual_missing',
        cause: 'image_src_missing',
      },
    }
  }
  if (input.productImage && !placed.productRect) {
    return {
      overflow: true,
      product: {
        expected: true,
        rendered: false,
        productId: input.productId,
        reason: 'product_visual_missing',
        cause: 'layout_skipped_product',
        bounds: null,
      },
    }
  }
  if (input.productImage && placed.productRect) {
    drawProductOverlay(ctx, {
      image: input.productImage,
      imgW: Number(pw),
      imgH: Number(ph),
      rect: placed.productRect,
      opaque: input.productOpaque !== false,
      priceLabel: input.showProductPrice ? input.productPriceLabel : undefined,
    })
  }

  let y = layout.groupTop
  for (const card of layout.cards) {
    if (!card.lines.some((line) => line.text.trim())) continue
    drawCard(ctx, layout.marginX + cardOffsetX, y, card)
    y += card.height + CARD_GAP
  }

  if (input.showBrandChrome !== false) {
    drawBrandChrome(ctx, {
      slideW,
      slideH,
      marginX: layout.marginX,
      logo: input.brandLogo === undefined ? getUgcBrandLogo() : input.brandLogo,
      slideIndex: input.slideIndex,
      slideTotal: input.slideTotal,
    })
  }

  const drewProduct = Boolean(input.productImage && placed.productRect)
  return {
    overflow: layout.overflow,
    product: {
      expected: expectProduct || drewProduct,
      rendered: drewProduct,
      productId: input.productId,
      bounds: placed.productRect,
      reason: expectProduct && !drewProduct ? 'product_visual_missing' : undefined,
      cause: expectProduct && !drewProduct ? 'renderer_did_not_draw_product' : undefined,
    },
  }
}

function drawProductOverlay(
  ctx: CanvasRenderingContext2D,
  opts: {
    image: CanvasImageSource
    imgW: number
    imgH: number
    rect: LayoutRect
    opaque: boolean
    priceLabel?: string
  },
) {
  const { rect } = opts
  const radius = Math.min(28, Math.round(Math.min(rect.w, rect.h) * 0.08))
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.22)'
  ctx.shadowBlur = 18
  ctx.shadowOffsetY = 8
  if (opts.opaque) {
    ctx.fillStyle = '#FFFFFF'
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, radius)
    ctx.fill()
  }
  const inset = opts.opaque ? 12 : 0
  const inner = containRect(
    { x: rect.x + inset, y: rect.y + inset, w: rect.w - inset * 2, h: rect.h - inset * 2 },
    opts.imgW / Math.max(1, opts.imgH),
  )
  if (!opts.opaque) {
    ctx.drawImage(opts.image, inner.x, inner.y, inner.w, inner.h)
    ctx.restore()
  } else {
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    ctx.beginPath()
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, radius)
    ctx.clip()
    ctx.drawImage(opts.image, inner.x, inner.y, inner.w, inner.h)
    ctx.restore()
  }

  if (opts.priceLabel) {
    ctx.save()
    ctx.font = `700 28px ${UGC_SLIDE_FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    const label = opts.priceLabel
    const tw = ctx.measureText(label).width
    const bx = rect.x + rect.w / 2 - tw / 2 - 16
    const by = rect.y + rect.h + 10
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    roundRect(ctx, bx, by, tw + 32, 40, 20)
    ctx.fill()
    ctx.fillStyle = '#171717'
    ctx.fillText(label, rect.x + rect.w / 2, by + 8)
    ctx.restore()
  }
}

/** Post Maker–style footer: centered logo + faint n/total at bottom-right corner. */
function drawBrandChrome(
  ctx: CanvasRenderingContext2D,
  opts: {
    slideW: number
    slideH: number
    marginX: number
    logo: CanvasImageSource | null | undefined
    slideIndex?: number
    slideTotal?: number
  },
) {
  const { slideW, slideH, logo } = opts
  const scale = slideH / SLIDE_HEIGHT
  const gapFromBottom = Math.round(slideH * UGC_BRAND_LOGO_GAP_RATIO)
  const logoH = Math.round(UGC_BRAND_LOGO_HEIGHT * scale)
  const cornerPad = Math.round(36 * scale)

  const christmas = ugcWatermarkConfig(
    typeof window === 'undefined' ? '' : activeBusinessProfileId(),
  )
  if (logo && christmas) {
    const box = watermarkBounds(slideW, slideH, christmas)
    ctx.save()
    ctx.globalAlpha = christmas.opacity
    ctx.drawImage(logo, box.mark.x, box.mark.y, box.mark.w, box.mark.h)
    ctx.restore()
  } else if (logo) {
    const natW =
      'naturalWidth' in logo && typeof logo.naturalWidth === 'number' && logo.naturalWidth
        ? logo.naturalWidth
        : 'width' in logo && typeof logo.width === 'number'
          ? logo.width
          : logoH
    const natH =
      'naturalHeight' in logo && typeof logo.naturalHeight === 'number' && logo.naturalHeight
        ? logo.naturalHeight
        : 'height' in logo && typeof logo.height === 'number'
          ? logo.height
          : logoH
    const logoW = Math.round(logoH * (natW / Math.max(1, natH)))
    const logoX = Math.round((slideW - logoW) / 2)
    const logoY = slideH - gapFromBottom - logoH
    ctx.save()
    ctx.globalAlpha = 0.92
    ctx.drawImage(logo, logoX, logoY, logoW, logoH)
    ctx.restore()
  }

  const total = opts.slideTotal
  const index = opts.slideIndex
  if (typeof total === 'number' && total > 0 && typeof index === 'number' && index >= 0) {
    const label = `${index + 1}/${total}`
    const fontSize = Math.max(16, Math.round(22 * scale))
    ctx.save()
    ctx.font = `500 ${fontSize}px ${UGC_SLIDE_FONT}`
    ctx.textAlign = 'right'
    ctx.textBaseline = 'bottom'
    const cx = slideW - cornerPad
    const cy = slideH - cornerPad
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fillText(label, cx + 1, cy + 1)
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.fillText(label, cx, cy)
    ctx.restore()
  }
}

function drawTextLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  baselineY: number,
) {
  const emojiRe = /\p{Extended_Pictographic}(?:\uFE0F)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F)?)*/gu
  const parts = text.split(emojiRe)
  const emojis = text.match(emojiRe) || []
  const chunks: Array<{ text: string; emoji?: HTMLImageElement; size: number }> = []
  parts.forEach((part, i) => {
    if (part) chunks.push({ text: part, size: ctx.measureText(part).width })
    const emoji = emojis[i]
    if (!emoji) return
    const asset = appleEmojiAsset(emoji)
    const image = appleEmojiCache.get(emoji)
    if (!asset || !image) {
      console.warn(`EMOJI_RENDER_FAILED emoji=${emoji} asset=${asset || 'unmapped'}`)
      return
    }
    const size = Math.round(parseInt(ctx.font, 10) || 48)
    chunks.push({ text: '', emoji: image, size })
  })
  const total = chunks.reduce((sum, chunk) => sum + (chunk.emoji ? chunk.size : chunk.size), 0)
  let x = centerX - total / 2
  const prevAlign = ctx.textAlign
  ctx.textAlign = 'left'
  for (const chunk of chunks) {
    if (chunk.emoji) {
      ctx.drawImage(chunk.emoji, x, baselineY - chunk.size * 0.85, chunk.size, chunk.size)
      x += chunk.size
    } else {
      ctx.fillText(chunk.text, x, baselineY)
      x += chunk.size
    }
  }
  ctx.textAlign = prevAlign
}

function drawCard(ctx: CanvasRenderingContext2D, x: number, y: number, card: SlideCardLayout) {
  const w = card.width
  const h = card.height
  const radius = captionCardRadius(h, card.lines.length)
  ctx.save()
  ctx.fillStyle = CARD_FILL
  ctx.shadowColor = 'rgba(0,0,0,0.14)'
  ctx.shadowBlur = 18
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 6
  roundRect(ctx, x, y, w, h, radius)
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0

  const padY = !card.label && card.lines.length === 1 ? CARD_PAD_Y_TIGHT : CARD_PAD_Y
  let textY = y + padY
  if (card.label) {
    ctx.fillStyle = '#525252'
    ctx.font = `600 22px ${UGC_SLIDE_FONT}`
    ctx.textAlign = 'center'
    drawTextLine(ctx, card.label, x + w / 2, textY + 18)
    textY += 28
  }

  ctx.fillStyle = TEXT_COLOR
  ctx.textAlign = 'center'
  for (const line of card.lines) {
    ctx.font = `${line.weight === 'bold' ? '700' : '600'} ${line.fontSize}px ${UGC_SLIDE_FONT}`
    const lineH = line.fontSize * CARD_LINE_HEIGHT
    drawTextLine(ctx, line.text, x + w / 2, textY + line.fontSize * 0.92)
    textY += lineH
  }
  ctx.restore()
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  ctx.lineTo(x + radius, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

export async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('PNG export timed out')), 15000)
    canvas.toBlob((blob) => {
      window.clearTimeout(timer)
      if (blob) resolve(blob)
      else reject(new Error('PNG export failed'))
    }, 'image/png')
  })
}
