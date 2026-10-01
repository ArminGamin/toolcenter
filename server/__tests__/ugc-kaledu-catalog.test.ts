import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  copyNamesProduct,
  inferUgcThemeKind,
  kaleduBudgetCapCents,
  kaleduModeFromMatch,
  kaleduProductExportIssues,
  kaleduProductSlideVerdict,
  kaleduUngroundedRecommendations,
  loadKaleduCatalog,
  parseKaleduCatalogText,
  pickKaleduProductsForTheme,
  resolveProductAssets,
  classifyKaleduSlideIntent,
  repairKaleduProductConsistency,
  routeKaleduStory,
  catalogProductFilenames,
} from '../ugc-kaledu-catalog.js'
import { kaleduProductLedIssues, repairKaleduProductLed } from '../ugc-story-engine.js'
import { kaleduDeterministicQa, normalizeDirectQuestionPunctuation, repairUgcQuestionAndCollocation } from '../ugc-kaledu-final-qa.js'
import { listKaleduBackgroundRelPaths } from '../ugc-kaledu-bgs.js'

describe('Kalėdų catalog resolver', () => {
  it('reads product-level images after family variant images', () => {
    const catalog = parseKaleduCatalogText(`export const products = [{
      slug: "seimos-kaledinis-megztinis",
      sku: "JK-057",
      name: "Šeimos kalėdinis megztinis",
      tagline: "Derantys kalėdiniai megztiniai šeimai",
      priceCents: 3990,
      variants: [
        { id: "vaikas", images: ["/products/vaiko-megztinis.webp"] },
        { id: "moteris", images: ["/products/moters-megztinis.webp"] },
      ],
      images: ["/products/seimos-megztinis.webp", "/products/seimos-megztinis-detale.webp"],
      recipients: ["seimai"],
      vibes: ["sventinis"],
      inStock: true,
    }]`)
    expect(catalog[0]?.images).toEqual([
      '/products/seimos-megztinis.webp',
      '/products/seimos-megztinis-detale.webp',
    ])
  })

  it('resolves pledas slug to a real product image', () => {
    const assets = resolveProductAssets('vilnonis-pledas-jaukumas')
    const product = loadKaleduCatalog().find((row) => row.slug === 'vilnonis-pledas-jaukumas')
    expect(assets).not.toBeNull()
    expect(assets?.name).toMatch(/pledas/i)
    expect(assets?.image.endsWith(product!.images[0].split('/').pop()!)).toBe(true)
    expect(fs.existsSync(assets!.image)).toBe(true)
    expect(assets?.url).toBe(product?.images[0])
  })

  it('filters budget picks by priceCents cap', () => {
    const cap = kaleduBudgetCapCents('3 dovanos iki 20€')
    expect(cap).toBe(2000)
    const picked = pickKaleduProductsForTheme({
      theme: '3 dovanos iki 20€',
      kind: 'product',
    })
    expect(picked.length).toBeGreaterThan(0)
    expect(picked.length).toBeLessThanOrEqual(3)
    for (const product of picked) {
      expect(product.priceCents).toBeLessThanOrEqual(2000)
    }
    expect(picked.some((p) => p.slug === 'vilnonis-pledas-jaukumas')).toBe(false)
  })

  it('matches pledas copy tokens to the catalog product', () => {
    const pledas = loadKaleduCatalog().find((p) => p.slug === 'vilnonis-pledas-jaukumas')
    expect(pledas).toBeTruthy()
    expect(copyNamesProduct('Vilnonis pledas šiltiems vakarams namuose.', pledas!)).toBe(true)
    expect(copyNamesProduct('Sąrašas ilgėja, o šventė vis arčiau.', pledas!)).toBe(false)
  })

  it('infers generic vs product theme kind', () => {
    expect(inferUgcThemeKind({ theme: '3 klaidos perkant dovaną' })).toBe('generic')
    expect(inferUgcThemeKind({ theme: 'Pledas jaukiai žiemai' })).toBe('product')
  })

  it('does not flag product_on_generic when generic theme slide names a catalog product', () => {
    const issues = kaleduProductExportIssues(
      [
        { role: 'hook', title: '', body: 'Sąrašas ilgėja greičiau nei planuoji.' },
        { role: 'context', title: '', body: 'Tada dovana tampa skuba.' },
        {
          role: 'build',
          title: '',
          body: 'Vilnonis pledas šiltiems vakarams namuose.',
          productId: 'vilnonis-pledas-jaukumas',
        },
        { role: 'close', title: '', body: 'Rinkis ramesnį kelią.' },
      ],
      '3 klaidos perkant dovaną',
      '',
      { hook: 'Kai dovana tampa stresu', body: 'Trys klaidos, kurios kartojasi kasmet.' },
    )
    expect(issues).not.toContain('slide_3:product_on_generic')
  })

  it('still flags product_on_generic when generic slide has productId without product name', () => {
    const issues = kaleduProductExportIssues(
      [
        {
          role: 'build',
          title: '',
          body: 'Tada perki tai, kas po ranka, ir dovana tampa skuba.',
          productId: 'vilnonis-pledas-jaukumas',
        },
      ],
      '3 klaidos perkant dovaną',
    )
    expect(issues).toContain('slide_1:product_on_generic')
  })
})

