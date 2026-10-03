import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CHRISTMAS_BUSINESS_PROFILE_ID, runWithBusinessProfile } from '../business-profiles.js'
import { demoteProductTypeCapitals, KALEDU_LIFESTYLE_INTENTS, kaleduInventedProductMentions } from '../ugc-kaledu-catalog.js'
import { pickStoryAwareKaleduCta } from '../ugc-kaledu-cta.js'
import { findCaseGovernmentErrors, findIncompleteClause, findSentenceFragments, kaleduDeterministicQa } from '../ugc-kaledu-final-qa.js'
import { joinVerblessCopulaSplits } from '../ugc-lt/normalize-copy.js'
import { collectKaleduArcIssues } from '../ugc-story/arc-guard.js'
import { assertShipableLtSlide, normalizeLtUgcMultiline } from '../ugc-lt-normalize.js'
import { checkLtSpelling, ensureLtSpeller, repairUnambiguousLtTypos } from '../ugc-lt-spellcheck.js'
import { stripProductIdTags } from '../ugc-lt/normalize-copy.js'
import { KALEDU_GENERIC_HOOKS, KALEDU_SUBJECT_HOOKS, KALEDU_THEME_HOOKS, pickKaleduSubjectHook, UGC_KALEDU_FALLBACK_BUILD_BODIES } from '../ugc-story/fallbacks.js'
import { KALEDU_SEARCH_TIP_RE } from '../ugc-story/kaledu-gates.js'
import { kaleduProductKits, kaleduThemeKits } from '../ugc-story/kaledu-kits.js'

const inChristmas = <T>(fn: () => T) => runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, fn)

const FIXTURE = {
  themes: [
    {
      id: 1,
      theme: 'Kalėdinė dovana naujam pažįstamam žmogui.',
      recipient: 'pažįstamas',
      hooks: [{ title: 'Ką dovanoti žmogui, kurį pažįsti neseniai?', body: 'Per asmeniška dovana gali sutrikdyti.' }],
      context: ['Žmogų pažįsti neseniai, todėl sunku nuspręsti.'],
      build: ['Neutrali dovana tinka bet kuriems namams.'],
      close: ['Neutrali, bet apgalvota dovana parodys, kad pagalvojai.'],
    },
  ],
  products: [
    { slug: 'vilnonis-pledas-jaukumas', gender: 'm', reveal: ['Vilnonis pledas sušildys filmų vakarą.'], use: ['Jis tiks sofai.'], close: ['Tokia dovana pravers kiekvieną vakarą.'] },
  ],
}

async function loadWithFixture(data: unknown) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kaledu-kits-')), 'kits.json')
  fs.writeFileSync(file, JSON.stringify(data), 'utf8')
  vi.stubEnv('UGC_KALEDU_KITS_FILE', file)
  vi.resetModules()
  return import('../ugc-story/kaledu-kits.js')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('Kalėdų line kits loader', () => {
  it('finds the theme kit by its theme title and returns lines per role', async () => {
    const kits = await loadWithFixture(FIXTURE)
    const kit = kits.findKaleduThemeKit('Kalėdinė dovana naujam pažįstamam žmogui. Ką dovanoti?')
    expect(kit?.id).toBe(1)
    expect(kits.themeKitLines(kit, 'context')).toEqual(FIXTURE.themes[0].context)
    expect(kits.themeKitLines(kit, 'punch')).toEqual(FIXTURE.themes[0].close)
    expect(kits.themeKitLines(kit, 'hook')).toEqual([])
    expect(kits.findKaleduThemeKit('Dovana mamai')).toBeNull()
    expect(kits.findKaleduProductKit('vilnonis-pledas-jaukumas')?.gender).toBe('m')
    expect(kits.findKaleduProductKit('nera-tokio')).toBeNull()
  })

  it('recognises kit lines in a slide for the theme-drift check', async () => {
    const kits = await loadWithFixture(FIXTURE)
    const theme = 'Kalėdinė dovana naujam pažįstamam žmogui.'
    expect(kits.textUsesThemeKit(theme, 'Žmogų pažįsti neseniai, todėl sunku nuspręsti.')).toBe(true)
    expect(kits.textUsesThemeKit(theme, 'Visai kitas sakinys apie dovanas.')).toBe(false)
  })

  it('falls back to empty kits when the file is missing or broken', async () => {
    vi.stubEnv('UGC_KALEDU_KITS_FILE', path.join(os.tmpdir(), 'no-such-kaledu-kits.json'))
    vi.resetModules()
    const kits = await import('../ugc-story/kaledu-kits.js')
    expect(kits.kaleduThemeKits()).toEqual([])
    expect(kits.findKaleduThemeKit('Kalėdinė dovana naujam pažįstamam žmogui.')).toBeNull()
  })
})

