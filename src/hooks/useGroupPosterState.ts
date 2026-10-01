import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  blacklistGroupPosterGroups,
  deleteGroupPosterProfile,
  fetchGroupPosterPoll,
  fetchGroupPosterState,
  loadGroupPosterProfile,
  refreshGroupPosterGroups,
  saveGroupPosterCaptions,
  saveGroupPosterProfile,
  saveGroupPosterSettings,
  startGroupPoster,
  clearGroupPosterLoginSession,
  type GroupPosterSettings,
  type GroupPosterState,
} from '../lib/group-poster'

function formatWaitSec(sec: number) {
  const total = Math.max(0, Math.floor(sec))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}m ${String(s).padStart(2, '0')}s`
}

function liveWaitText(label: string | null | undefined, endsAt: string | null | undefined, nowMs: number) {
  if (!endsAt) return null
  const ends = Date.parse(endsAt)
  if (!Number.isFinite(ends)) return null
  const remaining = Math.max(0, (ends - nowMs) / 1000)
  const t = formatWaitSec(remaining)
  if (label === 'Waiting') return `Waiting ${t} before next group`
  if (label === 'Short wait') return `Short wait ${t} after skip`
  if (label === 'Warm-up') return `Warm-up ${t}`
  if (label) return `${label} ${t}`
  return `Waiting ${t}`
}

function isWaitLogMessage(message: string) {
  return (
    message === 'Waiting before next group' ||
    message === 'Short wait after skip' ||
    message === 'Warm-up' ||
    /^Waiting \d+m \d{2}s before next group$/.test(message) ||
    /^Short wait \d+m \d{2}s after skip$/.test(message) ||
    /^Warm-up \d+m \d{2}s$/.test(message)
  )
}

function blacklistReasonLabel(reason: string) {
  if (reason === 'buy_sell') return 'Buy & Sell'
  if (reason === 'admin_approval') return 'Admin approval'
  if (reason === 'not_member') return 'Not a member'
  if (reason === 'game_block') return 'Fortnite/Valorant/Apex'
  if (reason === 'english') return 'English name'
  if (reason === 'russian') return 'Russian letters'
  if (reason === 'manual') return 'Manual'
  return reason || 'Blocked'
}

function profileKeyMatch(a: string, b: string) {
  return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase()
}

export function useGroupPosterState(active = true) {
  const [panelTab, setPanelTab] = useState<'groups' | 'dms' | 'share'>('groups')
  const [state, setState] = useState<GroupPosterState | null>(null)
  const [settings, setSettings] = useState<GroupPosterSettings | null>(null)
  const [captions, setCaptions] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [groupFilter, setGroupFilter] = useState('')
  const [showBlacklist, setShowBlacklist] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [selectedProfile, setSelectedProfile] = useState('')
  const [profileBusy, setProfileBusy] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const captionsFileInputRef = useRef<HTMLInputElement | null>(null)

  const settingsRef = useRef<GroupPosterSettings | null>(null)
  const captionsRef = useRef('')
  const loginPasswordRef = useRef('')
  const settingsDirtyRef = useRef(false)
  const captionsDirtyRef = useRef(false)
  const passwordDirtyRef = useRef(false)
  const [unsavedChanges, setUnsavedChanges] = useState(false)
  const activeRef = useRef(active)
  const pollInFlightRef = useRef(false)
  const profileSeededRef = useRef(false)
  activeRef.current = active

  const flash = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 3200)
  }, [])

  const recomputeUnsaved = useCallback(() => {
    const dirty =
      settingsDirtyRef.current || captionsDirtyRef.current || passwordDirtyRef.current
    setUnsavedChanges(dirty)
  }, [])

  const refresh = useCallback(async (opts?: { syncSettings?: boolean; light?: boolean }) => {
    const useLight = Boolean(opts?.light) && !opts?.syncSettings
    const next = useLight ? await fetchGroupPosterPoll() : await fetchGroupPosterState()
    if (!next) {
      setOffline(true)
      setLoadError('Bridge unreachable')
      return
    }
    setOffline(false)
    setLoadError(null)

    if (next.settings && (opts?.syncSettings || !settingsDirtyRef.current)) {
      setSettings(next.settings)
      settingsRef.current = next.settings
      if (opts?.syncSettings) {
        settingsDirtyRef.current = false
        recomputeUnsaved()
      }
    }
    if (typeof next.captions === 'string' && (opts?.syncSettings || !captionsDirtyRef.current)) {
      setCaptions(next.captions)
      captionsRef.current = next.captions
      if (opts?.syncSettings) {
        captionsDirtyRef.current = false
        recomputeUnsaved()
      }
    }

    if (
      typeof next.loginPassword === 'string' &&
      (opts?.syncSettings || !passwordDirtyRef.current)
    ) {
      setLoginPassword(next.loginPassword)
      loginPasswordRef.current = next.loginPassword
    }

    setState((prev) => {
      if (!prev) return next as GroupPosterState
      return {
        ...prev,
        ...next,
        settings: (next.settings as GroupPosterSettings) || prev.settings,
        captions: typeof next.captions === 'string' ? next.captions : prev.captions,
        log: Array.isArray(next.log) ? next.log : prev.log,
        groups: Array.isArray(next.groups) ? next.groups : prev.groups,
        blacklist: Array.isArray(next.blacklist) ? next.blacklist : prev.blacklist,
        progress: next.progress && typeof next.progress === 'object' ? next.progress : prev.progress,
        profiles: Array.isArray(next.profiles) ? next.profiles : prev.profiles,
        activeProfile:
          typeof next.activeProfile === 'string' ? next.activeProfile : prev.activeProfile,
      } as GroupPosterState
    })

    if (
      !profileSeededRef.current &&
      typeof next.activeProfile === 'string' &&
      next.activeProfile.trim()
    ) {
      profileSeededRef.current = true
      setProfileName(next.activeProfile)
      setSelectedProfile(next.activeProfile)
    }
  }, [recomputeUnsaved])

  const flushPersist = useCallback(async () => {
    const jobs: Promise<unknown>[] = []
    if (settingsDirtyRef.current && settingsRef.current) {
      settingsDirtyRef.current = false
      const payload: Partial<GroupPosterSettings> & { loginPassword?: string } = {
        ...settingsRef.current,
      }
      if (passwordDirtyRef.current && loginPasswordRef.current) {
        payload.loginPassword = loginPasswordRef.current
        passwordDirtyRef.current = false
      }
      jobs.push(saveGroupPosterSettings(payload))
    } else if (passwordDirtyRef.current && loginPasswordRef.current) {
      passwordDirtyRef.current = false
      jobs.push(saveGroupPosterSettings({ loginPassword: loginPasswordRef.current }))
    }
    if (captionsDirtyRef.current) {
      captionsDirtyRef.current = false
      jobs.push(saveGroupPosterCaptions(captionsRef.current))
    }
    if (jobs.length) await Promise.all(jobs)
    recomputeUnsaved()
  }, [recomputeUnsaved])

  const saveChanges = useCallback(async () => {
    await flushPersist()
    flash('Changes saved')
    await refresh({ syncSettings: true })
  }, [flash, flushPersist, refresh])

  const patchSettings = useCallback(
    (partial: Partial<GroupPosterSettings>) => {
      setSettings((prev) => {
        if (!prev) return prev
        const next = { ...prev, ...partial }
        settingsRef.current = next
        settingsDirtyRef.current = true
        recomputeUnsaved()
        return next
      })
    },
    [recomputeUnsaved],
  )

  const panelTabRef = useRef(panelTab)
  panelTabRef.current = panelTab

  useEffect(() => {
    void refresh({ syncSettings: true })
  }, [refresh])

  useEffect(() => {
    const id = window.setInterval(() => {
      if (!activeRef.current || panelTabRef.current !== 'groups') return
      if (pollInFlightRef.current) return
      pollInFlightRef.current = true
      void refresh({ light: true }).finally(() => {
        pollInFlightRef.current = false
      })
    }, active ? 2500 : 8000)
    return () => window.clearInterval(id)
  }, [active, panelTab, refresh])

  const run = state?.run
  const status = run?.status || 'idle'
  const workerRunning = Boolean(state?.workerRunning)
  const groups = useMemo(() => state?.groups || [], [state?.groups])
  const blacklist = useMemo(() => state?.blacklist || [], [state?.blacklist])
  const waitEndsAt = run?.waitEndsAt || null
  const waitLabel = run?.waitLabel || null
  const waitingLive = Boolean(waitEndsAt && status === 'running')

  useEffect(() => {
    if (!waitingLive) return
    setNowMs(Date.now())
    const id = window.setInterval(() => setNowMs(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [waitingLive, waitEndsAt])

  const liveWait = useMemo(
    () => (waitingLive ? liveWaitText(waitLabel, waitEndsAt, nowMs) : null),
    [waitingLive, waitLabel, waitEndsAt, nowMs],
  )

  const headerMessage = status === 'paused' ? run?.message : liveWait || run?.message

  const latestWaitLogIndex = useMemo(() => {
    const log = state?.log || []
    for (let i = log.length - 1; i >= 0; i -= 1) {
      if (isWaitLogMessage(log[i]?.message || '')) return i
    }
    return -1
  }, [state?.log])

  const filteredGroups = useMemo(() => {
    const q = groupFilter.trim().toLowerCase()
    if (!q) return groups
    return groups.filter((g) => g.name.toLowerCase().includes(q) || g.id.toLowerCase().includes(q))
  }, [groups, groupFilter])

  const filteredBlacklist = useMemo(() => {
    const q = groupFilter.trim().toLowerCase()
    if (!q) return blacklist
    return blacklist.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.id.toLowerCase().includes(q) ||
        (g.reason || '').toLowerCase().includes(q),
    )
  }, [blacklist, groupFilter])

  const selectedSet = useMemo(
    () => new Set(settings?.selectedGroupIds || []),
    [settings?.selectedGroupIds],
  )

  async function onStart() {
    setBusy(true)
    await flushPersist()
    const res = await startGroupPoster(settingsRef.current || undefined)
    setBusy(false)
    flash(res.message || (res.ok ? 'Started' : 'Failed'))
    await refresh({ syncSettings: true })
  }

  async function onSaveProfile() {
    const name = (profileName || selectedProfile).trim()
    if (!name) {
      flash('Enter a profile name first')
      return
    }
    setProfileBusy(true)
    await flushPersist()
    const res = await saveGroupPosterProfile(name)
    setProfileBusy(false)
    flash(res.message || (res.ok ? 'Saved' : 'Failed'))
    if (res.ok) {
      setSelectedProfile(name)
      setProfileName(name)
      profileSeededRef.current = true
      await refresh({ syncSettings: true })
    }
  }

  async function onLoadProfile() {
    const name = (selectedProfile || profileName).trim()
    if (!name) {
      flash('Pick a profile to load')
      return
    }
    setProfileBusy(true)
    settingsDirtyRef.current = false
    captionsDirtyRef.current = false
    const res = await loadGroupPosterProfile(name)
    setProfileBusy(false)
    flash(res.message || (res.ok ? 'Loaded' : 'Failed'))
    if (res.ok) {
      setSelectedProfile(name)
      setProfileName(name)
      profileSeededRef.current = true
      if (res.settings) {
        setSettings(res.settings)
        settingsRef.current = res.settings
      }
      if (typeof res.captions === 'string') {
        setCaptions(res.captions)
        captionsRef.current = res.captions
      }
      await refresh({ syncSettings: true })
    }
  }

  async function onDeleteProfile() {
    const name = (selectedProfile || profileName).trim()
    if (!name) {
      flash('Pick a profile to delete')
      return
    }
    if (
      !window.confirm(
        `Delete profile “${name}”?\n\nThis only removes the saved snapshot. Current settings on screen stay until you load another profile.`,
      )
    ) {
      return
    }
    setProfileBusy(true)
    const res = await deleteGroupPosterProfile(name)
    setProfileBusy(false)
    flash(res.message || (res.ok ? 'Deleted' : 'Failed'))
    if (res.ok) {
      setSelectedProfile('')
      if (profileKeyMatch(profileName, name)) setProfileName('')
      await refresh({ syncSettings: true })
    }
  }

  async function onRefreshGroups() {
    setBusy(true)
    await flushPersist()
    const res = await refreshGroupPosterGroups()
    setBusy(false)
    flash(res.message || (res.ok ? 'Refreshing…' : 'Failed'))
    await refresh({ syncSettings: true })
  }

  async function onClearLoginSession() {
    setBusy(true)
    const res = await clearGroupPosterLoginSession()
    setBusy(false)
    flash(res.message || (res.ok ? 'Login session cleared' : 'Failed'))
    await refresh({ syncSettings: true })
  }

  async function onAction(
    fn: () => Promise<{ ok: boolean; message: string }>,
    okMsg?: string,
  ) {
    setBusy(true)
    const res = await fn()
    setBusy(false)
    flash(res.message || okMsg || (res.ok ? 'OK' : 'Failed'))
    await refresh({ light: true })
  }

  function toggleGroup(id: string) {
    if (!settings) return
    const next = new Set(settings.selectedGroupIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    patchSettings({ selectedGroupIds: [...next] })
  }

  function selectAllVisible() {
    if (!settings) return
    const next = new Set(settings.selectedGroupIds)
    for (const g of filteredGroups) next.add(g.id)
    patchSettings({ selectedGroupIds: [...next] })
  }

  function clearSelection() {
    patchSettings({ selectedGroupIds: [] })
  }

  async function onBlacklistSelected() {
    if (!selectedSet.size) {
      flash('Select at least one group')
      return
    }
    setBusy(true)
    const res = await blacklistGroupPosterGroups([...selectedSet])
    setBusy(false)
    flash(res.message || (res.ok ? 'Blacklisted' : 'Failed'))
    if (res.ok) {
      settingsDirtyRef.current = false
      if (res.state?.settings) {
        setSettings(res.state.settings)
        settingsRef.current = res.state.settings
      } else {
        patchSettings({ selectedGroupIds: [] })
      }
    }
    await refresh({ syncSettings: true })
  }

  return {
    panelTab,
    setPanelTab,
    state,
    setState,
    settings,
    setSettings,
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
    settingsRef,
    captionsDirtyRef,
    passwordDirtyRef,
    refresh,
    patchSettings,
    flushPersist,
    saveChanges,
    unsavedChanges,
    recomputeUnsaved,
    flash,
    run,
    status,
    workerRunning,
    groups,
    blacklist,
    waitingLive,
    waitEndsAt,
    waitLabel,
    liveWait,
    headerMessage,
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
  }
}
