import { describe, expect, it } from 'vitest'
import {
  CHRISTMAS_BUSINESS_PROFILE_ID,
  DEFAULT_BUSINESS_PROFILE_ID,
  runWithBusinessProfile,
} from '../business-profiles.js'
import {
  UGC_BATCH_FAST_SKILL,
  UGC_KALEDU_COPY_SKILL,
  UGC_KALEDU_NATIVE_REWRITE_SYSTEM,
  UGC_LT_COPY_SKILL,
  ugcActiveAngleHints,
  ugcActiveCopySkill,
  ugcActiveOllamaSystemPrompt,
} from '../ugc-copy-skill.js'
import {
  assertShipableLtSlide,
  collectStoryIssues,
  isOffTopicNonFoodLtCopy,
  sanitizeLtCopyFields,
  slidesHaveBrandAnchor,
  slidesHaveFoodAnchor,
} from '../ugc-lt-normalize.js'
import { scanSlideQuality, validateUgcExportPost } from '../ugc-batch-audit.js'
import { buildBatchTemplateCaption } from '../ugc-caption-format.js'
import { sanitizeLtSeasonCopy } from '../ugc-season-context.js'
import {
  repairStoryOrderAndRepeats,
  rewriteKaleduSlidesNative,
  rewriteTavoSlidesNative,
  UGC_KALEDU_FALLBACK_BUILD_BODIES,
  UGC_KALEDU_FALLBACK_CONTEXT_BODIES,
} from '../ugc-story-engine.js'
import { finalizeHookTitle, clipPain, isNaturalArYesNoQuestion } from '../ugc-hook-templates.js'
import {
  applyKaleduNativeRepairs,
  applyKaleduRewrittenFields,
  attachKaleduCloseCta,
  detectKaleduNativeIssues,
  isBadArColonHook,
  isIncompleteArHook,
  repairIncompleteArHook,
  repairKaleduHookTitle,
} from '../ugc-kaledu-native.js'
import { listKaleduCtaBank, pickStoryAwareKaleduCta, withKaleduGiftEmoji, KALEDU_CTA_TAIL } from '../ugc-kaledu-cta.js'
import {
  findNativeSemanticHits,
  findValidWordWrongContext,
  kaleduDeterministicQa,
  repairNativeSemantic,
  repairProductSceneContinuity,
  repairUgcQuestionAndCollocation,
  repairValidWordWrongContext,
  semanticRepairPolicy,
} from '../ugc-kaledu-final-qa.js'
import {
  copyNamesProduct,
  kaleduInventedProductMentions,
  repairInventedProductCopy,
  type KaleduCatalogProduct,
} from '../ugc-kaledu-catalog.js'
import {
  applyWarmPayoffPunctuation,
  classifyPayoffTone,
  extractKaleduEmojis,
  normalizeKaleduEmojiBudget,
} from '../ugc-kaledu-emoji.js'

const DIET_RE = /tavoknyga\.com|mitybos knyga|kalorij|angliavanden|maisto planas/i