describe('shipped Kalėdų line kits', () => {
  it('every theme kit line passes product truth, final QA and the ship gate', () => {
    inChristmas(() => {
      for (const kit of kaleduThemeKits()) {
        const lines: Array<{ role: string; title?: string; body: string }> = [
          ...kit.hooks.map((h) => ({ role: 'hook', title: h.title, body: h.body })),
          ...kit.context.map((body) => ({ role: 'context', body })),
          ...kit.build.map((body) => ({ role: 'build', body })),
          ...kit.close.map((body) => ({ role: 'close', body })),
        ]
        for (const line of lines) {
          const label = `#${kit.id} ${line.role}: ${line.title || ''} ${line.body}`
          expect(kaleduInventedProductMentions(`${line.title || ''} ${line.body}`, []), label).toEqual([])
          expect(kaleduDeterministicQa([line], { theme: '', allowed: [] }), label).toEqual([])
          expect(() => assertShipableLtSlide(line), label).not.toThrow()
        }
      }
    })
  })

  it('every product kit line passes the ship gate', () => {
    inChristmas(() => {
      for (const kit of kaleduProductKits()) {
        for (const [role, pool] of [['build', kit.reveal], ['build', kit.use], ['close', kit.close]] as const) {
          for (const body of pool) {
            expect(() => assertShipableLtSlide({ role, body }), `${kit.slug} ${role}: ${body}`).not.toThrow()
          }
        }
      }
    })
  })
})

describe('catalog reason lines (audit batch30)', () => {
  it('every lifestyle-intent reason passes the ship gate', () => {
    inChristmas(() => {
      for (const intent of KALEDU_LIFESTYLE_INTENTS) {
        for (const body of intent.why) {
          expect(() => assertShipableLtSlide({ role: 'build', body }), `${intent.label}: ${body}`).not.toThrow()
        }
      }
    })
  })

  it('keeps the gift as the object when galite is repaired to gali', () => {
    expect(normalizeLtUgcMultiline('Dovanos galite įsigyti atskirai.')).toContain('Dovanas gali įsigyti atskirai')
    expect(normalizeLtUgcMultiline('Jūs galite rinktis ramiai.')).not.toMatch(/galite/u)
  })

  it('rewrites the batch30 translated-sounding phrases as whole phrases', () => {
    expect(normalizeLtUgcMultiline('Norisi parodyti savo dėmesį.')).toBe('Norisi parodyti dėmesio.')
    expect(normalizeLtUgcMultiline('Dovanas gali pirkti atskirai, bet kartais tai išleidžia daugiau.')).toBe(
      'Dovanas gali pirkti atskirai, bet taip dažnai išleidi daugiau.',
    )
    expect(normalizeLtUgcMultiline('Pledas suteiks jaukumo ir šviesaus komforto.')).toBe('Pledas suteiks jaukumo ir šilumos.')
    expect(normalizeLtUgcMultiline('Tai puiki dovana filmų vakaro mėgėjams.')).toBe('Tai puiki dovana filmų vakarų mėgėjams.')
  })

  it('strips a bare productId leak instead of losing the slide (batch30 post-08)', () => {
    expect(stripProductIdTags('Filmų vakarais vis dar susisupi į seną antklodę productId=vilnonis-pledas-jaukumas.')).toBe(
      'Filmų vakarais vis dar susisupi į seną antklodę.',
    )
    expect(stripProductIdTags('Gali rinktis pledą [productId=vilnonis-pledas-jaukumas].')).toBe('Gali rinktis pledą.')
  })
})

