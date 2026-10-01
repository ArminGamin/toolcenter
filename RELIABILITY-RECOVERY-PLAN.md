# Control Center reliability-recovery plan

**Purpose:** make the Control Center dependable, quick to diagnose, and safe to resume after a failure. This is an execution plan for Cursor; it deliberately makes no production-code changes itself.

## Scope and non-negotiables

1. **Do not remove, hide, rename, or break any existing tool.** Keep the entire `TOOL_CATALOG`, its launch paths, settings, assets, and actions. Add a catalog-contract test before touching the runner.
2. Fully repair the three active workflows first: **Friend DMs**, **Facebook Group Poster**, and **Outreach**.
3. **Skip Instagram-specific work.** Do not redesign One-Shot/Instagram behaviour. Fix only its minimal TypeScript contract if required to make the shared app build.
4. For every other tool, add common health checks, structured logs, and a non-destructive smoke-test contract. Do not change its product behaviour in this pass.
5. Never try to bypass Facebook/Messenger access controls. When the account cannot access a chat, stop safely, preserve evidence, and tell the operator exactly what manual login/access step is required.

## Evidence collected on 2026-09-10

### Baseline code health

- `npm run build` currently fails with **11 TypeScript errors**. The immediate blockers include the One-Shot canvas ref nullability, unused UGC/One-Shot symbols, and the `UgcStoryGateFailure.role` type mismatch.
- The observed `npm test` output contains **8 failing UGC tests**: 1 in `ugc-lt-normalize`, 6 in `ugc-never-lose-post`, and 1 in `ugc-shipable-gate`.
- `npm run lint` completes, but reports **12 warnings** (mostly unused UGC symbols and one unstable React hook dependency).

### The logs say

| Workflow | Evidence | What it means |
|---|---:|---|
| Friend DMs | 25,931 log entries; **11,605 normal INFO events incorrectly saved as errors** | The UI is presenting normal worker progress as a failure, making diagnosis untrustworthy. |
| Friend DMs | 768 navigation-failure records; 1,190 `ERR_INTERNET_DISCONNECTED` markers; 70 file-input/attachment failures; 16 missing-composer records; 8 unconfirmed deliveries | Connection loss and Messenger-page recovery are not bounded; image attachment and composer recovery need explicit state handling. |
| Friend DMs | 1,392 retry-navigation events and 1,225 inter-friend waits | The runner spends time waiting even after a broken page/session rather than detecting, recovering once, or pausing. |
| Group Poster | 3,041 log entries; **1,378 normal INFO events incorrectly saved as errors** | Same stderr severity bug as Friend DMs. |
| Group Poster | 55 group-open failures, 7 create-dialog failures, 14 missing composers, 11 dialogs still open, 35 Buy & Sell skips | Target suitability and UI readiness are learned too late, after opening/typing against a group. |
| Outreach | 44.8 MB / 339k+ event log; 1,739 chain refills; 1,707 empty-find retries; 45,001 empty-search-batch messages; only 60 positive headless-find messages | The chain can spin through empty searches and retry/refill loops, causing slow runs with very low yield. |
| Outreach | 258 send errors, including 104 explicit `fetch failed` records; 759 send-success records | Send-provider outages are retried too long instead of being circuit-broken and surfaced as an actionable provider-health problem. |

The focused debug traces corroborate this: 1,369 finder waves returned zero leads in the same chain state, while a Messenger page repeatedly became `chrome-error://chromewebdata/` during inter-friend waits.

The supplied Messenger screenshot is a separate, clear access-state signal: **“Ambiance can't access this chat yet … when Ambiance next logs into Messenger.”** That is not a selector bug and cannot be solved by automation. The product must classify it as `messenger_account_access_required`, stop the current target/run according to policy, save a screenshot, and show **Open Messenger / sign in as Ambiance, then retry**.

## Target operating model

Every long-running tool should use the same model:

```text
Preflight → Ready → Running step → Verify outcome → Persist checkpoint
                         │                  │
                         │                  └─ recover once / classify / retry only when safe
                         └─ pause with exact required action when operator access is needed
```

