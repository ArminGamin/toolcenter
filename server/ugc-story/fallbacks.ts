/** Programmatic fallback copy (hooks, bodies, closes) used when the model output is unusable. (Split out of ugc-story-engine.ts.) */

import { isChristmasGiftsNiche } from '../profile-brand.js'
import {
    stripEnglishCopyLabels
} from '../ugc-copy-skill.js'
import { ugcActiveCta } from '../ugc-cta-normalize.js'
import {
    finalizeHookBody,
    isInvalidHookTitle,
    KALEDU_HOOK_BODY_OPENERS,
    pickSlotHookBody
} from '../ugc-hook-templates.js'
import {
    kaleduInventedProductMentions,
    type KaleduCatalogProduct
} from '../ugc-kaledu-catalog.js'
import {
    kaleduDeterministicQa
} from '../ugc-kaledu-final-qa.js'
import { hasEarlyProductPitch } from '../ugc-lt-classes.js'
import {
    assertShipableLtSlide,
    demoteLtTitleCase,
    expandBareHookTitle,
    isNearDuplicateSentenceKey,
    KALEDU_THEME_SUBJECTS,
    normalizeSentenceKey,
    textHasEngagementBait,
    UGC_GENERIC_FILLER_PATTERNS,
    UGC_KALEDU_DIET_LEAK_RE
} from '../ugc-lt-normalize.js'
import {
    sanitizeLtSeasonCopy,
    stripSeasonFiller
} from '../ugc-season-context.js'
import {
    isRepeatOfRecentSlideBody,
    rankByLedgerFreshness
} from '../ugc-variety-ledger.js'
import { repeatsIdeaFamily } from '../ugc-lt/idea-families.js'
import { detectKaleduRecipient, personalizeForRecipient } from '../ugc-lt/recipient.js'
import { KALEDU_PAIN_RESTART_RE } from './arc-guard.js'
import { findKaleduThemeKit, themeKitLines } from './kaledu-kits.js'
import { isDuplicateSlideCopy, isParaphraseSlideCopy, ugcSlideThemeOverlap } from './similarity.js'
import { BODY_MAX, clipField, clipHookTitle, splitSentences, TITLE_MAX, type UgcStorySlide } from './text.js'

export const UGC_MIN_SENTENCES_PER_SLIDE = 1

/**
 * Christmas fallback copy is validated like model copy: contamination, product truth,
 * deterministic final QA, slide ship gate, in-post duplicates — and ordered by the
 * variety ledger so the same canonical line is not reused across a batch.
 */
export function pickValidatedKaleduFallback(
  role: string,
  candidates: string[],
  prior: Array<{ title?: string; body?: string; text?: string }> = [],
  allowed: KaleduCatalogProduct[] = [],
): string | null {
  const priorText = prior.map((p) => [p.title, p.body ?? p.text].filter(Boolean).join(' ')).join(' ')
  const priorKeys = splitSentences(priorText)
    .map((s) => normalizeSentenceKey(s))
    .filter((key) => key.split(' ').filter(Boolean).length >= 4)
  const lateRole = role === 'build' || role === 'close' || role === 'punch'
  const passes = (body: string) => {
    if (UGC_KALEDU_DIET_LEAK_RE.test(body)) return false
    if (lateRole && (/\?/u.test(body) || KALEDU_PAIN_RESTART_RE.test(body))) return false
    if (kaleduInventedProductMentions(body, allowed).length) return false
    if (kaleduDeterministicQa([{ body, role }], { theme: '', allowed }).length) return false
    if (isParaphraseSlideCopy('', body, prior)) return false
    for (const sentence of splitSentences(body)) {
      const key = normalizeSentenceKey(sentence)
      if (priorKeys.includes(key) || isNearDuplicateSentenceKey(key, priorKeys, 0.7)) return false
    }
    try {
      assertShipableLtSlide({ body, role })
      return true
    } catch {
      return false
    }
  }
  const ranked = rankByLedgerFreshness(candidates)
  // First choice: a line that also brings a new idea (not "tinka žmogui" for the third time).
  return ranked.find((body) => !repeatsIdeaFamily(body, priorText) && passes(body)) || ranked.find(passes) || null
}

/**
 * Validated fallback that stays on the post's subject: lines personalised for the theme's
 * recipient („tam žmogui“ → „seseriai“) are tried first, stock lines only after.
 */
