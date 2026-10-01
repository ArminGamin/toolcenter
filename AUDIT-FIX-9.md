# Audit Fix 9 — on-chain whales + SEC 13F

## Found → built → verify

### 1. On-chain whale context
- **Found:** Crypto desk had live venue flow and copy-lead context but no free explorer-derived whale factor.
- **Built:** `server/markets-whales.ts` scans free BTC (`blockchain.info`) and ETH/BNB (`Blockscout`) sources, applies configurable thresholds from `whale-config.json`, labels known exchange wallets, filters exchange-to-exchange rebalances, and supplies a low-weight confirmation factor.
- **Verify:** `exampleClassify()` yields `exchange_internal` for Binance→Binance (excluded), `exchange_deposit` for unknown→Binance (counted as sell-pressure context), and `exchange_withdrawal` for Binance→unknown (accumulation context). The desk factor is explicitly labelled **On-chain whale flow (confirmation only)**, proof includes its lines, and `onchain_whales` is visible in source health.

### 2. SEC 13F-HR background holdings
- **Found:** EDGAR support covered Form 4/8-K only; institutional holdings had no bounded, explicit-lag treatment.
- **Built:** `server/markets-13f.ts` reuses the EDGAR User-Agent/fetch and ticker map from `markets-news.ts`, politely sequences SEC requests, scans up to eight recent 13F-HR filings, parses information-table XML, and matches only watchlist issuers by SEC issuer/company names. It caches results for eight hours.
- **Verify:** Every holding is labeled **“13F holdings (institutional, up to 45+ days lagged — background context, not a live signal)”** and carries both `lagDays` (conservative days since report-period end) and `filingLagDays` (days since filing). Unit fixture: report period `2026-03-31`, filing `2026-05-15`, evaluated `2026-06-15` → `lagDays: 76`, `filingLagDays: 31`. The `edgar_13f` health row documents the 45–135-day structural delay.

### 3. Desk behavior and UI
- **Built:** Crypto includes whale context in edge score at 0.25 relative weight; stocks include 13F at 0.25 and Form 4 at 0.65. Both are marked `confirmationOnly` / `tier: confirmation`; Form 4 and OKX leads were marked consistently. Strict-law evaluators do not receive either factor, so neither can create a new arm path.
- **Verify:** Factor stack renders a **confirmation only** badge (the factor note is the hover detail, including 13F lag). Crypto and stock tips/disclaimers/laws disclose the limitations. This is a deliberate behavior change: whale context now lightly affects composite edge score, but cannot dominate live primary flow.

## Self-check / known limits
- **SEC rate limiting:** sequential calls pause 125ms (≤8/sec), use the shared declared SEC User-Agent, and cache 13F for eight hours.
- **Chain coverage:** SOL, XRP, DOGE, and other chains remain explicit unsupported stubs; BTC/ETH/BNB only.
- **Wallet labels:** public exchange/custody labels are incomplete; unlabeled transfers remain weak p2p context and exchange-internal filtering is only as complete as the label list.
- **13F change baseline:** bounded recent filing scan reports `none`/50 where a comparable prior manager filing is not available; it does not invent position-change claims.
- **STOCK Act:** deliberately skipped. No clean free normalized source was used, and no approximation is presented.
- **No protected-scope edits:** vault/auth, hit-rate logging internals, and the portfolio risk-cap formula were not changed.
