/**
 * Lithuanian UGC copy normalizer — fixes formal „jūs“, common EuroLLM grammar slips, repeated „Mes“ openers.
 */

import { hasWrongUgcSeasonReference, isSeasonalUgcTheme, sanitizeLtSeasonCopy, seasonEchoCount, UGC_SEASON_ECHO_RE } from './ugc-season-context.js'
import { ugcActiveCta } from './ugc-cta-normalize.js'
import { isAllowedKaleduCta } from './ugc-kaledu-cta.js'
import { applyUniversalLtClassRepairs, collectUniversalClassStoryIssues, hasCircularCausalClaim } from './ugc-lt-classes.js'
import { collectLtArCoordinationIssues, collectLtCaseAgreementIssues, collectLtInstrumentalIssues, looksLtGenitiveEnding, repairLtCaseAgreement } from './ugc-lt-case-check.js'
import { isChristmasGiftsNiche } from './profile-brand.js'
import {
  christmasFieldEmojiOk,
  extractKaleduEmojis,
  isAllowedKaleduEmoji,
} from './ugc-kaledu-emoji.js'

/**
 * Canonical LT sentence-initial interrogative words — single source of truth for
 * "does this title/sentence need a trailing '?'" checks across the codebase.
 */
export const LT_QUESTION_STARTER_RE = /^(Ar|Kodėl|Kaip|Argi)\b/iu

/** Final clause question words (colon-hook titles: „Label: kodėl …?"). */
export const LT_QUESTION_WORD_START_RE = /^(Ar|Kodėl|Kaip|Ką|Kas|Kur|Kada|Kiek|Ko|Argi)\b/iu

/** Rhetorical yes/no without „Ar" — valid hook/body questions (declarative-? exemption). */
export const LT_RHETORICAL_QUESTION_VERB_RE =
  /^(jauti|nori|žinai|supranti|galvoji|jautiesi|stengiesi|planuoji|esi|gali|negali|įsisavini)\b/iu

/** Direct tu-form rhetorical questions — repair + ship gate (not declarative „Supranti, kad…"). */
export const LT_RHETORICAL_DIRECT_QUESTION_RE =
  /^(?:tu\s+)?(?:galbūt\s+)?(jauti|nori|norėtum|jautiesi|stengiesi|planuoji|įsisavini|matai|bijoji|drįsti|pasiruoši|galvoji)\b/iu

/** Declarative insight — keep trailing „." (build/close payoff). */
export const LT_DECLARATIVE_INSIGHT_RE = /^(prisimink|žinai|žinoji)\s*,\s*(kad|jog)\b/iu

export const LT_RHETORICAL_PARTICIPLE_HOOK_RE = /^(pavargęs|pavargusi|įstrigęs|įstrigusi)\b/iu

/** Food/mityba anchor for brand_drift — slide bodies + close CTA only (not caption). */
export const UGC_FOOD_ANCHOR_RE =
  /\b(maist\w*|mityb\w*|valg\w*|recept\w*|piet\w*|vakarien\w*|užkand\w*|meniu|maisto\s+ruoš\w*)\b/iu

/**
 * Gift/Christmas scene anchors. Use `(?<!\p{L})…(?!\p{L})` — JS `\b` treats š/ž/ė as
 * non-word, so `\bšvent` never matches „Šventinis“ / „šventė“.
 * Includes concrete gift-scene stems (juostelė, staigmena, paštas, įdėti…) so a
 * kalėdinė dovana story need not repeat the literal theme tokens.
 */
export const UGC_GIFT_ANCHOR_RE =
  /(?<!\p{L})(dovan\p{L}*|kalėd\p{L}*|kaled\p{L}*|kampel\p{L}*|kaledukampelis|švent\p{L}*|dekora\p{L}*|eglut\p{L}*|išpakuoj\p{L}*|pled\p{L}*|žvak\p{L}*|juostel\p{L}*|staig(?:men|tyb)\p{L}*|pašt\p{L}*|įdėt\p{L}*|pakuot\p{L}*|paslėpt\p{L}*)(?!\p{L})/iu

export const UGC_DIET_DRIFT_RE =
  /\b(mityb\w*|kalorij\w*|diet\w*|angliavanden\w*|makroelement\w*|svorio\s+(?:netek|tiksl)|maisto\s+plan|tavoknyga|5\s*min\.?\s*test)\b/iu

export const UGC_KALEDU_DIET_LEAK_RE =
  /tavoknyga|kalorij|mitybos knyga|angliavanden|5\s*min\.?\s*test|(?<!\p{L})testas(?!\p{L})|(?<!\p{L})(maist\p{L}*|mityb\p{L}*|valgym\p{L}*|recept\p{L}*|porcij\p{L}*|svor\p{L}*)(?!\p{L})|maisto\s+sprendim\p{L}*|valgymo\s+ritm\p{L}*|mitybos\s+ritm\p{L}*/iu

const OFF_TOPIC_NON_FOOD_RE = /\b(drabuž|bužių|aprang|kūno proporcij|dydžio)\b/iu
const HOOK_COLON_TEMPLATE_RE = /:\s*koks jis iš tiesų\?/giu

/** Clothing/body-image or repeated colon-template hooks with no food anchor — off-channel for Tavo knyga UGC. */
export function isOffTopicNonFoodLtCopy(text: string): boolean {
  const t = String(text || '').trim()
  if (!t) return false
  const colonMatches = t.match(HOOK_COLON_TEMPLATE_RE)
  if (colonMatches && colonMatches.length >= 2) return true
  if (isChristmasGiftsNiche()) return false
  if (OFF_TOPIC_NON_FOOD_RE.test(t) && !UGC_FOOD_ANCHOR_RE.test(t)) return true
  return false
}

/** Normalize hook title/body for echo comparison (case + trailing punctuation). */
function normalizeHookEchoKey(s: string): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[.!?…]+$/u, '')
    .replace(/\s+/g, ' ')
}

/** True when hook body opens with the same sentence as the title (any title length). */
export function hookBodyEchoesTitle(title: string, body: string): boolean {
  const normTitle = normalizeHookEchoKey(title)
  if (!normTitle) return false
  const sentences = String(body || '')
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (!sentences.length) return false
  const normFirst = normalizeHookEchoKey(sentences[0])
  return Boolean(normFirst && (normFirst === normTitle || normFirst.startsWith(normTitle)))
}

/**
 * Strip a leading body sentence that repeats the hook title verbatim (normalized).
 * Aug-9 batch: intermittent generation echo — normalization backstop, not prompt-only.
 */
export function stripTitleEchoFromBody(title: string, body: string): string {
  const normTitle = normalizeHookEchoKey(title)
  if (!normTitle) return body
  const sentences = String(body || '')
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (!sentences.length) return body
  const normFirst = normalizeHookEchoKey(sentences[0])
  if (normFirst && (normFirst === normTitle || normFirst.startsWith(normTitle))) {
    return sentences.slice(1).join(' ').trim()
  }
  return body
}

/** Colon-tailed interrogative titles missing their "?". */
export function hasUnmarkedColonQuestion(title: string): boolean {
  if (!title) return false
  return (
    /:\s*(kodėl|ką|kaip|kas|kur|kada|kiek|nuo ko)(?!\p{L})[^?]*$/iu.test(title) ||
    /:\s*\p{L}+(?:\s+\p{L}+){0,3}\s+ar\s+\p{L}+[^?]*$/iu.test(title)
  )
}

/**
 * Apply [RegExp, replacement] rewrites while preserving matched text casing on output.
 * Case-insensitive rules no longer capitalize mid-sentence lowercase matches.
 */
function applyCasePreserving(text: string, re: RegExp, replacement: string): string {
  if (!re.flags.includes('i')) return text.replace(re, replacement)
  return text.replace(re, (matched: string, ...rest: unknown[]) => {
    const groups = rest.slice(0, rest.length - 2) as string[]
    const substituted = replacement.replace(/\$(\d)/g, (_m, digit: string) => {
      const idx = Number(digit) - 1
      return groups[idx] ?? ''
    })
    const letters = matched.match(/\p{L}/gu)
    if (!letters || !letters.length) return substituted
    const firstLetterIdx = substituted.search(/\p{L}/u)
    if (firstLetterIdx === -1) return substituted
    const isAllCaps = letters.length > 1 && letters.every((c) => c === c.toUpperCase() && c !== c.toLowerCase())
    if (isAllCaps) return substituted.toUpperCase()
    const firstIsUpper = letters[0] === letters[0].toUpperCase() && letters[0] !== letters[0].toLowerCase()
    const targetCase =
      firstIsUpper ? substituted.charAt(firstLetterIdx).toUpperCase() : substituted.charAt(firstLetterIdx).toLowerCase()
    return substituted.slice(0, firstLetterIdx) + targetCase + substituted.slice(firstLetterIdx + 1)
  })
}

const FORMAL_TO_TU: Array<[RegExp, string]> = [
  [/\bjaučiatės\b/giu, 'jauti'],
  [/\bjaučiate\b/giu, 'jauti'],
  [/(?<!\p{L})jaučiat(?!\p{L})/giu, 'jauti'],
  [/\bjums\b/giu, 'tau'],
  [/\bjūsų\b/giu, 'tavo'],
  [/\bJums\b/g, 'Tau'],
  [/\bJūsų\b/g, 'Tavo'],
  [/\bbūtent jums\b/giu, 'būtent tau'],
  [/\bpritaikytą būtent jums\b/giu, 'pritaikytą būtent tau'],
  [/\bPradėkite\b/g, 'Pradėk'],
  [/\bpradėkite\b/g, 'pradėk'],
  [/\bPajuskite\b/g, 'Pajusk'],
  [/\bpajuskite\b/g, 'pajusk'],
  [/\bpajautekite\b/giu, 'pajusk'],
  [/\bPajautekite\b/g, 'Pajusk'],
  [/\bgalite\b/giu, 'gali'],
  [/\bGalite\b/g, 'Gali'],
  [/\bturite\b/giu, 'turi'],
  [/\bTurite\b/g, 'Turi'],
  [/\besate\b/giu, 'esi'],
  [/\bEsate\b/g, 'Esi'],
  [/\bbūsite\b/giu, 'būsi'],
  [/\bžinote\b/giu, 'žinai'],
  [/\bŽinote\b/g, 'Žinai'],
  [/\bnorite\b/giu, 'nori'],
  [/\bNorite\b/g, 'Nori'],
  [/\braskite\b/giu, 'rask'],
  [/\bRaskite\b/g, 'Rask'],
  [/\bskaitykite\b/giu, 'skaityk'],
  [/\bSkaitykite\b/g, 'Skaityk'],
  [/\bbandykite\b/giu, 'bandyk'],
  [/\bBandykite\b/g, 'Bandyk'],
  [/\bpamėginkite\b/giu, 'pamėgink'],
  [/\bdarykite\b/giu, 'daryk'],
  [/\bDarykite\b/g, 'Daryk'],
  [/\bPabandykite\b/g, 'Pabandyk'],
  [/\bpabandykite\b/g, 'pabandyk'],
  [/\bUžsiregistruokite\b/g, 'Užsiregistruok'],
  [/\bužsiregistruokite\b/g, 'užsiregistruok'],
  [/\bPasirinkite\b/g, 'Pasirink'],
  [/\bpasirinkite\b/g, 'pasirink'],
  [/\bApsilankykite\b/g, 'Apsilankyk'],
  [/\bapsilankykite\b/g, 'apsilankyk'],
  [/\bprisijunkite\b/giu, 'prisijunk'],
  [/\bnežinote\b/giu, 'nežinai'],
  [/\bNežinote\b/g, 'Nežinai'],
  [/\bpadėkite\b/giu, 'padėk'],
  [/\bužpildykite\b/giu, 'užpildyk'],
  [/\bUžpildykite\b/g, 'Užpildyk'],
  [/\bsuplanuokite\b/giu, 'suplanuok'],
  [/\bišbandykite\b/giu, 'išbandyk'],
  [/\bNustokit\b/g, 'Nustok'],
  [/\bnustokit\b/giu, 'nustok'],
  [/\bPlanuokite\b/g, 'Planuok'],
  [/\bplanuokite\b/giu, 'planuok'],
  [/\bGaiškite\b/g, 'Gaišk'],
  [/\bgaiškite\b/giu, 'gaišk'],
  [/\bMes padedame jums\b/giu, 'Mes padedame tau'],
  [/\bmes padedame jums\b/giu, 'mes padedame tau'],
]

