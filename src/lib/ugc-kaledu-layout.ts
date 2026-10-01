import { kaleduWatermarkFooterReserve, watermarkBounds } from './ugc-watermark'

export type LayoutRect = { x: number; y: number; w: number; h: number }

export type KaleduProductLayoutId = 'F' | 'A' | 'B' | 'C' | 'D'

export const KALEDU_SAFE_PAD = 32
const SLIDE_WIDTH = 1080
const SLIDE_HEIGHT = 1920
const MARGIN_X = 84
const CARD_GAP = 64

function footerReserve(slideH = SLIDE_HEIGHT): number {
  return kaleduWatermarkFooterReserve(slideH, SLIDE_WIDTH)
}

export function rectsIntersect(a: LayoutRect, b: LayoutRect, pad = 0): boolean {
  return !(
    a.x + a.w + pad <= b.x ||
    b.x + b.w + pad <= a.x ||
    a.y + a.h + pad <= b.y ||
    b.y + b.h + pad <= a.y
  )
}

export function containRect(box: LayoutRect, aspect: number): LayoutRect {
  if (aspect <= 0) return box
  const boxAspect = box.w / Math.max(1, box.h)
  let w = box.w
  let h = box.h
  if (boxAspect > aspect) {
    h = box.h
    w = h * aspect
  } else {
    w = box.w
    h = w / aspect
  }
  return {
    x: box.x + (box.w - w) / 2,
    y: box.y + (box.h - h) / 2,
    w,
    h,
  }
}

export function kaleduChromeRects(
  slideW = SLIDE_WIDTH,
  slideH = SLIDE_HEIGHT,
): { logo: LayoutRect; counter: LayoutRect; footerBand: LayoutRect; watermarkSafe: LayoutRect } {
  const scale = slideH / SLIDE_HEIGHT
  const cornerPad = Math.round(36 * scale)
  const zone = watermarkBounds(slideW, slideH)
  const logo: LayoutRect = zone.mark
  const counter: LayoutRect = {
    x: slideW - cornerPad - Math.round(72 * scale),
    y: slideH - cornerPad - Math.round(28 * scale),
    w: Math.round(72 * scale),
    h: Math.round(28 * scale),
  }
  const footerH = footerReserve(slideH)
  const footerBand: LayoutRect = { x: 0, y: slideH - footerH, w: slideW, h: footerH }
  return { logo, counter, footerBand, watermarkSafe: zone.safe }
}

export function cardRectsFromLayout(
  groupTop: number,
  cards: Array<{ width: number; height: number }>,
  marginX: number,
  gap = CARD_GAP,
  offsetX = 0,
): LayoutRect[] {
  const rects: LayoutRect[] = []
  let y = groupTop
  for (const card of cards) {
    rects.push({ x: marginX + offsetX, y, w: card.width, h: card.height })
    y += card.height + gap
  }
  return rects
}

export function pickKaleduProductLayoutId(opts: {
  textLen: number
  role?: string
  overflow?: boolean
  hasProduct?: boolean
}): KaleduProductLayoutId {
  if (!opts.hasProduct || opts.overflow) return 'F'
  return 'D'
}

function area(rect: LayoutRect): number {
  return rect.w * rect.h
}

function clampArea(rect: LayoutRect, minPct: number, maxPct: number, canvas = SLIDE_WIDTH * SLIDE_HEIGHT): LayoutRect {
  const a = area(rect)
  const minA = canvas * minPct
  const maxA = canvas * maxPct
  if (a >= minA && a <= maxA) return rect
  const target = Math.min(maxA, Math.max(minA, a))
  const scale = Math.sqrt(target / Math.max(1, a))
  const w = rect.w * scale
  const h = rect.h * scale
  return {
    x: rect.x + (rect.w - w) / 2,
    y: rect.y + (rect.h - h) / 2,
    w,
    h,
  }
}

function collides(rect: LayoutRect, obstacles: LayoutRect[], pad: number): boolean {
  return obstacles.some((obs) => rectsIntersect(rect, obs, pad))
}

