import { describe, expect, it } from 'vitest'
import { formatKaleduProductBrief, type KaleduCatalogProduct } from '../ugc-kaledu-catalog.js'
import { parseCombinedKaleduQa } from '../ugc-kaledu-final-qa.js'
import {
  parseCalmCaptionPayload,
  parseStoryBatchPayload,
  planChunkRepair,
  nextChunkSize,
  holdPendingSuffix,
  pickCaptionHook,
  pickUgcArcAndHook,
  ugcSlideRoles,
  ugcSlideThemeOverlap,
  isBadLtCommunityCta,
  isDuplicateSlideCopy,
  slideCopyFingerprint,
  batchChunkSize,
  finalizeBatchSlides,
  fitSlideText,
  repairStoryOrderAndRepeats,
} from '../ugc-story-engine.js'

describe('ugcSlideRoles', () => {
  it('returns hook → context → build → close for 4 slides', () => {
    expect(ugcSlideRoles(4)).toEqual(['hook', 'context', 'build', 'close'])
  })

  it('returns hook and close for 2 slides', () => {
    expect(ugcSlideRoles(2)).toEqual(['hook', 'close'])
  })

  it('adds build slides for longer carousels', () => {
    expect(ugcSlideRoles(6)).toEqual(['hook', 'context', 'build', 'build', 'build', 'close'])
  })
})

describe('pickUgcArcAndHook', () => {
  it('returns stable arc name for a seed', () => {
    const a = pickUgcArcAndHook(42)
    const b = pickUgcArcAndHook(42)
    expect(a.arcName).toBe(b.arcName)
    expect(a.arcName).toMatch(/ hook · /)
  })
})

describe('parseStoryBatchPayload', () => {
  it('parses role + text slides', () => {
    const roles = ['hook', 'context', 'close']
    const items = parseStoryBatchPayload(
      {
        slides: [
          { role: 'hook', title: 'Kabliukas', text: 'Pirmas sakinys.\nAntras sakinys.' },
          { role: 'context', text: 'Kontekstas vienas.\nKontekstas du.\nKontekstas trys.' },
          { role: 'close', text: 'Pabaiga vienas.\nPabaiga du.', cta: 'Pradėk 5 min. testą' },
        ],
      },
      roles,
    )
    expect(items).toHaveLength(3)
    expect(items[0].text).toContain('Pirmas sakinys')
    expect(items[2].cta).toBe('Pradėk 5 min. testą')
  })

  it('falls back to title + body when text missing', () => {
    const roles = ['hook', 'close']
    const items = parseStoryBatchPayload(
      {
        slides: [
          { role: 'hook', title: 'Stiprus kabliukas', body: 'Tęsinys čia.' },
          { role: 'close', title: '', body: 'Pabaiga su CTA.', cta: 'Testas' },
        ],
      },
      roles,
    )
    expect(items[0].text).toContain('Stiprus kabliukas')
    expect(items[1].text).toContain('Pabaiga')
  })

  it('accepts extra slides when only one expected', () => {
    const items = parseStoryBatchPayload(
      {
        slides: [
          { role: 'hook', title: 'A', text: 'Pirmas.\nAntras.' },
          { role: 'extra', text: 'Ignored.' },
        ],
      },
      ['hook'],
    )
    expect(items).toHaveLength(1)
    expect(items[0].text).toContain('Pirmas')
  })

  it('coerces array text fields', () => {
    const items = parseStoryBatchPayload(
      {
        slides: [{ role: 'hook', title: 'A', text: ['Pirmas punktas.', 'Antras punktas.'] }],
      },
      ['hook'],
    )
    expect(items[0].text).toContain('Pirmas')
  })

  it('accepts a single slide object without slides wrapper', () => {
    const items = parseStoryBatchPayload(
      { role: 'hook', title: 'Kabliukas', text: 'Pirmas.\nAntras.' },
      ['hook'],
    )
    expect(items).toHaveLength(1)
    expect(items[0].text).toContain('Pirmas')
  })

  it('accepts beats array mistaken for slides', () => {
    const items = parseStoryBatchPayload(
      { beats: ['Pirmas beat.', 'Antras beat.'] },
      ['hook'],
    )
    expect(items).toHaveLength(1)
    expect(items[0].text).toBe('Pirmas beat.')
  })

  it('accepts capitalized Slides and role-keyed shapes', () => {
    const fromCaps = parseStoryBatchPayload(
      {
        Slides: [
          { role: 'hook', text: 'Pirmas.\nAntras.' },
          { role: 'close', text: 'Pabaiga.', cta: 'Testas' },
        ],
      },
      ['hook', 'close'],
    )
    expect(fromCaps).toHaveLength(2)

    const fromRoles = parseStoryBatchPayload(
      {
        hook: { title: 'Kabliukas', text: 'Pirmas.\nAntras.' },
        close: { text: 'Pabaiga vienas.\nPabaiga du.', cta: 'Testas' },
      },
      ['hook', 'close'],
    )
    expect(fromRoles).toHaveLength(2)
    expect(fromRoles[0].text).toContain('Pirmas')
  })
})