Each run has a `runId`, a bounded retry budget, a heartbeat, an atomic checkpoint, and a final summary. A process exit, HMR reload, network loss, stale lock, or browser access block must result in one of these explicit states: `done`, `paused_needs_action`, `retrying`, `failed`, or `aborted`—never a vague forever-running state.

## Phase 0 — restore a trustworthy release baseline

Do this first in a small, isolated change set.

1. Fix the 11 TypeScript errors without changing One-Shot/Instagram behaviour. The only One-Shot change should make the canvas ref type nullable where React requires it.
2. Repair the eight failing UGC tests or update the fixtures only when the intended contract is proven. Do not weaken content-quality gates just to turn tests green.
3. Remove or deliberately use the listed unused symbols; fix the hook dependency warning by stabilizing the dependency rather than suppressing the lint rule.
4. Gate every later change with `npm run lint`, `npm test`, and `npm run build`. Record test counts and elapsed time in the change log.
5. Add a `catalog-contract` test that asserts every current catalog id is present, visible (`removed: false`), and has the same launch/setting/action metadata unless a deliberate test fixture says otherwise.

**Acceptance:** clean build, clean tests, lint warnings reduced to zero or documented with a justified exception; the catalog contract proves no tool was removed.

## Phase 1 — common runner, state, and observability foundation

### 1. Structured events, not console scraping

Create a small shared run-event schema used by the Node bridge, Python Facebook worker, and Outreach child process:

```ts
type RunEvent = {
  schemaVersion: 1
  at: string
  runId: string
  tool: string
  phase: string
  level: 'debug' | 'info' | 'warn' | 'error'
  code: string
  message: string
  attempt?: number
  durationMs?: number
  targetHash?: string       // never a raw friend name, email, or message body
  details?: Record<string, string | number | boolean | null>
}
```

- Python workers must emit JSON Lines on **stdout** only. `stderr` is reserved for real unhandled tracebacks and process-level failures.
- Replace the current `child.stderr → error` blind append in `server/group-poster.ts` and `server/group-poster-dms.ts` with a line-buffered parser. It must preserve partial lines, parse events, and classify an unexpected non-JSON stderr line as one `worker_stderr_unparsed` warning/error.
- Continue writing human-readable summaries for the UI, but derive them from structured events. Do not copy every Python `INFO` line as a second error record.
- Give every action a run id and every browser/child process a pid plus heartbeat. Store a checkpoint after each verified target outcome.
- Create per-run `summary.json` plus bounded event files; rotate high-volume debug data by run/day and keep a compact aggregate longer. Include screenshot/artifact paths and a content hash, never credentials or message bodies.
- Build a local “Run health” summary: run status, current phase, last verified success, retry count, error code, elapsed duration, event volume, and required human action. Show it in `AutomationRunBar`, the dashboard, and Global Logs.

### 2. Shared supervision

Implement a shared child/browser supervisor (or a strictly equivalent narrow utility) with:

- one owner per worker lock and atomic acquire/release;
- heartbeat timeout and stale-lock reclamation;
- immediate abort that terminates child processes, clears timers, and persists `aborted` exactly once;
- bounded retry policy (`maxAttempts`, retryable codes, backoff/jitter, recovery hook);
- a circuit breaker for repeated transport/provider failures;
- idempotency keys and a durable outcome ledger so a restart cannot double-post, double-DM, or re-send an email;
- line-buffered stdout/stderr parsing and max message size;
- a dry-run/preflight mode that exercises login, destination, selectors, and configuration without sending/posting.

### 3. Cross-tool QOL

- Disable conflicting Start actions with the real lock owner and a one-click **Show active run** target.
- Replace generic “running” with a short verb and timer: `Checking Messenger access`, `Opening group`, `Waiting until 12:31`, `Finding leads`, `Provider unavailable`.
- Preserve completed/failed target rows with status, reason code, retry count, time, and “retry selected” where safe.
- Add fast health probes cached for a few seconds; do not block the UI on slow filesystem, vault, process-list, or network calls.
- Add a safe **Export diagnostic pack** action that contains run summary, redacted events, selected screenshots, environment/version fingerprint, and no secrets.

