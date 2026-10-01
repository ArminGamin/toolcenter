import { afterEach, describe, expect, it, vi } from 'vitest'
import { APPEARANCE_KEY, APPEARANCE_PALETTES, DEFAULT_APPEARANCE, applyAppearance, normalizeAppearance, readAppearance, saveAppearance } from './appearance'

function luminance(hex: string) {
  const rgb = [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
}

export function contrast(first: string, second: string) {
  const a = luminance(first), b = luminance(second)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

afterEach(() => vi.unstubAllGlobals())

describe('readable appearance', () => {
  it('defaults to light surfaces and large text, including invalid stored settings', () => {
    expect(normalizeAppearance(null)).toEqual(DEFAULT_APPEARANCE)
    expect(normalizeAppearance({ theme: 'unknown', textSize: 'tiny' })).toEqual(DEFAULT_APPEARANCE)
    expect(normalizeAppearance({ theme: 'slate', textSize: 'comfortable' })).toEqual({ theme: 'slate', textSize: 'comfortable' })
  })

  it('continues with readable defaults when browser storage is unavailable', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked') } })
    expect(readAppearance()).toEqual(DEFAULT_APPEARANCE)
  })

  it('keeps only the colour choice from the legacy v1 preference', () => {
    vi.stubGlobal('localStorage', { getItem: (key: string) => key === 'cc.appearance.v1' ? '{"theme":"slate","textSize":"large"}' : null })
    expect(readAppearance()).toEqual({ theme: 'slate', textSize: 'comfortable' })
  })

  it('restores the preference from browser storage', () => {
    vi.stubGlobal('localStorage', { getItem: (key: string) => key === APPEARANCE_KEY ? '{"theme":"slate","textSize":"comfortable"}' : null })
    expect(readAppearance()).toEqual({ theme: 'slate', textSize: 'comfortable' })
  })

  it('applies a session preference even if saving is blocked', () => {
    const properties = new Map<string, string>()
    const dataset: Record<string, string> = {}
    vi.stubGlobal('document', { documentElement: { dataset, style: { setProperty: (key: string, value: string) => properties.set(key, value) } }, querySelector: () => null })
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('blocked') } })
    expect(saveAppearance({ theme: 'slate', textSize: 'large' })).toBe(false)
    expect(dataset).toEqual({ colorTheme: 'slate', readingSize: 'large' })
    expect(properties.get('--reading-scale')).toBe('1.133')
    applyAppearance(DEFAULT_APPEARANCE)
    expect(properties.get('--reading-scale')).toBe('1')
  })

  for (const [name, palette] of Object.entries(APPEARANCE_PALETTES)) {
    it(`${name} text and status colours exceed 4.5:1 on every surface`, () => {
      for (const foreground of ['text-primary', 'text-secondary', 'text-muted', 'accent-brass', 'accent-success', 'accent-danger', 'accent-violet'] as const) {
        for (const background of ['surface-page', 'surface-panel', 'surface-card', 'surface-lift', 'surface-input'] as const) {
          expect(contrast(palette[foreground], palette[background]), `${name}: ${foreground} on ${background}`).toBeGreaterThanOrEqual(4.5)
        }
      }
      expect(contrast(palette['on-accent'], palette['accent-brass'])).toBeGreaterThanOrEqual(4.5)
    })
  }
})
