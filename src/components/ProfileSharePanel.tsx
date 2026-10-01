import { SectionDeck } from './ui/SectionDeck'
import { downloadFriendList } from '../lib/group-poster-dms'
import {
  abortProfileShare,
  clearProfileShareLog,
  clearProfileShareRun,
  clearProfileShareSent,
  continueProfileShareLogin,
  pauseProfileShare,
  resumeProfileShare,
  showProfileShareBrowser,
} from '../lib/group-poster-share'
import { useProfileShareState } from '../hooks/useProfileShareState'
import { SaveChangesBar, SaveChangesFooter } from './ui/SaveChangesBar'
import { AutomationRunBar } from './ui/AutomationRunBar'
import { EmptyState, Field, inputCls, checkCls, LoadingPanel } from './ui/primitives'
import { BridgeOfflinePanel } from './ui/bridge-offline'

export function ProfileSharePanel({ active = true }: { active?: boolean }) {
  const {
    state,
    settings,
    unsavedChanges,
    saveChanges,
    busy,
    toast,
    friendFilter,
    setFriendFilter,
    flash,
    patchSettings,
    run,
    status,
    workerRunning,
    friends,
    sentSet,
    selectedSet,
    filteredFriends,
    onAction,
    toggleFriend,
    selectAllVisible,
    clearSelection,
    onStart,
    onRefreshFriends,
    offline,
    loadError,
    refresh,
  } = useProfileShareState(active)

  function onExportFriends(format: 'csv' | 'json' | 'txt' = 'csv') {
    const res = downloadFriendList(friends, { sentIds: sentSet, format })
    flash(res.message)
  }

  if (offline && !settings) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <BridgeOfflinePanel compact onRetry={() => void refresh({ syncSettings: true })} />
      </div>
    )
  }

  if (!settings) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingPanel title="Loading Profile share…" />
      </div>
    )
  }

  return (
    <div className="tool-workspace-body fit-column flex flex-col gap-6">
      {offline && (
        <div className="rounded-lg border border-ember/40 bg-ember/10 px-3 py-2 font-mono text-xs text-ember">
          {loadError || 'Bridge offline'} - polling paused
        </div>
      )}
      <AutomationRunBar
        waitTarget="friend"
        run={{
          id: run?.id || '',
          status: status as import('../lib/automation-run').AutomationStatus,
          message: run?.message,
          error: run?.error,
          sent: run?.sent,
          failed: run?.failed,
          skipped: run?.skipped,
          total: run?.total,
          currentItem: run?.currentFriend,
          waitEndsAt: run?.waitEndsAt,
          waitLabel: run?.waitLabel,
          workerRunning,
        }}
        actions={
          <>
            <SaveChangesBar compact dirty={unsavedChanges} busy={busy} onSave={() => void saveChanges()} />
            {status === 'waiting_login' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onAction(continueProfileShareLogin, 'Continue sent')}
                className="rounded-lg border border-brass/40 bg-brass/15 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-brass hover:bg-brass/25 disabled:opacity-50"
              >
                Continue
              </button>
            )}
            {(status === 'running' || status === 'waiting_login') && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onAction(pauseProfileShare)}
                className="rounded-lg border border-lineStrong bg-lift px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-snow hover:border-brass/35 disabled:opacity-50"
              >
                Pause
              </button>
            )}
            {status === 'paused' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onAction(resumeProfileShare)}
                className="rounded-lg border border-lineStrong bg-lift px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-snow hover:border-brass/35 disabled:opacity-50"
              >
                Resume
              </button>
            )}
            {workerRunning && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onAction(showProfileShareBrowser, 'Showing Chrome…')}
                className="rounded-lg border border-lineStrong bg-lift px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-snow hover:border-brass/35 disabled:opacity-50"
              >
                Show browser
              </button>
            )}
            {workerRunning && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onAction(abortProfileShare)}
                className="rounded-lg border border-ember/40 bg-ember/10 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-ember hover:bg-ember/20 disabled:opacity-50"
              >
                Abort
              </button>
            )}
            <button
              type="button"
              disabled={busy || workerRunning}
              onClick={() => void onStart()}
              className="rounded-lg border border-phosphor/35 bg-phosphor/10 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-phosphor hover:bg-phosphor/20 disabled:opacity-50"
            >
              Start share
            </button>
            <button
              type="button"
              disabled={busy || workerRunning}
              onClick={() => void onRefreshFriends()}
              className="rounded-lg border border-lineStrong bg-lift px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-snow hover:border-brass/35 disabled:opacity-50"
            >
              Refresh friends
            </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onAction(clearProfileShareRun)}
            className="rounded-lg border border-lineStrong bg-transparent px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-mist hover:text-snow disabled:opacity-50"
          >
            Clear run
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onAction(clearProfileShareSent, 'Share history cleared')}
            className="rounded-lg border border-lineStrong bg-transparent px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-mist hover:text-snow disabled:opacity-50"
          >
            Clear sent
          </button>
          </>
        }
      />


      <div className="fit-body grid items-start gap-6 min-[1180px]:grid-cols-[minmax(0,1fr)_400px]">
        <SectionDeck
          storageKey="group-poster.share"
          sections={[
            {
              id: 'friends',
              label: 'Friends',
              content: (
                <section className="rounded-2xl border border-lineStrong bg-panel p-5 sm:p-6">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-snow">
                      Friends · {selectedSet.size || friends.length}
                      {selectedSet.size ? ` selected / ${friends.length}` : ' loaded'}
                      {sentSet.size ? ` · ${sentSet.size} shared` : ''}
                    </h2>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={!friends.length}
                        onClick={() => onExportFriends('csv')}
                        className="rounded-md border border-lineStrong px-2 py-1 font-mono text-[10px] uppercase text-mist hover:text-snow disabled:opacity-50"
                      >
                        Export CSV
                      </button>
                      <button
                        type="button"
                        disabled={!friends.length}
                        onClick={() => onExportFriends('json')}
                        className="rounded-md border border-lineStrong px-2 py-1 font-mono text-[10px] uppercase text-mist hover:text-snow disabled:opacity-50"
                      >
                        Export JSON
                      </button>
                      <button
                        type="button"
                        disabled={!friends.length}
                        onClick={() => onExportFriends('txt')}
                        className="rounded-md border border-lineStrong px-2 py-1 font-mono text-[10px] uppercase text-mist hover:text-snow disabled:opacity-50"
                      >
                        Export TXT
                      </button>
                      <button
                        type="button"
                        onClick={selectAllVisible}
                        className="rounded-md border border-lineStrong px-2 py-1 font-mono text-[10px] uppercase text-mist hover:text-snow"
                      >
                        Select visible
                      </button>
                      <button
                        type="button"
                        onClick={clearSelection}
                        className="rounded-md border border-lineStrong px-2 py-1 font-mono text-[10px] uppercase text-mist hover:text-snow"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <input
                    className={`${inputCls} mb-3`}
                    value={friendFilter}
                    onChange={(e) => setFriendFilter(e.target.value)}
                    placeholder="Filter friends…"
                  />
                  {!friends.length ? (
                    <EmptyState title="No friends loaded - refresh on Friend DMs first" />
                  ) : (
                    <ul className="max-h-[280px] space-y-1 overflow-y-auto">
                      {filteredFriends.map((f) => {
                        const checked = selectedSet.size === 0 || selectedSet.has(f.id)
                        const already = sentSet.has(f.id)
                        return (
                          <li key={f.id}>
                            <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-lift">
                              <input
                                type="checkbox"
                                className={checkCls}
                                checked={checked}
                                onChange={() => toggleFriend(f.id)}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm text-snow">{f.name}</span>
                                <span className="block truncate font-mono text-[10px] text-fog">{f.id}</span>
                              </span>
                              {already ? (
                                <span className="shrink-0 font-mono text-[9px] uppercase text-brass/80">
                                  shared
                                </span>
                              ) : selectedSet.size === 0 ? (
                                <span className="shrink-0 font-mono text-[9px] uppercase text-phosphor/80">
                                  all
                                </span>
                              ) : null}
                            </label>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                  <p className="mt-2 text-[11px] text-fog">
                    Empty selection = share to all loaded friends. Already-shared friends skipped when skip
                    is on.
                  </p>
                </section>
              ),
            },
            {
              id: 'post',
              label: 'Post & timing',
              content: (
                <div className="fit-stack">
                  <section className="rounded-2xl border border-lineStrong bg-panel p-5 sm:p-6">
                    <h2 className="mb-3 text-sm font-semibold text-snow">
                      Post to share
                    </h2>
                    <p className="mb-3 text-[11px] text-fog">
                      Opens your profile, presses Share → Share on a friend&apos;s profile, then shares to
                      each selected friend. Same Facebook login as Groups / Friend DMs.
                    </p>
                    <div className="space-y-3">
                      <Field label="Post URL (optional)">
                        <input
                          className={inputCls}
                          value={settings.postUrl}
                          onChange={(e) => patchSettings({ postUrl: e.target.value })}
                          placeholder="Empty = latest shareable post on your profile"
                        />
                      </Field>
                      <Field label="Share message (optional)">
                        <textarea
                          className={`${inputCls} min-h-[88px] resize-y`}
                          value={settings.shareMessage}
                          onChange={(e) => patchSettings({ shareMessage: e.target.value })}
                          placeholder="Left blank = share with no extra text"
                        />
                      </Field>
                      <label className="flex items-center gap-2 text-sm text-snow">
                        <input
                          type="checkbox"
                          className={checkCls}
                          checked={settings.skipAlreadyShared}
                          onChange={(e) => patchSettings({ skipAlreadyShared: e.target.checked })}
                        />
                        Skip friends already shared
                      </label>
                    </div>
                  </section>
                  <section className="rounded-2xl border border-lineStrong bg-panel p-5 sm:p-6">
                    <h2 className="text-sm font-semibold text-snow">Timing</h2>
                    <div className="mt-3 grid gap-5 min-[1180px]:grid-cols-3">
                      <label className="block space-y-1 sm:col-span-2">
                        <span className="font-mono text-[10px] uppercase text-mist">Interval unit</span>
                        <select
                          className={inputCls}
                          value={settings.intervalUnit || 'minutes'}
                          onChange={(e) =>
                            patchSettings({
                              intervalUnit: e.target.value === 'seconds' ? 'seconds' : 'minutes',
                            })
                          }
                        >
                          <option value="minutes">Minutes</option>
                          <option value="seconds">Seconds</option>
                        </select>
                      </label>
                      <label className="block space-y-1">
                        <span className="font-mono text-[10px] uppercase text-mist">
                          Min interval ({settings.intervalUnit === 'seconds' ? 'sec' : 'min'})
                        </span>
                        <input
                          type="number"
                          className={inputCls}
                          min={settings.intervalUnit === 'seconds' ? 5 : 1}
                          value={settings.minInterval}
                          onChange={(e) => {
                            const floor = settings.intervalUnit === 'seconds' ? 5 : 1
                            const min = Math.max(floor, Number(e.target.value) || floor)
                            const max = Math.max(min, settings.maxInterval)
                            patchSettings({
                              minInterval: min,
                              maxInterval: max,
                              ...(settings.intervalUnit === 'minutes'
                                ? { minIntervalMin: min, maxIntervalMin: max }
                                : {}),
                            })
                          }}
                        />
                      </label>
                      <label className="block space-y-1">
                        <span className="font-mono text-[10px] uppercase text-mist">
                          Max interval ({settings.intervalUnit === 'seconds' ? 'sec' : 'min'})
                        </span>
                        <input
                          type="number"
                          className={inputCls}
                          min={settings.intervalUnit === 'seconds' ? 5 : 1}
                          value={settings.maxInterval}
                          onChange={(e) => {
                            const floor = settings.intervalUnit === 'seconds' ? 5 : 1
                            const max = Math.max(floor, Number(e.target.value) || floor)
                            const min = Math.min(settings.minInterval, max)
                            patchSettings({
                              minInterval: min,
                              maxInterval: max,
                              ...(settings.intervalUnit === 'minutes'
                                ? { minIntervalMin: min, maxIntervalMin: max }
                                : {}),
                            })
                          }}
                        />
                      </label>
                      <label className="block space-y-1">
                        <span className="font-mono text-[10px] uppercase text-mist">Daily cap</span>
                        <input
                          type="number"
                          className={inputCls}
                          value={settings.dailyCap}
                          onChange={(e) => patchSettings({ dailyCap: Number(e.target.value) || 0 })}
                        />
                      </label>
                      <label className="block space-y-1">
                        <span className="font-mono text-[10px] uppercase text-mist">Warm-up (sec)</span>
                        <input
                          type="number"
                          className={inputCls}
                          value={settings.warmupSec}
                          onChange={(e) => patchSettings({ warmupSec: Number(e.target.value) || 0 })}
                        />
                      </label>
                    </div>
                    <label className="mt-3 flex items-center gap-2 text-sm text-snow">
                      <input
                        type="checkbox"
                        className={checkCls}
                        checked={settings.shuffleFriends}
                        onChange={(e) => patchSettings({ shuffleFriends: e.target.checked })}
                      />
                      Shuffle friend order
                    </label>
                  </section>
                </div>
              ),
            },
          ]}
        />

        <aside className="tool-companion fit-side flex max-h-[520px] min-h-0 min-w-0 flex-col rounded-2xl border border-lineStrong bg-panel">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold text-snow">Activity</h2>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-fog">
                {run?.sent ?? 0} shared · {run?.failed ?? 0} failed
                {(run?.skipped ?? 0) > 0 ? ` · ${run?.skipped} skipped` : ''}
                {run?.total ? ` / ${run.total}` : ''}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onAction(clearProfileShareLog, 'Log cleared')}
                className="rounded-md border border-lineStrong bg-raised px-2 py-0.5 font-mono text-[10px] uppercase text-fog hover:text-mist disabled:opacity-40"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
            {(state?.log || []).length === 0 ? (
              <EmptyState title="No activity yet" />
            ) : (
              <ul className="space-y-2">
                {(state?.log || []).map((entry, i) => (
                  <li key={`${entry.at}-${i}`} className="border-b border-line/60 pb-2 last:border-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className={[
                          'font-mono text-[10px] uppercase tracking-[0.1em]',
                          entry.kind === 'error' ? 'text-ember' : 'text-mist',
                        ].join(' ')}
                      >
                        {entry.kind}
                      </span>
                      <span className="font-mono text-[10px] text-fog">
                        {entry.at ? new Date(entry.at).toLocaleTimeString() : ''}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-snow/90">{entry.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      <SaveChangesFooter dirty={unsavedChanges} busy={busy} onSave={() => void saveChanges()} />
      {toast ? (
        <div className="pointer-events-none fixed bottom-6 right-6 z-50 rounded-xl border border-lineStrong bg-panel px-4 py-2 font-mono text-xs text-snow shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
  )
}
