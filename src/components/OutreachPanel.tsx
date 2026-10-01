import {
  abortOutreach,
  approveOutreach,
  clearOutreachRun,
  clearScrapeCache,
  clearProfileDatabases,
  cleanOutreachFound,
  dryRunClean,
  exportOutreachLeads,
  loadPromoHtml,
  pauseOutreachSend,
  resetOutreachRejected,
  resetOutreachSent,
  resumeOutreachSend,
  startOutreachLiveSend,
  startOutreachSend,
  testOutreachSend,
} from '../lib/outreach'
import { useOutreachRun, OUTREACH_STAGES } from '../hooks/useOutreachRun'
import { OutreachStepLoader } from './OutreachStepLoader'
import { SaveChangesBar, SaveChangesFooter } from './ui/SaveChangesBar'
import { AutomationRunBar } from './ui/AutomationRunBar'
import { LoadingPanel, ErrorRetryCallout } from './ui/primitives'
import { BridgeOfflinePanel } from './ui/bridge-offline'
import { statusLabel, statusTone } from './outreach/outreach-utils'
import { Stat, Btn } from './outreach/outreach-ui'
import { FindSection } from './outreach/FindSection'
import { LeadsSection } from './outreach/LeadsSection'
import { CleanSection } from './outreach/CleanSection'
import { ApproveSection } from './outreach/ApproveSection'
import { SendSection } from './outreach/SendSection'
import { CampaignHealthRail } from './outreach/CampaignHealthRail'
import { CandidateAuditPanel } from './outreach/CandidateAuditPanel'

