import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  normalizeLtUgcMultiline,
  hasFormalRegister,
  stripLtEmDashes,
  isGibberishLtCopy,
  isDeclarativeQuestionMark,
  textHasDeclarativeQuestionMark,
  textHasRhetoricalTuQuestionMissingMark,
  textHasEngagementBait,
  collectSlideIssues,
  slidesHaveFoodAnchor,
  assertShipableLtSlide,
  textHasFiniteVerbCue,
  isOffTopicNonFoodLtCopy,
} from '../ugc-lt-normalize.js'

describe('normalizeLtUgcMultiline', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 7, 15, 12))
  })
  afterEach(() => vi.useRealTimers())
  it('converts formal jūs to tu', () => {
    const out = normalizeLtUgcMultiline('Jei jaučiatės, kad stringate — pradėkite testą.')
    expect(out).toContain('jauti')
    expect(out).toMatch(/pradėk/i)
    expect(out).not.toMatch(/jaučiatės|pradėkite/i)
    expect(out).not.toMatch(/—|–/)
  })

  it('fixes known grammar slips', () => {
    const out = normalizeLtUgcMultiline('Metu laiko keisti įpročius ir vengti apgaviusius sprendimus.')
    expect(out).toContain('Metas keisti')
    expect(out).toContain('apgaulingus')
  })

  it('fixes atidėji and instrumental malonumas', () => {
    const out = normalizeLtUgcMultiline('Dažnai atidėji sprendimus. Maisto ruošimas tampa malonumas.')
    expect(out).toContain('atidedi')
    expect(out).toContain('tampa malonumu')
  })

  it('fixes screenshot typos: aklavogė, energijos, stringate', () => {
    const out = normalizeLtUgcMultiline(
      'Ar jauti kaip aklavogė virtuvėje? Energijos visai ne. Jei stringate — pradėkite testą.',
    )
    expect(out).toContain('chaosas')
    expect(out).toMatch(/energijos visai nėra/i)
    expect(out).toMatch(/stringi/i)
    expect(out).not.toMatch(/aklavog|stringate|pradėkite/i)
  })

  it('repairs truncated bet tai endings', () => {
    const out = normalizeLtUgcMultiline('Galbūt esi pasimetęs, bet tai.')
    expect(out).toMatch(/puiki pradžia/i)
    expect(out).not.toMatch(/bet tai\.\s*$/i)
  })

  it('rewrites pavasario to vasaros in August', () => {
    const out = normalizeLtUgcMultiline('Ar jauti pavasario vėją?', { mesOpenerCount: 0 })
    expect(out).toContain('vasaros')
    expect(out).not.toMatch(/pavasar/i)
  })

  it('dedupes Mes openers across calls', () => {
    const state = { mesOpenerCount: 0 }
    normalizeLtUgcMultiline('Mes neprimetame dietų.', state)
    const second = normalizeLtUgcMultiline('Mes padedame suderinti planą.', state)
    expect(second).toMatch(/^Tai /)
  })

  it('fixes vegan-protein screenshot grammar', () => {
    const out = normalizeLtUgcMultiline(
      'Ar jaučiasi vasaros nuovargis? Galbūt tau trūksta reikiamo baltymai. Vegan baltymai. Tai ne tik tofu ir sojos gami. Visus reikiamus aminorūgšties. Sugalvojome vegan baltymai planą.',
    )
    expect(out).toMatch(/Ar jauti vasaros nuovargį/i)
    expect(out).toContain('reikiamų baltymų')
    expect(out).toMatch(/Veganiški baltymai/i)
    expect(out).toContain('sojos gaminiai')
    expect(out).toContain('aminorūgštis')
    expect(out).toMatch(/veganiškų baltymų planą/i)
    expect(out).not.toMatch(/jaučiasi|reikiamo baltymai|sojos gami\b|aminorūgšties|vegan baltymai/i)
  })

  it('fixes cycling-nutrition screenshot grammar', () => {
    const out = normalizeLtUgcMultiline(
      'Su teisingu režimu ir maistinu galėsi mėgautis. Lengvų angidratų ir baltymų. O vaisiai. Papildomai įkrauti. Dažnas pamiršta atsistatymą. Pradėk 5 min.',
    )
    expect(out).toContain('maitinimu')
    expect(out).toMatch(/angliavanden/i)
    expect(out).toMatch(/vaisiai papildomai įkrauna|įkrauk energiją/i)
    expect(out).toMatch(/Dažnai pamiršti/i)
    expect(out).not.toMatch(/Pradėk 5 min|🤩/i) // CTA/emoji belong in cta field only
    expect(out).not.toMatch(/\bmaistinu\b|angidrat|Papildomai įkrauti/i)
  })

  it('fixes proactive nutrition / EN slips', () => {
    const out = normalizeLtUgcMultiline(
      'Trūksta energija po workout. Meal prep padeda. Organizmas reikia baltimų ir anglevandenių. Link in bio.',
    )
    expect(out).toMatch(/trūksta energijos/i)
    expect(out).toMatch(/treniruot/i)
    expect(out).toMatch(/maisto ruošimas/i)
    expect(out).toMatch(/organizmui reikia/i)
    expect(out).toContain('baltymų')
    expect(out).toMatch(/angliavanden/i)
  })

  it('fixes weight-slide typos and strips emoji spam from body', () => {
    const out = normalizeLtUgcMultiline(
      'Svarstyklės irgi įsismuovė. Ieško greito atsvarumo. Priklauso nuo hidratacijąjos. Štai kodėl koncentruotis į vieną skaitmenį. Pradėk 5 min. testą! 🤩! 🤩! 🤩! 🤩! 🤩',
    )
    expect(out).toMatch(/šoka/i)
    expect(out).toContain('nusiraminimo')
    expect(out).toContain('hidratacijos')
    expect(out).toMatch(/neverta koncentruotis/i)
    expect(out).not.toMatch(/🤩|Pradėk 5 min|įsismuov|atsvarumo|hidratacijąj/i)
  })

  it('fixes dalybams → dalykams', () => {
    expect(normalizeLtUgcMultiline('pinigų, skirtų svarbiausiems dalybams.')).toContain('dalykams')
    expect(normalizeLtUgcMultiline('pinigų, skirtų svarbiausiems dalybams.')).not.toMatch(/dalybams/i)
  })

  it('preserves lowercase when fixing angliavandeniai mid-sentence', () => {
    const out = normalizeLtUgcMultiline('... nes greitas angliavandenis kenkia.')
    expect(out).toContain('greiti angliavandeniai')
    expect(out).not.toMatch(/\bGreiti angliavandeniai\b/)
    expect(out).toMatch(/\bnes greiti angliavandeniai\b/i)
  })

  it('flags verbless genitive noun stumps', () => {
    expect(isGibberishLtCopy('Nuo receptų iki tvarkaraščio.')).toBe(true)
    expect(isGibberishLtCopy('Nuo prieskonių iki aliejaus.')).toBe(true)
    expect(isGibberishLtCopy('Lengvų angliavandenių ir baltymų.')).toBe(true)
    expect(isGibberishLtCopy('Be kantrybės ir motyvacijos.')).toBe(true)
    expect(isGibberishLtCopy('Mažiau streso ir spaudimo.')).toBe(true)
  })

  it('inserts participial comma before turintis/turinti', () => {
    expect(normalizeLtUgcMultiline('Maistas turintis daug baltymų ir skaidulų suteikia ilgalaikį sotumo jausmą.')).toContain(
      'Maistas, turintis',
    )
  })

  it('fixes post-91 grammar slips', () => {
    expect(normalizeLtUgcMultiline('Dažnai jauči mieguistumas ir tingulys po pietų.')).toMatch(
      /jauti mieguistumą ir tingulį/i,
    )
    expect(normalizeLtUgcMultiline('Kai turi aiškų mitybos planas žingsnis po žingsnio.')).toContain(
      'mitybos planą',
    )
    expect(normalizeLtUgcMultiline('Dažnas susiduri su begalės užduočių iki švenčių.')).toContain(
      'begale užduočių',
    )
  })

  it('fixes posts 92-96 grammar and phrasing', () => {
    expect(normalizeLtUgcMultiline('Dabar supranti, kodėl verta planuoti.')).toContain('Prisimink, kodėl verta planuoti.')
    expect(normalizeLtUgcMultiline('Dabar supranti, kodėl verta planuoti.')).not.toContain('Dabar supranti')
    expect(normalizeLtUgcMultiline('neturi laiko susivildavimas ir improvizacija.')).toMatch(
      /susivėlavimu/i,
    )
    expect(normalizeLtUgcMultiline('neturi laiko improvizacija.')).toContain('improvizacijai')
    expect(normalizeLtUgcMultiline('Štai kodėl dažnai pasirenkami pigesni sprendimai.')).toContain(
      'Todėl dažnai',
    )
    expect(normalizeLtUgcMultiline('Supratusi savo individualius poreikius galėsi pasirinkti.')).toMatch(
      /Supratęs savo/i,
    )
    expect(normalizeLtUgcMultiline('Dažnai priimti įvykius sunaudoja daug energijos.')).toContain(
      'priimti sprendimus',
    )
    expect(normalizeLtUgcMultiline('Dabar žinai, kad mažiau sprendimų.')).toContain('reiškia daugiau energijos')
  })

  it('fixes food-waste screenshot typos', () => {
    const out = normalizeLtUgcMultiline(
      'Daržovės greitai subręsta. Dėl to dažnas jauti varginamas, o rūpestų krūvį. Kad niekas nešlamžtų. Planuoti kasdien. Nėra lengva užduotis.',
    )
    expect(out).toMatch(/genda/i)
    expect(out).toMatch(/dažnai jauti nuovargį/i)
    expect(out).toContain('rūpesčių')
    expect(out).toContain('nesugestų')
    expect(out).toMatch(/Planuoti kasdien nėra lengva/i)
    expect(out).not.toMatch(/subręst|nešlamž|rūpestų|varginamas/i)
  })

  it('rewrites we-forms and removes autumn drift from August samples', () => {
    const out = normalizeLtUgcMultiline(
      'Ar kada nors pastebėjau, kad susiduriame su švaistymu? Dažnas nori sveikiau, bet perkame per daug ir išmetame. „Tavo knyga" fokusuoja į įpročius. Rugpjūtis prieš rudenių darbų pradžią.',
    )
    expect(out).toMatch(/pastebėjai/i)
    expect(out).toMatch(/susiduri/i)
    expect(out).toMatch(/perki/i)
    expect(out).toMatch(/išmeti/i)
    expect(out).toMatch(/kreipia dėmesį/i)
    expect(out).toMatch(/vasaros/i)
    expect(out).not.toMatch(/pastebėjau|susiduriame|perkame|išmetame|fokusuoja|ruden/i)
  })

  it('fixes wilted-salad batch: dedame, suverstų, pasiskirstyk', () => {
    const s1 = normalizeLtUgcMultiline(
      'Šilumos dar nepaleidžia, o tu jau ruošies rudeniui. Ką dedame į savaitės salotas?',
    )
    expect(s1).toMatch(/Ką dedi į/i)
    expect(s1).not.toMatch(/dedame/i)

    const s2 = normalizeLtUgcMultiline(
      'Pamatai parduotuvėje suverstų daržovių kalną, bet nežinai kur pradėti.',
    )
    expect(s2).toMatch(/suverstą daržovių kalną/i)
    expect(s2).not.toMatch(/suverstų/i)

    const s3 = normalizeLtUgcMultiline(
      'Štai kaip išnaudoji viską, ką pasiūlo vasara. Pasiskirstyk daržoves savaitgaliams ir mėgausiesi!',
    )
    expect(s3).toMatch(/Paskirstyk daržoves savaitei/i)
    expect(s3).not.toMatch(/pasiskirstyk|savaitgaliams/i)

    expect(
      isGibberishLtCopy('Ką dedame į salotas? Pasiskirstyk daržoves. Suverstų daržovių kalną.'),
    ).toBe(true)
  })

  it('fixes cycling meta leftovers: angidrat + įkrauti jėgas + maistinu', () => {
    const out = normalizeLtUgcMultiline(
      'Prieš važiavimą reikia lengvų angidratų. O vaisiai. Papildomai įkrauti jėgas. Su teisingu režimu ir maistinu galėsi mėgautis.',
    )
    expect(out).toMatch(/angliavanden/i)
    expect(out).toMatch(/įkrauna jėgas|įkrauk jėgas/i)
    expect(out).toContain('maitinimu')
    expect(out).not.toMatch(/angidrat|maistinu|Papildomai įkrauti/i)
  })

  it('fixes spring-caption formal CTA and atskiriasi / apgavusius', () => {
    const out = normalizeLtUgcMultiline(
      'Mes atskiriasi nuo trumpalaikių planų. Vengk apgavusius sprendimus. Pradėkite 5 min. testą ir raskite planą, pritaikytą būtent jums.',
    )
    expect(out).toMatch(/skiriamės/i)
    expect(out).toMatch(/apgauling/i)
    expect(out).toMatch(/\btau\b/i)
    expect(out).toMatch(/rask planą/i)
    expect(out).not.toMatch(/atskiriasi|apgavus|Pradėkite|raskite|\bjums\b/i)
    // CTA line is stripped from body (belongs in cta field only)
    expect(out).not.toMatch(/tavoknyga\.com|🤩/i)
  })

  it('does not inject URL into body for soft CTAs', () => {
    const out = normalizeLtUgcMultiline('Sužinok daugiau apie savaitės planus.')
    expect(out).not.toMatch(/tavoknyga\.com/i)
    expect(out.length).toBeGreaterThan(10)
  })
})

