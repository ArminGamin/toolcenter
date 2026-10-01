# UGC Batch Tool — Fortress Plan A→Z

**Goal:** Make `ugc-lt-gpu` batch generation fast, abortable, grammatically shipable, and restart-safe — end to end.

## Universal-fix doctrine (NON-NEGOTIABLE)

**You will NOT sit and paste every bad slide forever.** The system must generalize.

| Forbidden | Required |
|-----------|----------|
| One-off patches for one Discord quote (`valgoi` only) | Pattern classes that catch the whole family (`…oi` false 2sg / conjugation checker / morphology cues) |
| Agent rewrites slides in chat | **Ollama SYSTEM + skills** teach; **normalize/gates** catch leftovers |
| Waiting for you to screenshot | Auto-mine `D:\ugc-batch-vision` after every COMPLETE → cluster → **promote to universal rule** |
| Growing infinite `PHRASE_FIXES` as the main fix | Phrase bank = **seed examples** only; real fix = regex/classifiers/gates + model rules |
| “Fix this word” tickets | “Close this **failure class** forever” tickets |

**Promotion pipeline (every bad slide must end here):**
1. Observe (vision audit / Discord / pc-log) → exact quote
2. Cluster into a **class** (conjugation, missing `?`, gender flip, early pitch, logic leap, near-dup, stump…)
3. Write a **general** repair + hard gate + 3–5 synthetic variants in tests (not only the one quote)
4. Mirror class in Modelfile SYSTEM / skill (1–3 bullets)
5. Rebuild model if SYSTEM changed
6. Re-run batch — class must not recur; if it does, tighten class, don’t add another one-liner

**Phrase bank rule:** adding a single string replace is allowed only as a **temporary bridge** while the class gate ships in the same PR. Never ship phrase-only as the deliverable.

---

**Evidence (2026-08-08):**
- UI: Post 1/5 still generating at **8:11+** with slideMax **7**
- `pc-logs/server.jsonl`: **post-05 / post-09 / post-10 / post-11** all hitting **90s timeouts in parallel** while one UI run shows post-1
- `audit/SESSION.json`: one “ok” post took **13 Ollama calls / ~22.5 min** (`durationMs: 1350254`)
- `batch-run.json`: status `running`, abortRequested `false`, encoding corruption in CTA/messages
- Abort UX: “Stopping now…” for minutes; Generate resumes “random” leftover run
- Discord Aug-8 shipped posts: typos (`valgoi`), missing `?`, missing commas, gender flip mid-post, wrong verb (`pasitaikyti`), early pitch, caption = slide dump

---

## North-star acceptance criteria

| # | Criterion | Pass bar |
|---|-----------|----------|
| 1 | Abort | Abort → UI idle ≤2s; no new Ollama calls; no vision/Discord; Generate starts a **new** run |
| 2 | Speed | 5 posts × 4 slides, test mode: **≤10 min** wall clock, median **≤2 Ollama calls/post** |
| 3 | Single-flight | At most **one** batch loop + **one** Ollama request at a time |
| 4 | LT shipable | Failure **classes** closed universally (not one word); zero need for you to paste each slide |
| 9 | Hands-off QA | After COMPLETE, mine→cluster→universal rule; you only approve big class changes |
| 5 | Honest UI | Estimate matches reality; status never stuck on zombie “generating” |
| 6 | Persistence | Crash/restart never reanimates aborted runs or double-burns themes/images |
| 7 | Discord | Optional; never blocks abort; never double-posts; caption ≠ raw slide dump |
| 8 | Vision audit | One audit slot per post; COMPLETE.md after target; mineable |

---

# A — Process lifecycle (Abort / Start / Restart)

### A1. Single-flight Ollama mutex
**Bug:** Multiple zombie loops call `/api/generate` concurrently → everyone times out at 90s.
**Fix:**
- Global `ollamaInflight` mutex in `ollama-client.ts`
- Reject / queue second callers; log `ollama_mutex_wait` / `ollama_mutex_busy`
- Hard kill previous fetch on abort (signal already wired — verify process actually stops)

