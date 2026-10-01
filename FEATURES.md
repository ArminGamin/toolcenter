# ToolsAI Control Center — Full Feature Guide

Local production launcher and markets desk for tools under `D:\toolsai`.  
Repo path: `D:\toolsai\control-center`.

---

## Table of contents

1. [What this is](#1-what-this-is)
2. [How to run](#2-how-to-run)
3. [Shell UI (global)](#3-shell-ui-global)
4. [Home / Orbit](#4-home--orbit)
5. [Command palette](#5-command-palette)
6. [Tool catalog](#6-tool-catalog)
7. [Tool panel (per-tool)](#7-tool-panel-per-tool)
8. [Vault, backup & Discord](#8-vault-backup--discord)
9. [Global logs](#9-global-logs)
10. [Markets hub](#10-markets-hub)
11. [Markets — LIVE](#11-markets--live)
12. [Markets — CHARTS](#12-markets--charts)
13. [Markets — NEWS (Feed)](#13-markets--news-feed)
14. [Markets — NEWS (Desk / Money Printer)](#14-markets--news-desk--money-printer)
15. [Markets — WATCHLIST](#15-markets--watchlist)
16. [Notes workspace](#16-notes-workspace)
17. [Data honesty & legal boundaries](#17-data-honesty--legal-boundaries)
18. [Local API bridge](#18-local-api-bridge)
19. [Persisted data on disk](#19-persisted-data-on-disk)
20. [Tech stack](#20-tech-stack)
21. [Keyboard shortcuts](#21-keyboard-shortcuts)

---

## 1. What this is

**ToolsAI Control Center** is a browser UI + local Node/Vite bridge that:

- Launches, stops, and configures desktop tools (Python GUIs, batch scripts, Ollama, ebook pipeline, etc.)
- Streams each tool’s console into the UI
- Stores shared secrets in a local vault
- Hosts a **Markets** rail: live quotes, TradingView charts, multi-source news, and a strict “money printer” trading desk for **crypto** and **stocks**

It is designed for **local use** (`127.0.0.1`). The bridge must be on for Launch / Markets APIs to work.

---

## 2. How to run

```powershell
cd D:\toolsai\control-center
npm install
npm run dev
```

Open **http://127.0.0.1:5173**. Top bar should show **Bridge on**.

| Script | Purpose |
|--------|---------|
| `npm run dev` | Dev server + API middleware |
| `npm run build` | Typecheck + production build |
| `npm run preview` | Preview production build |
| `npm run lint` | Oxlint |

---

## 3. Shell UI (global)

### Left rail

| Button | Action |
|--------|--------|
| **Home** (brass dot) | Tool orbit / catalog home |
| **Markets** | Full Markets hub |
| **Notes** | Local-first notes workspace |

On narrow screens the rail becomes a bottom bar.

### Top bar

- Breadcrumb: `ToolsAI / …` (current tool name, Markets, or online/offline counts)
- **Bridge** pill — green when the local API is healthy
- Clock
- **Search** — opens command palette
- **Vault** — shared secrets
- **Logs** — aggregated console
- **Stop all** — kill launched tool processes
- **Backup** — zip/copy Control Center data

---

## 4. Home / Orbit

- Visual **orbit** of tools (nodes around a center)
- Online tools light up based on process detection
- **Click** a node → open that tool’s panel
- **Double-click** → quick launch
- Soft-removed tools stay out of the active catalog merge rules (see persistence below)

---

## 5. Command palette

- Open with **`/`** or the Search control
- Search by **name** or **category**
- Select a tool to open its panel
- Escape closes palette / overlays / Markets / tool view as appropriate

---

## 6. Tool catalog

Canonical list lives in `src/data/tools.ts` (`TOOL_CATALOG`).  
UI state (name overrides, active/paused, removed) merges into localStorage key `control-center-tools-v9`.

### Categories & tools

#### Scraping

| ID | Name | Launch | Notes |
|----|------|--------|-------|
| `scraper` | Scraper | `python gui.py` | Web email scraper GUI |
| `dc_scraper` | DC Scraper | `python 1.py` | Discord channel email scraper |

#### Email

| ID | Name | Launch | Notes |
|----|------|--------|-------|
| `newsletter_sender` | Newsletter Sender | `run.bat` | Vasaros Kampelis bulk mailer (Resend) |
| `gmail_script` | Gmail Script | `python gmail1_gui.py` | Gmail automation GUI |

#### Content / Leads

| ID | Name | Launch | Notes |
|----|------|--------|-------|
| `post_maker` | PostMaker | `python main.py` | Motivational carousel studio |
| `ai_lead_finder` | AI Lead Finder | `run.bat` | Lead discovery + enrichment |

#### Video

| ID | Name | Launch | Notes |
|----|------|--------|-------|
| `motion_blur` | Motion Blur | `add_blur.bat` | Batch motion-blur videos |
| `video_creator` | Video Creator | `python app.py` | Promo video GUI |

#### AI

| ID | Name | Launch | Notes |
|----|------|--------|-------|
| `ollama` | Ollama | `ollama.exe` | Local LLM runtime; extra actions: start / run / pull / setup |

#### Ebook (Tavo Knyga)

| ID | Name | Launch | Notes |
|----|------|--------|-------|
| `tavo_knyga_ui` | Tavo Knyga UI | `python run_ui.py` | Main ebook generator UI |
| `tavo_factory_ui` | Recipe Factory | `python run_factory_ui.py` | Recipe factory + seed/build actions |
| `tavo_health_ui` | Recipe Health | `python run_health_ui.py` | Recipe health checker |
| `recipe_db_builder` | Recipe DB Builder | `python build_recipe_database.py --report` | Offline library builder + readiness gates |

Each tool can define:

- **Settings fields** (text / password / number / select) written to `.env` or `control-center.env`
- **Assets** (e.g. newsletter HTML + subjects list)
- **Custom actions** (Ollama, recipe factory build, etc.)
- **processMatch** — used to detect “online”

---

## 7. Tool panel (per-tool)

When you open a tool:

| Feature | Description |
|---------|-------------|
| **Launch** | Starts `launch` command in the tool’s `path` |
| **Stop** | Stops the tracked process |
| **Open folder** | Opens Explorer at the tool path |
| **Open output** | Opens output folder when configured |
| **Active / Paused** | Soft status toggle |
| **Rename** | Display name override (persisted) |
| **Settings** | Edit env keys; Save writes to disk |
| **Profiles** | Named snapshots of settings + assets (save / load / delete) |
| **Assets** | Inline edit of HTML/text files (e.g. promo email) |
| **Actions** | Tool-specific one-shots (Ollama pull, fetch seeds, build DB, …) |
| **Console** | Live log stream with level coloring (info / noise / warn / critical) |
| **Copy path** | Clipboard helper |

Serious crash lines can notify Discord (see vault). Markets noise does **not** `@everyone`.

---

## 8. Vault, backup & Discord

### Vault (`Vault` in top bar)

Shared secrets stored under:

`D:\toolsai\.control-center-data\secrets-vault.json`

Typical fields:

| Key | Purpose |
|-----|---------|
| `DISCORD_STATUS_WEBHOOK` | Status / launch / stop / error / backup alerts |
| `DISCORD_BOT_TOKEN` | Shared bot token for tools that need it |
| `OLLAMA_URL` / `OLLAMA_MODEL` | Defaults for LLM-backed tools |
| `GEMINI_API_KEY` | Gemini for ebook / LLM tools |
| `RESEND_API_KEY` / `RESEND_FROM` | Newsletter sender |
| `CRYPTOCOMPARE_API_KEY` | Optional — extra Markets media headlines |

### Discord notify rules

- Tool **crashes / fatals** can ping critically (including `@everyone` when marked crash-critical)
- **Markets** headlines / desk updates never ping `@everyone`
- Content fingerprint **dedupe** reduces duplicate spam within a time window

### Backup

Top-bar **Backup** packs Control Center data (watchlist, vault, profiles, etc.) via `/api/backup`.

---

## 9. Global logs

**Logs** modal aggregates console output across tools with the same severity classification used in the tool panel. Useful when multiple tools are running.

---

## 10. Markets hub

Opened from the rail. Header framing:

> Crypto · stocks · news  
> Live Binance trades, multi-venue flash (Coinbase · OKX · Bybit · Kraken · Fed), and verified desk confluence — not single-exchange tips.

### Top-level tabs

| Tab | Purpose |
|-----|---------|
| **LIVE** | Quote cards for watchlist symbols |
| **CHARTS** | Embedded TradingView charts |
| **NEWS** | Feed + Desk (money printer) |
| **WATCHLIST** | Add/remove symbols, alert settings |

---

## 11. Markets — LIVE

- Cards for each watchlist symbol (**CRYPTO** / **STOCK** badges)
- Asset logos (32–40px, lazy-loaded): crypto via CoinGecko CDN when `coingecko` is set on the watch symbol, else cryptocurrency-icons; stocks via Clearbit (`logo.clearbit.com/{domain}`) using preset `domain` or ticker map — monogram fallback if CDN 404s; logos load independently of quote/history fetches
- Live price, selected-window % change chips (green up / red down) labelled **1m / 5m / 10m / 15m / 30m / 45m / 60m** or **1h / 4h / 6h / 12h / 24h**
- Window selector groups minute windows on the left and hour windows on the right; each window is sent to the API as its duration in minutes. Per-card intraday price-path moves are calculated from the first to latest available print in that selected window.
- Source labels (e.g. Binance live, Yahoo)
- Pulse / atmosphere styling for presence
- Quotes: Binance WebSocket → SSE for crypto; Yahoo for stocks
- Paths: Binance klines for crypto (one-minute bars through 30m, five-minute bars through 6h); Yahoo chart history for stocks. Stock minute windows request Yahoo one-minute bars on a best-effort basis; Yahoo may not provide them for every symbol/session, in which case the card shows **No prints** rather than implying a move.
- Stream endpoint: `/api/markets/stream`

---

## 12. Markets — CHARTS

- TradingView widgets using each symbol’s `tv` id  
  (e.g. `BINANCE:BTCUSD`, `NASDAQ:NVDA`)
- Watchlist-driven — charts follow configured symbols

---

## 13. Markets — NEWS (Feed)

### Sub-nav

- **FEED** — headlines
- **DESK** — money printer tickets

### Sources (examples)

| Source | Kind of data |
|--------|----------------|
| Binance CMS | Listings / flash / risk |
| OKX / Bybit | Announcements & listings |
| Coinbase Status | Quiet operational / product flash |
| Kraken Blog | Product / venue notes |
| Federal Reserve | Regulatory RSS |
| SEC EDGAR | **Form 4** (insider ownership) + **8-K** (material events) + **13F-HR** (lagged institutional holdings) — public only |
| blockchain.info / Blockscout / public RPC / XRPScan | BTC / ETH / BNB / SOL / XRP large native-asset transfers; exchange-labelled internal moves excluded. SOL follows a bounded confirmed-slot cursor, with explicit gap notes when public-RPC lag exceeds the batch. |
| RSS wires | The Block, CoinTelegraph, Decrypt, Bitcoin Magazine, … |
| CryptoCompare | Optional media (needs vault key) |

### Tiers

| Tier | Meaning |
|------|---------|
| **critical** | Act-now style risk / major verified flash |
| **watch** | Worth eyes (listings, Form 4, Fed/SEC routine, top wires) |
| **filler** | Lower-signal media / noise |

Feed is **diversified** so one venue (e.g. Binance) cannot drown SEC / Fed / other houses.

### Filters (persisted in `localStorage` → `cc-markets-news-filters`)

**By tier (toggles):** Critical · Watch · Filler  

**By kind:**

| Filter | Shows |
|--------|--------|
| All | Everything matching tiers |
| **Verified insider** | Public SEC Form 4 items |
| SEC | Form 4 + 8-K |
| Fed | Federal Reserve |
| Exchanges | Binance / OKX / Bybit / Coinbase / Kraken flash |
| Media | RSS / CryptoCompare style |

Badges such as **Verified · SEC Form 4 (public)** mark legal EDGAR filings.

---

## 14. Markets — NEWS (Desk / Money Printer)

Prop-style desk with **strict laws**. Tickets only **arm** (green BUY / SELL) when every required law passes. Otherwise **WATCH** or **DON'T BUY / AVOID**.

### Asset tabs

| Tab | Engine |
|-----|--------|
| **Crypto** | Multi-venue Δ flow, taker, funding, OI, OKX copy-leads + on-chain whale context |
| **Stocks** | Yahoo public options/flow + Form 4/8-K + 13F-HR context + momentum |

API: `/api/markets?action=desk&asset=crypto|stock`

### Board summary

- **DO THIS** / primary **directive** (BUY · SELL · WATCH · DON'T BUY · AVOID)
- Locked vs armed status
- Bias · Heat · Armed · Watch · Avoid counts
- **Chance ~N%** — model odds (`successPct`) on best ticket
- Expandable **strict laws** list
- **Hot movement** — largest |Δ| across watchlist + presets
- **What top people are doing** — public only:
  - Stocks: named officer/director **executive Form 4** activity (reporting-owner name and XML relationship/title), plus Yahoo options call/put lean
  - Crypto: OKX verified copy-lead account fills; when none are available, the desk explicitly directs users to Stocks for CEO/officer EDGAR filings

### Directive colors

| Verb | Color intent |
|------|----------------|
| **BUY** | Green — armed long / go |
| **SELL** | Sell-side armed |
| **WATCH** | Brass/amber — interesting but not armed (replaces old “SIT CASH”) |
| **DON'T BUY / AVOID** | Red — stay flat / do not chase |

### Ticket anatomy

1. **Simple view (default)** — directive, server-generated plain-English primary-law summary, ticket dollar/risk-unit line, and prominent **Why watch / blocked** reason  
2. **Advanced view** (persisted in `localStorage` key `cc-markets-desk-view`) — full current ticket, rules, playbook, proof, and factor stack  
3. **ACTION** line (directive) — what to do right now  
2. Tags: rank, locked/armed, play type, badges (public options, Form 4, …)  
3. **Edge** score + **~% chance** odds  
4. Headline / detail / action prose  
5. **Whys / why-nots / risks**  
6. **Strict rule gate** — pass/fail per law  
7. **Playbook** — side, entry, stop, T1/T2, R:R, intended equity-risk text (`sizeHint`, displayed as **Size**), invalidation  
8. **Factor stack** — **Primary signal** bars are separate from a muted, collapsed-by-default **Context only — cannot arm alone** group (whales, 13F, Form 4, OKX leads)  
9. **Public options/flow** block (stocks) — Yahoo chain volume / OI / unusual  
10. **Verified insider** block (stocks) — EDGAR Form 4 proof  
11. Lead accounts / fills (crypto)  
12. Timing — window, place-by clock (sticky; does not silently renew after expiry)

The Desk also shows a persistent sample-quality banner from actual outcome records and a compact recent armed-ticket track record (T1/T2, stopped, expired, or open). It does not invent a hit rate before 30 resolved outcomes for the rule-set.

### Crypto money-printer laws (summary)

- Trade FLOW_LONG / FLOW_SHORT only — no fade/squeeze as “now”
- ≥2 venues add same direction (Binance or OKX cohort)
- No opposing venue mix
- Aggressive taker + tape/funding confirm
- Edge ≥ 68 · odds ≥ 55% · R:R ≥ 1.5 · stop risk caps
- OKX leads must agree when present
- On-chain whales are low-weight confirmation only (explorer API / chain confirmation, not tick-perfect); SOL/XRP use free public feeds with thinner coverage/labels than BTC/EVM
- Hard stop · scale at T1 · scrap if place-by expires or Δ flips

### Stock money-printer laws (summary)

- Prefer **OPTIONS_FLOW_*** from **Yahoo public** option chain
- Options lean + unusual vol must agree; tape not collapsing against lean
- **INSIDER_BUY** complementary via **SEC Form 4 / 8-K** (public EDGAR only)
- **SEC 13F-HR** holdings are low-weight background context; filings can be 45–135 days behind position establishment and cannot arm a ticket
- MOMENTUM_* with |24h| ≥ 2.5% and R:R ≥ 1.5
- No arm on bankruptcy / investigation / halt language
- Edge ≥ 65 · odds ≥ 55% · hard stop · waiting allowed

### Public options/flow (stocks)

From `server/markets-options.ts` — Yahoo Finance option chain:

- Call/put **volume** & **open interest**
- Put/call ratios
- Unusual prints (vol ≫ OI)
- Lean: call_heavy / put_heavy / balanced
- Shown as factor bar + dedicated ticket block

### Verified insider (stocks)

- SEC EDGAR Atom + ownership enrichment
- CIK → ticker / company matching to watchlist
- Open-market **P/S** lean when XML available
- Reporting-owner name plus officer title and/or director relationship from the public ownership XML. Only named officers/directors are surfaced as executive activity; other reporting owners remain filing proof.
- News tags + desk proof lines + factor

**Not included:** Discord/Telegram tip channels, private “leak” groups, non-public insider material, or STOCK Act/congressional trade activity. There is no clean, free normalized public source wired for the latter.

### Desk responsiveness

- **Not tick-perfect live.** Crypto watchlist quotes stream via Binance SSE when connected (2s HTTP poll fallback). Stocks use Yahoo on each quote fetch. Desk board, news feed, and source-health chips are **polled** — auto-refresh every **8s** on Desk, **15s** on Feed; server-side desk cache **7s**, news cache **8s**, live-history cache **15s**. Underlying sources (Yahoo options, EDGAR, whale RPC, etc.) have their own structural latency — chips show fetch age and may read STALE even between polls.
- **Manual Refresh** (Markets header): bypasses short caches (`force=true`), re-fetches desk for the current asset tab, quotes, source-health chips, and the visible tab payload (live paths or news feed). Shows **Refreshing…** / **Updated Xs ago**; auto-poll continues unchanged.
- The visible sub-tab fetches independently: opening the Desk does not also poll the full news feed; the shared public-news snapshot is cached for 8 seconds to prevent duplicate source fan-out.
- Desk requests share an in-flight request per asset and reuse a short 7-second payload cache (skipped when Refresh forces).
- SEC Form 4 XML enrichment runs in fair-access-friendly pairs. Lagged 13F, whale RPC, and OKX copy-lead confirmation data run in parallel with primary sources and have bounded wait times. A timeout means unavailable context, never a relaxed strict-law gate or invented signal.

---

## 15. Markets — WATCHLIST

| Setting | Purpose |
|---------|---------|
| Symbol list | Add from **presets** or manage entries |
| `alertPct` | % move threshold for Discord market alerts |
| `discordAlerts` | Toggle market move notifications |

Default seed symbols: BTC, ETH, SOL, XRP, NVDA.

### Presets (examples)

**Crypto:** BTC, ETH, SOL, XRP, DOGE, BNB  
**Stocks / ETFs:** NVDA, TSLA, AAPL, MSFT, AMZN, META, GOOGL, SPY, QQQ  

Config file: `D:\toolsai\.control-center-data\markets-watchlist.json`

---

## 16. Notes workspace

Notes is a local-first workspace opened from the rail. It supports multiple notes and notebooks, pinning and archive, title/body search, tag filtering, sorting, color labels, optional market-symbol links, and Markdown export.

- Markdown **Write / Preview / Split** modes, with clickable `- [ ]` / `- [x]` checklists in preview
- Create from **Blank**, **Meeting**, **Trade idea**, or **Research** templates
- Debounced autosave with saved/saving state; `Ctrl/Cmd+N` creates a note, `Ctrl/Cmd+S` saves, and `/` focuses Notes search
- Persistence: `D:\toolsai\.control-center-data\notes.json`, read through `GET /api/notes` and updated through authenticated `POST /api/notes`

## 17. Data honesty & legal boundaries

| Allowed (built in) | Not allowed / refused |
|--------------------|------------------------|
| Public exchange tape & announcements | Illegal tip / leak feeds |
| Yahoo delayed equity options | Private Telegram/Discord “whispers” |
| SEC EDGAR Form 4 / 8-K / 13F-HR | MNPI / pre-filing insider tips |
| Free BTC / ETH / BNB / SOL / XRP explorer flow | Paid Whale Alert scraping |
| OKX public copy-lead trades | Guaranteed-profit claims |
| Multi-venue L/S & funding | Bypassing compliance filters |

**Form 4, SEC 13F, OKX copy-leads, and on-chain whale flow are confirmation-only** (lagged, survivorship-biased, or incomplete-labelled context). They cannot arm a ticket alone — primary triggers are multi-venue flow (crypto) or Yahoo options / momentum (stocks). See `STOCK_PRINTER_LAWS` / `MONEY_PRINTER_LAWS` and `AUDIT-FIXES.md`.

**Size naming:** the UI label **Size** displays the playbook's `sizeHint` string. It is not a second numeric position-size field: it states the intended percentage of account equity at risk. Portfolio risk parses that text only when valid; a missing or malformed `sizeHint` receives a 7.5% fail-closed risk charge and cannot quietly receive the normal 0.75% target.

**Chance %** is a historical hit rate from `desk-outcomes.jsonl` only when n≥30 resolved armed tickets in 90 days — never a hand-tuned fake odds number. Until then the UI shows “Not enough history yet”.

**Portfolio cap decision:** resolved — decision (a), unchanged at **2.0** `maxAggregateRiskPct`. The hit-rate log remains near-zero real data and needs n≥30; this phase is tight caps plus observation, not maximum throughput.

Desk copy always frames signals as **not a profit guarantee**. Strict mode means **cash / WATCH** until laws are green.

### Related docs
- Full feature guide: [`FEATURES.md`](./FEATURES.md)
- Audit / integrity pass: [`AUDIT-FIXES.md`](./AUDIT-FIXES.md)

---

## 18. Local API bridge

Mounted by Vite middleware in `server/launch.ts` (and related modules).

| Endpoint | Role |
|----------|------|
| `GET /api/health` | Bridge health |
| `GET /api/runtime-status` | Which tools look online |
| `POST /api/launch` | Launch tool |
| `POST /api/stop` | Stop one tool |
| `POST /api/stop-all` | Stop all |
| `POST /api/open-folder` | Explorer |
| `POST /api/action` | Custom tool actions |
| `GET/POST /api/settings` | Read/write tool env + assets |
| `GET/POST /api/profiles` | Settings profiles |
| `GET /api/ollama-models` | Installed Ollama models |
| `GET/POST /api/console` | Tool console buffer |
| `GET/POST /api/vault` | Shared secrets |
| `POST /api/backup` | Data backup |
| `GET/POST /api/notes` | Local Notes workspace |
| `GET /api/markets` | quotes · news · desk · presets · config |
| `GET /api/markets/stream` | SSE live quotes |

Desk query example:

```
GET /api/markets?action=desk&asset=stock
GET /api/markets?action=desk&asset=crypto
GET /api/markets?action=news
GET /api/markets?action=quotes
```

---

## 19. Persisted data on disk

Under `D:\toolsai\.control-center-data\` (and browser localStorage):

| Store | Contents |
|-------|----------|
| `secrets-vault.json` | Vault secrets |
| `markets-watchlist.json` | Markets config |
| `notes.json` | Notes, folders, tags, and note metadata |
| Tool profile dirs | Per-tool settings snapshots |
| Backup archives | From Backup action |
| `localStorage` `control-center-tools-v9` | Tool UI state |
| `localStorage` `cc-markets-news-filters` | News filter prefs |

---

## 20. Tech stack

| Layer | Choice |
|-------|--------|
| UI | React 19 + TypeScript + Tailwind |
| Bundler / server | Vite 8 with custom middleware |
| Lint | Oxlint |
| Markets server modules | `markets.ts`, `markets-live.ts`, `markets-news.ts`, `markets-venues.ts`, `markets-options.ts`, `markets-desk.ts`, `cc-services.ts`, `launch.ts` |
| UI entry for Markets | `src/components/MarketsPanel.tsx` |
| Client helpers | `src/lib/markets.ts`, `src/lib/launch.ts` |

---

## 21. Keyboard shortcuts

| Key | Action |
|-----|--------|
| `/` | Open command palette |
| `Esc` | Close palette / vault / logs; step back from Markets or tool |
| `Ctrl/Cmd+N` (Notes) | Create a blank note |
| `Ctrl/Cmd+S` (Notes) | Save notes immediately |
| `/` (Notes) | Focus Notes search |

---

## Quick mental model

```
Control Center
├── Home orbit → launch & configure tools
├── Vault / Logs / Backup / Stop all
└── Markets
    ├── LIVE quotes
    ├── CHARTS (TradingView)
    ├── NEWS
    │   ├── FEED (tier + source filters, Form 4 badges)
    │   └── DESK
    │       ├── Crypto printer (venues + OKX leads)
    │       └── Stocks printer (Yahoo options + Form 4)
    └── WATCHLIST
```

---

## Disclaimer

Nothing in Markets is investment advice or a guarantee of profit.  
Public filings and delayed option/exchange data can be incomplete or late.  
You are responsible for your own risk and for complying with securities laws.

---

*Generated for ToolsAI Control Center (`D:\toolsai\control-center`). Update this file when major features change.*
