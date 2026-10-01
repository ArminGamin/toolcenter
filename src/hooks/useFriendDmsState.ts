import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchFriendDmPoll,
  fetchFriendDmState,
  refreshFriendDmFriends,
  saveFriendDmMessages,
  saveFriendDmSettings,
  startFriendDms,
  type FriendDmSettings,
  type FriendDmState,
} from '../lib/group-poster-dms'
import { saveGroupPosterSettings } from '../lib/group-poster'

export type MessageSectionSettings = Pick<
  FriendDmSettings,
  'includeImage' | 'imageEveryMessage' | 'rotateMessages' | 'skipAlreadyMessaged'
>

function pickMessageSection(settings: FriendDmSettings): MessageSectionSettings {
  return {
    includeImage: settings.includeImage,
    imageEveryMessage: settings.imageEveryMessage,
    rotateMessages: settings.rotateMessages,
    skipAlreadyMessaged: settings.skipAlreadyMessaged,
  }
}

function messageSectionEquals(a: MessageSectionSettings, b: MessageSectionSettings): boolean {
  return (
    a.includeImage === b.includeImage &&
    a.imageEveryMessage === b.imageEveryMessage &&
    a.rotateMessages === b.rotateMessages &&
    a.skipAlreadyMessaged === b.skipAlreadyMessaged
  )
}