describe('Kalėdų UGC copy rebrand', () => {
  it('keeps Tavo diet skills unchanged', () => {
    expect(UGC_LT_COPY_SKILL).toMatch(/tavoknyga\.com/)
    expect(UGC_LT_COPY_SKILL).toMatch(/mitybos knyga/)
    expect(UGC_BATCH_FAST_SKILL).toMatch(/Tavo knyga/)
    runWithBusinessProfile(DEFAULT_BUSINESS_PROFILE_ID, () => {
      expect(ugcActiveCopySkill(UGC_LT_COPY_SKILL)).toBe(UGC_LT_COPY_SKILL)
      expect(ugcActiveOllamaSystemPrompt()).toMatch(/tavoknyga\.com/)
    })
  })

  it('uses Christmas-native skills with no diet DNA', () => {
    runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, () => {
      const skill = ugcActiveCopySkill(UGC_LT_COPY_SKILL)
      const fast = ugcActiveCopySkill(UGC_BATCH_FAST_SKILL)
      const system = ugcActiveOllamaSystemPrompt()
      expect(skill).toContain(UGC_KALEDU_COPY_SKILL.slice(0, 80))
      expect(skill).not.toMatch(DIET_RE)
      expect(fast).not.toMatch(DIET_RE)
      expect(system).not.toMatch(DIET_RE)
      expect(skill).toMatch(/kaledukampelis\.com/)
      expect(skill).toMatch(/natūraliai pasakytų/)
      expect(skill).toMatch(/PRODUCTS_ALLOWED/)
      expect(skill).toMatch(/Kokią naują mintį prideda ši skaidrė/)
      expect(fast).toMatch(/nepasakytų/)
      expect(fast).toMatch(/PRODUCTS_ALLOWED/)
      expect(fast).toMatch(/hook → kontekstas → atsakymas → payoff/)
      expect(system).toMatch(/PATIKRINK TYLIAI/)
      expect(system).not.toMatch(DIET_RE)
      expect(UGC_KALEDU_NATIVE_REWRITE_SYSTEM).toMatch(/semantiškai tinka sakinyje/)
      expect(UGC_KALEDU_NATIVE_REWRITE_SYSTEM).toMatch(/logiškai palyginami dalykai/)
      expect(UGC_KALEDU_NATIVE_REWRITE_SYSTEM).toMatch(/paprastesnę formą/)
      expect(UGC_KALEDU_NATIVE_REWRITE_SYSTEM).toMatch(/žmogaus veiksmas/)
      expect(UGC_KALEDU_NATIVE_REWRITE_SYSTEM).toMatch(/natūraliai pasakytų/)
      expect(UGC_KALEDU_NATIVE_REWRITE_SYSTEM).toMatch(/PRODUCTS_ALLOWED/)
      expect(UGC_KALEDU_NATIVE_REWRITE_SYSTEM).not.toMatch(/Kokią naują mintį prideda ši skaidrė/)
      expect(UGC_KALEDU_NATIVE_REWRITE_SYSTEM).not.toMatch(DIET_RE)
      expect(ugcActiveAngleHints().gift_ideas).toMatch(/dovan/i)
      expect(ugcActiveAngleHints().gift_ideas).not.toMatch(/mityb/i)
      expect(ugcActiveAngleHints().save_money).toBeUndefined()
      expect(ugcActiveAngleHints().quick_meals).toBeUndefined()
    })
  })

  it('keeps Tavo angle hints free of Christmas gift themes', async () => {
    await runWithBusinessProfile(DEFAULT_BUSINESS_PROFILE_ID, async () => {
      expect(ugcActiveAngleHints().quick_meals).toMatch(/vakarien/i)
      expect(ugcActiveAngleHints().gift_ideas).toBeUndefined()
      expect(ugcActiveAngleHints().cozy_home).toBeUndefined()
      expect(JSON.stringify(ugcActiveAngleHints())).not.toMatch(/dovan|kalėd/i)
    })
  })

  it('keeps kalėd copy and gift clothing off the Tavo food gate', () => {
    runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, () => {
      expect(sanitizeLtSeasonCopy('Kalėdinė dovana tėčiui')).toMatch(/Kalėdinė/)
      expect(isOffTopicNonFoodLtCopy('Ar drabužiai tinka kaip Kalėdų dovana?')).toBe(false)
      expect(
        sanitizeLtCopyFields({ title: 'Hook', body: 'Ieškai dovanos.', cta: 'x' }).cta,
      ).toMatch(/kaledukampelis\.com/)
    })
  })

  it('requires a gift anchor instead of meal-planning salvage', () => {
    runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, () => {
      const slides = [
        { role: 'hook', title: 'Vis dar be dovanos?', body: 'Sąrašas ilgėja, o šventė vis arčiau tavęs.' },
        {
          role: 'context',
          title: '',
          body: 'Kai nežinai, kam ieškai, lentynos visos atrodo vienodos.',
        },
        {
          role: 'build',
          title: '',
          body: 'Tada perki tai, kas po ranka, ir dovana tampa skuba.',
        },
        {
          role: 'close',
          title: '',
          body: 'Kai žinai, kam tinka daiktas, pirkimas tampa ramesnis.',
          cta: 'Rask dovaną Kalėdų Kampelyje - kaledukampelis.com 🎁',
        },
      ]
      expect(slidesHaveFoodAnchor(slides)).toBe(false)
      expect(slidesHaveBrandAnchor(slides)).toBe(true)
      const repaired = repairStoryOrderAndRepeats(slides, 'Kalėdinė dovana, kai nežinai, ką pirkti')
      const blob = repaired.map((s) => s.body).join(' ')
      expect(blob).not.toMatch(DIET_RE)
      expect(blob).toMatch(/dovan/i)
      expect(collectStoryIssues(repaired, 'Kalėdinė dovana').filter((i) => i.code === 'brand_drift')).toEqual([])
    })
  })

  it('does not em_dash-fail a 4-slide Christmas post with the canonical close CTA', () => {
    runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, () => {
      const slides = [
        { role: 'hook', title: 'Vis dar be dovanos?', body: 'Sąrašas ilgėja, o šventė vis arčiau tavęs.' },
        {
          role: 'context',
          title: '',
          body: 'Kai nežinai, kam ieškai, lentynos visos atrodo vienodos.',
        },
        {
          role: 'build',
          title: '',
          body: 'Tada perki tai, kas po ranka, ir dovana tampa skuba.',
        },
        {
          role: 'close',
          title: '',
          body: 'Kai žinai, kam tinka daiktas, pirkimas tampa ramesnis.',
          cta: 'Rask dovaną Kalėdų Kampelyje - kaledukampelis.com 🎁',
        },
      ]
      expect(scanSlideQuality(slides, 'Kalėdinė dovana').flatMap((s) => s.issues)).not.toContain(
        'em_dash',
      )
      expect(
        validateUgcExportPost({
          caption: '📌 placeholder',
          meta: { theme: 'Kalėdinė dovana', story_slides: slides },
        }).issues.filter((issue) => issue.includes('em_dash')),
      ).toEqual([])
    })
  })

  it('still strips and flags body em dashes for Christmas and Tavo', () => {
    const body = 'Kai nežinai, kam ieškai — lentynos visos atrodo vienodos.'
    for (const profile of [CHRISTMAS_BUSINESS_PROFILE_ID, DEFAULT_BUSINESS_PROFILE_ID]) {
      runWithBusinessProfile(profile, () => {
        expect(sanitizeLtCopyFields({ title: '', body }).body).not.toMatch(/—|–/)
        expect(
          scanSlideQuality([{ role: 'context', title: '', body }], '').flatMap((s) => s.issues),
        ).toContain('em_dash')
      })
    }
  })

  it('ships Christmas fallback lines', () => {
    runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, () => {
      for (const body of [...UGC_KALEDU_FALLBACK_CONTEXT_BODIES, ...UGC_KALEDU_FALLBACK_BUILD_BODIES]) {
        expect(body).not.toMatch(DIET_RE)
        expect(body).toMatch(/dovan|švent|lentyn|pirk|parduotuv/i)
      }
    })
  })

  it('does not theme_drift Tavo copy on apdovanojimas substrings', () => {
    runWithBusinessProfile(DEFAULT_BUSINESS_PROFILE_ID, () => {
      const issues = collectStoryIssues(
        [
          {
            role: 'hook',
            title: 'Apdovanojimas už kantrybę?',
            body: 'Kartais savaitė baigiasi be aiškaus maisto plano.',
          },
          {
            role: 'context',
            body: 'Vakare vėl sprendi, ką valgyti, nors šaldytuvas pilnas produktų.',
          },
          {
            role: 'build',
            body: 'Aiškus savaitės meniu padeda ramiau rinktis maistą kasdien.',
          },
          {
            role: 'close',
            body: 'Tada žinai, ką gaminsi, dar prieš atidarant šaldytuvą.',
            cta: 'Apsilankyk tavoknyga.com ir pradėk 5 min. testą! 🤩',
          },
        ],
        'apdovanojimas už kantrybę ir rytinį ritmą',
      )
      expect(issues.filter((i) => i.code === 'theme_drift')).toEqual([])
    })
  })

  it('accepts gift-scene stems without literal dovan/kalėd on Christmas theme_drift', () => {
    runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, () => {
      const issues = collectStoryIssues(
        [
          {
            role: 'hook',
            title: 'Ar ką paslėpti po juostele?',
            body: 'Šventinis paštas. Tai visada džiugi staigtybė. Bet ką gi įdėti vidun, kad šypsena būtų dar didesnė?',
          },
          {
            role: 'context',
            body: 'Juostelė jau surišta, o pakuotė vis dar tuščia ir laukia minties.',
          },
          {
            role: 'build',
            body: 'Kai žinai, ką įdėti vidun, staigmena lieka šilta, ne skuba.',
          },
          {
            role: 'close',
            body: 'Tada šventinis paštas tampa ramesniu pasirinkimu.',
            cta: 'Rask dovaną Kalėdų Kampelyje - kaledukampelis.com 🎁',
          },
        ],
        'kalėdinė dovana',
      )
      expect(issues.filter((i) => i.code === 'theme_drift')).toEqual([])
    })
  })

  it('still flags diet leak on Christmas when copy drifts to kalorijos', () => {
    runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, () => {
      const issues = scanSlideQuality(
        [
          {
            role: 'hook',
            title: 'Ar ką paslėpti po juostele?',
            body: 'Šventinis paštas. Tai visada džiugi staigtybė.',
          },
          {
            role: 'context',
            body: 'Skaičiuoji kalorijas, kai ieškai, ką įdėti į pakuotę.',
          },
          {
            role: 'close',
            body: 'Kai žinai, kam tinka daiktas, pirkimas tampa ramesnis.',
            cta: 'Rask dovaną Kalėdų Kampelyje - kaledukampelis.com 🎁',
          },
        ],
        'kalėdinė dovana',
      ).flatMap((s) => s.issues)
      expect(issues).toContain('diet_leak')
    })
  })

  it('does not let juostelė pass Tavo food brand anchor', () => {
    runWithBusinessProfile(DEFAULT_BUSINESS_PROFILE_ID, () => {
      const slides = [
        { role: 'hook', title: 'Juostelė ant stalo?', body: 'Šventinis paštas ir staigmena be aiškaus plano.' },
        { role: 'context', body: 'Pakuotė laukia, o juostelė jau surišta.' },
        { role: 'build', body: 'Įdėti vidun galima bet ką, bet vakaras vis dar neaiškus.' },
        {
          role: 'close',
          body: 'Be plano vakare vėl sprendi iš naujo.',
          cta: 'Apsilankyk tavoknyga.com ir pradėk 5 min. testą! 🤩',
        },
      ]
      expect(slidesHaveFoodAnchor(slides)).toBe(false)
      expect(slidesHaveBrandAnchor(slides)).toBe(false)
    })
  })

  it('flags diet and tavoknyga leaks on Christmas slides', () => {
    runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, () => {
      const issues = scanSlideQuality(
        [
          {
            role: 'hook',
            title: 'Vis dar be dovanos?',
            body: 'Sąrašas ilgėja, o šventė vis arčiau tavęs.',
          },
          {
            role: 'context',
            title: '',
            body: 'Skaičiuoji kalorijas ir tavoknyga.com testą, kai ieškai dovanos.',
          },
          {
            role: 'close',
            title: '',
            body: 'Kai žinai, kam tinka daiktas, pirkimas tampa ramesnis.',
            cta: 'Rask dovaną Kalėdų Kampelyje - kaledukampelis.com 🎁',
          },
        ],
        'Kalėdinė dovana',
      ).flatMap((s) => s.issues)
      expect(issues).toContain('diet_leak')
    })
  })

  it('rejects .lt CTA host on Christmas close slides', () => {
    runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, () => {
      const issues = scanSlideQuality(
        [
          { role: 'hook', title: 'Vis dar be dovanos?', body: 'Sąrašas ilgėja, o šventė vis arčiau tavęs.' },
          { role: 'context', title: '', body: 'Kai nežinai, kam ieškai, lentynos visos atrodo vienodos.' },
          {
            role: 'close',
            title: '',
            body: 'Kai žinai, kam tinka daiktas, pirkimas tampa ramesnis.',
            cta: 'Rask dovaną Kalėdų Kampelyje — kaledukampelis.lt 🎁',
          },
        ],
        'Kalėdinė dovana',
      ).flatMap((s) => s.issues)
      expect(issues).toContain('cta_wrong_host')
    })
  })

  it('recovers Christmas captions without diet ritmas framing', () => {
    runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, () => {
      const out = buildBatchTemplateCaption({
        themeHook: 'x',
        themeBody: 'y',
        slides: [{ role: 'close', body: 'naudoju pastovesnis valgymas' }],
        defaultCta: 'ignored',
        seed: 0,
      })
      expect(out.description).not.toMatch(/savaitės ritmui|pagal savo ritmą|mitybos plan/i)
      expect(out.description).toMatch(/dovan/i)
      expect(out.hook).toMatch(/📌/)
    })
  })
})