export function pickThemedKaleduFallback(
  role: string,
  candidates: string[],
  prior: Array<{ title?: string; body?: string; text?: string }> = [],
  allowed: KaleduCatalogProduct[] = [],
  themeText = '',
): string | null {
  // Hand-checked lines written for this exact theme come first — they keep the story on topic.
  const kitLines = themeKitLines(findKaleduThemeKit(themeText), role)
  if (kitLines.length) {
    const picked = pickValidatedKaleduFallback(role, kitLines, prior, allowed)
    if (picked) return picked
  }
  const r = detectKaleduRecipient(themeText)
  if (r) {
    const personal = candidates
      .map((line) => personalizeForRecipient(line, r))
      .filter((line): line is string => Boolean(line))
    const picked = personal.length ? pickValidatedKaleduFallback(role, personal, prior, allowed) : null
    if (picked) return picked
  }
  return pickValidatedKaleduFallback(role, candidates, prior, allowed)
}

export function buildFallbackCloseBody(
  topic: string,
  prior: Array<{ title?: string; body?: string; text?: string }> = [],
): string {
  const candidates = getFallbackCloseBodyCandidates(topic)
  if (isChristmasGiftsNiche()) {
    const picked = pickThemedKaleduFallback('close', candidates, prior, [], topic)
    if (picked) return picked
  }
  return (
    candidates.find((body) => {
      if (isDuplicateSlideCopy('', body, prior)) return false
      try {
        assertShipableLtSlide({ body, role: 'close' })
        return true
      } catch {
        return false
      }
    }) || candidates[1]
  )
}

/**
 * Theme anchors the story gate requires in the first three slides. Rescued slides must
 * carry them too, otherwise a rescued post dies later on `theme_drift`.
 */
export const THEME_ANCHOR_LEADS: Array<{ re: RegExp; lead: string }> = [
  {
    re: /diabet|gliukoz|cukraus kiek/iu,
    lead: 'Gliukozės svyravimai kasdien keičia tavo savijautą.',
  },
  {
    re: /ištverm|endurance|sport/iu,
    lead: 'Treniruotė pareikalauja energijos, kurią gauni iš maisto.',
  },
  {
    re: /kūdik|baby|pirmas maist/iu,
    lead: 'Pirmas maistas kūdikiui kelia daugiau klausimų, nei tikėjaisi.',
  },
  { re: /sūr|cheese/iu, lead: 'Sūrio gabalas šaldytuve dažnai lieka nepanaudotas.' },
  {
    re: /meal kit|maisto rinkin/iu,
    lead: 'Maisto rinkinys sutaupo laiko, kai savaitė būna įtempta.',
  },
  { re: /stres.*valg|stress.*eat/iu, lead: 'Stresas dažnai nukreipia tave prie greito užkandžio.' },
  { re: /biudžet|pinig|finans|budget/iu, lead: 'Kiekvienas neplanuotas pirkinys spaudžia biudžetą.' },
  {
    re: /laik[oy]|produktyv|planavim|time management/iu,
    lead: 'Diena be aiškaus plano prabėga greičiau, nei spėji pastebėti.',
  },
  {
    re: /šaldytuv|likuč|leftover|portion/iu,
    lead: 'Šaldytuve likę produktai dažnai lieka nepanaudoti.',
  },
  {
    re: /geležis|geležies|energij|nuovarg|iron/iu,
    lead: 'Nuovargis dažnai signalizuoja apie tai, ko organizmui trūksta.',
  },
]