describe('parseCalmCaptionPayload', () => {
  it('parses hook + body from JSON', () => {
    const parsed = parseCalmCaptionPayload({
      hook: 'Skaityk lėtai:',
      body: 'Ramus aprašymas apie temą su pakankamai detalių, kad praeitų minimalų ilgį ir atspindėtų skaidrių istoriją be agresyvaus tono.',
    })
    expect(parsed.hook).toBe('Skaityk lėtai:')
    expect(parsed.body.length).toBeGreaterThan(80)
  })

  it('defaults hook when missing', () => {
    const parsed = parseCalmCaptionPayload({
      description:
        'Ilgesnis aprašymas be atskiro hook lauko, bet su pakankamai teksto kad praeitų validaciją ir būtų naudingas Discord kanale.',
    })
    expect(parsed.hook).toBe('Skaityk lėtai:')
  })
})

describe('isBadLtCommunityCta', () => {
  it('flags community-style CTAs', () => {
    expect(isBadLtCommunityCta('Prisijunk prie bendruomenės')).toBe(true)
    expect(isBadLtCommunityCta('Sek mus Instagram profilyje')).toBe(true)
  })

  it('allows product CTAs', () => {
    expect(isBadLtCommunityCta('Apsilankyk tavoknyga.com ir pradėk 5 min. testą! 🤩')).toBe(false)
    expect(isBadLtCommunityCta('Pradėk 5 min. testą')).toBe(false)
    expect(isBadLtCommunityCta('Užpildyk testą ir gauk asmeninę knygą')).toBe(false)
  })
})

describe('pickCaptionHook', () => {
  it('maps hook styles to pin openers', () => {
    expect(pickCaptionHook('Contrarian', 1)).toBe('📌 Sunki tiesa:')
    expect(pickCaptionHook('Question', 1)).toBe('📌 Priminimas:')
  })
})

describe('finalizeBatchSlides', () => {
  it('forces canonical emoji CTA on last slide', () => {
    const out = finalizeBatchSlides(
      [
        {
          id: '1',
          role: 'hook',
          title: 'Ar vėl nežinai, ką gaminti?',
          body: 'Kiekvieną vakarą sprendi tą patį klausimą iš naujo.',
        },
        {
          id: '2',
          role: 'close',
          title: '',
          body: 'Dabar gali planuoti savaitę be streso ir švaistymo.',
        },
      ],
      'tavoknyga.com — pradėk testą',
    )
    expect(out[1].cta).toBe('Apsilankyk tavoknyga.com ir pradėk 5 min. testą! 🤩')
  })

  it('splits hook question into title when missing', () => {
    const out = finalizeBatchSlides(
      [{ id: '1', role: 'hook', title: '', body: 'Ar artėja šventė? Planuok iš anksto.' }],
      'Apsilankyk tavoknyga.com ir pradėk 5 min. testą! 🤩',
    )
    expect(out[0].title).toContain('?')
    expect(out[0].body).toContain('Planuok')
  })
})

describe('batchChunkSize', () => {
  it('uses one call for up to 4 slides', () => {
    expect(batchChunkSize(1)).toBe(1)
    expect(batchChunkSize(3)).toBe(3)
    expect(batchChunkSize(4)).toBe(4)
  })

  it('uses 3 slides per call for longer stories', () => {
    expect(batchChunkSize(5)).toBe(3)
    expect(batchChunkSize(6)).toBe(3)
    expect(batchChunkSize(7)).toBe(3)
    expect(batchChunkSize(10)).toBe(3)
  })
})

