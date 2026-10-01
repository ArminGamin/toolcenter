import { useEffect, useMemo, useState } from 'react'
import { LEGACY_DOWNLOADER_IDS } from '../data/media-tools'
import {
  DEFAULT_BUSINESS_PROFILE_ID,
  activeBusinessProfileId,
  profileLocalStorageKey,
} from '../lib/business-profiles'

export const RAIL_MODULE_IDS = [
  'markets',
  'notes',
  'outreach',
  'pipeline',
  'groupPoster',
  'redditCommenter',
  'seoBlog',
  'ugcSlides',
  'oneShot',
] as const

export type RailModuleId = (typeof RAIL_MODULE_IDS)[number]

export type RailItemId = RailModuleId | (string & {})

const STORAGE_KEY_BASE = 'control-center-rail-order-v2'
const LEGACY_ORDER_KEY = 'control-center-rail-order-v1'
const LEGACY_PINS_KEY = 'control-center-orbit-pins-v1'

export function defaultRailItems(): RailItemId[] {
  return [...RAIL_MODULE_IDS, 'video_creator']
}

function isRailModuleId(id: string): id is RailModuleId {
  return (RAIL_MODULE_IDS as readonly string[]).includes(id)
}

function migrateToolId(id: string): string {
  if (LEGACY_DOWNLOADER_IDS.includes(id)) return 'downloader'
  return id === 'video' ? 'video_creator' : id
}

/** Load persisted order — does not inject defaults into saved lists. */
export function normalizeOrder(saved: unknown): RailItemId[] {
  if (!Array.isArray(saved)) return defaultRailItems()
  const seen = new Set<string>()
  const out: RailItemId[] = []
  for (const raw of saved) {
    if (typeof raw !== 'string' || !raw) continue
    const id = migrateToolId(raw)
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out.length ? out : defaultRailItems()
}

function ordersEqual(a: RailItemId[], b: RailItemId[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i])
}

function railStorageKey() {
  return profileLocalStorageKey(STORAGE_KEY_BASE)
}

function persistOrder(order: RailItemId[]) {
  try {
    localStorage.setItem(railStorageKey(), JSON.stringify(order))
  } catch {
    /* ignore */
  }
}

function loadLegacyGlobalRail(): RailItemId[] | null {
  try {
    const legacy = localStorage.getItem(LEGACY_ORDER_KEY)
    if (legacy) {
      const modules = normalizeOrder(JSON.parse(legacy))
      const pinsRaw = localStorage.getItem(LEGACY_PINS_KEY)
      const pins = pinsRaw ? normalizeOrder(JSON.parse(pinsRaw)) : []
      const seen = new Set<string>()
      const merged: RailItemId[] = []
      for (const raw of [...modules, ...pins]) {
        const id = migrateToolId(raw)
        if (seen.has(id)) continue
        seen.add(id)
        merged.push(id)
      }
      return merged.length ? merged : null
    }
  } catch {
    /* ignore */
  }
  return null
}

export function loadRailOrder(): RailItemId[] {
  const profileId = activeBusinessProfileId()
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_BASE}::${profileId}`)
    if (raw) return normalizeOrder(JSON.parse(raw))
  } catch {
    /* ignore */
  }

  if (profileId === DEFAULT_BUSINESS_PROFILE_ID) {
    try {
      const globalRaw = localStorage.getItem(STORAGE_KEY_BASE)
      if (globalRaw) {
        const migrated = normalizeOrder(JSON.parse(globalRaw))
        persistOrder(migrated)
        return migrated
      }
    } catch {
      /* ignore */
    }
    const legacy = loadLegacyGlobalRail()
    if (legacy?.length) {
      persistOrder(legacy)
      return legacy
    }
  }

  return defaultRailItems()
}

export function arrayMove<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export function useRailOrder() {
  const profileKey = activeBusinessProfileId()
  const [savedOrder, setSavedOrder] = useState<RailItemId[]>(loadRailOrder)
  const [draftOrder, setDraftOrder] = useState<RailItemId[]>(loadRailOrder)

  useEffect(() => {
    const next = loadRailOrder()
    setSavedOrder(next)
    setDraftOrder(next)
  }, [profileKey])

  const isDirty = useMemo(() => !ordersEqual(savedOrder, draftOrder), [savedOrder, draftOrder])

  function reorder(from: number, to: number) {
    setDraftOrder((prev) => arrayMove(prev, from, to))
  }

  function addItem(id: string) {
    setDraftOrder((prev) => (prev.includes(id) ? prev : [...prev, id]))
  }

  function removeItem(id: string) {
    setDraftOrder((prev) => prev.filter((x) => x !== id))
  }

  function isOnRail(id: string) {
    return draftOrder.includes(id)
  }

  function save() {
    setSavedOrder(draftOrder)
    persistOrder(draftOrder)
  }

  function discard() {
    setDraftOrder(savedOrder)
  }

  return {
    order: draftOrder,
    reorder,
    addItem,
    removeItem,
    isOnRail,
    isRailModuleId,
    isDirty,
    save,
    discard,
  }
}
