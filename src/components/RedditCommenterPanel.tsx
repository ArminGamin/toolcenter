import {
  abortRedditCommenter,
  clearRedditCommenterRun,
  continueRedditCommenterLogin,
  pauseRedditCommenter,
  resumeRedditCommenter,
  showRedditCommenterBrowser,
  unblacklistSubreddit,
  type RedditCommenterSettings,
  LT_DISCOVERY_CATEGORIES,
} from '../lib/reddit-commenter'
import { useRedditCommenterState } from '../hooks/useRedditCommenterState'
import { RedditCommenterStepLoader } from './RedditCommenterStepLoader'
import { SecretInput } from './SecretInput'
import { SaveChangesBar, SaveChangesFooter } from './ui/SaveChangesBar'
import { AutomationRunBar } from './ui/AutomationRunBar'
import { EmptyState, Field, inputCls, checkCls } from './ui/primitives'
import { BridgeOfflineBanner } from './ui/bridge-offline'
import { useEffect, useState, type ReactNode } from 'react'

function SettingsSection({
  title,
  children,
  className = '',
}: {
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={`flex min-w-0 flex-col rounded-xl border border-lineStrong bg-well/25 p-5 sm:p-6 ${className}`.trim()}
    >
      <h2 className="mb-5 text-sm font-semibold text-snow">{title}</h2>
      <div className="space-y-5">{children}</div>
    </section>
  )
}