**Acceptance:** one simulated INFO event remains INFO end-to-end; a real stderr traceback is visible as an error; a stale process cannot leave a tool permanently locked; restart/resume never duplicates a confirmed side effect.

## Phase 2 — Friend DMs and Messenger repair

### A. Preflight and account-access state

1. Before processing a friend list, launch the persistent profile and run `Messenger readiness`:
   - Facebook session is authenticated;
   - `facebook.com/messages` is reachable;
   - the intended account/page identity is visible;
   - the composer opens in a harmless diagnostic thread or an explicitly configured owned test account.
2. Detect and classify these page states before attempting a send:
   `network_disconnected`, `chrome_error_page`, `messenger_account_access_required`, `checkpoint`, `rate_limited`, `not_messageable`, `thread_unavailable`, `restricted`, `account_unavailable`, `e2e_continue_required`, `wrong_thread`.
3. For `messenger_account_access_required` (the supplied screenshot), do not retry the target. Pause the run with an exact manual action and a screenshot. Resume only after the next preflight passes.
4. When `chrome-error://chromewebdata/` or `ERR_INTERNET_DISCONNECTED` appears, stop the inter-friend timer immediately. Run one recovery sequence: verify browser context → reopen Messenger home → revalidate identity/network → retry only the current target once. If it fails, pause the run and surface a transport error; do not burn through the remaining list.

### B. Correctness and speed

1. Keep thread selection conservative: URL/thread id match plus expected header match; if either fails, never type.
2. Split an attempt into recorded phases: `navigate`, `access_check`, `e2e_gate`, `composer_ready`, `attach`, `type`, `send`, `verify`, `checkpoint`.
3. Make attachment handling explicit: locate a Messenger-scoped file input, attach, wait for preview, then reacquire the composer. If no input/preview exists, classify `attachment_unavailable` and retry once only after a page refresh.
4. Confirm delivery using a deterministic priority order: visible send failure → outgoing bubble/message id → cleared composer with no pending attachment. Keep the current permissive fallback only when recorded as `verification_degraded`, never as an unexplained success.
5. Do not mark `delivery_failed` as permanently sent. Store it in a **needs-review** ledger with screenshot and a `retry once manually` option; only permanent account/access states should be suppressed automatically.
6. Remove fixed sleeps wherever a DOM/network state can be awaited. Keep intentional compliance pacing configurable, displayed, and interruptible; start it only after a verified outcome or intentional skip.
7. Persist a per-friend state machine: `pending → attempting → sent | skipped_reason | needs_review | failed_retryable`. Resume from that ledger rather than reconstructing from a loose sent-id list.

### C. DM tests

- Fixture tests for every access/reason code, especially the screenshot’s “can’t access this chat yet” state.
- Playwright fake-page tests for E2E Continue, wrong thread, missing composer, attachment preview missing, send rejection, and delivery verification variants.
- Supervisor tests: disconnected page stops wait, performs one recovery, then pauses; abort during sleep terminates immediately; restart does not re-send verified targets.
- Real manual acceptance: owned test account only, 3-target no-send preflight, then a single controlled message with browser visible. Validate event timeline and redaction.

**Acceptance:** a blocked/non-accessible Messenger account never causes repeated DM attempts; network loss pauses promptly; every sent/skipped/reviewed target has an explainable stored outcome; real warning/error rate matches actual defects.

## Phase 3 — Facebook Group Poster repair

### A. Prepare the queue before posting

1. Make the existing **Scan Buy & Sell** step a first-class preflight. Cache group capabilities with timestamp and evidence:
   `regular_post_supported`, `buy_sell`, `not_member`, `admin_approval`, `wrong_redirect`, `composer_missing`, `unknown`.
2. At Start, display a queue preview: candidates, excluded groups grouped by reason, stale scan results, and a “scan first” recommendation. Do not force the operator through 35 known unsuitable groups.
3. Filter known unsuitable/stale groups before opening post pages, while retaining the groups and their reason history—nothing is removed from the user’s tool/catalog.
4. Verify navigation landed on the expected group id and title before any interaction. Wrong redirects become a skipped target with a screenshot.

### B. Post state machine

