import { CHRISTMAS_BUSINESS_PROFILE_ID } from './business-profiles'

export type WatermarkRect = { x: number; y: number; w: number; h: number }

export type UgcWatermarkPlacement = 'bottom-left' | 'bottom-center' | 'bottom-right'

export type UgcWatermarkConfig = {
  enabled: boolean
  src: string
  placement: UgcWatermarkPlacement
  widthRatio: number
  opacity: number
  bottomMarginRatio: number
  sideMarginRatio: number
  reserveSafeZone: boolean
  safePad: number
  /** Square emblem. Height follows width. */
  aspect: number
}

export const KALEDU_WATERMARK: UgcWatermarkConfig = {
  enabled: true,
  src: '/ugc/brands/kaledu-kampelis/watermark.png',
  placement: 'bottom-center',
  widthRatio: 0.1,
  opacity: 0.75,
  bottomMarginRatio: 0.025,
  sideMarginRatio: 0.04,
  reserveSafeZone: true,
  safePad: 16,
  aspect: 1,
}

export function ugcWatermarkConfig(profileId: string): UgcWatermarkConfig | null {
  if (profileId !== CHRISTMAS_BUSINESS_PROFILE_ID) return null
  return KALEDU_WATERMARK.enabled ? KALEDU_WATERMARK : null
}

export function watermarkBounds(
  slideW: number,
  slideH: number,
  config: UgcWatermarkConfig = KALEDU_WATERMARK,
): { mark: WatermarkRect; safe: WatermarkRect } {
  const width = Math.round(slideW * config.widthRatio)
  const height = Math.round(width * config.aspect)
  const bottom = Math.round(slideH * config.bottomMarginRatio)
  const side = Math.round(slideW * config.sideMarginRatio)
  let x = Math.round((slideW - width) / 2)
  if (config.placement === 'bottom-left') x = side
  if (config.placement === 'bottom-right') x = slideW - side - width
  const y = slideH - bottom - height
  const mark = { x, y, w: width, h: height }
  const pad = config.reserveSafeZone ? config.safePad : 0
  return {
    mark,
    safe: { x: mark.x - pad, y: mark.y - pad, w: mark.w + pad * 2, h: mark.h + pad * 2 },
  }
}

export function kaleduWatermarkFooterReserve(slideH: number, slideW = 1080): number {
  const { safe } = watermarkBounds(slideW, slideH)
  return Math.max(0, slideH - safe.y)
}
