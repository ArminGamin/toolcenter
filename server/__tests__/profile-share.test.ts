import { describe, expect, it } from 'vitest'
import { normalizeProfileShareSettingsForTest } from '../group-poster-share.js'

describe('profile share settings', () => {
  it('defaults interval and skip', () => {
    const s = normalizeProfileShareSettingsForTest({})
    expect(s.intervalUnit).toBe('minutes')
    expect(s.minInterval).toBe(1)
    expect(s.maxInterval).toBe(2)
    expect(s.skipAlreadyShared).toBe(true)
    expect(s.postUrl).toBe('')
    expect(s.selectedFriendIds).toEqual([])
  })

  it('clamps seconds floor to 5', () => {
    const s = normalizeProfileShareSettingsForTest({
      intervalUnit: 'seconds',
      minInterval: 1,
      maxInterval: 2,
    })
    expect(s.minInterval).toBe(5)
    expect(s.maxInterval).toBe(5)
  })
})