describe('Kalėdų native LT detector', () => {
  it('flags repeated root, calque, corporate, unnatural logic, and stiff hooks', () => {
    expect(detectKaleduNativeIssues({ body: 'Jis sušildo vėsių vakarų vakarais.' }).map((i) => i.code)).toContain(
      'repeated_root',
    )
    expect(detectKaleduNativeIssues({ body: 'Sukurkite nepamirštamus momentus kartu.' }).map((i) => i.code)).toContain(
      'calque',
    )
    expect(detectKaleduNativeIssues({ body: 'Tai optimalus pasirinkimas šventei.' }).map((i) => i.code)).toContain(
      'corporate',
    )
    expect(
      detectKaleduNativeIssues({ body: 'Šventinė nuotaika prideda vėsesio kiekvienam vakarui.' }).map((i) => i.code),
    ).toContain('unnatural_logic')
    expect(
      detectKaleduNativeIssues({
        role: 'hook',
        title: 'Ar susiduri su sunkumais rinkdamasis dovaną?',
        body: 'Sąrašas ilgėja kiekvieną vakarą.',
      }).map((i) => i.code),
    ).toContain('stiff_hook')
  })

  it('repairs vėsių vakarų vakarais without a phrase-bank dump', () => {
    expect(applyKaleduNativeRepairs('Jis sušildo vėsių vakarų vakarais.')).toBe('Jis sušildo vėsiais vakarais.')
  })

  it('merges only title and body and reattaches CTA after rewrite', () => {
    runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, () => {
      const slides = [
        {
          id: 's1',
          role: 'build',
          title: '',
          body: 'Pledas tinka vėsiais vakarais.',
          productId: 'pled-vilnonis',
          cta: 'KEEP-ME',
          productPriceLabel: '29,00 €',
        },
        {
          id: 's2',
          role: 'close',
          title: '',
          body: 'Kai dovana jau išrinkta, prieš šventes daug ramiau.',
          productId: undefined,
          cta: '',
        },
      ]
      const merged = applyKaleduRewrittenFields(slides, [
        {
          i: 0,
          title: 'hack-title',
          body: 'hack-body',
        },
      ])
      expect(merged[0].title).toBe('hack-title')
      expect(merged[0].body).toBe('hack-body')
      expect(merged[0].role).toBe('build')
      expect(merged[0].productId).toBe('pled-vilnonis')
      expect(merged[0].cta).toBe('KEEP-ME')
      expect(merged[0].productPriceLabel).toBe('29,00 €')
      const withCta = attachKaleduCloseCta(merged, 'Kalėdinė dovana', 0)
      expect(withCta[0].cta).toBe('')
      expect(withCta[1].cta).toMatch(/kaledukampelis\.com/)
      expect(withCta[1].cta).not.toMatch(/tavoknyga/)
    })
  })

  it('runs Tavo final language QA and attaches CTA on close', async () => {
    const tavoSlides = [
      {
        id: 's1',
        role: 'hook',
        title: 'Be griežtų dietų',
        body: 'Metai iš metų bandei vis kitą dietą.',
      },
      {
        id: 's2',
        role: 'close',
        title: '',
        body: 'Dabar žinai, ką gaminsi, dar prieš atidarant šaldytuvą.',
      },
    ]
    await runWithBusinessProfile(DEFAULT_BUSINESS_PROFILE_ID, async () => {
      const out = await rewriteTavoSlidesNative(tavoSlides, {
        theme: 'mityba',
        defaultCta: 'Apsilankyk tavoknyga.com ir pradėk 5 min. testą! 🤩',
        llm: null,
      })
      expect(out.native.attempted).toBe(false)
      expect(out.slides[0].title).toBe('Be griežtų dietų')
      expect(out.slides[0].cta || '').toBe('')
      expect(out.slides[1].cta).toMatch(/tavoknyga\.com/)
      expect(out.slides.map((s) => `${s.title} ${s.body}`).join(' ')).not.toMatch(/dovan|kalėd/i)
    })
    await runWithBusinessProfile(DEFAULT_BUSINESS_PROFILE_ID, async () => {
      const skipped = await rewriteKaleduSlidesNative(tavoSlides, {
        theme: 'mityba',
        defaultCta: 'Apsilankyk tavoknyga.com ir pradėk 5 min. testą! 🤩',
        llm: null,
      })
      expect(skipped.native.attempted).toBe(false)
      expect(skipped.slides).toEqual(tavoSlides)
    })
    await runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, async () => {
      const slides = [
        { id: 's1', role: 'hook', title: 'Vis dar be dovanos?', body: 'Sąrašas ilgėja, o šventė vis arčiau tavęs.' },
        { id: 's2', role: 'context', title: '', body: 'Kai nežinai, kam ieškai, lentynos visos atrodo vienodos.' },
        { id: 's3', role: 'close', title: '', body: 'Kai žinai, kam tinka daiktas, pirkimas tampa ramesnis.' },
      ]
      const out = await rewriteKaleduSlidesNative(slides, {
        theme: 'Kalėdinė dovana',
        defaultCta: 'Rask dovaną Kalėdų Kampelyje - kaledukampelis.com 🎁',
        seed: 0,
        llm: null,
      })
      expect(out.native.attempted).toBe(false)
      expect(out.slides[0].title).toBe('Vis dar be dovanos?')
      expect(out.slides[2].cta).toMatch(/kaledukampelis\.com/)
      expect(out.slides.map((s) => `${s.title} ${s.body}`).join(' ')).not.toMatch(/tavoknyga|mityb|5 min/i)
    })
  })

  it('adds a gift emoji once to the store CTA', () => {
    const plain = 'Daugiau dovanų idėjų rasi kaledukampelis.com'
    const withGift = 'Daugiau dovanų idėjų rasi kaledukampelis.com 🎁'
    expect(withKaleduGiftEmoji(plain)).toBe(withGift)
    expect(withKaleduGiftEmoji(withGift)).toBe(withGift)
    expect(withGift.endsWith(KALEDU_CTA_TAIL)).toBe(true)
  })

  it('picks a story-aware CTA and keeps the protected tail', () => {
    const chaos = pickStoryAwareKaleduCta({
      theme: 'Kalėdinis chaosas',
      slides: [
        { role: 'hook', title: 'Jau prasideda kalėdinis chaosas?', body: 'Per daug pasirinkimų.' },
        { role: 'close', title: '', body: 'Taip dovaną išrinkti tampa daug paprasčiau.' },
      ],
      seed: 0,
    })
    expect(chaos.intent).toBe('SHOPPING_STRESS')
    expect(chaos.cta.endsWith(KALEDU_CTA_TAIL)).toBe(true)
    expect(chaos.cta).not.toBe('Daugiau dovanų idėjų rasi kaledukampelis.com 🎁')
    expect(chaos.cta).toMatch(/blaškymosi|paiešk|aiškių/)

    const mug = pickStoryAwareKaleduCta({
      theme: 'Dovana rytinei kavai',
      mode: 'PRODUCT_LED',
      products: [{ name: 'Puodelis „Karšta kakava“', sku: 'JK-017', slug: 'kaledinis-puodelis-kakava' }],
      slides: [{ role: 'build', body: 'Puodelis rytinei kavai.', productId: 'kaledinis-puodelis-kakava' }],
      seed: 1,
    })
    expect(mug.intent).toBe('PRODUCT')
    expect(mug.cta.endsWith(KALEDU_CTA_TAIL)).toBe(true)
    expect(mug.cta).not.toMatch(/pled|žvak|termos/i)

    const budget = pickStoryAwareKaleduCta({
      theme: 'Kalėdinė dovana iki 30 eurų',
      slides: [{ role: 'close', body: 'Tinka iki 30 eurų.' }],
      seed: 0,
    })
    expect(budget.intent).toBe('BUDGET')
    expect(budget.cta).toMatch(/iki 30 €/)
    expect(budget.cta).not.toMatch(/iki 20|iki 40/)

    const colleague = pickStoryAwareKaleduCta({
      theme: 'Dovana kolegai',
      slides: [{ role: 'hook', title: 'Ką padovanoti kolegai?' }],
      seed: 0,
    })
    expect(colleague.intent).toBe('RECIPIENT')
    expect(colleague.cta).toMatch(/kolegai/)

    const generic = pickStoryAwareKaleduCta({
      theme: 'Kaip išrinkti dovaną žmogui',
      slides: [{ role: 'close', body: 'Svarbiau, kad dovana tiktų žmogui.' }],
      seed: 0,
    })
    expect(generic.intent).toBe('GENERIC')
    expect(generic.cta).toBe('Daugiau dovanų idėjų rasi kaledukampelis.com 🎁')
  })

  it('adds spoken Christmas CTA bank lines', () => {
    const bank = listKaleduCtaBank().join('\n')
    expect(bank).toMatch(/Daugiau dovanų idėjų rasi kaledukampelis\.com/)
    expect(bank).toMatch(/Užsuk į kaledukampelis\.com/)
    expect(bank).not.toMatch(/tavoknyga/)
  })
})

