import { beforeAll, describe, expect, it } from 'vitest'
import { CHRISTMAS_BUSINESS_PROFILE_ID, runWithBusinessProfile } from '../business-profiles.js'
import { loadKaleduCatalog } from '../ugc-kaledu-catalog.js'
import {
  findCaseGovernmentErrors,
  findVerbConstructionErrors,
  kaleduDeterministicQa,
} from '../ugc-kaledu-final-qa.js'
import { checkLtSpelling, ensureLtSpeller } from '../ugc-lt-spellcheck.js'
import {
  finalKaleduShipQa,
  KALEDU_SUBJECT_HOOKS,
  makeKaleduSlideFallback,
  rewriteKaleduSlidesNative,
  type KaleduLlmCall,
  UGC_KALEDU_FALLBACK_BUILD_BODIES,
  UGC_KALEDU_FALLBACK_CONTEXT_BODIES,
  getFallbackCloseBodyCandidates,
} from '../ugc-story-engine.js'

const inChristmas = <T>(fn: () => T) => runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, fn)
const codes = (body: string, role = 'build') =>
  kaleduDeterministicQa([{ role, body }], { theme: '', allowed: [] }).flatMap((f) => f.codes)

beforeAll(async () => {
  await ensureLtSpeller()
})

describe('LT spellcheck — lexical garbage', () => {
  it('high-confidence typos from the audits are spell_hard_fail', () => {
    for (const text of [
      'Tavo parduotuvėje rasisi originalius variantus.',
      'Net jei gyveni toli, dovana sušildo prisimintimis.',
      'Sakė, kad visko turi kalėdės.',
      'Ar vana paaugliui: ką duoti?',
      'Dovnaa tau patiks.',
      'Laikas blyksta greičiau nei lemputės.',
      'Kai jie jaučiasi vienisi, dovana primena apie tave.',
    ]) {
      const result = checkLtSpelling(text)
      expect(result.checked).toBe(true)
      expect(result.hardFail, text).not.toBeNull()
      expect(codes(text), text).toContain('spell_hard_fail')
    }
  })

  it('a diacritic-only mistake is high confidence', () => {
    const hit = checkLtSpelling('Kai jie jaučiasi vienisi, dovana primena apie tave.').unknown.find(
      (u) => u.token === 'vienisi',
    )
    expect(hit?.confidence).toBe('high')
    expect(hit?.typoOf).toBeTruthy()
  })

  it('reports token, suggestions, and sentence for the audit', () => {
    const result = checkLtSpelling('Tavo parduotuvėje rasisi originalius variantus.')
    const hit = result.unknown.find((u) => u.token === 'rasisi')
    expect(hit?.suggestions.length).toBeGreaterThan(0)
    expect(hit?.sentence).toMatch(/parduotuvėje/)
  })

  it('ignores URLs, emoji, numbers, brand and catalog product names', () => {
    inChristmas(() => {
      expect(checkLtSpelling('Daugiau dovanų idėjų rasi kaledukampelis.com 🎁').unknown).toEqual([])
      expect(checkLtSpelling('Dovana iki 50 eurų Kalėdų Kampelyje.').unknown).toEqual([])
      for (const product of loadKaleduCatalog()) {
        const result = checkLtSpelling(`Gali rinktis ${product.name}.`)
        expect(result.hardFail, product.name).toBeNull()
        expect(result.note, product.name).toBeNull()
      }
    })
  })

  it('passes valid Lithuanian inflections', () => {
    expect(
      checkLtSpelling('Išsirinkai dovaną seneliui, kuriam nieko nereikia. Džiaugtųsi abu, užuot rinkęs paskubomis.').unknown,
    ).toEqual([])
  })

  it('an unknown mid-sentence proper noun never hard-fails', () => {
    const result = checkLtSpelling('Dovana draugui Kęstučiui iš Zarasų.')
    expect(result.hardFail).toBeNull()
  })

  it('capitalization does not save a distance-1 / diacritic typo of a common word', () => {
    const result = checkLtSpelling('Kai jie jaučiasi Vienisi, dovana primena apie tave.')
    expect(result.hardFail).not.toBeNull()
  })

  it('no-vowel junk hard-fails, units and abbreviations do not', () => {
    expect(checkLtSpelling('Tai dvnk dovana tau.').hardFail).not.toBeNull()
    for (const text of ['Termosas 500 ml talpos.', 'Pakuotė 2 kg svorio.', 'Aukštis 30 cm.', 'Rinkinys 3 vnt.']) {
      expect(checkLtSpelling(text).hardFail, text).toBeNull()
    }
  })

  it('a dictionary-valid wrong word is not a spelling problem', () => {
    const result = checkLtSpelling('Šventės planavimas visada atlojamas.')
    expect(result.hardFail).toBeNull()
    expect(result.note).toBeNull()
  })
})