describe('batch 2026-10-02 replay fixes', () => {
  it('joins a copula split instead of shipping two labels', () => {
    expect(joinVerblessCopulaSplits('Bendra dovana. Protingesnis pasirinkimas abiem.')).toBe('Bendra dovana yra protingesnis pasirinkimas abiem.')
    expect(joinVerblessCopulaSplits('Vilnonis pledas „Žiemos šiluma“. Tai puiki dovana filmų vakarų mėgėjams.')).toBe(
      'Vilnonis pledas „Žiemos šiluma“ yra puiki dovana filmų vakarų mėgėjams.',
    )
    expect(joinVerblessCopulaSplits('Štai puiki dovana. Ąžuolo serviravimo lenta „Vakarienė dviese“.')).toBe(
      'Štai puiki dovana: ąžuolo serviravimo lenta „Vakarienė dviese“.',
    )
    // Real sentences stay apart.
    const ok = 'Kai dovana jau išrinkta, prieš šventes daug ramiau. Žinai, kad ji tikrai tiks.'
    expect(joinVerblessCopulaSplits(ok)).toBe(ok)
  })

  it('flags verbless fragments but not short real sentences', () => {
    for (const bad of ['Dovana suteiks ramybės. Šventiška nuotaika.', 'Skubant lengva suklysti. Nuspręsti, kas svarbiausia.', 'Dabar rytas. Kava jau verda.']) {
      expect(findSentenceFragments(bad), bad).not.toEqual([])
    }
    for (const good of [
      'Ką padovanoti tėčiui? Tėtis sako, kad jam nieko nereikia. Tada ieškoti dar sunkiau.',
      'Nereikia ieškoti tobulos dovanos. Užtenka tokios, kuri tiktų būtent tam žmogui.',
      'Praktiška dovana nepasimeta stalčiuje. Ji primena apie tave kiekvieną dieną.',
      'Rinkis daiktą, kurį žmogus naudos ir po švenčių. Tada dovana neatsidurs stalčiuje.',
      'Laikas bėga. Dovana jau supakuota.',
    ]) {
      expect(findSentenceFragments(good), good).toEqual([])
    }
  })

  it('rejects label hook titles', () => {
    expect(findIncompleteClause('Ritualai su šviesa. Jaukumo kelias', 'hook', 'title')).toMatch(/label/u)
    expect(findIncompleteClause('Kalėdiniai megztiniai. Kasmetinė tradicija', 'hook', 'title')).toMatch(/label/u)
    expect(findIncompleteClause('Dekoracijos, kurios nepabosta?', 'hook', 'title')).toBeNull()
    expect(findIncompleteClause('Ryte norisi šilto gėrimo', 'hook', 'title')).toBeNull()
  })

  it('applies the VLKK-verified rules from reference §21', () => {
    inChristmas(() => {
      expect(normalizeLtUgcMultiline('Ar kalėdos jau čia, o tu vis dar ieškai?')).toBe('Ar Kalėdos jau čia, o tu vis dar ieškai?')
      expect(normalizeLtUgcMultiline('Kalėdinis stresas ima viršum.')).toBe('Kalėdinis stresas ima viršų.')
    })
    expect(normalizeLtUgcMultiline('Dovanos paiešką daro varginančią, nes nori kažko ypatingo.')).toContain('varginančią')
    expect(normalizeLtUgcMultiline('Dovanos paiešką daro varginanti, nes nori kažko ypatingo.')).toContain('paiešką daro varginančią')
    expect(findCaseGovernmentErrors('Dovanos paiešką daro varginanti.')).not.toEqual([])
    expect(findCaseGovernmentErrors('Iki kalėdos liko savaitė.')).not.toEqual([])
    expect(normalizeLtUgcMultiline('Tai neįprasta, jaukus ir paliečiamas dekoracijos elementas.')).toBe(
      'Tai neįprastas, jaukus ir paliečiamas dekoracijos elementas.',
    )
    expect(normalizeLtUgcMultiline('Tėvams norisi ko nors netikėtų ir šventiška.')).toContain('kažko netikėto ir šventiško')
  })

  it('lowercases a catalog product type mid-sentence, never the quoted name', () => {
    const products = [{ name: 'Aromaterapijos žvakė „Žvakių vakaras“' }, { name: 'Mėnulio lempa „Mėnulio šviesa“' }] as never
    expect(demoteProductTypeCapitals('Šiemet nustebink su Aromaterapijos žvake.', products)).toBe('Šiemet nustebink su aromaterapijos žvake.')
    expect(demoteProductTypeCapitals('Štai Mėnulio lempa „Mėnulio šviesa“.', products)).toBe('Štai mėnulio lempa „Mėnulio šviesa“.')
    expect(demoteProductTypeCapitals('Aromaterapijos žvakė kvepia visą vakarą.', products)).toBe('Aromaterapijos žvakė kvepia visą vakarą.')
  })

  it('picks the hook from the theme title, not from product examples in the body', () =>
    inChristmas(() => {
      const hook = pickKaleduSubjectHook(
        'Kalėdinės dovanos iki 50 eurų Iki 50 eurų jau telpa dovana. Pledas, termosas ar žvakės rinkinys dažnai atrodo brangiau.',
      )
      expect(hook.title).not.toMatch(/kelyje/u)
    }))

  it('does not let slide 2 invent a recipient on a theme without one', () => {
    const issues = collectKaleduArcIssues(
      [
        { role: 'hook', title: 'Ieškai jaukios dovanos?', body: 'Nori, kad ji primintų šiltus vakarus namuose?' },
        { role: 'context', body: 'Tėvai džiaugiasi paprastais dalykais, bet norisi kažko originalesnio.' },
        { role: 'close', body: 'Tokia dovana pravers kiekvieną vakarą.' },
      ],
      'Jaukus filmų vakaras prieš Kalėdas.',
    )
    expect(issues).toContainEqual(expect.objectContaining({ slide: 2, code: 'recipient_drift' }))
  })

  it('product CTAs agree with any product gender', () => {
    const pick = pickStoryAwareKaleduCta({
      slides: [{ role: 'build', body: 'Gali rinktis mėnulio lempą.', productId: 'menulio-lempa-3d' }, { role: 'close', body: 'Gera dovana.' }],
      products: [{ slug: 'menulio-lempa-3d' }],
      mode: 'PRODUCT_LED',
      seed: 0,
    })
    expect(pick.cta).not.toMatch(/^Šį /u)
  })
})

