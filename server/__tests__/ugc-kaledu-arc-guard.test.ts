import { describe, expect, it } from 'vitest'
import { CHRISTMAS_BUSINESS_PROFILE_ID, runWithBusinessProfile } from '../business-profiles.js'
import { loadKaleduCatalog } from '../ugc-kaledu-catalog.js'
import { resolveProductVisuals } from '../ugc-kaledu-visuals.js'
import { findVlkkCalques } from '../ugc-kaledu-final-qa.js'
import { topUpKaleduEmoji } from '../ugc-kaledu-emoji.js'
import { collapseStackedPunctuation } from '../ugc-lt/normalize-copy.js'
import { detectKaleduRecipient, personalizeForRecipient } from '../ugc-lt/recipient.js'
import { collectKaleduArcIssues, kaleduPainRestartMatch } from '../ugc-story/arc-guard.js'
import { enforceProductSlideContract } from '../ugc-story/kaledu-gates.js'

const inChristmas = <T>(fn: () => T) => runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, fn)

const slide = (role: string, body: string, title = '', productId?: string) => ({ id: role, role, title, body, productId })

describe('Kalėdų arc guard', () => {
  it('flags a later slide that restarts the hook with a new question', () => {
    const issues = collectKaleduArcIssues([
      slide('hook', 'Nenori didelės dovanos?', 'Ką padovanoti?'),
      slide('context', 'Dovanos pasirinkimas dažnai tampa ilgu ratu.'),
      slide('build', 'Pagalvok, ką žmogus mėgsta.'),
      slide('build', 'Dovanos sąrašas vis ilgėja? Žinai tą jausmą?'),
      slide('close', 'Net maža dovana gali pradžiuginti.'),
    ])
    expect(issues.map((i) => [i.slide, i.code])).toContainEqual([4, 'late_question'])
  })

  it('flags a slide that restates the problem after the product reveal', () => {
    const issues = collectKaleduArcIssues([
      slide('hook', 'Idėjų daug.', 'Nežinai, ką padovanoti?'),
      slide('context', 'Liko vos pora dienų.'),
      slide('build', 'Gali rinktis sniego gaublį „Žiemos pasaka“.'),
      slide('build', 'Štai, vėl tas jausmas. Dovanas pirkti galėtum anksčiau.'),
      slide('close', 'Kai žinai, ko ieškai, dovaną išrinkti paprasčiau.'),
    ])
    expect(issues.map((i) => [i.slide, i.code])).toContainEqual([4, 'arc_restart'])
  })

  it('flags recipient drift and a missing recipient', () => {
    const ornaments = collectKaleduArcIssues(
      [slide('hook', 'Kasmet tas pats.', 'Ką padovanoti mamai?'), slide('context', 'x y z.'), slide('close', 'Gera dovana.')],
      'Stikliniai eglutės žaisliukai „Šventinis spindesys“',
    )
    expect(ornaments[0]).toMatchObject({ slide: 1, code: 'recipient_drift' })
    const sister = collectKaleduArcIssues(
      [slide('hook', 'Sąrašas ilgėja.', 'Vis dar be dovanos?'), slide('context', 'x y z.'), slide('close', 'Gera dovana.')],
      'Dovana seseriai jaukiai žiemai.',
    )
    expect(sister[0]).toMatchObject({ slide: 1, code: 'recipient_missing' })
  })

  it('treats a negated pain word as the payoff, not a restart (batch30 post-06)', () => {
    const issues = collectKaleduArcIssues([
      slide('hook', 'Kasmet perki naujų, o po švenčių jos vėl atsiduria dėžėje.', 'Dekoracijos, kurios nepabosta?'),
      slide('context', 'Kasmet dėžė su blizgučiais vis pilnėja.'),
      slide('build', 'Užtenka kelių gerai parinktų akcentų, o ne chaoso.'),
      slide('build', 'Švenčių laukti be streso daug smagiau.'),
      slide('close', 'Tokie akcentai džiugins ir kitais metais.'),
    ])
    expect(issues.filter((i) => i.code === 'arc_restart')).toEqual([])
    expect(kaleduPainRestartMatch('Vėl tas jausmas, kai chaosas namuose.')).toBeTruthy()
  })

  it('lets a new colleague count as the theme’s new acquaintance (batch30 post-10)', () => {
    const issues = collectKaleduArcIssues(
      [
        slide('hook', 'Per asmeniška dovana gali sutrikdyti.', 'Ką padovanoti naujam kolegai?'),
        slide('context', 'Žmogų pažįsti neseniai, todėl sunku nuspręsti.'),
        slide('close', 'Neutrali dovana nesukels nepatogumo.'),
      ],
      'Kalėdinė dovana naujam pažįstamam žmogui.',
    )
    expect(issues.filter((i) => i.code === 'recipient_drift' || i.code === 'recipient_missing')).toEqual([])
    const mama = collectKaleduArcIssues(
      [slide('hook', 'Ji sako, kad nieko nereikia.', 'Ką padovanoti mamai?'), slide('context', 'x y z.'), slide('close', 'Gera dovana.')],
      'Kalėdinė dovana naujam pažįstamam žmogui.',
    )
    expect(mama[0]).toMatchObject({ slide: 1, code: 'recipient_drift' })
  })

  it('does not read „pora dienų“ as a couple', () => {
    expect(detectKaleduRecipient('Liko vos pora dienų iki švenčių')).toBeNull()
    expect(detectKaleduRecipient('Dovana porai')?.key).toBe('pora')
  })
})

