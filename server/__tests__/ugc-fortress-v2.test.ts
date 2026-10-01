import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { CHRISTMAS_BUSINESS_PROFILE_ID, runWithBusinessProfile } from '../business-profiles.js'
import {
  kaleduInventedProductMentions,
  kaleduProductExportIssues,
  kaleduProductSlideVerdict,
  enforceKaleduProductSlide,
  loadKaleduCatalog,
  pickKaleduProductsForTheme,
  KALEDU_GENERIC_GIFT_SENTENCES,
} from '../ugc-kaledu-catalog.js'
import {
  findAgreementErrors,
  findIncompleteClause,
  findPersonNumberErrors,
  kaleduDeterministicQa,
  parseKaleduQaJudge,
} from '../ugc-kaledu-final-qa.js'
import { collectStoryIssues, kaleduThemeDrift, normalizeLtUgcMultiline } from '../ugc-lt-normalize.js'
import {
  buildFallbackHook,
  collectParaphraseSlideIssues,
  getFallbackCloseBodyCandidates,
  KALEDU_SUBJECT_HOOKS,
  makeKaleduSlideFallback,
  pickKaleduSubjectHook,
  pickValidatedKaleduFallback,
  repairKaleduStoryGate,
  rewriteKaleduSlidesNative,
  UGC_KALEDU_FALLBACK_BUILD_BODIES,
  UGC_KALEDU_FALLBACK_CONTEXT_BODIES,
  type KaleduLlmCall,
} from '../ugc-story-engine.js'
import { assertShipableLtSlide } from '../ugc-lt-normalize.js'

const inChristmas = <T>(fn: () => T) => runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, fn)

describe('fortress v2 — product truth', () => {
  it('treats every concrete product noun as invented when nothing was picked', () => {
    inChristmas(() => {
      for (const text of [
        'Aromatiniai žvakės užpildo erdvę šiluma.',
        'Minkšta vilnos pledas sušildo vakarą.',
        'Štai puodelis su sniego dribsniais.',
        'Gali rinktis puikius rankšluosčių komplektus.',
      ]) {
        expect(kaleduInventedProductMentions(text, []).length).toBeGreaterThan(0)
      }
    })
  })

  it('keeps generic gift language legal with no picks', () => {
    inChristmas(() => {
      for (const text of [
        ...KALEDU_GENERIC_GIFT_SENTENCES,
        'Vis dar nežinai, ką seneliui padovanoti?',
        'Dekoracija naujiems namams visada tinka.',
        'Ji visada pirma pagalvos apie kitus.',
      ]) {
        expect(kaleduInventedProductMentions(text, [])).toEqual([])
      }
    })
  })

  it('flags an invented quoted product name', () => {
    inChristmas(() => {
      expect(kaleduInventedProductMentions('Tavo „Jaukios Kalėdos“ dovanų rinkinys.', [])).toContain(
        '„Jaukios Kalėdos“',
      )
    })
  })

  it('explicit theme nouns outrank cozy similarity', () => {
    inChristmas(() => {
      const picked = pickKaleduProductsForTheme({ theme: 'Pledas ir žvakė vienam jaukiam vakarui.' })
      const slugs = picked.map((p) => p.slug)
      expect(slugs.some((s) => /pled/.test(s))).toBe(true)
      expect(slugs.some((s) => /zvak/.test(s))).toBe(true)
      expect(slugs.some((s) => /vaistazoliu|sodas/.test(s))).toBe(false)
      expect(pickKaleduProductsForTheme({ theme: 'Kvepalai mamai' })).toEqual([])
    })
  })

  it('productId requires matching SKU noun and a resolvable image', () => {
    inChristmas(() => {
      const zvake = loadKaleduCatalog().find((p) => p.slug.startsWith('aromaterapijos'))!
      expect(kaleduProductSlideVerdict({ body: 'Žvakidė tinka vakarui.', productId: zvake.slug })).toBe(
        'copy_mismatch',
      )
      expect(kaleduProductSlideVerdict({ body: 'Ši žvakė tinka vakarui.', productId: zvake.slug })).toBe('ok')
      expect(kaleduProductSlideVerdict({ body: 'Pledas.', productId: 'missing-sku' })).toBe('unknown_product')
      const downgraded = enforceKaleduProductSlide({ title: '', body: 'Šita žvakidė.', productId: zvake.slug })
      expect(downgraded.productId).toBeUndefined()
      expect(downgraded.body).not.toMatch(/žvakid/i)
    })
  })

  it('export gate blocks concrete nouns without a productId', () => {
    inChristmas(() => {
      const issues = kaleduProductExportIssues(
        [
          { role: 'hook', title: 'Vis dar be dovanos?', body: 'Sąrašas ilgėja.' },
          { role: 'build', title: '', body: 'Minkšta vilnos pledas sušildo vakarą.' },
        ],
        'Dovana mamai',
      )
      expect(issues.some((issue) => /slide_2:invented_product/.test(issue))).toBe(true)
    })
  })
})

