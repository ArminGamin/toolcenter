// Editorial hypotheses, not measured keyword volumes or live SERP findings.
export const GIFT_SEARCH_PLANS = [
  ['Kalėdinės dovanos', 'Kaip išrinkti kalėdinę dovaną žmogui, kuris viską turi?', 'Turimi daiktai; kasdienis įprotis; kada geriau bendras laikas.'],
  ['Kalėdinių dovanų idėjos', 'Kaip išrinkti kalėdinę dovaną pagal žmogaus pomėgį?', 'Vienas konkretus pomėgis; naudojimo aplinkybės; ko paklausti prieš perkant.'],
  ['Dovanos vyrui', 'Kaip išrinkti dovaną vyrui, mėgstančiam praktiškus daiktus?', 'Naudojimo dažnis; jau turimas pakaitalas; dydžio ar suderinamumo patikra.'],
  ['Dovanos moteriai', 'Kaip išrinkti dovaną moteriai, kai nežinote jos skonio?', 'Žinomas įprotis; vengti spėti kvapą ar stilių; ką išsiaiškinti.'],
  ['Dovanos mamai', 'Kaip išrinkti dovaną mamai ramiems vakarams namuose?', 'Poilsio įprotis; medžiaga ir priežiūra; nesieti dovanos su buities pareigomis.'],
  ['Dovanos tėčiui', 'Kaip išrinkti dovaną tėčiui, kuris sako, kad nieko nereikia?', 'Konkretus kasdienis nepatogumas; paklausti apie turimą daiktą; kada nepirkti.'],
  ['Dovanos porai', 'Kaip išrinkti bendrą kalėdinę dovaną porai?', 'Abiejų poreikiai; bendras ritualas; vieta namuose.'],
  ['Dovanos draugams', 'Kaip išrinkti dovaną draugui pagal bendrą prisiminimą?', 'Vienas tikras prisiminimas; ryšys su naudingu daiktu; asmeniška kortelė be išgalvotos istorijos.'],
  ['Dovanos iki 20 €', 'Ką patikrinti renkantis Slaptojo Senelio dovaną iki 20 €?', 'Sutartas limitas; neutrali nauda kolegai; visa suma su pristatymu.'],
  ['Dovanos iki 30 €', 'Kaip išrinkti įkurtuvių dovaną iki 30 € mažam būstui?', 'Vieta ir matmenys; dubliuojami daiktai; biudžetas su pristatymu.'],
  ['Dovanos iki 50 €', 'Kaip išrinkti dovaną iki 50 €: vieną daiktą ar rinkinį?', 'Vieno daikto nauda prieš kelių daiktų naudą; nereikalingi priedai; tikrinti bendrą kainą.'],
  ['Paskutinės minutės dovanos', 'Ką patikrinti perkant kalėdinę dovaną paskutinę minutę?', 'Patvirtintas terminas ir likutis; nepainioti išsiuntimo su gavimu; nesiūlyti negarantuoto pristatymo.'],
  ['Originalios kalėdinės dovanos', 'Kaip parinkti asmenišką kalėdinę dovaną be graviravimo?', 'Ryšys su gavėjo įpročiu; prasmingas palinkėjimas; originalumas nėra daikto naujumas.'],
  ['Praktiškos dovanos', 'Kaip atskirti praktišką dovaną nuo daikto, kuris liks spintoje?', 'Konkreti naudojimo situacija; priežiūros našta; turimas pakaitalas.'],
  ['Jaukios kalėdinės dovanos', 'Kaip išrinkti dovaną žmogui, mėgstančiam skaityti?', 'Kur žmogus skaito; patogumo poreikis; kada dar vienas pledas ar puodelis nereikalingas.'],
  ['Kalėdų dekoracijos', 'Kaip išrinkti kalėdinę dekoraciją dovanai mažam būstui?', 'Matmenys; vieta ir laikymas po švenčių; gavėjo stilius. Nekišti nesusijusių prekių.'],
  ['Slaptasis Senelis', 'Ką dovanoti mažai pažįstamam kolegai per Slaptąjį Senelį?', 'Neutrali darbo aplinkos dovana; vengti asmeniškų ir pašaipių užuominų; pasitikslinti taisykles.'],
  ['Kalėdiniai pirkiniai Lietuvoje', 'Ką patikrinti prieš užsakant kalėdines dovanas internetu?', 'Prekės specifikacija; pardavėjo kontaktai; aktualios pristatymo ir grąžinimo sąlygos be teisinių pažadų.'],
].map(([cluster, question, decisionPoints]) => ({ cluster, question, decisionPoints }))

const normalize = (topic: string) => topic.normalize('NFC').trim().toLocaleLowerCase('lt-LT').replace(/[?!.]+$/, '')
export function giftSearchPlan(topic: string) {
  return GIFT_SEARCH_PLANS.find((plan) => [plan.cluster, plan.question].some((text) => normalize(text) === normalize(topic)))
    ?? { cluster: topic, question: topic, decisionPoints: 'Atsakykite į vieną temos klausimą: konkretus pasirinkimo kriterijus, pavyzdys, ribojimas ir kitas veiksmas.' }
}
export const GIFT_GUIDE_TOPICS = GIFT_SEARCH_PLANS.map((plan) => plan.question)

export function giftTopicTerms(text: string) {
  return [...new Set((text.toLocaleLowerCase('lt-LT').match(/[\p{L}]{4,}/gu) || [])
    .filter((word) => !/^(?:kaip|pagal|dovan|kalėd|žmog|mėgst|rink|išrink|pasirink|parink|kuri|geriaus|idėj|patikrin|renkant|vieną|vienas|daikt|viską|turi|nieko|nereikia|sako|nežin|prieš|užsak|perkant)/u.test(word))
    .map((word) => word.slice(0, 5)))]
}

export function giftTopicOverlap(left: string, right: string) {
  const terms = new Set(giftTopicTerms(right))
  return giftTopicTerms(left).filter((term) => terms.has(term)).length
}