### A2. Hard abort that cannot continue
**Bug:** Flag-only abort; in-flight 90s call finishes; loop writes `ready` over `aborted`.
**Fix:**
- Keep `AbortController` + `batchRunGeneration` (already started)
- On abort: abort signal, bump generation, mark generating posts `failed/aborted`, `releaseUgcOllamaAfterBatch`, **clear** `loopPromise` ownership
- After abort: **refuse** disk reattach of `status=running` unless `loopPromise` owned by this process + matching generation
- Add `forceKillUgcBatch()` API: abort + clear disk + unload model

### A3. Start never reattaches ghosts
**Bug:** `startUgcBatchRun` / `initUgcBatchRunFromDisk` reattaches `status=running` from disk → “random run”.
**Fix:**
- On server boot: if disk `running` older than N minutes OR no live loop → mark `aborted` / `stale`
- Start always creates **new** `runId` UUID; UI shows runId
- Never resume aborted/stale runs

### A4. Client abort is immediate
**Bug:** UI stays busy until poll sees terminal status; vision render continues.
**Fix (partial done — verify):**
- `batchStoppedRef` stops render/Discord immediately
- `setBatchBusy(false)` on abort click
- Poll must not set `batchBusy=true` for aborted/stale
- Abort button always available while `busy || server.status=running`

### A5. Clear + Generate contract
- Abort → Clear (optional auto) → Generate
- Expose Clear in UI when status ∈ {aborted, error, done, ready}
- `clearUgcBatchRun` deletes `batch-run.json`

**Files:** `server/ugc-batch-run.ts`, `src/components/ugc-slides/UgcSlidesBatchTab.tsx`, `src/lib/ugc-batch-run.ts`, routes

---

# B — Speed & Ollama performance

### B1. Kill timeout retry storms
**Evidence:** timeout → chunk_fail → retry → shrink → another 90s → post burns 13+ calls.
**Fix:**
- Classify `timeout` / `AbortError` as **non-retryable** (or max 1 retry with smaller chunk only)
- On timeout: ship **fallback chunk** immediately (already exists) — do not burn 3×90s
- Cap total Ollama wall time per post (e.g. 180s) then force-fallback remaining slides

### B2. Realistic slide budget
**Bug:** UI allows 4–7 slides; estimate assumes ~2 calls/post; 6–7 slides = 3 chunks + retries.
**Fix:**
- Default slideMax **4**; warn when >5
- Cap batch slideMax at **5** unless “slow mode” checked
- Estimate formula must use worst-case: `calls = ceil(slides/chunk) * qualityAttempts * shrinkDepth` + warm

### B3. Chunking strategy
- Prefer **1 chunk for ≤4 slides**, **2 for 5–6**, never 3 unless necessary
- Close-slide split: keep, but don’t retry close via LLM if auto-fix exists
- Lower `numPredict` / tighten JSON schema to cut eval time

### B4. Model load / keep-alive
- Warm once per batch; skipWarm for posts 2..N
- On abort: unload / short keepAlive so next start isn’t fighting a stuck runner
- Detect GPU thrash: if first call >60s empty → surface “Ollama overloaded / zombie jobs”

### B5. Concurrent audit zombies
**Evidence:** post-05 and post-11 both calling Ollama during one UI batch.
**Fix:**
- Audit `beginUgcAuditPost` must refuse if another post is `active` for generation
- Or bind audit postId to `runId` and ignore foreign posts
- On abort: finalize/cancel open audit posts

**Files:** `server/ollama-client.ts`, `server/ugc-story-engine.ts`, `server/ugc-batch-audit.ts`, `UgcSlidesBatchTab.tsx` estimate

---

# C — Gate / retry architecture (stop burning minutes)

### C1. Separate hard-fail vs auto-fixable
Already partially done — complete matrix:

| Gate | Action |
|------|--------|
| timeout / abort | no LLM retry; fallback or stop |
| truncated JSON | 1 predict bump retry max |
| shipable / stump / ? missing | programmatic repair, then accept |
| near-duplicate | repairStoryOrderAndRepeats, no LLM |
| close loops hook | auto-fix only |
| gibberish / bad stem | phrase bank first; 1 LLM retry max |
| true empty / model down | fail post fast |

### C2. Remove code-order landmines
**Bug:** `splitShipableSentences is not defined` → instant chunk_fail storms.
**Fix:**
- Lint/test that all helpers used in hot path are defined before use (or hoist)
- Smoke test: generate 1 post in CI without Ollama mock covering import graph

### C3. Rescue budget
- Max LLM attempts per chunk: **2** (keep)
- Max shrink levels: **1** (2→1), then fallback
- Max Ollama calls per post: **4** hard cap → then fallback remaining

**Files:** `server/ugc-story-engine.ts`, `server/ugc-lt-normalize.ts`, tests

---

# D — Lithuanian copy quality (UNIVERSAL classes, not word patches)

**Rule:** Writing rules live in Ollama Modelfile + `UGC_OLLAMA_SYSTEM_PROMPT` + skills — **not** Cursor-only.  
Normalize/gates = **class firewall**. Model SYSTEM = **primary teacher**.  
Your Discord screenshots are **training signal for classes**, not a forever review queue.

### D0. Class catalog (ship these as systems)

Every Aug-8 bug maps to a **class** — fix the class once:

| Class ID | What it catches (family) | Universal mechanism |
|----------|--------------------------|---------------------|
| `conj_2sg` | Wrong 2sg present (`valgoi`, `mėgaujiesi`, similar -oi/-iesi inventeds) | Stem/suffix validator + PHRASE as seeds only; expand LT finite-verb cue list |
| `agr_number` | Singular/plural noun-adj mismatch (`Greitas angliavandenis`) | Agreement heuristics for common nutrition nouns |
| `qmark_title` | Any colon / leading `ar|ką|kodėl|kaip|kur|kada` title missing `?` | **Generic** title interrogative repair (already started — finish + harden) |
| `qmark_sent` | Sentence starts with Ar/Jauti/Ar jauti… but ends `.` | Generic sentence-interrogative `?` enforcer |
| `comma_subord` | Missing comma before `kas/ką/kaip/kodėl/kur/kada` after verb | **Generic** comma rule (not one phrase) |
| `gender_lock` | Mixed m/f participles/adjectives in one post | Pick gender at post start → rewrite/gate all slides to that gender |
| `verb_sense` | Near-miss verbs (`pasitaikyti` vs `prisitaikyti`) | Confusion-pair table **by lemma pair**, not one sentence |
| `early_pitch` | `Tavo knyga…` / `Dabar (žinai\|supranti\|gali)…` before close | Role-aware pitch gate (pattern, not one string) |
| `theme_fidelity` | Slide drifts off theme hook/body | Overlap/keyword bridge score vs theme; rewrite or fail class |
| `logic_leap` | Unexplained causation / weird question pivots | Soft score + ban “X priklauso nuo Y” without prior setup |
| `stump_slide` | Orphan 2–4 word “sentence” slides | mergeStub + min info gate |
| `near_dup` | ≥85% word overlap across slides | Already started — keep as class, not exact string |
| `caption_dump` | Caption ≈ concat(slides) | Template caption only; overlap gate |
| `hook_echo` | Close restates hook | Existing auto-fix class |
| `bad_stem` | Invented LT stems | Stem list + morphology refuse; mine→cluster→add **pattern** |

**If a new Discord typo appears:** do **not** open a “fix this word” task. Open “extend class X” or “new class Y with N synthetic tests”.