describe('spell gate repairs (batch30)', () => {
  it('knows kampukas and fixes only one-suggestion diacritic typos', async () => {
    await ensureLtSpeller()
    expect(checkLtSpelling('Jaukiame kampuke telpa visa šventė.').hardFail).toBeNull()
    expect(repairUnambiguousLtTypos('Rinkis šiltus rankšluoščiai.').text).toBe('Rinkis šiltus rankšluosčiai.')
    // „megimas“ has several candidates (mėgimas / mezgimas) — never guessed.
    const knit = repairUnambiguousLtTypos('Storas megimas.')
    expect(knit.fixes).toEqual([])
    // …and the audit lists every close candidate, not just the first („mėgimas“).
    expect(checkLtSpelling('Storas megimas.').hardFail).toMatch(/mėgimas \/ \p{L}+/u)
  })
})

describe('fallbacks after a product reveal (batch30 post-09)', () => {
  it('never coaches the gift search after the product is on screen', () => {
    for (const line of UGC_KALEDU_FALLBACK_BUILD_BODIES.filter((l) => !KALEDU_SEARCH_TIP_RE.test(l))) {
      expect(line).not.toMatch(/paiešk|užsirašyk|pradėk nuo žmogaus/iu)
    }
    expect(UGC_KALEDU_FALLBACK_BUILD_BODIES.some((l) => !KALEDU_SEARCH_TIP_RE.test(l))).toBe(true)
  })

  it('every subject and generic hook passes final QA and the ship gate', async () => {
    await ensureLtSpeller()
    inChristmas(() => {
      for (const hook of [...Object.values(KALEDU_SUBJECT_HOOKS).flat(), ...KALEDU_THEME_HOOKS.flatMap((row) => row.hooks), ...KALEDU_GENERIC_HOOKS]) {
        const label = `${hook.title} / ${hook.body}`
        expect(kaleduDeterministicQa([{ ...hook, role: 'hook' }], { theme: '', allowed: [] }), label).toEqual([])
        expect(() => assertShipableLtSlide({ ...hook, role: 'hook' }), label).not.toThrow()
      }
    })
  })
})
