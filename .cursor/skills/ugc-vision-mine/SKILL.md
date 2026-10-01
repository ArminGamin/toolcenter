---
name: ugc-vision-mine
description: >-
  Mine D:\ugc-batch-vision (or output/ugc-audit) after a UGC batch: read audit
  finals, captions, quality scans, pc-logs, and batch meta; cluster LT failures;
  propose fortress deltas (phrase bank, shipable gates, captions, hooks). Use when
  the user finishes a vision/audit batch, mentions ugc-batch-vision, COMPLETE.md,
  or asks to review shipped UGC slides for typos/grammar.
---

# UGC vision mine

## When to run

After a batch lands under `D:\ugc-batch-vision\` (or legacy `output/ugc-audit/`) and `SESSION.json` shows `active: false` / `COMPLETE.md` exists.

## Read order

1. `audit/SESSION.json` — which posts ok/fail
2. Each `audit/post-NN/`:
   - `06-final-slides.json` (shipped copy)
   - `08-quality-scan.json` (what scanner saw)
   - `07-caption.txt` / `07-caption.json`
   - `09-error.json` if fail
   - raw `02-ollama-calls/` only if needed for root cause
3. `batch/Batch_*/Post NN/` — PNGs + `meta.json` + `caption.txt`
4. `pc-logs/server.jsonl` — retries / dup deaths

## Extract

For every shipped slide, quote exact bad LT:
- Invented stems
- We-forms / aš / Galėčiau / Pradėjau
- `pats(i)` / gender swings
- Stump closes / hook-echo closes
- Missing `?` on Ar/Kodėl
- Thin captions (`- savaitės planas` bolt-on)
- Em dashes
- `galimi` / `jaučiat` / first-person residue after normalization
- Caption P1 that does not match the actual slide hook
- False-positive gibberish gates (valid finite verb omitted from cue list)
- Theme drift into generic season/heat filler

Compare to `08-quality-scan` — note scanner blind spots.

## Deliver

**Mandatory triage lanes** — run `npx tsx scripts/triage-ugc-audit.ts [audit-root]` first; read `audit/TRIAGE.json`. Default scans **current** `post-NN` only; `countsCurrent` is actionable. Use `--include-archive` for legacy re-scan totals (`countsLegacy`).

| Lane | Code | Action |
|------|------|--------|
| A | `gate_generalize` | Extend case-checker, declarative detector, paraphrase fingerprint, circular_claim — **not** new `PHRASE_FIXES` string |
| B | `rule_class` | Add to `UGC_LT_CLARITY_GUARDRAILS_BLOCK` + prompt sync |
| C | `copy_quality` | Hook genericness, weak CTA — **no gate**; ledger/human review |
| S | `semantic` | Circular/empty logic, testimonial register, early brand, meaningless causal claims — **Gemini judge rubric** in `ugc-qa-client.ts`, never a new `LT_BAD_STEMS` ticket |

**Forbidden forever:** inventing `PHRASE_FIXES` / `LT_BAD_STEMS` entries for semantic emptiness ("Stresas sukelia stresą"), first-person testimonials, or early brand via novel phrasing. Those go to Gemini semantic QA + structural class detectors.

Also use installed skills when reviewing: `.agents/skills/copy-editing`, `.agents/skills/content-quality-auditor`, Cursor `copywriting`, SMS `hook-writer-sms`.

Only after triage:

1. Ranked failure patterns (per lane; semantic → lane S)
2. Concrete fixes — prefer lane A generalized gates / Gemini rubric over `PHRASE_FIXES` one-offs
3. Diffs in `server/ugc-lt-normalize.ts`, `server/ugc-story-engine.ts`, `server/ugc-qa-client.ts`, `server/ugc-caption-format.ts`, `server/ugc-batch-audit.ts`
4. Table-driven test cases from exact quotes
5. Do not stop at a summary — ship fortress code when the user asks to implement