export const KALEDU_THEME_ANCHOR_LEADS: Array<{ re: RegExp; leads: string[] }> = [
  {
    re: /mam/iu,
    leads: [
      'Dovana mamai dažnai lieka paskutinė eilutė sąraše.',
      'Mamai visada norisi išrinkti kažką daugiau nei dar vieną smulkmeną.',
    ],
  },
  {
    re: /tėt|tėči/iu,
    leads: [
      'Dovana tėčiui dažnai virsta tuo, kas greičiausia po ranka.',
      'Tėtis sako, kad jam nieko nereikia, todėl rinktis dar sunkiau.',
    ],
  },
  {
    re: /senel|močiut/iu,
    leads: [
      'Seneliams sunku išrinkti dovaną, nes jie sako, kad visko turi.',
      'Dovana seneliui turi būti paprasta ir tikrai naudinga.',
    ],
  },
  {
    re: /por/iu,
    leads: [
      'Dovana porai dažnai tampa dar vienu daiktu į stalčių.',
      'Porai norisi dovanos, kuria abu galėtų džiaugtis kartu.',
    ],
  },
  {
    re: /paskutin|last.?minute/iu,
    leads: [
      'Paskutinė diena iki švenčių palieka mažai ramybės rinktis.',
      'Kai iki švenčių liko kelios dienos, kiekviena valanda svarbi.',
    ],
  },
  {
    re: /biudž|€|eur/iu,
    leads: [
      'Nedidelis biudžetas vis tiek gali atrodyti kaip apgalvota dovana.',
      'Su aiškia suma galvoje rinktis dovaną net paprasčiau.',
    ],
  },
  {
    re: /dekor|eglut/iu,
    leads: [
      'Šventinės dekoracijos namuose kuria nuotaiką dar prieš Kalėdas.',
      'Viena graži dekoracija gali pakeisti visą kambario nuotaiką.',
    ],
  },
  {
    re: /slapt|koleg/iu,
    leads: [
      'Slaptasis Senelis palieka per mažai laiko spėlioti pagal skonį.',
      'Dovana kolegai turi būti maloni, bet ne per daug asmeniška.',
    ],
  },
  {
    re: /vyr/iu,
    leads: [
      'Dovana vyrui dažnai stringa, kai sukiesi ratu tarp tų pačių lentynų.',
      'Vyrui dovaną išrinkti sunku, kai jis sako, kad nieko nereikia.',
    ],
  },
  {
    re: /moter/iu,
    leads: [
      'Dovana jai nebūtinai turi būti dar viena dėžutė.',
      'Moteriai norisi dovanos, kuri parodytų, kad pagalvojai būtent apie ją.',
    ],
  },
  {
    re: /jauk/iu,
    leads: [
      'Jaukumas namuose dažnai prasideda nuo vienos smulkmenos.',
      'Jauki dovana tinka tiems, kurie mėgsta vakarus namuose.',
    ],
  },
  {
    re: /dovan|kalėd|kaled|švent/iu,
    leads: [
      'Dovanos paieška dažnai virsta skuba, kai sąrašas vis ilgėja.',
      'Prieš šventes dovanų sąrašas ilgėja greičiau nei laikas.',
    ],
  },
]

export function themeAnchorLead(topic: string): string {
  if (!isChristmasGiftsNiche()) {
    return THEME_ANCHOR_LEADS.find((entry) => entry.re.test(topic))?.lead || ''
  }
  const entry = KALEDU_THEME_ANCHOR_LEADS.find((row) => row.re.test(topic))
  return entry ? rankByLedgerFreshness(entry.leads)[0] : ''
}

/** Pad context/build text to target sentence count without meta scroll bait. */
export function fitSlideText(
  text: string,
  exact: number,
  role: string,
  topic: string,
  prior: Array<{ title?: string; body?: string; text?: string }> = [],
  slideIndex = 0,
): string {
  let sents = splitSentences(stripEnglishCopyLabels(text))
  while (sents.length > exact) sents.pop()
  if (sents.length < exact && sents.length > 0 && role !== 'close') {
    if (role === 'context' && sents.length < UGC_MIN_SENTENCES_PER_SLIDE) {
      const anchor = themeAnchorLead(topic)
      if (
        anchor &&
        !sents.some((s) => ugcSlideThemeOverlap(anchor, [s]) >= 0.5)
      ) {
        sents = [anchor, ...sents]
      }
      if (sents.length < UGC_MIN_SENTENCES_PER_SLIDE) {
        const priorMapped = prior.map((p) => ({
          title: p.title,
          body: p.body ?? p.text,
          text: p.text ?? p.body,
        }))
        const fb = buildFallbackSupportBody('context', priorMapped, topic, slideIndex)
        const fbSents = splitSentences(fb).filter(
          (s) => !sents.some((x) => x.toLowerCase() === s.toLowerCase()),
        )
        if (fbSents.length) {
          sents = [...fbSents.slice(0, exact - sents.length), ...sents]
        }
      }
    }
    while (sents.length < exact && sents.length > 0) break
  }
  return sents.slice(0, exact).join('\n')
}

/** Exported for pool audit tests — every line must pass ship gates. */
export const UGC_FALLBACK_CONTEXT_BODIES = [
  'Kasdieniai pasirinkimai tampa sunkesni, kai neturi aiškios krypties. Tada kiekvienas sprendimas pareikalauja daugiau laiko.',
  'Dabartinis ritmas ne visada palieka laiko ramiam pasirinkimui. Dėl to naudinga iš anksto žinoti savo kitą žingsnį.',
  'Sprendimai kaupiasi, kol pradedi atidėlioti net paprastus dalykus. Vakare lieka mažiau jėgų rinktis apgalvotai.',
  'Kai kiekvieną kartą svarstai iš naujo, pavargsti dar prieš pradėdamas. Tada renkiesi tai, kas greičiausia, o ne tai, ko nori.',
  'Dažnai priimti sprendimus sunaudoja daug energijos. Tokiais atvejais dažnai renkiamas greitas malonumas.',
  'Kiekvieno žmogaus virškinimas unikalus, todėl skirtingi produktai gali sukelti nevienodus simptomus.',
]

