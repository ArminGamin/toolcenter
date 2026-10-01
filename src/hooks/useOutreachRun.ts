import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchOllamaModels } from '../lib/launch'
import {
  saveOutreachSettings,
  startOutreachRun,
  fetchOutreachPoll,
  fetchOutreachState,
  type OutreachSettings,
  type OutreachState,
} from '../lib/outreach'

export type StageTab = 'find' | 'leads' | 'clean' | 'approve' | 'send'

export const OUTREACH_STAGES: StageTab[] = ['find', 'leads', 'clean', 'approve', 'send']

export function useOutreachRun(active = true) {
  const [state, setState] = useState<OutreachState | null>(null)
  const [settings, setSettings] = useState<OutreachSettings | null>(null)
  const [stageTab, setStageTab] = useState<StageTab>('find')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showDropped, setShowDropped] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [timerTick, setTimerTick] = useState(0)

  const settingsRef = useRef<OutreachSettings | null>(null)
  const settingsDirtyRef = useRef(false)
  const [unsavedChanges, setUnsavedChanges] = useState(false)
  const runStageRef = useRef<string>('')
  const stageTabRef = useRef<StageTab>('find')
  const activeRef = useRef(active)
  const pollInFlightRef = useRef(false)
  activeRef.current = active
  stageTabRef.current = stageTab

  const refresh = useCallback(async (opts?: { syncSettings?: boolean; light?: boolean }) => {
    const useLight = Boolean(opts?.light) && !opts?.syncSettings
    const next = useLight ? await fetchOutreachPoll() : await fetchOutreachState()
    if (!next) {
      setOffline(true)
      setLoadError('Bridge unreachable')
      return
    }
    setOffline(false)
    if (next.ok === false) {
      if (!useLight) {
        setLoadError((next as { message?: string }).message || 'Outreach could not load')
      }
      return
    }
    setLoadError(null)
    setState((prev) => {
      if (!prev) {
        if (!(next as OutreachState).settings) return prev
        return next as OutreachState
      }
      return {
        ...prev,
        ...next,
        counts: (next as OutreachState).counts ?? prev.counts,
        quota: (next as OutreachState).quota ?? prev.quota,
        profileStore: (next as OutreachState).profileStore ?? prev.profileStore,
        chain: (next as OutreachState).chain ?? prev.chain,
        settings: (next as OutreachState).settings ?? prev.settings,
        sendProfiles: (next as OutreachState).sendProfiles ?? prev.sendProfiles,
        assets: (next as OutreachState).assets ?? prev.assets,
        vault: next.vault ?? prev.vault,
      } as OutreachState
    })
    if (!useLight && (next as OutreachState).settings) {
      if (opts?.syncSettings || !settingsDirtyRef.current) {
        setSettings((next as OutreachState).settings)
        settingsRef.current = (next as OutreachState).settings
        if (opts?.syncSettings) {
          settingsDirtyRef.current = false
          setUnsavedChanges(false)
        }
      }
    } else if (
      useLight &&
      !settingsDirtyRef.current &&
      typeof (next as OutreachState).counts?.findTarget === 'number' &&
      (next as OutreachState).counts!.findTarget > 0
    ) {
      const target = String((next as OutreachState).counts!.findTarget)
      setSettings((prev) => {
        if (!prev || prev.find.leadTarget === target) return prev
        const updated = { ...prev, find: { ...prev.find, leadTarget: target } }
        settingsRef.current = updated
        return updated
      })
    }
    if (!next.run) return
    const stageKey = `${next.run.stage}:${next.run.status}`
    if (opts?.syncSettings || stageKey !== runStageRef.current) {
      const prevKey = runStageRef.current
      runStageRef.current = stageKey
      if (stageTabRef.current === 'leads' && (next.run.stage === 'find' || next.run.stage === 'clean')) {
        return
      }
      if (next.run.stage === 'send' || next.run.status === 'sending' || next.run.status === 'paused')
        setStageTab('send')
      else if (next.run.stage === 'approve' || next.run.status === 'waiting') setStageTab('approve')
      else if (opts?.syncSettings || !prevKey) {
        if (next.run.stage === 'find' || next.run.stage === 'clean') setStageTab('find')
      }
    }
  }, [])

  const findingLive =
    Boolean(state?.findChildRunning) ||
    (state?.run?.stage === 'find' &&
      (state?.run?.status === 'running' || state?.run?.status === 'idle'))

  useEffect(() => {
    void refresh({ syncSettings: true })
    void fetchOllamaModels().then((r) => {
      if (r.ok && Array.isArray(r.models)) setModels(r.models)
    })
  }, [refresh])

  useEffect(() => {
    const intervalMs = !active ? 8000 : findingLive ? 800 : 2500
    const id = window.setInterval(() => {
      if (pollInFlightRef.current) return
      pollInFlightRef.current = true
      void refresh({ light: true }).finally(() => {
        pollInFlightRef.current = false
      })
    }, intervalMs)
    return () => window.clearInterval(id)
  }, [refresh, active, findingLive])


  useEffect(() => {
    if (!state?.run.id) return
    if (state.run.stage !== 'approve' && !(state.run.stage === 'send' && state.run.status === 'waiting')) return
    const keeps = state.run.candidates.filter((c) => c.decision === 'keep')
    setSelected(new Set(keeps.filter((c) => c.selected !== false).map((c) => c.email)))
  }, [state?.run.id, state?.run.stage, state?.run.status, state?.run.candidates])

  function flash(msg: string) {
    setToast(msg)
    window.setTimeout(() => setToast(null), 3400)
  }

  function persist(next: OutreachSettings) {
    setSettings(next)
    settingsRef.current = next
    settingsDirtyRef.current = true
    setUnsavedChanges(true)
  }

  async function flushPersist() {
    const toSave = settingsRef.current
    if (!toSave || !settingsDirtyRef.current) return
    const res = await saveOutreachSettings(toSave)
    if (res.ok) {
      settingsDirtyRef.current = false
      setUnsavedChanges(false)
      if (res.settings) {
        setSettings(res.settings)
        settingsRef.current = res.settings
      }
    }
    return res
  }

  async function saveChanges() {
    const res = await flushPersist()
    if (res?.ok) flash('Changes saved')
    else if (res && !res.ok) flash(res.message || 'Save failed')
    else if (!settingsDirtyRef.current) flash('Nothing to save')
    await refresh({ syncSettings: true })
  }

  async function onStart(opts?: { importFilePath?: string }) {
    if (!settings) return
    await flushPersist()
    setBusy(true)
    try {
      const current = settingsRef.current || settings
      const res = await startOutreachRun({
        settings: current,
        pasteList: current.find.source === 'paste' ? current.find.pasteList : undefined,
        importFilePath:
          current.find.source === 'import' ? opts?.importFilePath : undefined,
      })
      flash(res.message)
      if (res.ok) setStageTab('leads')
      await refresh({ syncSettings: true })
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Start failed')
    } finally {
      setBusy(false)
    }
  }

  const run = state?.run
  const counts = state?.counts
  const chain = state?.chain

  const chainStopped =
    Boolean(chain?.finishedAt) ||
    run?.status === 'paused' ||
    run?.status === 'error' ||
    run?.status === 'done' ||
    run?.status === 'idle'

  useEffect(() => {
    if (!chain?.startedAt || chainStopped || !active) return
    const id = window.setInterval(() => setTimerTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [chain?.startedAt, chainStopped, active])

  const chainElapsedMs = useMemo(() => {
    if (!chain?.startedAt) return null
    const start = Date.parse(chain.startedAt)
    if (!Number.isFinite(start)) return null
    const end = chain.finishedAt
      ? Date.parse(chain.finishedAt)
      : chainStopped && run?.updatedAt
        ? Date.parse(run.updatedAt)
        : Date.now()
    void timerTick
    return Math.max(0, (Number.isFinite(end) ? end : Date.now()) - start)
  }, [chain?.startedAt, chain?.finishedAt, chainStopped, run?.updatedAt, timerTick])

  const keepCandidates = useMemo(
    () => (run?.candidates || []).filter((c) => c.decision === 'keep'),
    [run?.candidates],
  )
  const dropCandidates = useMemo(
    () => (run?.candidates || []).filter((c) => c.decision === 'drop'),
    [run?.candidates],
  )

  const activeStageIndex = useMemo(() => {
    const stage = run?.stage
    if (stage === 'approve') return OUTREACH_STAGES.indexOf('approve')
    if (stage === 'send' || stage === 'done') return OUTREACH_STAGES.indexOf('send')
    if (stage === 'clean') return OUTREACH_STAGES.indexOf('clean')
    if (stage === 'find' && (counts?.found ?? 0) > 0) return OUTREACH_STAGES.indexOf('leads')
    if (stage === 'find') return OUTREACH_STAGES.indexOf('find')
    return 0
  }, [run?.stage, counts?.found])

  return {
    state,
    setState,
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
    findingLive,
    chainStopped,
    chainElapsedMs,
    keepCandidates,
    dropCandidates,
    activeStageIndex,
    settingsRef,
    settingsDirtyRef,
  }
}