describe('chunk advance', () => {
  const roles = ['hook', 'context', 'build', 'close']

  it('does not skip a rejected middle role', () => {
    const plan = planChunkRepair({
      requestedRoles: roles,
      outcomes: [
        { ok: true, role: 'hook' },
        { ok: false, role: 'context', reason: 'gibberish' },
        { ok: true, role: 'build' },
        { ok: true, role: 'close' },
      ],
    })
    expect(plan.advanceCount).toBe(1)
    expect(plan.repair).toBe('single')
    expect(plan.repairRoles).toEqual(['context'])
  })

  it('keeps a truncated hook and continues at context', () => {
    const items = parseStoryBatchPayload(
      { slides: [{ role: 'hook', text: 'Pirmas.\nAntras.' }] },
      roles,
      1,
    )
    expect(items.parsedCount).toBe(1)
    expect(items.truncated).toBe(true)
    expect(items.resultType).toBe('TRUNCATED_RESPONSE')
    const plan = planChunkRepair({
      requestedRoles: roles,
      outcomes: [{ ok: true, role: 'hook' }],
    })
    expect(plan.advanceCount).toBe(1)
    expect(plan.repairRoles).toEqual(['context', 'build', 'close'])
  })

  it('keeps a valid hook+context prefix', () => {
    const plan = planChunkRepair({
      requestedRoles: roles,
      outcomes: [
        { ok: true, role: 'hook' },
        { ok: true, role: 'context' },
      ],
    })
    expect(plan.advanceCount).toBe(2)
    expect(plan.repairRoles).toEqual(['build', 'close'])
  })

  it('names an empty local row with the global slide', () => {
    const items = parseStoryBatchPayload(
      { slides: [{ role: 'context', title: '', body: '' }, { role: 'build', text: 'Tinka.' }] },
      ['context', 'build', 'close'],
      2,
    )
    expect(items.emptyRows[0].message).toMatch(/global slide 2 \(context\), local row 1 has no text/)
    expect(items).toHaveLength(0)
  })
})

describe('chunk speed', () => {
  it('shrinks after a truncated 3-slide request and continues at the missing role', () => {
    expect(nextChunkSize(3, 'TRUNCATED_RESPONSE')).toBe(2)
    expect(nextChunkSize(3, 'OK')).toBe(3)
    const items = parseStoryBatchPayload(
      { slides: [{ role: 'hook', text: 'A.\nB.' }, { role: 'context', text: 'C.\nD.' }] },
      ['hook', 'context', 'build'],
      1,
    )
    expect(items.resultType).toBe('TRUNCATED_RESPONSE')
    expect(items.parsedCount).toBe(2)
  })

  it('keeps a valid suffix while the middle slide is repaired', () => {
    const plan = holdPendingSuffix([
      { ok: true, role: 'build', text: 'Pledas tinka vakarui.' },
      { ok: false, role: 'build', text: '' },
      { ok: true, role: 'close', text: 'Kai žinai, ko ieškai, dovaną išrinkti daug paprasčiau.' },
    ])
    expect(plan.prefixCount).toBe(1)
    expect(plan.repairRoles).toEqual(['build'])
    expect(plan.pending.map((row) => row.role)).toEqual(['close'])
    const dependent = holdPendingSuffix([
      { ok: true, role: 'build', text: 'Pledas tinka.' },
      { ok: false, role: 'build', text: '' },
      { ok: true, role: 'close', text: 'Ši dovana tiks kiekvieną vakarą.' },
    ])
    expect(dependent.pending).toEqual([])
  })
})

describe('scoped product prompt', () => {
  it('sends only the selected product and an empty brief for a generic story', () => {
    const candle = {
      productId: 'aromaterapijos-zvakide',
      slug: 'aromaterapijos-zvakide',
      sku: 'JK-001',
      name: 'Aromaterapijos žvakė',
      tagline: 'Kvapas namams',
      priceCents: 2490,
      recipients: [],
      vibes: [],
      images: [],
      inStock: true,
    } satisfies KaleduCatalogProduct
    const other = { ...candle, sku: 'JK-011', slug: 'termosas', name: 'Termosas kelionėms', productId: 'termosas' }
    const brief = formatKaleduProductBrief([candle])
    expect(brief).toContain('aromaterapijos-zvakide')
    expect(brief).not.toContain('JK-011')
    expect(brief).not.toContain(other.name)
    expect(formatKaleduProductBrief([])).toBe('')
  })
})

