import { describe, expect, it } from 'vitest'
import type { DeskSignal } from '../../lib/markets'
import { deskSignalsForView, resolveDirective } from './markets-desk-helpers'

function signal(partial: Partial<DeskSignal> & Pick<DeskSignal, 'id' | 'headline' | 'detail' | 'action'>): DeskSignal {
  return {
    urgency: 'watch',
    confidence: 3,
    successPct: null,
    chanceLabel: 'n/a',
    heuristicOdds: 40,
    edgeScore: 50,
    play: 'STAND_DOWN',
    regime: 'chop',
    printerArmed: false,
    rules: [],
    playbook: {
      side: 'flat',
      entry: null,
      stop: null,
      target1: null,
      target2: null,
      riskPct: null,
      rewardPct: null,
      rr: null,
      sizeHint: '0%',
      invalidation: 'n/a',
      plan: 'wait',
    },
    source: 'test',
    proof: [],
    at: new Date().toISOString(),
    ...partial,
  }
}

describe('deskSignalsForView simple mode', () => {
  it('shows armed tickets', () => {
    const armed = signal({
      id: 'a1',
      symbol: 'BTC',
      headline: 'ARMED',
      detail: 'd',
      action: 'go',
      printerArmed: true,
      play: 'FLOW_LONG',
      playbook: {
        side: 'long',
        entry: 100,
        stop: 99,
        target1: 102,
        target2: 104,
        riskPct: 1,
        rewardPct: 2,
        rr: 2,
        sizeHint: '1%',
        invalidation: 'stop',
        plan: 'long',
      },
    })
    const standDown = signal({
      id: 's1',
      symbol: 'ETH',
      headline: 'STAND DOWN',
      detail: 'd',
      action: 'wait',
      play: 'STAND_DOWN',
    })
    const out = deskSignalsForView([standDown, armed], 'simple')
    expect(out.some((s) => s.id === 'a1')).toBe(true)
    expect(out.some((s) => s.id === 's1')).toBe(false)
  })

  it('shows delist RISK_OFF aggregate', () => {
    const delist = signal({
      id: 'delist:aggregate',
      headline: 'Hard risk',
      detail: 'delist',
      action: 'flat',
      play: 'RISK_OFF',
      urgency: 'avoid',
    })
    const standDown = signal({
      id: 's2',
      symbol: 'SOL',
      headline: 'STAND DOWN',
      detail: 'd',
      action: 'wait',
    })
    const out = deskSignalsForView([standDown, delist], 'simple')
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('delist:aggregate')
  })

  it('collapses idle feed to one summary when nothing actionable', () => {
    const signals = [
      signal({ id: 's1', symbol: 'BTC', headline: 'STAND DOWN · BTC', detail: 'd', action: 'wait' }),
      signal({ id: 's2', symbol: 'ETH', headline: 'STAND DOWN · ETH', detail: 'd', action: 'wait' }),
    ]
    const out = deskSignalsForView(signals, 'simple')
    expect(out).toHaveLength(1)
  })

  it('returns full list in advanced mode', () => {
    const signals = [
      signal({ id: 's1', symbol: 'BTC', headline: 'h1', detail: 'd', action: 'wait' }),
      signal({ id: 's2', symbol: 'ETH', headline: 'h2', detail: 'd', action: 'wait' }),
    ]
    expect(deskSignalsForView(signals, 'advanced')).toHaveLength(2)
  })
})

describe('resolveDirective', () => {
  it('maps armed long to BUY', () => {
    const d = resolveDirective(
      signal({
        id: 'x',
        symbol: 'BTC',
        headline: 'h',
        detail: 'd',
        action: 'a',
        printerArmed: true,
        play: 'FLOW_LONG',
        playbook: {
          side: 'long',
          entry: 100,
          stop: 99,
          target1: 102,
          target2: 104,
          riskPct: 1,
          rewardPct: 2,
          rr: 2,
          sizeHint: '1%',
          invalidation: 'stop',
          plan: 'long',
        },
      }),
    )
    expect(d.verb).toBe('BUY')
    expect(d.label).toContain('BTC')
  })
})
