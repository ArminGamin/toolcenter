import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BUSINESS_PROFILE_STORAGE_KEY,
  DEFAULT_BUSINESS_PROFILE_ID,
  profileLocalStorageKey,
} from '../lib/business-profiles'
import { defaultRailItems, loadRailOrder, normalizeOrder } from './useRailOrder'

const RAIL_BASE = 'control-center-rail-order-v2'

function store() {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value)
    },
    removeItem: (key: string) => {
      map.delete(key)
    },
    clear: () => map.clear(),
  }
}

describe('useRailOrder profile scope', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', store())
    localStorage.setItem(BUSINESS_PROFILE_STORAGE_KEY, DEFAULT_BUSINESS_PROFILE_ID)
  })

  it('keeps rail order separate per business profile', () => {
    const tavoKey = profileLocalStorageKey(RAIL_BASE)
    localStorage.setItem(tavoKey, JSON.stringify(['notes', 'markets']))
    localStorage.setItem(BUSINESS_PROFILE_STORAGE_KEY, 'christmas-gifts')
    expect(loadRailOrder()).toEqual(defaultRailItems())
    localStorage.setItem(profileLocalStorageKey(RAIL_BASE), JSON.stringify(['outreach']))
    expect(loadRailOrder()).toEqual(['outreach'])
    localStorage.setItem(BUSINESS_PROFILE_STORAGE_KEY, DEFAULT_BUSINESS_PROFILE_ID)
    expect(loadRailOrder()).toEqual(['notes', 'markets'])
  })

  it('migrates legacy global rail into the primary profile once', () => {
    localStorage.setItem(RAIL_BASE, JSON.stringify(['pipeline', 'notes']))
    expect(loadRailOrder()).toEqual(normalizeOrder(['pipeline', 'notes']))
    expect(localStorage.getItem(profileLocalStorageKey(RAIL_BASE))).toBeTruthy()
    localStorage.removeItem(RAIL_BASE)
    expect(loadRailOrder()).toEqual(['pipeline', 'notes'])
  })

  it('combines old downloader pins into one Downloader without changing other pins', () => {
    expect(normalizeOrder(['notes', 'medal_downloader', 'instagram_downloader', 'discord_uploader', 'youtube_downloader']))
      .toEqual(['notes', 'downloader', 'discord_uploader'])
  })
})