function RedditCommenterSettingsTab({
  settings,
  loginPassword,
  setLoginPassword,
  patchSettings,
  onClearLoginSession,
  busy,
}: {
  settings: RedditCommenterSettings
  loginPassword: string
  setLoginPassword: (v: string) => void
  patchSettings: (partial: Partial<RedditCommenterSettings>) => void
  onClearLoginSession: () => void | Promise<void>
  busy: boolean
}) {
  return (
    <div className="tool-settings-grid pb-1">
      <SettingsSection title="Reddit account">
        <label className="flex items-center gap-2.5 text-sm text-mist">
          <input
            type="checkbox"
            className={checkCls}
            checked={settings.autoLogin}
            onChange={(e) => patchSettings({ autoLogin: e.target.checked })}
          />
          Auto-login with saved credentials
        </label>
        <Field label="Login method">
          <select
            value={settings.loginMethod}
            onChange={(e) =>
              patchSettings({ loginMethod: e.target.value as RedditCommenterSettings['loginMethod'] })
            }
            className={inputCls}
          >
            <option value="google">Google (password)</option>
            <option value="google_passkey">Google + passkey (manual)</option>
            <option value="reddit">Reddit username &amp; password</option>
          </select>
        </Field>
        <Field label={settings.loginMethod === 'google' ? 'Google email' : 'Reddit username'}>
          <input
            value={settings.loginUsername}
            onChange={(e) => patchSettings({ loginUsername: e.target.value })}
            className={inputCls}
            autoComplete="username"
            placeholder={settings.loginMethod === 'google' ? 'you@gmail.com' : 'reddit_username'}
          />
        </Field>
        <Field
          label={
            settings.loginMethod === 'google_passkey'
              ? 'Google password (not used for passkey)'
              : settings.loginMethod === 'google'
                ? 'Google password'
                : 'Reddit password'
          }
        >
          <SecretInput
            value={loginPassword}
            onChange={setLoginPassword}
            placeholder={
              settings.loginMethod === 'google_passkey'
                ? 'Optional — passkey is used instead'
                : 'Stored in vault'
            }
            className={inputCls}
            autoComplete="current-password"
          />
        </Field>
        <p className="text-[11px] leading-relaxed text-fog">
          Each login email or username gets its own Chrome profile, so it does not reuse your personal
          Reddit tab.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onClearLoginSession()}
          className="rounded-lg border border-line px-3 py-1.5 text-[11px] text-mist hover:border-brass/40 hover:text-brass disabled:opacity-50"
        >
          Clear saved login
        </button>
      </SettingsSection>

      <SettingsSection title="Comment generation">
        <Field label="Site mention (non-link)">
          <input
            value={settings.siteMention}
            onChange={(e) => patchSettings({ siteMention: e.target.value })}
            className={inputCls}
            placeholder="tavoknyga. com"
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Relevance threshold">
            <input
              type="number"
              min={1}
              max={10}
              value={settings.relevanceThreshold}
              onChange={(e) => patchSettings({ relevanceThreshold: Number(e.target.value) })}
              className={inputCls}
            />
          </Field>
          <Field label="Sort posts by">
            <select
              value={settings.sortBy}
              onChange={(e) => patchSettings({ sortBy: e.target.value as 'hot' | 'new' })}
              className={inputCls}
            >
              <option value="new">New</option>
              <option value="hot">Hot</option>
            </select>
          </Field>
        </div>
        <Field label="LLM provider">
          <select
            value={settings.llmProvider}
            onChange={(e) =>
              patchSettings({
                llmProvider: e.target.value as RedditCommenterSettings['llmProvider'],
              })
            }
            className={inputCls}
          >
            <option value="gemini_first">Gemini first, Ollama fallback</option>
            <option value="gemini_only">Gemini only</option>
            <option value="ollama_only">Ollama only</option>
          </select>
        </Field>
      </SettingsSection>

      <SettingsSection title="Safety & timing">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Min interval (min)">
            <input
              type="number"
              min={1}
              value={settings.minIntervalMin}
              onChange={(e) => patchSettings({ minIntervalMin: Number(e.target.value) })}
              className={inputCls}
            />
          </Field>
          <Field label="Max interval (min)">
            <input
              type="number"
              min={1}
              value={settings.maxIntervalMin}
              onChange={(e) => patchSettings({ maxIntervalMin: Number(e.target.value) })}
              className={inputCls}
            />
          </Field>
          <Field label="Daily cap">
            <input
              type="number"
              min={0}
              value={settings.dailyCap}
              onChange={(e) => patchSettings({ dailyCap: Number(e.target.value) })}
              className={inputCls}
            />
          </Field>
          <Field label="Warm-up (sec)">
            <input
              type="number"
              min={0}
              value={settings.warmupSec}
              onChange={(e) => patchSettings({ warmupSec: Number(e.target.value) })}
              className={inputCls}
            />
          </Field>
        </div>
        <Field label="Max post age (hours)">
          <input
            type="number"
            min={1}
            max={8760}
            value={settings.maxPostAgeHours}
            onChange={(e) =>
              patchSettings({ maxPostAgeHours: Math.min(8760, Math.max(1, Number(e.target.value) || 8760)) })
            }
            className={inputCls}
          />
        </Field>
        <p className="text-[10px] leading-relaxed text-fog">
          Skips threads older than this limit. Max 8760 hours (1 year).
        </p>
      </SettingsSection>

      <SettingsSection title="Lithuanian discovery" className="lg:col-span-2">
        <label className="flex items-start gap-2.5 text-sm leading-snug text-mist">
          <input
            type="checkbox"
            className={`${checkCls} mt-0.5 shrink-0`}
            checked={settings.autoDiscoverLtSubs}
            onChange={(e) => patchSettings({ autoDiscoverLtSubs: e.target.checked })}
          />
          <span>Auto-discover Lithuanian subreddits on refresh (search + curated seeds — no login needed)</span>
        </label>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {LT_DISCOVERY_CATEGORIES.map((cat) => {
            const checked = settings.ltDiscoveryCategories.includes(cat.id)
            return (
              <label key={cat.id} className="flex items-center gap-2 text-[11px] text-mist">
                <input
                  type="checkbox"
                  className={checkCls}
                  checked={checked}
                  disabled={!settings.autoDiscoverLtSubs}
                  onChange={() => {
                    const next = new Set(settings.ltDiscoveryCategories)
                    if (next.has(cat.id)) next.delete(cat.id)
                    else next.add(cat.id)
                    patchSettings({ ltDiscoveryCategories: [...next] })
                  }}
                />
                <span>{cat.label}</span>
              </label>
            )
          })}
        </div>
        <p className="text-[10px] leading-relaxed text-fog">
          Finds joined subs plus discovered communities via seeds, bilingual Reddit search, and related subs from sidebars (cities, health, food, hobbies, pets, Q&amp;A).
        </p>
      </SettingsSection>

      <SettingsSection title="Run behavior">
        <label className="flex items-start gap-2.5 text-sm leading-snug text-mist">
          <input
            type="checkbox"
            className={`${checkCls} mt-0.5 shrink-0`}
            checked={settings.autoPost}
            onChange={(e) => patchSettings({ autoPost: e.target.checked })}
          />
          <span>Auto-post without review — scan-and-post will publish drafts immediately</span>
        </label>
        <label className="flex items-start gap-2.5 text-sm leading-snug text-mist">
          <input
            type="checkbox"
            className={`${checkCls} mt-0.5 shrink-0`}
            checked={settings.shuffleSubreddits}
            onChange={(e) => patchSettings({ shuffleSubreddits: e.target.checked })}
          />
          <span>Shuffle subreddit order each run</span>
        </label>
      </SettingsSection>
    </div>
  )
}

