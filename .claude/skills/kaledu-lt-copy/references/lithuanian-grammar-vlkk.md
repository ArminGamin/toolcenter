# Lithuanian Grammar Reference for AI Copy Generation

**Purpose:**  
Use this file as a compact normative checklist when generating or reviewing Lithuanian (`lt-LT`) copy.

**Primary authority:** Valstybinė lietuvių kalbos komisija (VLKK)  
**Supporting authoritative resource:** Lietuvių kalbos instituto E. KALBA → *Kalbos patarimai*

This file is intentionally conservative. It does **not** try to replace the full VLKK consultation database or *Kalbos patarimai*. If a construction is not clearly covered here, do not invent a rule from English, Russian, or stylistic intuition. Check the official sources.

---

# 1. GENERAL RULE FOR AI-GENERATED LITHUANIAN

Lithuanian copy must sound as if it was originally written in Lithuanian.

Do not preserve foreign-language syntax merely because a literal translation is grammatically understandable.

When reviewing a sentence, check:

1. Is the construction natural in Lithuanian?
2. Is the verb governing the correct case?
3. Is a foreign calque being copied literally?
4. Is the participle / pusdalyvis / padalyvis attached to the correct performer?
5. Is there a simpler native Lithuanian construction?
6. Would a Lithuanian speaker naturally phrase the idea this way?

Prefer a natural Lithuanian rewrite over a word-for-word translation.

---

# 2. CALQUES / NETEIKTINI VERTINIAI

## Core rule

Avoid literal foreign-language constructions when Lithuanian has an established native equivalent.

A sentence can be understandable and still be poor Lithuanian if its structure has been mechanically copied from another language.

Typical sources of interference in generated copy:

- English
- Russian
- Polish
- international marketing language
- literal machine translation

Do not translate phrase-by-phrase. Translate the **meaning**.

---

## Common patterns to watch

### `kalba eina apie`

Avoid:

> Kalba eina apie dovanos pasirinkimą.

Prefer:

> Kalbama apie dovanos pasirinkimą.

or, depending on context:

> Čia kalbame apie dovanos pasirinkimą.

The construction should be rewritten naturally rather than mechanically preserved.

---

### `vardan ko`

In ordinary modern prose, avoid using **vardan ko** as a mechanical equivalent of *for the sake of / ради* when a normal Lithuanian construction with **dėl** or another native expression is intended.

Example:

Avoid:

> Vardan patogumo pakeitėme dizainą.

Prefer:

> Dėl patogumo pakeitėme dizainą.

Source note: *Kalbos patarimai* marks inappropriate uses of `vardan ko` and gives alternatives such as `dėl ko`.

---

## Translation test

When a phrase looks suspicious, ask:

> „Ar lietuviškai ši mintis būtų pasakyta taip pat, jei originalo anglų ar rusų kalba nebūtų?“

If not, rewrite the whole phrase.

Do **not** only replace one word while leaving the foreign sentence structure intact.

---

# 3. VERB GOVERNMENT / LINKSNIŲ VALDYMAS

## Core rule

The case required by a Lithuanian verb must be determined by **Lithuanian government**, not by the case or preposition used in English or another language.

Never infer:

- accusative,
- genitive,
- dative,
- instrumental,
- or a prepositional construction

from the source language.

When uncertain, check the verb in the VLKK Consultation Bank or *Kalbos patarimai*.

---

## `atitikti`

Use:

> atitikti **ką**

Do not use the dative for the object.

Correct:

> Produktas atitinka reikalavimus.

Incorrect:

> Produktas atitinka reikalavimams.

VLKK explicitly lists `atitikti kam` as an incorrect use of the dative for the object.

---

## `prašyti`

Both constructions can be normative depending on the sentence:

> prašyti **ką**

and

> prašyti **ko**

VLKK gives them as equivalent norm variants in constructions such as:

> Prašyti žmogų / žmogaus, kad jis ką nors padarytų.

Do not automatically “correct” every `prašyti ką` into `prašyti ko`, or vice versa.

Check the actual construction.

---

## Do not insert `pas` mechanically

Avoid foreign-influenced constructions such as:

> prašyti pas direktorių

when the intended meaning is asking the director.

Prefer:

> prašyti direktorių

or:

> prašyti direktoriaus

depending on the construction.

Likewise, do not use `pas` as a general replacement for relations that Lithuanian normally expresses with another case or preposition.

---

## Practical verb-government QA

For any sentence containing an important verb + noun phrase:

1. identify the verb;
2. identify the object/complement;
3. determine which case Lithuanian requires;
4. check VLKK when uncertain;
5. never assume the source-language construction transfers directly.

Especially review:

