import { describe, expect, it } from 'vitest'
import {
  collectSlideIssues,
  collectStoryIssues,
  isBuildCloseEcho,
  isGibberishLtCopy,
  isOffTopicNonFoodLtCopy,
  isShipableLtSlide,
  normalizeLtUgcMultiline,
  UGC_SOLUTION_PITCH_RE,
} from '../ugc-lt-normalize.js'
import { ensureHookQuestionMark, isInterrogativeHookTitle, stripTitleEchoFromBody } from '../ugc-hook-templates.js'
import {
  getUgcSeasonContext,
  hasWrongUgcSeasonReference,
  sanitizeLtSeasonCopy,
} from '../ugc-season-context.js'
import {
  buildFallbackCloseBody,
  collectParaphraseSlideIssues,
  ensureHookBodyQuestions,
  isDuplicateSlideCopy,
  isParaphraseSlideCopy,
  isSeasonFillerRepeat,
  repairSugarSatietyContrast,
  repairStoryOrderAndRepeats,
  stripSeasonFiller,
} from '../ugc-story-engine.js'
import { buildBatchTemplateCaption, formatBatchDiscordCaption } from '../ugc-caption-format.js'
import { captionSlideDumpScore } from '../ugc-lt-classes.js'
import { validateUgcExportPost } from '../ugc-batch-audit.js'

const AUGUST = new Date(2026, 7, 7)

describe('Aug-7 tracked batch season fortress', () => {
  it.each(['rugsėjis', 'Rugsėjo rutina', 'ruošiesi rudeniui', 'planuoji rudenį', 'spalio planas'])(
    'blocks non-August reference: %s',
    (text) => {
      expect(hasWrongUgcSeasonReference(text, AUGUST)).toBe(true)
    },
  )

  it('keeps the August prompt and sanitizer in the current month', () => {
    // Non-seasonal themes must not get any month vocabulary in the prompt.
    expect(getUgcSeasonContext(AUGUST, 'vakarienės planavimas')).toMatch(
      /Nerašyk apie mėnesius/i,
    )
    // Seasonal themes may name the month once and still block autumn.
    const seasonal = getUgcSeasonContext(AUGUST, 'vasaros karštis ir mityba')
    expect(seasonal).toContain('rugpjūtis')
    expect(seasonal).toMatch(/rugsėj/)
    const sanitized = sanitizeLtSeasonCopy(
      'Rugsėjo rutina artėja, todėl ruošiesi rudeniui.',
      AUGUST,
    )
    expect(sanitized).toContain('Rugpjūčio')
    expect(hasWrongUgcSeasonReference(sanitized, AUGUST)).toBe(false)
  })

  it('caps seasonal filler across a post and strips weather clauses', () => {
    expect(isSeasonFillerRepeat('Po sunkaus rugpjūčio karščio jauti nuovargį.', [], false)).toBe(
      true,
    )
    expect(isSeasonFillerRepeat('Vasaros ritmas keičia įpročius.', [], true)).toBe(false)
    expect(
      isSeasonFillerRepeat('Vasaros ritmas keičia įpročius.', ['Rugpjūčio karštis vargina.'], true),
    ).toBe(true)
    expect(
      stripSeasonFiller('Po sunkaus rugpjūčio karščio sporto salėje, ruošti maistą tampa našta.'),
    ).toBe('Ruošti maistą tampa našta.')
  })
})

describe('Aug-7 tracked batch LT defects', () => {
  it.each([
    ['Jaučiu, kad vasaros lengvumas pranyksta.', /jaučiu/iu],
    ['Ar prisimeni pirmą kartą užsisakiau maisto rinkinį?', /užsisakiau/iu],
    ['Supranti ką dedamas į savo maistą.', /dedamas/iu],
    ['Tu gali ruošti skanus maistas.', /skanus maistas/iu],
    ['Sprendimas buvo greitais ir patogiais.', /greitais ir patogiais/iu],
    ['Rugpjūčio karštį jaučiame iki galo.', /jaučiame/iu],
    ['Siekdami tikslus dažnai susiduri su iššūkiais.', /siekdami|tikslus/iu],
    ['Nustokit gaišti laiką.', /nustokit/iu],
    ['Galbūt esi įpratęs(-usi) taip daryti.', /įpratęs\s*\(\s*-\s*usi\s*\)/iu],
  ])('repairs tracked quote: %s', (raw, forbidden) => {
    expect(normalizeLtUgcMultiline(raw)).not.toMatch(forbidden)
  })

  it('reports the raw first-person hook and gender hedge', () => {
    expect(
      collectSlideIssues({
        role: 'hook',
        title: 'Ar prisimeni pirmą kartą užsisakiau maisto rinkinį?',
        body: 'Jaučiu, kad tai buvo patogu.',
      }).map((issue) => issue.code),
    ).toContain('first_person_hook')
    expect(
      collectSlideIssues({
        role: 'build',
        body: 'Galbūt esi įpratęs(-usi) daryti taip, kaip visuomet.',
      }).map((issue) => issue.code),
    ).toContain('gender_hedge')
  })
})

