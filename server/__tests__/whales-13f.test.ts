import { describe, expect, it } from 'vitest'
import { format13fLag, score13fChange, THIRTEEN_F_LABEL } from '../markets-13f.js'
import {
  classifyWhaleLean,
  exampleClassify,
  exampleClassifySolAndXrp,
  planSolSlotBatch,
} from '../markets-whales.js'

describe('on-chain whale classification', () => {
  it('excludes exchange-internal moves and identifies deposit/withdrawal direction', () => {
    expect(exampleClassify()).toEqual({
      internal: 'exchange_internal',
      deposit: 'exchange_deposit',
      withdrawal: 'exchange_withdrawal',
    })
  })

  it('classifies an unlabeled wallet deposit to a known exchange', () => {
    expect(
      classifyWhaleLean(
        '0x1111111111111111111111111111111111111111',
        '0x28c6c06298d514db089934071355e5743bf21d60',
        'eth',
      ),
    ).toBe('exchange_deposit')
  })

  it('classifies SOL and XRP exchange internal, deposit, and withdrawal examples', () => {
    expect(exampleClassifySolAndXrp()).toEqual({
      sol: {
        internal: 'exchange_internal',
        deposit: 'exchange_deposit',
        withdrawal: 'exchange_withdrawal',
      },
      xrp: {
        internal: 'exchange_internal',
        deposit: 'exchange_deposit',
        withdrawal: 'exchange_withdrawal',
      },
    })
  })
})

describe('SOL confirmed-slot cursor batching', () => {
  it('starts the next poll at lastProcessedSlot + 1 without reprocessing', () => {
    expect(planSolSlotBatch(100, 103, 24)).toEqual({
      slots: [101, 102, 103],
      skipped: null,
    })
  })

  it('skips and flags an over-limit historical gap explicitly', () => {
    expect(planSolSlotBatch(100, 140, 24)).toEqual({
      slots: Array.from({ length: 24 }, (_, index) => 117 + index),
      skipped: { from: 101, to: 116, count: 16 },
    })
  })
})

describe('SEC 13F lag labeling', () => {
  it('reports both conservative period-end and filing ages', () => {
    const lag = format13fLag('2026-03-31', '2026-05-15', Date.parse('2026-06-15T00:00:00Z'))
    expect(lag).toMatchObject({ lagDays: 76, filingLagDays: 31 })
    expect(lag.note).toMatch(/Quarter ended 2026-03-31/)
    expect(THIRTEEN_F_LABEL).toMatch(/45\+ days lagged/)
  })

  it('keeps 13F scoring mild and neutral without a comparison baseline', () => {
    expect(score13fChange('increased')).toBe(60)
    expect(score13fChange('decreased')).toBe(40)
    expect(score13fChange('none')).toBe(50)
  })
})
