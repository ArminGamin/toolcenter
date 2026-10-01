import { describe, expect, it } from 'vitest'
import {
  normalizeCopyVariant,
  parseOllamaVariantsPayload,
  parseOllamaSlideshowPayload,
  parseLtDescriptionPayload,
} from '../ugc-slides.js'
import { UGC_DEFAULT_CTA } from '../ugc-cta-normalize.js'

describe('parseOllamaVariantsPayload', () => {
  it('accepts valid JSON with exactly 3 variants', () => {
    const variants = parseOllamaVariantsPayload({
      variants: [
        { id: 'variant-1', title: 'Mažiau chaoso', body: 'Kai planuoji iš anksto, mažiau impulsinių pirkinių.' },
        { id: 'variant-2', title: 'Tavo ritmas', body: 'Receptai pagal tavo laiką ir biudžetą.' },
        { id: 'variant-3', title: 'Vienas planas', body: 'Savaitės stalas padeda laikytis kurso.' },
      ],
    })
    expect(variants).toHaveLength(3)
    expect(variants[0].title).toBe('Mažiau chaoso')
  })

  it('rejects invalid JSON structure', () => {
    expect(() => parseOllamaVariantsPayload({ foo: [] })).toThrow(/variants/)
    expect(() => parseOllamaVariantsPayload('not json')).toThrow()
  })

  it('clips oversized fields', () => {
    const variants = parseOllamaVariantsPayload({
      variants: [
        { id: '1', title: 'x'.repeat(60), body: 'ok body text here' },
        { id: '2', title: 'ok', body: 'ok body text here' },
        { id: '3', title: 'ok', body: 'ok body text here' },
      ],
    })
    expect(variants[0].title).toHaveLength(48)
  })
})

describe('parseOllamaSlideshowPayload', () => {
  it('strips HOOK/BODY labels from slideshow slides', () => {
    const slides = parseOllamaSlideshowPayload(
      {
        slides: [
          { id: 'slide-1', title: 'HOOK: Sveikesnės porcijos', body: 'BODY: Pirmas spaudimas.' },
          { id: 'slide-2', title: '', body: 'Vidurinė istorijos dalis su dviem sakiniais.' },
        ],
      },
      2,
      { bodyMax: 380 },
    )
    expect(slides[0].title).toBe('Sveikesnės porcijos')
    expect(slides[0].body).toBe('Pirmas spaudimas.')
  })

  it('accepts slideshow slides with body-only middle slides', () => {
    const slides = parseOllamaSlideshowPayload(
      {
        slides: [
          { id: 'slide-1', title: 'Kabliukas', body: 'Pirmas spaudimas.' },
          { id: 'slide-2', title: '', body: 'Vidurinė istorijos dalis su dviem sakiniais.' },
          { id: 'slide-3', title: '', body: 'Pabaiga.', cta: 'Pradėk 5 min. testą' },
        ],
      },
      3,
      { bodyMax: 380 },
    )
    expect(slides).toHaveLength(3)
    expect(slides[1].title).toBe('')
    expect(slides[1].body.length).toBeGreaterThan(10)
  })

  it('accepts valid slideshow JSON with exact slide count', () => {
    const slides = parseOllamaSlideshowPayload(
      {
        slides: [
          { id: 'slide-1', title: 'Kabliukas', body: 'Kai planuoji iš anksto, mažiau chaoso.' },
          { id: 'slide-2', title: 'Vertė', body: 'Mažiau impulsinių pirkinių kiekvieną savaitę.' },
          { id: 'slide-3', title: 'CTA', body: 'Pradėk nuo 5 min. testo.', cta: 'Pradėk 5 min. testą' },
        ],
      },
      3,
    )
    expect(slides).toHaveLength(3)
    expect(slides[0].role).toBe('hook')
    expect(slides[2].role).toBe('close')
  })

  it('rejects wrong slide count', () => {
    expect(() =>
      parseOllamaSlideshowPayload(
        {
          slides: [
            { id: 'slide-1', title: 'A', body: 'B' },
            { id: 'slide-2', title: 'C', body: 'D' },
          ],
        },
        3,
      ),
    ).toThrow(/3 slides/)
  })

  it('clips oversized fields instead of failing the batch', () => {
    const slides = parseOllamaSlideshowPayload(
      {
        slides: [
          { id: '1', title: 'x'.repeat(60), body: 'ok body text here' },
          { id: '2', title: 'ok', body: 'y'.repeat(400) },
        ],
      },
      2,
      { bodyMax: 380 },
    )
    expect(slides[0].title).toHaveLength(48)
    expect(slides[1].body).toHaveLength(380)
  })
})

describe('parseLtDescriptionPayload', () => {
  it('accepts valid Lithuanian description JSON', () => {
    const description = parseLtDescriptionPayload({
      description:
        'Kai savaitės maisto planas jau paruoštas, vakarais lieka mažiau sprendimų ir daugiau ramybės. Tavo knyga padeda susidėlioti receptus pagal tavo skonį, laiką ir biudžetą — be spėlionių ir be tuščių pirkinių.',
    })
    expect(description.length).toBeGreaterThan(80)
  })

  it('clips oversized description', () => {
    const description = parseLtDescriptionPayload({
      description: 'x'.repeat(1900),
    })
    expect(description).toHaveLength(1800)
  })
})

describe('normalizeCopyVariant', () => {
  it('trims and clips fields', () => {
    const v = normalizeCopyVariant(
      { title: '  Sveika  ', body: ' Trumpas tekstas ', cta: ' CTA ' },
      0,
    )
    expect(v?.title).toBe('Sveika')
    expect(v?.cta).toBe(UGC_DEFAULT_CTA)
  })
})