describe('Kalėdų hook opener sanity', () => {
  const theme = 'Dovana paaugliui'

  it('repairs Ar + clipped topic + wh-question without a global vana swap', () => {
    expect(isBadArColonHook('Ar vana paaugliui: ką gi duoti?')).toBe(true)
    expect(isNaturalArYesNoQuestion('Ar vana paaugliui: ką gi duoti?')).toBe(false)
    expect(
      repairKaleduHookTitle('Ar vana paaugliui: ką gi duoti?', {
        theme,
        body: 'Paaugliui reikia kalėdinės dovanos.',
      }),
    ).toBe('Dovana paaugliui: ką gi duoti?')
    expect(repairKaleduHookTitle('Jis sušildo vėsiais vakarais.')).toBe('Jis sušildo vėsiais vakarais.')
  })

  it('keeps a real Ar yes/no question and a colon topic', () => {
    expect(isNaturalArYesNoQuestion('Ar jau išrinkai dovaną?')).toBe(true)
    expect(repairKaleduHookTitle('Ar jau išrinkai dovaną?', { theme })).toBe('Ar jau išrinkai dovaną?')
    expect(isIncompleteArHook('Ar kalėdinis chaosas?')).toBe(true)
    expect(repairIncompleteArHook('Ar kalėdinis chaosas?')).toBe('Jau prasideda kalėdinis chaosas?')
    expect(repairIncompleteArHook('Ar dovanų stresas?')).toBe('Jau prasideda dovanų stresas?')
    expect(repairIncompleteArHook('Ar paskutinė minutė?')).toBe('Vėl viską palikai paskutinei minutei?')
    expect(isIncompleteArHook('Ar jau išrinkai dovaną?')).toBe(false)
    expect(isIncompleteArHook('Ar žinai, ką padovanoti?')).toBe(false)
    expect(repairKaleduHookTitle('Ar žinai, ką padovanoti?')).toBe('Ar žinai, ką padovanoti?')
    expect(repairKaleduHookTitle('Dovana paaugliui: ką rinktis?', { theme })).toBe(
      'Dovana paaugliui: ką rinktis?',
    )
  })

  it('drops Ar when it does not form a yes/no question', () => {
    expect(isNaturalArYesNoQuestion('Ar dovana paaugliui: ką rinktis?')).toBe(false)
    expect(repairKaleduHookTitle('Ar dovana paaugliui: ką rinktis?', { theme })).toBe(
      'Dovana paaugliui: ką rinktis?',
    )
  })

  it('flags a malformed title token and rewrites only the hook before render', async () => {
    expect(
      detectKaleduNativeIssues(
        {
          role: 'hook',
          title: 'Ar vana paaugliui: ką gi duoti?',
          body: 'Paaugliui sunku išrinkti dovaną.',
        },
        { giftNiche: true },
      ).map((issue) => issue.code),
    ).toEqual(expect.arrayContaining(['bad_ar_colon', 'suspicious_title_token']))
    expect(clipPain('Dovana paaugliui')).toBe('Dovana paaugliui')
    expect(clipPain('kalorijos kasdien').toLocaleLowerCase('lt-LT')).toMatch(/^kalorijos/)
    const titled = finalizeHookTitle('Dovana paaugliui', 'Question', 'Dovana paaugliui', 0)
    expect(titled.toLocaleLowerCase('lt-LT').split(/[^\p{L}0-9]+/u)).not.toContain('vana')
    expect(titled.toLocaleLowerCase('lt-LT')).toContain('dovana')

    await runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, async () => {
      const out = await rewriteKaleduSlidesNative(
        [
          {
            id: 's1',
            role: 'hook',
            title: 'Ar vana paaugliui: ką gi duoti?',
            body: 'Šventė jau arti, o pasirinkimas vis dar stringa.',
            productId: 'pled-vilnonis',
          },
          {
            id: 's2',
            role: 'close',
            title: '',
            body: 'Kai dovana jau išrinkta, prieš šventes daug ramiau.',
          },
        ],
        {
          theme,
          defaultCta: 'Rask dovaną Kalėdų Kampelyje - kaledukampelis.com 🎁',
          seed: 0,
        },
      )
      expect(out.slides[0].title).toBe('Dovana paaugliui: ką gi duoti?')
      expect(out.slides[0].body).toMatch(/Šventė/)
      expect(out.slides[0].role).toBe('hook')
      expect(out.slides[0].productId).toBe('pled-vilnonis')
      expect(out.native.attempted).toBe(false)
    })
  })
})