export const UGC_KALEDU_FALLBACK_CONTEXT_BODIES = [
  'Lentynose daug dovanų, bet vis tiek nežinai, ką rinktis. Šventės artėja, o tu sprendimą vis atidėlioji.',
  'Kai sąrašas ilgėja, griebi tai, kas po ranka. Tada dovaną perki paskubomis, o ne pagal žmogų.',
  'Kiekvieną vakarą svarstai iš naujo, kol pavargsti. Tada dovanai griebi pirmą pasitaikiusį daiktą.',
  'Kuo ilgiau atidedi dovanų paiešką, tuo sunkiau apsispręsti. Vakare jėgų rinktis lieka vis mažiau.',
  'Kai nežinai, ko ieškai, visos lentynos atrodo vienodos.',
  'Internete tiek dovanų pasiūlymų, kad akys raibsta. Po valandos naršymo vis dar nieko neišsirinkai.',
  'Jau kelias savaites galvoji apie dovaną, bet nežinai, nuo ko pradėti. Todėl sprendimą vis stumi vėliau.',
  'Tas žmogus, regis, jau viską turi, todėl kiekviena dovanos idėja atrodo per paprasta.',
  'Laiko iki švenčių lieka vis mažiau, o sąraše dar keli vardai. Skubant lengva nupirkti bet ką.',
  'Daug išleisti nesinori, bet ir atsitiktinės dovanos nenori. Taip rinktis tampa dar sunkiau.',
]

export const UGC_KALEDU_FALLBACK_BUILD_BODIES = [
  'Kai žinai, kam perki, parduotuvėje mažiau dvejoji ir greičiau randi tinkamą daiktą.',
  'Kai žinai, kuo žmogus džiaugiasi kasdien, dovanos paieška tampa daug paprastesnė.',
  'Pradėk nuo žmogaus, o ne nuo daikto. Tada dovaną rinktis ramiau, o laiko lieka ir pakuotei.',
  'Viena apgalvota dovana vertesnė už dešimt skubotų pirkinių. Ir išleidi mažiau.',
  'Pagalvok, kaip tas žmogus leidžia laisvą vakarą. Iš to dažnai ir gimsta geriausia dovanos idėja.',
  'Užsirašyk tris dalykus, kuriuos žmogus mėgsta. Su tokiu sąrašu per kelias minutes lieka vos keli variantai.',
  'Dovana nebūtinai turi būti brangi. Svarbiau, kad ji tiktų žmogaus kasdienybei.',
  'Kartais geriausia dovana yra tai, ko žmogus pats sau nenupirktų. Būtent tokią jis ir prisimins.',
  'Praktiška dovana nebūtinai nuobodi. Kai žmogus ja naudojasi kasdien, ji primena apie tave.',
  'Nereikia ieškoti tobulos dovanos. Užtenka tokios, kuri tiktų būtent tam žmogui.',
  'Pažiūrėk, ką žmogus dažniausiai naudoja namuose. Dažnai geriausia dovana yra tas pats daiktas, tik geresnis.',
  'Prisimink, ką žmogus minėjo per pastaruosius mėnesius. Tokios užuominos dažnai ir tampa geriausia dovanos idėja.',
  'Gražiai supakuota dovana atrodo apgalvotai net tada, kai ji nedidelė.',
  'Prie dovanos pridėk atviruką su keliais ranka parašytais žodžiais. Jį žmogus dažnai saugo ilgiau nei pačią dovaną.',
  'Rinkis daiktą, kurį žmogus naudos ir po švenčių. Tada dovana neatsidurs stalčiuje.',
  'Nusistatyk sumą iš anksto. Tada rinktis tenka ne iš visos parduotuvės, o iš kelių variantų.',
]