describe('Aug-7 PM batch (5 posts) defects', () => {
  it.each([
    ['Nenorisi išmesti senų produktų.', /nenorisi/iu],
    ['Dažnai įsidedami produktus į krepšelį.', /įsidedami produktus/iu],
    ['kauptis pradeda nereikalingas atsargos', /kauptis pradeda nereikalingas/iu],
    ['Maistas ima dėvėti šaldytuve.', /ima dėvėti/iu],
    ['pasirūpintį vaisiais laiku', /pasirūpintį/iu],
    ['Norėjau maisto rinkinio.', /norėjau/iu],
    ['Atsisakiau prabangos.', /atsisakiau/iu],
    ['Planuodamas vaisių pirkinius.', /planuodamas/iu],
    ['nes galvoji. Kada nors prisimsi', /galvoji\.\s*Kada/iu],
    ['Tu dažnai atidaugi šaldytuvą.', /atidaugi/iu],
    ['Dauguma produktų pirmiami dideliais kiekiais.', /pirmiami/iu],
    ['likę daržovės ar vaisiai ima dėvėti.', /likę daržovės|ima dėvėti/iu],
    ['Nėra aiškios strategijos pirkiams', /pirkiams/iu],
    ['Suplanuotas pirkinių planas padeda maistui pasibaigti laiku.', /Suplanuotas pirkinių|pasibaigti laiku/iu],
    ['Asmeninis planas pritaiko pasirinkimus prie tavo kasdienio ritmo.', /Asmeninis planas pritaiko/iu],
    ['Po sunkaus rugpjūčio karščio sporto salėje, ruošti maistą gali tapti įtomybė.', /rugpjūčio karšt|įtomybė/iu],
    ['Dauguma produktų pirmiami dideliais kiekiais.', /pirmiami/iu],
    ['Nuolatinis sprendimų priėmimas vargina ir išseka jėgas.', /išseka jėgas/iu],
    ['Ar sportas ir maistas eina viena koja?', /viena koja/iu],
    ['Dabar lengvai maitintis sveikais ir skaniai.', /sveikais ir skaniai/iu],
    ['Gyvenimas užsiemyje gali būti nuostabus.', /užsiemyje/iu],
    ['bet ne nori jausti save apribotu.', /ne nori/iu],
    ['Daugelis parduotuvėje randamų baltymai yra brangūs.', /randamų baltymai/iu],
    ['Jauti kaltės kamuojamas jausmas dėl išmestos maisto dalies.', /kamuojamas jausmas/iu],
    ['Dabar tu gali jausti kontrolę virš savo kūno.', /virš savo kūno/iu],
    ['Ar žinai, kas slepiasi tavo mėgstamiausiu maisto rinkiniu? Jauti neįprastas diskomfortas po valgio?', /mėgstamiausiu maisto rinkiniu|neįprastas diskomfortas/iu],
    ['Dabar žinai, kaip atskirti saugy nuo rizikos.', /saugy/iu],
    ['Testas atskleidžia, ką tau telieka norėti.', /telieka norėti/iu],
    ['Dažnai užsisakai maisto rinkinį dėl neapibrūkštumo?', /neapibrūkšt/iu],
    ['Dabar tu žinsi ką užsisakysi, o piniginė džiaugiasi.', /žinsi|džiaugiasi/iu],
    ['Skrandžio nemalnumai: ką daryti', /nemalnum/iu],
    ['Sužinoji, kaip maitinti savo žarnyną.', /sužinoji/iu],
    ['Kodėl savaitės meniu tapo iššūkis?', /tapo iššūkis/iu],
    ['Suplanuoti pietus tampa didesnis iššūkis nei darbo užduotys.', /didesnis iššūkis/iu],
    ['Suprantame, kad reikia ieškoti paprastesnio būdo maitintis.', /suprantame/iu],
    ['Tai galėtų padėti mums grįžti prie atsipalaidavusios savaitės.', /mums|atsipalaidavusios/iu],
    ['Dabar galime mėgautis atsipalaiduojančia savaitės eiga.', /galime/iu],
    ['Jaučiau spaudimą ruošti maistą kasdien, nors norėjome daugiau laiko sau.', /jaučiau|norėjome/iu],
    ['Tai riboja mūsų galimybes keliauti.', /mūsų/iu],
    ['Šeši mėnesius tu esi įsitikinęs, kad jis pasiteisins.', /Šeši mėnesius/u],
    ['Tikina, jog nuoseklumas padės išvengti atgalinio žingsnio.', /Tikina, jog|atgalinio žingsnio/iu],
    ['Tačiau kaita aplink tave gali būti nepastebima, kol vėluosi reaguoti.', /kaita aplink|vėluosi reaguoti/iu],
    ['Nuolatinis procesas ima daug jėgų.', /(?<!at)ima daug jėgų/iu],
    ['Tai gali trukdyti tavo kasdienę veiklą ir nuotaiką.', /kasdienę veiklą/iu],
    ['Tu nori sveikesnio pasirinkimo, bet vis tiek pasirenki ką kita.', /pasirenki ką kita/iu],
    ['Ar maistas tampa įtikinimo mūšiu?', /įtikinimo mūšiu/iu],
    ['Dabar gali mėgautis skanu bei sveiku pietumi be streso.', /skanu bei sveiku pietumi/iu],
    ['Pietų rinkinys leidžia tau sutaupyti energijos ir dėmesio.', /energijos ir dėmesio/iu],
    // Aug-8 batch
    ['Testas suformuoja planą pagal tavo dabartinę situaciją, ne seną šabloną.', /ne seną šabloną/iu],
    ['Jauti, kad stengiesi, bet pasiekimai vis lieka tie patys.', /tie patys\./u],
    ['Investuok laiko ir dėmesio į savo kūną bei protą.', /Investuok laiko/iu],
    ['Tavo dabartinis kelias gali riboti potencialą ir naujų galimybių įsisavinimą.', /galimybių įsisavinimą/iu],
    ['Testas padės tau atskleisti stipriąsias puses ir strategijas pasiekiamam augimui.', /pasiekiamam augimui/iu],
    ['Naujagimis kelia nereguliarų laiką, todėl tu esi išsekęs.', /Naujagimis kelia/iu],
    ['Norisi greitų sprendimų, kai vaikas verčia miego neatsisakyti.', /verčia miego neatsisakyti/iu],
    ['Jauti nuovargis ir noras padėti sau.', /Jauti nuovargis/iu],
    ['Tai ne tik dar vienas rūpestėlis.', /rūpestėlis/iu],
    ['Štai kodėl verta pasitikėti įprastais patarimais ir atradinėti savitą kelią.', /atradinėti savitą kelią/iu],
    ['Maisto rinkinys: kodėl nesibaigia sotis?', /nesibaigia sotis/iu],
    ['maistas ne visada suteikia norimo energijos.', /norimo energijos/iu],
    ['patiekalu, kuris duos ilgalaikį sotumą.', /duos ilgalaikį sotumą/iu],
    ['Dabar tavo kasdienybė tampa ramesnė ir maistingesnės.', /maistingesnės/iu],
    ['Prieš tai jautiesi išsekęs nuo nuolatinio spėliojimų, dabar.', /spėliojimų, dabar/iu],
    ['Tai leis tau jaustis pilnam/ai energijos visus likusius darbo metus.', /pilnam\/ai|darbo metus/iu],
    ['tenka susidurti su pilnumo jausmu ir sumažėjusia produktyvumu.', /sumažėjusia produktyvumu/iu],
    ['Jausi didesnę produktyvumo dozę visą dieną!', /produktyvumo dozę/iu],
    ['Anksčiau net nežinojau, kaip tinkamai subalansuoti pietų meniu.', /nežinojau/iu],
    ['Tai apriboja tavo galimybę atsipalaidavimui ir susikoncentruoti.', /galimybę atsipalaidavimui/iu],
    ['Tai suteikia daugiau erdvės atsipalaidavimui ir atkurti jėgas.', /atsipalaidavimui ir atkurti/iu],
    ['Štai kaip gali maisto rinkiniai padeda tau.', /gali maisto rinkiniai padeda/iu],
  ])('repairs PM batch quote: %s', (raw, forbidden) => {
    expect(normalizeLtUgcMultiline(raw)).not.toMatch(forbidden)
  })

  it('blocks hook broken punctuation and duplicate bodies', () => {
    expect(
      collectSlideIssues({
        role: 'hook',
        title: 'Ar vakarienė. Kasdienis stresas?',
        body: 'Kiekvieną vakarą spėlioji.',
      }).map((issue) => issue.code),
    ).toContain('hook_broken_punctuation')
    expect(
      collectStoryIssues(
        [
          { role: 'build', body: 'Kai žingsniai aiškūs, mažiau sprendimų priimi paskutinę minutę.' },
          { role: 'build', body: 'Kai žingsniai aiškūs, mažiau sprendimų priimi paskutinę minutę.' },
          { role: 'close', body: 'Asmeninis planas padeda kasdien rinktis ramiau.' },
        ],
        'maisto planavimas',
      ).map((issue) => issue.code),
    ).toContain('duplicate_slide_body')
  })

  it('prefers context slide for caption P2 over generic keyword filler', () => {
    const slides = [
      {
        role: 'hook',
        title: 'Ar maistas ima gesti per greitai?',
        body: 'Kiekvieną savaitę dalis produktų nueina į šiukšlynę.',
      },
      {
        role: 'context',
        body: 'Kai neturi aiškaus plano, perki daugiau nei suvalgai. Tada maistas greičiau gesta.',
      },
      {
        role: 'close',
        body: 'Asmeninis planas padeda mažiau švaistyti ir ramiau planuoti savaitę.',
        cta: 'Apsilankyk tavoknyga.com ir pradėk 5 min. testą! 🤩',
      },
    ]
    const built = buildBatchTemplateCaption({
      themeHook: 'Maisto švaistymas',
      themeBody: 'Trumpas aprašymas.',
      slides,
      defaultCta: 'Apsilankyk tavoknyga.com ir pradėk 5 min. testą! 🤩',
      theme: 'less food waste',
    })
    expect(built.description).not.toContain('Asmeninis planas padeda mažiau švaistyti')
    expect(captionSlideDumpScore(built.description, slides)).toBeLessThan(0.5)
  })

  it('blocks season filler on non-seasonal themes', () => {
    expect(
      collectStoryIssues(
        [{ role: 'hook', title: 'Ar jauti nuovargį?', body: 'Rugpjūčio karštis palieka mažiau jėgų.' }],
        'post workout meal',
      ).map((issue) => issue.code),
    ).toContain('season_filler')
  })

  it('keeps atsipalaiduoti infinitive intact (regression)', () => {
    expect(normalizeLtUgcMultiline('Vakare svarbu atsipalaiduoti ir atkurti jėgas.')).toContain(
      'atsipalaiduoti ir atkurti',
    )
  })

  it('catches the "testas suformuoja" pitch on slide 2 and repairs it', () => {
    const slides = [
      { role: 'hook', title: 'Nauja pradžia', body: 'Jauti, kad stengiesi, bet rezultatai nesikeičia?' },
      { role: 'context', body: 'Testas per kelias minutes suformuoja planą pagal tavo dabartinę situaciją.' },
      { role: 'build', body: 'Senos tradicijos dažnai tampa kliūtimi augimui.' },
      { role: 'close', body: 'Aiškus planas keičia kasdienybę po truputį.' },
    ]
    expect(collectStoryIssues(slides, 'new beginning').map((issue) => issue.code)).toContain(
      'solution_too_early',
    )
    const repaired = repairStoryOrderAndRepeats(
      slides.map((slide, i) => ({ id: `s${i}`, title: slide.title || '', body: slide.body, role: slide.role })),
      'new beginning',
    )
    expect(`${repaired[1].title || ''} ${repaired[1].body || ''}`).not.toMatch(/testas .*suformuoja/iu)
  })

  it('blocks the solution pitch on slide 2', () => {
    expect(
      collectStoryIssues(
        [
          { role: 'hook', title: 'Ar vakarienės planavimas tave vargina?', body: 'Dažnai užsisakai maistą paskutinę minutę.' },
          { role: 'context', body: 'Testas atskleidžia, ko tau iš tiesų norisi. Vietoje spėliojimo atsiranda aiškus pasirinkimas.' },
          { role: 'build', body: 'Dabar tu gali lengvai susiplanuoti savaitę be streso.' },
          { role: 'close', body: 'Aiškus planas keičia kasdienybę po truputį.' },
        ],
        'dinner planning',
      ).map((issue) => issue.code),
    ).toContain('solution_too_early')
  })

  it('flags the same sentence shipped on two slides', () => {
    expect(
      collectStoryIssues(
        [
          { role: 'hook', title: 'Ar knygos rašymas tave sustabdo?', body: 'Supranti, kad reikia pradėti, bet nežinai nuo ko?' },
          { role: 'context', body: 'Dažnai įvykiai atsiliepia visoms gyvenimo sritims.' },
          { role: 'build', body: 'Tu supranti, kad reikia pradėti, tačiau nežinai nuo ko.' },
          { role: 'close', body: 'Aiškus planas keičia kasdienybę po truputį.' },
        ],
        'writing block',
      ).map((issue) => issue.code),
    ).toContain('duplicate_sentence')
  })

  it('flags hook body echoing its title', () => {
    expect(
      collectStoryIssues(
        [
          {
            role: 'hook',
            title: 'Ar knygos rašymas tave sustabdo?',
            body: 'Ar knygos rašymas tave sustabdo? Supranti, kad reikia pradėti.',
          },
        ],
        'writing block',
      ).map((issue) => issue.code),
    ).toContain('hook_title_echo')
  })

  it('flags hook title echo on short 3-word titles (Aug-9 batch)', () => {
    expect(
      collectStoryIssues(
        [
          {
            role: 'hook',
            title: 'Kodėl prizai vilioja?',
            body: 'Kodėl prizai vilioja? Dažnai manai, kad atlaikęs saldžiųjų pagundų?',
          },
        ],
        'rewards',
      ).map((issue) => issue.code),
    ).toContain('hook_title_echo')
  })

  it('stripTitleEchoFromBody drops echoed title for Aug-9 batch hooks', () => {
    expect(
      stripTitleEchoFromBody(
        'Kodėl prizai vilioja?',
        'Kodėl prizai vilioja? Dažnai manai, kad atlaikęs saldžiųjų pagundų?',
      ),
    ).toBe('Dažnai manai, kad atlaikęs saldžiųjų pagundų?')
    expect(
      stripTitleEchoFromBody(
        'Svarstyklės: kas nutinka?',
        'Svarstyklės: kas nutinka? Ar svarstyklių skaičiai diktuoja tavo nuotaiką?',
      ),
    ).toBe('Ar svarstyklių skaičiai diktuoja tavo nuotaiką?')
    expect(stripTitleEchoFromBody('Kodėl prizai vilioja?', 'Kodėl prizai vilioja?')).toBe('')
  })

  it('repairStoryOrderAndRepeats strips hook echo without breaking cross-slide dedup', () => {
    const slides = [
      {
        id: 's1',
        role: 'hook',
        title: 'Kodėl prizai vilioja?',
        body: 'Kodėl prizai vilioja? Dažnai manai, kad atlaikęs saldžiųjų pagundų?',
      },
      {
        id: 's2',
        role: 'context',
        body: 'Kai žingsniai aiškūs, mažiau sprendimų priimi paskutinę minutę. Taip sutaupai laiko.',
      },
      {
        id: 's3',
        role: 'build',
        body: 'Kai žingsniai aiškūs, mažiau sprendimų priimi paskutinę minutę. Struktūra padeda išvengti chaoso.',
      },
      { id: 's4', role: 'close', body: 'Aiškus maisto planas padeda kasdien rinktis ramiau.', cta: 'Pradėk testą!' },
    ]
    const repaired = repairStoryOrderAndRepeats(slides, 'rewards', {
      themeHook: 'Kodėl prizai vilioja?',
      themeBody: 'Planas parenka patiekalus pagal tavo pageidavimus.',
    })
    expect(repaired[0].body).not.toMatch(/^Kodėl prizai vilioja/)
    expect(collectStoryIssues(repaired, 'rewards').map((i) => i.code)).not.toContain('duplicate_sentence')
  })

  it('repairStoryOrderAndRepeats falls back when hook body is title-only echo', () => {
    const repaired = repairStoryOrderAndRepeats(
      [
        {
          id: 's1',
          role: 'hook',
          title: 'Kodėl prizai vilioja?',
          body: 'Kodėl prizai vilioja?',
        },
        { id: 's2', role: 'context', body: 'Emocijos ir sprendimai vargina kasdien.' },
        { id: 's3', role: 'build', body: 'Struktūra padeda išvengti chaoso.' },
        { id: 's4', role: 'close', body: 'Aiškus maisto planas padeda kasdien rinktis ramiau.', cta: 'Pradėk testą!' },
      ],
      'rewards',
      { themeHook: 'Kodėl prizai vilioja?', themeBody: 'Planas parenka patiekalus pagal tavo pageidavimus.' },
    )
    expect(repaired[0].body?.length || 0).toBeGreaterThanOrEqual(28)
    expect(repaired[0].body).not.toBe('Kodėl prizai vilioja?')
  })

  it('gates colon titles with bare interrogative tails', () => {
    expect(
      collectSlideIssues({ role: 'hook', title: 'Skrandžio sunkumas: kodėl', body: 'Jauti pilnumo jausmą po valgio.' }).map(
        (issue) => issue.code,
      ),
    ).toContain('question_mark')
    expect(normalizeLtUgcMultiline('Skrandžio sunkumas: kodėl')).toBe('Skrandžio sunkumas: kodėl?')
    expect(normalizeLtUgcMultiline('Maisto rinkinys: kodėl taip')).toBe('Maisto rinkinys: kodėl taip?')
    expect(normalizeLtUgcMultiline('Skrandžio nemalonumai: ką daryti')).toBe('Skrandžio nemalonumai: ką daryti?')
  })

  it('turns embedded hook questions into questions', () => {
    expect(
      ensureHookBodyQuestions('Diena bėga greitai, o tu vis dar galvoji, ką valgyti.'),
    ).toContain('galvoji, ką valgyti?')
    expect(ensureHookBodyQuestions('Pirmoji eilutė.\nAntroji galvoji, ką valgyti.')).toBe(
      'Pirmoji eilutė.\nAntroji galvoji, ką valgyti?',
    )
    expect(
      ensureHookBodyQuestions(
        'Jauti, kad švenčių metas tampa stresinga? Tu nori ramiai planuoti ir džiaugtis artimaisiais.',
      ),
    ).toContain('artimaisiais?')
    expect(
      ensureHookBodyQuestions(
        'Jauti, kad maistas nebeveda į priekį? Supranti, jog kažkas trukdo pasijusti gerai po valgio.',
      ),
    ).toContain('po valgio?')
    expect(
      normalizeLtUgcMultiline('Suplanuoti pietus tampa didesnis iššūkis nei darbo užduotys.'),
    ).toBe('Ar suplanuoti pietus tampa didesniu iššūkiu nei darbo užduotys?')
  })

  it('flags generic filler repeated across slides', () => {
    expect(
      collectStoryIssues(
        [
          { role: 'build', body: 'Kai žingsniai aiškūs, mažiau sprendimų priimi paskutinę minutę.' },
          { role: 'build', body: 'Kai žingsniai aiškūs, mažiau sprendimų priimi paskutinę minutę.' },
        ],
        'allergy',
      ).map((issue) => issue.code),
    ).toContain('generic_filler_repeat')
  })

  it('flags build_close_echo when penultimate build previews close payoff', () => {
    expect(
      collectStoryIssues(
        [
          { role: 'hook', title: 'Virškinimas: ar visada žinai, kodėl?', body: 'Jauti sunkumą po valgio.' },
          { role: 'context', body: 'Kiekvieno žmogaus virškinimas unikalus.' },
          {
            role: 'build',
            body: 'Supratusi savo individualius poreikius galėsi pasirinkti optimalų meniu.',
          },
          {
            role: 'close',
            body: 'Dabar supranti, kad maisto derinimas gali būti raktas į gerą savijautą.',
            cta: 'Apsilankyk tavoknyga.com ir pradėk 5 min. testą! 🤩',
          },
        ],
        'digestion',
      ).map((issue) => issue.code),
    ).toContain('build_close_echo')
  })

  it('flags post-95 style build/close insight echo', () => {
    expect(
      collectStoryIssues(
        [
          { role: 'hook', title: 'Uždegimas: kodėl jis trukdo?', body: 'Jauti nuovargį?' },
          { role: 'context', body: 'Per daug rafinuotų angliavandenių skatina imuniteto reakciją.' },
          { role: 'build', body: 'Supranti, kad mažas pokytis dietoje gali atnešti didelę naudą.' },
          {
            role: 'close',
            body: 'Dabar supranti, kad maistas turi būti pritaikytas tavo tikslams ir apribojimams.',
            cta: 'Apsilankyk tavoknyga.com ir pradėk 5 min. testą! 🤩',
          },
        ],
        'inflammation',
      ).map((issue) => issue.code),
    ).toContain('build_close_echo')
  })

  it('does not flag post-02 narrative build as build_close_echo', () => {
    const build =
      'Pradėjai naudoti maisto rinkinį, norėdamas sutaupyti laiko ir pinigų. Greitai supratai, kad kas mėnesį mokamas planas ima varginti.'
    const close =
      'Dabar žinai, kad mažiau sprendimų reiškia daugiau energijos kasdieniam gyvenimui.'
    expect(isBuildCloseEcho(build, close)).toBe(false)
    expect(
      collectStoryIssues(
        [
          { role: 'hook', title: 'Maisto rinkinys: ar verta?', body: 'Kartais norisi greitesnio sprendimo.' },
          { role: 'context', body: 'Kiekvieną savaitę gauni ingredientus ir receptus.' },
          { role: 'build', body: build },
          { role: 'close', body: close, cta: 'Apsilankyk tavoknyga.com ir pradėk 5 min. testą! 🤩' },
        ],
        'meal kit',
      ).map((issue) => issue.code),
    ).not.toContain('build_close_echo')
  })

  it('repairs post-91 style paraphrase repeats across six slides', () => {
    const slides = [
      {
        id: 's1',
        role: 'hook',
        title: 'Ar jauti sunkumą po pietų?',
        body: 'Dažnai jauti mieguistumą ir tingulį? Galbūt netinkamos porcijos sukelia diskomfortą.',
      },
      {
        id: 's2',
        role: 'context',
        body: 'Netolygus angliavandenių ir baltymų santykis gali lemti staigius cukraus svyravimus kraujyje.',
      },
      {
        id: 's3',
        role: 'build',
        body: 'Kai žingsniai aiškūs, mažiau sprendimų priimi paskutinę minutę. Taip sutaupai ir laiko, ir energijos.',
      },
      {
        id: 's4',
        role: 'build',
        body: 'Dažnai jauti mieguistumą ir tingulį? Netinkamos porcijos gali sukelti diskomforto jausmą.',
      },
      {
        id: 's5',
        role: 'build',
        body: 'Nelygus angliavandenių ir baltymų santykis sukelia energijos svyravimus. Planuoti kiekvieno patiekalo dydį gali būti sudėtinga.',
      },
      {
        id: 's6',
        role: 'close',
        body: 'Aiškus planas padeda kasdien maistą rinktis ramiau.',
        cta: 'Apsilankyk tavoknyga.com ir pradėk 5 min. testą! 🤩',
      },
    ]
    expect(isParaphraseSlideCopy('', slides[3].body, slides.slice(0, 3))).toBe(true)
    const repaired = repairStoryOrderAndRepeats(slides, 'post-lunch heaviness')
    expect(collectParaphraseSlideIssues(repaired).length).toBe(0)
  })

  it('repairStoryOrderAndRepeats rewrites the slide-2 pitch and drops repeats', () => {
    const repaired = repairStoryOrderAndRepeats(
      [
        {
          id: 's1',
          role: 'hook',
          title: 'Ar pirkinių sąrašas tave vargina?',
          body: 'Ar pirkinių sąrašas tave vargina? Kiekvieną savaitę tas pats klausimas kartojasi vėl.',
        },
        {
          id: 's2',
          role: 'context',
          body: 'Netikslus pirkinių sąrašas gali sukelti stresą. Maisto rinkinys leidžia sutaupyti laiką ir pinigus.',
        },
        {
          id: 's3',
          role: 'build',
          body: 'Kiekvieną savaitę tas pats klausimas kartojasi vėl. Aiškus sąrašas padeda pirkti tik tai, ko reikia.',
        },
        {
          id: 's4',
          role: 'close',
          body: 'Planas padeda apsipirkti ramiau ir be spėliojimo.',
          cta: 'Apsilankyk tavoknyga.com ir pradėk 5 min. testą! 🤩',
        },
      ],
      'grocery list stress',
    )
    const secondText = `${repaired[1].title || ''} ${repaired[1].body || ''}`
    expect(secondText).not.toMatch(/maisto rinkinys leidžia/iu)
    expect(repaired[0].body).not.toMatch(/Ar pirkinių sąrašas tave vargina\?/u)
    expect(repaired[2].body).not.toMatch(/tas pats klausimas kartojasi/iu)
    expect(repaired[2].body.length).toBeGreaterThan(28)
    expect(
      collectStoryIssues(repaired, 'grocery list stress').filter(
        (issue) => issue.code === 'duplicate_sentence' || issue.code === 'solution_too_early' || issue.code === 'hook_title_echo',
      ),
    ).toEqual([])
  })
})