const PLED_FIXTURE: KaleduCatalogProduct = {
  productId: 'vilnonis-pledas',
  slug: 'vilnonis-pledas',
  sku: 'JK-PLED',
  name: 'Vilnonis pledas',
  tagline: 'Jaukus vakarams',
  priceCents: 2900,
  recipients: ['namams'],
  vibes: ['jaukumas'],
  images: [],
  inStock: true,
}

describe('Kalėdų product truth', () => {
  it('matches inflected forms of an allowed product name', () => {
    for (const text of ['vilnonis pledas', 'vilnonį pledą', 'vilnonio pledo', 'su vilnoniu pledu']) {
      expect(copyNamesProduct(text, PLED_FIXTURE)).toBe(true)
    }
    expect(copyNamesProduct('rankšluosčių komplektas', PLED_FIXTURE)).toBe(false)
  })

  it('flags an uncatalogued product-shaped mention', () => {
    expect(kaleduInventedProductMentions('rankšluosčių komplektas', [PLED_FIXTURE])).toEqual(
      expect.arrayContaining(['rankšluosčių komplektas']),
    )
    expect(kaleduInventedProductMentions('Gali rinktis vilnonį pledą.', [PLED_FIXTURE])).toEqual([])
    expect(kaleduInventedProductMentions('Tai jauki dovana namams.', [PLED_FIXTURE])).toEqual([])
  })

  it('rewrites the whole sentence in the right case', () => {
    const out = repairInventedProductCopy('Gali rinktis puikius rankšluosčių komplektus.', [PLED_FIXTURE])
    expect(out).toMatch(/vilnonį pledą|vilnonis pledas/)
    expect(out).not.toContain('Vilnonis pledas')
    expect(out).not.toMatch(/rankšluos|komplekt/i)
  })

  it('falls back to a generic gift when nothing is allowed', () => {
    const out = repairInventedProductCopy('Gali rinktis puikius rankšluosčių komplektus.', [])
    expect(out).toMatch(/dovan/)
    expect(out).not.toMatch(/rankšluos|komplekt/i)
  })

  it('does not emit the same generic invented-product sentence as an earlier slide', () => {
    const generic = 'Gali rinktis jaukią dovaną, kuri tiktų tam žmogui.'
    const invented = 'Gali rinktis puikius rankšluosčių komplektus.'
    const repaired = repairInventedProductCopy(invented, [], { priorText: generic })
    expect(repaired).toMatch(/dovan/)
    expect(repaired).not.toBe(generic)
    expect(repaired).not.toMatch(/rankšluos|komplekt/i)
    const issues = collectStoryIssues(
      [
        { role: 'context', title: '', body: generic },
        { role: 'build', title: '', body: repaired },
      ],
      'Kalėdinė dovana',
    )
    expect(issues.filter((i) => i.code === 'duplicate_sentence')).toEqual([])
  })

  it('names vilnonį pledą when a pled fixture is allowed instead of the generic', () => {
    const generic = 'Gali rinktis jaukią dovaną, kuri tiktų tam žmogui.'
    const out = repairInventedProductCopy('Gali rinktis puikius rankšluosčių komplektus.', [PLED_FIXTURE], {
      priorText: generic,
    })
    expect(out).toMatch(/vilnonį pledą/)
    expect(out).not.toBe(generic)
  })

  it('repairs the exact relief sentence and the invented joy word', () => {
    expect(applyKaleduNativeRepairs('Kai dovana jau parinkta, šventė jaučiasi lengvesnė.')).toBe(
      'Kai dovana jau išrinkta, prieš šventes daug ramiau.',
    )
    expect(detectKaleduNativeIssues({ body: 'šventės džiugija' }).map((issue) => issue.code)).toContain(
      'unnatural_logic',
    )
    expect(applyKaleduNativeRepairs('šventės džiugija')).toBe('šventės džiaugsmas')
    expect(detectKaleduNativeIssues({ body: 'dovana tampa skuba' }).map((issue) => issue.code)).toContain(
      'unnatural_logic',
    )
  })

  it('keeps productId, price, role, and CTA while replacing only the sentence', async () => {
    await runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, async () => {
      const out = await rewriteKaleduSlidesNative(
        [
          {
            id: 's1',
            role: 'build',
            title: '',
            body: 'Gali rinktis puikius rankšluosčių komplektus.',
            productId: 'vilnonis-pledas',
            productPriceLabel: '29,00 €',
            cta: '',
          },
          {
            id: 's2',
            role: 'close',
            title: '',
            body: 'Kai dovana jau išrinkta, prieš šventes daug ramiau.',
          },
        ],
        {
          theme: 'Jauki dovana',
          defaultCta: 'Rask dovaną Kalėdų Kampelyje - kaledukampelis.com 🎁',
          products: [PLED_FIXTURE],
          seed: 0,
        },
      )
      expect(out.slides[0].body).toMatch(/vilnonį pledą/)
      expect(out.slides[0].productId).toBe('vilnonis-pledas')
      expect(out.slides[0].productPriceLabel).toBe('29,00 €')
      expect(out.slides[0].role).toBe('build')
      expect(out.slides[1].cta).toMatch(/kaledukampelis\.com/)
      expect(out.slides[0].cta).toBe('')
    })
  })
})