describe('LT final QA — grammar that spellcheck cannot see', () => {
  it('fails the audit grammar errors', () => {
    expect(findCaseGovernmentErrors('Jauti tas stresas, kai lemputės mirga?')).not.toEqual([])
    expect(findVerbConstructionErrors('Tendencijos verčia išleidžiame pinigus kasmet.')).not.toEqual([])
    expect(findCaseGovernmentErrors('Dažnai ieškoma kažko originaliu.')).not.toEqual([])
    expect(findVerbConstructionErrors('Parodyk, kad esi prisimindamas.')).not.toEqual([])
    expect(findVerbConstructionErrors('Dovanai nebūtina būti brangiai.')).not.toEqual([])
    expect(findVerbConstructionErrors('Dovana nebūtinai turi būti brangi.')).toEqual([])
    expect(findVerbConstructionErrors('Gerai dovanai nebūtina kainuoti daug.')).toEqual([])
    expect(findCaseGovernmentErrors('Nori pasidalinti Kalėdinės nuotaikos su draugais.')).not.toEqual([])
    for (const body of [
      'Jauti tas stresas, kai lemputės mirga?',
      'Tendencijos verčia išleidžiame pinigus kasmet.',
      'Dažnai ieškoma kažko originaliu.',
      'Parodyk, kad esi prisimindamas.',
      'Nori pasidalinti Kalėdinės nuotaikos su draugais.',
      'Laikas blyksta greičiau nei lemputės.',
      'Dovanai nebūtina būti brangiai.',
    ]) {
      expect(codes(body).length, body).toBeGreaterThan(0)
    }
  })

  it('passes the natural equivalents', () => {
    for (const body of [
      'Jauti tą stresą, kai lemputės mirga?',
      'Tendencijos verčia kasmet išleisti pinigus.',
      'Dažnai ieškoma kažko originalaus.',
      'Parodyk, kad prisimeni.',
      'Nori pasidalinti kalėdine nuotaika su draugais.',
      'Laikas bėga greičiau nei norėtum.',
      'Nieko baisaus, dar spėsi.',
      'Kai ieškai dovanos, lentynos atrodo vienodos.',
      'Dovana nebūtinai turi būti brangi.',
      'Gerai dovanai nebūtina kainuoti daug.',
    ]) {
      expect(codes(body), body).toEqual([])
    }
  })

  it('first-person plural reflexive fails', () => {
    expect(codes('Dažnai jaučiamės įsprausti į dovanų stereotipus.')).toContain('register_violation')
  })
})

describe('LT safety — fallback pools stay clean with the dictionary loaded', () => {
  it('every fallback and subject hook passes spellcheck + final QA', () => {
    inChristmas(() => {
      const pools: Array<[string, string[]]> = [
        ['context', UGC_KALEDU_FALLBACK_CONTEXT_BODIES],
        ['build', UGC_KALEDU_FALLBACK_BUILD_BODIES],
        ['close', getFallbackCloseBodyCandidates('dovana')],
      ]
      for (const [role, pool] of pools) {
        for (const body of pool) {
          expect(checkLtSpelling(body).unknown, body).toEqual([])
          expect(codes(body, role), body).toEqual([])
        }
      }
      for (const hooks of Object.values(KALEDU_SUBJECT_HOOKS)) {
        for (const hook of hooks) {
          expect(checkLtSpelling(`${hook.title} ${hook.body}`).unknown, hook.title).toEqual([])
        }
      }
    })
  })
})

describe('LT safety — nothing ships unchecked after final QA', () => {
  it('final ship QA re-checks text injected after the native pass and repairs it', () => {
    inChristmas(() => {
      const theme = 'Dovana mamai'
      const slides = [
        { id: 's1', role: 'hook', title: 'Ką padovanoti mamai šiemet?', body: 'Ji sako, kad nieko nereikia. Bet tuščiomis ateiti vis tiek nesinori.', cta: '' },
        { id: 's2', role: 'context', title: '', body: 'Dažnai jaučiamės įsprausti į dovanų stereotipus.', cta: '' },
        { id: 's3', role: 'build', title: '', body: 'Tavo parduotuvėje rasisi originalius variantus.', cta: '' },
        { id: 's4', role: 'close', title: '', body: 'Gerai dovanai nebūtina kainuoti daug. Svarbiau, kam ją renkiesi.', cta: 'Daugiau dovanų idėjų rasi kaledukampelis.com 🎁' },
      ]
      const fb = makeKaleduSlideFallback({ themeHook: theme, themeBody: '', topic: theme, allowed: [] })
      const out = finalKaleduShipQa(slides, { theme, allowed: [] }, fb)
      expect(out.repairs.map((r) => r.slide).sort()).toEqual([2, 3])
      expect(out.remaining).toEqual([])
      expect(out.slides[3].cta).toBe(slides[3].cta)
      expect(out.slides.map((s) => s.role)).toEqual(['hook', 'context', 'build', 'close'])
    })
  })

  it('the model judge cannot overrule a high-confidence typo', async () => {
    await inChristmas(async () => {
      const theme = 'Kalėdinė dovana žmogui iš kito miesto'
      const typo = 'Kai jie jaučiasi vienisi, dovana primena apie tave.'
      const llm: KaleduLlmCall = async (_prompt, o) => {
        if (o.callType === 'final_qa_judge') return '{"bad":[]}'
        return JSON.stringify({ slides: [{ i: 1, title: '', body: typo }] })
      }
      const slides = [
        { id: 's1', role: 'hook', title: 'Kaip nudžiuginti žmogų kitame mieste?', body: 'Kai negali įteikti dovanos pats, ji turi keliauti paštu.' },
        { id: 's2', role: 'context', title: '', body: typo },
        { id: 's3', role: 'close', title: '', body: 'Gerai dovanai nebūtina kainuoti daug. Svarbiau, kam ją renkiesi.' },
      ]
      const out = await rewriteKaleduSlidesNative(slides, {
        theme,
        defaultCta: 'Daugiau dovanų idėjų rasi kaledukampelis.com 🎁',
        seed: 0,
        llm,
        fallbackFor: makeKaleduSlideFallback({ themeHook: theme, themeBody: '', topic: theme, allowed: [] }),
      })
      expect(out.slides[1].body).not.toMatch(/vienisi/)
      expect(out.native.slides[1].shipped).toBe('fallback')
    })
  })
})