describe('combined QA rewrite', () => {
  it('rewrites only the flagged slide', () => {
    const rows = parseCombinedKaleduQa(
      {
        slides: [
          { index: 0, status: 'PASS' },
          { index: 1, status: 'REWRITE', codes: ['awkward_collocation'], replacement: { title: '', body: 'Kai žinai, ko ieškai, dovaną išrinkti daug paprasčiau.' } },
        ],
      },
      2,
    )
    expect(rows.filter((row) => row.status === 'REWRITE')).toHaveLength(1)
    expect(rows[1]?.body).toMatch(/išrinkti/)
  })
})

describe('parseStoryBatchPayload partial', () => {
  it('keeps truncated slides instead of failing', () => {
    const items = parseStoryBatchPayload(
      {
        slides: [{ role: 'hook', text: 'Pirmas.\nAntras.' }],
      },
      ['hook', 'context', 'build', 'close'],
    )
    expect(items).toHaveLength(1)
    expect(items[0].role).toBe('hook')
  })
})

describe('isDuplicateSlideCopy', () => {
  it('flags exact duplicate body text', () => {
    const prior = [{ body: 'Ar tavo mintys susipina kaip virvė? Kiek kartų atrodė, kad esi pasiklydęs.' }]
    expect(
      isDuplicateSlideCopy('', 'Ar tavo mintys susipina kaip virvė? Kiek kartų atrodė, kad esi pasiklydęs.', prior),
    ).toBe(true)
  })

  it('allows distinct slides', () => {
    const prior = [{ body: 'Vakaro sprendimai vargina. Tu jauti spaudimą virtuvėje.' }]
    expect(isDuplicateSlideCopy('', 'Savaitės planas atlaisvina laiką ir sumažina stresą.', prior)).toBe(false)
  })

  it('normalizes whitespace in fingerprint', () => {
    expect(slideCopyFingerprint('A', 'hello   world')).toBe('a hello world')
  })
})
describe('fitSlideText', () => {
  it('pads short context with theme content, not Dauguma sustoja bait', () => {
    const out = fitSlideText(
      'Meniu atsižvelgia į tavo tikslus.',
      2,
      'context',
      'keturiasdešimt energijos trūkumas',
      [{ text: 'Keturiasdešimt: ar tai pabaiga? Jauti energijos trūkumą?' }],
      1,
    )
    expect(out).not.toMatch(/Dauguma sustoja/i)
    expect(out.length).toBeGreaterThan(20)
  })
})

describe('repairStoryOrderAndRepeats', () => {
  it('replaces engagement bait context slide with substantive fallback', () => {
    const slides = [
      {
        id: '1',
        role: 'hook',
        title: 'Keturiasdešimt: ar tai pabaiga?',
        body: 'Jauti energijos trūkumą ir nori grįžti į savo ritmą?',
      },
      {
        id: '2',
        role: 'context',
        title: '',
        body: 'Dauguma sustoja čia. Toliau dalis, kuri skaudžia.',
      },
      {
        id: '3',
        role: 'build',
        title: '',
        body: 'Kai žingsniai surašyti, nebereikia kaskart pradėti nuo nulio. Tau lieka energijos tam, kas iš tiesų svarbu.',
      },
      {
        id: '4',
        role: 'close',
        title: '',
        body: 'Dabar žinai, kad mažiau sprendimų reiškia daugiau energijos kasdien.',
        cta: 'Apsilankyk tavoknyga.com ir pradėk 5 min. testą! 🤩',
      },
    ]
    const repaired = repairStoryOrderAndRepeats(slides, 'keturiasdešimt energijos trūkumas')
    expect(repaired[1].body).not.toMatch(/Dauguma sustoja/i)
    expect(repaired[1].body.length).toBeGreaterThan(28)
  })
})

describe('ugcSlideThemeOverlap', () => {
  it('flags near-duplicate themes', () => {
    const a =
      'Ilgesnis kelias – didesnis alkis. Tavo vakarienės planas turi būti paprastas bei sotus.'
    const b =
      'Susidūrei su alkio jausmu po ilgos kelionės? Tavo vakarienė turi būti greita ir paprasta.'
    expect(ugcSlideThemeOverlap(b, [a])).toBeGreaterThan(0.35)
  })

  it('allows distinct story beats', () => {
    const hook = 'Vėlus grįžimas namo — šaldytuvas tuščias, o energijos nėra.'
    const build = 'Pradėjau rašyti savaitės meniu sekmadienį — staiga vakarienės tapo lengvos.'
    expect(ugcSlideThemeOverlap(build, [hook])).toBeLessThan(0.35)
  })
})
