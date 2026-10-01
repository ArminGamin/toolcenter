# Audit Fix 10 — Risk Parsing and SOL/XRP Whale Coverage

Implemented against the current source on 2026-07-18. This document records actual behavior, not assumptions from earlier audit notes.

## Item 1 — Missing or malformed `sizeHint` fails closed

**Files touched:** `server/markets-portfolio.ts`; `server/__tests__/desk-fail-closed.test.ts`; `FEATURES.md`.

**Found:** `parseEquityRiskPctFromSizeHint()` returned `DEFAULT_EQUITY_RISK_PCT` (0.75) for absent or unparseable text. `riskContributionFromPlaybook()` then treated a 1% stop with no `sizeHint` as `0.75 × (1 / 1) = 0.75`, despite the intended equity-risk input being unknown. Unknown stop distance already returned `0.75 × 10 = 7.5`.

**Changed (behavior change):** missing or malformed `sizeHint` now returns `UNPARSEABLE_SIZE_HINT_EQUITY_RISK_PCT = 7.5`, exactly the existing unknown-stop penalty. This is deliberately a portfolio-budget charge, not an assertion that the trade risks 7.5% of equity: it makes unverifiable sizing fail closed and prevents it from receiving the normal 0.75% desk target.

For the same long ticket with `riskPct: 1`:

- Before, missing `sizeHint`: `0.75 × (1 / 1) = 0.75` contribution.
- After, missing/malformed `sizeHint`: `7.5 × (1 / 1) = 7.5` contribution.

**Verify:** the Fix 8 test group now asserts both missing and malformed `sizeHint` yield 7.5 and are greater than 0.75. `npx vitest run` passed: 2 files, 19 tests.

## Item 2 — `size` versus `sizeHint`

**Files touched:** `FEATURES.md`; `src/components/MarketsPanel.tsx`.

**Found:** these are the same user-facing concept under different names, not two inputs:

- **`sizeHint` (actual field):** `DeskPlaybook.sizeHint: string` in `server/markets-desk.ts`. The desk generator originates it as text such as `Risk 0.5–0.75% equity · hard stop · scale 50% at T1`; the risk formula parses this text.
- **`Size` (old documentation/UI label):** the `FEATURES.md` ticket anatomy and `MarketsPanel.tsx` UI label for the same `playbook.sizeHint` field. No separate `size`, `positionSizePct`, or quantity field exists in the desk playbook.

**Changed (display/documentation behavior):** the UI label is now **Equity risk**, and FEATURES explicitly states that `sizeHint` is intended account-equity risk text rather than a second numeric position-size field. The formula continues to use `sizeHint`, which is the only available field and therefore the correct current input.

**Verify:** inspect `DeskPlaybook.sizeHint`, the playbook generator, and the Equity risk display in `MarketsPanel.tsx`; a repository search finds no separate playbook `size` field.

## Item 3 — Wide stops versus the 2.0 portfolio cap

**Files touched:** none. `maxAggregateRiskPct` remains 2.0.

**Found:** the current formula is:

`riskContribution = equityRiskPct × (stopDistancePct / 1.0)`

A single ticket must have contribution at or below 2.0 before any other armed-ticket risk is considered. Therefore:

`maximum stopDistancePct = 2.0 / equityRiskPct`

- Typical immediate desk hint `0.5–0.75% equity` is parsed at the conservative upper bound, 0.75. Its threshold is `2.0 / 0.75 = 2.6667%`; any stop wider than about **2.67%** can never arm under the aggregate cap.
- The lower end of that range, 0.5, has a **4.0%** threshold.
- The wait-mode `≤0.4% equity` hint has a **5.0%** threshold.

**Resolved — decision (a), unchanged at 2.0:** wide-stop setups remain intentionally excluded. The hit-rate log still has near-zero real data and requires n≥30 resolved outcomes before calibration; this phase is tight caps plus observation, not maximum throughput. No cap code was changed.

**Verify:** no portfolio-cap code or default was edited in this fix.

## Item 4 — SOL and XRP on-chain whale coverage

**Files touched:** `server/markets-whales.ts`; `server/__tests__/whales-13f.test.ts`; `FEATURES.md`.

**Found:** BTC, ETH, and BNB had live fetches, while SOL and XRP always fell through to the unsupported stub. The desk already treats the whale factor as confirmation-only at 0.25 weight and does not pass it to a strict-law arm path.

**Changed (coverage behavior):**

- **SOL:** uses Solana's public mainnet JSON-RPC (`https://api.mainnet.solana.com`). It retrieves one confirmed block and extracts top-level native SOL System Program `transfer` instructions. Default threshold: **50,000 SOL**.
- **XRP:** uses XRPScan's public validated-ledger feed (`https://api.xrpscan.com/api/v1/ledger/validated/transactions`). It extracts successful native-XRP `Payment` transactions. Default threshold: **1,000,000 XRP**.
- Both chains use the existing deposit/withdrawal/internal classification. SOL has two publicly explorer-labelled Binance hot wallets in the local label set. XRP uses documented local Binance/Coinbase wallets and recognizes known CEX names supplied by XRPScan transaction labels. CEX-to-CEX remains excluded; wallet-to-CEX is deposit (sell-pressure context); CEX-to-wallet is withdrawal (accumulation context).
- `DEFAULT_WHALE_THRESHOLDS` and persisted `whale-config.json` seeding now include `SOL` and `XRP`.
- Both chains are returned under the existing `onchain_whales` health source; there is intentionally no duplicate registry entry. A successful batch that includes SOL/XRP therefore contributes to the same source-health status.
- The new tests assert the three-way `exchange_internal` / `exchange_deposit` / `exchange_withdrawal` split for both SOL and XRP.

**Coverage limitation (not equivalent to BTC/EVM):** the no-key SOL RPC scan sees one sampled confirmed block and only top-level native SOL transfers; it does not provide a global indexed large-transfer feed or broad public exchange labels. XRPScan provides recent validated-ledger transactions and some labels, but labels are incomplete and no-key feed depth is bounded. These are useful confirmation signals only, not comprehensive whale surveillance. The existing 0.25 confirmation weight and no-arm-path treatment are unchanged.

**Verify:** the public endpoints responded during implementation (`getSlot` on Solana RPC: HTTP 200; XRPScan latest-ledger endpoint: HTTP 200). Unit coverage passed in `npx vitest run`: 2 files, 19 tests.

## Item 5 — 13F `none` / 50 self-check

**Files touched:** none.

**Plain-language restatement:** when the bounded EDGAR scan finds a manager's current 13F holding but has not also obtained that same manager's comparable prior filing for the same security, the system does not guess whether the manager bought more, sold, or held steady. It records the change as `none` and assigns the neutral 50 score. “None” means **comparison unavailable**, not “the manager has no position” and not “the manager made no change.”

**Verify:** `markets-13f.ts` explicitly sets `change` to `none` because no prior manager filing is parsed in the bounded scan, and the test confirms `score13fChange('none') === 50`.

## Final self-check

- Item 3 is resolved — decision (a), `maxAggregateRiskPct` remains 2.0.
- SOL/XRP coverage is implemented but materially weaker than indexed/label-rich feeds, as documented above.
- The SOL path handles top-level native System Program transfers only; SPL-token movement and inner instructions are not covered.
- No vault/auth code, hit-rate logging internals, or unrelated defaults were changed.

