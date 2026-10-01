import { describe, expect, it } from 'vitest'
import { getActiveModuleCount, type HubSummary } from '../hub-summary.js'

describe('hub-summary', () => {
  it('counts active modules', () => {
    const summary: HubSummary = {
      ok: true,
      at: new Date().toISOString(),
      failures: 0,
      deskOpen: 0,
      followUpsDue: 0,
      modules: [
        { id: 'a', label: 'A', status: 'running' },
        { id: 'b', label: 'B', status: 'idle' },
        { id: 'c', label: 'C', status: 'sending' },
      ],
    }
    expect(getActiveModuleCount(summary)).toBe(2)
  })
})