describe('Kalėdų story mode router', () => {
  const mug = () => loadKaleduCatalog().find((p) => p.sku === 'JK-017' || p.slug === 'kaledinis-puodelis-kakava')
  const pledas = () => loadKaleduCatalog().find((p) => p.sku === 'JK-002' || p.slug === 'vilnonis-pledas-jaukumas')
  const zvak = () =>
    loadKaleduCatalog().find((p) => p.sku === 'JK-001' || p.slug === 'aromaterapijos-zvakide-sventinis-vakaras')

  it('A) coffee theme is PRODUCT_LED with the catalog mug', () => {
    const mugSku = mug()
    expect(mugSku).toBeTruthy()
    expect(resolveProductAssets(mugSku!.slug)).not.toBeNull()
    const routed = routeKaleduStory({ theme: 'Dovana rytinei kavai?' })
    expect(routed.mode).toBe('PRODUCT_LED')
    expect(routed.confidence).toBe('HIGH')
    expect(routed.products.map((p) => p.slug)).toContain(mugSku!.slug)
    expect(routed.products[0].slug).toBe(mugSku!.slug)
    expect(inferUgcThemeKind({ theme: 'Dovana rytinei kavai?' })).toBe('product')
  })

  it('B) HIGH coffee without a mug SKU is not PRODUCT_LED and invents nothing', () => {
    expect(kaleduModeFromMatch({ confidence: 'HIGH', products: [] })).toBe('GENERIC')
    expect(kaleduModeFromMatch({ confidence: 'HIGH', products: [] })).not.toBe('PRODUCT_LED')
  })

  it('C) pledas + žvakė may select both catalog SKUs', () => {
    const routed = routeKaleduStory({ theme: 'Pledas ir žvakė vienam jaukiam vakarui' })
    const slugs = routed.products.map((p) => p.slug)
    expect(slugs).toContain(pledas()!.slug)
    expect(slugs).toContain(zvak()!.slug)
    expect(routed.mode).toBe('PRODUCT_LED')
    expect(routed.products.length).toBeLessThanOrEqual(2)
  })

  it('D) advice theme stays GENERIC with no forced SKU', () => {
    const routed = routeKaleduStory({ theme: 'Kaip neišleisti per daug dovanoms' })
    expect(routed.mode).toBe('GENERIC')
    expect(routed.products).toEqual([])
    expect(inferUgcThemeKind({ theme: 'Kaip neišleisti per daug dovanoms' })).toBe('generic')
    expect(inferUgcThemeKind({ theme: 'Kaip išrinkti dovaną žmogui, kurio beveik nepažįsti?' })).toBe('generic')
  })

  it('E) budget theme only keeps SKUs at or under the cap', () => {
    const cap = kaleduBudgetCapCents('Kalėdinės dovanos iki 20 eurų')
    expect(cap).toBe(2000)
    const picked = pickKaleduProductsForTheme({ theme: 'Kalėdinės dovanos iki 20 eurų' })
    for (const product of picked) {
      expect(product.priceCents).toBeLessThanOrEqual(2000)
    }
  })

  it('F) žvakė picks the candle SKU, not a candle lamp', () => {
    const candle = zvak()
    expect(candle).toBeTruthy()
    expect(candle!.name).toMatch(/žvakė/i)
    const routed = routeKaleduStory({ theme: 'Žvakė Kalėdų vakarui' })
    expect(routed.mode).toBe('PRODUCT_LED')
    expect(routed.products.map((p) => p.slug)).toContain(candle!.slug)
    expect(routed.products.some((p) => p.slug === 'zvakiu-sildymo-lempa')).toBe(false)
    expect(copyNamesProduct('Aromaterapijos žvakė šventiniam vakarui.', candle!)).toBe(true)
  })

  it('G) PRODUCT_LED without a reveal is missing_product_resolution', () => {
    const mugSku = mug()!
    const slides = [
      { id: 's1', role: 'hook', title: 'Be kavos rytas neprasideda?', body: 'Jei manęs paklaustų, pradėčiau nuo puodelio.', cta: '' },
      { id: 's2', role: 'context', title: '', body: 'Jei žmogaus rytas prasideda nuo kavos, tai jau gera užuomina dovanai.', cta: '' },
      { id: 's3', role: 'build', title: '', body: 'Pagalvok, kaip tas žmogus leidžia laisvą vakarą.', cta: '' },
      { id: 's4', role: 'close', title: '', body: 'Jei žmogus tuo naudosis kasdien, dovana tikrai neliks pamiršta.', cta: 'Daugiau dovanų idėjų rasi kaledukampelis.com 🎁' },
    ]
    const mode = routeKaleduStory({ theme: 'Dovana rytinei kavai?' })
    expect(kaleduProductLedIssues(slides, mode).some((i) => i.code === 'missing_product_resolution')).toBe(true)
    const repaired = repairKaleduProductLed(slides, mode, [mugSku])
    expect(kaleduProductLedIssues(repaired.slides, repaired.mode).some((i) => i.code === 'missing_product_resolution')).toBe(
      false,
    )
    const reveal = repaired.slides.find((s) => s.productId)
    expect(reveal?.productId).toMatch(/kaledinis-puodelis-kakava/)
    expect(kaleduProductSlideVerdict(reveal!)).toBe('ok')
    expect(resolveProductAssets(reveal!.productId!)).not.toBeNull()
  })

  it('H) productId without image is product_image_missing', () => {
    const issues = kaleduProductExportIssues(
      [{ role: 'build', title: '', body: 'Puodelis rytinei kavai.', productId: 'nėra-tokio-sku' }],
      'Dovana rytinei kavai?',
    )
    expect(issues.some((row) => row.includes('product_image_missing'))).toBe(true)
    expect(kaleduProductSlideVerdict({ body: 'Puodelis rytinei kavai.', productId: 'nėra-tokio-sku' })).toBe(
      'unknown_product',
    )
  })

  it('I) coffee story that becomes shopping stress is product_theme_drift', () => {
    const mugSku = mug()!
    const slides = [
      { id: 's1', role: 'hook', title: 'Be kavos rytas neprasideda?', body: 'Rytas be kavos sunkiai įsivaizduojamas.', cta: '' },
      {
        id: 's2',
        role: 'context',
        title: '',
        body: 'Kuo ilgiau atidedi dovanų paiešką, tuo sunkiau apsispręsti.',
        cta: '',
      },
      {
        id: 's3',
        role: 'build',
        title: '',
        body: 'Gali rinktis puodelį „Karšta kakava“.',
        productId: mugSku.slug,
        cta: '',
      },
      { id: 's4', role: 'close', title: '', body: 'Jei žmogus tuo naudosis kasdien, dovana tikrai neliks pamiršta.', cta: '' },
    ]
    const mode = routeKaleduStory({ theme: 'Dovana rytinei kavai?' })
    expect(kaleduProductLedIssues(slides, mode).some((i) => i.code === 'product_theme_drift')).toBe(true)
    const repaired = repairKaleduProductLed(slides, mode, [mugSku])
    expect(kaleduProductLedIssues(repaired.slides, repaired.mode).some((i) => i.code === 'product_theme_drift')).toBe(
      false,
    )
    expect(repaired.slides[1].body).toMatch(/kav|ryt|puodel/i)
  })

  it('story-allowed family mentions are not product reveals', () => {
    const blanket = pledas()!
    const candle = zvak()!
    const both = [blanket, candle]
    const codes = (body: string, productId = '') =>
      kaleduDeterministicQa([{ role: 'build', body, productId }], { theme: '', allowed: both }).flatMap((f) => f.codes)
    expect(codes('Pledas ir žvakė padeda sukurti jaukesnį vakarą.')).not.toContain('product_truth')
    expect(codes('Žvakių šviesa vakarą padaro jaukesnį.')).not.toContain('product_truth')
    expect(codes('Gali rinktis vilnonį pledą „Žiemos šiluma“.', blanket.slug)).not.toContain('product_truth')
    expect(kaleduUngroundedRecommendations('Gali rinktis vilnonį pledą „Žiemos šiluma“.', both, '')).not.toEqual([])
    const onlyBlanket = kaleduDeterministicQa(
      [{ role: 'build', body: 'Gali rinktis žvakę.' }],
      { theme: '', allowed: [blanket] },
    ).flatMap((f) => f.details.join(' '))
    expect(onlyBlanket.join(' ')).toMatch(/product_truth/)
    expect(codes('Žvakių šviesa vakarą padaro jaukesnį.', '')).not.toContain('product_truth')
    const ambienceOnlyBlanket = kaleduDeterministicQa(
      [{ role: 'build', body: 'Žvakių šviesa vakarą padaro jaukesnį.' }],
      { theme: '', allowed: [blanket] },
    ).flatMap((f) => f.codes)
    expect(ambienceOnlyBlanket).not.toContain('product_truth')
  })

  it('does not force a product on shopping-pain or weak vibe themes', () => {
    expect(routeKaleduStory({ theme: 'Kalėdinio apsipirkimo chaosas', category: 'Apsipirkimo skausmas' }).mode).toBe(
      'GENERIC',
    )
    expect(routeKaleduStory({ theme: 'Per daug pasirinkimų ir nė vieno sprendimo.' }).products).toEqual([])
    expect(kaleduModeFromMatch({ confidence: 'LOW', products: mug() ? [mug()!] : [] })).toBe('GENERIC')
  })
})

