# Audit Fix 11 — SOL Coverage and Desk Clarity

Implemented against the current source on 2026-07-18. This document distinguishes actual changes from known limitations.

## Portfolio cap decision

**Files touched:** `FEATURES.md`; `AUDIT-FIX-10.md`.

**Found:** the source default and the current `D:\toolsai\.control-center-data\desk-portfolio.json` both set `maxAggregateRiskPct` to **2.0**.

**Changed:** the former “awaiting user choice” note is now **resolved — decision (a), unchanged at 2.0**. The cap was not raised or otherwise modified.

**Reasoning:** the hit-rate log remains near-zero real data and needs at least n≥30 resolved outcomes per rule-set. This phase is tight caps plus observation, not maximum throughput.

**How to verify:** inspect `server/markets-portfolio.ts` (default 2.0) and `D:\toolsai\.control-center-data\desk-portfolio.json` (`maxAggregateRiskPct: 2`).

## Item 1 — SOL whale sampling cursor

**Files touched:** `server/markets-whales.ts`; `server/__tests__/whales-13f.test.ts`; `FEATURES.md`.

**Found:** SOL requested `getSlot`, then fetched exactly that one confirmed block. There was no cursor, so all confirmed blocks between desk refreshes were absent from the confirmation signal.

**Changed (coverage behavior):**

- Added an in-memory `lastProcessedSolSlot` cursor.
- First SOL poll establishes the live cursor by scanning the current confirmed block. Later polls scan strictly from `lastProcessedSolSlot + 1` through the current confirmed slot; completed slots are not reprocessed.
- Set `SOL_MAX_BLOCKS_PER_POLL = 24`. The SOL cache is reduced to 8 seconds when SOL is requested, so a normal interval is expected to remain within 24 slots while keeping the no-key public RPC request burst bounded (one `getSlot`, then at most 24 sequential `getBlock` calls).
- When the cursor gap exceeds 24 slots, the oldest range is deliberately skipped and a note states the exact slot range/count. This is not silently represented as complete coverage.
- If an individual block fetch fails, the cursor stops at the last successfully processed slot and the summary says which block failed; the next poll retries from that cursor.
- The SOL whale summary/factor/proof line now carries the cursor progress or explicit sampling-gap note.

**Two-poll example:** if poll 1 completes slot 100, `lastProcessedSolSlot` becomes 100. If poll 2 sees current slot 103, it scans `[101, 102, 103]`; slot 100 is not reprocessed. If poll 2 instead sees slot 140, it explicitly logs that slots 101–116 (16 slots) were skipped and resumes scanning 117–140.

**SPL tokens:** intentionally skipped. The default watchlist is native assets, while correct SPL support needs parsed inner instructions plus a maintained mint→symbol allowlist. That complexity is not justified for a confirmation-only factor and would not improve an arm path. Native top-level SOL System Program transfers remain the documented coverage.

**Health/coverage limitation:** no-key public SOL RPC can still lag, rate-limit, or return an unavailable confirmed block. Cursor gaps are now visible, but this is still not an indexed global transfer feed and exchange labels remain thin. The existing `exchange_internal` filter, deposit/withdrawal classification, and 0.25 whale confirmation weight are unchanged.

**How to verify:** run `npx vitest run`; the cursor tests cover no-reprocess (`100 → 103` scans `101..103`) and explicit gap skip (`100 → 140`, batch 24). With the desk live, inspect SOL’s whale factor/proof for `SOL cursor through...` or `SOL sampling gap...`.

## Item 2 — Desk clarity

**Files touched:** `server/markets-desk.ts`; `server/markets-outcomes.ts`; `src/lib/markets.ts`; `src/components/MarketsPanel.tsx`; `FEATURES.md`.

**Found:** the desk already had factor `confirmationOnly`/`tier` metadata, existing outcome/hit-rate storage, account-equity portfolio configuration, and human-readable rule/portfolio reasons. Tickets did not expose a coherent short explanation, a ticket-level risk line, a persistent data-quality statement, or a lightweight outcome view.

**Changed (presentation/API behavior):**

1. **Plain-English ticket summary:** server-generated `plainSummary` uses required, passed primary laws and explicitly says that context-only factors did not drive the call. Example layout directly beneath the directive: `BUY — driven by multi-venue Δ flow + taker confirms aggression. On-chain whale flow, Lead account fills context did not drive this call.`
2. **Primary vs context factors:** Advanced view shows `Primary signal` first. Confirmation factors (whales, Form 4, 13F, OKX leads) are in a muted `<details>` group titled `Context only — cannot arm alone`, collapsed by default.
3. **Persistent data-quality banner:** above desk tickets: `This desk has armed N tickets total. Odds shown are not statistically meaningful until 30+ resolved outcomes per rule-set — currently n; showing heuristic edge only.` N comes from actual outcome rows, and n/rate comes from the existing law-set hit-rate query. Once n≥30 produces a real rate, the text switches to the real outcome statement.
4. **Ticket dollar risk:** server-generated `riskLabel` uses the existing stop-weighted portfolio helper. With a configured account it reads, for example, `Risking ~$210 of $30,000 (0.70%) if this arms.` Without it, it reads `Risk unit: 0.70% of equity if this arms — set account size for $.` It does not alter the risk formula.
5. **Why WATCH/blocked:** the first required failed law is shown directly below the risk line under `Why watch / blocked`, preserving existing source-stale, place-by, and portfolio reason text. Example: `Venue flow sources fresh: FLOW law blocked: multi-venue source stale`.
6. **Track record:** the existing JSONL outcome data is surfaced as `Recent armed tickets`, showing symbol, direction, arm time, and status (`hit t1`, `hit t2`, `stopped`, `expired`, or `open`).
7. **Simple/Advanced toggle:** Simple is the default and persists as `cc-markets-desk-view` in localStorage. It keeps the directive, summary, risk, and block reason. Advanced restores the current detailed ticket information, including laws, playbook, proof, and factors.

**Behavior change flagged:** this modifies desk payload/display fields and the default visual density only. It does not change strict-law arm decisions, hit-rate logging rules, outcome resolution, vault/auth, portfolio formula, or the maximum aggregate cap.

**How to verify:** open Markets → News → Desk. Confirm Simple is selected by default, switch to Advanced, reload, and confirm the choice persists. Set an account size under Watchlist to see the dollar ticket risk. Inspect a locked ticket for its inline failure reason and an advanced ticket for the collapsed context-only factor group. Existing outcome rows appear in the track-record list.

## Tests and typecheck

- `npx vitest run` — passed: 2 files, 21 tests.
- `npx tsc -b --pretty false` — passed.

## Final self-check

- SOL cursor is intentionally in-memory: an application restart starts with one current confirmed block rather than backfilling an unbounded downtime range. A runtime lag over 24 slots is explicitly surfaced as a gap.
- SPL-token and inner-instruction transfers are not covered, by deliberate scope decision above.
- Free public RPC and sparse exchange labels still make SOL materially less complete than an indexed paid feed.
- The local portfolio config was confirmed at 2.0; no cap change was made.
- No vault/auth, hit-rate logging internals, or strict-law arm gates were changed.
