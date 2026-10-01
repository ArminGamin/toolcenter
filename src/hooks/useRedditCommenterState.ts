import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  approveAllPending,
  approveQueueItem,
  blacklistSubreddits,
  clearQueue,
  clearRedditCommenterLoginSession,
  fetchRedditCommenterPoll,
  fetchRedditCommenterState,
  joinRedditSubreddits,
  refreshRedditSubreddits,
  saveRedditCommenterSettings,
  skipQueueItem,
  startRedditPost,
  startRedditScan,
  startRedditScanAndPost,
  updateQueueComment,
  type QueueItem,
  type RedditCommenterSettings,
  type RedditCommenterState,
} from '../lib/reddit-commenter'

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
  if (label === 'Waiting') return `Waiting ${t} before next comment`
  if (label === 'Warm-up') return `Warm-up ${t}`
  if (label === 'Short wait') return `Short wait ${t}`
  if (label) return `${label} ${t}`
  return `Waiting ${t}`
}

export function useRedditCommenterState(active = true) {
  const [panelTab, setPanelTab] = useState<'subreddits' | 'queue' | 'settings'>('subreddits')
  const [state, setState] = useState<RedditCommenterState | null>(null)
  const [settings, setSettings] = useState<RedditCommenterSettings | null>(null)
  const [loginPassword, setLoginPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [subFilter, setSubFilter] = useState('')
  const [queueFilter, setQueueFilter] = useState<'all' | 'pending' | 'approved' | 'posted'>('pending')
  const [editingComment, setEditingComment] = useState<Record<string, string>>({})
  const [nowMs, setNowMs] = useState(() => Date.now())

  const settingsRef = useRef<RedditCommenterSettings | null>(null)
  const loginPasswordRef = useRef('')
  const settingsDirtyRef = useRef(false)
  const passwordDirtyRef = useRef(false)
  const [unsavedChanges, setUnsavedChanges] = useState(false)
  const activeRef = useRef(active)
  const pollInFlightRef = useRef(false)
  activeRef.current = active

  const flash = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 3200)
  }, [])

  const recomputeUnsaved = useCallback(() => {
    setUnsavedChanges(settingsDirtyRef.current || passwordDirtyRef.current)
  }, [])

  const refresh = useCallback(async (opts?: { syncSettings?: boolean; light?: boolean }) => {
    const useLight = Boolean(opts?.light) && !opts?.syncSettings
    const next = useLight ? await fetchRedditCommenterPoll() : await fetchRedditCommenterState()
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
    if (
      typeof next.loginPassword === 'string' &&
      (opts?.syncSettings || !passwordDirtyRef.current)
    ) {
      setLoginPassword(next.loginPassword)
      loginPasswordRef.current = next.loginPassword
    }

    setState((prev) => {
      if (!prev) return next as RedditCommenterState
      return {
        ...prev,
        ...next,
        settings: (next.settings as RedditCommenterSettings) || prev.settings,
        log: Array.isArray(next.log) ? next.log : prev.log,
        subreddits: Array.isArray(next.subreddits) ? next.subreddits : prev.subreddits,
        queue: Array.isArray(next.queue) ? next.queue : prev.queue,
        blacklist: Array.isArray(next.blacklist) ? next.blacklist : prev.blacklist,
      } as RedditCommenterState
    })
  }, [recomputeUnsaved])

  const flushPersist = useCallback(async () => {
    if (settingsDirtyRef.current && settingsRef.current) {
      settingsDirtyRef.current = false
      const payload: Partial<RedditCommenterSettings> & { loginPassword?: string } = {
        ...settingsRef.current,
      }
      if (passwordDirtyRef.current && loginPasswordRef.current) {
        payload.loginPassword = loginPasswordRef.current
        passwordDirtyRef.current = false
      }
      await saveRedditCommenterSettings(payload)
    } else if (passwordDirtyRef.current && loginPasswordRef.current) {
      passwordDirtyRef.current = false
      await saveRedditCommenterSettings({ loginPassword: loginPasswordRef.current })
    }
    recomputeUnsaved()
  }, [recomputeUnsaved])

  const saveChanges = useCallback(async () => {
    await flushPersist()
    flash('Changes saved')
    await refresh({ syncSettings: true })
  }, [flash, flushPersist, refresh])

  const patchSettings = useCallback(
    (partial: Partial<RedditCommenterSettings>) => {
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
  const subreddits = useMemo(() => state?.subreddits || [], [state?.subreddits])
  const queue = useMemo(() => state?.queue || [], [state?.queue])
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

  const filteredSubreddits = useMemo(() => {
    const blocked = new Set(blacklist.map((b) => b.id.toLowerCase()))
    const q = subFilter.trim().toLowerCase()
    return subreddits.filter((s) => {
      if (blocked.has(s.id.toLowerCase()) || blocked.has(s.name.toLowerCase())) return false
      if (!q) return true
      return s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)
    })
  }, [subreddits, blacklist, subFilter])

  const filteredQueue = useMemo(() => {
    if (queueFilter === 'all') return queue
    return queue.filter((q) => q.status === queueFilter)
  }, [queue, queueFilter])

  const selectedSet = useMemo(
    () => new Set(settings?.selectedSubredditIds || []),
    [settings?.selectedSubredditIds],
  )

  const pendingCount = useMemo(() => queue.filter((q) => q.status === 'pending').length, [queue])
  const approvedCount = useMemo(() => queue.filter((q) => q.status === 'approved').length, [queue])

  const allVisibleSelected = useMemo(
    () =>
      filteredSubreddits.length > 0 &&
      filteredSubreddits.every((s) => selectedSet.has(s.id)),
    [filteredSubreddits, selectedSet],
  )

  async function onScan() {
    setBusy(true)
    await flushPersist()
    const result = await startRedditScan(settingsRef.current || undefined)
    setBusy(false)
    flash(result.message)
    if (result.state) setState(result.state)
    else void refresh()
  }

  async function onPost() {
    setBusy(true)
    await flushPersist()
    const result = await startRedditPost(settingsRef.current || undefined)
    setBusy(false)
    flash(result.message)
    if (result.state) setState(result.state)
    else void refresh()
  }

  async function onScanAndPost() {
    setBusy(true)
    await flushPersist()
    const result = await startRedditScanAndPost(settingsRef.current || undefined)
    setBusy(false)
    flash(result.message)
    if (result.state) setState(result.state)
    else void refresh()
  }

  async function onJoinSubreddits(scope: 'selected' | 'all') {
    setBusy(true)
    await flushPersist()
    const payload = settingsRef.current
      ? {
          ...settingsRef.current,
          ...(passwordDirtyRef.current || loginPasswordRef.current
            ? { loginPassword: loginPasswordRef.current }
            : {}),
        }
      : undefined
    const result = await joinRedditSubreddits(scope, payload)
    setBusy(false)
    flash(result.message)
    if (result.state) setState(result.state)
    else void refresh()
  }

  async function onRefreshSubreddits() {
    setBusy(true)
    await flushPersist()
    const payload = settingsRef.current
      ? {
          ...settingsRef.current,
          ...(passwordDirtyRef.current || loginPasswordRef.current
            ? { loginPassword: loginPasswordRef.current }
            : {}),
        }
      : undefined
    const result = await refreshRedditSubreddits(payload)
    setBusy(false)
    flash(result.message)
    if (result.state) setState(result.state)
    else void refresh()
  }

  function toggleSubreddit(id: string) {
    const cur = new Set(settings?.selectedSubredditIds || [])
    if (cur.has(id)) cur.delete(id)
    else cur.add(id)
    patchSettings({ selectedSubredditIds: [...cur] })
  }

  function toggleSelectAllVisible() {
    const visibleIds = filteredSubreddits.map((s) => s.id)
    const allVisibleSelected =
      visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id))
    const cur = new Set(settings?.selectedSubredditIds || [])
    if (allVisibleSelected) {
      for (const id of visibleIds) cur.delete(id)
    } else {
      for (const id of visibleIds) cur.add(id)
    }
    patchSettings({ selectedSubredditIds: [...cur] })
  }

  function clearSelection() {
    patchSettings({ selectedSubredditIds: [] })
  }

  async function onApprove(item: QueueItem) {
    const result = await approveQueueItem(item.postId)
    flash(result.message)
    if (result.state) setState(result.state)
    else void refresh({ light: true })
  }

  async function onSkip(item: QueueItem) {
    const result = await skipQueueItem(item.postId)
    flash(result.message)
    if (result.state) setState(result.state)
    else void refresh({ light: true })
  }

  async function onApproveAll() {
    const result = await approveAllPending()
    flash(result.message)
    if (result.state) setState(result.state)
    else void refresh({ light: true })
  }

  async function onSaveComment(item: QueueItem) {
    const comment = editingComment[item.postId] ?? item.draftComment
    const result = await updateQueueComment(item.postId, comment)
    flash(result.message)
    if (result.state) setState(result.state)
    else void refresh({ light: true })
  }

  async function onClearQueue() {
    const result = await clearQueue(true)
    flash(result.message)
    if (result.state) setState(result.state)
    else void refresh({ light: true })
  }

  async function onBlacklistSelected() {
    const ids = [...selectedSet]
    if (!ids.length) {
      flash('Select subreddits first')
      return
    }
    const result = await blacklistSubreddits(ids)
    flash(result.message)
    if (result.state) setState(result.state)
    else void refresh({ light: true })
  }

  async function onClearLoginSession() {
    const result = await clearRedditCommenterLoginSession()
    flash(result.message)
  }

  return {
    panelTab,
    setPanelTab,
    state,
    settings,
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
    subFilter,
    setSubFilter,
    queueFilter,
    setQueueFilter,
    editingComment,
    setEditingComment,
    patchSettings,
    saveChanges,
    unsavedChanges,
    recomputeUnsaved,
    flash,
    refresh,
    run,
    status,
    workerRunning,
    subreddits,
    queue,
    blacklist,
    filteredSubreddits,
    filteredQueue,
    selectedSet,
    pendingCount,
    approvedCount,
    headerMessage,
    liveWait,
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
  }
}
