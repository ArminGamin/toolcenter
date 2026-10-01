import type { useGroupPosterState } from '../../hooks/useGroupPosterState'
import {
    abortGroupPoster,
    clearGroupPosterRun,
    clearGroupPosterWarmProgress,
    continueGroupPosterLogin,
    pauseGroupPoster,
    resumeGroupPoster,
    showGroupPosterBrowser
} from '../../lib/group-poster'
import { AutomationRunBar } from '../ui/AutomationRunBar'
import { BridgeOfflineBanner } from '../ui/bridge-offline'
import { SectionDeck } from '../ui/SectionDeck'
import { ActivityAside } from './ActivityAside'
import { CompositionSection } from './CompositionSection'
import { GroupsListSection } from './GroupsListSection'
import { LoginSection } from './LoginSection'
import { ProfilesSection } from './ProfilesSection'
import { SafetyTimingSection } from './SafetyTimingSection'

type GroupPosterGroupsProps = {
  vm: ReturnType<typeof useGroupPosterState>
}

export function GroupPosterGroupsSection({ vm }: GroupPosterGroupsProps) {
  const {
    state,
    setState,
    settings,
    captions,
    setCaptions,
    loginPassword,
    setLoginPassword,
    busy,
    toast,
    offline,
    loadError,
    groupFilter,
    setGroupFilter,
    showBlacklist,
    setShowBlacklist,
    profileName,
    setProfileName,
    selectedProfile,
    setSelectedProfile,
    profileBusy,
    captionsFileInputRef,
    captionsRef,
    loginPasswordRef,
    captionsDirtyRef,
    passwordDirtyRef,
    patchSettings,
    recomputeUnsaved,
    flash,
    run,
    status,
    workerRunning,
    groups,
    blacklist,
    liveWait,
    headerMessage,
    waitingLive,
    waitEndsAt,
    waitLabel,
    latestWaitLogIndex,
    filteredGroups,
    filteredBlacklist,
    blacklistReasonLabel,
    selectedSet,
    onStart,
    onSaveProfile,
    onLoadProfile,
    onDeleteProfile,
    onRefreshGroups,
    onAction,
    onClearLoginSession,
    toggleGroup,
    selectAllVisible,
    clearSelection,
    onBlacklistSelected,
    refresh,
  } = vm

  if (!settings) return null

  return (
    <>
      <AutomationRunBar
        run={{
          id: run?.id || '',
          status: status as import('../../lib/automation-run').AutomationStatus,
          message: headerMessage,
          error: run?.error,
          sent: run?.posted,
          failed: run?.failed,
          total: run?.total,
          currentItem: run?.currentGroup,
          waitEndsAt,
          waitLabel,
          workerRunning,
          workerPid: state?.workerPid,
        }}
        actions={
          <>
            {status === 'waiting_login' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onAction(continueGroupPosterLogin, 'Continue sent')}
                className="rounded-lg border border-brass/40 bg-brass/15 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-brass hover:bg-brass/25 disabled:opacity-50"
              >
                Continue
              </button>
            )}
            {(status === 'running' || status === 'waiting_login') && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onAction(pauseGroupPoster)}
                className="rounded-lg border border-lineStrong bg-lift px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-snow hover:border-brass/35 disabled:opacity-50"
              >
                Pause
              </button>
            )}
            {status === 'paused' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onAction(resumeGroupPoster)}
                className="rounded-lg border border-lineStrong bg-lift px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-snow hover:border-brass/35 disabled:opacity-50"
              >
                Resume
              </button>
            )}
            {(workerRunning ||
              status === 'running' ||
              status === 'paused' ||
              status === 'waiting_login') && (
              <button
                type="button"
                disabled={busy}
                title="Bring the Chrome window on-screen so you can watch the run"
                onClick={() => void onAction(showGroupPosterBrowser, 'Showing Chrome…')}
                className="rounded-lg border border-lineStrong bg-lift px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-snow hover:border-brass/35 disabled:opacity-50"
              >
                Show browser
              </button>
            )}
            {(workerRunning ||
              status === 'running' ||
              status === 'paused' ||
              status === 'waiting_login') && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onAction(abortGroupPoster)}
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
              {state?.progress?.active && (state.progress.postedCount || 0) > 0
                ? 'Resume posting'
                : 'Start posting'}
            </button>
            <button
              type="button"
              disabled={busy || workerRunning}
              onClick={() => void onRefreshGroups()}
              className="rounded-lg border border-lineStrong bg-lift px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-snow hover:border-brass/35 disabled:opacity-50"
            >
              Refresh groups
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onAction(clearGroupPosterRun)}
              className="rounded-lg border border-lineStrong bg-transparent px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-mist hover:text-snow disabled:opacity-50"
            >
              Clear run
            </button>
            <button
              type="button"
              disabled={busy}
              title="Clear 10-minute warm resume progress"
              onClick={() => void onAction(clearGroupPosterWarmProgress, 'Warm progress cleared')}
              className="rounded-lg border border-lineStrong bg-lift px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-snow hover:border-brass/35 disabled:opacity-50"
            >
              Clear warm
            </button>
          </>
        }
      />
      {state?.queuePreview ? (
        <div className="rounded-xl border border-lineStrong bg-well/40 px-4 py-2 font-mono text-[10px] text-fog">
          Queue preflight · <span className="text-phosphor">{state.queuePreview.eligible} eligible</span>
          {' · '}{state.queuePreview.excluded} excluded
          {' · '}{state.queuePreview.staleOrUnscanned} stale/unscanned
          {state.queuePreview.scanRecommended ? (
            <span className="ml-2 text-brass">Run Scan Buy &amp; Sell for the cleanest queue.</span>
          ) : null}
        </div>
      ) : null}

      {state?.progress?.active && (state.progress.postedCount || 0) > 0 && !workerRunning ? (
        <p className="font-mono text-[11px] text-brass">
          Warm: {state.progress.postedCount} done · {Math.max(1, Math.ceil((state.progress.remainingSec || 0) / 60))} min left
        </p>
      ) : null}

      <div className="tool-workspace-body fit-body grid items-start gap-6 min-[1180px]:grid-cols-[minmax(0,1fr)_400px]">
        <SectionDeck
          storageKey="group-poster.groups"
          sections={[
            {
              id: 'groups',
              label: 'Groups',
              badge: groups.length,
              content: (
                <GroupsListSection
                  showBlacklist={showBlacklist}
                  setShowBlacklist={setShowBlacklist}
                  blacklist={blacklist}
                  groups={groups}
                  selectedSet={selectedSet}
                  groupFilter={groupFilter}
                  setGroupFilter={setGroupFilter}
                  filteredGroups={filteredGroups}
                  filteredBlacklist={filteredBlacklist}
                  blacklistReasonLabel={blacklistReasonLabel}
                  busy={busy}
                  onBlacklistSelected={onBlacklistSelected}
                  onClearWarm={() => void onAction(clearGroupPosterWarmProgress, 'Warm progress cleared')}
                  selectAllVisible={selectAllVisible}
                  clearSelection={clearSelection}
                  toggleGroup={toggleGroup}
                  flash={flash}
                  refresh={refresh}
                />
              ),
            },
            {
              id: 'composition',
              label: 'Composition',
              content: (
                <CompositionSection
                  settings={settings}
                  state={state}
                  captions={captions}
                  setCaptions={setCaptions}
                  captionsRef={captionsRef}
                  captionsDirtyRef={captionsDirtyRef}
                  captionsFileInputRef={captionsFileInputRef}
                  busy={busy}
                  patchSettings={patchSettings}
                  recomputeUnsaved={recomputeUnsaved}
                  flash={flash}
                />
              ),
            },
            {
              id: 'timing',
              label: 'Safety & timing',
              content: (
                <SafetyTimingSection settings={settings} patchSettings={patchSettings} />
              ),
            },
            {
              id: 'account',
              label: 'Login & snapshots',
              content: (
                <div className="fit-stack">
                  <LoginSection
                    settings={settings}
                    loginPassword={loginPassword}
                    setLoginPassword={setLoginPassword}
                    loginPasswordRef={loginPasswordRef}
                    passwordDirtyRef={passwordDirtyRef}
                    patchSettings={patchSettings}
                    recomputeUnsaved={recomputeUnsaved}
                    busy={busy}
                    onClearLoginSession={onClearLoginSession}
                    blacklistCount={blacklist.length}
                  />
                  <ProfilesSection
                    state={state}
                    selectedProfile={selectedProfile}
                    setSelectedProfile={setSelectedProfile}
                    profileName={profileName}
                    setProfileName={setProfileName}
                    busy={busy}
                    profileBusy={profileBusy}
                    onLoadProfile={onLoadProfile}
                    onSaveProfile={onSaveProfile}
                    onDeleteProfile={onDeleteProfile}
                  />
                </div>
              ),
            },
          ]}
        />

        <ActivityAside
          state={state}
          run={run}
          busy={busy}
          waitingLive={waitingLive}
          liveWait={liveWait}
          latestWaitLogIndex={latestWaitLogIndex}
          flash={flash}
          setState={setState}
          refresh={refresh}
        />
      </div>

      {offline ? (
        <BridgeOfflineBanner
          message={loadError}
          onRetry={() => void refresh({ syncSettings: true })}
        />
      ) : null}

      {toast && (
        <div className="pointer-events-none fixed bottom-6 right-6 z-50 rounded-xl border border-lineStrong bg-lift px-4 py-2 font-mono text-xs text-snow shadow-panel max-[860px]:bottom-20 max-[860px]:right-3">
          {toast}
        </div>
      )}
    </>
  )
}
