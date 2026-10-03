import { useCallback, useEffect, useState } from 'react'

export type AppModule =
  | 'home'
  | 'markets'
  | 'notes'
  | 'outreach'
  | 'pipeline'
  | 'seo-blog'
  | 'group-poster'
  | 'reddit-commenter'
  | 'ugc-slides'
  | 'one-shot'
  | 'tool'

const HASH_MAP: Record<string, AppModule> = {
  markets: 'markets',
  notes: 'notes',
  outreach: 'outreach',
  pipeline: 'pipeline',
  promo: 'pipeline',
  'seo-blog': 'seo-blog',
  seoblog: 'seo-blog',
  'group-poster': 'group-poster',
  groups: 'group-poster',
  'reddit-commenter': 'reddit-commenter',
  reddit: 'reddit-commenter',
  'ugc-slides': 'ugc-slides',
  ugc: 'ugc-slides',
  'one-shot': 'one-shot',
  oneshot: 'one-shot',
}

/** Last open page, so the app reopens where you left it. */
const LAST_VIEW_KEY = 'cc.last-view.v1'
const MODULES = new Set<string>([...Object.values(HASH_MAP), 'home', 'tool'])

function readLastView(): { module: AppModule; toolId: string | null } | null {
  try {
    const saved = JSON.parse(localStorage.getItem(LAST_VIEW_KEY) || 'null') as { module?: string; toolId?: string | null } | null
    if (!saved || !MODULES.has(saved.module || '')) return null
    if (saved.module === 'tool' && !saved.toolId) return null
    return { module: saved.module as AppModule, toolId: saved.module === 'tool' ? saved.toolId || null : null }
  } catch {
    return null
  }
}

export function useAppNavigation(initialToolId: string | null) {
  const [initial] = useState(() =>
    initialToolId || window.location.hash ? null : readLastView(),
  )
  const [module, setModule] = useState<AppModule>(initial?.module ?? (initialToolId ? 'tool' : 'home'))
  const [toolId, setToolId] = useState<string | null>(initial?.toolId ?? initialToolId)

  useEffect(() => {
    try {
      localStorage.setItem(LAST_VIEW_KEY, JSON.stringify({ module, toolId }))
    } catch {
      /* not remembered */
    }
  }, [module, toolId])

  const applyHash = useCallback(() => {
    const hash = (window.location.hash || '').replace(/^#/, '').toLowerCase()
    const mapped = HASH_MAP[hash]
    if (mapped) {
      setModule(mapped)
      setToolId(null)
      return
    }
    if (!hash) {
      setModule('home')
      setToolId(null)
    }
  }, [])

  useEffect(() => {
    if (window.location.hash) applyHash()
    window.addEventListener('hashchange', applyHash)
    return () => window.removeEventListener('hashchange', applyHash)
  }, [applyHash])

  function goHome() {
    setModule('home')
    setToolId(null)
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname)
  }

  function openModule(id: AppModule) {
    if (id === 'home') {
      goHome()
      return
    }
    if (id === 'tool') return
    setModule(id)
    setToolId(null)
    const hash = id === 'seo-blog' ? 'seo-blog' : id
    window.history.replaceState(null, '', `#${hash}`)
  }

  function selectTool(id: string) {
    setModule('tool')
    setToolId(id)
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname)
  }

  return {
    module,
    toolId,
    goHome,
    openModule,
    selectTool,
    isHome: module === 'home',
    marketsOpen: module === 'markets',
    notesOpen: module === 'notes',
    outreachOpen: module === 'outreach',
    pipelineOpen: module === 'pipeline',
    seoBlogOpen: module === 'seo-blog',
    groupPosterOpen: module === 'group-poster',
    redditCommenterOpen: module === 'reddit-commenter',
    ugcSlidesOpen: module === 'ugc-slides',
    oneShotOpen: module === 'one-shot',
  }
}
