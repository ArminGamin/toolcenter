import { SectionDeck } from '../ui/SectionDeck'
import {
  abortGroupPoster,
  clearGroupPosterLog,
  clearGroupPosterRun,
  clearGroupPosterWarmProgress,
  continueGroupPosterLogin,
  pauseGroupPoster,
  resumeGroupPoster,
  showGroupPosterBrowser,
  unblacklistGroupPosterGroup,
  type GroupPosterRun,
  type GroupPosterSettings,
  type GroupPosterState,
} from '../../lib/group-poster'
import type { useGroupPosterState } from '../../hooks/useGroupPosterState'
import { SecretInput } from '../SecretInput'
import { AutomationRunBar } from '../ui/AutomationRunBar'
import { EmptyState, Field, inputCls, checkCls } from '../ui/primitives'
import { BridgeOfflineBanner } from '../ui/bridge-offline'

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

function ProfilesSection({
  state,
  selectedProfile,
  setSelectedProfile,
  profileName,
  setProfileName,
  busy,
  profileBusy,
  onLoadProfile,
  onSaveProfile,
  onDeleteProfile,
}: {
  state: GroupPosterState | null
  selectedProfile: string
  setSelectedProfile: (v: string) => void
  profileName: string
  setProfileName: (v: string) => void
  busy: boolean
  profileBusy: boolean
  onLoadProfile: () => Promise<void>
  onSaveProfile: () => Promise<void>
  onDeleteProfile: () => Promise<void>
}) {
  return (
    <section className="rounded-2xl border border-lineStrong bg-panel p-5 sm:p-6">
      <h2 className="mb-1 text-sm font-semibold text-snow">
        Saved snapshots
      </h2>
      <p className="mb-3 text-xs text-fog">
        Reuse legacy Group Poster settings inside the business workspace selected in the top bar.
      </p>
      {state?.activeProfile ? (
        <p className="mb-2 font-mono text-[11px] text-mist">
          Active: <span className="text-snow">{state.activeProfile}</span>
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <select
          className={`${inputCls} min-w-[160px] flex-1`}
          value={selectedProfile}
          onChange={(e) => {
            setSelectedProfile(e.target.value)
            if (e.target.value) setProfileName(e.target.value)
          }}
        >
          <option value="">
            {(state?.profiles || []).length ? 'Select profile…' : 'No profiles yet'}
          </option>
          {(state?.profiles || []).map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
              {p.linkUrl ? ` · ${p.linkUrl.replace(/^https?:\/\//, '').slice(0, 28)}` : ''}
              {p.captionsCount ? ` · ${p.captionsCount} caps` : ''}
            </option>
          ))}
        </select>
        <input
          className={`${inputCls} min-w-[140px] flex-1`}
          value={profileName}
          onChange={(e) => setProfileName(e.target.value)}
          placeholder="Profile 1"
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || profileBusy || !selectedProfile}
          onClick={() => void onLoadProfile()}
          className="rounded-lg border border-lineStrong bg-lift px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-snow hover:border-brass/35 disabled:opacity-50"
        >
          Load
        </button>
        <button
          type="button"
          disabled={busy || profileBusy}
          onClick={() => void onSaveProfile()}
          className="rounded-lg border border-phosphor/35 bg-phosphor/10 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-phosphor hover:bg-phosphor/20 disabled:opacity-50"
        >
          Save profile
        </button>
        <button
          type="button"
          disabled={busy || profileBusy || !selectedProfile}
          onClick={() => void onDeleteProfile()}
          className="rounded-lg border border-ember/40 bg-ember/10 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-ember hover:bg-ember/20 disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </section>
  )
}

