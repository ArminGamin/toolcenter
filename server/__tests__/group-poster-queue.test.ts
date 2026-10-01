import { describe, expect, it } from 'vitest'
import { buildGroupQueuePreview } from '../group-poster.js'

describe('group poster preflight queue', () => {
  it('excludes known unsuitable groups without deleting them from the catalog', () => {
    const groups = [
      { id: '1', name: 'Regular', url: 'https://facebook.test/groups/1' },
      { id: '2', name: 'Buy Sell', url: 'https://facebook.test/groups/2' },
      { id: '3', name: 'Pending', url: 'https://facebook.test/groups/3' },
    ]
    const now = Date.parse('2026-09-11T12:00:00.000Z')
    const preview = buildGroupQueuePreview(
      groups,
      [],
      [{ id: '3', name: 'Pending', reason: 'admin_approval' }],
      {
        '1': { id: '1', name: 'Regular', capability: 'regular_post_supported', checkedAt: '2026-09-11T11:00:00.000Z' },
        '2': { id: '2', name: 'Buy Sell', capability: 'buy_sell', checkedAt: '2026-09-11T11:00:00.000Z' },
      },
      now,
    )
    expect(preview.eligibleIds).toEqual(['1'])
    expect(preview.excludedByReason).toEqual({ buy_sell: 1, admin_approval: 1 })
    expect(groups).toHaveLength(3)
  })
})