- verbs followed by abstract nouns;
- verbs translated from English phrasal constructions;
- verbs translated from Russian;
- verbs followed by `į`, `ant`, `pas`, `su`, `dėl`, `apie`;
- sentences where dative and accusative compete;
- sentences where genitive and accusative compete.

---

# 4. PARTICIPLES / DALYVIAI

Lithuanian has a rich system of non-finite verb forms. AI-generated Lithuanian often overuses them or maps English participial constructions too literally.

Primary forms relevant to QA:

- **dalyvis**
- **pusdalyvis**
- **padalyvis**

Do not treat these as interchangeable.

---

# 5. PUSDALYVIS

## Core rule

A **pusdalyvis** normally expresses a secondary action performed by the **same subject / performer** as the main action.

Example:

> Eidamas namo, jis paskambino draugui.

`jis` both:

- was walking home;
- called his friend.

The performer is the same.

---

## Wrong-subject warning

Do not attach a pusdalyvis to a noun that is not actually performing that secondary action.

Bad logical structure:

> Eidamas namo, prasidėjo lietus.

This incorrectly makes it appear that *lietus* was walking home.

Rewrite:

> Man einant namo, prasidėjo lietus.

or:

> Kai ėjau namo, prasidėjo lietus.

---

# 6. PADALYVIS

## Core rule

A **padalyvis** is typically used when the secondary action has a **different performer** from the main action, or when the secondary action is impersonal.

Example:

> Man einant namo, pradėjo lyti.

The person walking and the grammatical subject/structure of the main action are not the same.

---

## AI warning

Do not convert every English:

> while doing...
> after doing...
> when doing...

into a Lithuanian pusdalyvis.

Determine first:

- who performs the secondary action?
- who performs the main action?

If the performers differ, a padalyvis or a full subordinate clause may be required.

When the structure becomes awkward, prefer a clear subordinate clause:

> kai...
> kol...
> nors...
> todėl kad...
> po to, kai...

Naturalness is more important than forcing a participial construction.

---

# 7. DALYVIS

## Core rule

A **dalyvis** behaves partly like a verb and partly like an adjective.

It can describe a person or thing through an action or state.

Examples:

> skaitantis žmogus  
> parašytas laiškas  
> atvykę svečiai

The participle must agree appropriately with the noun it describes.

---

## Active vs passive meaning

Check whether the noun:

- performs the action → usually an active meaning;
- receives / undergoes the action → usually a passive meaning.

Do not mechanically reproduce an English `-ing` or `-ed` form.

Translate the relationship, not the morphology.

---

# 8. TIME RELATION IN PARTICIPIAL CONSTRUCTIONS

Pay attention to when the participial action occurs relative to the main verb.

Do not use a past participial form to imply a later action merely because an English source uses a compressed participial phrase.

If the sequence of actions matters, make it explicit.

Prefer:

> Baigęs darbą, jis išėjo.

when the completion clearly precedes the main action.

When the action actually happens later, rewrite the sentence with finite verbs instead of forcing a participle.

---

# 9. PREFER FINITE CLAUSES WHEN THEY ARE CLEARER

Lithuanian permits participial constructions, but they should not be used simply to make text sound formal.

AI often produces sentences that are technically parseable but unnaturally compressed.

Instead of:

> Pasirinkus dovaną esančią tinkamą gavėjui galima sutaupyti laiko.

Rewrite clearly:

> Pasirinkus gavėjui tinkamą dovaną, galima sutaupyti laiko.

Or, if clearer:

> Kai išsirenki gavėjui tinkamą dovaną, sutaupai laiko.

For UGC, advertisements, captions and conversational copy, a normal finite sentence is often better.

---

# 10. ENGLISH-STYLE PARTICIPLE CALQUES

Closely inspect constructions translated from patterns such as:

- designed to...
- made for...
- helping you...
- giving you...
- allowing you to...
- making it easier to...
- created with...
- inspired by...
- being...
- having...

Do not automatically create a Lithuanian participial chain.

Example:

Literal / stiff:

> Sukurtas padedantis tau lengviau rasti dovaną įrankis.

Natural:

> Įrankis, padedantis lengviau rasti dovaną.

Even more natural in marketing copy:

> Įrankis, su kuriuo dovaną rasi lengviau.

Choose according to context.

---

# 11. NATURAL WORD ORDER

A grammatically possible word order is not automatically good copy.

AI should reject sentences that sound like translated English even when all individual words are Lithuanian.

Prefer:

> Čia rasi dovanų idėjų visai šeimai.

over a mechanically English-shaped construction such as:

> Čia tu gali rasti dovanų idėjas visai šeimai.

