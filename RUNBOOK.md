# Control Center — Runbook

Operational guide for day-to-day use of the ToolsAI Control Center hub.

## Start the hub

1. Launch **ToolsAI Control Center** from the desktop shortcut, or run `Start ToolsAI.bat`.
2. The bridge serves the UI at `http://127.0.0.1:PORT` (see bridge window title).
3. If the UI shows **Bridge offline**, restart the Control Center app — the local API is not reachable.

To refresh the desktop shortcut icon after updating `public/app-icon.png`, run `powershell -ExecutionPolicy Bypass -File install-desktop-shortcut.ps1` from this folder. The script writes `toolsai-icon.ico`, removes duplicate desktop shortcuts, and recreates a single shortcut on your shell Desktop. If Explorer still shows the old icon, run `ie4uinit.exe -ClearIconCache` and sign out/in.

## Home (Today dashboard)

The home view summarizes:

- Active automation runs (Outreach, Group Poster, Friend DMs)
- Open desk outcomes count
- Failure screenshot count

Click a module chip to jump straight to that panel.

## Command palette (`Ctrl+K`)

- **Hubs** — jump to Markets, Outreach, Groups, SEO Blog, Notes
- **Run actions** — pause/resume Outreach, Group Poster, or Friend DMs when a run is active
- **Tools** — launch individual ToolsAI utilities (scraper, lead finder, etc.)

## Logs (`Ctrl+L` or top bar)

| Tab | Contents |
|-----|----------|
| Console | stdout from launched tools |
| Outreach | find / clean / send activity |
| Screenshots | worker failure PNGs (Messenger / groups) |
| Failures | saved run error packs |

## Facebook Group Poster & Friend DMs

- **One Chrome profile** — log in once; Groups and Friend DMs share the same session.
- **Keep Chrome open** during runs. Closing the browser stops the worker.
- Use **Pause** or **Abort** from the run bar instead of closing Chrome.
- **Show browser** brings the automation window on-screen.
- Failed DMs save screenshots under `%USERPROFILE%\.control-center-data\group-poster\friend-dms\failures\`.

### Warm resume (groups)

If posting stops mid-run, warm progress lets you resume within ~10 minutes. **Clear warm** discards that progress.

## Outreach Autopilot

Pipeline: Find → Leads → Clean → Approve → Send.

- **Pause** stops the send loop; **Resume** continues.
- Quota is per day per send profile (shown in the run bar stats).
- Chain mode runs multiple profiles sequentially.

## SEO Blog

- **Draft mode** — posts need review before publish.
- **Auto mode** — writes, publishes, and git-pushes to tavoknyga.com.
- Set **Blogs** count (1–10) before Start.

## Markets desk

- Armed tickets log to `desk-outcomes.jsonl` in `.control-center-data`.
- Hit rates need **30+ resolved outcomes** before odds are statistically meaningful.
- **Export outcomes CSV** downloads the full outcome log from the desk tab.

## Backups & stop all

- **Backup** in the top bar snapshots Control Center data.
- **Stop all** terminates launched tool processes (not Facebook workers — use Abort on those panels).

## When something fails

1. Check **Logs → Screenshots** for worker PNGs.
2. Check **Logs → Failures** for tool crash packs.
3. Retry the run; Friend DMs automatically retry failed friends at end of queue.
4. If bridge errors persist, restart Control Center and confirm no port conflict.
