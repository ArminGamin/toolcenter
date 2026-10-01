import { describe, expect, it } from 'vitest'
import {
  applyEmphaticPayoffPunctuation,
  classifyCardPunctuation,
  findOrphanComparisons,
  isRhetoricalContinuation,
} from '../ugc-kaledu-card-leaks.js'
import { checkProductVisual } from '../ugc-kaledu-visuals.js'
import {
  applyReservedProductResolution,
  buildKaleduProductContract,
  loadKaleduCatalog,
  nextBuildForProductDebt,
  planRequiredProductSlots,
  productResolutionPromptLines,
} from '../ugc-kaledu-catalog.js'
import { findRegisterErrors } from '../ugc-kaledu-final-qa.js'

describe('narrow card leaks', () => {
  it('keeps a statement body under a question title', () => {
    const card = classifyCardPunctuation({
      title: 'Gera dovana už nedidelę sumą?',
      body: 'Biudžetas ribotas, bet dovana vis tiek turi atrodyti apgalvota.',
    })
    expect(card.title).toBe('Gera dovana už nedidelę sumą?')
    expect(card.kind).toBe('statement')
    expect(card.body).toBe('Biudžetas ribotas, bet dovana vis tiek turi atrodyti apgalvota.')
    const advice = classifyCardPunctuation({
      title: 'Nežinai, ką padovanoti?',
      body: 'Pradėk nuo žmogaus, ne nuo daikto.',
    })
    expect(advice.title).toBe('Nežinai, ką padovanoti?')
    expect(advice.kind).toBe('statement')
    expect(advice.body).toBe('Pradėk nuo žmogaus, ne nuo daikto.')
    expect(isRhetoricalContinuation('Nežinai, ką padovanoti?', 'Pradėk nuo žmogaus, ne nuo daikto.')).toBe(false)
  })

  it('adds ? when the body continues the rhetorical question', () => {
    const card = classifyCardPunctuation({
      title: 'Nežinai, ką padovanoti?',
      body: 'Idėjų daug, bet nė viena netinka iki galo.',
    })
    expect(card.title).toBe('Nežinai, ką padovanoti?')
    expect(card.kind).toBe('rhetorical_continuation')
    expect(card.body).toBe('Idėjų daug, bet nė viena netinka iki galo?')
  })

  it('merges an orphan comparison and leaves real Kaip sentences alone', () => {
    const broken = 'Todėl dovana turėtų būti su šiluma. Kaip apkabinimas?'
    expect(findOrphanComparisons(broken)[0]).toMatchObject({
      reason: 'orphan_comparison_fragment',
      original: 'Kaip apkabinimas?',
      mergeWithPrevious: true,
    })
    expect(classifyCardPunctuation({ body: broken }).body).toBe('Todėl dovana turėtų būti su šiluma, kaip apkabinimas.')
    expect(classifyCardPunctuation({ body: 'Kaip išrinkti dovaną žmogui, kuris viską turi?' }).changed).toBe(false)
    expect(classifyCardPunctuation({ body: 'Kaip ir kasmet, verta dovanas suplanuoti anksčiau.' }).changed).toBe(false)
  })

  it('repairs a dangling jei-clause before the payoff exclamation', () => {
    const card = classifyCardPunctuation({
      title: 'Pamiršai apie Slaptąjį Senelį?',
      body: 'Dabar atrasi puikius variantus, net jei skubiai.',
    })
    expect(card.title).toBe('Pamiršai apie Slaptąjį Senelį?')
    expect(card.body).toBe('Dabar rasi puikių variantų, net jei skubi.')
    const payoff = applyEmphaticPayoffPunctuation([{ role: 'close', body: card.body }])
    expect(payoff.slides[0].body).toBe('Dabar rasi puikių variantų, net jei skubi!')
    expect(classifyCardPunctuation({ body: 'Jei skubiai reikia dovanos, dar yra keli geri variantai.' }).body).toBe(
      'Jei skubiai reikia dovanos, dar yra keli geri variantai.',
    )
    expect(applyEmphaticPayoffPunctuation([{ role: 'close', body: 'Dabar rasi puikių variantų, net jei skubi!' }]).slides[0].body).toBe(
      'Dabar rasi puikių variantų, net jei skubi!',
    )
    expect(applyEmphaticPayoffPunctuation([{ role: 'build', body: 'Dabar rasi puikių variantų, net jei skubi.' }]).slides[0].body).toBe(
      'Dabar rasi puikių variantų, net jei skubi!',
    )
    expect(applyEmphaticPayoffPunctuation([{ role: 'build', body: 'Jei skubi, pradėk nuo aiškaus biudžeto.' }]).slides[0].body).toBe(
      'Jei skubi, pradėk nuo aiškaus biudžeto.',
    )
  })

  it('uses ! only for an emphatic close', () => {
    const emphatic = applyEmphaticPayoffPunctuation([
      { role: 'build', body: 'Toks pasirinkimas prisimenamas ilgiau.' },
      { role: 'close', body: 'Toks pasirinkimas prisimenamas ilgiau.' },
    ])
    expect(emphatic.slides[0].body).toBe('Toks pasirinkimas prisimenamas ilgiau.')
    expect(emphatic.slides[1].body).toBe('Toks pasirinkimas prisimenamas ilgiau!')
    const neutral = applyEmphaticPayoffPunctuation([
      { role: 'payoff', body: 'Taip dovaną išrinkti tampa paprasčiau.' },
    ])
    expect(neutral.slides[0].body).toBe('Taip dovaną išrinkti tampa paprasčiau.')
    expect(neutral.repairs).toBe(0)
  })
})