Avoid unnecessary pronouns such as `tu` when the verb already expresses the person and the pronoun adds no emphasis.

---

# 12. MARKETING / UGC-SPECIFIC RULE

For conversational Lithuanian:

- prefer short, complete sentences;
- prefer familiar native constructions;
- avoid bureaucratic nominalizations;
- avoid excessive participles;
- avoid literal English slogans;
- avoid unnatural noun chains;
- avoid filler introduced only because it existed in English.

A sentence should pass this test:

> „Ar normalus lietuvis taip pasakytų garsiai?“

If the answer is doubtful, rewrite it.

---

# 13. DO NOT OVERCORRECT

Normative Lithuanian often permits more than one construction.

Do not change a sentence merely because another variant also exists.

Examples:

- `prašyti ką` and `prašyti ko` can both be normative;
- stylistic preference is not automatically a grammar error;
- conversational wording is not automatically incorrect;
- a rare construction is not automatically a calque.

Classify findings as:

### HARD ERROR
Conflicts with a clear normative rule.

### STRONG NATURALNESS ISSUE
Not necessarily formally prohibited, but clearly unnatural or translation-like.

### STYLE OPTION
Both versions are acceptable; change only if it improves the requested tone.

Never report a STYLE OPTION as a hard grammar violation.

---

# 14. QA DECISION PROCESS

For every suspicious Lithuanian sentence:

```text
1. Is there a clear grammar error?
   YES -> fix it.

2. Is verb government questionable?
   YES -> check VLKK / Kalbos patarimai.

3. Is it a possible calque?
   YES -> compare the construction with native Lithuanian alternatives.

4. Is there a dalyvis / pusdalyvis / padalyvis?
   YES -> identify the performer of every action.

5. Does the participial construction create ambiguity?
   YES -> use a finite subordinate clause.

6. Is the sentence grammatically valid but unnatural?
   YES -> classify as NATURALNESS, not a hard grammar error.

7. Are multiple normative variants possible?
   YES -> do not invent a prohibition.
```

---

# 15. REQUIRED BEHAVIOUR FOR CLAUDE / LLM

When this file is loaded as a reference:

1. Treat VLKK and E. KALBA as higher authority than model intuition.
2. Do not invent Lithuanian grammar rules.
3. Do not claim a construction is forbidden unless the rule is supported.
4. Distinguish grammar errors from stylistic preferences.
5. For uncertain verb government, check the official source.
6. For suspected calques, rewrite the phrase naturally rather than performing word substitution.
7. For participial constructions, explicitly identify the performer of each action.
8. Prefer clear native Lithuanian over literal source-language syntax.
9. If confidence is low, flag the phrase for verification rather than fabricating a rule.
10. Preserve intentional colloquial style unless it creates an actual language error.

---

# 16. SUGGESTED OUTPUT FOR GRAMMAR QA

When reviewing generated text, return issues internally in this form:

```text
TYPE: hard_error | naturalness | style
CATEGORY: calque | government | participle | syntax | other
ORIGINAL: ...
PROBLEM: ...
CORRECTION: ...
CONFIDENCE: high | medium | low
SOURCE_RULE: ...
```

Only high-confidence `hard_error` findings should automatically block publication.

---

# 17. OFFICIAL REFERENCES

## Valstybinė lietuvių kalbos komisija (VLKK)

### Kalbos konsultacijų bankas
https://www.vlkk.lt/konsultacijos

Use this for specific questions about:

- verb government;
- cases;
- prepositions;
- word choice;
- individual constructions;
- normative variants.

### Neteiktini vertiniai / language recommendations
https://www.vlkk.lt/

Navigate through the language-recommendation / major-error material and search for the suspicious expression.

### Example: `atitikti`
VLKK consultation: *Kokios naudininko vartojimo klaidos?*  
The consultation states that the object of `atitikti` should not be expressed with the dative (`atitikti kam` → `atitikti ką`).

### Example: `prašyti`
VLKK consultation: *prašyti ką, ko*  
VLKK states that `prašyti ką` and `prašyti ko` can be equivalent normative variants in the relevant construction.

### Example: `pas`
VLKK consultation: *Prielinksnis pas nevartotinas*  
Includes cases where foreign-influenced `pas` constructions should be replaced by the case or construction natural to Lithuanian.

---

## E. KALBA — Lietuvių kalbos institutas

Main site:

https://ekalba.lt/

### Kalbos patarimai

https://ekalba.lt/kalbos-patarimai/

Use especially:

- **Sintaksė**
- **Linksnių vartojimas**
- **Neasmenuojamosios veiksmažodžio formos**
- **Dalyvių vartojimas**
- **Pusdalyvių vartojimas**
- **Padalyvių vartojimas**
- **Sakinio skyryba**