function fitBySlideHeight(
  seed: LayoutRect,
  aspect: number,
  obstacles: LayoutRect[],
  minH: number,
  maxH: number,
): LayoutRect | null {
  if (seed.w < 40 || seed.h < 40 || maxH < minH * 0.8) return null
  let box: LayoutRect = { ...seed, h: Math.min(seed.h, maxH) }
  for (let i = 0; i < 6; i++) {
    const fitted = containRect(box, aspect)
    const scaled =
      fitted.h > maxH
        ? {
            ...fitted,
            w: fitted.w * (maxH / fitted.h),
            h: maxH,
            x: fitted.x + (fitted.w - fitted.w * (maxH / fitted.h)) / 2,
          }
        : fitted
    if (scaled.h >= minH * 0.92 && !collides(scaled, obstacles, KALEDU_SAFE_PAD)) return scaled
    box = {
      ...box,
      w: box.w * 0.9,
      h: box.h * 0.9,
      x: box.x + box.w * 0.05,
      y: box.y + box.h * 0.05,
    }
  }
  return null
}

function fitWithoutCollision(
  seed: LayoutRect,
  aspect: number,
  obstacles: LayoutRect[],
  minPct: number,
  maxPct: number,
): LayoutRect | null {
  if (seed.w < 40 || seed.h < 40) return null
  let box = clampArea(containRect(seed, aspect), minPct, maxPct)
  for (let i = 0; i < 4; i++) {
    const fitted = containRect(box, aspect)
    if (!collides(fitted, obstacles, KALEDU_SAFE_PAD)) return fitted
    box = {
      ...box,
      w: box.w * 0.85,
      h: box.h * 0.85,
      x: box.x + box.w * 0.075,
      y: box.y + box.h * 0.075,
    }
  }
  return null
}

export function chooseKaleduProductRect(opts: {
  layoutId: KaleduProductLayoutId
  cardRects: LayoutRect[]
  productAspect: number
  slideW?: number
  slideH?: number
}): { productRect: LayoutRect | null; cardMaxWidth?: number; cardOffsetX?: number } {
  const slideW = opts.slideW ?? SLIDE_WIDTH
  const slideH = opts.slideH ?? SLIDE_HEIGHT
  const chrome = kaleduChromeRects(slideW, slideH)
  const obstacles = [...opts.cardRects, chrome.logo, chrome.counter, chrome.footerBand]
  const pad = KALEDU_SAFE_PAD
  const aspect = opts.productAspect > 0 ? opts.productAspect : 1

  if (opts.layoutId === 'F') return { productRect: null }

  if (opts.layoutId === 'B') {
    const leftW = Math.round(slideW * 0.4)
    const seed: LayoutRect = {
      x: pad,
      y: pad + 80,
      w: leftW - pad,
      h: chrome.footerBand.y - pad * 2 - 80,
    }
    const productRect = fitWithoutCollision(seed, aspect, [chrome.logo, chrome.counter, chrome.footerBand], 0.15, 0.3)
    return {
      productRect,
      cardMaxWidth: Math.round(slideW * 0.5),
      cardOffsetX: Math.round(slideW * 0.42) - MARGIN_X,
    }
  }

  if (opts.layoutId === 'C') {
    const seed: LayoutRect = {
      x: Math.round(slideW * 0.18),
      y: Math.round(slideH * 0.32),
      w: Math.round(slideW * 0.64),
      h: Math.round(slideH * 0.42),
    }
    return { productRect: fitWithoutCollision(seed, aspect, obstacles, 0.3, 0.45) }
  }

  if (opts.layoutId === 'D') {
    const lastCard = opts.cardRects[0]
    const top = lastCard ? lastCard.y + lastCard.h + pad : Math.round(slideH * 0.28)
    const minH = Math.round(slideH * 0.25)
    const maxH = Math.round(slideH * 0.4)
    const available = chrome.footerBand.y - top - pad
    const seed: LayoutRect = {
      x: Math.round(slideW * 0.12),
      y: top,
      w: Math.round(slideW * 0.76),
      h: Math.min(maxH, available),
    }
    return { productRect: fitBySlideHeight(seed, aspect, obstacles, minH, Math.min(maxH, available)) }
  }

  const last = opts.cardRects[opts.cardRects.length - 1]
  const top = last ? last.y + last.h + pad : Math.round(slideH * 0.58)
  const seed: LayoutRect = {
    x: Math.round(slideW * 0.22),
    y: top,
    w: Math.round(slideW * 0.56),
    h: chrome.footerBand.y - top - pad,
  }
  if (seed.h < 120) return { productRect: null }
  return { productRect: fitWithoutCollision(seed, aspect, obstacles, 0.25, 0.4) }
}
