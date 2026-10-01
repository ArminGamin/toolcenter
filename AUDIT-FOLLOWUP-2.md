# Follow-up Audit 2 — Vault Exposure, Key Rotation, Open Questions

Date: 2026-07-18  
Repo: `D:\toolsai\control-center`

---

## Item 1 — `GET /api/vault` auth

### Found (confirmed against live code)
Previous middleware exempted **all** GETs:

```ts
// was in requireApiToken:
if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true
```

So `GET /api/vault` returned **decrypted secrets without a token**. Encryption at rest was bypassable by any local process.

### Changed
| File | Change |
|------|--------|
| `server/cc-auth.ts` | Sensitive GET prefixes: `/api/vault`, `/api/settings`, `/api/profiles` require `X-CC-Token`. Markets/health/desk GETs stay open. |
| `server/launch.ts` | Auth middleware always calls `requireApiToken` (no blanket GET skip). |
| `src/lib/launch.ts` | `fetchVault` / `fetchToolSettings` / `fetchProfiles` send the token header. |

### Verify
```powershell
curl http://127.0.0.1:5173/api/vault
# → 401 Missing or invalid X-CC-Token

# After hard-refresh, copy window.__CC_AUTH__ from page source:
curl http://127.0.0.1:5173/api/vault -H "X-CC-Token: YOUR_TOKEN"
# → 200 with values (CC_API_TOKEN stripped from response)
```

Markets still work without token: `curl "http://127.0.0.1:5173/api/markets?action=desk&asset=stock"`

---

## Item 2 — Old backups + key rotation

### Found
`createBackup()` writes to **Desktop**:

`%USERPROFILE%\Desktop\toolsai-cc-backup-<stamp>.zip`

and always copies `secrets-vault.json` into the zip staging. Pre–Fix 5 archives contain **plaintext** vault JSON. Also copies tool `.env` / `control-center.env` files (may contain duplicate keys).

### Scan script (no auto-delete)
```powershell
cd D:\toolsai\control-center
npm run find-plaintext-backups
# or: npx tsx scripts/find-plaintext-backups.ts
# optional: --dir "D:\some\folder"
```

### Actual scan output (this machine)
```
Scanning: C:\Users\kajus\Desktop
Scanning: C:\Users\kajus\Downloads

[PLAINTEXT] C:\Users\kajus\Desktop\toolsai-cc-backup-2026-07-18T13-53-32.zip
[PLAINTEXT] C:\Users\kajus\Desktop\toolsai-cc-backup-2026-07-18T13-59-10.zip

Summary: 2 plaintext vault archive(s) / 2 zip(s) inspected.
```

**Action for you:** review those two zips, delete them (or move to encrypted storage), then create a **new** Backup after the vault is encrypted so future archives get `enc:true`.

### Key rotation checklist (manual — cannot be done in this repo)

| Secret | Where it lived | Rotate at |
|--------|----------------|-----------|
| `DISCORD_STATUS_WEBHOOK` | Vault (+ default seed historically) | Discord → Server Settings → Integrations → Webhooks → regenerate / delete+recreate URL |
| `DISCORD_BOT_TOKEN` | Vault + tool envs that copy it | Discord Developer Portal → Bot → Reset Token |
| `GEMINI_API_KEY` | Vault + ebook `.env` | Google AI Studio / Cloud console → revoke & create new key |
| `RESEND_API_KEY` | Vault + newsletter-sender `.env` | Resend dashboard → API Keys → revoke & create |
| `RESEND_FROM` | Vault (email address, lower urgency) | Update if compromised mailbox |
| `CRYPTOCOMPARE_API_KEY` | Vault | CryptoCompare account → API keys |
| `CC_API_TOKEN` | Vault (internal) | Delete key from vault file / restart app to regenerate — or `saveVault` overwrite |
| Tool `control-center.env` / `.env` copies | Inside same backup zips under `tools\…` | Re-save from Control Center Vault/settings after rotating provider keys |

Also search Desktop/Downloads for any older `secrets-vault.json` copies outside zips.

---

## Item 3 — `lawSet` keying

### Found
Previously: hard-coded string `'STOCK_PRINTER_LAWS'` / `'MONEY_PRINTER_LAWS'` — **not** derived from threshold numbers. Tweaking edge/R:R **did not** reset history.