export function RedditCommenterPanel({ active = true }: { active?: boolean }) {
  const vm = useRedditCommenterState(active)
  const {
    panelTab,
    setPanelTab,
    state,
    settings,
    loginPassword,
    setLoginPassword,
    busy,
    toast,
    offline,
    loadError,
    subFilter,
    setSubFilter,
    queueFilter,
    setQueueFilter,
    editingComment,
    setEditingComment,
    patchSettings,
    saveChanges,
    unsavedChanges,
    run,
    status,
    workerRunning,
    filteredSubreddits,
    filteredQueue,
    selectedSet,
    pendingCount,
    approvedCount,
    headerMessage,
    blacklist,
    onScan,
    onPost,
    onScanAndPost,
    onRefreshSubreddits,
    onJoinSubreddits,
    toggleSubreddit,
    toggleSelectAllVisible,
    allVisibleSelected,
    clearSelection,
    onApprove,
    onSkip,
    onApproveAll,
    onSaveComment,
    onClearQueue,
    onBlacklistSelected,
    onClearLoginSession,
    flash,
    refresh,
  } = vm

  const runActive =
    status !== 'error' &&
    (status === 'running' || status === 'waiting_login' || status === 'paused' || workerRunning)

  const canAbort = runActive

  const [elapsedMs, setElapsedMs] = useState<number | null>(null)
  useEffect(() => {
    if (!runActive || !run?.createdAt) {
      setElapsedMs(null)
      return
    }
    const start = Date.parse(run.createdAt)
    if (!Number.isFinite(start)) return
    const tick = () => setElapsedMs(Date.now() - start)
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [runActive, run?.createdAt, run?.id])

  const subredditCount = state?.subreddits?.length ?? 0
  const postedQueueCount = (state?.queue ?? []).filter((q) => q.status === 'posted').length
  const matchedCount = run?.matched ?? pendingCount + approvedCount + postedQueueCount

  async function onAction(action: string) {
    const map: Record<string, () => Promise<{ ok: boolean; message: string; state?: unknown }>> = {
      pause: pauseRedditCommenter,
      resume: resumeRedditCommenter,
      abort: abortRedditCommenter,
      'continue-login': continueRedditCommenterLogin,
      'show-browser': showRedditCommenterBrowser,
      'clear-run': clearRedditCommenterRun,
    }
    const fn = map[action]
    if (!fn) return
    const result = await fn()
    flash(result.message)
    if (result.state) await refresh()
    else await refresh({ light: true })
  }

  if (!settings || !state) {
    return (
      <div className="p-6">
        {offline ? <BridgeOfflineBanner message={loadError || 'Bridge offline'} /> : null}
        <p className="text-sm text-fog">Loading Reddit Commenter…</p>
      </div>
    )
  }

  return (
    <div className="tool-workspace flex flex-col gap-6">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <h1 className="text-2xl font-semibold tracking-tight text-snow">Reddit Commenter</h1>
        <SaveChangesBar compact className="ml-auto" dirty={unsavedChanges} busy={busy} onSave={() => void saveChanges()} />
      </header>
      {offline ? <BridgeOfflineBanner message={loadError || 'Bridge offline'} /> : null}
      {toast ? (
        <div className="rounded-lg border border-lineStrong bg-well px-3 py-2 text-sm text-mist">{toast}</div>
      ) : null}

      <AutomationRunBar
        run={{
          id: run?.id || '',
          status,
          message: headerMessage || run?.message,
          error: run?.error,
          sent: run?.posted,
          failed: run?.failed,
          total: run?.total,
          currentItem: run?.currentPost || run?.currentSubreddit || undefined,
          waitEndsAt: run?.waitEndsAt,
          waitLabel: run?.waitLabel,
          workerRunning,
          workerPid: state.workerPid,
        }}
        actions={
          <>
            {!runActive ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onScan()}
                  className="rounded-lg border border-brass/40 bg-brass/10 px-3 py-1.5 text-[11px] text-brass"
                >
                  Scan
                </button>
                <button
                  type="button"
                  disabled={busy || approvedCount === 0}
                  onClick={() => void onPost()}
                  className="rounded-lg border border-phosphor/40 bg-phosphor/10 px-3 py-1.5 text-[11px] text-phosphor"
                >
                  Post approved ({approvedCount})
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onScanAndPost()}
                  className="rounded-lg border border-line px-3 py-1.5 text-[11px] text-mist"
                >
                  Scan &amp; post
                </button>
              </>
            ) : null}
            {status === 'waiting_login' ? (
              <button
                type="button"
                onClick={() => void onAction('continue-login')}
                className="rounded-lg border border-brass/40 px-3 py-1.5 text-[11px] text-brass"
              >
                Continue login
              </button>
            ) : null}
            {runActive ? (
              <>
                {status === 'paused' ? (
                  <button type="button" onClick={() => void onAction('resume')} className="rounded-lg border border-line px-3 py-1.5 text-[11px]">
                    Resume
                  </button>
                ) : (
                  <button type="button" onClick={() => void onAction('pause')} className="rounded-lg border border-line px-3 py-1.5 text-[11px]">
                    Pause
                  </button>
                )}
                <button type="button" onClick={() => void onAction('show-browser')} className="rounded-lg border border-line px-3 py-1.5 text-[11px]">
                  Show browser
                </button>
              </>
            ) : null}
            <button
              type="button"
              disabled={!canAbort}
              onClick={() => void onAction('abort')}
              className="rounded-lg border border-ember/60 bg-ember/25 px-3 py-1.5 text-[11px] font-medium text-ember shadow-glowEmber animate-emberGlow hover:bg-ember/35 disabled:cursor-not-allowed disabled:opacity-65"
            >
              Abort
            </button>
            <button type="button" onClick={() => void onAction('clear-run')} className="rounded-lg border border-line px-3 py-1.5 text-[11px] text-fog">
              Clear run
            </button>
          </>
        }
      />

      <div
        className={`tool-workspace-body fit-body grid items-start gap-6 ${
          panelTab === 'subreddits' ? 'min-[1180px]:grid-cols-[minmax(0,1fr)_360px]' : ''
        }`}
      >
        <div className="flex min-h-0 min-w-0 flex-col gap-5">
          <div className="cc-tabs shrink-0 self-start" role="tablist">
            {(['subreddits', 'queue', 'settings'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={panelTab === tab}
                onClick={() => setPanelTab(tab)}
                className="cc-tab capitalize"
              >
                {tab}
                {tab === 'queue' && pendingCount > 0 ? ` (${pendingCount})` : ''}
              </button>
            ))}
          </div>

          <div className="fit-scroll min-h-0 rounded-2xl border border-lineStrong bg-panel p-5 sm:p-6">
            {panelTab === 'subreddits' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy || runActive}
              onClick={() => void onRefreshSubreddits()}
              className="rounded-lg border border-line px-3 py-1.5 text-[11px]"
            >
              Refresh &amp; discover
            </button>
            <button
              type="button"
              disabled={busy || runActive || selectedSet.size === 0}
              onClick={() => void onJoinSubreddits('selected')}
              className="rounded-lg border border-line px-3 py-1.5 text-[11px]"
            >
              Join selected
            </button>
            <button
              type="button"
              disabled={busy || runActive || filteredSubreddits.length === 0}
              onClick={() => void onJoinSubreddits('all')}
              className="rounded-lg border border-line px-3 py-1.5 text-[11px]"
            >
              Join all
            </button>
            <button
              type="button"
              disabled={filteredSubreddits.length === 0}
              onClick={toggleSelectAllVisible}
              className="rounded-lg border border-line px-3 py-1.5 text-[11px]"
            >
              {allVisibleSelected ? 'Deselect all' : 'Select all'}
            </button>
            <button type="button" onClick={clearSelection} className="rounded-lg border border-line px-3 py-1.5 text-[11px]">
              Clear
            </button>
            <button type="button" onClick={() => void onBlacklistSelected()} className="rounded-lg border border-line px-3 py-1.5 text-[11px]">
              Blacklist selected
            </button>
            <input
              value={subFilter}
              onChange={(e) => setSubFilter(e.target.value)}
              placeholder="Filter subreddits…"
              className={inputCls}
            />
          </div>

          {filteredSubreddits.length === 0 ? (
            <EmptyState
              title="No subreddits"
              body="Click Refresh & discover to find Lithuanian communities (no login). Log in only when posting comments."
            />
          ) : (
            <div className="max-h-[420px] overflow-y-auto rounded-xl border border-line divide-y divide-line">
              {filteredSubreddits.map((sub) => (
                <label key={sub.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-well/40">
                  <input
                    type="checkbox"
                    className={checkCls}
                    checked={selectedSet.has(sub.id)}
                    onChange={() => toggleSubreddit(sub.id)}
                  />
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    <span className="text-sm text-mist">r/{sub.name}</span>
                    {sub.categoryLabel ? (
                      <span className="rounded-full border border-brass/30 bg-brass/10 px-1.5 py-0.5 text-[9px] text-brass">
                        {sub.categoryLabel}
                      </span>
                    ) : sub.source === 'joined' ? (
                      <span className="rounded-full border border-line px-1.5 py-0.5 text-[9px] text-fog">Joined</span>
                    ) : null}
                  </div>
                </label>
              ))}
            </div>
          )}

          {blacklist.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-wider text-fog">Blacklisted</p>
              <div className="flex flex-wrap gap-2">
                {blacklist.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={async () => {
                      const result = await unblacklistSubreddit(b.id)
                      flash(result.message)
                      await refresh({ light: true })
                    }}
                    className="rounded-full border border-line px-2 py-0.5 text-[10px] text-fog"
                  >
                    r/{b.name} ×
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {panelTab === 'queue' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={queueFilter}
              onChange={(e) => setQueueFilter(e.target.value as typeof queueFilter)}
              className={inputCls}
            >
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="posted">Posted</option>
              <option value="all">All</option>
            </select>
            <button type="button" onClick={() => void onApproveAll()} className="rounded-lg border border-line px-3 py-1.5 text-[11px]">
              Approve all pending
            </button>
            <button type="button" onClick={() => void onClearQueue()} className="rounded-lg border border-line px-3 py-1.5 text-[11px]">
              Clear queue
            </button>
          </div>

          {filteredQueue.length === 0 ? (
            <EmptyState title="Queue empty" body="Run Scan to find relevant posts and generate draft comments." />
          ) : (
            <div className="space-y-3 max-h-[520px] overflow-y-auto">
              {filteredQueue.map((item) => (
                <div key={item.postId} className="rounded-xl border border-lineStrong bg-well/30 p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-fog">
                        r/{item.subreddit} · relevance {item.relevance}
                      </p>
                      <a
                        href={item.postUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-medium text-mist hover:text-brass"
                      >
                        {item.postTitle}
                      </a>
                      {item.commentUrl ? (
                        <a
                          href={item.commentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-[11px] text-phosphor hover:text-brass"
                        >
                          View comment ↗
                        </a>
                      ) : null}
                      {item.reason ? <p className="mt-1 text-[11px] text-fog">{item.reason}</p> : null}
                    </div>
                    <span className="rounded-full border border-line px-2 py-0.5 text-[10px] uppercase text-fog">
                      {item.status}
                    </span>
                  </div>
                  <textarea
                    value={editingComment[item.postId] ?? item.draftComment}
                    onChange={(e) =>
                      setEditingComment((prev) => ({ ...prev, [item.postId]: e.target.value }))
                    }
                    rows={4}
                    className={`${inputCls} w-full font-sans text-sm`}
                  />
                  <div className="flex flex-wrap gap-2">
                    {item.status === 'pending' ? (
                      <button
                        type="button"
                        onClick={() => void onApprove(item)}
                        className="rounded-lg border border-phosphor/40 px-3 py-1 text-[11px] text-phosphor"
                      >
                        Approve
                      </button>
                    ) : null}
                    {item.status !== 'posted' && item.status !== 'skipped' ? (
                      <button
                        type="button"
                        onClick={() => void onSkip(item)}
                        className="rounded-lg border border-line px-3 py-1 text-[11px]"
                      >
                        Skip
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void onSaveComment(item)}
                      className="rounded-lg border border-line px-3 py-1 text-[11px]"
                    >
                      Save edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {panelTab === 'settings' ? (
        <div className="settings-preserve">
        <RedditCommenterSettingsTab
          settings={settings}
          loginPassword={loginPassword}
          setLoginPassword={setLoginPassword}
          patchSettings={patchSettings}
          onClearLoginSession={onClearLoginSession}
          busy={busy}
        />
        </div>
      ) : null}
        </div>
          </div>

        {panelTab === 'subreddits' ? (
          <aside className="fit-scroll min-w-0">
            <RedditCommenterStepLoader
              mode={run?.mode}
              status={status}
              subredditCount={subredditCount}
              selectedCount={selectedSet.size}
              scanned={run?.scanned ?? 0}
              scanTotal={run?.total ?? 0}
              matched={matchedCount}
              pendingCount={pendingCount}
              approvedCount={approvedCount}
              postedCount={run?.posted ?? postedQueueCount}
              autoPost={settings.autoPost}
              workerRunning={workerRunning}
              elapsedMs={elapsedMs}
              runError={run?.error}
            />
          </aside>
        ) : null}
      </div>

      {state.log.length > 0 && panelTab !== 'settings' ? (
        <div className="mt-auto rounded-xl border border-line bg-well/20 p-3">
          <p className="mb-2 text-[10px] uppercase tracking-wider text-fog">Activity</p>
          <div className="max-h-32 overflow-y-auto space-y-1 font-mono text-[10px] text-fog">
            {state.log
              .slice()
              .reverse()
              .slice(0, 20)
              .map((entry, i) => (
                <div key={`${entry.at}-${i}`} className={entry.kind === 'error' ? 'text-ember' : ''}>
                  {entry.message}
                </div>
              ))}
          </div>
        </div>
      ) : null}
      <SaveChangesFooter dirty={unsavedChanges} busy={busy} onSave={() => void saveChanges()} />
    </div>
  )
}