### D1. Model fortress (teach classes, not quotes)
- SYSTEM lists **class bans** in compact bullets (conjugation, gender lock, `?`, commas, pitch timing, theme stay)
- Sync Modelfile ↔ `UGC_OLLAMA_SYSTEM_PROMPT` ↔ skills
- Rebuild after SYSTEM change
- Default CTA: `Pradėk 5 min. testą! 🤩`

### D2. Auto-mine → universal promote (replaces you pasting slides)
After every vision COMPLETE (skill `ugc-vision-mine`):
1. Extract every bad LT span from finals + quality-scan
2. Cluster by class ID (edit-distance / rule hit / lemma)
3. Output a **PR-shaped delta**: gate regex, 5 synthetic tests, 1 SYSTEM bullet
4. Human (you) only reviews the **class delta**, not each slide forever

### D3. Grammar firewall (repair then hard-fail)
Same table as D0 — implement as:
- `normalizeLtCopy`: auto-repair when safe
- `assertShipable` / `collectStoryIssues`: hard-fail class codes
- Never rely on “hope the model remembered that one word”

### D4. Sentence merge / stubs → class `stump_slide`
### D5. Logic & story sense → classes `theme_fidelity`, `logic_leap`, `early_pitch`, `gender_lock`
### D6. Discord Aug-8 = **fixtures for classes** (not the product)
Use Posts A/B as regression seeds; generate synthetic variants in tests so the next unseen typo in the same family dies too.

**Files:** Modelfile, `ugc-lt-normalize.ts`, `ugc-copy-skill.ts`, `ugc-story-engine.ts`, `ugc-hook-templates.ts`, `ugc-caption-format.ts`, tests, vision-mine skill

---

# E — Slide repetition & story structure

### E1. Class `near_dup` (universal overlap, not exact match)
### E2. Ban-block size cap (speed)
### E3. Classes `qmark_title`, `hook_echo`, `early_pitch`
### E4. Class `caption_dump`

**Files:** `ugc-story-engine.ts`, `ugc-hook-templates.ts`, `ugc-caption-format.ts`

---

# F — Captions, CTA, Discord

### F1–F3 unchanged intent — gates are class-based (`caption_dump`, CTA normalize, abort-safe publish)

---

# G — Vision audit & mining loop

### G1. One session ↔ one batch runId
- Reset audit only when starting **new** runId
- Don’t leave `active: true` with foreign post-NN slots from zombies
- Vision badge in UI must show **this run’s** completed/remaining, not stale session

### G2. Post folders
- post-01..post-N only for current target
- On abort: write `09-error.json` reason=aborted; close session

### G3. Automatic mine after COMPLETE
- Agent skill `ugc-vision-mine` after every COMPLETE.md
- Feed phrase bank + regression tests from exact bad LT quotes

**Files:** `server/ugc-batch-audit.ts`, UI audit badge, `.cursor/skills/ugc-vision-mine`

---

# H — UI honesty & ergonomics

### H1. Honest estimates
Replace optimistic formula with measured percentiles from last N pc-log runs, or conservative:
`posts * (warm?45s:0 + calls*55s + discord*10s)` with slideMax.

### H2. Live diagnostics strip
Show during run:
- runId
- current post / chunk / attempt
- last Ollama ms
- calls this post / batch
- abortRequested / generation
- “zombie detected” if >1 inflight

### H3. Results + elapsed
- Elapsed freezes on abort
- Results show failed/aborted posts explicitly
- Never blank “Batch results will appear…” while post generating for 8+ min without heartbeat

### H4. Defaults that don’t self-sabotage
- slideMin/Max default **4 / 4** (or 4 / 5)
- batch count default 5
- test mode clearly labeled
- Big red warning when slideMax ≥ 6: “Slow: 3+ Ollama chunks/post”

**Files:** `UgcSlidesBatchTab.tsx`, prefs

---

# I — Themes & image pools

### I1. Theme consume rules
- Test mode must not permanently burn themes (verify)
- Abort mid-post must not consume images for unfinished posts
- Image consume only after copy ready **and** save (or clearly document current order)

