import { describe, expect, it } from 'vitest'
import {
  countAvailableUgcThemes,
  getUgcThemePoolStatus,
  loadUgcThemePool,
  pickBatchUgcThemes,
  resetUsedUgcThemes,
} from '../ugc-theme-pool.js'

describe('ugc-theme-pool', () => {
  it('loads theme pool with 400+ entries', () => {
    const pool = loadUgcThemePool()
    expect(pool.total).toBeGreaterThanOrEqual(400)
    expect(Object.keys(pool.categories).length).toBeGreaterThanOrEqual(10)
  })

  it('picks batch themes in test mode without marking used', () => {
    resetUsedUgcThemes()
    const before = countAvailableUgcThemes()
    const picked = pickBatchUgcThemes(3, undefined, { testMode: true })
    expect(picked.ok).toBe(true)
    expect(picked.themes).toHaveLength(3)
    expect(countAvailableUgcThemes()).toBe(before)
    const status = getUgcThemePoolStatus()
    expect(status.used).toBe(0)
  })

  it('picks batch themes and tracks used', () => {
    resetUsedUgcThemes()
    const before = countAvailableUgcThemes()
    const picked = pickBatchUgcThemes(3)
    expect(picked.ok).toBe(true)
    expect(picked.themes).toHaveLength(3)
    expect(picked.themes![0].hook.length).toBeGreaterThan(0)
    expect(picked.themes![0].body.length).toBeGreaterThan(0)
    expect(countAvailableUgcThemes()).toBe(before - 3)
    const status = getUgcThemePoolStatus()
    expect(status.used).toBe(3)
    resetUsedUgcThemes()
  })
})
