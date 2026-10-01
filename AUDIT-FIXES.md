# Money Printer Audit Fixes — Deliverable

Date: 2026-07-18  
Repo: `D:\toolsai\control-center`

This document is the Fix 1–7 report. Read it alongside the code.

---

## Fix 1 — `successPct` / Chance was fake precision

### Confirmed in code (before)
`successFromEdge` was a hand-tuned map from edge score → 18–74%:

```ts
// was: edge * 0.62 + urgency bump — NO historical outcomes
```

### Changes
| File | Change |
|------|--------|
| `server/markets-outcomes.ts` | **New** JSONL store `desk-outcomes.jsonl` |
| `server/markets-desk.ts` | User-facing `successPct` / `chanceLabel` from `queryHitRate`; heuristic renamed `heuristicOdds` (sort only) |
| `src/components/MarketsPanel.tsx` | Odds badge shows historical label or “Not enough history” |
| `src/lib/markets.ts` | Types updated |

**Schema (JSONL row):**  
`id, armedAt, asset, symbol, side, play, lawSet, edgeScore, heuristicOdds, entry, stop, target1, target2, riskPct, rulesSnapshot, status, resolvedAt?, resolveNote?, lastPrice?`

**Write path:** `finalizeDesk` → `logArmedTicket(...)` when `printerArmed`.

**Resolve path:** `resolveOpenOutcomes(priceMap)` at start of `buildStockDeskSignals` / `buildCryptoDeskSignals` — marks hit_t1 / hit_t2 / stopped / expired.

**Query:** `queryHitRate({ asset, lawSet })` — needs **n ≥ 30** resolved rows in last 90 days; else `ratePct: null` and label `Not enough history yet (n=…)`.

### Behavior change (flagged)
Edge arm laws no longer require “odds ≥ 55%” (that odds was the fake heuristic). Arm gate is **edge score only** (crypto ≥68, stock ≥65).

### Verify
1. Arm a ticket (or wait until one arms) → check `D:\toolsai\.control-center-data\desk-outcomes.jsonl` gains a line with `"status":"open"`.
2. UI Chance badge should say **Not enough history yet (n=0)** (or small n), **not** a made-up ~39%.
3. After ≥30 resolved rows, label becomes `Historical hit rate: X% (n=…, last 90 days)`.

**Honest caveat:** This needs weeks of live armed tickets before the percentage means anything. No backtest was invented.

---

## Fix 2 — Source staleness

### Changes
| File | Change |
|------|--------|
| `server/markets-health.ts` | **New** registry + stale thresholds |
| `server/markets-options.ts` | `markSourceOk/Error('yahoo_options')` |
| `server/markets-news.ts` | EDGAR / SEC / Fed marks |
| `server/markets-venues.ts` | multi_venue / binance_flow / okx_leads |
| `server/markets-desk.ts` | Laws `data-fresh` / `options-fresh` fail closed |
| `src/components/MarketsPanel.tsx` | Source health chips in Markets header |
| `server/launch.ts` | Desk payload includes `sourceHealth`; `/api/source-health` |

**Thresholds:** Yahoo options 5m · EDGAR 1h · Binance flow 30s · multi-venue 60s · OKX leads 5m.

### Verify — simulate stale
In a Node REPL or temporary call after desk warm:

```ts
import { __forceSourceLastOk } from './server/markets-health.js'
__forceSourceLastOk('yahoo_options', Date.now() - 22 * 60_000, 'simulated')
```

Then `GET /api/markets?action=desk&asset=stock` — OPTIONS_FLOW tickets should fail rule `options-fresh` with note like `OPTIONS_FLOW law blocked: Yahoo options 22min stale`. Header chip shows **Yahoo options STALE**.

---

## Fix 3 — Portfolio risk / correlation

### Changes
| File | Change |
|------|--------|
| `server/markets-portfolio.ts` | **New** config + `portfolioArmBlockReason` |
| Config file | `D:\toolsai\.control-center-data\desk-portfolio.json` |
| `server/markets-desk.ts` | `finalizeDesk` disarms excess → `PORTFOLIO_CAP` / WATCH |

**Defaults:** maxArmed=3 · maxAggregateRiskPct=2.0 · maxPerBucket=1  
**Buckets:** `l1_majors` (BTC/ETH), `alt_l1`, `meme`, `mega_tech`, `index_etf`, `other`.

### Verify
Edit `desk-portfolio.json` → `"maxArmed": 1`. If two tickets would arm, the lower-edge one gets WATCH with note `Would exceed max armed tickets (1)` or correlated-bucket message.

---

## Fix 4 — Form 4 / OKX as confirmation-only

### Confirmed before
`evaluateStockStrictRules` allowed `play === 'INSIDER_BUY'` as an independent arm path (`allowedPlay` included it). Crypto already required `FLOW_LONG/SHORT` as primary; OKX leads were confirmation (`leads.n === 0` waived) — **that part was already correct**.