### I2. Encoding / LT in theme pool
- Fix mojibake in theme bodies written to disk
- Validate UTF-8 on persist

### I3. Reset pool UX
- Keep reset; confirm; refresh meters

**Files:** `server/ugc-theme-pool.ts`, `server/ugc-image-pool.ts`, batch-run consume timing

---

# J — Persistence, encoding, server boot

### J1. `batch-run.json` contract
- Include `runId`, `generation`, `serverPid`, `schemaVersion`
- Atomic write (temp + rename)
- UTF-8 always

### J2. Boot hygiene
`initUgcBatchRunFromDisk`:
- If running & age > 2 min & no loop → mark aborted
- Never auto-resume multi-hour ghosts

### J3. Hot reload
- Document: Control Center **must restart** after server TS changes
- Optional: version stamp in `/api` so UI warns “server stale”

---

# K — Observability

### K1. Structured pc-log events (required)
Always emit:
- `batch_begin` {runId, count, slideMin, slideMax}
- `ollama_call` {runId, postId, durationMs, error?}
- `chunk_fail` {gate, attempt, nonRetryable?}
- `batch_run_abort` {runId, inflightCancelled}
- `batch_zombie_suppressed` when stale gen tries to write

### K2. Kill debug fetch noise after verified
- Remove session `852635` ingest logs once abort/speed verified
- Keep pc-logs as source of truth

### K3. Operator dashboard (optional later)
- Last 20 runs: p50/p95 time, calls/post, abort rate, timeout rate

---

# L — Testing fortress

### L1. Unit / table tests (existing + expand)
- Phrase bank quotes from vision
- Near-dup pairs from Discord
- Interrogative titles / commas / pitch FP
- Abort signal cancels `ollamaGenerateJson` (mock fetch)

### L2. Lifecycle integration tests
- start → abort mid-fake-await → status aborted, no further posts
- start while zombie loop → generation bump, only new run writes
- disk running stale on init → aborted

### L3. Speed regression gate
- Mock Ollama 200ms: 5 posts finish <2s
- Real optional nightly: 1 post ≤90s on GPU machine

### L4. Encoding tests
- CTA round-trip UTF-8 through persist

---

# M — Implementation order (do in this sequence)

### Phase 0 — Stop the bleeding (1 session)
1. **Ollama single-flight mutex** + kill concurrent zombies
2. **Non-retryable timeouts** + hard call cap per post
3. **Boot: never resume stale running disk**
4. **Abort: bump gen + cancel signal + UI idle** (verify with pc-logs)
5. Restart server; abort test; confirm **zero** ollama_call after abort

### Phase 1 — Speed defaults
6. Default/cap slideMax; honest estimate; UI warning
7. Fallback-after-1-timeout; max 4 calls/post
8. Audit session bound to runId

### Phase 2 — Universal copy classes (NOT word-by-word)
9. Lock **class catalog** (D0) into normalize + story issues + SYSTEM bullets
10. Auto-mine COMPLETE → cluster → promote to class (vision-mine skill upgrade)
11. Gender lock / early_pitch / qmark / comma_subord / near_dup / caption_dump as systems
12. Confusion-pair table + conjugation family checks (seeds from Aug-8, coverage via synthetics)
13. Tests: each class has ≥5 variants; exact Discord quotes are fixtures only
14. Sync Modelfile + skills + normalize → rebuild `ugc-lt-gpu`
15. **Ban** PRs that only add one PHRASE_FIX without a class/test

### Phase 3 — Polish
16. Diagnostics strip (runId, calls, last ms)
17. Clear button + auto-clear on abort option
18. UTF-8 persist fix
19. Remove debug instrumentation
20. Docs: operator runbook (restart, slideMax 4, abort, mine)

### Phase 4 — Hardening
21. Integration tests for abort/zombie
22. Optional metrics from pc-logs
23. CI smoke without GPU
24. Ongoing vision-mine → bank after every COMPLETE batch