describe('Aug-7 close rescue', () => {
  it('builds a shipable close that does not loop the hook', () => {
    const hook = {
      title: 'Ar kasdien galvoji, ką gaminti?',
      body: 'Rugpjūčio vakarais vis dar spėlioji, ką pasirinkti.',
    }
    const close = buildFallbackCloseBody('Vienkartinis mokestis už asmeninį planą.', [hook])
    expect(isShipableLtSlide({ role: 'close', body: close })).toBe(true)
    expect(isDuplicateSlideCopy('', close, [hook])).toBe(false)
  })

  it('uses topic-neutral close copy for non-food themes', () => {
    const close = buildFallbackCloseBody('time management productivity planavimas', [])
    expect(close).not.toMatch(/patiekal|mėgautis maistu/i)
    expect(close).toMatch(/sprendim/i)
  })
})

describe('Aug-7 caption/export alignment', () => {
  it('uses the shipped hook as P1 and passes the export gate', () => {
    const slides = [
      {
        role: 'hook',
        title: 'Ar žinai, ką valgyti?',
        body: 'Jauti, kad informacija apie maistą kartais tampa paini?',
      },
      {
        role: 'build',
        title: '',
        body: 'Aiškus sąrašas padeda parduotuvėje pasirinkti tinkamus produktus.',
      },
      {
        role: 'close',
        title: '',
        body: 'Asmeninis mitybos planas padeda kasdien rinktis ramiau ir išvengti bereikalingo spėliojimo.',
        cta: 'Apsilankyk tavoknyga.com ir pradėk 5 min. testą! 🤩',
      },
    ]
    const built = buildBatchTemplateCaption({
      themeHook: 'Jautrumas gliadinui',
      themeBody: 'Receptai parenkami pagal tavo atsakymus ir poreikius.',
      slides,
      defaultCta: 'Apsilankyk tavoknyga.com ir pradėk 5 min. testą! 🤩',
      theme: 'non-celiac gluten sensitivity',
      category: 'Random theme',
    })
    const caption = formatBatchDiscordCaption(built.description, { opener: built.hook })
    expect(caption.split(/\n{2,}/)[1]).toBe('Ar žinai, ką valgyti?')
    expect(
      validateUgcExportPost({
        caption,
        meta: {
          theme: 'non-celiac gluten sensitivity',
          hook: 'Jautrumas gliadinui',
          body: 'Receptai parenkami pagal tavo atsakymus ir poreikius.',
          story_slides: slides,
        },
      }),
    ).toEqual({ ok: true, issues: [] })
  })
})