### Changes
| File | Change |
|------|--------|
| `server/markets-desk.ts` | `allowedPlay` = options/momentum only; INSIDER_BUY ticket is WATCH “cannot arm alone” |
| `server/markets-desk.ts` | Form 4 age rule when `form4-age-days:N` known and N>3 |
| `server/markets-news.ts` | Enrich Form 4 with `ageDays` / categories |
| `server/markets-venues.ts` | Doc comment: leads = survivorship-biased confirmation |
| `FEATURES.md` | Note confirmation-only |

### Exact arm gate (after)
- **Stocks:** `allowedPlay = isOptionsFlow \|\| isMomentum` — `INSIDER_BUY` fails `play` law.
- **Crypto:** `pass: play === 'FLOW_LONG' \|\| play === 'FLOW_SHORT'` — leads cannot satisfy alone.

### Verify
Desk → Stocks on a Form-4-only name without options/momentum → ticket says **FORM 4 CONFIRMATION · cannot arm alone**, `printerArmed: false`.

---

## Fix 5 — Vault encryption at rest

### Confirmed before
`secrets-vault.json` was plaintext JSON (`fs.writeFileSync(..., JSON.stringify(next))`).

### Changes
| File | Change |
|------|--------|
| `server/vault-crypto.ts` | **New** — Windows DPAPI via PowerShell; else AES-GCM machine-derived |
| `server/cc-services.ts` | `loadVault`/`saveVault` encrypt; migrate plaintext on read |

### Verify
1. Restart `npm run dev` (or open Vault once).
2. Open `D:\toolsai\.control-center-data\secrets-vault.json` — should look like `{ "v": 1, "enc": true, "algo": "dpapi", "payload": "..." }` not raw API keys.
3. Vault UI still loads/saves secrets.
4. App starts normally.

---

## Fix 6 — Localhost bind + API auth token

### Confirmed before
`vite.config.ts` already had `host: '127.0.0.1'` — **correct, not rewritten**.

### Changes
| File | Change |
|------|--------|
| `server/cc-auth.ts` | **New** token generate/store (vault) + `requireApiToken` |
| `server/launch.ts` | Middleware: mutating `/api/*` requires `X-CC-Token` |
| `vite.config.ts` | `transformIndexHtml` injects `window.__CC_AUTH__` |
| `src/lib/launch.ts` / `markets.ts` | POSTs attach header |

### Verify
```powershell
# Fail (no token):
curl -X POST http://127.0.0.1:5173/api/launch -H "Content-Type: application/json" -d "{\"id\":\"scraper\"}"
# → 401 {"ok":false,"message":"Missing or invalid X-CC-Token"}

# Succeed: copy token from page source `window.__CC_AUTH__='...'` after hard refresh
curl -X POST http://127.0.0.1:5173/api/launch -H "Content-Type: application/json" -H "X-CC-Token: YOUR_TOKEN" -d "{\"id\":\"scraper\"}"
```

GET endpoints (quotes, desk, health) remain unauthenticated for SSE/read convenience.

---

## Fix 7 — Logic audit (fail-closed / place-by)

| Finding | Before | After |
|---------|--------|-------|
| Missing taker | Failed `takerOk` (already fail-closed) | Explicit note `taker n/a — fail closed` |
| Missing R:R / stop | Could fail on null | Notes say `n/a — fail closed` |
| Place-by expired | Ticket could still `printerArmed` | New `place-by` law + `!placeByExpired` on armed |
| ATR fetch catch → null | Flat playbook (fail closed) | Unchanged — correct |
| Yahoo options empty | Returned empty lean | Now marks source error + options-fresh law |
| Venue bias catch swallow | Empty biases → multi-venue law fails | Marks source error; laws fail closed |
| Edge+odds compound | Used fake odds | **Behavior change:** edge only |

Race note: multi-source fetches still aren’t a single atomic snapshot; staleness laws reduce “agree on stale mix” risk. A full synchronized snapshot would need a larger redesign (not done).

---

## Self-check — Ground Rule 6 (not fully addressed)

1. **Historical hit rate has no past data** — infrastructure only; n will stay low until live arms resolve. No fabricated backtest.
2. **Paid options feed** — still Yahoo scrape; if Yahoo rate-limits hard, real fix is a paid options API (Polygon/CBOE/etc.). Staleness fails closed instead of papering over.
3. **Auth token in `window.__CC_AUTH__`** — stops casual curl/other-origin POSTs; same-origin XSS can still read it. Not enterprise IdP.
4. **DPAPI requires Windows user session** — headless service accounts may need the AES fallback path.
5. **Portfolio UI** — caps are file-config only (`desk-portfolio.json`), not a Markets settings panel yet.
6. **Form 4 filing-date vs transaction-date gap** — we use transaction age vs now; Atom published−transaction gap isn’t a separate field when XML lacks filing instant.
7. **Tool-launcher half** — intentionally untouched beyond auth header on existing POSTs + vault encrypt.
8. **Automated unit tests** — not added; verification is manual as above.
9. **DEFAULT_VAULT still seeds a Discord webhook** — pre-existing; now encrypted on disk after migration, but rotating that webhook is still recommended outside this pass.

---

## Quick restart

```powershell
cd D:\toolsai\control-center
npm run dev
```

Hard-refresh the browser so `__CC_AUTH__` injects; otherwise POSTs (Launch, Vault save, Watchlist save) return 401.