describe('stripLtEmDashes', () => {
  it('splits em-dash clauses into sentences', () => {
    const out = stripLtEmDashes('Užpildyk testą — gauk knygą.')
    expect(out).toBe('Užpildyk testą. Gauk knygą.')
    expect(out).not.toMatch(/—|–/)
  })
})

describe('isGibberishLtCopy', () => {
  it('flags llama3.1 word salad from failed batches', () => {
    expect(isGibberishLtCopy('bet kuo žaidžiami laikui nebebegaja')).toBe(true)
    expect(isGibberishLtCopy('Niekada nesuvokiamas dienoraščio,')).toBe(true)
  })

  it('flags invented words and broken kodėl+infinitive', () => {
    expect(isGibberishLtCopy('Svarstyklės įsismuovė nuo hidratacijąjos')).toBe(true)
    expect(isGibberishLtCopy('Štai kodėl koncentruotis į vieną skaitmenį')).toBe(true)
    expect(isGibberishLtCopy('Lengvų angliavandenių ir baltymų.')).toBe(true)
  })

  it('allows normal LT meal-prep copy', () => {
    expect(isGibberishLtCopy('Kiekvieną vakarą vėl sprendžiu, ką gaminti. Planas tai išsprendžia.')).toBe(
      false,
    )
    expect(isGibberishLtCopy('Štai kodėl neverta koncentruotis į vieną skaitmenį.')).toBe(false)
  })
})