export function OutreachPanel({ active = true }: { active?: boolean }) {
  const {
    state,
    settings,
    setSettings,
    stageTab,
    setStageTab,
    busy,
    setBusy,
    toast,
    offline,
    loadError,
    selected,
    setSelected,
    showDropped,
    setShowDropped,
    models,
    refresh,
    flash,
    persist,
    flushPersist,
    saveChanges,
    unsavedChanges,
    onStart,
    run,
    counts,
    chain,
    chainElapsedMs,
    keepCandidates,
    dropCandidates,
    activeStageIndex,
    settingsRef,
    settingsDirtyRef,
  } = useOutreachRun(active)

  if (offline) {
    return (
      <div className="flex h-full items-center justify-center">
        <BridgeOfflinePanel onRetry={() => void refresh({ syncSettings: true })} />
      </div>
    )
  }

  if (loadError && !settings) {
    return (
      <div className="flex h-full items-center justify-center px-4">
        <ErrorRetryCallout
          title="Outreach settings could not load"
          body={loadError}
          onRetry={() => void refresh({ syncSettings: true })}
        />
      </div>
    )
  }

  if (!settings || !state) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingPanel title="Loading Outreach…" />
      </div>
    )
  }

  return (
    <div className="tool-workspace flex flex-col gap-6">
      {/* Mission header */}
      <header className="shrink-0 overflow-hidden rounded-2xl border border-lineStrong bg-panel shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-lineStrong px-4 py-3 sm:px-5">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-brass">Outreach Autopilot</p>
            <h1 className="mt-0.5 font-sans text-lg font-semibold tracking-tight text-snow sm:text-xl">
              Mission control
            </h1>
            <p className={`mt-1 font-mono text-[11px] ${statusTone(run?.status || 'idle')}`}>
              {statusLabel(run?.status || 'idle')}
              {state.chain?.active
                ? ` · chain ${Math.min((state.chain.index ?? 0) + 1, state.chain.total)}/${state.chain.total}${
                    state.chain.current ? ` ${state.chain.current}` : ''
                  }`
                : ''}
              {run?.status === 'error' && run?.error
                ? ` - ${run.error.slice(0, 160)}`
                : [
                    run?.stage && run.stage !== 'idle' ? ` · ${run.stage.toUpperCase()}` : '',
                    run?.message ? ` - ${run.message}` : '',
                  ].join('')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <SaveChangesBar compact dirty={unsavedChanges} busy={busy} onSave={() => void saveChanges()} />
            <Btn
              onClick={() => void onStart()}
              disabled={
                busy ||
                run?.status === 'running' ||
                run?.status === 'sending' ||
                run?.status === 'waiting' ||
                run?.status === 'paused'
              }
              primary
            >
              {settings?.chain?.enabled && (settings.chain.profiles?.length ?? 0) > 0
                ? 'Start chain'
                : 'Start'}
            </Btn>
            <Btn onClick={() => void pauseOutreachSend().then(() => refresh())} disabled={run?.status !== 'sending'}>
              Pause
            </Btn>
            <Btn onClick={() => void resumeOutreachSend().then(() => refresh())} disabled={!(run?.status === 'paused' || (run?.stage === 'send' && (run?.pendingSend.length ?? 0) > 0 && run?.status === 'waiting'))}>
              Resume
            </Btn>
            <Btn
              onClick={() =>
                void abortOutreach().then((r) => {
                  flash(r.message)
                  setStageTab('find')
                  void refresh({ syncSettings: true })
                })
              }
              danger
              disabled={busy || !run?.id || run?.status === 'idle'}
            >
              Abort
            </Btn>
            <Btn
              onClick={() =>
                void clearOutreachRun().then(async (r) => {
                  flash(r.message)
                  await refresh({ syncSettings: true })
                })
              }
              disabled={busy}
            >
              Clear run
            </Btn>
          </div>
        </div>

        {/* Pipeline rail */}
        <div className="flex items-center gap-1.5 bg-well px-4 py-2.5 sm:px-5">
          {/* Clean + approve steps are hidden from the rail; their logic still runs,
              and the approve view still opens automatically when a run waits on it. */}
          {OUTREACH_STAGES.filter((s) => s !== 'clean' && s !== 'approve').map((s, i) => {
            const active = stageTab === s
            const done = activeStageIndex > OUTREACH_STAGES.indexOf(s) || run?.status === 'done'
            const current =
              s === 'leads'
                ? Boolean(state.findChildRunning) ||
                  (run?.stage === 'find' && (run?.found?.length ?? 0) > 0)
                : run?.stage === s
            const label =
              s === 'leads' && (counts?.found ?? 0) > 0 ? `leads (${counts?.found})` : s
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStageTab(s)}
                className={[
                  'flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider transition',
                  active
                    ? 'border-brass/45 bg-brass/20 text-brass shadow-card'
                    : current
                      ? 'border-phosphor/40 bg-phosphor/15 text-phosphor hover:bg-phosphor/25'
                      : done
                        ? 'border-lineStrong bg-raised text-mist hover:bg-lift hover:text-snow'
                        : 'border-lineStrong bg-raised text-fog hover:bg-lift hover:text-mist',
                ].join(' ')}
              >
                <span className="opacity-60">{i + 1}</span>
                {label}
              </button>
            )
          })}
        </div>

        <div className="grid grid-cols-2 gap-px border-t border-lineStrong bg-lineStrong sm:grid-cols-5">
          <Stat label="Found" value={counts?.found ?? 0} />
          <Stat label="Kept" value={counts?.kept ?? 0} />
          <Stat label="Sent" value={counts?.sent ?? 0} />
          <Stat label="Queue" value={counts?.pendingSend ?? 0} />
          <Stat
            label={
              state.chain?.active && state.chain.current
                ? `Quota · ${state.chain.current}`
                : state.profileStore?.name && state.profileStore.name !== '(default)'
                  ? `Quota · ${state.profileStore.name}`
                  : 'Quota · today'
            }
            value={`${state?.quota?.sent ?? counts?.quotaSent ?? 0}/${state?.quota?.cap ?? counts?.quotaCap ?? 150}`}
            accent
            className="col-span-2 sm:col-span-1"
          />
        </div>
      </header>

      <details
        className="rounded-2xl border border-lineStrong bg-panel"
        open={Boolean(state.chain?.active || state.findChildRunning || run?.status === 'running' || run?.status === 'sending' || run?.status === 'error')}
      >
        <summary className="cursor-pointer px-5 py-4 text-sm font-medium text-mist hover:text-snow">
          Campaign activity · {statusLabel(run?.status || 'idle')} · {counts?.sent ?? 0} sent
        </summary>
        <div className="space-y-5 border-t border-line p-5">
      <CampaignHealthRail
        health={run?.health}
        fallbackTarget={counts?.findTarget ?? (Number(settings.find.leadTarget) || 0)}
      />

      <CandidateAuditPanel key={run?.id} count={run?.health?.candidatesFound || 0} />

      <AutomationRunBar
        run={{
          id: run?.id || '',
          status: (run?.status || 'idle') as import('../lib/automation-run').AutomationStatus,
          message: run?.message,
          error: run?.error,
          sent: counts?.sent ?? 0,
          failed: counts?.failed ?? 0,
          total: counts?.pendingSend ? counts.sent + counts.pendingSend : undefined,
          workerRunning:
            Boolean(state.findChildRunning) ||
            run?.status === 'running' ||
            run?.status === 'sending',
        }}
      />
        </div>
      </details>

      <div className="tool-workspace-body fit-body grid items-start gap-6 min-[1180px]:grid-cols-[minmax(0,1fr)_340px]">
        <section className="fit-scroll min-w-0 rounded-2xl border border-lineStrong bg-panel">
          <div className="p-5 sm:p-6">
            {stageTab === 'find' && (
              <FindSection
                settings={settings}
                models={models}
                findPath={run?.findOutputPath}
                foundCount={run?.found?.length ?? counts?.found ?? 0}
                onChange={(find) => void persist({ ...settings, find })}
                busy={busy}
                live={{
                  finderRunning: Boolean(state.findChildRunning),
                  sendActive: Boolean(run?.liveSendActive),
                  finderComplete: Boolean(run?.finderComplete),
                  provisional: counts?.liveProvisional ?? 0,
                  eligible: counts?.liveEligible ?? 0,
                  approvalPending: counts?.liveApprovalPending ?? 0,
                  candidates: run?.candidates || [],
                  requireApprove: settings.requireApprove,
                  verifying: settings.find.verify,
                }}
                onSendLive={(selectedLive) => {
                  setBusy(true)
                  void startOutreachLiveSend(selectedLive)
                    .then((r) => {
                      flash(r.message)
                      void refresh({ syncSettings: true })
                    })
                    .finally(() => setBusy(false))
                }}
                onImportFile={(importFilePath) => void onStart({ importFilePath })}
                onExportLeads={() => {
                  setBusy(true)
                  void exportOutreachLeads()
                    .then((r) => {
                      flash(r.message)
                      if (r.ok) void refresh({ syncSettings: true })
                    })
                    .finally(() => setBusy(false))
                }}
                onClearScrapeCache={() => {
                  if (
                    !window.confirm(
                      'Clear scrape cache?\n\nThis wipes this profile’s known emails, exhausted domains, page cache, yield stats, and campaign memory - AND resets this profile’s sent list so those emails can be re-scraped and re-sent.\n\nRejected emails and the permanent bounce/complaint blacklist are KEPT. Other profiles, settings, and notes stay.',
                    )
                  ) {
                    return
                  }
                  setBusy(true)
                  void clearScrapeCache()
                    .then((r) => {
                      flash(r.message)
                      void refresh()
                    })
                    .finally(() => setBusy(false))
                }}
              />
            )}
            {stageTab === 'leads' && (
              <LeadsSection
                emails={run?.found || []}
                evidence={run?.leadEvidence || {}}
                busy={busy}
                onCopy={() => {
                  const text = (run?.found || []).join('\n')
                  if (!text) {
                    flash('No leads yet')
                    return
                  }
                  void navigator.clipboard.writeText(text).then(
                    () => flash(`Copied ${run?.found.length ?? 0} emails`),
                    () => flash('Copy failed'),
                  )
                }}
                onClean={() => {
                  if (!(run?.found || []).length) {
                    flash('No leads to clean')
                    return
                  }
                  setBusy(true)
                  void cleanOutreachFound()
                    .then(async (r) => {
                      flash(r.message)
                      await refresh({ syncSettings: true })
                    })
                    .finally(() => setBusy(false))
                }}
              />
            )}
            {stageTab === 'clean' && (
              <CleanSection
                settings={settings}
                dropCount={dropCandidates.length}
                onChange={(clean) => void persist({ ...settings, clean })}
                onRequireApprove={(requireApprove) => void persist({ ...settings, requireApprove })}
                onDryClean={async () => {
                  setBusy(true)
                  try {
                    const res = await dryRunClean(settings.find.pasteList, settings.clean)
                    if (res.ok) flash(`Dry-run: keep ${res.keep.length} / drop ${res.drop.length}`)
                    else flash(res.message || 'Dry-run failed')
                  } catch (err) {
                    flash(err instanceof Error ? err.message : 'Dry-run failed')
                  } finally {
                    setBusy(false)
                  }
                }}
                busy={busy}
              />
            )}
            {stageTab === 'approve' && (
              <ApproveSection
                keep={keepCandidates}
                drop={dropCandidates}
                selected={selected}
                showDropped={showDropped}
                onToggleShowDropped={() => setShowDropped((v) => !v)}
                onToggle={(email) => {
                  setSelected((prev) => {
                    const next = new Set(prev)
                    if (next.has(email)) next.delete(email)
                    else next.add(email)
                    return next
                  })
                }}
                onSelectAll={() => setSelected(new Set(keepCandidates.map((c) => c.email)))}
                onSelectNone={() => setSelected(new Set())}
                onApprove={async () => {
                  setBusy(true)
                  try {
                    const res = await approveOutreach({ selected: [...selected] })
                    flash(res.message)
                    await refresh({ syncSettings: true })
                    if (res.ok) setStageTab('send')
                  } catch (err) {
                    flash(err instanceof Error ? err.message : 'Approve failed')
                  } finally {
                    setBusy(false)
                  }
                }}
                busy={busy}
                waiting={run?.status === 'waiting' || run?.stage === 'approve'}
              />
            )}
            {stageTab === 'send' && (
              <SendSection
                settings={settings}
                vault={state.vault}
                assets={state.assets}
                profiles={state.sendProfiles || []}
                profileStore={state.profileStore}
                chain={state.chain}
                pending={run?.pendingSend.length ?? 0}
                onChange={(send) => void persist({ ...settings, send })}
                onChangeChain={(chain) => void persist({ ...settings, chain })}
                onProfilesChange={async (nextSettings) => {
                  if (nextSettings) {
                    setSettings(nextSettings)
                    settingsRef.current = nextSettings
                    settingsDirtyRef.current = false
                  }
                  await refresh({ syncSettings: true })
                }}
                onBeforeProfileAction={async () => {
                  await flushPersist()
                }}
                onFlash={flash}
                onSend={async () => {
                  await flushPersist()
                  setBusy(true)
                  try {
                    const res = await startOutreachSend()
                    flash(res.message)
                    await refresh({ syncSettings: true })
                  } catch (err) {
                    flash(err instanceof Error ? err.message : 'Send failed')
                  } finally {
                    setBusy(false)
                  }
                }}
                onTest={async () => {
                  await flushPersist()
                  setBusy(true)
                  try {
                    const res = await testOutreachSend()
                    flash(res.message)
                  } catch (err) {
                    flash(err instanceof Error ? err.message : 'Test send failed')
                  } finally {
                    setBusy(false)
                  }
                }}
                onLoadPromo={async () => {
                  setBusy(true)
                  try {
                    const res = await loadPromoHtml()
                    flash(res.message)
                    if (res.settings) {
                      setSettings(res.settings)
                      settingsRef.current = res.settings
                      settingsDirtyRef.current = false
                    }
                    await refresh({ syncSettings: true })
                  } catch (err) {
                    flash(err instanceof Error ? err.message : 'Load promo failed')
                  } finally {
                    setBusy(false)
                  }
                }}
                onResetSent={() => void resetOutreachSent().then((r) => flash(r.message))}
                onResetRejected={() => void resetOutreachRejected().then((r) => flash(r.message))}
                onClearRun={() =>
                  void clearOutreachRun().then(async (r) => {
                    flash(r.message)
                    await refresh({ syncSettings: true })
                  })
                }
                onClearActiveDb={() => {
                  setBusy(true)
                  void clearProfileDatabases('active')
                    .then(async (r) => {
                      flash(r.message)
                      await refresh({ syncSettings: true })
                    })
                    .finally(() => setBusy(false))
                }}
                onClearAllDbs={() => {
                  setBusy(true)
                  void clearProfileDatabases('all')
                    .then(async (r) => {
                      flash(r.message)
                      await refresh({ syncSettings: true })
                    })
                    .finally(() => setBusy(false))
                }}
                busy={busy}
                canSend={
                  (run?.pendingSend.length ?? 0) > 0 &&
                  run?.status !== 'sending' &&
                  run?.status !== 'running' &&
                  (run?.stage === 'send' ||
                    run?.status === 'paused' ||
                    run?.status === 'waiting' ||
                    run?.status === 'error')
                }
              />
            )}
          </div>
        </section>

        <aside className="tool-companion fit-scroll flex min-w-0 flex-col items-center rounded-2xl border border-lineStrong bg-well p-5">
          <OutreachStepLoader
            stage={run?.stage}
            status={run?.status}
            found={counts?.found ?? 0}
            leadTarget={counts?.findTarget ?? (Number(settings.find.leadTarget) || 0)}
            kept={counts?.kept ?? 0}
            dropped={counts?.dropped ?? 0}
            approved={counts?.approved ?? 0}
            findChildRunning={Boolean(state.findChildRunning)}
            elapsedMs={chainElapsedMs}
            chainActive={Boolean(chain?.active)}
          />
        </aside>
      </div>

      <SaveChangesFooter dirty={unsavedChanges} busy={busy} onSave={() => void saveChanges()} />
      {toast && (
        <div className="pointer-events-none fixed bottom-8 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-lineStrong bg-lift px-4 py-2 font-mono text-xs text-snow shadow-panel max-[860px]:bottom-24">
          {toast}
        </div>
      )}
    </div>
  )
}