describe('fortress v2 — Christmas final QA', () => {
  it('catches agreement, person, and incomplete-clause errors from the audit', () => {
    expect(findAgreementErrors('Aromatiniai žvakės su aliejais')).not.toEqual([])
    expect(findAgreementErrors('Aromatiniai žvakės užpildo erdvę')).not.toEqual([])
    expect(findAgreementErrors('Aromatiniai žvakės vis tiek čia')).not.toEqual([])
    expect(findAgreementErrors('Minkšta vilnos pledas.')).not.toEqual([])
    expect(findAgreementErrors('su kvapniais žvakes ir šilta pledu')).toHaveLength(2)
    expect(findPersonNumberErrors('Toliai esantis žmogus visada jauti vienišas.')).not.toEqual([])
    expect(findIncompleteClause('Jei dovana galėtų būti visas vakaras, ji tikriausiai atrodytų', 'hook', 'title')).not.toBeNull()
    expect(findIncompleteClause('Kartais viena dovana atrodo per maža, o kelių atskirų rinktis', 'hook', 'title')).not.toBeNull()
  })

  it('normalizer keeps a correct 3rd-person jaučiasi (was rewritten to "žmogus jauti")', () => {
    expect(normalizeLtUgcMultiline('Toli esantis žmogus visada jaučiasi vienišas.')).toMatch(/žmogus visada jaučiasi/)
    expect(normalizeLtUgcMultiline('Ar jaučiasi vasaros nuovargis?')).toMatch(/Ar jauti/)
  })

  it('does not flag correct agreement or clean copy', () => {
    expect(findAgreementErrors('Šilta vilnonė antklodė tinka ramiems vakarams.')).toEqual([])
    expect(findAgreementErrors('Šventinė dovanų paieška prasideda nuo žmogaus.')).toEqual([])
    expect(findAgreementErrors('Švelnus pledas ir šilta žvakė.')).toEqual([])
    expect(findPersonNumberErrors('Kai žmogus nori ramybės, tu jauti tai iškart.')).toEqual([])
    expect(findIncompleteClause('Mamai reikia šilumos', 'hook', 'title')).toBeNull()
    inChristmas(() => {
      expect(
        kaleduDeterministicQa(
          [
            { role: 'hook', title: 'Vis dar be dovanos?', body: 'Sąrašas ilgėja, o šventė vis arčiau.' },
            { role: 'context', body: 'Kai nežinai, kam ieškai, lentynos visos atrodo vienodos.' },
          ],
          { theme: 'Kalėdinė dovana', allowed: [] },
        ),
      ).toEqual([])
    })
  })

  it('flags AI filler and product truth with codes', () => {
    inChristmas(() => {
      const flags = kaleduDeterministicQa(
        [{ role: 'build', body: 'Štai puodelis. Jis šildo ne tik rankas, bet ir sielą.' }],
        { theme: 'dovana', allowed: [] },
      )
      expect(flags[0].codes).toEqual(expect.arrayContaining(['empty_ai_language', 'product_truth']))
    })
  })

  it('ignores judge flags whose quote is not in the slide', () => {
    const slides = [{ role: 'build', body: 'Kai nežinai, kam ieškai, lentynos atrodo vienodos.' }]
    expect(parseKaleduQaJudge({ bad: [{ i: 0, c: ['agreement'], q: 'minkšta pledas' }] }, slides)).toEqual([])
    expect(parseKaleduQaJudge({ bad: [{ i: 0, c: ['collocation'], q: 'lentynos atrodo' }] }, slides)).toHaveLength(1)
    expect(parseKaleduQaJudge({ bad: [{ i: 5, c: ['agreement'], q: 'x' }] }, slides)).toEqual([])
  })

  it('rewrites flagged slides once, then falls back — bounded calls, structure preserved', async () => {
    await inChristmas(async () => {
      const calls: string[] = []
      const llm: KaleduLlmCall = async (_prompt, o) => {
        calls.push(o.callType)
        if (o.callType === 'final_qa_judge') return '{"bad":[]}'
        return JSON.stringify({ slides: [{ i: 1, title: '', body: 'Aromatiniai žvakės vis tiek čia.' }] })
      }
      const out = await rewriteKaleduSlidesNative(
        [
          { id: 's1', role: 'hook', title: 'Vis dar be dovanos?', body: 'Sąrašas ilgėja, o šventė vis arčiau.' },
          { id: 's2', role: 'build', title: '', body: 'Aromatiniai žvakės užpildo erdvę.', productId: undefined },
          { id: 's3', role: 'close', title: '', body: 'Kai dovana jau išrinkta, prieš šventes daug ramiau.' },
        ],
        {
          theme: 'Kalėdinė dovana',
          defaultCta: 'Daugiau dovanų idėjų rasi kaledukampelis.com 🎁',
          seed: 0,
          llm,
          fallbackFor: (index, rows) => {
            const others = rows.filter((_, j) => j !== index).map((r) => ({ title: r.title, body: r.body }))
            const body = pickValidatedKaleduFallback('build', UGC_KALEDU_FALLBACK_BUILD_BODIES, others)
            return body ? { title: '', body } : null
          },
        },
      )
      expect(calls.filter((c) => c === 'final_qa_rewrite')).toHaveLength(1)
      expect(calls.length).toBeLessThanOrEqual(3)
      expect(out.slides[1].body).not.toMatch(/žvak/i)
      expect(out.slides[1].role).toBe('build')
      expect(out.slides[2].cta).toMatch(/kaledukampelis\.com/)
      expect(out.native.slides[1].shipped).toBe('fallback')
    })
  })
})

