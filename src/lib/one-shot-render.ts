export const SLIDE_WIDTH = 1080
export const SLIDE_HEIGHT = 1920
export const ONE_SHOT_FONT = '"Inter", system-ui, sans-serif'

export const EXPORT_SIZE_OPTIONS = [
  { id: 'tiktok_reels', label: 'TikTok / Reels / Story', width: 1080, height: 1920 },
  { id: 'ig_portrait', label: 'Instagram 4:5', width: 1080, height: 1350 },
  { id: 'ig_square', label: 'Instagram 1:1', width: 1080, height: 1080 },
] as const

export type OneShotSizeId = (typeof EXPORT_SIZE_OPTIONS)[number]['id']

export function resolveExportSize(id: string): { width: number; height: number } {
  const hit = EXPORT_SIZE_OPTIONS.find((o) => o.id === id)
  return hit ? { width: hit.width, height: hit.height } : { width: SLIDE_WIDTH, height: SLIDE_HEIGHT }
}

const BASE_MARGIN_X = 80
const BASE_MARGIN_TOP = 72
const MARGIN_TOP_RATIO = 0.09
const BASE_FONT = 44
const MIN_FONT = 32
const LINE_HEIGHT = 1.38
const MAX_TEXT_RATIO = 0.55

export function wrapNotesLines(
  text: string,
  maxWidth: number,
  measure: (line: string, fontSize: number) => number,
  fontSize: number,
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
    if (measure(next, fontSize) <= maxWidth) current = next
    else {
      lines.push(current)
      current = words[i]
    }
  }
  lines.push(current)
  return lines
}

export async function ensureOneShotFontReady(): Promise<void> {
  if (typeof document === 'undefined') return
  await document.fonts.load(`400 ${BASE_FONT}px ${ONE_SHOT_FONT}`, 'Aa')
  await document.fonts.ready
}

export type RenderOneShotInput = {
  text: string
  width?: number
  height?: number
}

export function renderOneShotSlide(canvas: HTMLCanvasElement, input: RenderOneShotInput): void {
  const width = input.width || SLIDE_WIDTH
  const height = input.height || SLIDE_HEIGHT
  const scale = width / SLIDE_WIDTH
  const marginX = Math.round(BASE_MARGIN_X * scale)
  const marginTop = Math.round(Math.max(BASE_MARGIN_TOP * scale, height * MARGIN_TOP_RATIO))
  const maxWidth = width - marginX * 2
  const maxHeight = Math.round(height * MAX_TEXT_RATIO)
  const startFont = Math.round(BASE_FONT * scale)
  const minFont = Math.round(MIN_FONT * scale)

  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, width, height)

  const measure = (line: string, fontSize: number) => {
    ctx.font = `400 ${fontSize}px ${ONE_SHOT_FONT}`
    return ctx.measureText(line).width
  }

  let fontSize = startFont
  let lines = wrapNotesLines(input.text, maxWidth, measure, fontSize)
  while (fontSize > minFont) {
    const blockH = lines.length * fontSize * LINE_HEIGHT
    if (blockH <= maxHeight) break
    fontSize -= 1
    lines = wrapNotesLines(input.text, maxWidth, measure, fontSize)
  }

  ctx.fillStyle = '#000000'
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  ctx.font = `400 ${fontSize}px ${ONE_SHOT_FONT}`
  let y = marginTop
  const step = fontSize * LINE_HEIGHT
  for (const line of lines) {
    ctx.fillText(line, marginX, y)
    y += step
  }
}

export async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('PNG encode failed'))
    }, 'image/png')
  })
}
