# Fix 8 — Real Risk Weighting, Account Equity, Source Latency Honesty

Date: 2026-07-18  
Repo: `D:\toolsai\control-center`

Auth / vault middleware: **not touched**.

---

## Item 1 — Real `riskContribution` (behavior change)

### Found
`riskContributionFromPlaybook()` always returned flat `0.75` regardless of stop width.

### Formula (now)
```
equityRiskPct = parse from sizeHint (upper bound of “0.5–0.75% equity”, else 0.75)
stopDistancePct = playbook.riskPct   // stop as % of entry — already on ticket
REF_STOP_PCT = 1.0

riskContribution = equityRiskPct × (stopDistancePct / REF_STOP_PCT)
```

**Why:** Playbook already carries `riskPct` (stop distance %) and `sizeHint` (intended equity risk). There is no separate `positionSizePct` field. Scaling by stop vs a 1% reference means a **wider stop burns more of the portfolio budget** (same equity-risk *intent*, fixed-size interpretation). Unknown stop → fail-closed large contribution (10× default).

### Before / after example
| Ticket | Stop vs entry | sizeHint | **Old** contribution | **New** contribution |
|--------|---------------|----------|----------------------|----------------------|
| A | 1% | 0.75% equity | 0.75 | **0.75** |
| B | 8% | 0.75% equity | 0.75 | **6.0** |

`maxAggregateRiskPct` default **left at 2.0** (not retuned).

**Calibration note for you:** With stop-scaled risk, a single 8% stop ticket (contrib 6.0) already exceeds a 2.0 aggregate cap by itself. That may be intentional (ban wide stops) or you may want to raise the cap — **your call**, not auto-changed.

### Files
- `server/markets-portfolio.ts` — real formula + `parseEquityRiskPctFromSizeHint`
- `server/markets-desk.ts` — passes full playbook into `riskContributionFromPlaybook`
- `server/__tests__/desk-fail-closed.test.ts` — asserts 1% → 0.75, 8% → 6.0

### Verify
```powershell
npx vitest run
# Fix 8 test: 1% stop contributes less than 8% stop
```

---

## Item 2 — `accountEquityUsd` wired in Markets → Watchlist

### Found
Field existed on portfolio JSON as `null` with no UI / API write path used by the panel.

### Changed
| File | Change |
|------|--------|
| `server/markets-portfolio.ts` | `savePortfolioConfig()` |
| `server/launch.ts` | `GET/POST ?action=portfolio` (POST uses auth like other markets writes) |
| `src/lib/markets.ts` | `fetchPortfolioConfig` / `savePortfolioConfig` |
| `src/components/MarketsPanel.tsx` | Watchlist section **Account equity (desk risk)** number input |
| Desk board | `riskBudgetLabel`, `aggregateRiskPct`, `aggregateRiskUsd`, `needsAccountSize` |

**Why `desk-portfolio.json` (not watchlist.json):** risk caps / buckets already live there; equity belongs with portfolio math. Watchlist UI is just the place to edit it (not Vault — not a secret).

- **Unset:** board shows e.g. `Aggregate risk: X% of equity budget (set account size for $)` + brass note.
- **Set (e.g. 30000):** `Aggregate risk: 1.40% (~$420 of $30000)` when armed contribs sum to 1.4.

### Verify
1. Markets → **Watchlist** → **Account size (USD)** → enter `30000` → Save account size.  
2. Desk board shows dollar line when anything is armed (or 0% with account set).  
3. Clear field + save → back to “unset” note, no invented default.

---

## Item 3 — Fetch freshness vs structural latency

### Found
Staleness only tracked `lastSuccessfulFetch` (scraper poll age).

### Changed
Each source in `markets-health.ts` now has static `knownSourceLatency`, and `getAllSourceHealth()` returns `chipLabel` combining both:

Examples of rendered chip text:
- **Delayed:** `Yahoo options: fresh (fetched 40s ago) · ~15–20 min exchange-delayed (free/unofficial tier — not real-time NBBO)`
- **Real-time:** `Binance live: fresh (fetched 3s ago) · Near real-time (WebSocket public trades)`
- **Unknown:** `OKX leads: … · Delay unknown — treat as non-real-time until copy-lead refresh cadence confirmed`

| Source | knownSourceLatency (summary) |
|--------|------------------------------|
| yahoo_options / yahoo_quotes | ~15–20 min exchange-delayed (free tier) |
| edgar / sec_rss | Form 4 up to 2 business days by law / publication lag |
| binance_flow / binance_live / multi_venue | Near real-time (with 5m-bar caveat on multi_venue) |
| okx_leads | **Unknown** — documented honestly |
| fed_rss | Publication lag minutes–hours |

UI chips in Markets header use `chipLabel` (title tooltip + visible text).

### Files
- `server/markets-health.ts`
- `src/components/MarketsPanel.tsx`
- `src/lib/markets.ts` (`SourceHealthRow` fields)

### Verify
Hard-refresh Markets → hover/read chips under the header. Yahoo/EDGAR should show delay language even when **fresh**.

---

## Tests
```
npx vitest run  →  12 passed
```

---

## Self-check — not fully resolved

1. **`maxAggregateRiskPct: 2.0` may feel too tight** now that an 8% stop costs 6.0 — flagged, not auto-retuned.
2. **OKX lead latency** — still “unknown”; no paid/docs confirmation.
3. **Yahoo delay “15–20 min”** — industry-typical for free delayed quotes; exact exchange agreement not verified against Yahoo’s current ToS for this scrape.
4. **No screenshot** — describe chips above; visual confirm in browser after hard refresh.
5. **Position size is not an explicit playbook field** — formula uses stop × equity-risk intent; if you later add true position %, we can switch to `positionPct × stopPct / 100` without inventing NAV.
6. Auth / vault — untouched as requested.