export function useFriendDmsState(active = true) {
  const [state, setState] = useState<FriendDmState | null>(null)
  const [settings, setSettings] = useState<FriendDmSettings | null>(null)
  const [messages, setMessages] = useState('')
  const [unsavedChanges, setUnsavedChanges] = useState(false)
  const [loginEmail, setLoginEmail] = useState('')
  const [autoLogin, setAutoLogin] = useState(true)
  const [loginPassword, setLoginPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [friendFilter, setFriendFilter] = useState('')
  const settingsRef = useRef<FriendDmSettings | null>(null)
  const messagesRef = useRef('')
  const savedMessageSectionRef = useRef<MessageSectionSettings>({
    includeImage: false,
    imageEveryMessage: false,
    rotateMessages: true,
    skipAlreadyMessaged: true,
  })
  const loginEmailRef = useRef('')
  const autoLoginRef = useRef(true)
  const loginPasswordRef = useRef('')
  const settingsDirtyRef = useRef(false)
  const messagesDirtyRef = useRef(false)
  const messageSectionDirtyRef = useRef(false)
  const savedMessagesRef = useRef('')
  const loginDirtyRef = useRef(false)
  const passwordDirtyRef = useRef(false)
  const activeRef = useRef(active)
  const pollInFlightRef = useRef(false)
  activeRef.current = active

  const flash = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 3200)
  }

  const recomputeUnsaved = useCallback(() => {
    const messagesChanged = messagesRef.current !== savedMessagesRef.current
    const settings = settingsRef.current
    const sectionChanged = settings
      ? !messageSectionEquals(pickMessageSection(settings), savedMessageSectionRef.current)
      : false
    const dirty = messagesChanged || sectionChanged || settingsDirtyRef.current
    messagesDirtyRef.current = messagesChanged
    messageSectionDirtyRef.current = dirty
    setUnsavedChanges(dirty)
  }, [])

  const refresh = useCallback(async (opts?: { syncSettings?: boolean; light?: boolean }) => {
    const useLight = Boolean(opts?.light) && !opts?.syncSettings
    const next = useLight ? await fetchFriendDmPoll() : await fetchFriendDmState()
    if (!next) {
      setOffline(true)
      setLoadError('Bridge offline')
      return
    }
    setOffline(false)
    setLoadError(null)

    if (next.settings && (opts?.syncSettings || !messageSectionDirtyRef.current)) {
      setSettings(next.settings)
      settingsRef.current = next.settings
      if (opts?.syncSettings) {
        savedMessageSectionRef.current = pickMessageSection(next.settings)
      }
    }
    if (typeof next.messages === 'string' && (opts?.syncSettings || !messageSectionDirtyRef.current)) {
      setMessages(next.messages)
      messagesRef.current = next.messages
      if (opts?.syncSettings) {
        savedMessagesRef.current = next.messages
        messageSectionDirtyRef.current = false
        setUnsavedChanges(false)
      }
    }
    if (typeof next.loginEmail === 'string' && (opts?.syncSettings || !loginDirtyRef.current)) {
      setLoginEmail(next.loginEmail)
      loginEmailRef.current = next.loginEmail
    }
    if (typeof next.autoLogin === 'boolean' && (opts?.syncSettings || !loginDirtyRef.current)) {
      setAutoLogin(next.autoLogin)
      autoLoginRef.current = next.autoLogin
    }
    if (
      typeof next.loginPassword === 'string' &&
      (opts?.syncSettings || !passwordDirtyRef.current)
    ) {
      setLoginPassword(next.loginPassword)
      loginPasswordRef.current = next.loginPassword
    }

    setState((prev) => {
      if (!prev) return next as FriendDmState
      return {
        ...prev,
        ...next,
        settings: (next.settings as FriendDmSettings) || prev.settings,
        messages: typeof next.messages === 'string' ? next.messages : prev.messages,
        log: Array.isArray(next.log) ? next.log : prev.log,
        friends: Array.isArray(next.friends) ? next.friends : prev.friends,
        sentIds: Array.isArray(next.sentIds) ? next.sentIds : prev.sentIds,
      } as FriendDmState
    })
  }, [])

  const flushPersist = useCallback(async () => {
    const jobs: Promise<unknown>[] = []
    if (settingsDirtyRef.current && settingsRef.current) {
      settingsDirtyRef.current = false
      jobs.push(saveFriendDmSettings(settingsRef.current))
    }
    if (loginDirtyRef.current || passwordDirtyRef.current) {
      loginDirtyRef.current = false
      const payload: {
        loginEmail: string
        autoLogin: boolean
        loginPassword?: string
      } = {
        loginEmail: loginEmailRef.current,
        autoLogin: autoLoginRef.current,
      }
      if (passwordDirtyRef.current && loginPasswordRef.current) {
        payload.loginPassword = loginPasswordRef.current
      }
      passwordDirtyRef.current = false
      jobs.push(saveGroupPosterSettings(payload))
    }
    if (jobs.length) await Promise.all(jobs)
    recomputeUnsaved()
  }, [recomputeUnsaved])

  const patchMessageSectionSettings = useCallback(
    (partial: Partial<MessageSectionSettings>) => {
      setSettings((prev) => {
        if (!prev) return prev
        const next = { ...prev, ...partial }
        settingsRef.current = next
        queueMicrotask(() => recomputeUnsaved())
        return next
      })
    },
    [recomputeUnsaved],
  )

  const updateMessages = useCallback(
    (next: string) => {
      setMessages(next)
      messagesRef.current = next
      recomputeUnsaved()
    },
    [recomputeUnsaved],
  )

  const patchSettings = useCallback(
    (partial: Partial<FriendDmSettings>) => {
      setSettings((prev) => {
        if (!prev) return prev
        const next = { ...prev, ...partial }
        settingsRef.current = next
        settingsDirtyRef.current = true
        queueMicrotask(() => recomputeUnsaved())
        return next
      })
    },
    [recomputeUnsaved],
  )

  const patchLogin = useCallback(
    (partial: { loginEmail?: string; autoLogin?: boolean }) => {
      if (partial.loginEmail !== undefined) {
        setLoginEmail(partial.loginEmail)
        loginEmailRef.current = partial.loginEmail
      }
      if (partial.autoLogin !== undefined) {
        setAutoLogin(partial.autoLogin)
        autoLoginRef.current = partial.autoLogin
      }
      loginDirtyRef.current = true
      recomputeUnsaved()
    },
    [recomputeUnsaved],
  )

  useEffect(() => {
    void refresh({ syncSettings: true })
  }, [refresh])

  useEffect(() => {
    const id = window.setInterval(() => {
      if (!activeRef.current) return
      if (pollInFlightRef.current) return
      pollInFlightRef.current = true
      void refresh({ light: true }).finally(() => {
        pollInFlightRef.current = false
      })
    }, active ? 2500 : 8000)
    return () => window.clearInterval(id)
  }, [active, refresh])

  const run = state?.run
  const status = run?.status || 'idle'
  const workerRunning = Boolean(state?.workerRunning)
  const sentSet = useMemo(() => new Set(state?.sentIds || []), [state?.sentIds])
  // Keep the queue honest while the worker runs: terminal recipients disappear
  // on the next poll instead of remaining selectable until a manual refresh.
  const friends = useMemo(() => {
    const all = state?.friends || []
    return settings?.skipAlreadyMessaged === false
      ? all
      : all.filter((friend) => !sentSet.has(friend.id))
  }, [state?.friends, settings?.skipAlreadyMessaged, sentSet])
  const selectedSet = useMemo(
    () => new Set(settings?.selectedFriendIds || []),
    [settings?.selectedFriendIds],
  )

  const filteredFriends = useMemo(() => {
    const q = friendFilter.trim().toLowerCase()
    if (!q) return friends
    return friends.filter((f) => f.name.toLowerCase().includes(q) || f.id.toLowerCase().includes(q))
  }, [friends, friendFilter])

  async function onAction(fn: () => Promise<{ ok: boolean; message: string }>, okMsg?: string) {
    setBusy(true)
    const res = await fn()
    setBusy(false)
    flash(res.message || okMsg || (res.ok ? 'OK' : 'Failed'))
    await refresh({ light: true })
  }

  function toggleFriend(id: string) {
    if (!settings) return
    const next = new Set(settings.selectedFriendIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    patchSettings({ selectedFriendIds: [...next] })
  }

  function selectAllVisible() {
    if (!settings) return
    const next = new Set(settings.selectedFriendIds)
    for (const f of filteredFriends) next.add(f.id)
    patchSettings({ selectedFriendIds: [...next] })
  }

  function clearSelection() {
    patchSettings({ selectedFriendIds: [] })
  }

  async function saveChanges() {
    setBusy(true)
    try {
      await saveChangesInternal()
      flash('Changes saved')
      await refresh({ syncSettings: true })
    } finally {
      setBusy(false)
    }
  }

  async function saveChangesInternal() {
    const jobs: Promise<unknown>[] = []
    if (settingsRef.current) jobs.push(saveFriendDmSettings(settingsRef.current))
    jobs.push(saveFriendDmMessages(messagesRef.current))
    if (loginDirtyRef.current || passwordDirtyRef.current) {
      const payload: {
        loginEmail: string
        autoLogin: boolean
        loginPassword?: string
      } = {
        loginEmail: loginEmailRef.current,
        autoLogin: autoLoginRef.current,
      }
      if (passwordDirtyRef.current && loginPasswordRef.current) {
        payload.loginPassword = loginPasswordRef.current
      }
      loginDirtyRef.current = false
      passwordDirtyRef.current = false
      jobs.push(saveGroupPosterSettings(payload))
    }
    await Promise.all(jobs)
    if (settingsRef.current) {
      savedMessageSectionRef.current = pickMessageSection(settingsRef.current)
    }
    savedMessagesRef.current = messagesRef.current
    settingsDirtyRef.current = false
    messagesDirtyRef.current = false
    messageSectionDirtyRef.current = false
    setUnsavedChanges(false)
  }

  async function onStart() {
    setBusy(true)
    if (messageSectionDirtyRef.current) {
      await saveChangesInternal()
    } else {
      await flushPersist()
    }
    const res = await startFriendDms(settingsRef.current || undefined)
    setBusy(false)
    flash(res.message || (res.ok ? 'Started' : 'Failed'))
    await refresh({ syncSettings: true })
  }

  async function onRefreshFriends() {
    setBusy(true)
    await flushPersist()
    const res = await refreshFriendDmFriends()
    setBusy(false)
    flash(res.message || (res.ok ? 'Refreshing…' : 'Failed'))
    await refresh({ syncSettings: true })
  }

  return {
    state,
    settings,
    messages,
    updateMessages,
    unsavedChanges,
    saveChanges,
    patchMessageSectionSettings,
    loginEmail,
    autoLogin,
    loginPassword,
    setLoginPassword: (v: string) => {
      setLoginPassword(v)
      loginPasswordRef.current = v
      passwordDirtyRef.current = true
      recomputeUnsaved()
    },
    busy,
    toast,
    offline,
    loadError,
    friendFilter,
    setFriendFilter,
    messagesRef,
    savedMessagesRef,
    messagesDirtyRef,
    loginPasswordRef,
    passwordDirtyRef,
    flash,
    patchSettings,
    patchLogin,
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
    refresh,
  }
}