describe('fortress v2 — story gates', () => {
  it('theme_drift uses the semantic subject, not a literal gift keyword', () => {
    inChristmas(() => {
      expect(
        kaleduThemeDrift(
          'Praktiška dovana seneliui be nereikalingų smulkmenų.',
          'Seneliui reikia šilumos. Vis dar nežinai, ką seneliui padovanoti?',
        ),
      ).toBeNull()
      expect(
        kaleduThemeDrift(
          'Kalėdinės dekoracijos, kurios lieka gražios',
          'Ar vis dar ieškai kalėdinės dovanos? Šventės artėja.',
        ),
      ).toBe('dekoracijos')
      expect(kaleduThemeDrift('Kalėdinė dovana', 'Ką padovanoti šiemet?')).toBeNull()
    })
  })

  it('season repetition is soft for Christmas but duplicates still fail', () => {
    inChristmas(() => {
      const seasonal = collectStoryIssues(
        [
          { role: 'hook', title: 'Žiema jau čia?', body: 'Šaltas vakaras ir dovanų sąrašas.' },
          { role: 'context', title: '', body: 'Žiemą norisi šilto vakaro namuose su dovana.' },
          { role: 'close', title: '', body: 'Kai dovana jau išrinkta, prieš šventes daug ramiau.' },
        ],
        'Kalėdinė dovana žiemą',
      )
      expect(seasonal.map((i) => i.code)).not.toContain('season_repeat')
      const dup = collectStoryIssues(
        [
          { role: 'hook', title: 'Vis dar be dovanos?', body: 'Kai nežinai, kam ieškai, lentynos visos atrodo vienodos.' },
          { role: 'context', title: '', body: 'Kai nežinai, kam ieškai, lentynos visos atrodo vienodos.' },
          { role: 'close', title: '', body: 'Kai dovana jau išrinkta, prieš šventes daug ramiau.' },
        ],
        'Kalėdinė dovana',
      )
      expect(dup.some((i) => i.code === 'duplicate_sentence' || i.code === 'duplicate_slide_body')).toBe(true)
    })
  })
})

