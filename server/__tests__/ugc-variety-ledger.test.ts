import { beforeEach, describe, expect, it } from 'vitest'
import {
  isRepeatOfRecentSlideBody,
  recordUgcVarietyEntry,
  resetUgcVarietyLedger,
  UGC_BODY_REPEAT_WINDOW,
} from '../ugc-variety-ledger.js'

describe('ugc variety ledger body dedup', () => {
  beforeEach(() => resetUgcVarietyLedger())

  it('flags exact body repeat across gap posts within window', () => {
    const body =
      'Kai žinai, ką valgyti rytoj, vakare lieka mažiau spėliojimo. Taip atgauni kontrolę savo dienoje.'
    for (let i = 0; i < UGC_BODY_REPEAT_WINDOW; i++) {
      recordUgcVarietyEntry({
        theme: `theme-${i}`,
        hookTitle: `Hook ${i}`,
        slideTexts: [`Hook ${i}`, body],
        slideBodies: [body],
      })
    }
    expect(isRepeatOfRecentSlideBody(body)).toBe(true)
    expect(
      isRepeatOfRecentSlideBody(
        'Visiškai kitoks tekstas apie maistą ir planavimą kasdien be pasikartojančių frazių.',
      ),
    ).toBe(false)
  })
})