export const UGC_KALEDU_FALLBACK_CLOSE_BODIES = [
  'Kai dovana jau išrinkta, prieš šventes daug ramiau. Žinai, kad ji tikrai tiks.',
  'Kai žinai, ko ieškai, dovaną išrinkti daug paprasčiau.',
  'Kai dovana išrinkta laiku, švenčių lauki ramiai.',
  'Gera dovana nebūtinai kainuoja daug. Svarbiau, kam ją renkiesi.',
  'Net maža dovana gali pradžiuginti, jei ji tinka žmogui.',
  'Kai dovana tinka žmogui, jos kaina nebe tokia svarbi.',
  'Kai turi aiškią idėją, dovanų paieška trunka kelias minutes, ne kelis vakarus.',
  'Išsirinkus dovaną anksčiau, šventės prasideda be skubos. Lieka laiko ir pakuotei.',
  'Apgalvota dovana nereikalauja didelio biudžeto. Užtenka žinoti, kam ją perki.',
  'Kai dovana tikrai tinka žmogui, išpakuoti ją bus smagiausia vakaro dalis.',
  'Kai dovana jau paruošta, gali ramiai mėgautis paskutinėmis dienomis prieš šventes.',
  'Geriausia dovana yra ta, kuria žmogus naudosis dar ilgai po švenčių.',
  'Kai matai, kad dovana pataikė, paieška atrodo verta kiekvienos minutės.',
  'Praktiška dovana nepasimeta stalčiuje. Ji primena apie tave kiekvieną dieną.',
  'Šiemet dovanų paieška gali būti ne skuba, o malonus pasiruošimas šventėms.',
]

/** Exported for pool audit tests — diversified; no generic-filler self-contradictions. */
export const UGC_FALLBACK_BUILD_BODIES = [
  'Kai žinai, ką valgyti rytoj, vakare lieka mažiau spėliojimo. Taip atgauni kontrolę savo dienoje.',
  'Aiškios gairės palengvina kasdienį maisto planavimą. Taip daugiau dėmesio skiri tam, kas tau iš tikrųjų svarbu.',
  'Aiškus planas padeda iš anksto pasiruošti dienai. Kasdienius sprendimus priimi ramiau ir išvengi bereikalingo spėliojimo.',
  'Kai žingsniai surašyti, nebereikia kaskart pradėti nuo nulio. Tau lieka energijos tam, kas iš tiesų svarbu.',
  'Vienas apgalvotas maisto pasirinkimas pakeičia dešimt skubotų. Ilgainiui tai pastebi ir savijautoje, ir laike.',
  'Kai turi savaitės meniu, mažiau laiko praleidi spėliojant, ką gaminti vakare.',
  '30 klausimų testas sumažina sprendimų naštą, todėl streso metu mažiau norisi užkandžiauti.',
  'Netolygus angliavandenių ir baltymų santykis gali lemti staigius cukraus svyravimus kraujyje.',
  'Kai šaldytuve lieka produktų, aiškus savaitės meniu padeda juos panaudoti laiku, o ne išmesti.',
  'Biudžetui draugiškas maisto planas sumažina impulsyvius pirkinius ir mažiau maisto eina į šiukšlynę.',
]

export function getFallbackCloseBodyCandidates(topic: string): string[] {
  if (isChristmasGiftsNiche()) return [...UGC_KALEDU_FALLBACK_CLOSE_BODIES]
  const themeLead = /gliuten|gliadin/iu.test(topic)
    ? 'Aiškus planas be gliuteno padeda kasdien ramiai rinktis maistą.'
    : /švent|vestuv|engagement/iu.test(topic)
      ? 'Aiškus pasiruošimo planas leidžia švente mėgautis ramiau.'
      : /mokest|vienkart|payment/iu.test(topic)
        ? 'Vienkartinis sprendimas leidžia nebeplanuoti visko iš naujo.'
        : /žarn|mikrobiom|microbiome/iu.test(topic)
          ? 'Žarnynui pritaikytas planas padeda kasdien rinktis ramiau.'
          : /biudžet|pinig|finans|budget/iu.test(topic)
            ? 'Aiškus biudžeto planas padeda kasdien rinktis ramiau.'
            : /laik[oy]|produktyv|planavim|time management/iu.test(topic)
              ? 'Aiškus dienos planas padeda kasdien rinktis ramiau.'
              : 'Aiškus asmeninis planas padeda kasdien ramiai rinktis maistą.'
  const genericTail = /gliuten|gliadin|švent|vestuv|engagement|mokest|vienkart|payment|žarn|mikrobiom|microbiome/iu.test(
    topic,
  )
    ? 'Taip sutaupai laiko ir nebesiblaškai dėl kiekvieno patiekalo.'
    : 'Taip sutaupai laiko ir nebesiblaškai dėl kiekvieno sprendimo.'
  return [
    `${themeLead} ${genericTail}`,
    'Praktiškas sprendimas palieka daugiau laiko tavo dienai. Kasdien žinai, ką rinktis, todėl išvengi bereikalingo chaoso.',
    'Asmeninės gairės paverčia kasdienius pasirinkimus paprastesnius. Tau lieka daugiau laiko be nuolatinio spėliojimo.',
  ]
}