describe('fortress v2 — fallback quality', () => {
  it('every Christmas fallback line passes contamination, product truth, final QA, and ship gates', () => {
    inChristmas(() => {
      const pools: Array<[string, string[]]> = [
        ['context', UGC_KALEDU_FALLBACK_CONTEXT_BODIES],
        ['build', UGC_KALEDU_FALLBACK_BUILD_BODIES],
        ['close', getFallbackCloseBodyCandidates('dovana')],
        ['build', KALEDU_GENERIC_GIFT_SENTENCES],
      ]
      for (const [role, pool] of pools) {
        for (const body of pool) {
          expect(kaleduInventedProductMentions(body, []), body).toEqual([])
          expect(kaleduDeterministicQa([{ role, body }], { theme: '', allowed: [] }), body).toEqual([])
          expect(() => assertShipableLtSlide({ body, role }), body).not.toThrow()
        }
      }
    })
  })

  it('never picks a fallback that repeats another slide in the post', () => {
    inChristmas(() => {
      const [first] = UGC_KALEDU_FALLBACK_BUILD_BODIES
      const picked = pickValidatedKaleduFallback('build', UGC_KALEDU_FALLBACK_BUILD_BODIES, [{ body: first }])
      expect(picked).toBeTruthy()
      expect(picked).not.toBe(first)
    })
  })

  it('ledger ranking puts lines shipped recently at the back', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ugc-ledger-'))
    vi.stubEnv('UGC_VISION_ROOT', root)
    vi.resetModules()
    const ledger = await import('../ugc-variety-ledger.js')
    ledger.recordUgcVarietyEntry({
      theme: 't',
      hookTitle: 'h',
      slideTexts: ['Kai dovana jau išrinkta, prieš šventes daug ramiau. Žinai, kad daiktas tiks žmogui.'],
      slideBodies: ['Kai dovana jau išrinkta, prieš šventes daug ramiau. Žinai, kad daiktas tiks žmogui.'],
    })
    const ranked = ledger.rankByLedgerFreshness([
      'Kai dovana jau išrinkta, prieš šventes daug ramiau. Žinai, kad daiktas tiks žmogui.',
      'Gerai dovanai nebūtina kainuoti daug. Svarbiau, kam ją renkiesi.',
    ])
    expect(ranked[0]).toMatch(/^Gerai dovanai/)
    vi.unstubAllEnvs()
    fs.rmSync(root, { recursive: true, force: true })
  })
})

