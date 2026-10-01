import { useEffect, useRef, useState } from 'react'
import type { Tool } from '../types'
import { createSeedTools, mergePersistedTools } from '../data/tools'
import {
  DEFAULT_BUSINESS_PROFILE_ID,
  activeBusinessProfileId,
  profileLocalStorageKey,
} from '../lib/business-profiles'

type ToolOverride = {
  id: string
  name?: string
  status?: Tool['status']
  removed?: boolean
}

function toOverrides(tools: Tool[]): ToolOverride[] {
  return tools.map((t) => ({
    id: t.id,
    name: t.name,
    status: t.status,
    removed: t.removed,
  }))
}

function loadToolsForProfile(baseKey: string): Tool[] {
  const scopedKey = profileLocalStorageKey(baseKey)
  try {
    const raw = localStorage.getItem(scopedKey)
    if (raw != null) return mergePersistedTools(JSON.parse(raw))
  } catch {
    /* ignore */
  }
  if (activeBusinessProfileId() === DEFAULT_BUSINESS_PROFILE_ID) {
    try {
      const raw = localStorage.getItem(baseKey)
      if (raw != null) {
        const migrated = mergePersistedTools(JSON.parse(raw))
        localStorage.setItem(scopedKey, JSON.stringify(toOverrides(migrated)))
        return migrated
      }
    } catch {
      /* ignore */
    }
  }
  return createSeedTools()
}

export function usePersistedTools(baseKey: string) {
  const storageKey = profileLocalStorageKey(baseKey)
  const [value, setValue] = useState<Tool[]>(() => loadToolsForProfile(baseKey))
  const skipPersistRef = useRef(false)

  useEffect(() => {
    skipPersistRef.current = true
    setValue(loadToolsForProfile(baseKey))
  }, [baseKey, storageKey])

  useEffect(() => {
    if (skipPersistRef.current) {
      skipPersistRef.current = false
      return
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify(toOverrides(value)))
    } catch {
      /* ignore */
    }
  }, [storageKey, value])

  return [value, setValue] as const
}