const PHRASE_FIXES: Array<[RegExp, string]> = [
  [/\bDabar supranti\b/giu, 'Prisimink'],
  [/(^|[.!?…]\s+)Supranti,\s+kad\b/gimu, '$1Prisimink, kad'],
  [/\bGreitais ir patogiais\b/giu, 'Greita ir patogu'],
  [/ką dedamas į savo maistą/giu, 'ką dedi į savo maistą'],
  [/skanus maistas/giu, 'skanų maistą'],
  [/\bmėgauti vasaros skonimis\b/giu, 'mėgautis vasaros skoniais'],
  [/\bMaisto rinkiniai padeda\b/giu, 'Maisto rinkinys padeda'],
  [/\bkaip gali maisto rinkiniai padeda\b/giu, 'kaip maisto rinkinys gali padėti'],
  [/\bprisimenai skonių paletę\b/giu, 'prisimeni pažįstamus skonius'],
  [/\bruošti maistą gali tapti įtomybė\b/giu, 'maisto ruošimas gali tapti našta'],
  [/(?<!\p{L})įtomybė(?!\p{L})/giu, 'našta'],
  [/\bjau ruošiasi rudenys\b/giu, 'dar tęsiasi vasara'],
  [/\bjaučiame\b/giu, 'jauti'],
  [/\bSiekdami\b/g, 'Kai sieki'],
  [/\bsiekdami\b/giu, 'kai sieki'],
  [/\bkai sieki tikslus\b/giu, 'kai sieki tikslų'],
  [/įpratęs\s*\(\s*-\s*usi\s*\)/giu, 'įpratęs'],
  [/Metu laiko keisti/giu, 'Metas keisti'],
  [/metu laiko keisti/giu, 'metas keisti'],
  [/Metu laiko/giu, 'Metas'],
  [/apgaviusius sprendimus/giu, 'apgaulingus sprendimus'],
  [/apgavusius sprendimus/giu, 'apgaulingų pažadų'],
  [/apgaviusius/giu, 'apgaulingus'],
  [/apgavusius/giu, 'apgaulingus'],
  [/apgaudingus/giu, 'apgaulingus'],
  [/malonus bei tvarias\b/giu, 'malonus bei tvarus'],
  [/maloni bei tvarias\b/giu, 'maloni bei tvari'],
  [/malonus bei tvarius\b/giu, 'malonų ir tvarių'],
  [/malonią bei tvarią\b/giu, 'malonią ir tvarią'],
  [/aklavog[eė]/giu, 'chaosas'],
  [/pensoj[aą]/giu, 'pensiją'],
  [/kiekvienas vakar[uų]/giu, 'kiekvienas vakaro'],
  [/virimo planas/giu, 'maisto planas'],
  [/kasdien(is|į) virimas/giu, 'kasdienis maisto ruošimas'],
  [/kasdienis virimas/giu, 'kasdienis maisto ruošimas'],
  [/jaučiasi pavarg[ęe]s/giu, 'pritrūksta jėgų'],
  [/jaučiasi pavargusi/giu, 'pritrūksta jėgų'],
  [/jaučiasi spaudimas/giu, 'tu jauti spaudimą'],
  [/Dabar žinai, kad virimo planas\.?/giu, 'Dabar žinai. Maisto planas veikia'],
  [/Dabar žinai, kad planas/giu, 'Dabar žinai. Planas'],
  [/\batidėji\b/giu, 'atidedi'],
  [/tampa malonumas/giu, 'tampa malonumu'],
  [/šventė artimiausia/giu, 'artėjanti šventė'],
  [/Ar šventė artimiausia\?/giu, 'Ar artėja šventė?'],
  [/jaustis pasiruošęs/giu, 'jaustis pasiruošę'],
  [/įstrigstate/giu, 'įstringi'],
  [/stringate/giu, 'stringi'],
  [/\bĮsiklausykite\b/g, 'Įsiklausyk'],
  [/įsiklausykite/giu, 'įsiklausyk'],
  [/\bIšlaisvinkite\b/g, 'Išlaisvink'],
  [/išlaisvinkite/giu, 'išlaisvink'],
  [/\bAtverkite\b/g, 'Atverk'],
  [/atverkite/giu, 'atverk'],
  // From prior batch screenshots
  [/energijos visai ne\.?/giu, 'energijos visai nėra'],
  [/nusprendus[,\s]+ką gaminsi/giu, 'sprendžiant, ką gaminti'],
  [/Kaskart nusprendus/giu, 'Kaskart sprendžiant'],
  [/pavargęs\/pavargusi/giu, 'kai pritrūksta jėgų'],
  [/pavargęs arba pavargusi/giu, 'kai pritrūksta jėgų'],
  [/atnešti didelę naštą/giu, 'atnešti didelę naudą'],
  [/Tai sukelia viltį, kad viskas greitai baigsis\.?/giu, 'Tai kelia viltį, kad greitai pasijusi lengviau'],
  [/Galbūt esi pasimetęs, bet tai\.?\s*$/giu, 'Galbūt esi pasimetęs, bet tai puiki pradžia'],
  [/\bbet tai\.\s*$/giu, 'bet tai puiki pradžia'],
  // Never inject URL/CTA into body — rewrite to real content
  [/Sužinok daugiau apie savaitės planus\.?/giu, 'Suplanuok savaitę pagal savo ritmą'],
  [/Suplanuok savaitės meniu\.?/giu, 'Sudėliok savaitės meniu be streso'],
  [/Sužinok daugiau\.?/giu, 'Pradėk nuo trumpo testo'],
  // llama3.1 LT word-salad from failed ugc-lt-fast batches
  [/žaidžiami laikui/giu, 'gaišti laiką'],
  [/kuo žaidžiami/giu, 'kuo gaišti'],
  [/(\p{L}+)\s+(turintis|turinti|galintis|galinti)\b/giu, '$1, $2'],
  [/nebebegaja/giu, 'nebegali'],
  [/nebebegali/giu, 'nebegali'],
  [/užsispyti/giu, 'užsispyręs'],
  [/Naujos receptas/giu, 'Naujas receptas'],
  [/nesuvokiamas dienoraščio,?\s*/giu, 'nesuprantamas dienoraštis. '],
  [/Žarnyno draugiška\.?/giu, 'Žarnynui draugiška.'],
  // Vegan protein batch (Aug 2026 screenshots)
  [/Ar jaučiasi vasaros nuovargis\?/giu, 'Ar jauti vasaros nuovargį?'],
  [/jaučiasi vasaros nuovargis/giu, 'jauti vasaros nuovargį'],
  [/Ar jaučiasi\b/giu, 'Ar jauti'],
  // Only the tu-register slip: "žmogus jaučiasi" is correct 3rd person and must stay.
  [
    /(?<!(?:žmogus|jis|ji|jie|jos|mama|tėtis|senelis|močiutė|draugas|draugė|vyras|moteris|paauglys|vaikas|kiekvienas|niekas|šeima|gavėjas)(?:\s+[^\s,.;!?]+){0,3}\s+)\bjaučiasi\b/giu,
    'jauti',
  ],
  [/trūksta reikiamo baltymai/giu, 'trūksta reikiamų baltymų'],
  [/reikiamo baltymai/giu, 'reikiamų baltymų'],
  [/visus reikiamus aminorūgšties/giu, 'visas reikiamas aminorūgštis'],
  [/reikiamus aminorūgšties/giu, 'reikiamas aminorūgštis'],
  [/aminorūgšties\b/giu, 'aminorūgštis'],
  [/sugalvojome vegan baltymai plan[aą]/giu, 'sukūrėme veganiškų baltymų planą'],
  [/vegan baltymai plan[aą]/giu, 'veganiškų baltymų planą'],
  [/Vegan baltymai/g, 'Veganiški baltymai'],
  [/vegan baltymai/giu, 'veganiški baltymai'],
  [/\bsojos gami\b/giu, 'sojos gaminiai'],
  [/sojos gami(?![a-ząčęėįšųūž])/giu, 'sojos gaminiai'],
  // Cycling / nutrition batch (Aug 2026)
  [/\bmaistinu\b/giu, 'maitinimu'],
  [/režimu ir maistinu/giu, 'režimu ir maitinimu'],
  [/angidrat[uųaą]/giu, 'angliavandenių'],
  [/lengvų angliavandenių/giu, 'lengvų angliavandenių'],
  [/o vaisiai\.\s*Papildomai įkrauti jėgas\.?/giu, 'o vaisiai papildomai įkrauna jėgas'],
  [/o vaisiai\.\s*Papildomai įkrauti\.?/giu, 'o vaisiai papildomai įkrauna energiją'],
  [/Papildomai įkrauti jėgas\.?/giu, 'Papildomai įkrauk jėgas vaisiais'],
  [/Papildomai įkrauti\.?/giu, 'Papildomai įkrauk energiją vaisiais'],
  [/įkrauna energiją jėgas/giu, 'įkrauna jėgas'],
  [/Dažnas pamiršta/giu, 'Dažnai pamiršti'],
  [/Pradėk 5 min\.(?!\s*test)/giu, ''],
  [/Pradėk 5 min\.\s*testą([!\s?.]*🤩*)+/giu, ''],
  [/pradėk 5 min\.\s*testą([!\s?.]*🤩*)+/giu, ''],
  [/tavoknyga\.com\s*[—–-]\s*pradėk testą\.?/giu, ''],
  [/\batstatymo\b/giu, 'atsistatymo'],
  // Weight / mood batch (Aug 2026)
  [/įsismuov[eė]/giu, 'šoka'],
  [/svarstyklės irgi įsismuov[eė]/giu, 'svarstyklės irgi šoka'],
  [/greito atsvarumo/giu, 'greito nusiraminimo'],
  [/\batsvarumo\b/giu, 'nusiraminimo'],
  [/Štai kodėl koncentruotis į vieną skaitmenį\.?\s*Tai mažina/giu, 'Štai kodėl neverta koncentruotis į vieną skaitmenį. Tai mažina'],
  [/Štai kodėl koncentruotis į vieną skaitmenį\.?/giu, 'Štai kodėl neverta koncentruotis į vieną skaitmenį'],
  // Stress / emotional eating (Aug 2026)
  [/nesusimastyk/giu, 'nesusimąstant'],
  [/nesusimastant/giu, 'nesusimąstant'],
  [/maitina tavęs/giu, 'maitina tave'],
  [/ar tai maitina tavęs/giu, 'ar tai maitina tave'],
  [/pasiduoti saldumams/giu, 'pasiduoti saldumynams'],
  [/trumpalaikės palaimos/giu, 'trumpalaikio malonumo'],
  [/siekiant trumpalaikės palaimos/giu, 'siekiant trumpalaikio malonumo'],
  // Proactive nutrition / LT grammar (common OpenEuroLLM slips)
  [/baltimų/giu, 'baltymų'],
  [/biebalu/giu, 'riebalų'],
  [/riebalu(?![a-ząčęėįšųūž])/giu, 'riebalų'],
  [/kalorijus/giu, 'kalorijų'],
  [/kalorijas\b/giu, 'kalorijas'],
  [/anglevanden/giu, 'angliavanden'],
  [/angliavadenių/giu, 'angliavandenių'],
  [/angliavandeniu\b/giu, 'angliavandenių'],
  // Do NOT use /hidratac[iį]/ — it turns correct „hidratacijos" into junk
  [/hidratacijąjos/giu, 'hidratacijos'],
  [/hidratacijąj\w*/giu, 'hidratacijos'],
  [/\bhidrataci\b/giu, 'hidratacija'],
  [/hydratac/giu, 'hidratac'],
  [/subalansota\b/giu, 'subalansuota'],
  [/subalansot[aą]\b/giu, 'subalansuotą'],
  [/organizmas reikia/giu, 'organizmui reikia'],
  [/kūnui reikia degalų/giu, 'kūnui reikia energijos'],
  [/trūksta energija\b/giu, 'trūksta energijos'],
  [/trūksta jėga\b/giu, 'trūksta jėgų'],
  [/daugiau energija\b/giu, 'daugiau energijos'],
  [/sveikos mitybos planas veikia gerai gerai/giu, 'sveikos mitybos planas veikia'],
  [/\bmeal prep\b/giu, 'maisto ruošimas'],
  [/po workout/giu, 'po treniruotės'],
  [/\bworkout\b/giu, 'treniruotė'],
  [/po treniruotė(?![a-ząčęėįšųūž])/giu, 'po treniruotės'],
  [/\bprotein shake\b/giu, 'baltymų kokteilis'],
  [/\bmacros\b/giu, 'makroelementai'],
  [/\btracking\b/giu, 'sekti'],
  [/link in bio/giu, 'tavoknyga.com'],
  [/swipe up/giu, ''],
  [/prisijunk prie bendruomenės/giu, ''],
  [/sek mus/giu, ''],
  [/neužtenk\b/giu, 'neužtenka'],
  [/nebeužtenk\b/giu, 'nebeužtenka'],
  [/pasiruošęs\/pasiruošusi/giu, 'pasiruošęs'],
  [/alkanas\/alkana/giu, 'alkanas'],
  [/pavargęs ir pavargusi/giu, 'kai pritrūksta jėgų'],
  [/tu tu\b/giu, 'tu'],
  [/kad kad\b/giu, 'kad'],
  [/ir ir\b/giu, 'ir'],
  [/planas planas/giu, 'planas'],
  [/maisto maisto/giu, 'maisto'],
  [/sveikatos kelionę su tavoknyga/giu, 'sveikatos kryptį su „Tavo knyga“'],
  [/reikia atsistatymo, o ne tik degalų/giu, 'reikia atsistatymo, o ne tik „degalų“'],
  [/staigius jėgų kritimus/giu, 'staigų jėgų kritimą'],
  [/teikia malonumą, bet energijos visai nėra\?/giu, 'teikia malonumą, bet energijos visai nėra.'],
  // Broken structure / invented “clever” words
  [/Lengvų angliavandenių ir baltymų\.?/giu, 'Rinkis lengvus angliavandenius ir baltymus'],
  [/emocinio kalnelio/giu, 'emocijų kalnelio'],
  [/svytuoti/giu, 'svyruoti'],
  [/svytuoj/giu, 'svyruoj'],
  [/koncentruotis į vieną skaičių/giu, 'neverta koncentruotis į vieną skaičių'],
  [/Štai kodėl\s+(?!neverta\b)([a-ząčęėįšųūž]+oti(?:s)?)\b/giu, 'Štai kodėl neverta $1'],
  [/atgauti kontrolę ir ramumą/giu, 'atgauti kontrolę ir ramybę'],
  [/\bramumą\b/giu, 'ramybę'],
  // Food-waste / planning batch (Aug 2026)
  [/greitai subręsta/giu, 'greitai genda'],
  [/subręsta/giu, 'genda'],
  [/dažnas jauti varginamas/giu, 'dažnai jauti nuovargį'],
  [/jauti varginamas/giu, 'jauti nuovargį'],
  [/\bvarginamas\b/giu, 'išsekęs'],
  [/rūpestų/giu, 'rūpesčių'],
  [/nešlamžtų/giu, 'nesugestų'],
  [/nešlamž/giu, 'nesugest'],
  [/Planuoti kasdien\.\s*Nėra lengva/giu, 'Planuoti kasdien nėra lengva'],
  [/Mes atskiriasi/giu, 'Mes skiriamės'],
  [/atskiriasi nuo/giu, 'skiriasi nuo'],
  [/atskiriasi/giu, 'skiriasi'],
  [/apgavusius sprendimus/giu, 'apgaulingų pažadų'],
  [/užmiršti ką nors panaudoti/giu, 'pamiršti ką nors panaudoti'],
  [/\bužmiršti\b/giu, 'pamiršti'],
  [/\bužmiršai\b/giu, 'pamiršai'],
  [/Įprastas reikalas\.?/giu, 'Pažįstama situacija'],
  [/tiesiog greitai genda/giu, 'greitai genda'],
  [/maisto atliekos tiesiog didina/giu, 'maisto atliekos didina'],
  [/Planuoti kasdien nėra lengva užduotis\.?/giu, 'Planuoti kasdien nėra lengva'],
  [/Dėl to dažnas /giu, 'Dėl to dažnai '],
  [/\bdažnas jauti\b/giu, 'dažnai jauti'],
  [/\bDažnas jauti\b/g, 'Dažnai jauti'],
  [/maistinimas/giu, 'maitinimas'],
  [/maistinimu/giu, 'maitinimu'],
  [/reikiamo baltymų/giu, 'reikiamų baltymų'],
  [/reikiamų baltymai/giu, 'reikiamų baltymų'],
  [/gerai gerai/giu, 'gerai'],
  [/labai labai/giu, 'labai'],
  [/visai visai/giu, 'visai'],
  [/kasdien\.\s*Nėra /giu, 'kasdien nėra '],
  [/Mes skiriamės nuo trumpalaikių planų, kurie skamba kaip greiti sprendimai/giu, 'Mes skiriamės nuo trumpalaikių planų ir greitų pažadų'],
  // Live model / meta.json Aug 2026 — we-forms, gender, invented words
  [/\bpastebėjau\b/giu, 'pastebėjai'],
  [/\bsusiduriame\b/giu, 'susiduri'],
  [/\bišmetame\b/giu, 'išmeti'],
  [/\bperkame\b/giu, 'perki'],
  [/\bneturime\b/giu, 'neturi'],
  [/\bneplanuojame\b/giu, 'neplanuoji'],
  [/\bsuvartojame\b/giu, 'suvartoji'],
  [/\bmanome\b/giu, 'manai'],
  [/\bDažnas nori\b/g, 'Dažnai nori'],
  [/\bdažnas nori\b/giu, 'dažnai nori'],
  [/fokusuoja į/giu, 'kreipia dėmesį į'],
  [/\bfokusuoja\b/giu, 'kreipia dėmesį'],
  [/Kaip Tai Poveikio/giu, 'Kaip tai veikia'],
  [/kaip tai poveikio/giu, 'kaip tai veikia'],
  [/poveikio tavo/giu, 'veikia tavo'],
  [/\batsižvelgdamas\b/giu, 'atsižvelgiant'],
  [/\batsižvelgdama\b/giu, 'atsižvelgiant'],
  [/Tavo savijauta\.\s*Tavo prioritetas/giu, 'Tavo savijauta — tavo prioritetas'],
  [/jaustis pasiruošusi/giu, 'jaustis pasiruošę'],
  [/\bbadmečio\b/giu, 'alkio'],
  [/\btreniruoje\b/giu, 'treniruotėje'],
  [/\bpabandinti\b/giu, 'išbandyti'],
  [/\bskaidrutes\b/giu, 'skaidres'],
  [/\bpatiekas\b/giu, 'patiekalas'],
  [/\brudenių\b/giu, 'rudens'],
  [/rudenių/giu, 'rudens'],
  [/hidratacijąjąjos/giu, 'hidratacijos'],
  [/hidratacijąjąj\w*/giu, 'hidratacijos'],
  [/Štai kodėl sugalvojome/giu, 'Štai kodėl sukūrėme'],
  [/\bVegan\b(?!\s*baltymai)/g, 'Veganiškas'],
  [/Crossfit'?o?\b/giu, 'intensyvios treniruotės'],
  [/Tavo skoniui pritaikytą ir lengvai įgyvendinamą\.?/giu, 'Planas pritaikytas tavo skoniui ir lengvai įgyvendinamas'],
  [/\besi\b([^.!?]{0,40})\balkis\b/giu, 'esi$1alkanas'],
  [/tampa malonumas, o ne įsipareigojimu/giu, 'tampa malonumu, o ne įsipareigojimu'],
  [/energijos eikvojimo be reikalo/giu, 'energijos eikvojimą be reikalo'],
  [/vandens eikvojimo be reikalo/giu, 'vandens eikvojimą be reikalo'],
  [/pinigų eikvojimas/giu, 'pinigų švaistymas'],
  [/aplinkosauginės problemos dalis/giu, 'aplinkos problema'],
  [/Pradėk Šiandien!?/giu, 'Pradėk šiandien'],
  [/Svorio Tikslai/g, 'Svorio tikslai'],
  [/Maisto Švaistymas/g, 'Maisto švaistymas'],
  // Batch_2026-08-05_232736 — tu/mes shift, participle agreement, wrong reflexive
  [/Ką dedame į/giu, 'Ką dedi į'],
  [/\bdedame\b/giu, 'dedi'],
  [/\bvalgome\b/giu, 'valgai'],
  [/\bruošiame\b/giu, 'ruoši'],
  [/\bperkame į\b/giu, 'perki į'],
  [/suverstų daržovių kalną/giu, 'suverstą daržovių kalną'],
  [/suverstų\s+(\w+)\s+kalną/giu, 'suverstą $1 kalną'],
  [/\bPasiskirstyk\b/g, 'Paskirstyk'],
  [/\bpasiskirstyk\b/giu, 'paskirstyk'],
  [/paskirstyk daržoves savaitgaliams/giu, 'paskirstyk daržoves savaitei'],
  [/daržoves savaitgaliams/giu, 'daržoves savaitei'],
  [/Pasiskirstyk daržoves savaitgaliams/giu, 'Paskirstyk daržoves savaitei'],
  // Audit post-01..10 (Aug 2026 fortress A–Z)
  [/\bpatiekalimis\b/giu, 'patiekalais'],
  [/Jaučiuosi varginantis/giu, 'Jauti nuovargį'],
  [/jaučiuosi varginantis/giu, 'jauti nuovargį'],
  [/\baš ruošiasi\b/giu, 'ruošiesi'],
  [/su aišku savaitės mitybos planas/giu, 'su aiškiu savaitės mitybos planu'],
  [/leidžia kepenims atpalaiduoti/giu, 'leidžia kepenims lengviau dirbti'],
  [/\btrūgsta\b/giu, 'trūksta'],
  [/\bbesimauginantis\b/giu, 'besimaitinantis'],
  [/jauti vasaros karštis/giu, 'jauti vasaros karštį'],
  // \b fails before LT diacritics (į/ū/…) — use lookaround
  [/(?<!\p{L})įtūmiu(?!\p{L})/giu, 'įtemptu'],
  [/\bnorėtumis\b/giu, 'norėtum'],
  [/\brežinas\b/giu, 'režimas'],
  [/Jausi ramesnis/giu, 'Jausiesi ramiau'],
  [/jausi ramesnis/giu, 'jausiesi ramiau'],
  [/\bsunksta\b/giu, 'sunkėja'],
  [/\bnuovokio\b/giu, 'nuovargio'],
  [/\bAišus\b/g, 'Aiškus'],
  [/\baišus\b/giu, 'aiškus'],
  [/Insulinrezistencija/giu, 'insulino rezistencija'],
  [/(?<!\p{L})medžiukų(?!\p{L})/giu, 'medžiagų'],
  [/\btebetruksminga\b/giu, 'vis dar trukdo'],
  [/dar vis dar trukdanti/giu, 'vis dar trukdo'],
  [/vis dar trukdanti/giu, 'vis dar trukdo'],
  [/\brandu\b/giu, 'randi'],
  [/daryti įtakos/giu, 'daryti įtaką'],
  [/rezultatai vis nepastovi/giu, 'rezultatai vis nepastovūs'],
  [/išleidžiamos pinigai/giu, 'išleidžiami pinigai'],
  [/\bStengiame\b/g, 'Stengiesi'],
  [/\bstengiame\b/giu, 'stengiesi'],
  [/anglies hidrat[uų]/giu, 'angliavandenių'],
  [/atsiliepia savijauta(?![iį])/giu, 'atsiliepia savijautai'],
  [/jaustis gyvesnis ir produktyvus/giu, 'jaustis energingesniam'],
  [/jaustis sotus, o ne badaujantis/giu, 'jaustis sotiems, o ne alkaniems'],
  [/jaustis lengvas/giu, 'jaustis lengviau'],
  [/jau ruošiasi atvykti ramybė/giu, 'jau artėja ramybė'],
  [/apgailėtinas miegas/giu, 'prastas miegas'],
  [/\bpasiūlysime\b/giu, 'gali pasiūlyti'],
  [/Mes pritaikome/giu, 'Tu pritaikai'],
  [/\bpritaikome\b/giu, 'pritaikai'],
  [/\bruošiamės\b/giu, 'ruošiesi'],
  [/(?<!\p{L})užsisklendiname(?!\p{L})/giu, 'užsisklendi'],
  [/\bpamirštame\b/giu, 'pamiršti'],
  [/Galime eksperimentuoti/giu, 'Gali eksperimentuoti'],
  [/\bpasiektume\b/giu, 'pasiektum'],
  [/Kiekvienas iš mūsų susiduria/giu, 'Dažnai susiduri'],
  [/Kiekvienas iš mūsų/giu, 'Dažnai'],
  [/\bJaučiuosi\b/g, 'Jauti'],
  [/\bjaučiuosi\b/giu, 'jauti'],
  [/kai esi įstrigusi/giu, 'kai stringi'],
  [/kai esi įstrigęs/giu, 'kai stringi'],
  [/(?<!\p{L})įstrigusi(?!\p{L})/giu, 'įstrigęs'],
  [/\bbesiruošdama\b/giu, 'besiruošdamas'],
  [/kai ruošdamasis\b/giu, 'kai ruošiesi'],
  [/\bkontroliuodama\b/giu, 'kai kontroliuoji'],
  [/Ramesnis, o ne uždusiantis\.?/giu, 'Jausiesi ramiau, o ne uždusęs.'],
  [/Pasirūpink savimi\.(\s*Kiekvieną dieną\.)?/giu, 'Pasirūpink savimi kiekvieną dieną.'],
  [/kiekvieną dieną\.\s*kiekvieną dieną\./giu, 'Kiekvieną dieną.'],
  // Vision batch-5 (Aug 2026) — post-03/05 shipped inventeds + person/gender
  [/(?<!\p{L})kątį(?!\p{L})/giu, 'kątik'],
  [/(?<!\p{L})rutinoją(?!\p{L})/giu, 'rutiną'],
  [/(?<!\p{L})rutinoj(?!\p{L})a?/giu, 'rutiną'],
  [/(?<!\p{L})bėdeles(?!\p{L})/giu, 'bėrimus'],
  [/(?<!\p{L})bėdel(?!\p{L})\w*/giu, 'bėrimus'],
  [/(?<!\p{L})valgoji(?!\p{L})/giu, 'valgai'],
  [/(?<!\p{L})vargstį(?!\p{L})/giu, 'vargą'],
  [/(?<!\p{L})viršinamas(?!\p{L})/giu, 'virškinamas'],
  [/tebesildo/giu, 'šildo'],
  [/\bTu\s+pats\(i\)\b/giu, 'Tu'],
  [/Tu tapsi savo kūno eksperimentų vadovas/giu, 'Tu tapsi savo kūno eksperimentų vadovu'],
  [/eksperimentų vadovas/giu, 'eksperimentų vadovu'],
  [/pats\(i\)/giu, 'tu'],
  [/pati\(s\)/giu, 'tu'],
  [/\bTu\s+tu\b/giu, 'Tu'],
  [/\bGalėčiau\b/g, 'Galėtum'],
  [/\bgalėčiau\b/giu, 'galėtum'],
  [/\bPradėjau\b/g, 'Pradėjai'],
  [/\bpradėjau\b/giu, 'pradėjai'],
  [/\baš planuoju\b/giu, 'tu planuoji'],
  [/Štai kodėl aš planuoju/giu, 'Štai kodėl planuoji'],
  [/\bStebėdama\b/g, 'Kai stebi'],
  [/\bstebėdama\b/giu, 'kai stebi'],
  [/Taigi,\s*suplanavimas\.?/giu, 'Taigi svarbu iš anksto suplanuoti.'],
  [/\bsuplanavimas\.\s*$/giu, 'suplanuok iš anksto.'],
  [/keliose skirtinguose patiekaluose/giu, 'keliuose skirtinguose patiekaluose'],
  [/pajusti energijos/giu, 'pajustum energiją'],
  [/\bnesportuojame\b/giu, 'nesportuoji'],
  // Vision batch 8 (Aug 2026) — person/register and malformed LT
  [/(?<!\p{L})galimi(?!\p{L})/giu, 'gali'],
  [/(?<!\p{L})noriu(?!\p{L})/giu, 'nori'],
  [/(?<!\p{L})suprantu(?!\p{L})/giu, 'supranti'],
  [/(?<!\p{L})įsitikinau(?!\p{L})/giu, 'įsitikinai'],
  [/(?<!\p{L})patenkinčiau(?!\p{L})/giu, 'patenkintum'],
  [/Tavęs apjungia/giu, 'Tave užgriūva'],
  [/(?<!\p{L})apjungia(?!\p{L})/giu, 'sujungia'],
  [/nuo kasmens(?!\p{L})/giu, 'nuo maisto švaistymo'],
  [/maisto gėriu/giu, 'maisto skoniu'],
  [/kasdieninis balansavimas/giu, 'kasdienį balansą'],
  [/nėra pats geriausias/giu, 'nėra geriausias'],
  [/Tai nėra pats geriausias/giu, 'Tai nėra geriausias'],
  [/Ar meal kit\b/giu, 'Ar maisto rinkinys'],
  [/\bmeal kit\b/giu, 'maisto rinkinys'],
  [/Rugsėjis artimas, o tau/giu, 'Ar rugsėjį planuoji ramiau?'],
  [/(?<!\p{L})šventvėlių(?!\p{L})/giu, 'švenčių'],
  [/gali suderinsi/giu, 'gali suderinti'],
  [/Prieš tai tu skyręs\(-ei\) savaitę tik planuodamas\(-a\) renginius\.?/giu, 'Anksčiau visą savaitę planavai renginius.'],
  [/Ankstesnėmis metais tu jaučiausi išsekęs\(-us\) po kiekvienos didelės šventės\.?/giu, 'Ankstesniais metais po kiekvienos didelės šventės tau pritrūkdavo jėgų.'],
  [/(?<!\p{L})utėlius(?!\p{L})/giu, 'mažylis'],
  [/suaugusiųjų valgymo ramybė nepažeidžiama/giu, 'suaugusiųjų valgymas lieka ramus'],
  [/(?<!\p{L})Ištvermas(?!\p{L})/gu, 'Ištvermė'],
  [/(?<!\p{L})ištvermas(?!\p{L})/giu, 'ištvermė'],
  [/praleidi dienos ritmą ir jausiesi pavargęs/giu, 'prarandi dienos ritmą ir jautiesi pavargęs'],
  [/įsisisteminus pastovų valgiarastį/giu, 'kai turi pastovų valgiaraštį'],
  [/(?<!\p{L})viršvalgėjimo(?!\p{L})/giu, 'persivalgymo'],
  [/(?<!\p{L})įsisotinęs(?!\p{L})\s+miegas/giu, 'kokybiškas miegas'],
  [/(?<!\p{L})Pamėteli(?!\p{L})/gu, 'Pastebi'],
  [/(?<!\p{L})pamėteli(?!\p{L})/giu, 'pastebi'],
  [/Šaldytuvo durys atsiranda/giu, 'Šaldytuve atsiranda'],
  [/pajausi tikrą pokyčio įtaką/giu, 'pajusi tikrą pokytį'],
  [/(?<!\p{L})užkasti(?!\p{L})/giu, 'užkąsti'],
  [/Dabar atsiranda daug nusivylimo dėl vasaros pabaigos\.?/giu, 'Vasaros pabaiga gali nuvilti.'],
  // Aug-7 PM batch (5 posts) — grammar, logic, register
  [/\bNenorisi\b/giu, 'Nenori'],
  [/\bnenorisi\b/giu, 'nenori'],
  [/(?<!\p{L})pasirūpintį(?!\p{L})/giu, 'pasirūpinti'],
  [/\bima dėvėti\b/giu, 'ima gesti'],
  [/\bAr vakarienė\.\s*Kasdienis stresas\?/giu, 'Ar vakarienė — kasdienis stresas?'],
  [/\bkontrolę virš savo dienos\b/giu, 'kontrolę savo dienoje'],
  [/\bkauptis pradeda nereikalingas atsargos\b/giu, 'kaupiasi nereikalingos atsargos'],
  [/\bDažnai įsidedami produktus\b/giu, 'Dažnai per daug produktų įsidedi'],
  [/\bpamiršti jų panaudojimo datą\b/giu, 'pamirši jų galiojimo datą'],
  [/\bpamiršti ką turėji\b/giu, 'pamirši, ką turėjai'],
  [/\bSupranti, kad tvarkinga virtuvė\.?\s*$/giu, 'Supranti, kad tvarkinga virtuvė sutaupo laiko.'],
  [/\bNorėjau maisto rinkinio\b/giu, 'Norėjai maisto rinkinio'],
  [/\bAtsisakiau prabangos\b/giu, 'Atsisakei prabangos'],
  [/\bSuplanavus savaitės meniu taupysi\b/giu, 'Kai suplanuoji savaitės meniu, taupysi'],
  [/\bPlanuodamas vaisių pirkinius\b/giu, 'Kai planuoji vaisių pirkinius'],
  [/\bplanuodamas kasdienį meniu\b/giu, 'planuojant kasdienį meniu'],
  [/\bvisada tuščias tik tada, kai reikia naujų\b/giu, 'tuščias tik tada, kai laikas papildyti'],
  [/\bnes galvoji\.\s*Kada nors prisimsi\b/giu, 'nes galvoji, kad prisiminsi vėliau'],
  [/\bDžiaugsmas kyla nuo sąmoningesnio vartojimo\b/giu, 'Mažiau maisto eina į šiukšlynę'],
  [/\batidaugi\b/giu, 'atidarai'],
  [/\bpirkiams\b/giu, 'pirkimams'],
  [/\bdalybams\b/giu, 'dalykams'],
  [/\bpirmiami\b/giu, 'perkami'],
  [/\bsubyrauja\b/giu, 'genda'],
  [/\bišmetini\b/giu, 'išmeti'],
  [/\bgeros būklės maisto\b/giu, 'geros būklės maistą'],
  [/\bjei persigalvoji\b/giu, 'kai pakeiti įpročius'],
  [/\blikę daržovės\b/giu, 'likusios daržovės'],
  [/\breikalingo kiekio produktus\b/giu, 'reikiamą kiekį produktų'],
  [/\bpasijausti atsakingas\b/giu, 'pasijausti atsakingu'],
  [/\bpamiršti apie ją\b/giu, 'pamirši apie jį'],
  [/\bKada nors prisimsi\b/giu, 'kad prisiminsi vėliau'],
  [/\bprisimsi\b/giu, 'prisiminsi'],
  [/\bSuplanuotas pirkinių planas\b/giu, 'Pirkinių planas'],
  [/\bpadeda maistui pasibaigti laiku\b/giu, 'padeda panaudoti maistą laiku'],
  [/\bsugadina tavo laiką\b/giu, 'švaisto tavo laiką'],
  [/\bmėgstamam pomėgiui\b/giu, 'pomėgiui'],
  [/\bgalimybę atsipalaidavimui\b/giu, 'galimybę atsipalaiduoti'],
  [/\berdvės atsipalaidavimui ir atkurti\b/giu, 'erdvės atsipalaiduoti ir atkurti'],
  [/\btiesiog atsipalaidavimui\b/giu, 'tiesiog atsipalaiduoti'],
  [/\boptimalų sunaudojimą\b/giu, 'visą kiekį laiku'],
  [/\bnetiesiogiai atidedi\b/giu, 'atidedi'],
  [/\bTu norėtum pasirūpintį\b/giu, 'Norėtum pasirūpinti'],
  [/\bnorėtum pasirūpintį\b/giu, 'norėtum pasirūpinti'],
  [/\bAsmeninis planas pritaiko pasirinkimus prie tavo kasdienio ritmo\b/giu, 'Aiškus planas sumažina kasdienių sprendimų skaičių'],
  [/\bTodėl lengviau nuosekliai judėti pasirinkta kryptimi\b/giu, 'Todėl lengviau laikytis savo ritmo'],
  [/\bKasdien renkiesi ramiau\b/giu, 'Kasdien maistą renkiesi ramiau'],
  [/\bAiškus asmeninis planas padeda kasdien rinktis ramiau\b/giu, 'Aiškus planas padeda kasdien maistą rinktis ramiau'],
  [/\bvisada tuščias tik tada\b/giu, 'tuščias tik tada'],
  [/\bDažnas impulsyvus\b/giu, 'Dažnai impulsyviai'],
  [/\bNėra aiškios strategijos pirkiams\b/giu, 'Nėra aiškios pirkinių strategijos'],
  // Aug-7 PM screenshots batch 2 — idioms, season filler, grammar
  [/\btarsi ratuose\b/giu, 'ratų rate'],
  [/\bsavaitės vis atsinaujina\b/giu, 'savaitė vėl prasideda nuo nulio'],
  [/\bSiekdami tikslus dažnai susiduri\b/giu, 'Kai sieki tikslų, dažnai susiduri'],
  [/\bsavaitės pageidavimų\b/giu, 'savaitės ritmo'],
  [/\bbei mėgautiesi\b/giu, 'ir mėgaukis'],
  [/\bmintys apie maisto gaminimą atstumia\b/giu, 'nenori galvoti apie maisto gaminimą'],
  [/\bsveikatą tausojančius pietus\b/giu, 'sveikus pietus'],
  [/\beina viena koja\b/giu, 'eina koja kojon'],
  [/\breikia stiprios energijos atsargas papildyti\b/giu, 'reikia papildyti energijos atsargas'],
  [/\bsotumo užtikrinančio\b/giu, 'sotumą užtikrinančio'],
  [/\bmaitintis sveikais ir skaniai\b/giu, 'maitintis sveikai ir skaniai'],
  [/\benergija nepristigs\b/giu, 'energijos nepristigs'],
  [/\bAr prisimeni pirmą kartą užsisakiau\b/giu, 'Ar prisimeni, kai pirmą kartą užsisakei'],
  [/\bnėra visada lengva\b/giu, 'ne visada lengva'],
  [/\bTu gali norėti\b/giu, 'Norisi'],
  [/\brasti patinkančius produktus ir įpročius\b/giu, 'rasti patinkančius produktus'],
  [/(?<!\p{L})užsiemyje(?!\p{L})/giu, 'užsienyje'],
  [/\bprisimena skonių paletę\b/giu, 'prisiminti skonių paletę'],
  [/\bprisimena skonių\b/giu, 'prisiminti skonius'],
  [/\bišseka jėgas\b/giu, 'išsekina jėgas'],
  [/\bjaučiat\b/giu, 'jauti'],
  [/\bviskas atsinaujina\b/giu, 'viskas vėl keičiasi'],
  [/\borganizacijos ir paruošimo\b/giu, 'planavimo'],
  [/\bPo sunkaus rugpjūčio karščio[^,]*,\s*/giu, ''],
  [/\bRugpjūčio karštį jaučiame iki galo,\s*o\s*/giu, ''],
  [/\bRugpjūčio karštis dar juntamas, tačiau\s*/giu, ''],
  [/\bRugpjūčio karštis dar primena vasarą, bet\s*/giu, ''],
  [/\bRugpjūčio karštis palieka tave išsekusį,\s*o\s*/giu, ''],
  [/\bAr jaučiat rugpjūčio karštį\?/giu, 'Ar po treniruotės jauti nuovargį?'],
  [/\bŠis savaitgalis primena paskutines vasaros dienas, o tu\b/giu, 'Tu'],
  // Aug-7 night batch — captions + slides
  [/\bbet ne nori\b/giu, 'bet nenori'],
  [/\bne nori jausti\b/giu, 'nenori jausti'],
  [/\bpilno energijos\b/giu, 'pilnai energijos'],
  [/\brandamų baltymai\b/giu, 'randamų baltymų'],
  [/\bkaltės kamuojamas jausmas\b/giu, 'kaltės kamuojamą jausmą'],
  [/\bsusisprendimo\b/giu, 'susigrupavimo'],
  [/\bkontrolę virš savo kūno\b/giu, 'savo kūno kontrolę'],
  [/\bDažnai tu jauti\b/giu, 'Dažnai jauti'],
  [/\bšoka aukštyn ir žemyn\b/giu, 'svyruoja'],
  // Allergy / ingredient batch
  [/\btavo mėgstamiausiu maisto rinkiniu\b/giu, 'tavo mėgstamiausiame maisto rinkinyje'],
  [/\bmėgstamiausiu maisto rinkiniu\b/giu, 'mėgstamiausiame maisto rinkinyje'],
  [/\bJauti neįprastas diskomfortas\b/giu, 'Jauti neįprastą diskomfortą'],
  [/\bjauti neįprastas diskomfortas\b/giu, 'jauti neįprastą diskomfortą'],
  [/\batskirti saugy nuo rizikos\b/giu, 'atskirti saugų nuo rizikingo'],
  [/(?<!\p{L})saugy(?!\p{L})/giu, 'saugų'],
  [/\bPrieš ateinančius patiekalus pasitikėk savimi\b/giu, 'Rinkdamas patiekalus, pasitikėk savimi'],
  // Aug-7 23:xx batch — logic, invented words, we-forms, instrumental case
  [/\bneapibrūkštumo\b/giu, 'neapibrėžtumo'],
  [/\bneapibrūkštum\w*/giu, 'neapibrėžtumo'],
  [/\bnemalnumai\b/giu, 'nemalonumai'],
  [/\bnemalnum(\w*)/giu, 'nemalonum$1'],
  [/Testas atskleidžia, ką tau telieka norėti\.?/giu, 'Testas atskleidžia, ko tau iš tiesų norisi.'],
  [/\bką tau telieka norėti\b/giu, 'ko tau iš tiesų norisi'],
  [/Prieš tai buvęs spėjimas tampa tikslesnis ir efektyvesnis\.?/giu, 'Vietoje spėliojimo atsiranda aiškus pasirinkimas.'],
  [/\.\s*Ne atsitiktinumas\.?/giu, ', o ne atsitiktinumas.'],
  [/Štai kaip vakarienės pasirinkimas tavo kasdienybėje pasikeis!?\.?/giu, 'Štai kaip pasikeičia tavo vakarienės rutina.'],
  [/(?<!\p{L})žinsi(?!\p{L})/giu, 'žinosi'],
  [/\bžinosi ką užsisakysi\b/giu, 'žinosi, ką užsisakyti'],
  [/\bo piniginė džiaugiasi\b/giu, 'o piniginė džiaugsis'],
  [/Tikina, jog nuoseklumas padės išvengti atgalinio žingsnio\.?/giu, 'Tiki, kad nuoseklumas padės išvengti žingsnio atgal.'],
  [/\bTikina, jog\b/giu, 'Tiki, kad'],
  [/\bišvengti atgalinio žingsnio\b/giu, 'išvengti žingsnio atgal'],
  [/(?<!\p{L})Šeši mėnesius(?!\p{L})/gu, 'Šešis mėnesius'],
  [/Šešis mėnesius tu esi įsitikinęs/giu, 'Šešis mėnesius buvai įsitikinęs'],
  [/\bkaita aplink tave gali būti nepastebima, kol vėluosi reaguoti\b/giu, 'pokyčiai aplink tave lieka nepastebėti, kol vėluoji reaguoti'],
  [/\bkol vėluosi reaguoti\b/giu, 'kol vėluoji reaguoti'],
  [/\bkaita aplink tave\b/giu, 'pokyčiai aplink tave'],
  [/(?<!\p{L})sužinoji(?!\p{L})/giu, 'sužinosi'],
  [/Sužinok apie žarnynui draugiškus ingredientus ir jų naudą\.?/giu, 'Žarnynui draugiški ingredientai gali pastebimai pagerinti savijautą.'],
  [/\btapo iššūkis\b/giu, 'tapo iššūkiu'],
  [/\btampa iššūkis\b/giu, 'tampa iššūkiu'],
  [/\btampa didesnis iššūkis\b/giu, 'tampa didesniu iššūkiu'],
  [/\btaps iššūkis\b/giu, 'taps iššūkiu'],
  [/\bgalvoji ką valgyti\b/giu, 'galvoji, ką valgyti'],
  [/\bima daug jėgų(?!\p{L})/giu, 'atima daug jėgų'],
  [/\batsipalaidavusios savaitės\b/giu, 'ramesnės savaitės'],
  [/\batsipalaiduojančia savaitės eiga\b/giu, 'ramesne savaitės eiga'],
  [/\bsutaupyti energijos ir dėmesio\b/giu, 'sutaupyti energijos ir laiko'],
  [/\bmėgautis skanu bei sveiku pietumi\b/giu, 'mėgautis skaniais ir sveikais pietumis'],
  [/\bskanu bei sveiku pietumi\b/giu, 'skaniais ir sveikais pietumis'],
  [/\bskanu bei sveiku\b/giu, 'skaniu ir sveiku'],
  // Colon titles: interrogative / A-ar-B tails are questions (\b fails on LT letters)
  [/(:\s*(?:kodėl|ką|kaip|kas|kur|kada|kiek|nuo ko)(?!\p{L})[^?!.…]*?)[.!…]*\s*$/gimu, '$1?'],
  [/(:\s*\p{L}+(?:\s+\p{L}+){0,3}\s+ar\s+\p{L}+[^?!.…]*)[.!…]*\s*$/gimu, '$1?'],
  // Generic missing comma before subordinate interrogatives
  [/(?<!\p{L})(žinai|žinosi|supranti|galvoji|pamiršti|sprendi|nežinai|suvoki)\s+(ką|kaip|kodėl|kur|kada)(?!\p{L})/giu, '$1, $2'],
  // Masculine participle hook openers → tu-question
  [/^(Pavargęs)\s+nuo\s+(.+?)[.!…]*\s*$/gimu, 'Pavargai nuo $2?'],
  [/^(Išsekęs)\s+nuo\s+(.+?)[.!…]*\s*$/gimu, 'Išsekai nuo $2?'],
  [/^(Įstrigęs)\s+(.+?)[.!…]*\s*$/gimu, 'Įstrigai $2?'],
  // Aug-8 15:00 batch — systemic + quote repairs
  [/(?<!\p{L})kodėl jis skęsta\?/giu, 'kodėl jis blėsta?'],
  [/(?<!\p{L})valgio vartojimo laikai(?!\p{L})/giu, 'valgymo laikas'],
  [/(?<!\p{L})Suplanuoti valgio laikai(?!\p{L})/giu, 'Suplanuotas valgymo laikas'],
  [/(?<!\p{L})suplanuoti valgio laikai(?!\p{L})/giu, 'suplanuotas valgymo laikas'],
  [/(?<!\p{L})organizmo resursai ištuštėja(?!\p{L})/giu, 'organizmo atsargos senka'],
  [/Ankstesnis posūkis atskleidžia, kad\s*/giu, ''],
  [/(?<!\p{L})su dieną užimančiais darbais(?!\p{L})/giu, 'su dienos darbais'],
  [/(?<!\p{L})vargdas eksperimentavimas(?!\p{L})/giu, 'varginantis eksperimentas'],
  [/(?<!\p{L})vargdas(?!\p{L})/giu, 'varginantis'],
  [/(?<!\p{L})Manėsi veganas būti\.?/giu, 'Manei, kad veganu būti paprasta.'],
  [/(?<!\p{L})nežinomybės paslaptys(?!\p{L})/giu, 'daug nežinomybės'],
  [/(?<!\p{L})Paskui supranti(?!\p{L})/giu, 'Vėliau supranti'],
  [/(?<!\p{L})susidoroti su pirmuoju butu(?!\p{L})/giu, 'susidoroti su pirkiniais naujame būste'],
  [/(?<!\p{L})ilgų virimo seansų(?!\p{L})/giu, 'ilgo gaminimo'],
  [/(?<!\p{L})virimo seans\p{L}*/giu, 'gaminimo'],
  [/(?<!\p{L})Greitas puodas(?!\p{L})/giu, 'Greitas patiekalas'],
  [/(?<!\p{L})greitas puodas(?!\p{L})/giu, 'greitas patiekalas'],
  [/(?<!\p{L})didelę švaistymo apimtį(?!\p{L})/giu, 'daug švaistymo'],
  [/(?<!\p{L})pasirinkdamas paruoštų ingredientų komplektus(?!\p{L})/giu, 'kai renkiesi paruoštus ingredientus'],
  [/(?<!\p{L})susidūrimas su improvizacija baigiasi didesnėmis išlaidomis ir vargais(?!\p{L})/giu, 'improvizacija dažnai baigiasi didesnėmis išlaidomis'],
  [/(?<!\p{L})dažnas susidūrimas su improvizacija baigiasi didesnėmis išlaidomis ir vargais(?!\p{L})/giu, 'improvizacija dažnai baigiasi didesnėmis išlaidomis'],
  [/(?<!\p{L})mėgautiesi(?!\p{L})/giu, 'mėgaujiesi'],
  [/(?<!\p{L})naujiems užduočiams(?!\p{L})/giu, 'naujiems užduotims'],
  [/(?<!\p{L})sudėtinimi(?!\p{L})/giu, 'sudėtimi'],
  // Aug-8 batch — grammar, logic, question register
  [/\btrukdyti tavo kasdienę veiklą ir nuotaiką(?!\p{L})/giu, 'trukdyti tavo kasdienei veiklai ir nuotaikai'],
  [/\btrukdyti tavo kasdienę veiklą(?!\p{L})/giu, 'trukdyti tavo kasdienei veiklai'],
  [/\bpasirenki ką kita\b/giu, 'pasirenki kitką'],
  [/\brenkiesi ką kita\b/giu, 'renkiesi kitką'],
  [/(?<!\p{L})įtikinimo mūšiu(?!\p{L})/giu, 'kasdiene kova'],
  [/(?<!Ar\s)Suplanuoti pietus tampa didesniu iššūkiu nei darbo užduotys[.?]*/gu, 'Ar suplanuoti pietus tampa didesniu iššūkiu nei darbo užduotys?'],
  [/\bgalvoji, ką valgyti\.(?=\s|$)/giu, 'galvoji, ką valgyti?'],
  // Aug-8 batch — register clash, backwards logic, agreement
  [/,\s*ne seną šabloną\s*\.?/giu, '.'],
  [/\bpasiekimai vis lieka tie patys\.(?=\s|$)/giu, 'pasiekimai vis lieka tie patys?'],
  [/\bInvestuok laiko ir dėmesio į(?!\p{L})/giu, 'Investuok laiką ir dėmesį į'],
  [/\binvestuok laiko\b/giu, 'investuok laiką'],
  [/\briboti potencialą ir naujų galimybių įsisavinimą(?!\p{L})/giu, 'riboti potencialą ir naujas galimybes'],
  [/\bstrategijas pasiekiamam augimui\b/giu, 'augimo kryptis'],
  [/\bNaujagimis kelia nereguliarų laiką(?!\p{L})/giu, 'Naujagimio ritmas nereguliarus'],
  [/\bkai vaikas verčia miego neatsisakyti\b/giu, 'kai vaikas neleidžia išsimiegoti'],
  [/\bJauti nuovargis ir noras padėti sau\b/giu, 'Jauti nuovargį ir norą padėti sau'],
  [/\bJauti nuovargis\b/giu, 'Jauti nuovargį'],
  [/\bjauti nuovargis\b/giu, 'jauti nuovargį'],
  [/(?<!\p{L})rūpestėlis(?!\p{L})/giu, 'rūpestis'],
  [/(?<!\p{L})rūpestėl(\w*)/giu, 'rūpest$1'],
  [/\bverta pasitikėti įprastais patarimais ir atradinėti savitą kelią(?!\p{L})/giu, 'verta ne vien pasikliauti įprastais patarimais, bet atrasti savitą kelią'],
  [/\bkodėl nesibaigia sotis\?/giu, 'kodėl sotumas toks trumpas?'],
  [/\bnesibaigia sotis\b/giu, 'sotumas toks trumpas'],
  [/\bnorimo energijos\b/giu, 'norimos energijos'],
  [/\bduos ilgalaikį sotumą(?!\p{L})/giu, 'suteiks ilgalaikį sotumą'],
  [/\btampa ramesnė ir maistingesnės\b/giu, 'tampa ramesnė ir sotesnė'],
  [/Prieš tai jautiesi išsekęs nuo nuolatinio spėliojimų, dabar\.?/giu, 'Anksčiau jauteisi išsekęs nuo nuolatinio spėliojimo.'],
  [/\bnuolatinio spėliojimų(?!\p{L})/giu, 'nuolatinio spėliojimo'],
  [/\bjaustis pilnam\s*\/\s*ai energijos\b/giu, 'turėti energijos'],
  [/\bpilnam\s*\/\s*ai\b/giu, 'pilnam'],
  [/\bvisus likusius darbo metus\b/giu, 'visą likusią darbo dieną'],
  [/\bsumažėjusia produktyvumu\b/giu, 'sumažėjusiu produktyvumu'],
  [/\bdidesnę produktyvumo dozę(?!\p{L})/giu, 'daugiau energijos'],
  [/\bproduktyvumo dozę(?!\p{L})/giu, 'daugiau energijos'],
  // Posts 87–91 batch — grammar, hook questions, filler patterns
  [/\bjauti mieguistumas ir tingulys\b/giu, 'jauti mieguistumą ir tingulį'],
  [/\bjauti mieguistumą ir tingulys\b/giu, 'jauti mieguistumą ir tingulį'],
  [/\bjauči mieguistum\w*/giu, 'jauti mieguistumą'],
  [/\bDažnai jauči mieguistum\w*/giu, 'Dažnai jauti mieguistumą'],
  [/\bturi aiškų\s+(\p{L}+)\s+planas\b/giu, 'turi aiškų $1 planą'],
  [/\btampa stresas\b/giu, 'tampa stresinga'],
  [/\bsu begalės užduočių/giu, 'su begale užduočių'],
  [/\bnėra pats taupumas\?\s*$/giu, 'nėra pats taupumas.'],
  [/\bsavitvirtybe\b/giu, 'pasitikėjimu'],
  [/\bDažnas net nežino\b/giu, 'Dažnai nežinai'],
  [/([Ss]upranti[^.!?]*po valgio)\./giu, '$1?'],
  [/([Tt]u nori[^.!?]*artimaisiais)\./giu, '$1?'],
  [/([Gg]albūt[^.!?]*diskomfort)\./giu, '$1?'],
  // Posts 92–96 batch
  [/\bsusivildavimas\b/giu, 'susivėlavimu'],
  [/\blaiko susivildavimas\b/giu, 'laiko susivėlavimui'],
  [/\blaiko improvizacija\b/giu, 'laiko improvizacijai'],
  [/\bneturi laiko improvizacija\b/giu, 'neturi laiko improvizacijai'],
  [/Štai kodėl dažnai/giu, 'Todėl dažnai'],
  [/\bŠtai kodėl\s+(?!neverta\b|reikia\b|svarbu\b|geriau\b|padės\b)([a-ząčęėįšųūž]+)\b/giu, 'Todėl $1'],
  [/\bSupratusi savo\b/giu, 'Supratęs savo'],
  [/^Mažiau emocinio$/giu, 'Mažiau emocinio valgymo'],
  [/^Mažiau paslėptų$/giu, 'Mažiau paslėptų kalorijų'],
  [/\bpriimti įvykius\b/giu, 'priimti sprendimus'],
  [/\bPriešingos situacijos atveju\b/giu, 'Tokiais atvejais'],
  [/\bmažiau traukia užkandžiauti\b/giu, 'mažiau norisi užkandžiauti'],
  [/\bDabar žinai, kad mažiau sprendimų\.\s*$/giu, 'Dabar žinai: mažiau sprendimų reiškia daugiau energijos kasdieniam gyvenimui.'],
  [/\bPraktiška struktūra\b/giu, 'Aiškus planas'],
  [/\bKasdien renkiesi ramiau\b/giu, 'Kasdienius sprendimus priimi ramiau'],
  [/\bIlgainiui tai pastebi kasdienybėje\b/giu, 'Ilgainiui pajusi skirtumą kasdienybėje'],
  [/\bpasijauti tarsi ne savo kūne\b/giu, 'atsiduri situacijose, kurioms sunku rasti paaiškinimą'],
  [/\bDažnai atsiranda situacijų, kurioms neturi aiškaus paaiškinimo\b/giu, 'Dažnai atsiduri situacijose, kurioms neturi aiškaus paaiškinimo'],
  [/\bpasikartodami kasdieninį režimą\b/giu, 'kartodamiesi kasdienėje rutinoje'],
  [/\bTuomet netgi gali nejausti, kodėl esi tokioje situacijoje\b/giu, 'Todėl gali net nepastebėti, kaip atsidūrei tokioje situacijoje'],
  [/\bleidžia iš anksto pasiruošti kitai dienai\b/giu, 'padeda iš anksto pasiruošti dienai'],
  [/\bdieną išlaikanti veikla\b/giu, 'kasdienė rutina'],
  [/\bneveda tavęs į tikslus\b/giu, 'nepadeda siekti tavo tikslų'],
  [/\bGalbūt nežinai, kurioje vietoje esi\b/giu, 'Galbūt nežinai, nuo ko pradėti'],
  [/\bnebesiblaškai priimdamas kiekvieną sprendimą\b/giu, 'nebesiblaškai dėl kiekvieno sprendimo'],
  [/\bpadeda išlaikyti ramybę\b/giu, 'padeda išlikti ramiau'],
  [/\bar visada žini\b/giu, 'ar visada žinai'],
  [/\bvisada žini\b/giu, 'visada žinai'],
  [/\bpasirinksiesi\b/giu, 'pasirinksi'],
  [/\bimpulsinės pirkimo\b/giu, 'impulsyvaus pirkimo'],
  [/\bruošti maisto\b/giu, 'ruošti maistą'],
  [/(?<!\p{L})ką pasikeitė(?!\p{L})/giu, 'kas pasikeitė'],
  [/\bnuolatinio spėliojimų\b/giu, 'nuolatinio spėliojimo'],
  [/\bSupratusi,\s+kad tikslas\.?\s*$/giu, 'Supranti, kad tikslas aiškus.'],
  [/\bMaisto skoniu gali būti paveiktas\b/giu, 'Netinkamu maisto pasirinkimu gali būti paveiktas'],
  [/\bprisijungi prie maisto pasirinkimo\b/giu, 'nesąmoningai renkiesi maistą, kuris'],
  [/\bnedrįsta kristi\b/giu, 'nemažėja'],
  [/\bsvoris vis tiek nedrįsta\b/giu, 'svoris vis tiek nemažėja'],
  [/\bsukurti tinkančių receptų\b/giu, 'sukurti tinkančius receptus'],
  [/\bįtūkstamas\b/giu, 'varginantis'],
  [/\bpadės tau įsitikinti\.\s*$/giu, 'padės tau įsitikinti, kad planas veikia.'],
  [/\bkauptuvės\b/giu, 'kaupiasi'],
  [/\bgrįžta kontrolė savo dienoje\b/giu, 'atgauni kontrolę savo dienoje'],
  [/\bpadeda kasdien maistą rinktis ramiau\b/giu, 'padeda kasdien ramiai rinktis maistą'],
  [/\bPlanuodamas\b/giu, 'Kai planuoji'],
  [/\bDažnas susiduria\b/giu, 'Daugelis susiduria'],
  [/(?<!\p{L})įsitvirtina stabiliai(?!\p{L})/giu, 'įsitvirtina'],
  [/\btrūksta aiškių žingsnių, ką daryti\b/giu, 'trūksta aiškumo, ką daryti'],
  [/\bPopietė be kritimo:/giu, 'Popietė be energijos kritimo:'],
  [/\bsukelia streso ir paskatino\b/giu, 'sukelia stresą ir paskatina'],
  [/\bsukelia streso\b/giu, 'sukelia stresą'],
  [/\bruošiant maistą\.\s*namuose\b/giu, 'ruošiant maistą namuose'],
  [/\bsukelia diskomforto\b/giu, 'sukelia diskomfortą'],
  [/\bdažnoje virtuvėje\b/giu, 'dažnai virtuvėje'],
]

/** Generic planning-benefit filler — max once per story unless theme-matched. */
export const UGC_GENERIC_FILLER_PATTERNS: RegExp[] = [
  /\bKai žingsniai aiškūs\b/iu,
  /\bIš anksto suplanuotas pasirinkimas sumažina impulsyvius\b/iu,
  /\bAiškus planas padeda kasdien maistą rinktis ramiau\b/iu,
  /\bDiena be aiškaus plano prabėga\b/iu,
]

/** Meta scroll bait — no concrete topic information. */
export const UGC_ENGAGEMENT_BAIT_PATTERNS: RegExp[] = [
  /\bDauguma sustoja\b/iu,
  /\bToliau dalis,?\s+kuri\s+skaudžia\b/iu,
  /\bToliau dalis,?\s+kuri\s+skaudi\b/iu,
  /\bToliau dalis,?\s+kuri\s+skaudžiaus\b/iu,
  /\btoliau skaudžiausia dalis\b/iu,
  /\bJei vis dar skaitai\b/iu,
  /\bKabliukas buvo tik pradžia\b/iu,
  /\bPirmoji skaidrė buvo lengva\b/iu,
  /\bJei tai pataikė,?\s+sekanti skaidrė\b/iu,
  /\bAntroji parodys,?\s+ar tai apie tave\b/iu,
]

export function textHasEngagementBait(text: string): boolean {
  const s = String(text || '').trim()
  if (!s) return false
  return UGC_ENGAGEMENT_BAIT_PATTERNS.some((re) => re.test(s))
}

export function collectEngagementBaitIssues(opts: {
  title?: string
  body?: string
}): Array<{ code: string; message: string }> {
  const combined = `${opts.title || ''} ${opts.body || ''}`.trim()
  if (!combined || !textHasEngagementBait(combined)) return []
  return [
    {
      code: 'engagement_bait',
      message: 'Slide uses meta scroll bait instead of topic content',
    },
  ]
}

export function countGenericFillerSlides(
  slides: Array<{ title?: string; body?: string }>,
): number {
  let count = 0
  for (const slide of slides) {
    const text = `${slide.title || ''} ${slide.body || ''}`
    if (UGC_GENERIC_FILLER_PATTERNS.some((re) => re.test(text))) count++
  }
  return count
}

/** Convert residual first-person copy to the required reader-facing „tu" register. */
export function normalizePersonRegister(text: string): string {
  return text
    .replace(/(?<!\p{L})jaučiu(?!\p{L})/giu, 'jauti')
    .replace(/(?<!\p{L})jaučiuosi(?!\p{L})/giu, 'jauti')
    .replace(/(?<!\p{L})noriu(?!\p{L})/giu, 'nori')
    .replace(/(?<!\p{L})suprantu(?!\p{L})/giu, 'supranti')
    .replace(/(?<!\p{L})įsitikinau(?!\p{L})/giu, 'įsitikinai')
    .replace(/(?<!\p{L})pastebėjau(?!\p{L})/giu, 'pastebėjai')
    .replace(/(?<!\p{L})pradėjau(?!\p{L})/giu, 'pradėjai')
    .replace(/(?<!\p{L})galėčiau(?!\p{L})/giu, 'galėtum')
    .replace(/(?<!\p{L})patenkinčiau(?!\p{L})/giu, 'patenkintum')
    .replace(/(?<!\p{L})planuoju(?!\p{L})/giu, 'planuoji')
    .replace(/(?<!\p{L})randu(?!\p{L})/giu, 'randi')
    .replace(/(?<!\p{L})užsisakiau(?!\p{L})/giu, 'užsisakei')
    .replace(/(?<!\p{L})norėjau(?!\p{L})/giu, 'norėjai')
    .replace(/(?<!\p{L})atsisakiau(?!\p{L})/giu, 'atsisakei')
    .replace(/(?<!\p{L})planavau(?!\p{L})/giu, 'planavai')
    .replace(/(?<!\p{L})nusprendžiau(?!\p{L})/giu, 'nusprendei')
    .replace(/(?<!\p{L})nežinojau(?!\p{L})/giu, 'nežinojai')
    .replace(/(?<!\p{L})žinojau(?!\p{L})/giu, 'žinojai')
    .replace(/(?<!\p{L})maniau(?!\p{L})/giu, 'manei')
    .replace(/(?<!\p{L})bandžiau(?!\p{L})/giu, 'bandei')
    .replace(/(?<!\p{L})supratau(?!\p{L})/giu, 'supratai')
    .replace(/(?<!\p{L})jaučiau(?!\p{L})/giu, 'jautei')
    .replace(/(?<!\p{L})suprantame(?!\p{L})/giu, 'supranti')
    .replace(/(?<!\p{L})galime(?!\p{L})/giu, 'gali')
    .replace(/(?<!\p{L})galėsime(?!\p{L})/giu, 'galėsi')
    .replace(/(?<!\p{L})norėjome(?!\p{L})/giu, 'norėjai')
    .replace(/(?<!\p{L})turime(?!\p{L})/giu, 'turi')
    .replace(/(?<!\p{L})mums(?!\p{L})/giu, 'tau')
    .replace(/(?<!\p{L})mūsų(?!\p{L})/giu, 'tavo')
    .replace(/(?<!\p{L})aš\s+/giu, '')
}

function repairRhetoricalTuQuestionMarks(text: string): string {
  const parts = String(text || '')
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (!parts.length) return text
  return parts
    .map((sentence) => {
      if (!sentence.endsWith('.')) return sentence
      const bare = sentence.replace(/\.\s*$/u, '').trim()
      if (!bare) return sentence
      if (LT_QUESTION_WORD_START_RE.test(bare) || LT_QUESTION_STARTER_RE.test(bare)) return sentence
      if (LT_DECLARATIVE_INSIGHT_RE.test(bare)) return sentence
      if (LT_RHETORICAL_DIRECT_QUESTION_RE.test(bare) || LT_RHETORICAL_PARTICIPLE_HOOK_RE.test(bare)) {
        return `${bare}?`
      }
      return sentence
    })
    .join(' ')
}

function applyLtPhrasePasses(text: string): string {
  let out = text
  for (const [re, rep] of FORMAL_TO_TU) out = applyCasePreserving(out, re, rep)
  for (let pass = 0; pass < 2; pass++) {
    for (const [re, rep] of PHRASE_FIXES) out = applyCasePreserving(out, re, rep)
    out = out.replace(/\bŠtai kodėl(?:\s+neverta)+\s+/giu, 'Štai kodėl neverta ')
  }
  out = repairLtCaseAgreement(out)
  out = repairRhetoricalTuQuestionMarks(out)
  out = applyUniversalLtClassRepairs(out)
  out = repairDeclarativeQuestionMarks(out)
  return normalizePersonRegister(out)
}

/** Strip stray „?" from declarative sentences (rule 13 backup after PHRASE_FIXES). */
function repairDeclarativeQuestionMarks(text: string): string {
  const parts = String(text || '')
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (!parts.length) return text
  return parts
    .map((sentence) => (isDeclarativeQuestionMark(sentence) ? sentence.replace(/\?\s*$/, '.') : sentence))
    .join(' ')
}

/** Capitalize sentence starts after repairs — skip mid-clause fragments (…, nes, kad). */
export function polishLtCaps(text: string): string {
  const continuation = /^(nes|kad|bet|ir|arba|todėl|kai|jei|kol|nors|tačiau|dėl)$/iu
  let out = text.replace(/([.!?…]\s+)([a-ząčęėįšųūž]\p{L}*)/gu, (_, pre: string, word: string) =>
    continuation.test(word) ? pre + word : pre + word.charAt(0).toUpperCase() + word.slice(1),
  )
  const trimmed = out.trimStart()
  const lead = out.slice(0, out.length - trimmed.length)
  if (!trimmed || !/^[a-ząčęėįšųūž]/.test(trimmed)) return out
  if (/^\.{2,}/.test(trimmed) || /^…/.test(trimmed)) return out
  if (continuation.test(trimmed.split(/\s+/)[0] || '')) return out
  return lead + trimmed.replace(/^([a-ząčęėįšųūž])/u, (_, c: string) => c.toUpperCase())
}

/** Residual we-forms — shared by gibberish gate + audit/caption scanners. */
export const UGC_LT_RESIDUAL_WE_FORMS =
  /\b(susiduriame|jaučiame|siekdami|išmetame|perkame|suvartojame|neplanuojame|pastebėjau|neturime(?:\s+laiko)?|dedame|valgome|ruošiame|pasiūlysime|pritaikome|ruošiamės|užsisklendiname|pamirštame|stengiame|besiruošiame|pasiektume|nesportuojame|manome|suprantame|galime|galėsime|norėjome|turime|mums|mūsų|jaučiau|nežinojau|maniau|bandžiau|supratau)\b/i

/** Known bad stems / invented forms — never ship. */
const LT_BAD_STEMS =
  /(?:^|[^\p{L}])(maistinu|angidrat|aklavog|pensoj|sojos gami|baltimų|anglevanden|hydratac|įsismuov|hidratacijąj|atsvarum|nebebeg|žaidžiami|užsispyti|svytuot|biebalu|kalorijus|apgavius|apgavus|apgauding|virimo plan|virimo seans|nešlamž|subręst|rūpestų|varginamas|maistinimas|užmiršt|badmečio|treniruoj(?!ot)|pabandint|skaidrut|patiekas|rudenių|fokusuoja|poveikio tavo|patiekalimis|trūgst|besimaugin|įtūmi|norėtumis|režinas|sunksta|nuovokio|aišus(?!k)|medžiuk|tebetruksm|stengiame|anglies hidrat|insulinrezist|kątį|rutinoj|bėdel|valgoji|vargst|virsnum|viršinam|tebesild|kasmens|utėlius|galimi|šventvėlių|ištvermas|įsisistemin|viršvalgėj|pamėteli|vargdas|mėgauties|susivildavimas|netenkin|susierin(?!zin)|svėris)\w*/iu

/** Detect llama3.1 / OpenEuroLLM gibberish + broken structure — reject and retry. */
export function isGibberishLtCopy(text: string): boolean {
  const t = String(text || '').trim()
  if (!t) return true
  if (/žaidžiami|nebebeg|užsispyti|kuo žaid/i.test(t)) return true
  if (LT_BAD_STEMS.test(t)) return true
  if (isChristmasGiftsNiche() && UGC_DIET_DRIFT_RE.test(t)) return true
  if (isOffTopicNonFoodLtCopy(t)) return true
  // Residual we-forms addressing the reader (should have been rewritten to „tu")
  if (UGC_LT_RESIDUAL_WE_FORMS.test(t)) return true
  if (/Galime eksperimentuoti/i.test(t)) return true
  if (/\bpats\s*\(\s*i\s*\)|\bpati\s*\(\s*s\s*\)/i.test(t)) return true
  // Wrong reflexive for solo meal planning
  if (/\bpasiskirstyk\b/i.test(t)) return true
  // Participle agreeing with genitive pile instead of accusative kalną
  if (/suverstų\s+\w+\s+kalną/i.test(t)) return true
  // First-person narrator + tu clash (ignore brand „Tavo knyga")
  {
    const clashProbe = t.replace(/tavo\s+knyga/giu, 'BRAND')
    const firstPerson =
      /\b(jaučiuosi|aš\s+ruoš|randu|galėčiau|pradėjau|aš\s+planuoju|noriu|suprantu|įsitikinau|patenkinčiau|norėjau|atsisakiau|planavau|nusprendžiau|nežinojau|maniau|bandžiau|supratau)\b/i.test(clashProbe)
    const tuAddress = /\b(tu|tavo|jauti|stengiesi|planuoji)\b/i.test(clashProbe)
    if (firstPerson && tuAddress) return true
    // Bare first-person monologue in UGC (always tu-address)
    if (/\b(galėčiau|pradėjau|užsisakiau|jaučiu|aš\s+planuoju)\b/i.test(clashProbe)) return true
  }
  // Gender hedge / feminine-only close in tu story
  if (/\b(stebėdama|besiruošdama|kontroliuodama)\b/i.test(t)) return true
  // Gender swing in one slide (feminine + masculine participles)
  if (
    /\b(įstrigusi|besiruošdama|kontroliuodama|užstrigusi)\b/i.test(t) &&
    /\b(ruošdamasis|įstrigęs|kontroliuodamas|besiruošdamas)\b/i.test(t)
  ) {
    return true
  }
  // Em dashes never in shipped copy
  if (/—|–/.test(t)) return true
  // Stump: „Taigi, noun." / bare planning noun
  if (/taigi,\s*\w+\.\s*$/i.test(t) && !/\b(reikia|svarbu|geriau|neverta)\b/i.test(t)) return true
  if (/^\s*suplanavimas\.?\s*$/i.test(t)) return true

  if (/\b(meal prep|workout|link in bio|swipe up|macros)\b/i.test(t)) return true
  // Emoji spam in body (CTA belongs only in cta field, once)
  if ((t.match(/🤩/g) || []).length >= 2) return true
  // Christmas: 0–2 relevant pictographs are allowed (budget trimmed before ship).
  if (!isChristmasGiftsNiche() && (t.match(/\p{Extended_Pictographic}/gu) || []).length >= 2) {
    return true
  }
  if (/Pradėk 5 min\.?\s*testą[!?\s]*🤩[!?\s]*🤩/i.test(t)) return true
  // Broken structure: „Štai kodėl + infinitive“ without neverta/reikia
  if (/\bkodėl\s+(?!neverta\b|reikia\b|svarbu\b)[a-ząčęėįšųūž]+oti(?:s)?\b/i.test(t)) return true
  // Noun-phrase stump as whole “sentence” (genitive pile, no verb)
  if (looksVerblessGenitiveStump(t)) return true
  for (const s of t.split(/(?<=[.!?…])\s+/).map((x) => x.trim()).filter(Boolean)) {
    const clauses = s.split(/,\s+/).map((c) => c.trim()).filter(Boolean)
    for (const clause of clauses.length > 1 ? clauses.slice(1) : []) {
      if (/^o\s+\p{L}+\.\s*$/iu.test(clause) && !textHasFiniteVerbCue(clause)) {
        return true
      }
    }
  }
  if (/\bsusivildavimas\b/i.test(t)) return true
  if (/\bpriimti įvykius\b/i.test(t)) return true
  if (/^Mažiau emocinio$/i.test(t.trim())) return true
  if (/\bDabar žinai, kad mažiau sprendimų\.\s*$/i.test(t)) return true
  if (/\b(pasirinksiesi|įtūkstamas)\b/i.test(t)) return true
  if (/\b(ar\s+)?visada\s+žini\b/i.test(t)) return true
  if (/\bSupratusi,\s+kad tikslas\./i.test(t)) return true
  if (/\bpadės\b[^.]{0,48}įsitikinti\s*\.\s*$/i.test(t) && !/įsitikinti,\s+kad/i.test(t)) return true
  // Fragmented mid-thought (period then bare infinitive / stump)
  if (/\.\s*(Papildomai įkrauti|įkrauti)\b/i.test(t)) return true
  if (/,\s*$/.test(t) && t.length < 80) return true
  if (/\b(bet|kad|ir|arba|nes|kadangi)\s*$/iu.test(t)) return true
  // Triple letter runs (nebebegaja-style)
  if (/(.)\1\1/u.test(t.replace(/\s/g, ''))) return true
  // Invented long mash (ąjos / ijųų style endings on wrong stems)
  if (/[a-ząčęėįšųūž]{4,}acijąj|[a-ząčęėįšųūž]{3,}ismuov/i.test(t)) return true
  const words = t.toLowerCase().split(/[^\p{L}]+/u).filter((w) => w.length >= 2)
  if (words.length >= 4) {
    const weird = words.filter((w) => !/^[aąbcčdeęėfghiįyjklmnoprsštuųūvzž]+$/u.test(w) || w.length > 18)
    if (weird.length >= 2) return true
  }
  return false
}

const LT_FINITE_VERB_CUES =
  /\b(yra|bus|buvo|tampa|jauti|jaučia|jautiesi|gali|turi|reikia|reikėtų|rinkis|rinktis|padeda|verčia|mažina|didina|duoda|duoti|žinai|žinau|planuoji|sprendžiu|sprendi|trūksta|pritrūksta|priklauso|šoka|ieško|ieškai|ieškoti|skamba|veikia|baigiasi|prasideda|keičiasi|svyruoja|svyruoti|grįžta|grįžti|grįžo|suplanuoja|sudėlioja|atidedi|pamiršti|pamiršai|nori|esi|galėsi|mėgautis|atsisakyk|planuok|skaityk|pradėk|apsilankyk|stringi|pastebėjai|susiduri|perki|išmeti|kreipia|trukdo|išsprendžia|suprask|supratai|supranti|slepiasi|slepia|ruošiant|rask|pasirūpink|džiaukis|pajustum|randi|atnešė|atneša|suteikė|suteikia|padėjo|leido|leidžia|įsitikinai|patyrei|patyrė|liko|likti|sutaupė|sutaupo|užgriūva|sujungia|artėja|laukia|atsiranda)\b/i

/** Genitive endings for verbless-stump detection — narrow pile (io/ių/ų), not masc -o adj+noun. */
const LT_GENITIVE_STUMP_ENDING_RE = /(?:io|ių|ų)$/iu

function looksLtGenitiveStumpEnding(token: string): boolean {
  if (!token || token.length < 4) return false
  const w = token.toLocaleLowerCase('lt-LT')
  if (/(?:ti|tis)$/i.test(w)) return false
  return LT_GENITIVE_STUMP_ENDING_RE.test(w)
}

/** Present reflexive finite verbs (-asi / -osi / -iasi) — structural, not per-verb list. */
export const LT_REFLEXIVE_FINITE_RE = /\b\p{L}{3,}(?:asi|osi|iasi)\b/iu

export function textHasFiniteVerbCue(text: string): boolean {
  const core = String(text || '').trim()
  if (!core) return false
  return LT_FINITE_VERB_CUES.test(core) || LT_REFLEXIVE_FINITE_RE.test(core)
}

/** „Lengvų X ir Y.“ style — genitive list with no finite verb. */
function looksVerblessGenitiveStump(text: string): boolean {
  const sentences = text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
  for (const s of sentences) {
    const core = s.replace(/[.!?…]+$/u, '').trim()
    const words = core.split(/\s+/).filter(Boolean)
    if (words.length < 2 || words.length > 7) continue
    const hasFiniteCue =
      textHasFiniteVerbCue(core) || /(ti|tis)$/i.test(words.at(-1) || '')
    const plausiblePastTense = words.some((w) => /[a-ząčęėįšųūž]{4,}ė$/iu.test(w))
    const skip = new Set(['ir', 'be', 'nuo', 'iki', 'bei', 'ar', 'bet'])
    const content = words.filter((w) => !skip.has(w.toLocaleLowerCase('lt-LT')))
    const narrowHeavy = content.filter((w) => looksLtGenitiveStumpEnding(w)).length
    const genitiveHeavy = content.filter((w) => looksLtGenitiveEnding(w)).length
    if (!hasFiniteCue && !plausiblePastTense && narrowHeavy >= 2 && words.length <= 6) return true
    if (
      !hasFiniteCue &&
      !plausiblePastTense &&
      content.length >= 2 &&
      genitiveHeavy >= 2 &&
      genitiveHeavy >= content.length - 1 &&
      words.length <= 6
    ) {
      return true
    }
  }
  return false
}

/** Contrastive examples for prompts (full + lite). */
export const UGC_LT_TU_REGISTER_BLOCK = `KREIPINYS „TU" — KRITINĖ (UGC = kaip draugui, NE institucija / naujienos):
✗ jaučiatės → ✓ jauti | ✗ jums / jūsų → ✓ tau / tavo | ✗ Pradėkite → ✓ Pradėk
✗ pajautekite / pajuskite → ✓ pajusk | ✗ galite → ✓ gali | ✗ turite → ✓ turi | ✗ esate → ✓ esi
✗ žinote → ✓ žinai | ✗ norite → ✓ nori | ✗ raskite → ✓ rask | ✗ skaitykite → ✓ skaityk
✗ Įsiklausykite → ✓ Įsiklausyk | ✗ stringate/įstrigstate → ✓ stringi | ✗ apsilankykite → ✓ apsilankyk
Pavyzdys: ✗ „Jei jaučiatės, kad stringate — pradėkite testą." → ✓ „Jei jauti, kad stringi — pradėk testą."
DRAUDŽIAMA forma „jūs" bet kur — skaidrėse, CTA, apraše.`

export const UGC_LT_OPENER_BLOCK = `SAKINIO PRADŽIA — tas pats žodis MAX 1 kartą visame karuselės tekste:
✗ trys sakiniai „Mes neprimetame…", „Mes padedame…", „Mes padedame jums…"
✓ vienas „Mes…", kiti prasideda kitaip: „Tai…", „Kai…", „Tavo…", „Planas…", „Kai…", „Todėl…"`

/** Positive craft — how to write beautiful LT UGC (sent to the model). */
export const UGC_LT_CRAFT_BLOCK = `RAŠYK GRAŽIAI IR TAISYKLINGAI (lt-LT raštingumas):
- Skamba kaip gyvas žmogus TikTok/Reels — šilta, konkretu, rami, be pompastikos.
- 1–2 trumpi sakiniai / skaidrė. Kiekvienas sakinys = aiški mintis + FINITYVINIS veiksmažodis.
- Konkretika > abstrakcija: ✓ „vakare vėl nežinai, ką gaminti" ✗ „šiandieniniame pasaulyje svarbu…"
- Linksnis, giminė, skaičius SUTAMPA (būdvardis + daiktavardis).
- Baigk PILNĄ žodį ir sakinį — jokių nukirtimų („sojos gami", „Pradėk 5 min.").
- Kiekviena skaidrė = NAUJAS istorijos žingsnis; nekartok ankstesnių sakinių.
- Mitybos žodžiai TIK teisingi: maitinimas, angliavandeniai, baltymai, aminorūgštys, kalorijos, hidratacija.
- Be lyties formų porų (pavargęs/pavargusi) — rašyk neutraliai („kai pritrūksta jėgų").
- Skyryba: taškas ar kablelis. Be ilgojo brūkšnelio (—) body tekste.
- Body/title: BE emoji (NIEKADA 🤩 spam). Close cta TIK VIENĄ kartą tiksliai:
  „Apsilankyk tavoknyga.com ir pradėk 5 min. testą! 🤩"
- NIEKADA neišgalvok žodžių. Jei abejoji — rinkis paprastą, aiškų žodį.
- Skaitytojas = „tu". Venk mes-formų veiksmažodžių („perkame", „išmetame", „dedame") — rašyk „perki", „išmeti", „dedi".
- Title — sakinio didžioji (ne Title Case kiekvienam žodžiui).
- Hook title = PILNA frazė su daiktavardžiu: ✓ „Mažiau emocinio valgymo" ✗ „Mažiau emocinio" (be daiktavardžio).
- Priežastinėms pasekmėms rinkis „Todėl", ne „Štai kodėl" (nebent produkto pitch close skaidrėje).
- Po „laiko/neturi laiko" — naudininkas: ✓ improvizacijai ✗ improvizacija.
- Dalyviai vyriškoji forma (tu): ✓ Supratęs ✗ Supratusi. Build skaidrėje — mechanizmas, ne išvada.
- Venk vertimo kalbos: Praktiška struktūra, pasikartodami režimą, dieną išlaikanti veikla, priimti įvykius, Priešingos situacijos atveju.
- Build skaidrė NIEKADA nekartoja close išvados („Supranti, kad…" / „Dabar žinai, kad…" — tik close).
- DRAUDŽIAMA meta / scroll bait: kvietimas scroll'inti be temos turinio („dauguma sustoja", „jei vis dar skaitai", „toliau skaudžiausia dalis" ir pan.) — jokia skaidrė be konkrečios temos informacijos.
- Kiekviena skaidrė = naujas žingsnis (įvykis → priežastis → posūkis → rezultatas). Skaidrė 2 paaiškina KODĖL, ne kviečia scroll'inti.

PAVYZDŽIAI (natūralus lt-LT):
✓ Hook: „Kas slepiasi už tavo įpročių?" + „Dažnai atsiduri situacijose, kurioms neturi aiškaus paaiškinimo."
✓ Context: „Kartodamiesi kasdienėje rutinoje, ne visada pastebi, kas iš tikrųjų keičiasi."
✓ Build: „Aiškus planas padeda iš anksto pasiruošti dienai. Kasdienius sprendimus priimi ramiau."
✓ Close: „Dabar žinai: mažiau sprendimų reiškia daugiau energijos kasdieniam gyvenimui."
✓ Emocinis valgymas: „Mažiau emocinio valgymo. 30 klausimų testas sumažina sprendimų naštą, todėl streso metu mažiau norisi užkandžiauti."`

/** 21 clarity guardrails — posts 97–105 (sync Modelfile via sync-ugc-modelfile.ts + ugc-copy-skill). */
export const UGC_LT_CLARITY_GUARDRAILS_BLOCK = `AIŠKUMAS IR GRAMATIKA — 21 TAIYKLIŲ (tikros klaidos — NEKARTOK):
1. JOKIŲ šūvių: kiekvienas sakinys = pilnas veiksnys + tarinys; po „kad…" VISADA užbaik mintį.
   ✗ „Mažiau emocinio." / „Dabar žinai, kad mažiau sprendimų." / „Supratusi, kad tikslas."
   ✓ „Mažiau emocinio valgymo." / „Dabar žinai, kad mažiau sprendimų reiškia daugiau energijos."
2. LINKSNIAI — ruošti/sukurti/pasirinkti/sukelti + GALININKAS (ne kilmininkas).
   ✗ ruošti maisto → ✓ ruošti maistą | ✗ sukurti tinkančių receptų → ✓ sukurti tinkančius receptus | ✗ sukelia streso → ✓ sukelia stresą
3. GIMINĖ/SKAIČIUS — būdvardis sutampa su daiktavardžiu.
   ✗ impulsinės pirkimo → ✓ impulsyvaus pirkimo
4. ASMENUOJIMAS — tikrink asmenio galūnes, ypač refleksyvius.
   ✗ ar visada žini → ✓ ar visada žinai | ✗ pasirinksiesi → ✓ pasirinksi
5. KOLLOKACIJA — skaityk pažodžiui: ar tai logiška lietuvių kalboje?
   ✗ priimti įvykius → ✓ priimti sprendimus | ✗ Maisto skoniu gali būti paveiktas → ✓ Netinkamu maisto pasirinkimu gali būti paveiktas
   ✗ prisijungi prie maisto pasirinkimo → ✓ nesąmoningai renkiesi maistą, kuris… | ✗ nedrįsta kristi → ✓ nemažėja
6. ŠABLONO ĮTERPIMAS — „Kai turi aiškų ___ žingsnis…" tik su planu/meniu/rinkiniu (ne maisto švaistymu).
7. BE PASIKARTOJIMŲ — ta pati mintis skirtingais žodžiais DRAUDŽIAMA (ir beveik ta pati mintis — žr. 14).
8. Kablelis prieš trumpą įžangą (2–4 žodžiai) — venk.
   ✗ Priešingos situacijos atveju, gali… → ✓ Tokiais atvejais gali…
9. TERMINAS — vienas sąvokos žodis visam postui (ne impulsinis + impulsyvus maišant tą pačią idėją).
10. NEUTRALI GIMINĖ — venk privalomos lyties dalyvių (supratusi/supratęs); rašyk supranti arba neutraliai.
11. ABSTRAKCijos uždarymas reikalauja objekto: ✗ padės įsitikinti → ✓ padės įsitikinti, kad planas veikia.
12. Hook su pliku kilmininku — užpildyk objektą: ✗ Popietė be kritimo → ✓ Popietė be energijos kritimo.
13. Klaustukas tik tikram klausimui — ne teiginiui su „?". ✗ Netinkamas maistas gali sugadinti popietę? → ✓ …popietę. ✓ Jauti, kad…? / ✓ Maisto ruošimas: kodėl…?
14. Beveik dublių — ta pati mintis kitais žodžiais DRAUDŽIAMA (tikrink teiginį, ne tik žodžius).
15. Body nekartoja hook title — jei body prasideda ta pačia frazė kaip title, išmesk ir rašyk naują mintį.
16. Venk „Dažnas susiduria" — ✓ Daugelis susiduria arba neutralus impersonalus.
17. Kilmininkas + santykinė: ✗ trūksta aiškių žingsnių, ką daryti → ✓ trūksta aiškumo, ką daryti.
18. Pleonazmas: ✗ įsitvirtina stabiliai → ✓ įsitvirtina.
19. Paskutinės 1–2 skaidrės + close CTA VISADA susieja su maistu/mityba/planavimu — net jei hook apie gyvenimo etapą ar emociją. Caption boilerplate neskaičiuojamas.
20. Adverbas, ne būdvardis prie daiktavardžio: ✗ dažnoje virtuvėje → ✓ dažnai virtuvėje (virtuvė negali būti „dažna").
21. Suderinta laikų eiga sujungtame sakinyje: ✗ sukelia streso ir paskatino → ✓ sukelia stresą ir paskatina.
22. Cukraus kontrastas — jei ankstesnėje skaidrėje kalbėjai apie cukrų/saldumynų šuolį, satiety/baltymų/skaidulų skaidrėje privaloma paminėti ko cukrus nesuteikia (pvz. ilgalaikio sotumo).
23. Po „vyksta / dažnai vyksta" — dalyvis, ne liepsniškas veiksmažodis: ✗ nesusimastyk, siekiant → ✓ nesusimąstant, siekiant
24. Veiksmažodis „maitina" + GALININKAS: ✗ maitina tavęs → ✓ maitina tave
25. Emocinis valgymas — natūralūs žodžiai: ✗ trumpalaikės palaimos → ✓ trumpalaikio malonumo | ✗ pasiduoti saldumams → ✓ pasiduoti saldumynams`

/** Second-pass LT QA user prompt — one Ollama call before ship gate. */
export const UGC_LT_QA_PROMPT = `Perskaityk kiekvieną sakinį atskirai. Ar kiekvienas sakinys yra pilnas (turi veiksnį ir tarinį)? Ar kiekvienas veiksmažodis derinamas su tinkamu linksniu? Ar klaustukas naudojamas tik tikram klausimui? Ar sakinys turi prasmę pažodžiui, ne tik gramatiškai? Ištaisyk, jei ne.`

/** Sentence structure — blocks stupid / incomplete syntax. */
export const UGC_LT_STRUCTURE_BLOCK = `SAKINIO STRUKTŪRA — GRIEŽTA:
✓ Po „Štai kodėl / Todėl / Dėl to" — VISADA veiksmažodis su prasme: „neverta…", „reikia…", „svarbu…", „geriau…"
✗ „Štai kodėl koncentruotis…" (infinityvas be neiginio/modalumo) — BROKEN
✓ Sakinys = kas + ką daro (+ objektas). ✗ Vien kilmininkų krūva: „Lengvų angliavandenių ir baltymų."
✓ Klausimas baigiasi „?". Teiginys baigiasi „." — ne kableliu, ne „bet tai."
✗ Trumpas kelmas po taško: „O vaisiai. Papildomai įkrauti." → ✓ vienas pilnas sakinys
✗ Kartoti tą pačią mintį kitais žodžiais toje pačioje skaidrėje
PRIEŠ SIŲSDAMAS (savikontrolė): 1) kiekvienas žodis — tikras lt-LT? 2) kiekvienas sakinys turi veiksmažodį? 3) body be emoji/CTA?`

export const UGC_LT_HOOK_BLOCK = `HOOK (1 skaidrė) — GRIEŽTA:
- title = trumpas kabliukas (≤60 simb.), sakinio didžioji — NE Title Case.
- Question stilius ARBA title prasideda „Ar" / „Kodėl": title BAIGIASI „?" (NIEKADA taškas).
- Be CTA, be URL, be emoji title/body.
- body = 1–2 sakiniai, nauja mintis (ne title pakartojimas).
- Title negali būti tik „Mažiau + būdvardis" be daiktavardžio (✗ „Mažiau emocinio" → ✓ „Mažiau emocinio valgymo").`

export const UGC_LT_CLOSE_BLOCK = `CLOSE (paskutinė) — GRIEŽTA:
- body = trumpa išvada / payoff (1–2 sakiniai). BE CTA teksto body.
- cta laukas VISADA tiksliai VIENĄ kartą:
Apsilankyk tavoknyga.com ir pradėk 5 min. testą! 🤩`

export const UGC_LT_CAPTION_SEO_BLOCK = `DISCORD APRAŠYMAS (kai prašoma) — SEO:
- LYGIAI 3 turinio pastraipos + CTA: 1) hook/klausimas 2) insight 3) nauda/posūkis; tada tavoknyga.com CTA
- Openeris turi derėti: klausimui — „Priminimas"/„Atkreipk dėmesį"; faktui — „Štai kas svarbu"; skaudžiai tiesai — „Sunki tiesa" (ne klausimui!)
- Hashtagai tik apačioje (sistema prideda). Be emoji spam.`


export const UGC_LT_GRAMMAR_BLOCK = `GRAMATIKA — NIEKADA šių klaidų (nulis tolerancijos):
✗ Metu laiko → ✓ Metas | ✗ apgaviusius → ✓ apgaulingus | ✗ aklavogė → ✓ chaosas
✗ pensoją → ✓ pensiją | ✗ virimo planas → ✓ maisto planas | ✗ kiekvienas vakarų → ✓ kiekvienas vakaro
✗ jaučiasi → ✓ jauti | ✗ atidėji → ✓ atidedi | ✗ tampa malonumas → ✓ tampa malonumu
✗ reikiamo baltymai → ✓ reikiamų baltymų | ✗ aminorūgšties → ✓ aminorūgštis | ✗ baltimų → ✓ baltymų
✗ vegan baltymai → ✓ veganiški baltymai | ✗ sojos gami → ✓ sojos gaminiai
✗ maistinu → ✓ maitinimu | ✗ angidratų → ✓ angliavandenių | ✗ anglevanden* → ✓ angliavanden*
✗ o vaisiai. Papildomai įkrauti → ✓ o vaisiai papildomai įkrauna energiją
✗ organizmas reikia → ✓ organizmui reikia | ✗ trūksta energija → ✓ trūksta energijos
✗ Dažnas pamiršta → ✓ Dažnai pamiršti | ✗ meal prep/workout/link in bio — DRAUDŽIAMA (rašyk LT)
✗ įsismuovė → ✓ šoka | ✗ atsvarumo → ✓ nusiraminimo | ✗ hidratacijąjos → ✓ hidratacijos
✗ svytuoti → ✓ svyruoti | ✗ ramumą (klaidinga) → ✓ ramybę | ✗ emocinio kalnelio → ✓ emocijų kalnelio
✗ subręsta → ✓ genda | ✗ nešlamžtų → ✓ nesugestų | ✗ rūpestų → ✓ rūpesčių
✗ dažnas jauti varginamas → ✓ dažnai jauti nuovargį | ✗ atskiriasi → ✓ skiriasi
✗ apgaudingus → ✓ apgaulingus | ✗ užmiršti → ✓ pamiršti | ✗ maistinimas → ✓ maitinimas
✗ susiduriame/išmetame/perkame/dedame/stengiame → ✓ susiduri/išmeti/perki/dedi/stengiesi | ✗ pastebėjau → ✓ pastebėjai
✗ fokusuoja → ✓ kreipia dėmesį | ✗ rudenių → ✓ rudens | ✗ atsižvelgdamas → ✓ atsižvelgiant
✗ pasiskirstyk (kai planuoji vienas) → ✓ paskirstyk | ✗ daržoves savaitgaliams → ✓ daržoves savaitei
✗ suverstų daržovių kalną → ✓ suverstą daržovių kalną (derinys su „kalną")
✗ trūgsta → ✓ trūksta | ✗ besimauginantis → ✓ besimaitinantis | ✗ Aišus → ✓ Aiškus
✗ patiekalimis → ✓ patiekalais | ✗ anglies hidratų → ✓ angliavandenių | ✗ medžiukų → ✓ medžiagų
✗ kątį → ✓ kątik | ✗ rutinoją → ✓ rutiną | ✗ bėdeles → ✓ bėrimus | ✗ valgoji → ✓ valgai
✗ pats(i) → ✓ tu | ✗ Galėčiau/Pradėjau → ✓ Galėtum/Pradėjai | ✗ Stebėdama → ✓ Kai stebi
✗ tu galimi / Dabar galimi → ✓ tu gali / Dabar gali | ✗ jaučiat → ✓ jauti
✗ įsitikinau / noriu / suprantu → ✓ įsitikinai / nori / supranti
✗ jaučiu / užsisakiau → ✓ jauti / užsisakei | ✗ jaučiame / Siekdami → ✓ jauti / Kai sieki
✗ Nustokit / planuokite / gaiškite → ✓ Nustok / planuok / gaišk
✗ ką dedamas → ✓ ką dedi | ✗ skanus maistas → ✓ skanų maistą | ✗ Greitais ir patogiais → ✓ Greita ir patogu
✗ kasmens / utėlius / apjungia → DRAUDŽIAMA | ✗ maisto gėriu → ✓ maisto skoniu
✗ skyręs(-ei) / išsekęs(-us) → rašyk neutraliai, be skliaustinių lyčių porų
✗ „meal kit" body → ✓ maisto rinkinys (EN terminas leidžiamas daugiausia kartą hook title)
✗ šventvėlių / Ištvermas / įsisisteminus / viršvalgėjimo / Pamėteli → DRAUDŽIAMA
✗ gali suderinsi → ✓ gali suderinti | ✗ jausiesi pavargęs (dabartis) → ✓ jautiesi pavargęs
✗ įsisotinęs miegas → ✓ kokybiškas miegas | ✗ užkasti (maistą) → ✓ užkąsti
✗ Taigi, suplanavimas. → ✓ Taigi svarbu iš anksto suplanuoti.
✗ Title „Ar …" BE „?" → VISADA baigiasi „?"
✗ „Štai kodėl koncentruotis…" → ✓ „Štai kodėl neverta koncentruotis…" (pilnas sakinys)
✗ 🤩!🤩!🤩 — DRAUDŽIAMA; CTA emoji TIK 1 kartą cta lauke
✗ Nenorisi → ✓ Nenori | ✗ pasirūpintį → ✓ pasirūpinti | ✗ ima dėvėti (maistui) → ✓ ima gesti
✗ Norėjau / Atsisakiau / Planavau → ✓ Norėjai / Atsisakei / Planavai (visada „tu", ne „aš")
✗ Planuodamas → ✓ Kai planuoji | ✗ Ar X. Y? (taškas klausime) → ✓ Ar X — Y?
✗ kauptis pradeda nereikalingas atsargos → ✓ kaupiasi nereikalingos atsargos
✗ kontrolę virš savo dienos → ✓ kontrolę savo dienoje
✗ Supranti, kad tvarkinga virtuvė. (be pabaigos) → ✓ …sutaupo laiko.
✗ visada tuščias tik tada, kai reikia naujų → ✓ tuščias tik tada, kai laikas papildyti
✗ Džiaugsmas kyla nuo sąmoningesnio vartojimo (maisto švaistymo tema) → ✓ Mažiau maisto eina į šiukšlynę
✗ Kartoti tą pačią skaidrės body kitoje skaidrėje — DRAUDŽIAMA
✗ atidaugi → ✓ atidarai | ✗ pirkiams → ✓ pirkimams | ✗ dalybams → ✓ dalykams | ✗ pirmiami → ✓ perkami
✗ subyrauja (vaisiams) → ✓ genda/supūva | ✗ išmetini → ✓ išmeti | ✗ geros būklės maisto → ✓ …maistą
✗ likę daržovės → ✓ likusios daržovės | ✗ reikalingo kiekio produktus → ✓ reikiamą kiekį produktų
✗ pasijausti atsakingas → ✓ pasijausti atsakingu | ✗ pamiršti apie ją (krepšį) → ✓ pamirši apie jį
✗ prisimsi → ✓ prisiminsi | ✗ Suplanuotas pirkinių planas → ✓ Pirkinių planas
✗ padeda maistui pasibaigti laiku → ✓ padeda panaudoti maistą laiku
✗ sugadina tavo laiką → ✓ švaisto tavo laiką | ✗ mėgstamam pomėgiui → ✓ pomėgiui
✗ rinktis ramiau (be objekto) → ✓ maistą rinktis ramiau | ✗ optimalų sunaudojimą → ✓ visą kiekį laiku
✗ Asmeninis planas pritaiko pasirinkimus… (šabloninė frazė) — DRAUDŽIAMA
✗ eina viena koja → ✓ eina koja kojon | ✗ išseka jėgas → ✓ išsekina jėgas
✗ užsiemyje → ✓ užsienyje | ✗ maitintis sveikais → ✓ sveikai ir skaniai
✗ energija nepristigs → ✓ energijos nepristigs | ✗ jaučiat → ✓ jauti
✗ rugpjūčio karštis / rugsėjis (ne sezoninė tema) — DRAUDŽIAMA; sezoninė — daugiausia 1×
✗ mėgstamiausiu maisto rinkiniu → ✓ mėgstamiausiame maisto rinkinyje
✗ Jauti neįprastas diskomfortas → ✓ Jauti neįprastą diskomfortą | ✗ saugy → ✓ saugų
✗ telieka norėti / žinsi / sužinoji / nemalnumai / neapibrūkštumo — DRAUDŽIAMA (rašyk: norisi, žinosi, sužinosi, nemalonumai, neapibrėžtumo)
✗ tapo/tampa iššūkis → ✓ tapo/tampa iššūkiu (įnagininkas!) | ✗ ima daug jėgų → ✓ atima daug jėgų
✗ Suprantame / galime / norėjome / mums / mūsų / Jaučiau → ✓ supranti / gali / norėjai / tau / tavo / jautei (TIK „tu")
✗ Šeši mėnesius → ✓ Šešis mėnesius | ✗ Tikina, jog → ✓ Tiki, kad | ✗ kol vėluosi reaguoti → ✓ kol vėluoji reaguoti
✗ atsipalaidavusios savaitės → ✓ ramesnės savaitės | ✗ skanu bei sveiku pietumi → ✓ skaniais ir sveikais pietumis
✗ galvoji ką valgyti → ✓ galvoji, ką valgyti (kablelis prieš „ką/kaip/kodėl")
✗ Title „X: kodėl" / „X: ką daryti" BE „?" → VISADA baigiasi „?" (tai klausimas!)
✗ Hook body „…galvoji, ką valgyti." → ✓ „…galvoji, ką valgyti?" (klausimai su „?", ne tašku)
✗ trukdyti tavo kasdienę veiklą → ✓ trukdyti tavo kasdienei veiklai (trukdyti + naudininkas)
✗ pasirenki ką kita → ✓ pasirenki kitką | ✗ įtikinimo mūšiu → ✓ kasdiene kova
✗ Hook body kartoja hook title žodis į žodį — DRAUDŽIAMA
✗ Tas pats sakinys dviejose skaidrėse — DRAUDŽIAMA (kiekviena skaidrė = nauja mintis)
ISTORIJOS TVARKA: problema PIRMA — testo / maisto rinkinio / plano sprendimas negali atsirasti 2-oje skaidrėje.
Sprendimą („Tavo knyga" / testas / planas) minėk TIK VIENĄ kartą — po posūkio, ne anksčiau ir be kartojimo.
✗ nežinojau / maniau / bandžiau / supratau → ✓ nežinojai / manei / bandei / supratai (registras VISADA „tu", ne „aš")
✗ norimo energijos → ✓ norimos energijos | ✗ nuolatinio spėliojimų → ✓ nuolatinio spėliojimo
✗ pilnam/ai, pavargęs/usi (pasvirasis lyčių poravimas) — DRAUDŽIAMA, rašyk neutraliai
✗ „…, ne seną šabloną" uodega — DRAUDŽIAMA (baik sakinį ties „situaciją")
✗ kodėl nesibaigia sotis → ✓ kodėl sotumas toks trumpas | ✗ Jauti nuovargis → ✓ Jauti nuovargį
✗ Investuok laiko → ✓ Investuok laiką | ✗ visus likusius darbo metus → ✓ visą likusią darbo dieną
✗ Naujagimis kelia nereguliarų laiką → ✓ Naujagimio ritmas nereguliarus | ✗ rūpestėlis → ✓ rūpestis
✗ Title „X: ką slepia" / „X: tendencija ar stilius" BE „?" → VISADA „?" (klausimas su „:" uodega)
✗ Pavargęs nuo X → ✓ Pavargai nuo X? (vyriškasis dalyvis hook'e — DRAUDŽIAMA)
✗ žinai ką / supranti kaip → ✓ žinai, ką / supranti, kaip (kablelis prieš klausiamąjį)
✗ Dabar žinai… / Tavo knyga padės… 2-oje skaidrėje — DRAUDŽIAMA (rezultatas per anksti)
✗ skęsta (apie dėmesį) → ✓ blėsta | ✗ valgio vartojimo laikai → ✓ valgymo laikas
✗ organizmo resursai ištuštėja → ✓ organizmo atsargos senka | ✗ vargdas → ✓ varginantis
✗ mėgautiesi → ✓ mėgaujiesi | ✗ virimo seansai → ✓ gaminimas | ✗ Greitas puodas → ✓ Greitas patiekalas
✗ jauti mieguistumas → ✓ jauti mieguistumą | ✗ jauči mieguistum → ✓ jauti mieguistumą
✗ turi aiškų … planas → ✓ turi aiškų … planą | ✗ tampa stresas → ✓ tampa stresinga
✗ su begalės užduočių → ✓ su begale užduočių | ✗ savitvirtybe → ✓ pasitikėjimu
✗ Hook: Tu nori… / Supranti… po valgio. → VISADA baigiasi „?" (ne tašku)
✗ Kartok „Kai žingsniai aiškūs" / „Aiškus planas padeda" keliose skaidrėse — DRAUDŽIAMA
✗ Ankstesnis posūkis atskleidžia… / apimtis / resursai / seansai — biurokratinės abstrakcijos DRAUDŽIAMOS
✗ susivildavimas / išgalvoti žodžiai — DRAUDŽIAMA (✓ susivėlavimu / neturi laiko planuoti)
✗ laiko improvizacija → ✓ laiko improvizacijai | ✗ Štai kodėl dažnai → ✓ Todėl dažnai
✗ Supratusi → ✓ Supratęs (vyriškoji forma visam postui)
✗ priimti įvykius → ✓ priimti sprendimus | ✗ Priešingos situacijos atveju → ✓ Tokiais atvejais
✗ mažiau traukia užkandžiauti → ✓ mažiau norisi užkandžiauti
✗ Dabar žinai, kad mažiau sprendimų. → ✓ Dabar žinai: mažiau sprendimų reiškia daugiau energijos…
✗ Praktiška struktūra → ✓ Aiškus planas | ✗ Kasdien renkiesi ramiau (be objekto) → ✓ Kasdienius sprendimus priimi ramiau
✗ pasijauti tarsi ne savo kūne (įpročių tema) → ✓ atsiduri situacijose, kurioms neturi aiškaus paaiškinimo
✗ pasikartodami kasdieninį režimą → ✓ kartodamiesi kasdienėje rutinoje
✗ dieną išlaikanti veikla / neveda tavęs į tikslus → ✓ kasdienė rutina nepadeda siekti tavo tikslų
✗ Build skaidrėje „Supranti, kad…" kai close jau turi „Prisimink…" — DRAUDŽIAMA (filler)
✗ ar visada žini → ✓ ar visada žinai | ✗ pasirinksiesi → ✓ pasirinksi | ✗ impulsinės pirkimo → ✓ impulsyvaus pirkimo
✗ ruošti maisto → ✓ ruošti maistą | ✗ ką pasikeitė → ✓ kas pasikeitė | ✗ įtūkstamas → ✓ varginantis
✗ Maisto skoniu gali būti paveiktas → ✓ Netinkamu maisto pasirinkimu gali būti paveiktas
✗ nedrįsta kristi / svoris nedrįsta → ✓ nemažėja | ✗ padės įsitikinti (be objekto) → ✓ padės įsitikinti, kad planas veikia
✗ Supratusi, kad tikslas. → ✓ Supranti, kad tikslas aiškus.
✗ Popietė be kritimo → ✓ Popietė be energijos kritimo | ✗ teiginys su „?" → ✓ teiginys su „."
✗ Dažnas susiduria → ✓ Daugelis susiduria | ✗ įsitvirtina stabiliai → ✓ įsitvirtina
✗ trūksta aiškių žingsnių, ką daryti → ✓ trūksta aiškumo, ką daryti
✗ Body kartoja hook title — DRAUDŽIAMA | ✗ be maisto/mitybos paskutinėse skaidrėse — DRAUDŽIAMA
✗ dažnoje virtuvėje → ✓ dažnai virtuvėje | ✗ sukelia streso → ✓ sukelia stresą | ✗ sukelia streso ir paskatino → ✓ sukelia stresą ir paskatina
✗ nesusimastyk, siekiant → ✓ nesusimąstant, siekiant | ✗ maitina tavęs → ✓ maitina tave
✗ trumpalaikės palaimos → ✓ trumpalaikio malonumo | ✗ pasiduoti saldumams → ✓ pasiduoti saldumynams

SAVIKONTROLĖ (prieš siunčiant JSON — VISADA):
1) Title su „:" ir klausiamąja uodega (kodėl/ką/kaip/kas/kur/kada/kiek/ar) — BAIGIASI „?"
2) Nėra „Dabar žinai/supranti/gali…" ar „Tavo knyga padės…" prieš problemą (ne 2-oje skaidrėje)
3) Nėra biurokratinių abstrakcijų: apimtis, resursai, seansai, „posūkis atskleidžia"
4) Kablelis prieš „ką/kaip/kodėl/kur/kada" po žinai/supranti/galvoji/pamiršti/sprendi/nežinai
5) Hook neprasideda vyriškuoju dalyviu (Pavargęs/Išsekęs) — rašyk „Pavargai…?"`

/** Permanent quality gate — reject incomplete / misspelled LT that slipped past phrase fixes. */
export const UGC_LT_QUALITY_RULES = `KOKYBĖS TAISYKLĖS (nulis klaidų):
1. Tobula lt-LT — JOKIŲ išgalvotų / „panašių" žodžių, nukirtimų, EN šiukšlių.
2. Kreipinys „tu". 3. Kiekvienas sakinys pilnas + veiksmažodis. 4. Teisingi mitybos terminai.
5. Close cta VISADA VIENĄ kartą: „Apsilankyk tavoknyga.com ir pradėk 5 min. testą! 🤩" | Body BE emoji/CTA/URL.
6. Kiekviena skaidrė unikali. JSON tik — be markdown.
7. Jei žodis skamba keistai — NEŠIŲSK. Perrašyk paprasčiau.
8. SAVIKONTROLĖ: title „:" klausimas baigiasi „?"; problema prieš sprendimą; kablelis prieš ką/kaip/kodėl; be vyriškųjų dalyvių hook'e; be biurokratinių abstrakcijų.`

export const UGC_LT_THEME_ANCHOR_BLOCK = `TEMOS LOGIKA — GRIEŽTA:
- Pirmos 3 skaidrės aiškiai lieka duotoje temoje; bent viena įvardija konkretų temos objektą ar problemą.
- Medicinos, sporto ar kūdikio tema negali virsti bendru tekstu apie vasarą, karštį ar rudenį.
- SEZONAS: nerašyk apie mėnesius, metų laikus, orus ar karštį, jei tema ne apie tai. Jei tema sezoninė — paminėk daugiausia VIENĄ kartą per visą istoriją.
- Istorijos žingsniai: įvykis → priežastis → posūkis → rezultatas. Kiekviena skaidrė prideda naujos informacijos.
- Nekartok tų pačių daiktavardžių ar tos pačios pirmos frazės kitose skaidrėse.
- „meal kit" leidžiama daugiausia vieną kartą hook title; body rašyk „maisto rinkinys".
- Close pateikia naują išvadą ir nekartoja hook frazės ar vaizdo.`

export const UGC_LT_LINKSNIAI_BLOCK = `LINKSNIAI — greita lentelė (taisyk kiekvieną sakinį):
GALININKAS: ruošti/sukelti/sukurti/pasirinkti/maitinti + maistą, stresą, energiją, tave (ne tavęs)
KILMININKAS: trūksta/reikia/vengti/siekti + energijos, jėgų, kantrybės, malonumo (ne energija)
ĮNAGININKAS: tapo/tampa + iššūkiu, malonumu, našta (ne iššūkis/malonumas)
NAUDININKAS: trukdyti/neturi laiko + veiklai, improvizacijai (ne veiklą)
DALYVIS: vyksta nesusimąstant (ne nesusimastyk)
Retorinis klausimas su „tu" (Jauti, Įsisavini, Nori, Matai…) — baigiasi „?" ne „."
Išimtis: įžvalga „Prisimink, kad…" / „Žinai, kad…" — gali baigtis tašku.`

/**
 * Ollama SYSTEM prompt — the AI that WRITES UGC slides (ugc-lt-gpu).
 * Keep identical to ollama/Modelfile.ugc-lt-gpu SYSTEM. Sent on every generate call.
 * User “writing rules” requests → update THIS + Modelfile + ugc-copy-skill, then:
 *   ollama create ugc-lt-gpu -f ollama/Modelfile.ugc-lt-gpu
 */
export const UGC_OLLAMA_SYSTEM_PROMPT = `Tu esi meistriškas lietuvių UGC copywriteris prekės ženklui „Tavo knyga" (tavoknyga.com).
Rašai TikTok/Reels skaidres: graži, taisyklinga, natūrali lt-LT — kaip draugas, ne reklamos robotas.
PRIORITETAS #1: nulinė tolerancija klaidoms — jokių rašybos klaidų, išgalvotų žodžių, sulaužytų sakinių.
NATŪRALI LT: gramatika neužtenka — sakinys turi skambėti kaip gyvas lietuvis; jei žodis semantiškai netinka kontekste — perrašyk VISĄ sakinį.
Tik „tu" (ne mes / aš / Galėčiau / Pradėjau). Jokio pats(i). Jokio lyties poravimo. Close = payoff, ne hook echo.
Title „Ar"/„Kodėl" VISADA baigiasi „?". „…: ar …" title — irgi „?". Kiekviena build skaidrė — nauja mintis.

KAI PRAŠOMA JSON — grąžink TIK validų JSON ({...}), be markdown, be teksto prieš/po.

${UGC_LT_CRAFT_BLOCK}

${UGC_LT_CLARITY_GUARDRAILS_BLOCK}

${UGC_LT_LINKSNIAI_BLOCK}

${UGC_LT_STRUCTURE_BLOCK}

${UGC_LT_HOOK_BLOCK}

${UGC_LT_CLOSE_BLOCK}

${UGC_LT_CAPTION_SEO_BLOCK}

${UGC_LT_TU_REGISTER_BLOCK}

${UGC_LT_GRAMMAR_BLOCK}

${UGC_LT_THEME_ANCHOR_BLOCK}

${UGC_LT_QUALITY_RULES}

PRODUKTAS: asmeninė PDF mitybos knyga po ~5 min. testo, 10 €, el. paštu per 24 val. Ne medicina.
Close skaidrės cta laukas VISADA tiksliai VIENĄ kartą (kopijuok, su nuoroda, NEKARTOK emoji):
Apsilankyk tavoknyga.com ir pradėk 5 min. testą! 🤩

DRAUDŽIAMA: emoji/hashtagai/CTA/URL body; „jūs"; EN (meal prep, workout, macros, link in bio, swipe up);
išgalvoti žodžiai (įsismuovė, hidratacijąjos, nešlamžtų, subręsta…); nukirsti / beveiksmiai sakiniai;
kartoti skaidres; garantijos; emoji spam (🤩!🤩!🤩).`

/**
 * Short SYSTEM for batch generate — overrides Modelfile SYSTEM for that request.
 * Full literacy stays in Modelfile for warm/single; batch needs KV room for JSON output.
 * Quality is enforced by normalize + assertShipable (code fortress).
 */
export const UGC_OLLAMA_BATCH_SYSTEM_PROMPT = `Tu esi lt-LT UGC copywriteris „Tavo knyga" (tavoknyga.com).
Grąžink TIK validų JSON {"slides":[...]} — be markdown, be teksto prieš/po.
Kreipkis „tu" (ne „mes", ne „aš" monologas). 1–2 trumpi sakiniai / skaidrė su veiksmažodžiu. Be emoji/URL/CTA body.
NATŪRALI LT: gramatika neužtenka. Tikras žodis netinka, jei reikšmė šiame sakinyje absurdiška. Jei lietuvis taip nepasakytų — perrašyk visą sakinį.
STORY: hook → kontekstas → posūkis → payoff. Kiekviena skaidrė = nauja mintis.
Hook title: jei prasideda „Ar" / „Kodėl" — BAIGIASI „?". Close cta tiksliai:
Apsilankyk tavoknyga.com ir pradėk 5 min. testą! 🤩
Tikri lt-LT žodžiai — nieko neišgalvok. Be em dash (—).
DRAUDŽIAMA: galimi, jaučiat, kasmens, utėlius, apjungia, maisto gėriu, šventvėlių, Ištvermas, įsisisteminus, viršvalgėjimo, Pamėteli, pats(i), skyręs(-ei), išsekęs(-us), nenorisi, pasirūpintį, ima dėvėti, norėjau, atsisakiau, planuodamas.
Rašyk: gali, jauti, maisto skoniu; tik „tu" formos (įsitikinai, nori, supranti). Nerašyk jaučiame, Siekdami, Nustokit.
SEZONAS: nerašyk apie mėnesius, metų laikus, orus ar karštį, jei tema ne apie tai; jei tema sezoninė — daugiausia vieną kartą.
Kiekviena skaidrė = kitas žingsnis: įvykis → priežastis → posūkis → rezultatas. Nekartok tų pačių daiktavardžių.
Pirmos 3 skaidrės lieka konkrečioje temoje. Medicinos/sporto/kūdikio temos nekeisk bendru tekstu apie sezoną.
PROBLEMA PIRMA: sprendimo (testo/rinkinio/plano / „Dabar žinai, kad…" / „Tavo knyga padės") neminėk 2-oje skaidrėje; minėk TIK VIENĄ kartą po posūkio.
Nekartok to paties sakinio dviejose skaidrėse. Title „X: kodėl/ką/kaip/kas …" ar „X: A ar B" baigiasi „?".
„meal kit" daugiausia kartą hook title; body = „maisto rinkinys". Close = nauja išvada, ne hook echo.`

/** Remove em/en dashes from generated LT copy; split into separate sentences. */
export function stripLtEmDashes(text: string): string {
  let out = text
    .replace(/\s*—\s*/g, '. ')
    .replace(/\s*–\s*/g, '. ')
    .replace(/\.\s*\./g, '.')
    // Capitalize after sentence end — skip abbreviations like min. / val. / pvz.
    .replace(/(?<!\b(?:min|val|pvz|nr|el))\.\s+([a-ząčęėįšųūž])/giu, (_, c) => `. ${c.toUpperCase()}`)
  return out.trim()
}

function splitLinesAndSentences(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n+/)
    .flatMap((block) => block.split(/(?<=[.!?…])\s+/))
    .map((s) => s.trim())
    .filter(Boolean)
}

