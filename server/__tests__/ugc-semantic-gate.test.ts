import { describe, expect, it } from 'vitest'
import {
  collectSlideIssues,
  collectStoryIssues,
  isGibberishLtCopy,
} from '../ugc-lt-normalize.js'
import { hasCircularCausalClaim, hasEarlyProductPitch } from '../ugc-lt-classes.js'
import {
  finalizeHookBody,
  isShipableHookBody,
  normalizeBatchHookStyle,
  pickSlotHookBody,
} from '../ugc-hook-templates.js'
import { pickUgcArcAndHook } from '../ugc-story-engine.js'

describe('UGC semantic fortress — posts 07–10', () => {
  it('flags circular claim: Stresas sukelia stresą (post-08)', () => {
    expect(hasCircularCausalClaim('Stresas sukelia stresą ir skatina hormonų išsiskyrimą.')).toBe(true)
    expect(
      collectSlideIssues({
        role: 'context',
        body: 'Stresas sukelia stresą ir skatina hormonų išsiskyrimą.',
      }).map((i) => i.code),
    ).toContain('circular_claim')
  })

  it('does not flag real causal claims', () => {
    expect(hasCircularCausalClaim('Stresas skatina hormonų išsiskyrimą.')).toBe(false)
    expect(hasCircularCausalClaim('Cukrus sukelia energijos svyravimus.')).toBe(false)
  })

  it('flags post-09 hook: Man pavyko + brand as first_person / early_pitch', () => {
    const body = 'Ar svoris kinta be dietų? Man pavyko, naudojant „Tavo knyga"?'
    expect(
      collectSlideIssues({ role: 'hook', title: 'Svėris: ar tai įmanoma?', body }).map((i) => i.code),
    ).toEqual(
      expect.arrayContaining(['first_person_hook', 'testimonial_register', 'gibberish']),
    )
    expect(hasEarlyProductPitch(body)).toBe(true)
    expect(isShipableHookBody(body)).toBe(false)
  })

  it('finalizeHookBody replaces testimonial hook with slots', () => {
    const out = finalizeHookBody(
      'weight loss diet',
      'Ar svoris kinta be dietų? Man pavyko, naudojant „Tavo knyga"?',
      2,
    )
    expect(out).not.toMatch(/man pavyko|tavo knyga/i)
    expect(isShipableHookBody(out)).toBe(true)
  })

  it('flags Svėris title as gibberish (post-09)', () => {
    expect(isGibberishLtCopy('Svėris: ar tai įmanoma?')).toBe(true)
  })

  it('flags netenkinčiai / Susierinęs (post-07 containment)', () => {
    expect(
      isGibberishLtCopy(
        'Susierinęs ar įsitempęs, tu ieškai greito komforto. Maistas tampa trumpalaikiu sprendimu netenkinčiai tikrąjį poreikį.',
      ),
    ).toBe(true)
  })

  it('flags dėl + bare gerund (post-09 slide 2)', () => {
    expect(
      collectSlideIssues({
        role: 'context',
        body: 'Tai nutiko dėl neatsižvelgiant į tavo kūno poreikius.',
      }).map((i) => i.code),
    ).toContain('case_error')
  })

  it('flags early brand via naudojant Tavo knyga on non-close', () => {
    expect(
      collectStoryIssues(
        [
          { role: 'hook', title: 'Ar svoris kinta?', body: 'Jauti, kad planas stringa?' },
          { role: 'build', body: 'Geriau renkiesi naudojant „Tavo knyga" kasdien.' },
          { role: 'close', body: 'Aiškus maisto planas padeda kasdien rinktis ramiau.', cta: 'Pradėk!' },
        ],
        'weight',
      ).map((i) => i.code),
    ).toContain('early_pitch')
  })

  it('batch hook styles never pick Confession', () => {
    for (let seed = 0; seed < 40; seed++) {
      const { hookStyle, storyArc } = pickUgcArcAndHook(seed)
      expect(hookStyle).not.toBe('Confession')
      expect(storyArc).not.toBe('Confession')
      expect(normalizeBatchHookStyle('Confession')).toBe('Question')
    }
  })

  it('slot hook body is theme-keyed and shipable', () => {
    const stress = pickSlotHookBody('stresas emocinis valgymas', 0)
    expect(stress.toLowerCase()).toMatch(/valg|emocij|stres|alk/)
    expect(isShipableHookBody(stress)).toBe(true)
  })
})
