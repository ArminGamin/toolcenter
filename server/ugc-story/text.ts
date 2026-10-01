/** Shared slide type, field limits and sentence/clip helpers for the UGC story engine. (Split out of ugc-story-engine.ts.) */

import {
    ensureHookQuestionMark,
    isInterrogativeHookTitle
} from '../ugc-hook-templates.js'

export const TITLE_MAX = 64

export const BODY_MAX = 380

export type UgcStorySlide = {
  id: string
  title: string
  body: string
  cta?: string
  role?: string
  productId?: string
  productVariantId?: string
  productImageSrc?: string
  visualIntent?: string
  showProductPrice?: boolean
  productPriceLabel?: string
}

export function clipField(text: string, max: number): string {
  const trimmed = text.replace(/\s+/g, ' ').trim()
  if (trimmed.length <= max) return trimmed
  const slice = trimmed.slice(0, max)
  const lastSpace = slice.lastIndexOf(' ')
  if (lastSpace > Math.floor(max * 0.55)) return slice.slice(0, lastSpace).trim()
  return slice.trim()
}

/** Clip hook title without ever stripping a required trailing "?". */
export function clipHookTitle(title: string, max = TITLE_MAX): string {
  const raw = title.replace(/\s+/g, ' ').trim()
  const needsQ = isInterrogativeHookTitle(raw)
  const core = raw.replace(/[.!?…]+$/u, '').trim()
  const budget = needsQ ? Math.max(12, max - 1) : max
  let out = clipField(core, budget)
  if (needsQ) {
    out = ensureHookQuestionMark(out)
  }
  return out
}

export function splitSentences(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n+/)
    .flatMap((block) => block.split(/(?<=[.!?…])\s+/))
    .map((s) => s.trim())
    .filter(Boolean)
}
