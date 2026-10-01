import { describe, expect, it } from 'vitest'
import { coerceSlidesArray, extractJsonObject } from '../json-extract.js'

describe('extractJsonObject', () => {
  it('parses plain JSON', () => {
    const data = extractJsonObject('{"slides":[{"role":"hook","text":"Labas"}]}')
    expect(data).toEqual({ slides: [{ role: 'hook', text: 'Labas' }] })
  })

  it('strips markdown fences', () => {
    const data = extractJsonObject('```json\n{"hook":"Skaityk:"}\n```')
    expect(data).toEqual({ hook: 'Skaityk:' })
  })

  it('extracts JSON from prose wrapper', () => {
    const data = extractJsonObject('Štai atsakymas:\n{"slides":[]}\nTikiuosi padėjo!')
    expect(data).toEqual({ slides: [] })
  })

  it('balances braces inside strings', () => {
    const data = extractJsonObject(
      '{"slides":[{"role":"hook","text":"Jis sakė \\"labas\\" ir tęsė."}]}',
    )
    expect((data as { slides: unknown[] }).slides).toHaveLength(1)
  })

  it('repairs trailing commas', () => {
    const data = extractJsonObject('{"slides":[{"role":"hook","text":"A",},]}')
    expect((data as { slides: unknown[] }).slides).toHaveLength(1)
  })

  it('repairs truncated objects', () => {
    const data = extractJsonObject('{"slides":[{"role":"hook","text":"Labas"')
    expect((data as { slides: unknown[] }).slides).toHaveLength(1)
  })

  it('repairs literal newlines inside strings', () => {
    const data = extractJsonObject('{"slides":[{"role":"hook","text":"Pirma\nantra"}]}')
    expect((data as { slides: [{ text: string }] }).slides[0].text).toContain('Pirma')
  })

  it('salvages complete slides from truncated multi-slide JSON', () => {
    const raw = `{"slides":[{"role":"hook","text":"Ar žinai, kad kasdien priimi sprendimų?\\nTai išsekina tave.","title":"Kabliukas"},{"role":"context","text":"Maistas turi būti paprastas ir`
    const data = extractJsonObject(raw)
    expect((data as { slides: unknown[] }).slides).toHaveLength(1)
    expect((data as { slides: [{ role: string }] }).slides[0].role).toBe('hook')
  })
})

describe('coerceSlidesArray', () => {
  it('wraps a bare slide object', () => {
    const rows = coerceSlidesArray({ role: 'hook', text: 'Labas' })
    expect(rows).toHaveLength(1)
  })

  it('reads slide singular key', () => {
    const rows = coerceSlidesArray({ slide: { role: 'close', text: 'Pabaiga', cta: 'Testas' } })
    expect(rows).toHaveLength(1)
  })

  it('maps beats to slide rows', () => {
    const rows = coerceSlidesArray({ beats: ['Vienas.', 'Du.'] })
    expect(rows).toHaveLength(2)
    expect((rows![0] as { text: string }).text).toBe('Vienas.')
  })

  it('accepts capitalized Slides key', () => {
    const rows = coerceSlidesArray({
      Slides: [
        { role: 'hook', text: 'A' },
        { role: 'close', text: 'B' },
      ],
    })
    expect(rows).toHaveLength(2)
  })

  it('accepts slides as numbered object', () => {
    const rows = coerceSlidesArray({
      slides: {
        '1': { role: 'hook', text: 'Pirmas.' },
        '2': { role: 'close', text: 'Antras.' },
      },
    })
    expect(rows).toHaveLength(2)
    expect((rows![0] as { text: string }).text).toBe('Pirmas.')
  })

  it('accepts role-keyed object', () => {
    const rows = coerceSlidesArray({
      hook: { title: 'Kabliukas', text: 'Pirmas.' },
      context: { text: 'Kontekstas.' },
      close: { text: 'Pabaiga.', cta: 'Testas' },
    })
    expect(rows).toHaveLength(3)
    expect((rows![0] as { role: string }).role).toBe('hook')
    expect((rows![2] as { cta: string }).cta).toBe('Testas')
  })

  it('accepts carousel alias', () => {
    const rows = coerceSlidesArray({
      carousel: [{ text: 'Vienas.' }, { text: 'Du.' }],
    })
    expect(rows).toHaveLength(2)
  })

  it('unwraps nested response payload', () => {
    const rows = coerceSlidesArray({
      response: { slides: [{ role: 'hook', text: 'Labas' }] },
    })
    expect(rows).toHaveLength(1)
  })
})