export function buildFallbackSupportBody(
  role: string,
  prior: Array<{ title?: string; body?: string; text?: string }> = [],
  topic = '',
  startIndex = 0,
): string {
  const anchor = themeAnchorLead(topic)
  const contextBase = isChristmasGiftsNiche()
    ? UGC_KALEDU_FALLBACK_CONTEXT_BODIES
    : UGC_FALLBACK_CONTEXT_BODIES
  const buildBase = isChristmasGiftsNiche() ? UGC_KALEDU_FALLBACK_BUILD_BODIES : UGC_FALLBACK_BUILD_BODIES
  const base = role === 'context' ? contextBase : buildBase
  const candidates = anchor ? [...base.map((body) => `${anchor} ${body}`), ...base] : base
  if (isChristmasGiftsNiche()) {
    const picked = pickThemedKaleduFallback(role, [...base, ...(anchor ? base.map((b) => `${anchor} ${b}`) : [])], prior, [], topic)
    if (picked) return picked
  }
  const rotated = [...candidates.slice(startIndex % candidates.length), ...candidates.slice(0, startIndex % candidates.length)]
  const priorHasGenericFiller = prior.some((p) => {
    const t = p.text || p.body || ''
    return UGC_GENERIC_FILLER_PATTERNS.some((re) => re.test(t))
  })
  const rejectsBody = (body: string) => {
    if (isDuplicateSlideCopy('', body, prior)) return true
    if (hasEarlyProductPitch(body)) return true
    if (isRepeatOfRecentSlideBody(body)) return true
    if (textHasEngagementBait(body)) return true
    if (priorHasGenericFiller && UGC_GENERIC_FILLER_PATTERNS.some((re) => re.test(body))) return true
    const priorTexts = prior.map((p) => p.text || p.body || '').filter(Boolean)
    if (priorTexts.some((t) => ugcSlideThemeOverlap(body, [t]) >= 0.35)) return true
    return false
  }
  return (
    rotated.find((body) => {
      if (rejectsBody(body)) return false
      try {
        assertShipableLtSlide({ body, role })
        return true
      } catch {
        return false
      }
    }) ||
    rotated.find((body) => {
      if (rejectsBody(body)) return false
      try {
        assertShipableLtSlide({ body, role })
        return true
      } catch {
        return false
      }
    }) ||
    rotated.find((body) => !rejectsBody(body)) ||
    rotated[Math.min(startIndex, rotated.length - 1)]
  )
}