describe('product copy and question punctuation', () => {
  it('rewrites a deictic gift line that has no product', () => {
    const out = repairKaleduProductConsistency(
      {
        body: 'Šita dovana ne tik pradžiugins, bet ir padės pasidairyti Kalėdas šviesesnes.',
        productId: undefined,
      },
      [],
    )
    expect(out.intent).toBe('GENERIC')
    expect(out.slide.body).not.toMatch(/šit/i)
    expect(out.slide.productId).toBeUndefined()
  })

  it('recommendation copy without a productId receives the matching SKU', () => {
    const mugSku = loadKaleduCatalog().find((p) => p.sku === 'JK-017')!
    const out = repairKaleduProductConsistency({ body: 'Gali rinktis puodelį „Karšta kakava“.' }, [mugSku])
    expect(out.intent).toBe('PRODUCT_RECOMMENDATION')
    expect(out.slide.productId).toBe(mugSku.slug)
    expect(resolveProductAssets(out.slide.productId!)).not.toBeNull()
  })

  it('keeps a real mug recommendation with its image', () => {
    const mugSku = loadKaleduCatalog().find((p) => p.sku === 'JK-017')!
    const text = 'Puodelis „Karšta kakava“ tinka žmogui, kuris rytą pradeda kava.'
    expect(classifyKaleduSlideIntent(text)).toBe('PRODUCT_RECOMMENDATION')
    const out = repairKaleduProductConsistency({ body: text, productId: mugSku.slug }, [mugSku])
    expect(out.intent).toBe('PRODUCT_RECOMMENDATION')
    expect(out.slide.productId).toBe(mugSku.slug)
    expect(resolveProductAssets(out.slide.productId!)).not.toBeNull()
  })

  it('treats candle light as a reference, not a required image', () => {
    const candle = loadKaleduCatalog().find((p) => p.sku === 'JK-001')!
    const text = 'Žvakių šviesa padaro vakarą jaukesnį.'
    expect(classifyKaleduSlideIntent(text, [candle])).toBe('PRODUCT_REFERENCE')
    const out = repairKaleduProductConsistency({ body: text }, [candle])
    expect(out.slide.productId).toBeUndefined()
    expect(out.slide.body).toBe(text)
  })

  it('adds a question mark only to direct reader questions', () => {
    expect(normalizeDirectQuestionPunctuation('Nežinai, ką padovanoti.').text).toBe('Nežinai, ką padovanoti?')
    expect(normalizeDirectQuestionPunctuation('Vis dar be dovanos.').text).toBe('Vis dar be dovanos?')
    expect(normalizeDirectQuestionPunctuation('Ieškai dovanos mamai.').text).toBe('Ieškai dovanos mamai?')
    expect(normalizeDirectQuestionPunctuation('Gruodis bėga greičiau nei atrodo.').text).toBe(
      'Gruodis bėga greičiau nei atrodo.',
    )
    expect(normalizeDirectQuestionPunctuation('Šeimos vakaras prie stalo dažnai prisimenamas ilgiau.').text).toBe(
      'Šeimos vakaras prie stalo dažnai prisimenamas ilgiau.',
    )
    expect(normalizeDirectQuestionPunctuation('Kasmet perki kažką panašaus.').text).toBe(
      'Kasmet perki kažką panašaus?',
    )
    expect(normalizeDirectQuestionPunctuation('Kasmet perki kažką panašaus. Šiemet dovana turi būti apgalvota.').text).toBe(
      'Kasmet perki kažką panašaus? Šiemet dovana turi būti apgalvota.',
    )
    expect(normalizeDirectQuestionPunctuation('Vėl renkiesi paskutinę minutę.').text).toBe(
      'Vėl renkiesi paskutinę minutę?',
    )
    expect(normalizeDirectQuestionPunctuation('Dar ieškai dovanos mamai.').text).toBe('Dar ieškai dovanos mamai?')
    expect(normalizeDirectQuestionPunctuation('Vis dar nežinai, ką padovanoti.').text).toBe(
      'Vis dar nežinai, ką padovanoti?',
    )
    expect(normalizeDirectQuestionPunctuation('Šiemet perki dovanas iš anksto.').text).toBe(
      'Šiemet perki dovanas iš anksto.',
    )
    expect(normalizeDirectQuestionPunctuation('Kasmet perki dovanas iš anksto.').text).toBe(
      'Kasmet perki dovanas iš anksto.',
    )
    expect(normalizeDirectQuestionPunctuation('Tu dažnai renkiesi praktiškus daiktus.').text).toBe(
      'Tu dažnai renkiesi praktiškus daiktus.',
    )
    expect(normalizeDirectQuestionPunctuation('Vis dar renkamės dovanas pagal biudžetą.').text).toBe(
      'Vis dar renkamės dovanas pagal biudžetą.',
    )
    expect(normalizeDirectQuestionPunctuation('Reikia dovanos kolegai, kurio beveik nepažįsti.').text).toBe(
      'Reikia dovanos kolegai, kurio beveik nepažįsti?',
    )
    expect(normalizeDirectQuestionPunctuation('Reikia iš anksto suplanuoti biudžetą.').text).toBe(
      'Reikia iš anksto suplanuoti biudžetą.',
    )
    expect(normalizeDirectQuestionPunctuation('Prieš užsakant reikia patikrinti pristatymo laiką.').text).toBe(
      'Prieš užsakant reikia patikrinti pristatymo laiką.',
    )
    expect(normalizeDirectQuestionPunctuation('Dovana turėtų būti praktiška.').text).toBe(
      'Dovana turėtų būti praktiška.',
    )
    expect(normalizeDirectQuestionPunctuation('Namų kvapai padeda sukurti jaukesnę atmosferą.').text).toBe(
      'Namų kvapai padeda sukurti jaukesnę atmosferą.',
    )
    expect(
      repairUgcQuestionAndCollocation(
        'Dovana turėtų pradžiuginti ir sukurti šventinę atmosferą?',
        'close',
      ),
    ).toBe('Nori dovanos, kuri pradžiugintų ir sukurtų šventinę atmosferą?')
    expect(repairUgcQuestionAndCollocation('Kvapų dovana būtent tai padaro.', 'build', '')).toBe(
      'Kvapni dovana tam puikiai tinka.',
    )
    expect(repairUgcQuestionAndCollocation('Kvapų dovana būtent tai padaro.', 'build', 'JK-001 žvakė')).toBe(
      'Kvapni žvakė tam puikiai tinka.',
    )
  })
})

describe('Kalėdų UGC backgrounds', () => {
  it('does not use catalog product filenames as slide backgrounds', () => {
    const bgs = listKaleduBackgroundRelPaths()
    expect(bgs.length).toBeGreaterThan(0)
    const catalog = catalogProductFilenames()
    for (const name of bgs) {
      expect(catalog.has(name.split('/').pop() || '')).toBe(false)
    }
  })
})
