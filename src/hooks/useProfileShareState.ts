import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { refreshFriendDmFriends } from '../lib/group-poster-dms'
import {
  fetchProfileSharePoll,
  fetchProfileShareState,
  saveProfileShareSettings,
  startProfileShare,
  type ProfileShareSettings,
  type ProfileShareState,
} from '../lib/group-poster-share'

export function useProfileShareState(active = true) {
  const [state, setState] = useState<ProfileShareState | null>(null)
  const [settings, setSettings] = useState<ProfileShareSettings | null>(null)
  const [unsavedChanges, setUnsavedChanges] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [friendFilter, setFriendFilter] = useState('')
  const settingsRef = useRef<ProfileShareSettings | null>(null)
  const settingsDirtyRef = useRef(false)
  const activeRef = useRef(active)
  const pollInFlightRef = useRef(false)
  activeRef.current = active

  const flash = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 3200)
  }

  const refresh = useCallback(async (opts?: { syncSettings?: boolean }) => {
    const next = opts?.syncSettings ? await fetchProfileShareState() : await fetchProfileSharePoll()
    if (!next) {
      setOffline(true)
      setLoadError('Bridge offline')
      return
    }
    setOffline(false)
    setLoadError(null)
    const merged = next as ProfileShareState
    setState((prev) => {
      if (!prev) return merged
      return { ...prev, ...merged, settings: merged.settings || prev.settings }
    })
    if (opts?.syncSettings && merged.settings && !settingsDirtyRef.current) {
      setSettings(merged.settings)
      settingsRef.current = merged.settings
    }
  }, [])

  useEffect(() => {
    void refresh({ syncSettings: true })
  }, [refresh])

  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => {
      if (!activeRef.current) return
      if (pollInFlightRef.current) return
      pollInFlightRef.current = true
      void refresh().finally(() => {
        pollInFlightRef.current = false
      })
    }, 1200)
    return () => window.clearInterval(id)
  }, [active, refresh])

  const patchSettings = useCallback((partial: Partial<ProfileShareSettings>) => {
    settingsDirtyRef.current = true
    setUnsavedChanges(true)
    setSettings((prev) => {
      if (!prev) return prev
      const next = { ...prev, ...partial }
      settingsRef.current = next
      return next
    })
  }, [])

  const saveChanges = useCallback(async () => {
    if (!settingsRef.current) return
    setBusy(true)
    const res = await saveProfileShareSettings(settingsRef.current)
    setBusy(false)
    if (res.ok) {
      settingsDirtyRef.current = false
      setUnsavedChanges(false)
      if (res.settings) {
        setSettings(res.settings)
        settingsRef.current = res.settings
      }
      flash(res.message)
      void refresh({ syncSettings: true })
    } else {
      flash(res.message || 'Save failed')
    }
  }, [refresh])

  const onAction = useCallback(
    async (fn: () => Promise<{ ok: boolean; message: string }>, okMsg?: string) => {
      setBusy(true)
      const res = await fn()
      setBusy(false)
      flash(okMsg && res.ok ? okMsg : res.message)
      void refresh({ syncSettings: true })
    },
    [refresh],
  )

  const onStart = useCallback(async () => {
    setBusy(true)
    if (settingsDirtyRef.current && settingsRef.current) {
      await saveProfileShareSettings(settingsRef.current)
      settingsDirtyRef.current = false
      setUnsavedChanges(false)
    }
    const res = await startProfileShare(settingsRef.current || undefined)
    setBusy(false)
    flash(res.message)
    void refresh({ syncSettings: true })
  }, [refresh])

  const onRefreshFriends = useCallback(async () => {
    setBusy(true)
    const res = await refreshFriendDmFriends()
    setBusy(false)
    flash(res.message)
    void refresh({ syncSettings: true })
  }, [refresh])

  const friends = useMemo(() => state?.friends || [], [state?.friends])
  const sentSet = useMemo(() => new Set(state?.sentIds || []), [state?.sentIds])
  const selectedSet = useMemo(
    () => new Set(settings?.selectedFriendIds || []),
    [settings?.selectedFriendIds],
  )
  const filteredFriends = useMemo(() => {
    const q = friendFilter.trim().toLocaleLowerCase()
    if (!q) return friends
    return friends.filter(
      (f) => f.name.toLocaleLowerCase().includes(q) || f.id.toLocaleLowerCase().includes(q),
    )
  }, [friends, friendFilter])

  const toggleFriend = useCallback(
    (id: string) => {
      const cur = new Set(settingsRef.current?.selectedFriendIds || [])
      if (cur.has(id)) cur.delete(id)
      else cur.add(id)
      patchSettings({ selectedFriendIds: [...cur] })
    },
    [patchSettings],
  )

  const selectAllVisible = useCallback(() => {
    const cur = new Set(settingsRef.current?.selectedFriendIds || [])
    for (const f of filteredFriends) cur.add(f.id)
    patchSettings({ selectedFriendIds: [...cur] })
  }, [filteredFriends, patchSettings])

  const clearSelection = useCallback(() => {
    patchSettings({ selectedFriendIds: [] })
  }, [patchSettings])

  const run = state?.run
  const status = run?.status || 'idle'
  const workerRunning = Boolean(state?.workerRunning)

  return {
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
  }
}