describe('hasFormalRegister', () => {
  it('detects formal forms', () => {
    expect(hasFormalRegister('Jums tai padės.')).toBe(true)
    expect(hasFormalRegister('Tau tai padės.')).toBe(false)
  })
})

describe('posts 97–100 phrase fixes', () => {
  it('fixes žini, case, collocation, and fragment patterns', () => {
    expect(normalizeLtUgcMultiline('Ar visada žini, ką gaminti?')).toContain('žinai')
    expect(normalizeLtUgcMultiline('Pradėk ruošti maisto kasdien.')).toContain('ruošti maistą')
    expect(normalizeLtUgcMultiline('Ką pasikeitė tavo rutinoje?')).toContain('Kas pasikeitė')
    expect(normalizeLtUgcMultiline('Tu pasirinksiesi tinkamą variantą.')).toContain('pasirinksi')
    expect(normalizeLtUgcMultiline('Impulsinės pirkimo situacijos vargina.')).toMatch(/impulsyvaus pirkimo/i)
    expect(normalizeLtUgcMultiline('Maisto skoniu gali būti paveiktas kūno balansas.')).toContain(
      'Netinkamu maisto pasirinkimu',
    )
    expect(normalizeLtUgcMultiline('Svoris vis tiek nedrįsta kristi.')).toContain('nemažėja')
    expect(normalizeLtUgcMultiline('Tai padės tau įsitikinti.')).toMatch(/įsitikinti, kad planas veikia/i)
    expect(isGibberishLtCopy('Tu pasirinksiesi tinkamą variantą.')).toBe(true)
    expect(isGibberishLtCopy('Ar visada žini, ką gaminti?')).toBe(true)
  })
})

