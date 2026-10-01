/** Per-slide shipability checks for Lithuanian UGC copy. (Split out of ugc-lt-normalize.ts.) */

import { isChristmasGiftsNiche } from '../profile-brand.js'
import {
    christmasFieldEmojiOk,
    extractKaleduEmojis,
    isAllowedKaleduEmoji,
} from '../ugc-kaledu-emoji.js'
import { collectLtArCoordinationIssues, collectLtCaseAgreementIssues, collectLtInstrumentalIssues } from '../ugc-lt-case-check.js'
import { hasCircularCausalClaim } from '../ugc-lt-classes.js'
import { hasWrongUgcSeasonReference } from '../ugc-season-context.js'
import { isGibberishLtCopy, looksVerblessGenitiveStump, textHasFiniteVerbCue, UGC_DIET_DRIFT_RE } from './gibberish.js'
import { isDeclarativeQuestionMark, LT_DECLARATIVE_INSIGHT_RE, LT_QUESTION_STARTER_RE, LT_QUESTION_WORD_START_RE, LT_RHETORICAL_DIRECT_QUESTION_RE, LT_RHETORICAL_PARTICIPLE_HOOK_RE, polishLtCaps, splitShipableSentences } from './normalize-copy.js'

/** Colon-tailed interrogative titles missing their "?". */
export function hasUnmarkedColonQuestion(title: string): boolean {
  if (!title) return false
  return (
    /:\s*(kodėl|ką|kaip|kas|kur|kada|kiek|nuo ko)(?!\p{L})[^?]*$/iu.test(title) ||
    /:\s*\p{L}+(?:\s+\p{L}+){0,3}\s+ar\s+\p{L}+[^?]*$/iu.test(title)
  )
}

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

export function sentenceHasVerbCue(s: string): boolean {
  const core = s.replace(/[.!?…]+$/u, '').trim()
  return textHasFiniteVerbCue(core)
}

export const BARE_HOOK_EXPANSIONS: Record<string, string> = {
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

export function hasFormalRegister(text: string): boolean {
  return /\b(jaučiatės|jaučiate|jaučiat|jums|jūsų|nustokit|pradėkite|pajautekite|pajuskite|galite|turite|esate|būsite|įstrigstate|stringate|įsiklausykite|išlaisvinkite|atverkite|žinote|nežinote|norite|raskite|skaitykite|bandykite|planuokite|gaiškite|apsilankykite|pasirinkite|prisijunkite|užpildykite|suplanuokite|išbandykite|padėkite)\b/iu.test(
    text,
  )
}
