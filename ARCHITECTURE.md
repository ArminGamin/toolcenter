# Control Center — Architecture

High-level map of the Control Center hub (excluding security hardening and deployment ops).

## Stack

| Layer | Tech |
|-------|------|
| UI | React 19 + Vite + Tailwind |
| Bridge API | Node.js `connect` middleware on local HTTP |
| Workers | Python Playwright (`facebook-group-poster/worker.py`) |
| Data | `%USERPROFILE%\.control-center-data\` |

## Repository layout

```
control-center/
├── src/                    # React app
│   ├── components/         # Panels, shared UI (AutomationRunBar, TodayDashboard)
│   ├── hooks/              # useAppNavigation (hash routing)
│   └── lib/                # Client API clients per module
├── server/                 # Bridge middleware
│   ├── launch.ts           # Main middleware registry (tools, markets, outreach, …)
│   ├── hub-summary.ts      # Today dashboard aggregation
│   ├── automation-failures.ts
│   ├── group-poster*.ts    # Groups + Friend DMs state & spawn
│   ├── outreach.ts         # Email autopilot state machine
│   └── markets*.ts         # Quotes, desk signals, outcomes
└── dist/                   # Vite build (served by bridge)
```

## Navigation

Hash-based module routing via `useAppNavigation`:

- `#/` — home (Today dashboard + tool orbit)
- `#/markets`, `#/outreach`, `#/group-poster`, `#/seo-blog`, `#/notes`
- `#/tool/<id>` — individual ToolsAI tool panel

Heavy panels are lazy-loaded in `App.tsx`.

## Automation run model

`src/lib/automation-run.ts` defines shared status types (`idle`, `running`, `paused`, `waiting_login`, `sending`, …).

`AutomationRunBar` is the unified run header for:

- Group Poster
- Friend DMs
- Outreach
- SEO Blog

It shows counts, wait timers, worker PID, browser-hold hint, and action buttons.

## Hub API

| Endpoint | Purpose |
|----------|---------|
| `GET /api/hub-summary` | Module snapshots + failure count + open desk tickets |
| `GET /api/automation-failures` | List or fetch failure PNG |
| `GET /api/markets?action=outcomes-export` | Desk outcomes CSV |

## Facebook automation flow

1. Bridge receives start/pause/abort from UI.
2. Bridge spawns `worker.py` with job file under `.control-center-data`.
3. Worker polls job file for commands; updates run JSON.
4. UI polls `/api/group-poster` or `/api/friend-dms` (light poll when tab active).

Friend DM reliability features: Messenger-scoped attach detection, retry queue, failure screenshots.

## Markets desk outcomes

Armed tickets append to `desk-outcomes.jsonl`. Resolution updates rows (`hit_t1`, `stopped`, `expired`, …). `successPct` on the desk UI only uses resolved history (≥30 samples).

## Polling strategy

Panels pass `active` from parent; inactive tabs poll less frequently (e.g. Group Poster 8s vs 2.5s).

## Tests

Vitest covers:

- `automation-run` helpers
- `hub-summary` aggregation
- `automation-failures` path safety
- `quick-actions` palette builder
- Existing desk / outreach / whales server tests

Run: `npm test` and `npm run build`.