describe('fortress v2 — audit 2026-09-24 residuals', () => {
  const flagged = (body: string, role = 'build') =>
    kaleduDeterministicQa([{ role, body }], { theme: '', allowed: [] }).flatMap((f) => f.codes)

  it('flags register, fragment, invented-word, and collocation errors that shipped', () => {
    inChristmas(() => {
      for (const [body, code] of [
        ['Žinau tą jausmą, kai laiko lieka mažai.', 'register_violation'],
        ['Dabar galiu ramiai užbaigti šią misiją.', 'register_violation'],
        ['Dovanojimo stresą žinome visi.', 'register_violation'],
        ['Dovanokite šventinį jaukumą kartu.', 'register_violation'],
        ['Kalėdos. Laikas skirti dėmesio vienas kitam.', 'incomplete_clause'],
        ['Kai žmogus gyvena kitame mieste.', 'incomplete_clause'],
        ['Tavo parduotuvėje rasisi originalius variantus.', 'invented_word'],
        ['Nuspręsk paskutinės minutės dovanų bėdą!', 'unnatural_collocation'],
        ['Gal neturėjai laiko susivienyti su artimaisiais.', 'unnatural_collocation'],
        ['Pasitikėk emocijomis ir dovanok jaukumą.', 'empty_ai_language'],
        ['Dovanų ieškojimas virsta misija, o laiko visai neturite.', 'register_violation'],
        ['Net jei gyvenate atokiau, dovana sušildo.', 'register_violation'],
        ['Jauti lyg ant ugnies? Dovanų dar neturiu, o laikas bėga!', 'register_violation'],
        ['Dovanok komfortą keliaujantiems! Daugiau idėjų:', 'incomplete_clause'],
        ['Išsirink geriausią variantą Kalėdų Kampelyje -', 'incomplete_clause'],
        ['Nustebink artimuosius dekoracijomis. Su kuriais Kalėdos pasidarys šventesnės!', 'incomplete_clause'],
        ['Tai ne tik dekoracijos. Tai emocijų kupinas pasakojimas.', 'empty_ai_language'],
        ['Dažnai jaučiamės įsprausti į dovanų stereotipus.', 'register_violation'],
      ] as const) {
        expect(flagged(body), body).toContain(code)
      }
    })
  })

  it('keeps natural tu-copy clean', () => {
    inChristmas(() => {
      for (const body of [
        'Kai dovana jau išrinkta, prieš šventes daug ramiau.',
        'Nuspręsk, ką dovanosi, ir sąrašas iškart trumpėja.',
        'Tau užtenka vienos apgalvotos dovanos.',
        'Daugiau laiko lieka pakuotei ir kortelei.',
      ]) {
        expect(flagged(body), body).toEqual([])
      }
    })
  })

  it('ignores judge flags that only quote an allowed product phrase', () => {
    inChristmas(() => {
      const pledas = loadKaleduCatalog().find((p) => /pled/.test(p.slug))!
      const slides = [{ role: 'build', body: 'Vilnonis pledas tinka vėsiems vakarams.', productId: pledas.slug }]
      expect(parseKaleduQaJudge({ bad: [{ i: 0, c: ['collocation'], q: 'Vilnonis pledas' }] }, slides, [pledas])).toEqual([])
    })
  })

  it('Christmas hook fallback is a real sentence for the theme subject, never the theme label', () => {
    inChristmas(() => {
      for (const [hook, body, subject] of [
        ['Dovana mamai', 'Mamai norisi ne dar vienos smulkmenos.', /mam/i],
        ['Dovana per atstumą', 'Kai žmogus gyvena kitame mieste.', /miest|toli/i],
        ['Jaukus vakaras dovanų', 'Pledas ir žvakė kaip viena dovana.', /./],
        ['Slaptasis Senelis darbe', 'Maža dovana kolegai, kurio gerai nepažįsti.', /koleg|slapt/i],
      ] as const) {
        const out = buildFallbackHook(hook, body)
        expect(out.title).not.toBe(hook)
        expect(out.body).not.toBe(body)
        expect(`${out.title} ${out.body}`).toMatch(subject)
        expect(out.title).toMatch(/\?$/)
        expect(kaleduDeterministicQa([{ ...out, role: 'hook' }], { theme: hook, allowed: [] })).toEqual([])
      }
    })
  })

  it('every subject hook passes final QA and ship gates', () => {
    inChristmas(() => {
      for (const [label, hooks] of Object.entries(KALEDU_SUBJECT_HOOKS)) {
        for (const hook of hooks) {
          expect(kaleduDeterministicQa([{ ...hook, role: 'hook' }], { theme: label, allowed: [] }), hook.title).toEqual([])
          expect(() => assertShipableLtSlide({ ...hook, role: 'hook' }), hook.title).not.toThrow()
        }
      }
    })
  })

  it('subject hook is kept even when other slides share the subject words', () => {
    inChristmas(() => {
      const theme = 'Praktiška dovana seneliui be nereikalingų smulkmenų.'
      const hook = pickKaleduSubjectHook(theme, [
        { body: 'Seneliui nereikia daiktų, jam svarbiau dėmesys.' },
        { body: 'Kai senelis sako, kad nieko nereikia, ieškai ilgiau.' },
      ])
      expect(`${hook.title} ${hook.body}`).toMatch(/senel/i)
    })
  })

  it('a recently shipped subject hook still outranks generic hooks', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ugc-ledger-hook-'))
    vi.stubEnv('UGC_VISION_ROOT', root)
    vi.resetModules()
    const ledger = await import('../ugc-variety-ledger.js')
    const engine = await import('../ugc-story-engine.js')
    const profiles = await import('../business-profiles.js')
    const hook = engine.KALEDU_SUBJECT_HOOKS['dekoracijos'][0]
    ledger.recordUgcVarietyEntry({
      theme: 'dekoracijos',
      hookTitle: hook.title,
      slideTexts: [`${hook.title} ${hook.body}`],
      slideBodies: [hook.body],
    })
    const picked = profiles.runWithBusinessProfile(profiles.CHRISTMAS_BUSINESS_PROFILE_ID, () =>
      engine.pickKaleduSubjectHook('Kalėdinės dekoracijos, kurios lieka gražios'),
    )
    expect(`${picked.title} ${picked.body}`).toMatch(/dekor|puoš|dėž/i)
    vi.unstubAllEnvs()
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('pora subject survives without the literal word', () => {
    inChristmas(() => {
      expect(kaleduThemeDrift('Dovana porai', 'Laikas skirti dėmesio vienas kitam.')).toBeNull()
      expect(kaleduThemeDrift('Dovana porai', 'Norisi, kad džiaugtųsi abu.')).toBeNull()
    })
  })

  it('story gate repair fixes a paraphrase slide and a drifted hook instead of killing the post', () => {
    inChristmas(() => {
      const slides = [
        { id: 's1', role: 'hook', title: 'Ar jie vis dar ginčijasi dėl pulto?', body: 'Šventės artėja, o sprendimo nėra.', cta: '' },
        { id: 's2', role: 'context', title: '', body: 'Kai nežinai, kam ieškai, visos lentynos atrodo vienodos.', cta: '' },
        { id: 's3', role: 'build', title: '', body: 'Kai nežinai, kam ieškai, visos lentynos atrodo vienodos.', cta: '' },
        { id: 's4', role: 'close', title: '', body: 'Gerai dovanai nebūtina kainuoti daug. Svarbiau, kam ją renkiesi.', cta: 'Daugiau dovanų idėjų rasi kaledukampelis.com 🎁' },
      ]
      const theme = 'Dovana porai, kuria abu džiaugtųsi'
      const fb = makeKaleduSlideFallback({ themeHook: 'Dovana porai', themeBody: '', topic: theme, allowed: [] })
      const out = repairKaleduStoryGate(slides, theme, fb, [])
      expect(out.repairs.length).toBeGreaterThan(0)
      expect([...collectStoryIssues(out.slides, theme), ...collectParaphraseSlideIssues(out.slides)]).toEqual([])
      expect(out.slides[3].cta).toMatch(/kaledukampelis\.com/)
      expect(out.slides.map((s) => s.role)).toEqual(['hook', 'context', 'build', 'close'])
    })
  })

  it('theme_drift on a picked product is repaired with the real SKU on an early slide', () => {
    inChristmas(() => {
      const termosas = loadKaleduCatalog().find((p) => /termos/.test(p.slug))
      if (!termosas) return
      const slides = [
        { id: 's1', role: 'hook', title: 'Vis dar be dovanos?', body: 'Sąrašas ilgėja, o šventė vis arčiau.', cta: '' },
        { id: 's2', role: 'context', title: '', body: 'Kuo ilgiau atidedi paiešką, tuo sunkiau apsispręsti.', cta: '' },
        { id: 's3', role: 'build', title: '', body: 'Praktiška dovana nebūtinai nuobodi.', cta: '' },
        { id: 's4', role: 'close', title: '', body: 'Gerai dovanai nebūtina kainuoti daug. Svarbiau, kam ją renkiesi.', cta: 'Daugiau dovanų idėjų rasi kaledukampelis.com 🎁' },
      ]
      const theme = 'Termosas kelionėms žiemą'
      const fb = makeKaleduSlideFallback({ themeHook: 'Kava kelionėje', themeBody: '', topic: theme, allowed: [termosas] })
      const out = repairKaleduStoryGate(slides, theme, fb, [termosas])
      expect(kaleduThemeDrift(theme, out.slides.slice(0, 3).map((s) => `${s.title} ${s.body}`).join(' '))).toBeNull()
      const productSlide = out.slides.find((s) => s.productId)
      if (productSlide) expect(kaleduProductSlideVerdict(productSlide)).toBe('ok')
    })
  })
})