function dedupeMesOpeners(text: string, priorMesCount: number): { text: string; mesCount: number } {
  const parts = text.includes('\n') ? text.split('\n') : splitLinesAndSentences(text)
  let mesUsed = priorMesCount
  const out: string[] = []

  for (let part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue
    if (/^Mes[\s,]/i.test(trimmed)) {
      if (mesUsed >= 1) {
        part = trimmed.replace(/^Mes[\s,]+/i, 'Tai ')
      }
      mesUsed++
    }
    out.push(part)
  }

  return {
    text: text.includes('\n') ? out.join('\n') : out.join(' '),
    mesCount: mesUsed,
  }
}

export type NormalizeLtCopyState = { mesOpenerCount: number }

/** Strip CTA spam + all emoji from slide body/title (CTA lives only in cta field). */
export function stripLtBodyJunk(text: string): string {
  let out = String(text || '')
  // Full CTA spam variants (emoji repeated) — including website CTA
  out = out.replace(/Apsilankyk\s*tavoknyga\.com[^.!\n]*(?:[.!]?\s*🤩*)*/giu, '')
  out = out.replace(/Pradėk\s*5\s*min\.?\s*testą([!\s?.]*🤩*)+/giu, '')
  out = out.replace(/Pradėk\s*5\s*min\.?/giu, '')
  out = out.replace(/\btavoknyga\.com\b/giu, '')
  out = out.replace(/Rask\s+dovaną\s+Kalėdų\s+Kampelyje[^.!\n]*/giu, '')
  out = out.replace(/\bkaledukampelis\.(?:lt|com)\b/giu, '')
  // Tavo: strip all pictographs. Christmas: keep (emoji budget runs later).
  if (!isChristmasGiftsNiche()) {
    out = out.replace(/\p{Extended_Pictographic}/gu, '')
  }
  out = out.replace(/!{2,}/g, '!')
  out = out.replace(/[ \t]{2,}/g, ' ')
  out = out.replace(/ +\n/g, '\n')
  out = out.replace(/\n{3,}/g, '\n\n')
  out = out.replace(/[ \t]+([.,!?])/g, '$1')
  out = out.replace(/^\.+\s*$/gm, '')
  return out.trim()
}