function LoginSection({
  settings,
  loginPassword,
  setLoginPassword,
  loginPasswordRef,
  passwordDirtyRef,
  patchSettings,
  recomputeUnsaved,
  busy,
  onClearLoginSession,
  blacklistCount,
}: {
  settings: GroupPosterSettings
  loginPassword: string
  setLoginPassword: (v: string) => void
  loginPasswordRef: React.MutableRefObject<string>
  passwordDirtyRef: React.MutableRefObject<boolean>
  patchSettings: (partial: Partial<GroupPosterSettings>) => void
  recomputeUnsaved: () => void
  busy: boolean
  onClearLoginSession: () => Promise<void>
  blacklistCount: number
}) {
  return (
    <section className="rounded-2xl border border-lineStrong bg-panel p-5 sm:p-6">
      <h2 className="mb-3 text-sm font-semibold text-snow">
        Facebook login
      </h2>
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm text-snow">
          <input
            type="checkbox"
            className={checkCls}
            checked={settings.autoLogin !== false}
            onChange={(e) => patchSettings({ autoLogin: e.target.checked })}
          />
          Auto-login with saved account
        </label>
        <div className="grid gap-3 min-[1180px]:grid-cols-2">
        <Field label="Email">
          <input
            className={inputCls}
            value={settings.loginEmail || ''}
            onChange={(e) => patchSettings({ loginEmail: e.target.value })}
            placeholder="you@gmail.com"
            autoComplete="username"
          />
        </Field>
        <Field
          label="Password"
        >
          <SecretInput
            className={inputCls}
            value={loginPassword}
            onChange={(v) => {
              setLoginPassword(v)
              loginPasswordRef.current = v
              passwordDirtyRef.current = true
              recomputeUnsaved()
            }}
            placeholder="Password"
            autoComplete="current-password"
          />
        </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-snow">
          <input
            type="checkbox"
            className={checkCls}
            checked={settings.preserveExistingBlacklist === true}
            onChange={(e) => patchSettings({ preserveExistingBlacklist: e.target.checked })}
          />
          Use saved blacklist only (no new auto-blocks)
        </label>
        {settings.preserveExistingBlacklist && blacklistCount > 0 ? (
          <p className="text-[11px] leading-relaxed text-fog">
            {blacklistCount} blacklisted group(s) from your previous account stay blocked. Refresh
            keeps your group list; nothing new gets blacklisted.
          </p>
        ) : null}
        <p className="text-[11px] leading-relaxed text-fog">
          Session cookies live in the shared Chrome profile. Clear saved login to switch Facebook
          accounts.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onClearLoginSession()}
          className="rounded-lg border border-line px-3 py-1.5 text-[11px] text-mist hover:border-brass/40 hover:text-brass disabled:opacity-50"
        >
          Clear saved login
        </button>
      </div>
    </section>
  )
}

