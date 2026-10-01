import { describe, expect, it } from 'vitest'
import {
  chainDurationExceeded,
  shouldOpenSendCircuit,
} from '../outreach/reliability-policy.js'

describe('outreach reliability policy', () => {
  it('opens the provider circuit after two consecutive exhausted transient sends', () => {
    expect(shouldOpenSendCircuit(1)).toBe(false)
    expect(shouldOpenSendCircuit(2)).toBe(true)
  })

  it('caps a chain that has been running for two hours', () => {
    const now = Date.parse('2026-09-11T12:00:00.000Z')
    expect(chainDurationExceeded('2026-09-11T10:00:00.000Z', now)).toBe(true)
    expect(chainDurationExceeded('2026-09-11T11:59:00.000Z', now)).toBe(false)
  })
})
