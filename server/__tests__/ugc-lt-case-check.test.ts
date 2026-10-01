import { describe, expect, it } from 'vitest'
import {
  collectLtArCoordinationIssues,
  collectLtCaseAgreementIssues,
  collectLtInstrumentalIssues,
  looksLtGenitiveEnding,
  repairLtCaseAgreement,
} from '../ugc-lt-case-check.js'
import { assertShipableLtSlide, collectSlideIssues, normalizeLtUgcMultiline } from '../ugc-lt-normalize.js'

describe('ugc-lt-case-check', () => {
  it('looksLtGenitiveEnding matches seven genitive suffixes including -aus', () => {
    expect(looksLtGenitiveEnding('tvarkaraščio')).toBe(true)
    expect(looksLtGenitiveEnding('receptų')).toBe(true)
    expect(looksLtGenitiveEnding('kantrybės')).toBe(true)
    expect(looksLtGenitiveEnding('motyvacijos')).toBe(true)
    expect(looksLtGenitiveEnding('streso')).toBe(true)
    expect(looksLtGenitiveEnding('spaudimo')).toBe(true)
    expect(looksLtGenitiveEnding('aliejaus')).toBe(true)
    expect(looksLtGenitiveEnding('maistą')).toBe(false)
    expect(looksLtGenitiveEnding('ruošti')).toBe(false)
  })

  it('flags sukelia streso', () => {
    const issues = collectLtCaseAgreementIssues('Tai sukelia streso popietę.')
    expect(issues.some((i) => i.code === 'case_agreement' && i.object === 'streso')).toBe(true)
  })

  it('passes sukelia stresą', () => {
    const issues = collectLtCaseAgreementIssues('Tai sukelia stresą popietę.')
    expect(issues).toHaveLength(0)
  })

  it('passes reikalauti kantrybės', () => {
    const issues = collectLtCaseAgreementIssues('Tai reikalauja kantrybės.')
    expect(issues).toHaveLength(0)
  })

  it('flags ruošti maisto', () => {
    const issues = collectLtCaseAgreementIssues('Pradėk ruošti maisto vakarienei.')
    expect(issues.some((i) => i.verb.match(/ruoš/i) && i.expected === 'accusative')).toBe(true)
  })

  it('passes ruošti maistą', () => {
    const issues = collectLtCaseAgreementIssues('Pradėk ruošti maistą vakarienei.')
    expect(issues).toHaveLength(0)
  })

  it.each([
    'Gali rinktis telefono stovą „Patogus kampelis“.',
    'Gali rinktis maisto rinkinį.',
    'Gali rinktis darbo dienoraštį.',
    'Gali rinktis aliejaus butelį.',
    'Gali rinktis kavos puodelį.',
    'Gali rinktis rankšluosčių komplektus.',
  ])('passes a genitive modifier before an accusative object: %s', (body) => {
    expect(collectLtCaseAgreementIssues(body)).toEqual([])
    expect(collectSlideIssues({ body, role: 'build' }).some((issue) => issue.code === 'case_agreement')).toBe(false)
    expect(() => assertShipableLtSlide({ body, role: 'build' })).not.toThrow()
  })

  it.each([
    'Gali rinktis telefono.',
    'Gali rinktis telefono stovo.',
    'Tai sukelia streso popietę.',
    'Tai sukelia streso vakarą.',
  ])('still flags a genitive object without an accusative head: %s', (body) => {
    expect(collectLtCaseAgreementIssues(body).some((issue) => issue.expected === 'accusative')).toBe(true)
  })

  it('repairLtCaseAgreement fixes streso', () => {
    expect(repairLtCaseAgreement('Tai sukelia streso.')).toBe('Tai sukelia stresą.')
  })

  it('flags maitina tavęs and repairs to maitina tave', () => {
    const issues = collectLtCaseAgreementIssues('Stresas: ar tai maitina tavęs?')
    expect(issues.some((i) => i.object.toLocaleLowerCase('lt-LT') === 'tavęs')).toBe(true)
    expect(repairLtCaseAgreement('ar tai maitina tavęs')).toBe('ar tai maitina tave')
  })

  it('flags trūksta energija and repairs', () => {
    const issues = collectLtCaseAgreementIssues('Tau trūksta energija popietę.')
    expect(issues.some((i) => i.object === 'energija' && i.expected === 'genitive')).toBe(true)
    expect(repairLtCaseAgreement('trūksta energija')).toBe('trūksta energijos')
  })

  it('flags tampa iššūkis and repairs instrumental', () => {
    const issues = collectLtInstrumentalIssues('Planuoti kasdien tampa iššūkis.')
    expect(issues.some((i) => i.complement === 'iššūkis')).toBe(true)
    expect(repairLtCaseAgreement('tampa iššūkis')).toBe('tampa iššūkiu')
  })

  it('repairs pasiduoti saldumams', () => {
    expect(repairLtCaseAgreement('jauti spaudimą pasiduoti saldumams')).toContain(
      'pasiduoti saldumynams',
    )
  })

  it('normalize + ship gate pass after case repairs', () => {
    const raw =
      'Emocinis stresas gali sukelti norą. Tai dažnai vyksta nesusimastyk, siekiant trumpalaikės palaimos.'
    const out = normalizeLtUgcMultiline(raw)
    expect(out).toContain('nesusimąstant')
    expect(out).toContain('trumpalaikio malonumo')
    expect(() =>
      assertShipableLtSlide({
        body: repairLtCaseAgreement('Tai sukelia streso popietę.'),
        role: 'build',
      }),
    ).not.toThrow()
  })

  it('collectSlideIssues emits case_agreement', () => {
    const issues = collectSlideIssues({ body: 'Tai sukelia streso popietę.' })
    expect(issues.some((i) => i.code === 'case_agreement')).toBe(true)
  })

  it('flags ar coordination case mismatch (post-02)', () => {
    const issues = collectLtArCoordinationIssues(
      'Nuolatiniai svorio virsnumai gali būti vandens retencija ar maisto skoniu.',
    )
    expect(issues.some((i) => i.code === 'ar_coordination_mismatch')).toBe(true)
    expect(
      collectSlideIssues({
        body: 'Nuolatiniai svorio virsnumai gali būti vandens retencija ar maisto skoniu.',
      }).map((i) => i.code),
    ).toContain('ar_coordination_mismatch')
  })

  it('passes coordinated nominative ar pairs', () => {
    expect(collectLtArCoordinationIssues('Rinkis pieną ar kefyrą ryte.')).toHaveLength(0)
  })
})