1. Use explicit phases: `open_group`, `membership`, `group_type`, `open_composer`, `composer_identity`, `attach`, `fill`, `submit`, `posting_confirmation`, `optional_comment`, `checkpoint`.
2. Treat every selector set as a versioned capability probe. Record selector name, count, visibility, and page/UI signature on failure, rather than only “dialog did not open.”
3. Never type into comment fields while the post composer is missing; retain the existing safety guard and add a regression test for it.
4. For “dialog still open,” perform one precise recovery (dismiss overlays/reacquire composer) then classify `post_submit_not_confirmed` and stop that group. Do not infer success.
5. Attach image only after confirming the group composer surface. Store attachment/preview evidence and distinguish `file_input_missing`, `preview_missing`, and `upload_timeout`.
6. Persist group outcomes and warm-resume checkpoints atomically. A rerun skips confirmed post ids but lets the operator review/retry only unresolved groups.

### C. Group Poster tests

- Deterministic DOM fixtures for normal groups, Buy & Sell, admin approval, not-member/join, wrong redirect, hidden composer, stale overlay, comment-box trap, attachment success/failure, and abort.
- Preflight queue test proves unsuitable groups are excluded from active posting but remain visible in the group list/history.
- Run tests ensure `posted` is counted only after confirmation and a resume cannot duplicate it.
- One manual browser-visible dry run against a safe group/test environment before a real batch.

**Acceptance:** a real posting batch starts with only eligible groups; every group has an outcome code; no text reaches a comment field unless an optional, post-confirmed comment phase is running; recovery is faster because known bad destinations are skipped upfront.

## Phase 4 — Outreach repair and performance

### A. Stop runaway find chains

1. Replace the current empty-find refill loop with a per-profile circuit breaker. Default policy: one finder wave, at most two short recovery attempts only if diagnostics show a transient provider failure, then mark the profile `exhausted/no_yield` and advance or pause. Make thresholds visible/configurable, not hidden constants.
2. Track a query/domain/provider ledger with a fingerprint, last attempted time, observed yield, rejection reason, and cooldown. Never regenerate a query/domain known to be exhausted until its cooldown has passed or settings materially change.
3. Enforce per-run budgets: maximum queries, pages, domains, child processes, wall-clock time, zero-result waves, and log events. Stop on budget exhaustion with a clear result, not more refills.
4. Separate **zero result** from **provider unavailable**. A zero result advances the strategy/profile; a provider failure triggers bounded retry/backoff and provider health display.
5. Before expensive scraping, run a fast discovery/yield sample. If the sample produces no viable URLs/emails, stop the full scrape and surface the evidence.
6. Prevent HMR and chain re-entry from starting a second finder. Keep one epoch/run owner, await the previous child’s confirmed exit, and make cancellation idempotent.

### B. Make sends resilient and auditable

1. Give each recipient/message an idempotency key. Write `sending` before the provider call and a terminal `sent`/`failed` outcome after it, so restart recovery can safely query/reconcile rather than blind-retry.
2. Add provider health: classify DNS/network/HTTP/credential/template errors; use a small exponential-backoff retry for transient failures; open a provider circuit after a threshold and pause instead of producing hundreds of `fetch failed` events.
3. De-duplicate recipient sources, rejected addresses, and recent failures before enqueue. Keep failures reviewable; never silently drop them.
4. Compute progress from useful work: viable leads found, clean-pass rate, approved, provider accepted, provider failed—not from raw queries or output line count.
5. Show an estimated stage duration based on recent percentile timings, with the current limiting factor (search, scrape, clean, provider, quota) and one relevant action.

### C. Outreach tests

- Use fake finder outputs to prove a 0-result profile stops within the retry/budget policy and cannot create a 1,000+ wave loop.
- Test chain progression, HMR/restart, abort, stale child cleanup, quota, profile transitions, and no concurrent finder children.
- Test provider timeout/fetch failure: bounded retry, circuit open, no duplicate email, recovery after health probe.
- Test cache/ledger decisions and assert a known exhausted query/domain is not re-used before cooldown.

**Acceptance:** an empty profile produces one concise explanation and moves on/stops within bounded work; a provider outage pauses quickly; sender recovery is idempotent; the UI can explain where time was spent.