---

# N — Explicit non-goals (do not boil ocean)

- Rewriting the whole slideshow renderer
- Replacing Ollama with cloud APIs (unless later)
- Perfect literary LT — **shipable + class-gated + coherent** is enough
- You pasting every Discord slide as the QA loop (replaced by vision-mine → class promote)
- Infinite one-line `PHRASE_FIXES` as the product

---

# O — Runbook (operator, every batch)

1. Restart Control Center after code pulls
2. slideMax **4** (max 5)
3. Confirm Ollama Ready + only one ugc process
4. Generate → if Abort: wait ≤2s for Stopped; if not, Force Kill + restart
5. After 5 vision posts: run ugc-vision-mine → apply phrase/grammar/logic deltas → rebuild model if SYSTEM changed
6. Spot-check Discord: `?` on hooks, no gender flip, no `valgoi`-class typos, caption not a slide dump
7. Never start a second batch while pc-log shows foreign post-Ids calling Ollama

---

# P — Definition of Done (whole tool)

- [ ] Abort stops all Ollama within 2s (log proof: no calls after abort ts)
- [ ] No overlapping postIds in pc-logs during one UI run
- [ ] 5×4 slides batch ≤10 min typical
- [ ] Median ≤2 Ollama calls/post on clean run
- [ ] Discord Aug-8 failure classes all have bank/gate + passing tests (`valgoi`, `?`, comma-kas, gender lock, pasitaikyti, early pitch, stump, caption dump)
- [ ] Near-dup / typo classes from last vision batch have tests + bank entries
- [ ] Estimate within ~2× of actual
- [ ] Stale disk never auto-resumes
- [ ] CTA UTF-8 correct on disk and Discord
- [ ] Vision session matches runId; COMPLETE mineable
- [ ] Debug ingest logs removed after verification

---

# Q — Known open bugs (current)

**Phase 0 (runtime):**
1. Concurrent zombie Ollama jobs (post-05/09/10/11 timeouts)
2. Abort ineffective without mutex + stale-disk kill
3. slideMax 7 + lying estimate
4. Audit SESSION leftover / foreign posts
5. Mojibake in batch-run CTA
6. Retry-on-timeout multiplies 90s failures

**Phase 2 (copy — Discord Aug-8 evidence):**
7. `valgoi` shipped in hook + caption
8. Missing `?` on `…: ar …` titles
9. Missing comma before `kas`
10. Gender flip within one post (m/f participles)
11. `pasitaikyti` used where `prisitaikyti` meant
12. Early `Tavo knyga padės` / `Dabar supranti` mid-carousel
13. Logic leaps (sport results ↔ shopping list) without bridge
14. Caption = verbatim multi-slide paste
15. Stump slide bodies (`Pamiršti svarbiausią dalyką.`)

---

# R — File ownership map

| Area | Primary files |
|------|----------------|
| Lifecycle | `server/ugc-batch-run.ts`, routes, `UgcSlidesBatchTab.tsx` |
| Ollama | `server/ollama-client.ts` |
| Story/retries/logic | `server/ugc-story-engine.ts`, `ugc-hook-templates.ts` |
| LT grammar/phrases | `server/ugc-lt-normalize.ts`, `ugc-copy-skill.ts`, `ollama/Modelfile.ugc-lt-gpu` |
| Captions | `ugc-caption-format.ts`, `ugc-cta-normalize.ts` |
| Audit | `ugc-batch-audit.ts` |
| Pools | `ugc-theme-pool.ts`, `ugc-image-pool.ts` |
| Tests | `server/__tests__/ugc-*.ts` (incl. Aug-8 Discord quotes) |
| Plan | `.cursor/plans/ugc-fortress-a-to-z.md` |

---

**Next action when you say go:** execute **Phase 0** only — mutex + non-retry timeout + stale-disk kill + abort verification with pc-log proof — before any more copy/grammar work.
