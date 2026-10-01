import { describe, expect, it } from 'vitest'
import { isRiskyAction } from './assistant-actions'

describe('assistant-actions', () => {
  it('marks send outreach as risky', () => {
    expect(isRiskyAction({ type: 'start_outreach_send' })).toBe(true)
  })

  it('marks backup as safe', () => {
    expect(isRiskyAction({ type: 'backup' })).toBe(false)
  })
})