describe('product visual invariant', () => {
  it('requires the selected image when visualReady is true', () => {
    const ok = checkProductVisual({
      slideRole: 'product',
      productId: 'VALID_PRODUCT',
      visualReady: true,
      productFound: true,
      imageSrc: '/products/VALID_PRODUCT.png',
      rendered: true,
      bounds: { w: 200, h: 200 },
      copyProductId: 'VALID_PRODUCT',
      visualProductId: 'VALID_PRODUCT',
    })
    expect(ok.rendered).toBe(true)
    expect(ok.reason).toBeUndefined()
  })

  it('fails when a ready product is not drawn', () => {
    const missing = checkProductVisual({
      slideRole: 'product',
      productId: 'VALID_PRODUCT',
      visualReady: true,
      productFound: true,
      imageSrc: '/products/VALID_PRODUCT.png',
      rendered: false,
      copyProductId: 'VALID_PRODUCT',
      visualProductId: 'VALID_PRODUCT',
    })
    expect(missing.reason).toBe('product_visual_missing')
    expect(missing.cause).toBe('renderer_did_not_draw_product')
  })

  it('does not force an image when visualReady is false', () => {
    const skipped = checkProductVisual({
      slideRole: 'product',
      productId: 'VALID_PRODUCT',
      visualReady: false,
      imageSrc: null,
      rendered: false,
    })
    expect(skipped.expected).toBe(false)
    expect(skipped.reason).toBeUndefined()
  })

  it('reserves a build slide and carries product debt forward', () => {
    expect(planRequiredProductSlots(5, ['JK-011']).map((slot) => slot.index)).toEqual([2])
    expect(planRequiredProductSlots(6, ['JK-001', 'JK-002']).map((slot) => slot.index)).toEqual([2, 3])
    expect(nextBuildForProductDebt(['hook', 'context', 'build', 'build', 'close'], 2)).toBe(3)
    expect(nextBuildForProductDebt(['hook', 'build', 'close'], 1)).toBe(null)
  })

  it('keeps product debt when the reserved slide never names the product', () => {
    const product = loadKaleduCatalog().find((row) => row.sku === 'JK-011' || row.slug === 'JK-011')
    expect(product).toBeTruthy()
    const contract = buildKaleduProductContract(
      { mode: 'PRODUCT_LED', reason: 'explicit_product', confidence: 'HIGH', intent: null, products: [product!] },
      5,
    )
    expect(contract.requiredProductIds).toEqual([product!.slug])
    expect(contract.productResolutionPlan.map((slot) => slot.index)).toEqual([2])
    const generic = applyReservedProductResolution(
      [{ role: 'build', title: '', body: 'Pagalvok, ką žmogus mėgsta.' }],
      2,
      contract.productResolutionPlan,
      [product!],
      [],
    )
    expect(generic.slides[0].productId).toBeUndefined()
    expect(generic.debt).toContain(product!.slug)
    const named = applyReservedProductResolution(
      [{ role: 'build', title: '', body: `${product!.name} pravers kelionėje.` }],
      2,
      contract.productResolutionPlan,
      [product!],
      generic.debt,
    )
    expect(named.slides[0].productId).toBe(product!.slug)
    expect(named.debt).not.toContain(product!.slug)
    expect(
      productResolutionPromptLines({
        slideStart: 4,
        roles: ['build', 'close'],
        slots: [],
        debt: [product!.slug],
        products: [product!],
      }),
    ).toContain(`productId=${product!.slug}`)
  })

  it('rejects a rewrite that switches into mūsų', () => {
    expect(findRegisterErrors('Mūsų pasiūlymai padės išrinkti dovaną.').length).toBeGreaterThan(0)
    expect(findRegisterErrors('Tau bus lengviau išrinkti dovaną.')).toEqual([])
  })
})