/** Deterministic hook built from the human-written theme seed — never fails the gates. */
/** Christmas hook fallbacks keyed by KALEDU_THEME_SUBJECTS label — real sentences, never theme labels. */
export const KALEDU_SUBJECT_HOOKS: Record<string, Array<{ title: string; body: string }>> = {
  mama: [
    { title: 'Ką padovanoti mamai šiemet?', body: 'Ji sako, kad nieko nereikia. Bet tuščiomis ateiti vis tiek nesinori.' },
    { title: 'Mamai vėl ta pati dovana?', body: 'Kasmet perki kažką panašaus. Šiemet dovana turi būti apgalvota.' },
  ],
  tėtis: [{ title: 'Ką padovanoti tėčiui?', body: 'Tėtis sako, kad jam nieko nereikia. Tada ieškoti dar sunkiau.' }],
  sesuo: [
    { title: 'Ką padovanoti seseriai?', body: 'Ją pažįsti geriausiai, bet idėjų vis tiek trūksta.' },
    { title: 'Vis dar ieškai dovanos seseriai?', body: 'Norisi kažko, kas tiktų būtent jai, o ne bet kam.' },
  ],
  brolis: [{ title: 'Ką padovanoti broliui?', body: 'Jis sako, kad nieko nereikia, o tu vis tiek nori jį pradžiuginti.' }],
  močiutė: [{ title: 'Ką padovanoti močiutei?', body: 'Ji džiaugiasi dėmesiu labiau nei brangiais daiktais.' }],
  draugė: [{ title: 'Ką padovanoti draugei?', body: 'Ją pažįsti gerai, bet idėjų vis tiek trūksta.' }],
  senelis: [
    { title: 'Senelis sako, kad jam nieko nereikia?', body: 'Tada dovanos ieškai ilgiau nei bet kam kitam.' },
    { title: 'Ką padovanoti seneliui?', body: 'Jam nereikia dar vienos smulkmenos lentynai.' },
  ],
  pora: [
    { title: 'Viena dovana dviem žmonėms?', body: 'Norisi, kad ja džiaugtųsi abu, o ne tik vienas.' },
    { title: 'Ką padovanoti porai?', body: 'Dovana turi tikti abiem, todėl rinktis sunkiau.' },
  ],
  vyras: [{ title: 'Ką padovanoti vyrui?', body: 'Jis viską nusiperka pats, todėl sugalvoti sunku.' }],
  moteris: [
    { title: 'Ką padovanoti jai šiemet?', body: 'Moteriai, kuri turi beveik viską, sugalvoti dovaną sunku.' },
    { title: 'Ką padovanoti moteriai šiemet?', body: 'Ji turi beveik viską, todėl sugalvoti, ką padovanoti, nėra lengva.' },
  ],
  draugas: [{ title: 'Ką padovanoti draugui?', body: 'Jį pažįsti gerai, bet idėjų vis tiek trūksta.' }],
  kolega: [
    { title: 'Slaptasis Senelis darbe?', body: 'Reikia dovanos kolegai, kurio beveik nepažįsti.' },
    { title: 'Ką padovanoti kolegai?', body: 'Reikia mažos dovanos, bet ne visai beasmenės.' },
  ],
  paauglys: [{ title: 'Ką padovanoti paaugliui?', body: 'Jam sunku įtikti, o klausti nesinori.' }],
  vaikas: [{ title: 'Ką padovanoti vaikui?', body: 'Jam greitai viskas nusibosta, todėl rinktis sunkiau.' }],
  dekoracijos: [
    { title: 'Dekoracijos, kurios nepabosta?', body: 'Kasmet perki naujų, o po švenčių jos vėl atsiduria dėžėje.' },
  ],
  biudžetas: [
    { title: 'Gera dovana už nedidelę sumą?', body: 'Biudžetas ribotas, bet dovana vis tiek turi atrodyti apgalvota.' },
  ],
  'paskutinė minutė': [
    { title: 'Kalėdos jau rytoj, o dovanos dar nėra?', body: 'Laiko liko mažai, todėl rinktis reikia greitai.' },
    { title: 'Prisiminei dovanas paskutinę minutę?', body: 'Pirmiausia patikrink, ar siuntinys dar spės atkeliauti iki švenčių.' },
  ],
  atstumas: [
    { title: 'Kaip nudžiuginti žmogų kitame mieste?', body: 'Kai negali įteikti dovanos pats, ji turi keliauti paštu.' },
  ],
  'nauji namai': [{ title: 'Ką padovanoti į naujus namus?', body: 'Dar nežinai jų skonio, todėl rinktis sunkiau.' }],
  rinkinys: [{ title: 'Viena dovana ar kelios mažos?', body: 'Kartais kelios smulkmenos kartu pasako daugiau.' }],
  pledas: [{ title: 'Ieškai jaukios dovanos?', body: 'Nori, kad ji primintų šiltus vakarus namuose?' }],
  termosas: [{ title: 'Daug laiko praleidi kelyje?', body: 'Žiemą karšta kava kelionėje labai praverčia.' }],
  žvakė: [{ title: 'Ieškai jaukios dovanos vakarui?', body: 'Kartais užtenka šviesos ir ramaus vakaro namuose.' }],
  puodelis: [{ title: 'Dovana rytinei kavai?', body: 'Kai diena prasideda nuo kavos, tokia smulkmena praverčia.' }],
  kojinės: [{ title: 'Šilta dovana žiemai?', body: 'Kartais paprasčiausia dovana būna pati praktiškiausia.' }],
}

export const KALEDU_GENERIC_HOOKS: Array<{ title: string; body: string }> = [
  { title: 'Vis dar be dovanos?', body: 'Sąrašas ilgėja, o šventė vis arčiau.' },
  { title: 'Nežinai, ką padovanoti?', body: 'Idėjų daug, bet nė viena netinka iki galo.' },
]

