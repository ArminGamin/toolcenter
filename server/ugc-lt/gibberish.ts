/** Detection of broken or gibberish Lithuanian copy. (Split out of ugc-lt-normalize.ts.) */

import { isChristmasGiftsNiche } from '../profile-brand.js'
import { looksLtGenitiveEnding } from '../ugc-lt-case-check.js'

/** Food/mityba anchor for brand_drift — slide bodies + close CTA only (not caption). */
export const UGC_FOOD_ANCHOR_RE =
  /\b(maist\w*|mityb\w*|valg\w*|recept\w*|piet\w*|vakarien\w*|užkand\w*|meniu|maisto\s+ruoš\w*)\b/iu

export const UGC_DIET_DRIFT_RE =
  /\b(mityb\w*|kalorij\w*|diet\w*|angliavanden\w*|makroelement\w*|svorio\s+(?:netek|tiksl)|maisto\s+plan|tavoknyga|5\s*min\.?\s*test)\b/iu

export const OFF_TOPIC_NON_FOOD_RE = /\b(drabuž|bužių|aprang|kūno proporcij|dydžio)\b/iu

export const HOOK_COLON_TEMPLATE_RE = /:\s*koks jis iš tiesų\?/giu

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

/** Residual we-forms — shared by gibberish gate + audit/caption scanners. */
export const UGC_LT_RESIDUAL_WE_FORMS =
  /\b(susiduriame|jaučiame|siekdami|išmetame|perkame|suvartojame|neplanuojame|pastebėjau|neturime(?:\s+laiko)?|dedame|valgome|ruošiame|pasiūlysime|pritaikome|ruošiamės|užsisklendiname|pamirštame|stengiame|besiruošiame|pasiektume|nesportuojame|manome|suprantame|galime|galėsime|norėjome|turime|mums|mūsų|jaučiau|nežinojau|maniau|bandžiau|supratau)\b/i

/** Known bad stems / invented forms — never ship. */
export const LT_BAD_STEMS =
  /(?:^|[^\p{L}])(maistinu|angidrat|aklavog|pensoj|sojos gami|baltimų|anglevanden|hydratac|įsismuov|hidratacijąj|atsvarum|nebebeg|žaidžiami|užsispyti|svytuot|biebalu|kalorijus|apgavius|apgavus|apgauding|virimo plan|virimo seans|nešlamž|subręst|rūpestų|varginamas|maistinimas|užmiršt|badmečio|treniruoj(?!ot)|pabandint|skaidrut|patiekas|rudenių|fokusuoja|poveikio tavo|patiekalimis|trūgst|besimaugin|įtūmi|norėtumis|režinas|sunksta|nuovokio|aišus(?!k)|medžiuk|tebetruksm|stengiame|anglies hidrat|insulinrezist|kątį|rutinoj|bėdel|valgoji|vargst|virsnum|viršinam|tebesild|kasmens|utėlius|galimi|šventvėlių|ištvermas|įsisistemin|viršvalgėj|pamėteli|vargdas|mėgauties|susivildavimas|netenkin|susierin(?!zin)|svėris)\w*/iu