describe('Kalėdų emoji relevance budget', () => {
  it('keeps matching stress / thinking / gift emoji', () => {
    runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, () => {
      const out = normalizeKaleduEmojiBudget([
        {
          role: 'hook',
          title: 'Kalėdos jau rytoj, o dovanos dar nėra? 😵‍💫',
          body: 'Laiko lieka vis mažiau.',
          cta: '',
        },
        {
          role: 'build',
          title: '',
          body: 'Dar nežinai, ką rinktis? 🤔',
          cta: '',
        },
        {
          role: 'close',
          title: '',
          body: 'Kai žinai, kam tinka, pirkimas ramesnis.',
          cta: 'Rask dovaną Kalėdų Kampelyje - kaledukampelis.com 🎁',
        },
      ])
      // Cap 0–2: keep hook stress + CTA gift; drop middle thinking.
      expect(out[0].title).toContain('😵‍💫')
      expect(out[1].body).not.toMatch(/\p{Extended_Pictographic}/u)
      expect(out[2].cta).toContain('🎁')
    })
  })

  it('removes mismatched, unapproved, and does not invent emoji', () => {
    runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, () => {
      expect(
        normalizeKaleduEmojiBudget([
          { role: 'build', title: '', body: 'Vilnonis pledas jaukiems vakarams 😵‍💫', cta: '' },
        ])[0].body,
      ).toBe('Vilnonis pledas jaukiems vakarams')

      expect(
        normalizeKaleduEmojiBudget([
          { role: 'hook', title: 'Laiko vis mažiau ❤️', body: 'Dovanos dar laukia.', cta: '' },
        ])[0].title,
      ).toBe('Laiko vis mažiau')

      expect(
        normalizeKaleduEmojiBudget([
          { role: 'hook', title: 'Kalėdos jau rytoj 🪬', body: 'Reikia greičiau rinktis.', cta: '' },
        ])[0].title,
      ).toBe('Kalėdos jau rytoj')

      const bare = normalizeKaleduEmojiBudget([
        { role: 'build', title: '', body: 'Termosas tinka kelionėms ir darbui.', cta: '' },
      ])
      expect(extractKaleduEmojis(bare[0].body)).toEqual([])
    })
  })

  it('reduces three valid emojis to the best two', () => {
    runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, () => {
      const out = normalizeKaleduEmojiBudget([
        {
          role: 'hook',
          title: 'Kalėdos jau rytoj, o dovanos dar nėra? 😵‍💫',
          body: 'Vis atidedi sprendimą.',
          cta: '',
        },
        {
          role: 'build',
          title: '',
          body: 'Dar nežinai, ką rinktis? 🤔',
          cta: '',
        },
        {
          role: 'close',
          title: '',
          body: 'Išsirink ramiai.',
          cta: 'Rask dovaną Kalėdų Kampelyje - kaledukampelis.com 🎁',
        },
      ])
      const all = out.flatMap((s) => [
        ...extractKaleduEmojis(s.title || ''),
        ...extractKaleduEmojis(s.body || ''),
        ...extractKaleduEmojis(s.cta || ''),
      ])
      expect(all).toHaveLength(2)
      expect(all).toContain('😵‍💫')
      expect(all).toContain('🎁')
    })
  })

  it('keeps only the strongest of two adjacent stress emojis', () => {
    runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, () => {
      const out = normalizeKaleduEmojiBudget([
        {
          role: 'hook',
          title: 'Kalėdos jau rytoj, o dovanos dar nėra? 😵‍💫',
          body: 'Laiko lieka mažai.',
          cta: '',
        },
        {
          role: 'context',
          title: '',
          body: 'Laiko vis mažiau 😩',
          cta: '',
        },
      ])
      expect(out[0].title).toContain('😵‍💫')
      expect(out[1].body).not.toMatch(/\p{Extended_Pictographic}/u)
    })
  })

  it('Tavo assertShipableLtSlide still rejects a body emoji', () => {
    runWithBusinessProfile(DEFAULT_BUSINESS_PROFILE_ID, () => {
      expect(() =>
        assertShipableLtSlide({
          body: 'Kiekvieną vakarą sprendi tą patį. Planas tai išsprendžia be streso. 🎁',
          role: 'build',
        }),
      ).toThrow(/emoji/i)
    })
  })

  it('Christmas ship gate allows in-budget matching emoji', () => {
    runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, () => {
      expect(() =>
        assertShipableLtSlide({
          title: 'Kalėdos jau rytoj, o dovanos dar nėra? 😵‍💫',
          body: 'Laiko lieka vis mažiau, o sąrašas vis auga.',
          role: 'hook',
        }),
      ).not.toThrow()
    })
  })
})

