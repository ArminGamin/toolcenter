import { describe, expect, it } from 'vitest'
import { listAutomationFailures, readAutomationFailure } from '../automation-failures.js'

describe('automation-failures', () => {
  it('returns a list (possibly empty)', () => {
    const rows = listAutomationFailures(5)
    expect(Array.isArray(rows)).toBe(true)
    expect(rows.length).toBeLessThanOrEqual(5)
  })

  it('rejects invalid failure names', () => {
    const hit = readAutomationFailure('friend-dms', '../evil.png')
    expect(hit.ok).toBe(false)
  })

  it('rejects unknown modules', () => {
    const hit = readAutomationFailure('unknown-module', 'shot.png')
    expect(hit.ok).toBe(false)
  })
})
