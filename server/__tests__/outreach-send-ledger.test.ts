import { describe, expect, it } from 'vitest'
import { recipientHash } from '../outreach/send-ledger.js'

describe('outreach send ledger', () => {
  it('uses a stable redacted recipient identifier', () => {
    const hash = recipientHash(' Person@Example.com ')
    expect(hash).toBe(recipientHash('person@example.com'))
    expect(hash).not.toContain('person')
    expect(hash).toHaveLength(20)
  })
})