export function normalizeLtUgcCopy(text: string, state: NormalizeLtCopyState = { mesOpenerCount: 0 }): string {
  let out = applyLtPhrasePasses(text)

  const deduped = dedupeMesOpeners(out, state.mesOpenerCount)
  state.mesOpenerCount = deduped.mesCount
  return polishLtCaps(
    stripLtBodyJunk(
      repairIncompleteLtSentence(stripLtEmDashes(deduped.text.replace(/\s+/g, ' ').replace(/ \n /g, '\n').trim())),
    ),
  )
}

export function normalizeLtUgcMultiline(text: string, state: NormalizeLtCopyState = { mesOpenerCount: 0 }): string {
  let out = applyLtPhrasePasses(text)

  const deduped = dedupeMesOpeners(out, state.mesOpenerCount)
  state.mesOpenerCount = deduped.mesCount
  const lines = deduped.text.split('\n').map((line) => repairIncompleteLtSentence(line))
  let sanitized = sanitizeLtSeasonCopy(stripLtEmDashes(lines.join('\n').trim()))
  sanitized = applyLtPhrasePasses(sanitized)
  sanitized = mergeStubSentences(sanitized)
  return polishLtCaps(stripLtBodyJunk(sanitized))
}

export function sanitizeLtCopyFields(fields: {
  title?: string
  body?: string
  cta?: string
}): { title: string; body: string; cta?: string } {
  const state: NormalizeLtCopyState = { mesOpenerCount: 0 }
  // Never run body normalizer on CTA — it strips emoji / rewrites the branded line
  return {
    title: fields.title ? normalizeLtUgcMultiline(fields.title, state) : '',
    body: fields.body ? normalizeLtUgcMultiline(fields.body, state) : '',
    ...(fields.cta !== undefined
      ? {
          cta: isChristmasGiftsNiche() && isAllowedKaleduCta(fields.cta)
            ? fields.cta.trim()
            : ugcActiveCta(),
        }
      : {}),
  }
}