## Phase 5 — all other tools, without feature churn

For every existing tool in `TOOL_CATALOG` (Scraper, DC Scraper, Newsletter Sender, PostMaker, UGC Slides, One-Shot, AI Lead Finder, Gmail Script, Motion Blur, Video Creator, Ollama, Tavo Knyga UI, Recipe Factory, Recipe Health, SEO Blog Pipeline, Autoplius Tracker, Reddit):

1. Assert its catalog record and bridge launch record exist and are compatible.
2. Add a **non-destructive** readiness check: path exists, entry command/file exists, runtime is discoverable, required settings are present (names only—never values), and known dependencies are reachable when a cheap local probe exists.
3. Standardize launch diagnostics: working directory, command fingerprint, spawn time, pid, first meaningful output, exit code, and concise failure code.
4. Add smoke tests that mock process launch; do not automatically run tools with external side effects, post content, send messages, or make purchases.
5. Leave each tool’s behaviour, UI, and activation state as-is unless a concrete failed readiness/smoke test justifies a separate follow-up.

This meets the “every tool improved” requirement through reliable visibility, safe startup, and actionable diagnostics while avoiding a disruptive rewrite of unused tools.

## UI/QOL implementation checklist

- A single **Run Health** chip above each automation: `Ready`, `Needs login`, `Network recovery`, `Provider down`, `Paused`, `Done`, `Needs review`.
- A compact event timeline with meaningful milestones by default; debug details are expandable, filterable, and downloadable.
- One `Fix it` action per actionable state: **Show browser**, **Run preflight**, **Open Messenger login**, **Retry selected**, **Clear stale lock**, **View screenshot**, **Export diagnostic pack**.
- Settings validation before Start with inline fixes; no launch just to discover an empty message, missing image, invalid interval, missing credentials, or empty recipient/group list.
- Fast saved queue/search/filter state, visible active configuration snapshot, and per-run copyable identifier.
- Responsive polling/SSE: active run gets pushed or light polling; inactive panels do not repeatedly deserialize giant log files.

## Implementation sequence for Cursor

1. Create a branch/work checkpoint. Read this plan, `ARCHITECTURE.md`, the current runner code, and the newest logs. Do not delete any catalog entry.
2. Make Phase 0 pass; commit/checkpoint it separately.
3. Implement the event schema, line buffering, rotation, and shared supervisor with unit tests. Migrate Friend DMs first; prove false INFO-as-error records disappear.
4. Repair Friend DMs and complete its test matrix plus one controlled manual dry run.
5. Repair Group Poster and complete its test matrix plus one controlled manual dry run.
6. Repair Outreach circuit breakers/ledgers/provider health and run the chain/send tests.
7. Add common readiness/smoke coverage for the remaining catalog without changing their behaviour.
8. Run the full gates after every phase. At the end, execute one small real-world canary for each active workflow, inspect the diagnostic pack, then expand batch limits gradually.

## Completion dashboard

| Gate | Required proof |
|---|---|
| No tool removal | catalog-contract test + unchanged catalog inventory |
| Shippable app | `npm run build`, `npm test`, and `npm run lint` pass |
| Truthful logs | fixture proves INFO, warning, and error retain correct levels; no duplicate stderr INFO errors |
| DM reliability | account/network/attachment/composer cases pass; blocked Messenger access pauses with a human action |
| Group Poster reliability | preflight filters unsuitable groups; post confirmation and resume tests pass |
| Outreach reliability | zero-yield and provider-failure circuit breakers pass; no duplicated send on restart |
| Better UX | all active runs show phase, progress, timer, error code, evidence, and next action |
| Other tools preserved | every catalog tool passes non-destructive launch/readiness contract |

## Explicitly out of scope for this pass

- Instagram/One-Shot feature redesign or optimization.
- Removing tools, profiles, settings, existing logs, or user data.
- Bypassing Facebook/Messenger authentication, access restrictions, rate limits, or platform controls.
- Automatically sending/posting as part of tests; manual canaries must use a deliberately chosen safe target and the operator’s existing authority.