function CompositionSection({
  settings,
  state,
  captions,
  setCaptions,
  captionsRef,
  captionsDirtyRef,
  captionsFileInputRef,
  busy,
  patchSettings,
  recomputeUnsaved,
  flash,
}: {
  settings: GroupPosterSettings
  state: GroupPosterState | null
  captions: string
  setCaptions: (v: string) => void
  captionsRef: React.MutableRefObject<string>
  captionsDirtyRef: React.MutableRefObject<boolean>
  captionsFileInputRef: React.RefObject<HTMLInputElement | null>
  busy: boolean
  patchSettings: (partial: Partial<GroupPosterSettings>) => void
  recomputeUnsaved: () => void
  flash: (msg: string) => void
}) {
  return (
    <section className="rounded-2xl border border-lineStrong bg-panel p-5 sm:p-6">
      <h2 className="mb-3 text-sm font-semibold text-snow">Composition</h2>
      <div className="mb-4 flex flex-wrap gap-4">
        {(
          [
            ['includeText', 'Text'],
            ['includeLink', 'Link'],
            ['includeImage', 'Image'],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm text-snow">
            <input
              type="checkbox"
              className={checkCls}
              checked={Boolean(settings[key])}
              onChange={(e) => {
                const on = e.target.checked
                if (key === 'includeImage' && on && !(settings.imagesDir || '').trim()) {
                  patchSettings({
                    includeImage: true,
                    imagesDir: state?.defaultImagesDir || 'D:\\toolsai\\facebook-group-poster\\images',
                    rotateImages: settings.rotateImages !== false,
                  })
                  return
                }
                patchSettings({ [key]: on })
              }}
            />
            {label}
          </label>
        ))}
      </div>

      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm text-snow">
          <input
            type="checkbox"
            className={checkCls}
            checked={settings.rotateCaptions}
            disabled={!settings.includeText}
            onChange={(e) => patchSettings({ rotateCaptions: e.target.checked })}
          />
          Rotate captions from captions.txt ({state?.captionsCount ?? 0} lines)
        </label>

        {settings.includeText && !settings.rotateCaptions && (
          <Field label="Fixed caption">
            <textarea
              className={`${inputCls} min-h-[88px]`}
              value={settings.fixedCaption}
              onChange={(e) => patchSettings({ fixedCaption: e.target.value })}
              placeholder="What to type into each post…"
              disabled={settings.rotateCaptions}
            />
          </Field>
        )}

        {settings.includeText && settings.rotateCaptions && (
          <div className="space-y-2">
            <Field
              label="captions.txt"
            >
              <textarea
                className={`${inputCls} min-h-[120px]`}
                value={captions}
                onChange={(e) => {
                  const v = e.target.value
                  setCaptions(v)
                  captionsRef.current = v
                  captionsDirtyRef.current = true
                  recomputeUnsaved()
                }}
                placeholder={
                  'Sveiki vyrai - naujas pasiūlymas!\nSveikos moterys - šis pasiūlymas jums\nSpecialiai vyrui šią savaitę…'
                }
              />
            </Field>
            <input
              ref={captionsFileInputRef}
              type="file"
              accept=".txt,text/plain"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                const reader = new FileReader()
                reader.onload = () => {
                  const text = String(reader.result || '')
                  setCaptions(text)
                  captionsRef.current = text
                  captionsDirtyRef.current = true
                  recomputeUnsaved()
                  flash(`Loaded ${file.name}`)
                }
                reader.onerror = () => flash('Could not read file')
                reader.readAsText(file)
              }}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => captionsFileInputRef.current?.click()}
                className="rounded-lg border border-lineStrong bg-lift px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-snow hover:border-brass/35 disabled:opacity-50"
              >
                Load .txt
              </button>
            </div>
          </div>
        )}

        {settings.includeLink && (
          <Field
            label="Link URL"
          >
            <input
              className={inputCls}
              value={settings.linkUrl}
              onChange={(e) => patchSettings({ linkUrl: e.target.value })}
              placeholder="https://…"
            />
          </Field>
        )}

        {settings.includeImage && (
          <>
            <Field
              label="Preload images from folder"
            >
              <div className="flex gap-2">
                <input
                  className={inputCls}
                  value={settings.imagesDir || ''}
                  onChange={(e) => patchSettings({ imagesDir: e.target.value })}
                  placeholder={state?.defaultImagesDir || 'D:\\toolsai\\facebook-group-poster\\images'}
                />
                <button
                  type="button"
                  title="Use default images folder"
                  onClick={() =>
                    patchSettings({
                      imagesDir: state?.defaultImagesDir || 'D:\\toolsai\\facebook-group-poster\\images',
                    })
                  }
                  className="shrink-0 rounded-lg border border-lineStrong bg-lift px-2.5 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-mist hover:border-brass/35 hover:text-snow"
                >
                  Default
                </button>
              </div>
            </Field>
            <p className="font-mono text-[10px] text-fog">
              {state?.imagesVyrasCount ?? 0} VYRAS · {state?.imagesMoterisCount ?? 0} MOTERIS
              {(state?.imagesOtherCount ?? 0) > 0 ? ` · ${state?.imagesOtherCount} other` : ''}
            </p>
            <label className="flex items-center gap-2 text-sm text-snow">
              <input
                type="checkbox"
                className={checkCls}
                checked={settings.rotateImages !== false}
                onChange={(e) => patchSettings({ rotateImages: e.target.checked })}
              />
              Rotate images (VYRAS/MOTERIS match caption) (
              {state?.imagesVyrasCount ?? 0} VYRAS + {state?.imagesMoterisCount ?? 0} MOTERIS)
            </label>
            {settings.rotateImages !== false ? (
              <p className="font-mono text-[10px] text-fog">
                Indices: {settings.imageIndexVyras ?? 0}/{settings.imageIndexMoteris ?? 0}
              </p>
            ) : (
              <Field
                label="Extra image paths (optional)"
              >
                <textarea
                  className={`${inputCls} min-h-[72px]`}
                  value={(settings.imagePaths || []).join('\n')}
                  onChange={(e) =>
                    patchSettings({
                      imagePaths: e.target.value
                        .split(/\r?\n/)
                        .map((l) => l.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder={'D:\\photos\\promo_VYRAS.jpg'}
                />
              </Field>
            )}
          </>
        )}
      </div>
    </section>
  )
}

function SafetyTimingSection({
  settings,
  patchSettings,
}: {
  settings: GroupPosterSettings
  patchSettings: (partial: Partial<GroupPosterSettings>) => void
}) {
  return (
    <section className="rounded-2xl border border-lineStrong bg-panel p-5 sm:p-6">
      <h2 className="mb-3 text-sm font-semibold text-snow">
        Safety & timing
      </h2>
      <div className="grid gap-5 min-[1180px]:grid-cols-3">
        <Field label="Min interval (min)">
          <input
            type="number"
            className={inputCls}
            min={1}
            value={settings.minIntervalMin}
            onChange={(e) => patchSettings({ minIntervalMin: Number(e.target.value) || 1 })}
          />
        </Field>
        <Field label="Max interval (min)">
          <input
            type="number"
            className={inputCls}
            min={1}
            value={settings.maxIntervalMin}
            onChange={(e) => patchSettings({ maxIntervalMin: Number(e.target.value) || 1 })}
          />
        </Field>
        <Field label="Warm-up (sec)">
          <input
            type="number"
            className={inputCls}
            min={0}
            value={settings.warmupSec}
            onChange={(e) => patchSettings({ warmupSec: Number(e.target.value) || 0 })}
          />
        </Field>
        <Field label="Daily cap (0 = unlimited)">
          <input
            type="number"
            className={inputCls}
            min={0}
            value={settings.dailyCap}
            onChange={(e) => patchSettings({ dailyCap: Number(e.target.value) || 0 })}
          />
        </Field>
        <Field label="Type delay min (ms)">
          <input
            type="number"
            className={inputCls}
            min={20}
            value={settings.minTypeDelayMs}
            onChange={(e) => patchSettings({ minTypeDelayMs: Number(e.target.value) || 20 })}
          />
        </Field>
        <Field label="Type delay max (ms)">
          <input
            type="number"
            className={inputCls}
            min={20}
            value={settings.maxTypeDelayMs}
            onChange={(e) => patchSettings({ maxTypeDelayMs: Number(e.target.value) || 20 })}
          />
        </Field>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-snow">
        <input
          type="checkbox"
          className={checkCls}
          checked={settings.autoJoinBeforePost}
          onChange={(e) => patchSettings({ autoJoinBeforePost: e.target.checked })}
        />
        Auto-join groups before post (30s wait after join · skips pending approval)
      </label>
      <label className="mt-3 flex items-center gap-2 text-sm text-snow">
        <input
          type="checkbox"
          className={checkCls}
          checked={settings.shuffleGroups}
          onChange={(e) => patchSettings({ shuffleGroups: e.target.checked })}
        />
        Shuffle group order each run
      </label>
    </section>
  )
}

function GroupsListSection({
  showBlacklist,
  setShowBlacklist,
  blacklist,
  groups,
  selectedSet,
  groupFilter,
  setGroupFilter,
  filteredGroups,
  filteredBlacklist,
  blacklistReasonLabel,
  busy,
  onBlacklistSelected,
  onClearWarm,
  selectAllVisible,
  clearSelection,
  toggleGroup,
  flash,
  refresh,
}: {
  showBlacklist: boolean
  setShowBlacklist: React.Dispatch<React.SetStateAction<boolean>>
  blacklist: NonNullable<GroupPosterState['blacklist']>
  groups: NonNullable<GroupPosterState['groups']>
  selectedSet: Set<string>
  groupFilter: string
  setGroupFilter: (v: string) => void
  filteredGroups: NonNullable<GroupPosterState['groups']>
  filteredBlacklist: NonNullable<GroupPosterState['blacklist']>
  blacklistReasonLabel: (reason: string) => string
  busy: boolean
  onBlacklistSelected: () => Promise<void>
  onClearWarm: () => void
  selectAllVisible: () => void
  clearSelection: () => void
  toggleGroup: (id: string) => void
  flash: (msg: string) => void
  refresh: (opts?: { syncSettings?: boolean; light?: boolean }) => Promise<void>
}) {
  return (
    <section className="rounded-2xl border border-lineStrong bg-panel p-5 sm:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-snow">
          {showBlacklist
            ? `Blacklist · ${blacklist.length}`
            : `Groups · ${selectedSet.size || groups.length}${
                selectedSet.size ? ` selected / ${groups.length}` : ' loaded'
              }`}
        </h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowBlacklist((v) => !v)}
            className={[
              'rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] transition',
              showBlacklist
                ? 'border-brass/40 bg-brass/15 text-brass'
                : 'border-lineStrong text-mist hover:text-snow',
            ].join(' ')}
          >
            {showBlacklist ? 'Show groups' : `Blacklist (${blacklist.length})`}
          </button>
          {!showBlacklist && (
            <>
              {selectedSet.size > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  title="Remove selected groups from the list permanently (can Restore from Blacklist)"
                  onClick={() => void onBlacklistSelected()}
                  className="rounded-md border border-ember/45 bg-ember/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-ember hover:bg-ember/20 disabled:opacity-50"
                >
                  Blacklist selected ({selectedSet.size})
                </button>
              )}
              <button
                type="button"
                onClick={selectAllVisible}
                className="rounded-md border border-lineStrong px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-mist hover:text-snow"
              >
                Select visible
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="rounded-md border border-lineStrong px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-mist hover:text-snow"
              >
                Clear
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onClearWarm}
                className="rounded-md border border-lineStrong px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-mist hover:text-snow disabled:opacity-50"
              >
                Clear warm
              </button>
            </>
          )}
        </div>
      </div>
      <input
        className={`${inputCls} mb-3`}
        value={groupFilter}
        onChange={(e) => setGroupFilter(e.target.value)}
        placeholder={showBlacklist ? 'Filter blacklist…' : 'Filter groups…'}
      />
      {showBlacklist ? (
        !blacklist.length ? (
          <EmptyState title="No blacklisted groups yet" />
        ) : (
          <ul className="max-h-[270px] space-y-1 overflow-y-auto">
            {filteredBlacklist.map((g) => (
              <li key={g.id} className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-lift">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-snow">{g.name}</span>
                  <span className="block truncate font-mono text-[10px] text-fog">
                    {g.id}
                    {g.removedAt ? ` · ${new Date(g.removedAt).toLocaleString()}` : ''}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] text-ember/90">
                  {blacklistReasonLabel(g.reason)}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  title="Restore to groups list"
                  onClick={() => {
                    void unblacklistGroupPosterGroup(g.id).then(async (r) => {
                      flash(r.message || (r.ok ? 'Restored' : 'Failed'))
                      await refresh({ syncSettings: true })
                    })
                  }}
                  className="shrink-0 rounded-md border border-lineStrong px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-mist hover:text-snow disabled:opacity-40"
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        )
      ) : !groups.length ? (
        <EmptyState title="No groups loaded" />
      ) : (
        <ul className="max-h-[270px] space-y-1 overflow-y-auto">
          {filteredGroups.map((g) => {
            const checked = selectedSet.size === 0 || selectedSet.has(g.id)
            const explicitly = selectedSet.has(g.id)
            return (
              <li key={g.id}>
                <label className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-lift">
                  <input
                    type="checkbox"
                    className={`${checkCls} mt-0.5`}
                    checked={explicitly}
                    onChange={() => toggleGroup(g.id)}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-snow">{g.name}</span>
                    {g.name !== g.id ? (
                      <span className="block truncate font-mono text-[10px] text-fog">{g.id}</span>
                    ) : null}
                  </span>
                  {!explicitly && selectedSet.size === 0 ? (
                    <span className="ml-auto shrink-0 font-mono text-[9px] uppercase text-phosphor/80">
                      all
                    </span>
                  ) : checked && explicitly ? null : null}
                </label>
              </li>
            )
          })}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-fog">
        {showBlacklist
          ? 'Restore puts a group back on the main list.'
          : 'Empty selection = all loaded groups. Check boxes to limit, or blacklist to hide.'}
      </p>
    </section>
  )
}

function ActivityAside({
  state,
  run,
  busy,
  waitingLive,
  liveWait,
  latestWaitLogIndex,
  flash,
  setState,
  refresh,
}: {
  state: GroupPosterState | null
  run: GroupPosterRun | undefined
  busy: boolean
  waitingLive: boolean
  liveWait: string | null
  latestWaitLogIndex: number
  flash: (msg: string) => void
  setState: React.Dispatch<React.SetStateAction<GroupPosterState | null>>
  refresh: (opts?: { syncSettings?: boolean; light?: boolean }) => Promise<void>
}) {
  return (
    <aside className="tool-companion fit-side flex max-h-[520px] min-h-0 min-w-0 flex-col rounded-2xl border border-lineStrong bg-panel">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-snow">Activity</h2>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-fog">
            {run?.posted ?? 0} posted · {run?.failed ?? 0} failed
            {run?.total ? ` / ${run.total}` : ''}
          </span>
          <button
            type="button"
            title="Clear activity log"
            disabled={busy}
            onClick={() => {
              void clearGroupPosterLog().then(async (r) => {
                flash(r.message || (r.ok ? 'Log cleared' : 'Failed'))
                if (r.ok) {
                  setState((prev) => (prev ? { ...prev, log: [] } : prev))
                }
                await refresh({ light: true })
              })
            }}
            className="rounded-md border border-lineStrong bg-raised px-2 py-0.5 font-mono text-[10px] uppercase text-fog transition hover:bg-lift hover:text-mist disabled:opacity-40"
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
                <p className="mt-0.5 text-sm text-snow/90">
                  {waitingLive && liveWait && i === latestWaitLogIndex ? liveWait : entry.message}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
