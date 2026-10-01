import { describe, expect, it } from 'vitest'
import { countFollowUpsDue, type PipelineContact } from '../pipeline.js'

function contact(partial: Partial<PipelineContact> & { email: string }): PipelineContact {
  const now = new Date().toISOString()
  const stage = partial.stage || 'active'
  return {
    id: partial.id || 'c1',
    email: partial.email.toLowerCase(),
    name: partial.name || '',
    source: partial.source || 'test',
    stage,
    tags: partial.tags || [],
    promoStep: partial.promoStep ?? 1,
    nextActionAt: partial.nextActionAt ?? null,
    action: partial.action || '',
    touches: partial.touches || [],
    stageHistory: partial.stageHistory || [{ at: now, stage }],
    createdAt: partial.createdAt || now,
    updatedAt: partial.updatedAt || now,
  }
}

describe('pipeline', () => {
  it('counts follow-ups due for active contacts past nextActionAt', () => {
    const past = new Date(Date.now() - 86_400_000).toISOString()
    const future = new Date(Date.now() + 86_400_000).toISOString()
    const list = [
      contact({ email: 'a@test.com', nextActionAt: past }),
      contact({ email: 'b@test.com', nextActionAt: future }),
      contact({ email: 'c@test.com', stage: 'bought', nextActionAt: past }),
      contact({ email: 'd@test.com', nextActionAt: null }),
    ]
    expect(countFollowUpsDue(list)).toBe(1)
  })

  it('returns zero for empty list', () => {
    expect(countFollowUpsDue([])).toBe(0)
  })
})