describe('posts 101–103 phrase fixes and gates', () => {
  it('fixes rules 12–18 phrase patterns', () => {
    expect(normalizeLtUgcMultiline('Popietė be kritimo: ar įmanoma?')).toContain(
      'Popietė be energijos kritimo',
    )
    expect(normalizeLtUgcMultiline('Taip grįžta kontrolė savo dienoje.')).toContain('atgauni kontrolę')
    expect(normalizeLtUgcMultiline('Aiškus planas padeda kasdien maistą rinktis ramiau.')).toMatch(
      /ramiai rinktis maistą/i,
    )
    expect(normalizeLtUgcMultiline('Planuodamas savaitę, renkiesi produktus.')).toMatch(/Kai planuoji/i)
    expect(normalizeLtUgcMultiline('Dažnas susiduria su tuo pačiu.')).toContain('Daugelis susiduria')
    expect(normalizeLtUgcMultiline('Įprotis įsitvirtina stabiliai.')).toBe('Įprotis įsitvirtina.')
    expect(normalizeLtUgcMultiline('Tau trūksta aiškių žingsnių, ką daryti.')).toContain(
      'trūksta aiškumo, ką daryti',
    )
  })

  it('declarative_question_mark passes colon hooks and rhetorical Jauti questions', () => {
    expect(isDeclarativeQuestionMark('Maisto ruošimas: kodėl tai baugina?')).toBe(false)
    expect(isDeclarativeQuestionMark('30-metis: ką dabar?')).toBe(false)
    expect(isDeclarativeQuestionMark('Popietė be energijos kritimo: ar tai įmanoma?')).toBe(false)
    expect(isDeclarativeQuestionMark('Jauti, kad ruošti maistą tampa varginantis procesas?')).toBe(false)
    expect(isDeclarativeQuestionMark('Jauti mieguistumą po pietų ir negali susikaupti?')).toBe(false)
    expect(isDeclarativeQuestionMark('Netinkamas maistas gali sugadinti visą popietę?')).toBe(true)
    expect(
      collectSlideIssues({
        role: 'hook',
        title: 'Netinkamas maistas gali sugadinti visą popietę?',
        body: 'Po pietų jauti nuovargį.',
      }).map((issue) => issue.code),
    ).toContain('declarative_question_mark')
    expect(
      textHasDeclarativeQuestionMark('Maisto ruošimas: kodėl tai baugina? Jauti spaudimą krūtinėje.'),
    ).toBe(false)
  })

  it('slidesHaveFoodAnchor scans last two bodies and close CTA only', () => {
    expect(
      slidesHaveFoodAnchor([
        { role: 'hook', body: 'Gyvenimo etapas keičiasi greitai.' },
        { role: 'context', body: 'Emocijos vargina kasdien.' },
        { role: 'build', body: 'Aiškus planas padeda ramiau rinktis maistą kasdien.' },
        { role: 'close', body: 'Dabar žinai, kad mažiau sprendimų reiškia daugiau energijos.', cta: 'Pradėk 5 min. testą! 🤩' },
      ]),
    ).toBe(true)
    expect(
      slidesHaveFoodAnchor([
        { role: 'hook', body: 'Naujas gyvenimo etapas.' },
        { role: 'context', body: 'Emocijos vargina.' },
        { role: 'build', body: 'Aiškus planas keičia kasdienybę.' },
        { role: 'close', body: 'Dabar žinai, kad mažiau sprendimų.', cta: 'Pradėk testą!' },
      ]),
    ).toBe(false)
  })
})

