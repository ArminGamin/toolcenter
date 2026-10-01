import { describe, expect, it } from 'vitest'
import {
  buildUgcSlideFilename,
  computeCoverSourceRect,
  layoutSlideOverlay,
  placementGroupTop,
  ugcFooterReserve,
  UGC_BRAND_LOGO_HEIGHT,
  UGC_BRAND_LOGO_GAP_RATIO,
  UGC_BRAND_FOOTER_PAD,
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  wrapWordsAtBoundaries,
} from './ugc-slides-render'

function mockMeasure(text: string, fontSize: number): number {
  return text.length * fontSize * 0.45
}

describe('wrapWordsAtBoundaries', () => {
  it('wraps only at word boundaries', () => {
    const lines = wrapWordsAtBoundaries(
      'Fewer random grocery runs each week',
      200,
      mockMeasure,
      40,
    )
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) {
      expect(line).not.toMatch(/-$/)
      expect(line.trim()).toBe(line)
    }
  })
})

describe('computeCoverSourceRect', () => {
  it('shifts crop with focal point', () => {
    const left = computeCoverSourceRect(2000, 3000, 0, 50)
    const right = computeCoverSourceRect(2000, 3000, 100, 50)
    expect(right.sx).toBeGreaterThan(left.sx)
  })
})

describe('placementGroupTop', () => {
  it('positions top, center, and bottom differently', () => {
    const h = 400
    const top = placementGroupTop('top', h)
    const center = placementGroupTop('center', h)
    const bottom = placementGroupTop('bottom', h)
    expect(top).toBeLessThan(center)
    expect(center).toBeLessThan(bottom)
    expect(top).toBeGreaterThanOrEqual(84)
    const footer = ugcFooterReserve()
    expect(bottom + h).toBeLessThanOrEqual(SLIDE_HEIGHT - footer + 1)
  })
})

describe('brand chrome sizing', () => {
  it('uses 152px logo and footer reserve covering logo+gap+pad', () => {
    expect(UGC_BRAND_LOGO_HEIGHT).toBe(152)
    const gap = Math.round(SLIDE_HEIGHT * UGC_BRAND_LOGO_GAP_RATIO)
    const need = UGC_BRAND_LOGO_HEIGHT + gap + UGC_BRAND_FOOTER_PAD
    expect(ugcFooterReserve()).toBe(need)
    expect(ugcFooterReserve()).toBeGreaterThanOrEqual(UGC_BRAND_LOGO_HEIGHT + gap)
  })
})

describe('layoutSlideOverlay', () => {
  it('keeps long copy within canvas bounds', () => {
    const title = 'When you plan your week ahead'
    const body =
      'Fewer random grocery runs, an easier budget to stick to, and less food ending up in the bin.'
    for (const placement of ['top', 'center', 'bottom'] as const) {
      const layout = layoutSlideOverlay({
        template: 'headline_body',
        placement,
        title,
        body,
        cta: '',
        measure: mockMeasure,
      })
      expect(layout.groupTop).toBeGreaterThanOrEqual(84)
      expect(layout.groupTop + layout.totalHeight).toBeLessThanOrEqual(SLIDE_HEIGHT - ugcFooterReserve() + 2)
    }
  })

  it('renders no cards when copy is empty', () => {
    const layout = layoutSlideOverlay({
      template: 'headline_body',
      placement: 'center',
      title: '',
      body: '',
      cta: '',
      measure: mockMeasure,
    })
    expect(layout.cards).toHaveLength(0)
    expect(layout.totalHeight).toBe(0)
  })

  it('does not show category labels for problem_solution', () => {
    const layout = layoutSlideOverlay({
      template: 'problem_solution',
      placement: 'center',
      title: 'Per daug chaoso',
      body: 'Planas padeda',
      cta: '',
      measure: mockMeasure,
    })
    expect(layout.cards.every((c) => !c.label)).toBe(true)
  })

  it('fits website CTA without overflow', () => {
    const layout = layoutSlideOverlay({
      template: 'headline_body_cta',
      placement: 'center',
      title: '',
      body: 'Dabar gali planuoti kasdienį maitinimą be varginančio galvos skausmo.',
      cta: 'Apsilankyk tavoknyga.com ir pradėk 5 min. testą! 🤩',
      measure: mockMeasure,
    })
    expect(layout.overflow).toBe(false)
    expect(layout.cards.length).toBeGreaterThanOrEqual(2)
    expect(layout.groupTop + layout.totalHeight).toBeLessThanOrEqual(SLIDE_HEIGHT - 84 + 2)
  })
})

describe('buildUgcSlideFilename', () => {
  it('uses tavo-knyga prefix and timestamp', () => {
    const name = buildUgcSlideFilename(new Date('2026-08-02T14:30:45'))
    expect(name).toBe('tavo-knyga-ugc-slide-20260802-143045.png')
  })
})

describe('canvas dimensions', () => {
  it('uses 1080x1920 export size', () => {
    expect(SLIDE_WIDTH).toBe(1080)
    expect(SLIDE_HEIGHT).toBe(1920)
  })
})