describe('Aug-8 15:00 systemic QA hardening', () => {
  it.each([
    ['Pilvas: ką slepia', /\?\s*$/u],
    ['Naujas būstas: ką pirkti', /\?\s*$/u],
    ['Veganumas: tendencija ar stilius', /\?\s*$/u],
    ['Pavargęs nuo ilgų virimo seansų', /^Pavargai nuo ilgo gaminimo\?\s*$/u],
  ])('title rule: %s', (raw, shape) => {
    expect(normalizeLtUgcMultiline(raw)).toMatch(shape)
    expect(isInterrogativeHookTitle(raw)).toBe(true)
    expect(ensureHookQuestionMark(raw).endsWith('?')).toBe(true)
  })

  it.each([
    ['Tu žinai ką daryti rytoj.', /žinai, ką/iu],
    ['Tu žinosi ką užsisakysi.', /žinosi, ką/iu],
    ['Tu supranti kaip tai veikia.', /supranti, kaip/iu],
    ['kodėl jis skęsta?', /blėsta/iu],
    ['valgio vartojimo laikai trukdo.', /valgymo laikas/iu],
    ['Suplanuoti valgio laikai padeda.', /Suplanuotas valgymo laikas/iu],
    ['organizmo resursai ištuštėja greitai.', /atsargos senka/iu],
    ['su dieną užimančiais darbais sunku.', /su dienos darbais/iu],
    ['Tai vargdas eksperimentavimas.', /varginantis eksperimentas/iu],
    ['Manėsi veganas būti.', /Manei, kad veganu būti paprasta/iu],
    ['Liko nežinomybės paslaptys.', /daug nežinomybės/iu],
    ['Paskui supranti, kad buvo sunku.', /Vėliau supranti/iu],
    ['Sunku susidoroti su pirmuoju butu.', /pirkiniais naujame būste/iu],
    ['Greitas puodas gelbsti vakarą.', /Greitas patiekalas/iu],
    ['Matai didelę švaistymo apimtį.', /daug švaistymo/iu],
    ['pasirinkdamas paruoštų ingredientų komplektus sutaupai.', /kai renkiesi paruoštus ingredientus/iu],
    ['susidūrimas su improvizacija baigiasi didesnėmis išlaidomis ir vargais.', /improvizacija dažnai baigiasi didesnėmis išlaidomis/iu],
    ['Dabar mėgautiesi ramybe.', /mėgaujiesi/iu],
  ])('repairs quote: %s', (raw, expected) => {
    expect(normalizeLtUgcMultiline(raw)).toMatch(expected)
  })

  it('drops Ankstesnis posūkis lead-in', () => {
    expect(
      normalizeLtUgcMultiline('Ankstesnis posūkis atskleidžia, kad organizmo energija krenta.'),
    ).not.toMatch(/Ankstesnis posūkis/iu)
  })

  it('merges orphan one-word stub sentences', () => {
    expect(
      normalizeLtUgcMultiline(
        'Tavo prioritetai gali kisti, o aplinkybės. Keistis. Todėl bendras planas greitai pasensta.',
      ),
    ).not.toMatch(/\.\s*Keistis\./iu)
  })

  it('gates colon-interrogative and participle titles missing "?"', () => {
    expect(
      collectSlideIssues({ role: 'hook', title: 'Pilvas: ką slepia', body: 'Jauti diskomfortą po valgio.' }).map(
        (i) => i.code,
      ),
    ).toContain('question_mark')
    expect(
      collectSlideIssues({
        role: 'hook',
        title: 'Veganumas: tendencija ar stilius',
        body: 'Pasirinkimas nėra toks paprastas.',
      }).map((i) => i.code),
    ).toContain('question_mark')
    expect(
      collectSlideIssues({
        role: 'hook',
        title: 'Pavargęs nuo ilgo gaminimo',
        body: 'Vakarais trūksta jėgų.',
      }).map((i) => i.code),
    ).toContain('participle_hook')
  })

  it('treats Dabar žinai / Tavo knyga padės as early solution pitch', () => {
    expect(UGC_SOLUTION_PITCH_RE.test('Dabar žinai, kad veganumas nėra tik mada.')).toBe(true)
    expect(UGC_SOLUTION_PITCH_RE.test('„Tavo knyga" padės susidėlioti planą.')).toBe(true)
    expect(UGC_SOLUTION_PITCH_RE.test('Dabar žinai daugiau apie save.')).toBe(false)
    const slides = [
      { role: 'hook', title: 'Veganumas: tendencija ar stilius?', body: 'Manėsi, kad bus paprasta.' },
      { role: 'context', body: 'Dabar žinai, kad reikia aiškaus plano kiekvienai savaitei.' },
      { role: 'build', body: 'Be plano eksperimentai greitai vargina.' },
      { role: 'close', body: 'Aiškus planas padeda išlaikyti ritmą.' },
    ]
    expect(collectStoryIssues(slides, 'veganism').map((i) => i.code)).toContain('solution_too_early')
    const repaired = repairStoryOrderAndRepeats(
      slides.map((slide, i) => ({ id: `s${i}`, title: slide.title || '', body: slide.body, role: slide.role })),
      'veganism',
    )
    expect(`${repaired[1].title || ''} ${repaired[1].body || ''}`).not.toMatch(/Dabar žinai/iu)
  })

  it('repairStoryOrderAndRepeats strips early_pitch from build slides', () => {
    const repaired = repairStoryOrderAndRepeats(
      [
        { id: 's1', role: 'hook', title: 'Ar valgai sveikai?', body: 'Kiekvienas kąs svarbus.' },
        { id: 's2', role: 'context', body: 'Kai skubini, renkiesi tai, kas po ranka.' },
        {
          id: 's3',
          role: 'build',
          body: 'Supranti, kad kiekvienas kąs gali paveikti tavo sveikatą. Tavo knyga padės subalansuoti savo mitybą ir jaustis geriau!',
        },
        { id: 's4', role: 'close', body: 'Aiškus planas keičia kasdienybę.', cta: 'Pradėk testą!' },
      ],
      'health bites',
    )
    expect(`${repaired[2].body || ''}`).not.toMatch(/tavo knyga padės/iu)
    expect(collectStoryIssues(repaired, 'health bites').map((i) => i.code)).not.toContain('early_pitch')
  })

  it('flags universal brand_drift when last slides lack food anchor (Post 103 style)', () => {
    expect(
      collectStoryIssues(
        [
          { role: 'hook', title: 'Naujas gyvenimo etapas: ką tai reiškia?', body: 'Jauti, kad viskas keičiasi greičiau.' },
          { role: 'context', body: 'Emocijos ir sprendimai vargina kasdien.' },
          { role: 'build', body: 'Aiškus planas keičia kasdienybę po truputį.' },
          { role: 'close', body: 'Dabar žinai, kad mažiau sprendimų reiškia daugiau energijos.', cta: 'Pradėk testą!' },
        ],
        'life stage',
      ).map((issue) => issue.code),
    ).toContain('brand_drift')
  })

  it('repairs generic_filler_repeat when hook collides with another slide (Post 01)', () => {
    const slides = [
      {
        id: 's1',
        role: 'hook',
        title: 'Ar planavimas tave vargina?',
        body: 'Kai žingsniai aiškūs, mažiau sprendimų priimi paskutinę minutę.',
      },
      {
        id: 's2',
        role: 'context',
        body: 'Kai žingsniai aiškūs, mažiau sprendimų priimi paskutinę minutę. Taip sutaupai laiko.',
      },
      { id: 's3', role: 'build', body: 'Struktūra padeda išvengti chaoso.' },
      { id: 's4', role: 'close', body: 'Aiškus maisto planas padeda kasdien rinktis ramiau.', cta: 'Pradėk testą!' },
    ]
    expect(collectStoryIssues(slides, 'planning').map((i) => i.code)).toContain('generic_filler_repeat')
    const repaired = repairStoryOrderAndRepeats(slides, 'planning')
    expect(collectStoryIssues(repaired, 'planning').map((i) => i.code)).not.toContain('generic_filler_repeat')
  })

  it('normalizes Planuodamas masculine participle (Post 03)', () => {
    expect(normalizeLtUgcMultiline('Planuodamas savaitę, renkiesi produktus.')).toMatch(/Kai planuoji/i)
  })

  it('catches post-meal sleepiness near-duplicate claims (rule 14)', () => {
    const prior = [
      { body: 'Jauti mieguistumą po pietų ir negali susikaupti?' },
    ]
    expect(
      isParaphraseSlideCopy('', 'Po pietų dažnai jauti mieguistumą ir tingulį.', prior),
    ).toBe(true)
  })

  it('post 104–105: hook with Tai gali būti passes declarative gate', () => {
    const hookBody =
      'Ar ieškai paguodos maiste? Jauti, kad po sunkios darbo dienos dažnai nori užkąsti ką nors skanaus? Tai gali būti ženklas, jog tau trūksta atsargų?'
    expect(
      collectSlideIssues({ role: 'hook', title: 'Ar ieškai paguodos maiste?', body: hookBody }).map(
        (i) => i.code,
      ),
    ).not.toContain('declarative_question_mark')
  })

  it('post 104–105: normalizes declarative sukelia hook before gate', () => {
    const raw =
      'Maisto rinkinys: ar tai lengva? Dažnai jauti, kad ruošiamas maistas be aiškaus plano. Tai sukelia stresą ir netolygų energijos lygį?'
    const fixed = normalizeLtUgcMultiline(raw)
    expect(fixed).not.toMatch(/energijos lygį\?/)
    expect(
      collectSlideIssues({ role: 'hook', title: 'Maisto rinkinys: ar tai lengva?', body: fixed }).map(
        (i) => i.code,
      ),
    ).not.toContain('declarative_question_mark')
  })

  it('post 104 close with supranti and slepiasi ships', () => {
    expect(
      collectSlideIssues({
        role: 'close',
        body: 'Dabar supranti, kokie dideli pinigų taupymo variantai slepiasi ruošiant maistą namuose.',
        cta: 'Apsilankyk tavoknyga.com ir pradėk 5 min. testą! 🤩',
      }).map((i) => i.code),
    ).not.toContain('not_shipable')
  })

  it('flags off-topic clothing hook as gibberish (Post 03)', () => {
    const hook =
      'Ar bužių dydis: koks jis iš tiesų? Drabužių dydis: koks jis iš tiesų? Ar drabužiai tinka, ar slepi trūkumus? Jauti spaudimą atitikti idealą?'
    expect(isOffTopicNonFoodLtCopy(hook)).toBe(true)
    expect(isGibberishLtCopy(hook)).toBe(true)
  })

  it('repairs Post 03 off-topic hook via theme fallback', () => {
    const slides = [
      {
        id: 's1',
        role: 'hook',
        title: 'Ar bužių dydis: koks jis iš tiesų?',
        body: 'Drabužių dydis: koks jis iš tiesų? Ar drabužiai tinka, ar slepi trūkumus? Jauti spaudimą atitikti idealą?',
      },
      { id: 's2', role: 'context', body: 'Emocijos ir sprendimai vargina kasdien.' },
      { id: 's3', role: 'build', body: 'Struktūra padeda išvengti chaoso.' },
      {
        id: 's4',
        role: 'close',
        body: 'Aiškus maisto planas padeda kasdien rinktis ramiau.',
        cta: 'Apsilankyk tavoknyga.com ir pradėk 5 min. testą! 🤩',
      },
    ]
    const repaired = repairStoryOrderAndRepeats(slides, 'sugar cravings', {
      themeHook: 'Mažiau saldumo',
      themeBody: 'Planas parenka patiekalus pagal tavo pageidavimus, kad mažiau temptų impulsyvūs saldumynai.',
    })
    const hookText = `${repaired[0].title || ''} ${repaired[0].body || ''}`
    expect(isOffTopicNonFoodLtCopy(hookText)).toBe(false)
    expect(isGibberishLtCopy(hookText)).toBe(false)
  })

  it('repairs Post 01 brand_drift close without food anchor', () => {
    const slides = [
      { id: 's1', role: 'hook', title: 'Galvoji, kad planavimas užima per daug laiko?', body: 'Kasdien svarstai, kaip viską suspėti.' },
      { id: 's2', role: 'context', body: 'Emocijos ir sprendimai vargina kasdien.' },
      { id: 's3', role: 'build', body: 'Aiškus planas keičia kasdienybę po truputį.' },
      {
        id: 's4',
        role: 'close',
        body: 'Galvoji, kad planavimas užima per daug laiko? Dabar supranti, kaip lengva gali būti savaitgalis. Pasiruošk ramiam ir skaniam laikui!',
        cta: 'Pradėk testą!',
      },
    ]
    expect(collectStoryIssues(slides, 'time management').map((i) => i.code)).toContain('brand_drift')
    const repaired = repairStoryOrderAndRepeats(slides, 'time management')
    expect(collectStoryIssues(repaired, 'time management').map((i) => i.code)).not.toContain('brand_drift')
  })

  it('repairs Post 04 close paraphrase', () => {
    const slides = [
      { id: 's1', role: 'hook', title: 'Ar maistas jau ne malonumas?', body: 'Kartais jauti, kad valgymas tampa pareiga.' },
      { id: 's2', role: 'context', body: 'Rutina ir sprendimai vargina kasdien.' },
      {
        id: 's3',
        role: 'build',
        body: 'Maistas tampa ne įsipareigojimas, o malonumas, kai planas atitinka tavo ritmą.',
      },
      {
        id: 's4',
        role: 'close',
        body: 'Maistas tampa ne įsipareigojimas, o malonumas. Štai kaip atnaujinsi savo pageidavimus kartu su gyvenimu.',
        cta: 'Apsilankyk tavoknyga.com ir pradėk 5 min. testą! 🤩',
      },
    ]
    expect(collectParaphraseSlideIssues(slides).some((i) => i.role === 'close')).toBe(true)
    const repaired = repairStoryOrderAndRepeats(slides, 'meal planning')
    expect(collectParaphraseSlideIssues(repaired).length).toBe(0)
  })

  it('flags Aug-9 batch hallucinations and fragments', () => {
    expect(
      isGibberishLtCopy(
        'Nuolatiniai svorio virsnumai gali būti vandens retencija ar maisto skoniu.',
      ),
    ).toBe(true)
    expect(
      isGibberishLtCopy(
        'Dabar žinai, kad šeimyninis susitikimas ties maistu gali būti ne vargstas darbas.',
      ),
    ).toBe(true)
    expect(
      isGibberishLtCopy('IBS simptomai dažnai pasirodo netikėtai, o meniu. Tikras išbandymas?'),
    ).toBe(true)
    expect(isGibberishLtCopy('Bet ne visada.')).toBe(false)
    expect(isGibberishLtCopy('Nuo prieskonių iki aliejaus.')).toBe(true)
  })

  it('adds sugar contrast when satiety slide follows sugar context', () => {
    const slides = [
      { id: 's1', role: 'hook', title: 'Kodėl prizai vilioja?', body: 'Dažnai manai, kad atlaikęs saldžiųjų pagundų?' },
      {
        id: 's2',
        role: 'context',
        body: 'Greitas cukraus kiekis organizme skatina staigius svyravimus.',
      },
      {
        id: 's3',
        role: 'build',
        body: 'Maistas turintis daug baltymų ir skaidulų suteikia ilgalaikį sotumo jausmą.',
      },
      { id: 's4', role: 'close', body: 'Dabar supranti, kodėl saldumynai vis grįžta.', cta: 'Pradėk testą!' },
    ]
    repairSugarSatietyContrast(slides)
    expect(slides[2].body).toMatch(/ko cukrus nesuteikia/i)
  })
})