This is the preferred supporting reference when a rule requires more systematic explanation than a single VLKK consultation entry.

---

# 18. SOURCE PRIORITY

When references disagree or the rule is unclear, use this priority:

1. Current VLKK recommendation / consultation
2. Current E. KALBA *Kalbos patarimai*
3. Established normative dictionaries
4. Corpus / observed usage for naturalness only
5. Model intuition

Observed frequency does **not** override a clear normative rule.

---

# 19. IMPORTANT LIMITATION

This checklist is a condensed AI working reference.

It is **not** a complete grammar of Lithuanian.

Do not extrapolate a rule beyond what it actually says.

Examples in this document illustrate principles; they do not establish universal rules for every verb or syntactic environment.

When a specific construction materially affects publication quality and is not covered here, verify it in VLKK or E. KALBA.

---

# 20. ONE-LINE SYSTEM INSTRUCTION

Use the following instruction when attaching this file to an LLM:

> Use `lithuanian-grammar-vlkk.md` as the normative Lithuanian grammar QA reference. Treat VLKK and E. KALBA as authoritative; distinguish hard grammar errors from naturalness/style issues, verify uncertain verb government, reject foreign calques, and validate the performer and time relationship of every participial construction before approving Lithuanian copy.

---

# 21. VERIFIED ADDITIONS (added while maintaining the Kalėdų Kampelis pipeline)

Rules added here were checked against an official source. Each entry names it.

## `iki` in the meaning of `kol`

`iki` may be used as the conjunction meaning `kol`; the subordinate clause is separated by a comma.

> Lauk, iki aš pareisiu.

Do not "correct" such `iki` to `kol` — both are normative. `pakol` is not used; write `kol` or `iki`.

Sources: VLKK consultation *Ar vartotinas pasakymas „Jis tyli, iki baigiam dainuoti“?* — https://www.vlkk.lt/konsultacijos/5606-iki-kol ; Lietuvos apeliacinis teismas, *Kalbos patarimai teisininkams: Ar žodelis „iki“ vartotinas reikšme „kol“?* (citing VLKK).

## `su` + instrumental for the means of an action

The bare instrumental is the default for the means (`pjauk peiliu`, `nustebink dovana`), but `su` + instrumental for a means is **not** a normative error (`paimk ranka` / `su ranka`). Do not report `nustebink su dovana` as a hard error; at most rewrite it as a naturalness choice. The real error in this area is the genitive with `pagalba` (`traktoriaus pagalba` → `traktoriumi`, `su traktoriumi`).

Sources: *Lietuvių kalbos žinynas. Prielinksnių vartojimas ir reikšmė* — http://www.xn--altiniai-4wb.info/files/kalba/KJ00/Lietuvi%C5%B3_kalbos_%C5%BEinynas._Prielinksni%C5%B3_vartojimas_ir_reik%C5%A1m%C4%97.KJ1806.pdf ; V. Zubaitienė (VU), *Specialybės kalba: linksnių vartojimo klaidos* — http://web.vu.lt/flf/v.zubaitiene/files/2014/02/sintakses_klaidos.pdf

Not yet verified (treat as naturalness only, never a gate): abstract `ties` (`susikoncentruoti ties kuo` → prefer `susitelkti į ką`).

---

# 22. PIPELINE REPAIRS THAT ARE NOT VLKK RULES

The generator also applies a few deterministic repairs that are **naturalness** fixes (§13), not normative prohibitions. They must never be reported as hard grammar errors:

- `jauti kaip / tarsi / lyg X` → `jautiesi kaip X` (reflexive *jaustis* for one's own state; dictionary usage).
- `iki kol` → `kol` (doubled conjunction; `iki` alone or `kol` alone is normative — see §21).
- `jauti stresas / nerimas` → `jauti stresą / nerimą` (object of *jausti* is accusative).
- `Dovanos galite įsigyti / pirkti` → `Dovanas gali įsigyti / pirkti` (the gift is the object, accusative; the plain `galite → gali` swap alone would leave a false subject — §3).
- Audit batch30 phrases, rewritten as whole phrases for naturalness only: `parodyti savo dėmesį` → `parodyti dėmesio`, `tai išleidžia daugiau` (no agent) → `taip dažnai išleidi daugiau`, `pasirinkimas visoms šalims` (legal register) → `pasirinkimas abiem`, `jaukumo ir šviesaus komforto` → `jaukumo ir šilumos`, `filmų vakaro mėgėjams` → `filmų vakarų mėgėjams`.

If a VLKK / E. Kalba source contradicts one of these, the source wins: remove or change the repair.