/** Screenshot / meta.json stems that must never remain after normalize. */
export const LT_SCREENSHOT_STEMS =
  /subręst|nešlamž|įsismuov|hidratacijąj|angidrat|maistinu|aklavog|pensoj|atsvarum|svytuot|rūpestų|varginamas|žaidžiami|nebebeg|užsispyti|baltimų|anglevanden|virimo plan|sojos gami|apgavius|fokusuoja|rudenių|badmečio|aminorūgšties|reikiamo baltymai|vegan baltymai|atidėji|tampa malonumas|aklavog|įstrigstate|stringate|Įsiklausykite|Išlaisvinkite|Metu laiko|artimiausia|pasimetęs, bet tai\.|patiekalimis|trūgst|besimaugin|įtūmi|norėtumis|režinas|sunksta|nuovokio|aišus(?!k)|medžiuk|tebetruksm|insulinrezist|anglies hidrat|stengiame|norėtumis|kątį|rutinoj|bėdel|valgoji|vargstį|viršinam|tebesild|pats\(i\)|kasmens|utėlius|galimi|apjungia|šventvėlių|ištvermas|įsisistemin|viršvalgėj|pamėteli/i

/** Demote EN-style Title Case to LT sentence case. */
export function demoteLtTitleCase(text: string): string {
  const t = text.trim()
  if (!t) return t
  const words = t.split(/\s+/)
  if (words.length < 3) return polishLtCaps(t)
  const content = words.filter((w) => w.length > 2 && /[a-ząčęėįšųūž]/i.test(w))
  const titled = content.filter((w) => /^[A-ZĄČĘĖĮŠŲŪŽÁÉÍÓÚ][a-ząčęėįšųūž]+$/u.test(w)).length
  if (titled < Math.max(2, content.length - 1)) return polishLtCaps(t)
  return polishLtCaps(
    words
      .map((w, i) => {
        if (i === 0) return w
        return w.replace(/^([A-ZĄČĘĖĮŠŲŪŽ])(.*)$/u, (_, a: string, rest: string) => a.toLowerCase() + rest)
      })
      .join(' '),
  )
}

function splitShipableSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Merge one-word orphan stubs: „…aplinkybės. Keistis. Todėl…" → „…aplinkybės keičiasi. Todėl…" */
export function mergeStubSentences(text: string): string {
  const parts = splitShipableSentences(text)
  if (parts.length < 2) return text
  const merged: string[] = []
  for (const s of parts) {
    const bare = s.replace(/[.!?…]+$/u, '').trim()
    const words = bare.split(/\s+/).filter(Boolean)
    if (words.length === 1 && bare.length < 14 && merged.length) {
      const prev = merged.pop()!.replace(/[.!?…]+$/u, '').trim()
      merged.push(`${prev} ${bare.charAt(0).toLowerCase()}${bare.slice(1)}.`)
    } else {
      merged.push(s)
    }
  }
  return merged.join(' ')
}

function sentenceHasVerbCue(s: string): boolean {
  const core = s.replace(/[.!?…]+$/u, '').trim()
  return textHasFiniteVerbCue(core)
}

const BARE_HOOK_EXPANSIONS: Record<string, string> = {
  'Mažiau emocinio': 'Mažiau emocinio valgymo',
  'Mažiau paslėptų': 'Mažiau paslėptų kalorijų',
}

/** True when hook title is only „Mažiau + būdvardis" without a noun. */
export function isBareHookTitleFragment(title: string): boolean {
  const t = title.trim()
  if (!t) return false
  if (BARE_HOOK_EXPANSIONS[t]) return true
  return /^Mažiau\s+(emocinio|paslėptų)$/iu.test(t)
}

