---
name: kaledu-lt-copy
description: Lithuanian (lt-LT) copy rules for Kalėdų Kampelis UGC — load before generating, reviewing, or changing the rules for UGC slide copy, prompts, fallback lines, catalog lines, or the Lithuanian QA gates. Includes the authoritative VLKK grammar checklist.
---

# Kalėdų Kampelis — Lithuanian copy

## Authority

Use `references/lithuanian-grammar-vlkk.md` as the authoritative grammar checklist for Lithuanian generation and QA. When a sentence involves verb government, participles, or a construction that may be a calque, check this reference before approving it. Do not invent grammar rules from intuition when the reference covers the case. If the local reference is insufficient, consult VLKK (vlkk.lt/konsultacijos) / E. Kalba (ekalba.lt/kalbos-patarimai) and add the verified rule, with its source, to the reference.

Source priority: VLKK → E. Kalba *Kalbos patarimai* → normative dictionaries → usage (naturalness only) → intuition.

## Classifying findings (reference §13, §16)

- **hard_error** — conflicts with a clear normative rule. Only high-confidence hard errors may block a post or justify a deterministic gate.
- **naturalness** — grammatical but translated-sounding or unnatural. Rewrite the whole phrase, not one word.
- **style** — both variants are acceptable. Never report as an error; never turn into a gate.

Do not overcorrect: several normative variants can exist (e.g. `prašyti ką` / `prašyti ko`).

## Checks for every sentence

1. Verb government — which case does the Lithuanian verb require (`atitikti ką`, not `kam`)? Never copy the case from English.
2. Calques — `kalba eina apie`, `vardan ko`, mechanical `pas`, English participle chains (`sukurtas padėti…`). Translate meaning, not structure.
3. Participles — name the performer of every action. A pusdalyvis (`-damas/-dama`) needs the same subject as the main verb; otherwise use a padalyvis or a `kai…` clause. For UGC prefer finite clauses.
4. Natural word order; drop a `tu` the verb already expresses unless it is emphatic.
5. Read it aloud: „Ar normalus lietuvis taip pasakytų garsiai?“

## Brand voice

- Speak to one reader as **tu**. No aš / mes / jūs forms.
- Mix of warm-casual and clear: short complete sentences, one idea each, no reklamos poezija (magija, siela, nepakartojama, ramybės oazė).
- Gender-neutral toward the reader: no `ieškodama / ieškodamas` addressed to the reader; prefer `kai ieškai`.
- **Emojis:** about **2 per post** (title + body + CTA together), only from the iPhone-style Apple set rendered by the app (`src/lib/ugc-apple-emoji-assets.ts`, intent map in `server/ugc-kaledu-emoji.ts`). An emoji must match the sentence's emotion.
- Story: hook (problem) → context → answer / product with a reason → payoff + CTA. Questions only on slides 1–2.
- Every product slide names the product **and** says why it fits, using only catalog claims.

## Where the rules live in code

- Model prompts: `server/ugc-copy-skill.ts` (`UGC_KALEDU_*`), chunk prompt `server/ugc-story/batch-llm.ts`.
- Deterministic gates: `server/ugc-kaledu-final-qa.ts`, phrase repairs `server/ugc-lt/phrase-fixes.ts`, story arc `server/ugc-story/arc-guard.ts`.
- Fallback lines: `server/ugc-story/fallbacks.ts`, catalog lines `server/ugc-kaledu-catalog.ts` — every new line must pass the existing pool tests.
- Check results: `npx tsx scripts/scan-kaledu-arc.ts` (logs) and `npx tsx scripts/verify-kaledu-arc-live.ts` (live posts).

When you add a rule to the model or the gates, cite the section of the reference (or the VLKK / E. Kalba page) it comes from.