/** Validated Christmas hook for the theme subject; falls back to generic gift hooks. */
export function pickKaleduSubjectHook(
  themeText: string,
  prior: Array<{ title?: string; body?: string; text?: string }> = [],
  allowed: KaleduCatalogProduct[] = [],
): { title: string; body: string } {
  let subjects = KALEDU_THEME_SUBJECTS.filter((row) => row.theme.test(themeText)).map((row) => row.label)
  if (/slapt/iu.test(themeText)) subjects = ['kolega', ...subjects.filter((label) => label !== 'kolega' && label !== 'senelis')]
  const byFreshness = (hooks: Array<{ title: string; body: string }>) =>
    rankByLedgerFreshness(hooks.map((h) => `${h.title}\n${h.body}`)).map((key) => {
      const [title, body] = key.split('\n')
      return { title, body }
    })
  const kit = findKaleduThemeKit(themeText)
  const ranked = [
    ...byFreshness(kit?.hooks || []),
    ...byFreshness(subjects.flatMap((label) => KALEDU_SUBJECT_HOOKS[label] || [])),
    ...byFreshness(KALEDU_GENERIC_HOOKS),
  ]
  const ok = ranked.find((hook) => {
    if (isDuplicateSlideCopy(hook.title, hook.body, prior)) return false
    if (kaleduDeterministicQa([{ ...hook, role: 'hook' }], { theme: themeText, allowed }).length) return false
    try {
      assertShipableLtSlide({ ...hook, role: 'hook' })
      return true
    } catch {
      return false
    }
  })
  return ok || KALEDU_GENERIC_HOOKS[0]
}

export function buildFallbackHook(
  themeHook: string,
  themeBody: string,
): { title: string; body: string } {
  if (isChristmasGiftsNiche()) return pickKaleduSubjectHook(`${themeHook} ${themeBody}`)
  const seedTitle = expandBareHookTitle(
    sanitizeLtSeasonCopy(stripSeasonFiller(themeHook) || themeHook).trim(),
  )
  const tavoFallback = 'Ar kasdienis maistas vis dar atrodo kaip užduotis?'
  const christmasFallback = 'Ar vis dar ieškai kalėdinės dovanos?'
  const candidates = [
    seedTitle,
    themeHook.trim(),
    isChristmasGiftsNiche() ? christmasFallback : tavoFallback,
  ]
  let title = ''
  for (const candidate of candidates) {
    const clipped = clipHookTitle(demoteLtTitleCase(candidate), TITLE_MAX)
    if (!clipped || isInvalidHookTitle(clipped)) continue
    try {
      assertShipableLtSlide({ title: clipped, body: '', role: 'hook' })
      title = clipped
      break
    } catch {
      continue
    }
  }
  if (!title) title = 'Ar kasdienis maistas vis dar atrodo kaip užduotis?'

  const bodyCandidates = [
    sanitizeLtSeasonCopy(stripSeasonFiller(themeBody) || '').trim(),
    pickSlotHookBody(`${themeHook} ${themeBody}`, 0, isChristmasGiftsNiche() ? KALEDU_HOOK_BODY_OPENERS : undefined),
    'Tokia diena kartojasi dažniau, nei norėtum. Vakare vėl svarstai tą patį klausimą.',
    'Būtent tada pasirinkimas tampa sunkesniu, nei turėtų būti.',
  ]
  let body = ''
  for (const candidate of bodyCandidates) {
    if (candidate.length < 28) continue
    const finalized = finalizeHookBody(
      `${themeHook} ${themeBody}`,
      candidate,
      1,
      isChristmasGiftsNiche() ? KALEDU_HOOK_BODY_OPENERS : undefined,
    )
    try {
      assertShipableLtSlide({ title: '', body: finalized, role: 'hook' })
      body = clipField(finalized, BODY_MAX)
      break
    } catch {
      continue
    }
  }
  if (!body) body = pickSlotHookBody(`${themeHook} ${themeBody}`, 2)
  return { title, body }
}

/** Last-resort slides so a chunk failure never kills the whole post. */
export function buildFallbackChunkSlides(opts: {
  roles: string[]
  slideStart: number
  topic: string
  themeHook: string
  themeBody: string
  defaultCta: string
  prior: Array<{ role: string; text: string }>
}): UgcStorySlide[] {
  const out: UgcStorySlide[] = []
  const prior: Array<{ title?: string; body?: string; text?: string }> = opts.prior.map((p) => ({
    text: p.text,
  }))

  for (let i = 0; i < opts.roles.length; i++) {
    const role = opts.roles[i]
    const id = `slide-${opts.slideStart + i}`
    if (role === 'hook') {
      const hook = buildFallbackHook(opts.themeHook, opts.themeBody)
      out.push({ id, title: hook.title, body: hook.body, role })
      prior.push({ title: hook.title, body: hook.body })
      continue
    }
    if (role === 'close' || role === 'punch') {
      const body = buildFallbackCloseBody(opts.topic, prior)
      out.push({ id, title: '', body, cta: opts.defaultCta || ugcActiveCta(), role: 'close' })
      prior.push({ body })
      continue
    }
    const body = buildFallbackSupportBody(role, prior, `${opts.topic} ${opts.themeHook}`, prior.length)
    out.push({ id, title: '', body, role })
    prior.push({ body })
  }
  return out
}