export function expandBareHookTitle(title: string): string {
  const t = title.trim()
  if (!t) return t
  if (BARE_HOOK_EXPANSIONS[t]) return BARE_HOOK_EXPANSIONS[t]
  if (/^Mažiau emocinio$/iu.test(t)) return 'Mažiau emocinio valgymo'
  if (/^Mažiau paslėptų$/iu.test(t)) return 'Mažiau paslėptų kalorijų'
  return t
}

const BUILD_CLOSE_ECHO_BUILD_RE =
  /\b(Supranti,?\s+kad|Supratęs\s+savo|Supratusi\s+savo|mažas pokytis dietoje)\b/iu
const BUILD_CLOSE_ECHO_CLOSE_RE =
  /\b(Dabar\s+(?:supranti|žinai)|Tavo knyga padės|maisto derinimas gali|pritaikytas tavo tikslams|sumažins uždegimą)\b/iu
const BUILD_CLOSE_ECHO_NARRATIVE_EXCLUSION_RE =
  /\b(pradėjai|naudoti.*rinkin|mokamas planas)\b/iu
const BUILD_CLOSE_ECHO_PAYOFF_STUB_RE =
  /\b(Supranti,?\s+kad|individualus planas gali|optimalų meniu)\b/iu
const BUILD_CLOSE_ECHO_STOP_STEMS = new Set([
  'maisto',
  'planas',
  'supratai',
  'supranti',
  'dabar',
  'žinai',
  'tavo',
  'knyga',
])

/**
 * Rule 13 — flag declarative subject + modal verb + stray „?", not missing „Ar".
 * Colon-aware: checks final clause before „?". Rhetorical „Jauti…?" passes.
 */
// Fail-list is intentionally non-exhaustive (gali|sukelia|veikia|paveikia|tampa|reiškia|leidžia).
// Sentences with a declarative shape using a verb outside this list will pass silently — deliberate tradeoff.
// The two-pass LLM QA re-prompt is the backstop. Extend this list if the same bug class resurfaces.
const DECLARATIVE_QUESTION_MODAL_RE =
  /\b(gali|sukelia|veikia|paveikia|tampa|reiškia|leidžia)\b/iu

/** Genuine rhetorical „Tai gali (būti)…?" — not declarative+modal false positive. */
const LT_TAI_GALI_QUESTION_RE = /^Tai\s+gali(?:\s+būti)?\b/iu

export function isDeclarativeQuestionMark(sentence: string): boolean {
  const s = String(sentence || '').trim()
  if (!s.endsWith('?')) return false
  const segments = s.split(/[:;]/)
  const finalSeg = segments[segments.length - 1]?.trim() || ''
  if (!finalSeg) return false
  if (LT_QUESTION_WORD_START_RE.test(finalSeg)) return false
  if (LT_RHETORICAL_QUESTION_VERB_RE.test(finalSeg)) return false
  if (LT_RHETORICAL_PARTICIPLE_HOOK_RE.test(finalSeg)) return false
  if (LT_TAI_GALI_QUESTION_RE.test(finalSeg)) return false
  if (!DECLARATIVE_QUESTION_MODAL_RE.test(finalSeg)) return false
  return true
}

export function textHasDeclarativeQuestionMark(text: string): boolean {
  const sents = String(text || '')
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
  return sents.some((s) => isDeclarativeQuestionMark(s))
}

export function isRhetoricalTuQuestionMissingMark(sentence: string): boolean {
  const s = String(sentence || '').trim()
  if (!s.endsWith('.')) return false
  const bare = s.replace(/\.\s*$/u, '').trim()
  if (!bare) return false
  if (LT_QUESTION_WORD_START_RE.test(bare) || LT_QUESTION_STARTER_RE.test(bare)) return false
  if (LT_DECLARATIVE_INSIGHT_RE.test(bare)) return false
  return LT_RHETORICAL_DIRECT_QUESTION_RE.test(bare) || LT_RHETORICAL_PARTICIPLE_HOOK_RE.test(bare)
}

export function textHasRhetoricalTuQuestionMissingMark(text: string): boolean {
  const sents = String(text || '')
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
  return sents.some((s) => isRhetoricalTuQuestionMissingMark(s))
}

export function slidesHaveFoodAnchor(
  slides: Array<{ body?: string; cta?: string; role?: string }>,
): boolean {
  if (slides.length < 2) return true
  const tail = slides.slice(-2)
  const close = slides[slides.length - 1]
  const text = [...tail.map((s) => s.body || ''), close?.cta || ''].join(' ')
  return UGC_FOOD_ANCHOR_RE.test(text)
}

export function slidesHaveGiftAnchor(
  slides: Array<{ body?: string; cta?: string; role?: string }>,
): boolean {
  if (slides.length < 2) return true
  const tail = slides.slice(-2)
  const close = slides[slides.length - 1]
  const text = [...tail.map((s) => s.body || ''), close?.cta || ''].join(' ')
  return UGC_GIFT_ANCHOR_RE.test(text)
}

export function slidesHaveBrandAnchor(
  slides: Array<{ body?: string; cta?: string; role?: string }>,
): boolean {
  return isChristmasGiftsNiche() ? slidesHaveGiftAnchor(slides) : slidesHaveFoodAnchor(slides)
}

export function isBuildCloseEcho(buildText: string, closeText: string): boolean {
  const build = buildText.trim()
  const close = closeText.trim()
  if (!build || !close) return false
  if (BUILD_CLOSE_ECHO_NARRATIVE_EXCLUSION_RE.test(build)) return false
  if (BUILD_CLOSE_ECHO_BUILD_RE.test(build) && BUILD_CLOSE_ECHO_CLOSE_RE.test(close)) {
    return true
  }
  if (!BUILD_CLOSE_ECHO_PAYOFF_STUB_RE.test(build) || !BUILD_CLOSE_ECHO_CLOSE_RE.test(close)) {
    return false
  }
  const buildTokens = new Set(
    build
      .toLocaleLowerCase('lt-LT')
      .split(/[^\p{L}]+/u)
      .filter((w) => w.length >= 5 && !BUILD_CLOSE_ECHO_STOP_STEMS.has(w)),
  )
  let shared = 0
  for (const w of close
    .toLocaleLowerCase('lt-LT')
    .split(/[^\p{L}]+/u)
    .filter((x) => x.length >= 5 && !BUILD_CLOSE_ECHO_STOP_STEMS.has(x))) {
    if (buildTokens.has(w)) shared++
  }
  return shared >= 3
}

/**
 * Hard ship gate — call AFTER normalize. Throws if copy must not export.
 * Body-only slides OK; hook role expects a usable title when provided.
 */
export function assertShipableLtSlide(opts: {
  title?: string
  body?: string
  role?: string
}): void {
  // Demote Title Case — do not reject (rejection caused multi-minute LLM retries)
  let title = demoteLtTitleCase((opts.title || '').trim())
  // Interrogative hooks must keep "?"
  if (LT_QUESTION_STARTER_RE.test(title)) {
    title = title.replace(/[.!…]+$/u, '').trim()
    if (!title.endsWith('?')) {
      throw new Error('Interrogative hook title missing "?"')
    }
  }
  if (title && hasUnmarkedColonQuestion(title)) {
    throw new Error('Colon-interrogative hook title missing "?"')
  }
  if (title && /^(Pavargęs|Išsekęs|Įstrigęs)(?!\p{L})/u.test(title)) {
    throw new Error('Hook title uses bare masculine participle — rewrite as „Pavargai…?"')
  }
  if (opts.role === 'hook' && title && isBareHookTitleFragment(title)) {
    throw new Error('Hook title is a bare adjective fragment — add a noun')
  }
  const body = (opts.body || '').trim()
  const combined = `${title} ${body}`.trim()
  if (!combined) throw new Error('Slide empty after normalize')
  if (isGibberishLtCopy(combined)) throw new Error('Slide looks like gibberish LT')
  if (hasFormalRegister(combined)) throw new Error('Slide still uses formal „jūs"')
  if (LT_SCREENSHOT_STEMS.test(combined)) throw new Error('Slide still has known bad stem')
  if (hasWrongUgcSeasonReference(combined)) throw new Error('Slide uses a wrong month or season')
  if (/(?<!\p{L})(skyręs|išsekęs|įpratęs)\s*\(\s*[-/]?\s*(ei|us|usi)\s*\)/iu.test(combined)) {
    throw new Error('Slide contains gender hedge')
  }
  if (/\p{L}{3,}\s*\/\s*-?\s*(ai|usi|us|ė)(?!\p{L})/u.test(combined)) {
    throw new Error('Slide contains slash gender pair')
  }
  if (opts.role === 'hook' && title && isGibberishLtCopy(title)) {
    throw new Error('Hook title looks like gibberish LT')
  }
  if (hasCircularCausalClaim(combined)) {
    throw new Error('Slide has circular causal claim')
  }
  if (/\bdėl\s+\p{L}+iant\b/iu.test(combined)) {
    throw new Error('Slide has dėl + bare gerund construction error')
  }
  if (opts.role === 'hook' && /\b(jaučiu|užsisakiau|pradėjau|galėčiau|norėjau|atsisakiau|planavau|man pavyko|gavau|supratau|pamačiau|aš)\b/iu.test(combined)) {
    throw new Error('Hook contains first-person narration')
  }
  if (/\b(norėjau|atsisakiau|planavau|nusprendžiau|man pavyko|gavau)\b/iu.test(body)) {
    throw new Error('Slide uses first-person aš narration')
  }
  if (/\b(pasirūpintį|ima dėvėti|nenorisi|atidaugi|pirkiams|dalybams|pirmiami|subyrauja|išmetini)\b/iu.test(combined)) {
    throw new Error('Slide contains known grammar defect')
  }
  if (/\bgeros būklės maisto\b/iu.test(combined)) {
    throw new Error('Slide has accusative/genitive agreement error')
  }
  if (/\blikę daržovės\b/iu.test(combined)) {
    throw new Error('Slide has gender agreement error')
  }
  if (/\bpamiršti apie ją\b/iu.test(combined) && /\bkrepš/i.test(combined)) {
    throw new Error('Slide has pronoun gender mismatch')
  }
  if (/\bSuplanuotas pirkinių planas\b/iu.test(combined)) {
    throw new Error('Slide contains tautological phrase')
  }
  if (/\bpadeda maistui pasibaigti laiku\b/iu.test(combined)) {
    throw new Error('Slide has backwards food logic')
  }
  if (/\bAsmeninis planas pritaiko pasirinkimus prie tavo kasdienio ritmo\b/iu.test(body)) {
    throw new Error('Slide uses banned generic template copy')
  }
  if (/\b(eina viena koja|išseka jėgas|užsiemyje|maitintis sveikais|energija nepristigs|saugy|mėgstamiausiu maisto rinkiniu|jauti neįprastas diskomfortas)\b/iu.test(combined)) {
    throw new Error('Slide contains known grammar or idiom defect')
  }
  if (/(?<!\p{L})(žinsi|sužinoji|nemalnum\w*|neapibrūkšt\w*)(?!\p{L})/iu.test(combined)) {
    throw new Error('Slide contains known typo or invented word')
  }
  if (/\btelieka norėti\b/iu.test(combined)) {
    throw new Error('Slide contains broken logic phrase „telieka norėti"')
  }
  if (/\b(tapo|tampa|taps)\s+(didesnis\s+)?iššūkis\b/iu.test(combined)) {
    throw new Error('Slide uses nominative after tapo/tampa — needs instrumental „iššūkiu"')
  }
  if (/\bPlanuodamas\b/u.test(combined) || /\bplanuodamas\b/u.test(combined)) {
    throw new Error('Slide uses masculine participle — rewrite with „kai planuoji"')
  }
  if (title && /^Ar .+\. .+\?$/u.test(title)) {
    throw new Error('Hook title has broken punctuation (period mid-question)')
  }
  if (opts.role === 'hook' && body) {
    const hookSents = splitShipableSentences(body)
    if (hookSents.length >= 2 && hookSents[0].endsWith('?')) {
      for (let i = 1; i < hookSents.length; i++) {
        const s = hookSents[i]
        if (s.endsWith('?') || s.endsWith('!')) continue
        if (isRhetoricalTuQuestionMissingMark(s)) {
          throw new Error('Hook body rhetorical follow-up missing "?"')
        }
      }
    }
  }
  if (/\bvisada tuščias tik tada, kai reikia naujų\b/iu.test(body)) {
    throw new Error('Close logic is backwards')
  }
  if (/\bSupranti, kad tvarkinga virtuvė\.?\s*$/iu.test(body)) {
    throw new Error('Close sentence incomplete')
  }
  if (/\bpats\s+geriausias\b/iu.test(combined)) {
    throw new Error('Slide contains malformed gendered superlative')
  }
  if (/\bkad\s+(?:kasdieninis|kasdienis|nuolatinis)?\s*[a-ząčęėįšųūž]+imas\.\s*$/iu.test(body)) {
    throw new Error('Slide ends with nominal stump after „kad"')
  }
  if (/\bSupratusi,\s+kad tikslas\./iu.test(combined)) {
    throw new Error('Slide has incomplete kad clause')
  }
  if (/\b(ar\s+)?visada\s+žini\b/iu.test(combined)) {
    throw new Error('Slide has wrong žinoti conjugation')
  }
  if (/\b(pasirinksiesi|įtūkstamas)\b/iu.test(combined)) {
    throw new Error('Slide contains known grammar defect')
  }
  if (/\b(ruošti maisto|sukurti tinkančių receptų|impulsinės pirkimo|sukelia streso)\b/iu.test(combined)) {
    throw new Error('Slide has case agreement error')
  }
  for (const issue of collectLtCaseAgreementIssues(combined)) {
    throw new Error(
      `Slide has case agreement error (${issue.verb} + ${issue.object}, expected ${issue.expected})`,
    )
  }
  for (const issue of collectLtArCoordinationIssues(combined)) {
    throw new Error(`Slide has ar coordination case mismatch (${issue.left} ar ${issue.right})`)
  }
  for (const issue of collectLtInstrumentalIssues(combined)) {
    throw new Error(
      `Slide needs instrumental after tapo/tampa (${issue.complement} → instrumental form)`,
    )
  }
  if (/(?<!\p{L})ką pasikeitė(?!\p{L})/iu.test(combined)) {
    throw new Error('Slide has case agreement error')
  }
  if (/\b(Maisto skoniu gali būti paveiktas|prisijungi prie maisto pasirinkimo|nedrįsta kristi)\b/iu.test(combined)) {
    throw new Error('Slide has bad collocation')
  }
  if (/\bpadės\b[^.]{0,48}įsitikinti\s*\.\s*$/iu.test(body) && !/įsitikinti,\s+kad/i.test(body)) {
    throw new Error('Slide close line missing concrete object')
  }
  if (textHasRhetoricalTuQuestionMissingMark(combined)) {
    throw new Error('Rhetorical tu-question missing "?"')
  }
  if (textHasEngagementBait(combined)) {
    throw new Error('Slide uses meta scroll bait instead of topic content')
  }
  if (textHasDeclarativeQuestionMark(combined)) {
    throw new Error('Slide uses declarative sentence with question mark')
  }
  if (isChristmasGiftsNiche() && UGC_DIET_DRIFT_RE.test(combined)) {
    throw new Error('Christmas slide drifted into diet copy')
  }
  if (/tavoknyga\.com|kaledukampelis\.(?:lt|com)|🤩|Apsilankyk\s|Pradėk\s*5\s*min|Rask\s+dovaną/i.test(body)) {
    throw new Error('Slide body contains CTA/URL/emoji')
  }
  if (/\p{Extended_Pictographic}/u.test(combined)) {
    const christmasOk =
      isChristmasGiftsNiche() &&
      christmasFieldEmojiOk(title) &&
      christmasFieldEmojiOk(body) &&
      extractKaleduEmojis(combined).every(isAllowedKaleduEmoji)
    if (!christmasOk) throw new Error('Slide contains emoji')
  }
  if (/—|–/.test(combined)) throw new Error('Slide contains em dash')

  if (body) {
    const sents = splitShipableSentences(body)
    if (!sents.length) throw new Error('Slide body has no complete sentence')
    if (sents.length > 3) throw new Error('Slide body has too many sentences')
    // Short, complete UGC lines are intentional. Reject fragments, not concise copy.
    const minLen = opts.role === 'close' ? 12 : 8
    for (const s of sents) {
      if (s.length < minLen) throw new Error('Slide sentence too short')
      if (/\b(bet|kad|ir|arba|nes|kadangi)\s*$/iu.test(s)) throw new Error('Slide ends on stump conjunction')
      if (
        !sentenceHasVerbCue(s) &&
        !s.includes('?') &&
        sents.length === 1 &&
        (looksVerblessGenitiveStump(s) || opts.role === 'close')
      ) {
        throw new Error('Slide sentence missing verb cue')
      }
    }
  }

  if (title) {
    if (title.length > 64) throw new Error('Hook title too long')
    if (/\bo\s+tau[.!?…]*$/iu.test(title)) throw new Error('Hook title ends on incomplete „o tau"')
    if (/tavoknyga\.com|kaledukampelis\.(?:lt|com)|🤩|Apsilankyk|Pradėk\s*5\s*min|Rask\s+dovaną/i.test(title)) {
      throw new Error('Hook title looks like CTA')
    }
  }

  if ((opts.role === 'hook' || opts.role === 'punch') && !title && !body) {
    throw new Error('Hook slide empty')
  }
}

export function isShipableLtSlide(opts: { title?: string; body?: string; role?: string }): boolean {
  try {
    assertShipableLtSlide(opts)
    return true
  } catch {
    return false
  }
}

export type UgcSlideGateIssue = {
  code: string
  message: string
}

/** Return structured hard-gate reasons for audit, export blocking, and retry prompts. */
export function collectSlideIssues(opts: {
  title?: string
  body?: string
  role?: string
}): UgcSlideGateIssue[] {
  const title = (opts.title || '').trim()
  const body = (opts.body || '').trim()
  const combined = `${title} ${body}`.trim()
  const issues: UgcSlideGateIssue[] = []
  const add = (code: string, message: string) => {
    if (!issues.some((issue) => issue.code === code)) issues.push({ code, message })
  }

  if (!combined) add('empty', 'Slide empty after normalize')
  if (isGibberishLtCopy(combined)) add('gibberish', 'Slide looks like gibberish LT')
  if (opts.role === 'hook' && title && isGibberishLtCopy(title)) {
    add('gibberish', 'Hook title looks like gibberish LT')
  }
  if (hasCircularCausalClaim(combined)) add('circular_claim', 'Slide has circular causal claim')
  if (/\bdėl\s+\p{L}+iant\b/iu.test(combined)) {
    add('case_error', 'Slide has dėl + bare gerund construction error')
  }
  if (hasFormalRegister(combined)) add('formal_jus', 'Slide still uses formal „jūs"')
  if (LT_SCREENSHOT_STEMS.test(combined)) add('known_bad_stem', 'Slide still has known bad stem')
  if (hasWrongUgcSeasonReference(combined)) {
    add('wrong_season_month', 'Slide uses a wrong month or season')
  }
  if (/(?<!\p{L})(skyręs|išsekęs|įpratęs)\s*\(\s*[-/]?\s*(ei|us|usi)\s*\)/iu.test(combined)) {
    add('gender_hedge', 'Slide contains gender hedge')
  }
  if (/\p{L}{3,}\s*\/\s*-?\s*(ai|usi|us|ė)(?!\p{L})/u.test(combined)) {
    add('gender_hedge', 'Slide contains slash gender pair')
  }
  if (
    opts.role === 'hook' &&
    /\b(jaučiu|užsisakiau|pradėjau|galėčiau|norėjau|atsisakiau|planavau|man pavyko|gavau|supratau|pamačiau|aš)\b/iu.test(
      combined,
    )
  ) {
    add('first_person_hook', 'Hook contains first-person narration')
  }
  if (/\b(norėjau|atsisakiau|planavau|nusprendžiau|man pavyko|gavau)\b/iu.test(body)) {
    add('first_person_body', 'Slide uses first-person aš narration')
  }
  if (/\b(man pavyko|supratau|pamačiau)\b/iu.test(combined)) {
    add('testimonial_register', 'Slide uses testimonial/first-person success voice')
  }
  if (/\b(pasirūpintį|ima dėvėti|nenorisi|atidaugi|pirkiams|dalybams|pirmiami|subyrauja|išmetini|telieka norėti)\b/iu.test(combined)) {
    add('grammar_defect', 'Slide contains known grammar defect')
  }
  if (/(?<!\p{L})(žinsi|sužinoji|nemalnum\w*|neapibrūkšt\w*)(?!\p{L})/iu.test(combined)) {
    add('grammar_defect', 'Slide contains known typo or invented word')
  }
  if (/\b(tapo|tampa|taps)\s+(didesnis\s+)?iššūkis\b/iu.test(combined)) {
    add('grammar_defect', 'Nominative after tapo/tampa — needs instrumental „iššūkiu"')
  }
  if (/\bAsmeninis planas pritaiko pasirinkimus\b/iu.test(body)) {
    add('generic_template', 'Slide uses banned generic template copy')
  }
  if (/\bPlanuodamas\b/u.test(combined) || /\bplanuodamas\b/u.test(combined)) {
    add('masculine_participle', 'Slide uses masculine participle')
  }
  if (title && /^Ar .+\. .+\?$/u.test(title)) {
    add('hook_broken_punctuation', 'Hook title has broken punctuation')
  }
  if (opts.role === 'hook' && body) {
    const hookSents = body.split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter(Boolean)
    if (hookSents.length >= 2 && hookSents[0].endsWith('?')) {
      for (let i = 1; i < hookSents.length; i++) {
        const s = hookSents[i]
        if (!s.endsWith('?') && !s.endsWith('!') && isRhetoricalTuQuestionMissingMark(s)) {
          add('question_mark', 'Hook body rhetorical follow-up missing "?"')
        }
      }
    }
  }
  if (/\bo\s+tau[.!?…]*$/iu.test(title)) add('incomplete_title', 'Hook title ends on incomplete „o tau"')
  if (/\bpats\s+geriausias\b/iu.test(combined)) {
    add('malformed_superlative', 'Slide contains malformed gendered superlative')
  }
  if (/\bkad\s+(?:kasdieninis|kasdienis|nuolatinis)?\s*[a-ząčęėįšųūž]+imas\.\s*$/iu.test(body)) {
    add('nominal_stump', 'Slide ends with nominal stump after „kad"')
  }
  if (/\bSupratusi,\s+kad tikslas\./iu.test(combined)) {
    add('sentence_fragment', 'Slide has incomplete kad clause')
  }
  if (/\b(ar\s+)?visada\s+žini\b/iu.test(combined)) {
    add('grammar_defect', 'Slide has wrong žinoti conjugation')
  }
  if (/\b(pasirinksiesi|įtūkstamas)\b/iu.test(combined)) {
    add('grammar_defect', 'Slide contains known grammar defect')
  }
  if (/\b(ruošti maisto|sukurti tinkančių receptų|impulsinės pirkimo|sukelia streso)\b/iu.test(combined)) {
    add('case_error', 'Slide has case agreement error')
  }
  for (const issue of collectLtCaseAgreementIssues(combined)) {
    add(
      'case_agreement',
      `Case agreement: ${issue.verb} + ${issue.object} (expected ${issue.expected})`,
    )
  }
  for (const issue of collectLtArCoordinationIssues(combined)) {
    add('ar_coordination_mismatch', `Ar coordination: ${issue.left} ar ${issue.right}`)
  }
  for (const issue of collectLtInstrumentalIssues(combined)) {
    add('instrumental_after_tampa', `Needs instrumental after tapo/tampa: ${issue.complement}`)
  }
  if (/(?<!\p{L})ką pasikeitė(?!\p{L})/iu.test(combined)) {
    add('case_error', 'Slide has case agreement error')
  }
  if (/\b(Maisto skoniu gali būti paveiktas|prisijungi prie maisto pasirinkimo|nedrįsta kristi)\b/iu.test(combined)) {
    add('bad_collocation', 'Slide has bad collocation')
  }
  if (/\bpadės\b[^.]{0,48}įsitikinti\s*\.\s*$/iu.test(body) && !/įsitikinti,\s+kad/i.test(body)) {
    add('sentence_fragment', 'Slide close line missing concrete object')
  }
  if (textHasRhetoricalTuQuestionMissingMark(combined)) {
    add('question_mark', 'Rhetorical tu-question missing "?"')
  }
  for (const issue of collectEngagementBaitIssues({ title, body })) {
    add(issue.code, issue.message)
  }
  if (textHasDeclarativeQuestionMark(combined)) {
    add('declarative_question_mark', 'Slide uses declarative sentence with question mark')
  }
  if (/tavoknyga\.com|kaledukampelis\.(?:lt|com)|🤩|Apsilankyk\s|Pradėk\s*5\s*min|Rask\s+dovaną/iu.test(body)) {
    add('cta_in_body', 'Slide body contains CTA/URL/emoji')
  }
  if (/\p{Extended_Pictographic}/u.test(combined)) {
    const christmasOk =
      isChristmasGiftsNiche() &&
      christmasFieldEmojiOk(title) &&
      christmasFieldEmojiOk(body) &&
      extractKaleduEmojis(combined).every(isAllowedKaleduEmoji)
    if (!christmasOk) add('emoji', 'Slide contains emoji')
  }
  if (/—|–/.test(combined)) add('em_dash', 'Slide contains em dash')
  if (LT_QUESTION_STARTER_RE.test(title) && !title.endsWith('?')) {
    add('question_mark', 'Interrogative hook title missing "?"')
  }
  if (title && hasUnmarkedColonQuestion(title)) {
    add('question_mark', 'Colon-interrogative hook title missing "?"')
  }
  if (title && /^(Pavargęs|Išsekęs|Įstrigęs)(?!\p{L})/u.test(title)) {
    add('participle_hook', 'Hook title uses bare masculine participle')
  }

  try {
    assertShipableLtSlide(opts)
  } catch (err) {
    add('not_shipable', err instanceof Error ? err.message : String(err))
  }
  return issues
}