describe('posts 104–105 phrase fixes and gates', () => {
  it('fixes rules 20–21 phrase patterns', () => {
    expect(normalizeLtUgcMultiline('Dažnai esi dažnoje virtuvėje ir spėlioji.')).toContain('dažnai virtuvėje')
    expect(normalizeLtUgcMultiline('Tai sukelia streso ir paskatino ieškoti sprendimo.')).toMatch(
      /sukelia stresą ir paskatina/i,
    )
    expect(normalizeLtUgcMultiline('Stresas sukelia diskomforto pojūtį.')).toContain('sukelia diskomfortą')
  })

  it('fixes stress-eating grammar: nesusimastyk, maitina tavęs, saldumams, palaimos', () => {
    const build = normalizeLtUgcMultiline(
      'Emocinis stresas gali sukelti norą ieškoti greito komforto maiste. Tai dažnai vyksta nesusimastyk, siekiant trumpalaikės palaimos.',
    )
    expect(build).toContain('nesusimąstant')
    expect(build).toContain('trumpalaikio malonumo')
    expect(build).not.toMatch(/nesusimastyk/i)
    expect(normalizeLtUgcMultiline('Stresas: ar tai maitina tavęs?')).toContain('maitina tave')
    expect(normalizeLtUgcMultiline('Tu jauti spaudimą pasiduoti saldumams.')).toContain(
      'pasiduoti saldumynams',
    )
  })

  it('systemic rhetorical tu-questions: repair . → ?; declarative Prisimink, kad stays .', () => {
    const rawIsisavini =
      'Įsisavini naujus įpročius lengvai ir nuosekliai. Maisto derinys sustiprina kūno lankstumą.'
    expect(textHasRhetoricalTuQuestionMissingMark(rawIsisavini)).toBe(true)
    expect(
      collectSlideIssues({ body: rawIsisavini, role: 'build' }).map((i) => i.code),
    ).toContain('question_mark')
    const outIsisavini = normalizeLtUgcMultiline(rawIsisavini)
    expect(outIsisavini).toContain('nuosekliai?')
    expect(outIsisavini).not.toMatch(/nuosekliai\.\s+Maisto/)
    expect(textHasRhetoricalTuQuestionMissingMark(outIsisavini)).toBe(false)
    expect(() => assertShipableLtSlide({ body: outIsisavini, role: 'build' })).not.toThrow()

    const rawMatai = 'Matai, kaip lengvai keičiasi rutina.'
    expect(normalizeLtUgcMultiline(rawMatai)).toMatch(/\?$/)
    expect(textHasRhetoricalTuQuestionMissingMark(rawMatai)).toBe(true)

    const rawSupranti =
      'Galima susidoroti su savaitės valgiaraščiu, atsižvelgiant į biudžetą. Supranti, kad tau reikia pagalbos ir nori sutaupyti laiko bei pinigų.'
    const outSupranti = normalizeLtUgcMultiline(rawSupranti)
    expect(outSupranti).toContain('. Prisimink, kad tau reikia pagalbos')
    expect(outSupranti).not.toContain('Supranti, kad')
    expect(outSupranti).toMatch(/\.\s*$/)
    expect(textHasRhetoricalTuQuestionMissingMark(outSupranti)).toBe(false)
  })

  it('flags engagement bait meta scroll lines', () => {
    const bait = 'Dauguma sustoja čia. Toliau dalis, kuri skaudžia.'
    const baitVariant = 'Toliau dalis, kuri skaudi.'
    expect(textHasEngagementBait(bait)).toBe(true)
    expect(textHasEngagementBait(baitVariant)).toBe(true)
    expect(textHasEngagementBait('Toliau skaudžiausia dalis.')).toBe(true)
    expect(
      collectSlideIssues({ body: bait, role: 'context' }).map((i) => i.code),
    ).toContain('engagement_bait')
    expect(() => assertShipableLtSlide({ body: bait, role: 'context' })).toThrow()
  })

  it('declarative_question_mark: Tai gali būti passes; Tai sukelia fails', () => {
    expect(isDeclarativeQuestionMark('Tai gali būti ženklas, jog tau trūksta atsargų?')).toBe(false)
    expect(isDeclarativeQuestionMark('Tai sukelia stresą ir netolygų energijos lygį?')).toBe(true)
    expect(
      textHasDeclarativeQuestionMark(
        'Ar ieškai paguodos maiste? Jauti, kad po sunkios darbo dienos dažnai nori užkąsti ką nors skanaus? Tai gali būti ženklas, jog tau trūksta atsargų?',
      ),
    ).toBe(false)
    expect(
      normalizeLtUgcMultiline('Tai sukelia stresą ir netolygų energijos lygį?'),
    ).not.toMatch(/\?$/)
  })

  it('post 04 close passes ship gate with supranti and slepiasi', () => {
    const body =
      'Dabar supranti, kokie dideli pinigų taupymo variantai slepiasi ruošiant maistą. namuose.'
    expect(() =>
      assertShipableLtSlide({
        role: 'close',
        body: normalizeLtUgcMultiline(body),
      }),
    ).not.toThrow()
  })

  it('textHasFiniteVerbCue matches reflexive -asi without list entry', () => {
    expect(textHasFiniteVerbCue('Variantai slepiasi ruošiant maistą.')).toBe(true)
    expect(textHasFiniteVerbCue('Planas keičiasi kiekvieną savaitę.')).toBe(true)
  })

  it('isOffTopicNonFoodLtCopy flags clothing hooks without food anchor', () => {
    expect(
      isOffTopicNonFoodLtCopy(
        'Ar bužių dydis: koks jis iš tiesų? Drabužių dydis: koks jis iš tiesų?',
      ),
    ).toBe(true)
    expect(isOffTopicNonFoodLtCopy('Ar drabužiai tinka tavo maisto planui?')).toBe(false)
  })
})