describe('recipient-personalised fallback lines', () => {
  it('keeps the post subject and agreement', () => {
    const sesuo = detectKaleduRecipient('Dovana seseriai jaukiai žiemai.')!
    expect(personalizeForRecipient('Pagalvok, kaip tas žmogus leidžia laisvą vakarą.', sesuo)).toBe(
      'Pagalvok, kaip sesuo leidžia laisvą vakarą.',
    )
    expect(
      personalizeForRecipient('Kartais geriausia dovana yra tai, ko žmogus pats sau nenupirktų. Tokią smulkmeną jis prisimins ilgiau.', sesuo),
    ).toBe('Kartais geriausia dovana yra tai, ko sesuo pati sau nenupirktų. Tokią smulkmeną ji prisimins ilgiau.')
    expect(personalizeForRecipient('Užtenka tokios, kuri tiktų būtent tam žmogui.', sesuo)).toBe('Užtenka tokios, kuri tiktų būtent seseriai.')
    expect(personalizeForRecipient('Viena apgalvota dovana geriau už dešimt skubotų krepšelių.', sesuo)).toBeNull()
  })
})

describe('product slide contract', () => {
  it('adds a reason to a bare reveal and strips productId from copy that never names it', () =>
    inChristmas(() => {
      const termos = loadKaleduCatalog().find((p) => p.slug === 'termosas-kelionemis-500ml')!
      const game = loadKaleduCatalog().find((p) => p.slug === 'vaiku-kaledinis-zaidimas')!
      const { slides } = enforceProductSlideContract(
        [
          slide('hook', 'Mažylis negali nusėdėti.', 'Kalėdos arti', game.slug),
          slide('context', 'Kelyje praleidi daug laiko.'),
          slide('build', 'Gali rinktis termosą „Žiemos kelionė“.', '', termos.slug),
          slide('close', 'Gera dovana.'),
        ],
        [termos, game],
      )
      expect(slides[0].productId).toBeUndefined()
      expect(slides[2].body).toMatch(/^Gali rinktis termosą „Žiemos kelionė“\. \S/)
    }))
})

describe('product photos', () => {
  it('never offers the back of a product when a front shot exists', () =>
    inChristmas(() => {
      const visuals = resolveProductVisuals('nuotrauku-remelis-akimirka')
      if (!visuals.length) return // product photos live outside the repo
      expect(visuals.some((v) => /nugara/.test(v.src))).toBe(false)
    }))
})

describe('punctuation', () => {
  it('collapses stacked terminal marks', () => {
    expect(collapseStackedPunctuation('dovanos, dekoracijos, svečiai.? Viskas')).toBe('dovanos, dekoracijos, svečiai? Viskas')
  })
})

describe('VLKK reference rules', () => {
  it('flags the calques and government errors the reference marks as errors', () => {
    expect(findVlkkCalques('Kalba eina apie dovanos pasirinkimą.')).toHaveLength(1)
    expect(findVlkkCalques('Vardan patogumo pakeitėme dizainą.')).toHaveLength(1)
    expect(findVlkkCalques('Dovana atitinka reikalavimams.')).toHaveLength(1)
    expect(findVlkkCalques('Dovana atitinka reikalavimus.')).toEqual([])
    expect(findVlkkCalques('Kalbama apie dovanos pasirinkimą.')).toEqual([])
  })
})

describe('emoji budget', () => {
  it('tops a post up to about two matching Apple emojis', () =>
    inChristmas(() => {
      const out = topUpKaleduEmoji([
        slide('hook', 'Laiko vis mažiau, o dovanos dar nėra.', 'Kalėdos jau rytoj?'),
        slide('build', 'Pagalvok, ką žmogus mėgsta.'),
        { ...slide('close', 'Vilnonis pledas jaukiems vakarams.'), cta: 'Rask dovaną – kaledukampelis.com 🎁' },
      ])
      const all = out.map((s) => `${s.title} ${s.body} ${'cta' in s ? s.cta : ''}`).join(' ')
      expect((all.match(/\p{Extended_Pictographic}/gu) || []).length).toBe(2)
    }))
})