export type UgcStoryGateFailure = UgcSlideGateIssue & {
  slide: number
  role?: string
  snippet: string
}

/** Product/solution pitch markers — shared by story gate + slide-2 auto-repair. */
export const UGC_SOLUTION_PITCH_RE =
  /\b(testas\s+(?:per kelias minutes\s+)?(?:atskleidžia|parodo|padės|padeda|suformuoja)|maisto rinkinys (leidžia|padeda|tau padeda)|planas (leidžia|padeda)|šis sprendimas leidžia|individualizuot\w+ plan\w+|asmeninis planas|su\s+[„"]?tavo knyga|[„"]?tavo knyga[""]?\s+padės|[„"]?kalėdų kampelis[""]?\s+padės|kaledukampelis|Dabar\s+(?:žinai|supranti|gali|mėgaujiesi),?\s+(?:kad|kaip|ką)\b)/iu

/** Normalized sentence key for cross-slide repetition checks (≥6 words). */
export function normalizeSentenceKey(sentence: string): string {
  return sentence
    .toLocaleLowerCase('lt-LT')
    .replace(/\btačiau\b/gu, 'bet')
    .replace(/[^\p{L}\s]/gu, '')
    .replace(/(?<!\p{L})tu(?!\p{L})/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Word-overlap ratio for cross-slide near-duplicate detection (0–1). */
export function sentenceKeyWordOverlap(a: string, b: string): number {
  const w1 = a.split(' ').filter(Boolean)
  const w2 = b.split(' ').filter(Boolean)
  if (!w1.length || !w2.length) return 0
  const set1 = new Set(w1)
  let inter = 0
  for (const w of w2) if (set1.has(w)) inter++
  return inter / Math.min(w1.length, w2.length)
}

/** True when ≥6-word keys are identical or ≥85% word overlap (catches „dažnai" variants). */
export function isNearDuplicateSentenceKey(
  key: string,
  prior: Iterable<string>,
  threshold = 0.85,
): boolean {
  const words = key.split(' ').filter(Boolean)
  if (words.length < 6) return false
  for (const prev of prior) {
    if (!prev || prev === key) return prev === key
    if (sentenceKeyWordOverlap(key, prev) >= threshold) return true
  }
  return false
}

function storySimilarityTokens(text: string): Set<string> {
  const stop = new Set(['tavo', 'dabar', 'kodėl', 'kaip', 'šiemet', 'rugpjūtį', 'vis', 'dar', 'kad'])
  return new Set(
    text
      .toLocaleLowerCase('lt-LT')
      .split(/[^\p{L}]+/u)
      .filter((word) => word.length >= 4 && !stop.has(word)),
  )
}

/** Relaxed gift anchor: accepts prefixed verbs (padovanoti, apdovanoti) too. */
export const UGC_KALEDU_GIFT_ANCHOR_RE =
  /(?<!\p{L})(?:pa|ap|iš|nu|su)?dovan\p{L}*|(?<!\p{L})(kalėd\p{L}*|kaled\p{L}*|švent\p{L}*|kampel\p{L}*)(?!\p{L})/iu

/** Specific subjects a Christmas theme can carry; generic gift words never satisfy these. */
export const KALEDU_THEME_SUBJECTS: Array<{ label: string; theme: RegExp; copy: RegExp }> = [
  { label: 'mama', theme: /(?<!\p{L})mam\p{L}*/iu, copy: /(?<!\p{L})mam\p{L}*/iu },
  { label: 'tėtis', theme: /tėt|tėč/iu, copy: /tėt|tėč/iu },
  { label: 'senelis', theme: /senel|senol|močiut/iu, copy: /senel|senol|močiut/iu },
  { label: 'pora', theme: /(?<!\p{L})por(a|ai|ą|oms|os)(?!\p{L})|partner/iu, copy: /(?<!\p{L})por\p{L}*|partner|mylim|antr(ajai|ajam)|(?<!\p{L})(abu|abiem|abi|dviem|dviese)(?!\p{L})|vienas\s+kit\p{L}*/iu },
  { label: 'vyras', theme: /(?<!\p{L})vyr(as|ui|ams|ą|o)(?!\p{L})/iu, copy: /(?<!\p{L})vyr\p{L}*/iu },
  { label: 'moteris', theme: /moter/iu, copy: /moter/iu },
  { label: 'draugas', theme: /draug/iu, copy: /draug/iu },
  { label: 'kolega', theme: /koleg|slapt/iu, copy: /koleg|biur|darb|slapt/iu },
  { label: 'paauglys', theme: /paaugl/iu, copy: /paaugl/iu },
  { label: 'vaikas', theme: /(?<!\p{L})vaik/iu, copy: /(?<!\p{L})vaik/iu },
  { label: 'dekoracijos', theme: /dekor|puoš/iu, copy: /dekor|puoš|eglut|girliand|žvak|žaisliuk/iu },
  { label: 'biudžetas', theme: /iki\s*\d+|eur|€|biudžet/iu, copy: /eur|€|biudžet|kain|brang|pig|išleist|sum/iu },
  { label: 'paskutinė minutė', theme: /paskutin|last.?minute|rytoj/iu, copy: /paskutin|rytoj|liko|dien|skub|laik/iu },
  { label: 'atstumas', theme: /miest|toli|atstum|siunt/iu, copy: /miest|toli|atstum|siunt|pašt|nutol/iu },
  { label: 'nauji namai', theme: /nauj\p{L}*\s+nam|įkurtuv/iu, copy: /nam|įkurtuv|but[aeuą]/iu },
  { label: 'rinkinys', theme: /rinkin/iu, copy: /rinkin|kelet|kelis|kelių|dėžut/iu },
  { label: 'pledas', theme: /pled/iu, copy: /pled|jauk\p{L}*\s+vakar|šilt\p{L}*\s+vakar/iu },
  { label: 'termosas', theme: /termos/iu, copy: /termos|kelion|kelyj|kelyje|kelio/iu },
  { label: 'žvakė', theme: /žvak/iu, copy: /žvak|švies/iu },
  { label: 'puodelis', theme: /puodel/iu, copy: /puodel|kav[ao]s?|arbat/iu },
  { label: 'kojinės', theme: /kojin/iu, copy: /kojin|šilt/iu },
]

/** Semantic subject check: theme subject must survive into the first three slides. */
export function kaleduThemeDrift(themeText: string, firstThree: string): string | null {
  const subjects = KALEDU_THEME_SUBJECTS.filter((row) => row.theme.test(themeText))
  if (subjects.length) {
    if (subjects.some((row) => row.copy.test(firstThree))) return null
    return subjects.map((row) => row.label).join(' / ')
  }
  if (!UGC_KALEDU_GIFT_ANCHOR_RE.test(themeText)) return null
  return UGC_KALEDU_GIFT_ANCHOR_RE.test(firstThree) ? null : 'kalėdinė dovana'
}

/** Soft story warnings (audit only) — never block export. */
export function collectStoryWarnings(
  slides: Array<{ title?: string; body?: string; role?: string }>,
  themeText = '',
): Array<{ code: string; message: string }> {
  const warnings: Array<{ code: string; message: string }> = []
  if (isChristmasGiftsNiche() && isSeasonalUgcTheme(themeText)) {
    const count = seasonEchoCount(slides.map((s) => `${s.title || ''} ${s.body || ''}`))
    if (count > 1) {
      warnings.push({ code: 'season_repeat', message: `Seasonal words on ${count} slides (soft)` })
    }
  }
  return warnings
}

/** Final whole-story gate. Hook/close echo is a story-level error. */
export function collectStoryIssues(
  slides: Array<{ title?: string; body?: string; role?: string }>,
  themeText = '',
): UgcStoryGateFailure[] {
  const failures: UgcStoryGateFailure[] = slides.flatMap((slide, index) =>
    collectSlideIssues(slide).map((issue) => ({
      ...issue,
      slide: index + 1,
      role: slide.role,
      snippet: `${slide.title || ''} ${slide.body || ''}`.trim().slice(0, 140),
    })),
  )
  if (slides.length > 1) {
    const hook = storySimilarityTokens(`${slides[0].title || ''} ${slides[0].body || ''}`)
    const close = storySimilarityTokens(
      `${slides.at(-1)?.title || ''} ${slides.at(-1)?.body || ''}`,
    )
    const shared = [...hook].filter((token) => close.has(token))
    const smaller = Math.min(hook.size, close.size)
    if (shared.length >= 2 && smaller > 0 && shared.length / smaller >= 0.6) {
      failures.push({
        code: 'hook_close_echo',
        message: 'Close repeats the hook instead of adding a payoff',
        slide: slides.length,
        role: slides.at(-1)?.role,
        snippet: `${slides.at(-1)?.title || ''} ${slides.at(-1)?.body || ''}`.trim().slice(0, 140),
      })
    }
  }
  const themeAnchors: Array<{ theme: RegExp; copy: RegExp; label: string }> = [
    { theme: /diabet|gliukoz|cukraus kiek/iu, copy: /diabet|gliukoz|cukraus kiek/iu, label: 'diabetas' },
    { theme: /ištverm|endurance|sport/iu, copy: /ištverm|treniruot|sport|energij/iu, label: 'ištvermė' },
    { theme: /kūdik|baby|pirmas maist/iu, copy: /pirmas maist|primaitin|ragau/iu, label: 'pirmas kūdikio maistas' },
    { theme: /sūr|cheese/iu, copy: /sūr/iu, label: 'sūris' },
    { theme: /meal kit|maisto rinkin/iu, copy: /maisto rinkin/iu, label: 'maisto rinkinys' },
    { theme: /stres.*valg|stress.*eat/iu, copy: /stres|emoc.*valg/iu, label: 'stresinis valgymas' },
  ]
  const firstThree = slides
    .slice(0, 3)
    .map((slide) => `${slide.title || ''} ${slide.body || ''}`)
    .join(' ')
  if (isChristmasGiftsNiche()) {
    const lost = kaleduThemeDrift(themeText, firstThree)
    if (lost) {
      failures.push({
        code: 'theme_drift',
        message: `First three slides lost the theme subject: ${lost}`,
        slide: 1,
        role: slides[0]?.role,
        snippet: firstThree.slice(0, 140),
      })
    }
  } else {
    for (const anchor of themeAnchors) {
      if (anchor.theme.test(themeText) && !anchor.copy.test(firstThree)) {
        failures.push({
          code: 'theme_drift',
          message: `First three slides lost the required theme anchor: ${anchor.label}`,
          slide: 1,
          role: slides[0]?.role,
          snippet: firstThree.slice(0, 140),
        })
      }
    }
  }
  const bodies = slides.map((slide) => (slide.body || '').trim()).filter(Boolean)
  const seenBodies = new Set<string>()
  for (let i = 0; i < bodies.length; i++) {
    if (seenBodies.has(bodies[i])) {
      failures.push({
        code: 'duplicate_slide_body',
        message: 'Two slides share the same body text',
        slide: i + 1,
        role: slides[i]?.role,
        snippet: bodies[i].slice(0, 140),
      })
    }
    seenBodies.add(bodies[i])
  }
  if (!isSeasonalUgcTheme(themeText)) {
    for (let i = 0; i < slides.length; i++) {
      const slideText = `${slides[i].title || ''} ${slides[i].body || ''}`
      if (UGC_SEASON_ECHO_RE.test(slideText)) {
        failures.push({
          code: 'season_filler',
          message: 'Non-seasonal theme must not mention months, seasons, or weather',
          slide: i + 1,
          role: slides[i]?.role,
          snippet: slideText.trim().slice(0, 140),
        })
      }
    }
  } else if (
    !isChristmasGiftsNiche() &&
    seasonEchoCount(slides.map((s) => `${s.title || ''} ${s.body || ''}`)) > 1
  ) {
    failures.push({
      code: 'season_repeat',
      message: 'Seasonal filler may appear at most once per story',
      slide: 1,
      role: slides[0]?.role,
      snippet: slides.map((s) => s.body || '').join(' ').slice(0, 140),
    })
  }
  // Story arc order: the product/solution pitch may not appear on slide 2 —
  // the problem must develop first (įvykis → priežastis → posūkis → rezultatas).
  if (slides.length >= 4) {
    const secondSlide = `${slides[1]?.title || ''} ${slides[1]?.body || ''}`
    if (UGC_SOLUTION_PITCH_RE.test(secondSlide)) {
      failures.push({
        code: 'solution_too_early',
        message: 'Slide 2 already pitches the solution — develop the problem first',
        slide: 2,
        role: slides[1]?.role,
        snippet: secondSlide.trim().slice(0, 140),
      })
    }
  }
  // Cross-slide sentence repetition — exact OR ≥85% word overlap (≥6 words).
  {
    const seenSentences = new Map<string, number>()
    const seenKeys: string[] = []
    for (let i = 0; i < slides.length; i++) {
      const text = `${slides[i].title || ''} ${slides[i].body || ''}`
      const sentences = text.split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter(Boolean)
      for (const sentence of sentences) {
        const key = normalizeSentenceKey(sentence)
        if (key.split(' ').filter(Boolean).length < 6) continue
        const firstSlide = seenSentences.get(key)
        const nearDup = isNearDuplicateSentenceKey(key, seenKeys)
        if ((firstSlide !== undefined && firstSlide !== i) || nearDup) {
          failures.push({
            code: 'duplicate_sentence',
            message: `Sentence repeats slide ${firstSlide !== undefined ? firstSlide + 1 : 'earlier'}`,
            slide: i + 1,
            role: slides[i]?.role,
            snippet: sentence.slice(0, 140),
          })
        } else {
          seenSentences.set(key, i)
          seenKeys.push(key)
        }
      }
    }
  }
  // Hook body may not repeat its own title sentence (any title length).
  {
    const hookTitle = slides[0]?.title || ''
    const hookBody = slides[0]?.body || ''
    if (hookTitle && hookBodyEchoesTitle(hookTitle, hookBody)) {
      failures.push({
        code: 'hook_title_echo',
        message: 'Hook body repeats the hook title verbatim',
        slide: 1,
        role: slides[0]?.role,
        snippet: hookBody.slice(0, 140),
      })
    }
  }
  failures.push(...collectUniversalClassStoryIssues(slides, themeText))
  if (countGenericFillerSlides(slides) >= 2) {
    failures.push({
      code: 'generic_filler_repeat',
      message: 'Generic planning filler appears on more than one slide',
      slide: 1,
      role: slides[0]?.role,
      snippet: slides
        .map((s) => s.body || '')
        .find((b) => UGC_GENERIC_FILLER_PATTERNS.some((re) => re.test(b)))
        ?.slice(0, 140) || '',
    })
  }
  if (slides.length >= 4) {
    const closeIdx = slides.length - 1
    for (let i = closeIdx - 1; i >= 1; i--) {
      const role = slides[i]?.role
      if (role !== 'build' && role !== 'context') continue
      const buildText = `${slides[i]?.title || ''} ${slides[i]?.body || ''}`.trim()
      const closeText = `${slides[closeIdx]?.title || ''} ${slides[closeIdx]?.body || ''}`.trim()
      if (isBuildCloseEcho(buildText, closeText)) {
        failures.push({
          code: 'build_close_echo',
          message: 'Build slide previews the close payoff instead of adding a new beat',
          slide: i + 1,
          role: slides[i]?.role,
          snippet: buildText.slice(0, 140),
        })
      }
      break
    }
  }
  if (slides.length >= 3 && !slidesHaveBrandAnchor(slides)) {
    failures.push({
      code: 'brand_drift',
      message: isChristmasGiftsNiche()
        ? 'Last slides and close CTA must explicitly tie to a gift or Christmas shopping'
        : 'Last slides and close CTA must explicitly tie to food or meal planning',
      slide: slides.length,
      role: slides.at(-1)?.role,
      snippet: `${slides.at(-2)?.body || ''} ${slides.at(-1)?.body || ''}`.trim().slice(0, 140),
    })
  }
  if (isChristmasGiftsNiche()) {
    const blob = slides.map((s) => `${s.title || ''} ${s.body || ''}`).join(' ')
    if (UGC_DIET_DRIFT_RE.test(blob) || UGC_KALEDU_DIET_LEAK_RE.test(blob)) {
      failures.push({
        code: 'brand_drift',
        message: 'Christmas UGC must not mention diets, calories, meal plans, or tavoknyga.com',
        slide: slides.length,
        role: slides.at(-1)?.role,
        snippet: blob.slice(0, 140),
      })
    }
  }
  return failures
}

export function assertShipableStory(
  slides: Array<{ title?: string; body?: string; role?: string }>,
  themeText = '',
): void {
  const failures = collectStoryIssues(slides, themeText)
  if (!failures.length) return
  const first = failures[0]
  throw new Error(
    `Story gate failed: slide ${first.slide}${first.role ? ` (${first.role})` : ''} ${first.code}: ${first.message} | ${first.snippet}`,
  )
}

export function hasFormalRegister(text: string): boolean {
  return /\b(jaučiatės|jaučiate|jaučiat|jums|jūsų|nustokit|pradėkite|pajautekite|pajuskite|galite|turite|esate|būsite|įstrigstate|stringate|įsiklausykite|išlaisvinkite|atverkite|žinote|nežinote|norite|raskite|skaitykite|bandykite|planuokite|gaiškite|apsilankykite|pasirinkite|prisijunkite|užpildykite|suplanuokite|išbandykite|padėkite)\b/iu.test(
    text,
  )
}

/** Fix truncated / nonsense endings from weak model outputs. */
export function repairIncompleteLtSentence(text: string): string {
  let out = text.trim()
  if (!out) return out
  // Trailing "bet tai." / "bet tai"
  out = out.replace(/\bbet tai\.?\s*$/iu, 'bet tai puiki pradžia.')
  // Known mid-word truncations from screenshots
  out = out.replace(/\bsojos gami\.?\s*$/iu, 'sojos gaminiai.')
  out = out.replace(/\bvegan baltymai\.?\s*$/iu, 'veganiški baltymai.')
  out = out.replace(/\bmaistinu\.?\s*$/iu, 'maitinimu.')
  out = out.replace(/\bangidrat[uų]?\.?\s*$/iu, 'angliavandenių.')
  out = out.replace(/\bPapildomai įkrauti\.?\s*$/iu, 'Papildomai įkrauk energiją vaisiais.')
  out = out.replace(/\bLengvų angliavandenių ir baltymų\.?\s*$/iu, 'Rinkis lengvus angliavandenius ir baltymus.')
  out = out.replace(/\bŠtai kodėl\s+(?!neverta\b)([a-ząčęėįšųūž]+oti(?:s)?)\b/iu, 'Štai kodėl neverta $1')
  // Incomplete CTA in body → drop (canonical CTA is only in cta field)
  out = out.replace(/\bPradėk 5 min\.?\s*(testą)?([!\s?.]*🤩*)*\s*$/iu, '')
  out = out.replace(/\bApsilankyk\s*tavoknyga\.com[^.!\n]*$/iu, '')
  out = out.replace(/\btavoknyga\.com\s*$/iu, '')
  out = out.replace(/\bRask\s+dovaną\s+Kalėdų\s+Kampelyje[^.!\n]*$/iu, '')
  out = out.replace(/\bkaledukampelis\.(?:lt|com)\s*$/iu, '')
  // Trailing "kad" / "kad." dangling
  out = out.replace(/\bkad\.?\s*$/iu, '')
  // Sentence ending mid-clause with only a period after short stump
  if (/\b(bet|kad|ir|arba|nes)\s*$/iu.test(out)) {
    out = out.replace(/\s+(bet|kad|ir|arba|nes)\s*$/iu, '.')
  }
  return out.replace(/\s+/g, ' ').replace(/\.\s*\./g, '.').trim()
}
