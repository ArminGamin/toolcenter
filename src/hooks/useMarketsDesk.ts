import { useCallback, useEffect, useState } from 'react'
import {
  fetchDeskSignals,
  type DeskBoard,
  type DeskSignal,
  type SourceHealthRow,
} from '../lib/markets'

type DeskAsset = 'crypto' | 'stock'
type NewsSub = 'feed' | 'desk'

const DESK_VIEW_KEY = 'cc-markets-desk-view'

function loadDeskView(): 'simple' | 'advanced' {
  try {
    return localStorage.getItem(DESK_VIEW_KEY) === 'advanced' ? 'advanced' : 'simple'
  } catch {
    return 'simple'
  }
}

export function useMarketsDesk(tab: string, newsSub: NewsSub) {
  const [deskAsset, setDeskAsset] = useState<DeskAsset>('crypto')
  const [desk, setDesk] = useState<DeskSignal[]>([])
  const [deskBoard, setDeskBoard] = useState<DeskBoard | null>(null)
  const [deskDisclaimer, setDeskDisclaimer] = useState<string | null>(null)
  const [sourceHealth, setSourceHealth] = useState<SourceHealthRow[]>([])
  const [deskView, setDeskView] = useState<'simple' | 'advanced'>(() => loadDeskView())
  const [deskError, setDeskError] = useState<string | null>(null)
  const [deskLoading, setDeskLoading] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(DESK_VIEW_KEY, deskView)
    } catch {
      /* ignore */
    }
  }, [deskView])

  useEffect(() => {
    if (tab !== 'news') return
    let cancelled = false
    async function loadDesk() {
      const res = await fetchDeskSignals(deskAsset)
      if (cancelled) return
      if (!res.ok) {
        setDeskError(res.message || 'Desk signals unavailable')
        return
      }
      setDeskError(null)
      setDesk(res.signals || [])
      setDeskBoard(res.board || null)
      setDeskDisclaimer(res.disclaimer || null)
      setSourceHealth(res.sourceHealth || [])
    }
    if (newsSub === 'desk') void loadDesk()
    return () => {
      cancelled = true
    }
  }, [tab, newsSub, deskAsset])

  const refreshDesk = useCallback(async (force = false) => {
    setDeskLoading(true)
    const res = await fetchDeskSignals(deskAsset, { force })
    setDeskLoading(false)
    if (!res.ok) {
      setDeskError(res.message || 'Desk offline — could not load signals')
      return res
    }
    setDeskError(null)
    setDesk(res.signals || [])
    setDeskBoard(res.board || null)
    setDeskDisclaimer(res.disclaimer || null)
    setSourceHealth(res.sourceHealth || [])
    return res
  }, [deskAsset])

  useEffect(() => {
    if (tab !== 'news' || newsSub !== 'desk') return
    let cancelled = false
    const load = async () => {
      if (cancelled) return
      await refreshDesk()
    }
    void load()
    const refreshId = window.setInterval(() => void load(), 8000)
    return () => {
      cancelled = true
      window.clearInterval(refreshId)
    }
  }, [tab, newsSub, deskAsset, refreshDesk])

  function clearDesk() {
    setDesk([])
    setDeskBoard(null)
    setDeskDisclaimer(null)
  }

  return {
    deskAsset,
    setDeskAsset,
    desk,
    deskBoard,
    deskDisclaimer,
    sourceHealth,
    deskView,
    setDeskView,
    deskError,
    deskLoading,
    refreshDesk,
    clearDesk,
  }
}