/** Detect llama3.1 / OpenEuroLLM gibberish + broken structure — reject and retry. */
export function isGibberishLtCopy(text: string): boolean {
  const raw = String(text || '').trim()
  if (!raw) return true
  // Quoted catalog names („Mūsų istorija“) are not model copy.
  const t = raw.replace(/„[^“”"]{1,60}[“”"]/gu, '„“')
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

export const LT_FINITE_VERB_CUES =
  /\b(yra|bus|buvo|tampa|jauti|jaučia|jautiesi|gali|turi|reikia|reikėtų|rinkis|rinktis|padeda|verčia|mažina|didina|duoda|duoti|žinai|žinau|planuoji|sprendžiu|sprendi|trūksta|pritrūksta|priklauso|šoka|ieško|ieškai|ieškoti|skamba|veikia|baigiasi|prasideda|keičiasi|svyruoja|svyruoti|grįžta|grįžti|grįžo|suplanuoja|sudėlioja|atidedi|pamiršti|pamiršai|nori|esi|galėsi|mėgautis|atsisakyk|planuok|skaityk|pradėk|apsilankyk|stringi|pastebėjai|susiduri|perki|išmeti|kreipia|trukdo|išsprendžia|suprask|supratai|supranti|slepiasi|slepia|ruošiant|rask|pasirūpink|džiaukis|pajustum|randi|atnešė|atneša|suteikė|suteikia|padėjo|leido|leidžia|įsitikinai|patyrei|patyrė|liko|likti|sutaupė|sutaupo|užgriūva|sujungia|artėja|laukia|lauki|tinka|tiks|atrodo|matai|lieka|primena|trunka|kainuoja|pravers|atsiranda)\b/i

/** Genitive endings for verbless-stump detection — narrow pile (io/ių/ų), not masc -o adj+noun. */
export const LT_GENITIVE_STUMP_ENDING_RE = /(?:io|ių|ų)$/iu

export function looksLtGenitiveStumpEnding(token: string): boolean {
  if (!token || token.length < 4) return false
  const w = token.toLocaleLowerCase('lt-LT')
  if (/(?:ti|tis)$/i.test(w)) return false
  return LT_GENITIVE_STUMP_ENDING_RE.test(w)
}

/** Present reflexive finite verbs (-asi / -osi / -iasi) — structural, not per-verb list. */
export const LT_REFLEXIVE_FINITE_RE = /\b\p{L}{3,}(?:asi|osi|iasi)\b/iu

/**
 * More common finite verbs for gift copy. Unicode-aware boundaries: `\b` above misses words that
 * start or end with a Lithuanian letter („įsimena“, „parodys“). Without these, a correct one-line
 * close („Tokia dovana pradžiugina…“) failed the verb gate and was swapped for a stock line.
 */
export const LT_FINITE_VERB_CUES_EXTRA =
  /(?<!\p{L})(?:sako|pasako|rašo|žino|mėgsta|myli|randa|perka|nuperka|nusiperka|dovanoja|naudoja|naudos|gauna|mato|supranta|supras|suprasi|galvoja|galvoji|prisimena|prisimeni|prisimins|vertina|įvertins|daro|padaro|kuria|sukuria|sukurs|pradžiugina|pradžiugins|nudžiugina|nudžiugins|džiugina|džiugins|parodo|parodys|išlieka|išliks|išbūna|tarnauja|tarnaus|pataiko|pataikys|praverčia|kelia|sukelia|sukels|palengvina|praturtina|įsilieja|įsimena|įsimins|primins|saugo|saugos|gyvena|dera|kviečia|guli|užsiguli|nugula|nugulės|sutaupys|sumažina|suteiks|reiškia|patinka|patiks|atsibosta|keliauja|pajus|pajunta|nustebina|nustebins|šildo|sušildo|šviečia|kvepia|kvepės|tiktų|atrodytų|praverstų|norėtų|pradžiugintų|padės|bus|tampa|taps|pavirsta|lemia|slypi|telpa|lieka|liks|pasiteisina|atsiperka|sukasi|vertas|verta|būtų|atitinka|atitiks|džiaugsis|naudosis|mėgausis|leis|paverčia|pavers|jausis|pasijus|padarys|sukuria|kalba|reikalauja|nuvilia|dingsta|ilgėja|trumpėja|mažėja|daugėja|auga|belieka|tenka|spės|spėja|atkeliaus|atkeliauja|suspės|pataikys|patikrini|ateina|liko|vėluoja|nusišypso|sugrąžina|virsta|praeina|išgelbsti|atlaiko|papildo|suartina|suburia|nėra|nebėra|nebuvo|užtenka|užteks|pakanka|pakaks|praleidžia|praleidi|nutyla|norėsis|dėvės|dėvi|išsimiegi|išsimiega|būna|puošia|pasimeta|gelbsti|nusipelno|sustingsta|išsausėja|atrodys|prasidės|praeis|virs|turės|švies|švytės|baigsis|stovės|puoš|papuoš|ramins|pasitiks|pailsės|atgaivins|pažiūrės|išeis|sninga|truks|reikės|prapuls|gadins|užges|apjuosia|apjuos)(?!\p{L})/iu

function hasVerbCue(text: string): boolean {
  return LT_FINITE_VERB_CUES.test(text) || LT_FINITE_VERB_CUES_EXTRA.test(text) || LT_REFLEXIVE_FINITE_RE.test(text)
}

export function textHasFiniteVerbCue(text: string): boolean {
  const core = String(text || '').trim()
  if (!core) return false
  if (hasVerbCue(core)) return true
  // Negated verbs carry the same predicate: „neužsiguli“, „nesukuria“, „nebereikia“.
  const unNegated = core.replace(/(?<!\p{L})ne(?:be)?(?=\p{L}{3,})/giu, '')
  return unNegated !== core && hasVerbCue(unNegated)
}

/** „Lengvų X ir Y.“ style — genitive list with no finite verb. */
export function looksVerblessGenitiveStump(text: string): boolean {
  const sentences = text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
  for (const s of sentences) {
    const core = s.replace(/[.!?…]+$/u, '').trim()
    const words = core.split(/\s+/).filter(Boolean)
    if (words.length < 2 || words.length > 7) continue
    const hasFiniteCue =
      textHasFiniteVerbCue(core) ||
      /(ti|tis)$/i.test(words.at(-1) || '') ||
      // conditional mood: „Tokiam žmogui tiktų nuotraukų rėmelis.“
      words.some((w) => /^(?:tiktų|patiktų|pradžiugintų|nudžiugintų|džiugintų|praverstų|reikėtų|norėtų|galėtų|būtų|sušildytų|papuoštų)$/iu.test(w.replace(/[^\p{L}]/gu, '')))
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