describe('valid word, wrong context', () => {
  const codes = (body: string) =>
    kaleduDeterministicQa([{ role: 'build', body }], { theme: '', allowed: [] }).flatMap((flag) => flag.codes)

  const BAD =
    'Ar žinai tą jausmą, kai Kalėdos jau čiaupo? Visada lieka tiek daug nepadaryto?'
  const GOOD = 'Ar žinai tą jausmą, kai Kalėdos jau visai čia pat, o dar tiek daug nepadaryta?'

  it('fails the shipped feeling sentence and rewrites the whole line', () => {
    expect(codes(BAD)).toContain('valid_word_wrong_context')
    const hit = findValidWordWrongContext(BAD)[0]
    expect(hit.original).toBe('Kalėdos jau čiaupo')
    expect(hit.reason).toMatch(/impossible temporal context/)
    expect(hit.repair).toBe('Kalėdos jau visai čia pat')
    const repaired = repairValidWordWrongContext(BAD)
    expect(repaired.text).toBe(GOOD)
    expect(codes(repaired.text)).not.toContain('valid_word_wrong_context')
    expect(findValidWordWrongContext(repaired.text)).toEqual([])
  })

  it('flags Kalėdos jau čiaupo and keeps real čiaupo and proximity lines', () => {
    expect(codes('Kalėdos jau čiaupo.')).toContain('valid_word_wrong_context')
    expect(repairValidWordWrongContext('Kalėdos jau čiaupo.').text).toBe('Kalėdos jau visai čia pat.')
    expect(codes('Kalėdos jau visai čia pat.')).not.toContain('valid_word_wrong_context')
    expect(codes('Vandens čiaupo rankenėlė.')).not.toContain('valid_word_wrong_context')
    expect(codes('Šventės jau visai arti.')).not.toContain('valid_word_wrong_context')
    expect(repairValidWordWrongContext('Vandens čiaupo rankenėlė.').changed).toBe(false)
  })

  it('rewrites laikas blyksta as time passing', () => {
    expect(codes('Laikas blyksta.')).toContain('valid_word_wrong_context')
    expect(repairValidWordWrongContext('Laikas blyksta.').text).toBe('Laikas greitai bėga.')
    expect(codes('Laikas greitai bėga.')).not.toContain('valid_word_wrong_context')
  })

  const semantic = (body: string, productId = '') =>
    findNativeSemanticHits(body, { productId, role: productId ? 'build' : 'close' }).map((hit) => hit.code)

  it('completes sugalvoti when the object is missing', () => {
    const input = 'Ji turi beveik viską, todėl sugalvoti sunku.'
    expect(semantic(input)).toContain('incomplete_complement')
    expect(repairNativeSemantic(input).text).toBe(
      'Ji turi beveik viską, todėl sugalvoti, ką padovanoti, nėra lengva.',
    )
  })

  it('rewrites an evening-versus-object comparison around the candle', () => {
    const input = 'Žvakių vakaras namuose dažnai būna ramesnis už bet kokią dekoraciją.'
    expect(semantic(input, 'JK-001')).toEqual(
      expect.arrayContaining(['semantic_comparison_mismatch', 'weak_product_story_bridge']),
    )
    expect(repairNativeSemantic(input, { productId: 'JK-001', role: 'build' }).text).toBe(
      'Kvapni žvakė gali paprastą vakarą namuose paversti daug jaukesniu.',
    )
  })

  it('rewrites the abstract close into one spoken sentence', () => {
    const input = 'Ramus dovanos pasirinkimas palieka daugiau vakaro. Tada nespėlioji kiekvienoje lentynoje.'
    expect(semantic(input)).toEqual(
      expect.arrayContaining(['awkward_nominalization', 'vague_metaphor', 'translated_sounding_lt']),
    )
    expect(repairNativeSemantic(input, { role: 'close' }).text).toBe(
      'Kai žinai, ko ieškai, dovaną išrinkti daug paprasčiau.',
    )
  })

  it('leaves simple native sentences unchanged', () => {
    for (const line of [
      'Ji turi beveik viską.',
      'Nežinai, ką jai padovanoti?',
      'Kvapni žvakė suteikia namams jaukumo.',
      'Kai žinai, ko ieškai, pasirinkti lengviau.',
      'Ji mėgsta ramius vakarus namuose.',
      'Prieš perkant verta apgalvoti pasirinkimą.',
      'Šis pledas šiltesnis už ploną užklotą.',
    ]) {
      expect(semantic(line, 'JK-001'), line).toEqual([])
      expect(repairNativeSemantic(line, { productId: 'JK-001' }).changed, line).toBe(false)
    }
  })

  it('does not treat a nearby gift verb as the missing object', () => {
    const input = 'Dovaną norisi išrinkti apgalvotai. Ji turi beveik viską, todėl sugalvoti sunku.'
    expect(semantic(input)).toContain('incomplete_complement')
  })

  it('accepts sugalvoti sunku when the previous question already says what', () => {
    const input = 'Nežinai, ką jai padovanoti? Kai žmogus turi beveik viską, sugalvoti sunku.'
    expect(semantic(input)).not.toContain('incomplete_complement')
    expect(repairNativeSemantic(input).changed).toBe(false)
  })

  it('reports later issues instead of stopping after the first passage', () => {
    const input = 'Ramus dovanos pasirinkimas palieka daugiau vakaro. Kalėdos jau čiaupo.'
    const hits = findNativeSemanticHits(input)
    expect(hits.map((hit) => hit.code)).toEqual(
      expect.arrayContaining(['awkward_collocation', 'valid_word_wrong_context']),
    )
    const repaired = repairNativeSemantic(input)
    expect(new Set(repaired.groups.map((group) => group.id)).size).toBe(2)
    expect(repaired.text).toContain('Kai žinai, ko ieškai')
    expect(repaired.text).toContain('Kalėdos jau visai čia pat')
    expect(repaired.recheckResult).toBe('pass')
  })

  it('does not treat ordinary evening phrases as comparisons', () => {
    for (const line of ['Vakaro žvakė.', 'Žvakės šviesa vakare.', 'Jaukus vakaro pledas.', 'Dekoracija vakarui.']) {
      expect(semantic(line), line).not.toContain('semantic_comparison_mismatch')
      expect(repairNativeSemantic(line).changed, line).toBe(false)
    }
  })

  it('lets catalog metadata beat a conflicting product hint', () => {
    const input = 'Žvakių vakaras namuose dažnai būna ramesnis už bet kokią dekoraciją.'
    const candle = repairNativeSemantic(input, {
      productId: 'JK-001',
      productBlob: 'termosas kelionei',
      role: 'build',
    })
    expect(candle.text).toBe('Kvapni žvakė gali paprastą vakarą namuose paversti daug jaukesniu.')
    const thermos = repairNativeSemantic(input, {
      productId: 'JK-011',
      productBlob: 'žvakė jaukus vakaras',
      role: 'build',
    })
    expect(thermos.text).toBe('Paprastas vakaras namuose gali būti daug jaukesnis.')
  })

  it('does not turn a thermos into an evening actor', () => {
    const input = 'Žvakių vakaras namuose dažnai būna ramesnis už bet kokią dekoraciją.'
    const repaired = repairNativeSemantic(input, { productId: 'JK-011', role: 'build' })
    expect(repaired.text).toBe('Paprastas vakaras namuose gali būti daug jaukesnis.')
    expect(repaired.text.toLocaleLowerCase('lt-LT')).not.toContain('termos')
  })

  it('turns a viewer-addressed Norisi line into Nori...?', () => {
    const input = 'Norisi, kad ji primintų šiltus vakarus namuose.'
    const opts = { role: 'context', prior: 'Ieškai jaukios dovanos?' }
    expect(findNativeSemanticHits(input, opts).map((hit) => hit.code)).toContain('statement_shaped_question')
    const repaired = repairNativeSemantic(input, opts)
    expect(repaired.text).toBe('Nori, kad ji primintų šiltus vakarus namuose?')
    expect(repaired.groups[0]?.strategy).toBe('direct_question_person_shift')
    expect(repaired.recheckResult).toBe('pass')
    expect(repairNativeSemantic('Kartais norisi, kad namuose būtų jaukiau.', opts).changed).toBe(false)
    expect(
      repairNativeSemantic('Norisi, kad dovana būtų praktiška.', { role: 'build', prior: 'Ieškai jaukios dovanos?' }).changed,
    ).toBe(false)
  })

  it('marks a warm payoff with ! and one emoji, and leaves calm lines alone', () => {
    const main = applyWarmPayoffPunctuation([
      {
        role: 'build',
        body: 'Pagalvok, kaip tas žmogus leidžia laisvą vakarą. Iš to dažnai ir gimsta geriausia dovanos idėja.',
      },
    ])
    expect(main.slides[0]?.body).toBe(
      'Pagalvok, kaip tas žmogus leidžia laisvą vakarą. Iš to dažnai ir gimsta geriausia dovanos idėja! ❤️',
    )
    expect(main.slides[0]?.body).not.toMatch(/vakarą!/)
    const reveal = applyWarmPayoffPunctuation([
      { role: 'build', body: 'Ir štai dovanos idėja jau beveik aiški.' },
    ])
    expect(reveal.slides[0]?.body).toBe('Ir štai dovanos idėja jau beveik aiški! ✨')
    const emotional = applyWarmPayoffPunctuation([
      { role: 'context', body: 'Kartais būtent tokios smulkmenos pradžiugina labiausiai.' },
    ])
    expect(emotional.slides[0]?.body).toBe('Kartais būtent tokios smulkmenos pradžiugina labiausiai! ❤️')
    for (const body of [
      'Kai žinai, ko ieškai, dovaną išrinkti daug paprasčiau.',
      'Ji mėgsta ramius vakarus namuose.',
      'Termosas tinka kelionėms ir ilgesnėms dienoms.',
    ]) {
      expect(classifyPayoffTone(body)).toBe('NEUTRAL')
      expect(applyWarmPayoffPunctuation([{ role: 'build', body }]).slides[0]?.body).toBe(body)
    }
    const both = applyWarmPayoffPunctuation([
      { role: 'context', body: 'Iš to dažnai ir gimsta geriausia dovanos idėja.' },
      { role: 'build', body: 'Ir štai dovanos idėja jau beveik aiški.' },
    ])
    expect(both.slides[0]?.body).toBe('Iš to dažnai ir gimsta geriausia dovanos idėja!')
    expect(both.slides[1]?.body).toBe('Ir štai dovanos idėja jau beveik aiški! ✨')
    const cta = 'Rask daugiau idėjų – kaledukampelis.com 🎁'
    const close = applyWarmPayoffPunctuation([
      {
        role: 'close',
        body: `Iš to dažnai ir gimsta geriausia dovanos idėja. ${cta}`,
        cta,
      },
    ])
    expect(close.slides[0]?.cta).toBe(cta)
    expect(close.slides[0]?.body).toBe(`Iš to dažnai ir gimsta geriausia dovanos idėja! ❤️ ${cta}`)
    expect(close.slides[0]?.body).not.toMatch(/🎁\s*(?:❤️|✨|😍)/u)
    expect(close.slides[0]?.cta).not.toMatch(/🎁\s*(?:❤️|✨)/u)
  })

  it('rejects noun-shaped jauti kaip and declarative gift statements', () => {
    const nonsense = 'Jauti kaip Kalėdinio elfo susisiekimo chaosą?'
    expect(kaleduDeterministicQa([{ role: 'hook', body: nonsense }], { theme: '', allowed: [] }).flatMap((flag) => flag.codes)).toContain(
      'valid_word_wrong_context',
    )
    expect(repairUgcQuestionAndCollocation('Dovana nebūtinai turi būti brangi?', 'build')).toBe(
      'Dovana nebūtinai turi būti brangi.',
    )
    expect(repairProductSceneContinuity('Termosas pravers virtuvėje.', 'Termosas kelionėms žiemą').text).toBe(
      'Termosas pravers kelionėje.',
    )
    expect(repairProductSceneContinuity('Puodelis stovi virtuvėje.', 'Dovana rytinei kavai').changed).toBe(false)
  })

  it('follows the repair policy table', () => {
    expect(semanticRepairPolicy({ code: 'semantic_comparison_mismatch', confidence: 'HIGH' })).toBe('deterministic')
    expect(semanticRepairPolicy({ code: 'incomplete_complement', confidence: 'MEDIUM' })).toBe('deterministic')
    expect(semanticRepairPolicy({ code: 'translated_sounding_lt', confidence: 'MEDIUM' })).toBe('native_qa')
    expect(semanticRepairPolicy({ code: 'translated_sounding_lt', confidence: 'NOTE' })).toBe('audit_only')
  })
})