### Changed (clarity, not a reset)
| File | Change |
|------|--------|
| `server/markets-desk.ts` | `LAW_SET_VERSION = 1` + `lawSetId(asset)` → e.g. `MONEY_PRINTER_LAWS:v1` |

**Current values:**
- Crypto: `MONEY_PRINTER_LAWS:v1`
- Stock: `STOCK_PRINTER_LAWS:v1`

**What changes the key:** only bumping `LAW_SET_VERSION` (deliberate, logged rule-set change).  
**What does NOT:** editing edge ≥68, R:R, stale timeouts, portfolio caps, etc.

Rows logged under the old unversioned strings (`STOCK_PRINTER_LAWS`) will not count toward `v1` until you either migrate them or wait for new arms. That is a one-time orphan of any pre-this-follow-up rows (likely n≈0 anyway).

---

## Item 4 — `maxAggregateRiskPct: 2.0` — percent of what?

### Found
**No account size / NAV exists.** Calculation path:

1. `riskContributionFromPlaybook()` → always returns **`RISK_UNIT = 0.75`** (ignored stop-distance % of price).
2. `portfolioArmBlockReason` sums those units; blocks if sum > `maxAggregateRiskPct` (default **2.0**).

So 2.0 ≈ “at most ~2 concurrent arms at 0.75% equity assumed each” — **not** “2% of a dollar account.” Calling it theater is fair until NAV is wired.

### Changed
| File | Change |
|------|--------|
| `server/markets-portfolio.ts` | Documented clearly; added optional `accountEquityUsd: null` (no invented default); block message says “risk-unit cap … no account NAV set”. |

**Proposal (not auto-implemented as UI):** add a Markets / Vault field `accountEquityUsd` the user enters once; then dollar risk per arm = `RISK_UNIT/100 * accountEquityUsd`. Until then, treat the cap as a **risk-unit budget**.

---

## Item 5 — `__forceSourceLastOk` HTTP exposure

### Found
Exported only from `server/markets-health.ts`. **No** route in `launch.ts` (or elsewhere) imports or exposes it.

### HTTP routes (complete list from `attachLaunchMiddleware`)
| Route | Methods (typical) |
|-------|-------------------|
| `/api/health` | GET |
| `/api/source-health` | GET |
| `/api/runtime-status` | GET |
| `/api/launch` | POST |
| `/api/open-folder` | POST |
| `/api/action` | POST |
| `/api/settings` | GET+POST (now both need token) |
| `/api/profiles` | GET+POST (token) |
| `/api/ollama-models` | GET |
| `/api/stop` | POST |
| `/api/stop-all` | POST |
| `/api/console` | GET+POST |
| `/api/vault` | GET+POST (**both need token**) |
| `/api/backup` | POST |
| `/api/markets/stream` | GET SSE |
| `/api/markets` | GET+POST |

**No change needed** for Item 5 beyond this confirmation. Debug hook remains for unit tests / REPL only.

---

## Item 6 — Automated fail-closed tests

### Changed
| File | Change |
|------|--------|
| `vitest` + `vitest.config.ts` | Added (none existed) |
| `server/__tests__/desk-fail-closed.test.ts` | 11 unit tests |
| `package.json` | `"test": "vitest run"`, `find-plaintext-backups` script |

### Test run
```
npx vitest run
✓ 11 passed
```

Covers: stale Yahoo/multi_venue, null taker/R:R/stop, place-by expiry, INSIDER_BUY alone, portfolio bucket + aggregate caps.

---

## Self-check — not fully resolved

1. **Key rotation** — checklist only; you must rotate on provider dashboards and delete the two plaintext Desktop zips.
2. **Tool `.env` inside those zips** — scan script flags vault plaintext; `.env` copies inside the same zips may also hold keys — open the zip and check `tools\…` if you used those keys.
3. **`accountEquityUsd` UI** — field exists in portfolio JSON schema as `null`; no Markets settings UI yet.
4. **Old unversioned outcome rows** — if any exist under `STOCK_PRINTER_LAWS` without `:v1`, they won’t count toward the new key (likely empty).
5. **Auth token still in `window.__CC_AUTH__`** — same-origin XSS can read it; acceptable for local, not enterprise.
6. **Did not curl live vault 401** in this session against a running server — logic is in place; verify with the curl commands above after `npm run dev` + hard refresh.

---

## Quick commands

```powershell
cd D:\toolsai\control-center
npm run test
npm run find-plaintext-backups
npm run dev
# hard-refresh browser, then re-test vault curl
```
