import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BUSINESS_PROFILE_STORAGE_KEY } from './business-profiles'
import { emptyUgcDraft, loadUgcDraft, saveUgcDraft, UGC_DRAFT_KEY } from './ugc-slides'
import {
  KALEDU_UNIVERSAL_DESCRIPTION,
  KALEDU_UNIVERSAL_DESCRIPTION_2,
  KALEDU_UNIVERSAL_DESCRIPTION_3,
  KALEDU_UNIVERSAL_DESCRIPTIONS,
  normalizeUniversalDescriptions,
  pickUniversalDescription,
  resolveUniversalUgcDescription,
  resolveUniversalUgcDescriptions,
} from './ugc-universal-description'

function storage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', storage())
  vi.stubGlobal('sessionStorage', storage())
})
afterEach(() => vi.unstubAllGlobals())

describe('Kalėdų universal description', () => {
  it('preserves custom text and lets automatic mode or an empty box use generation', () => {
    const text = '🎅 Mano aprašymas!\n\n#mano\n#kaledos'
    expect(resolveUniversalUgcDescription('christmas-gifts', text)).toBe(text)
    expect(resolveUniversalUgcDescription('christmas-gifts', text, true)).toBeUndefined()
    expect(resolveUniversalUgcDescription('christmas-gifts', '  \n')).toBeUndefined()
    expect(resolveUniversalUgcDescription('tavo-knyga', text)).toBeUndefined()
  })

  it('loads the supplied description for older Christmas drafts', () => {
    sessionStorage.setItem(BUSINESS_PROFILE_STORAGE_KEY, 'christmas-gifts')
    localStorage.setItem(`${UGC_DRAFT_KEY}::christmas-gifts`, JSON.stringify({ ltDescription: 'Older generated caption' }))
    expect(loadUgcDraft()).toMatchObject({
      universalDescription: KALEDU_UNIVERSAL_DESCRIPTION,
      generateDescriptionAutomatically: false,
      ltDescription: 'Older generated caption',
    })
  })

  it('persists description settings only in the selected business draft', () => {
    sessionStorage.setItem(BUSINESS_PROFILE_STORAGE_KEY, 'christmas-gifts')
    saveUgcDraft({ ...emptyUgcDraft(), universalDescription: 'Mano tekstas\n#kaledos', generateDescriptionAutomatically: true })
    expect(loadUgcDraft()).toMatchObject({ universalDescription: 'Mano tekstas\n#kaledos', generateDescriptionAutomatically: true })
    sessionStorage.setItem(BUSINESS_PROFILE_STORAGE_KEY, 'tavo-knyga')
    expect(loadUgcDraft().universalDescription).toBeUndefined()
    expect(loadUgcDraft().ltDescription).toBe('')
    sessionStorage.setItem(BUSINESS_PROFILE_STORAGE_KEY, 'christmas-gifts')
    expect(loadUgcDraft().universalDescription).toBe('Mano tekstas\n#kaledos')
  })
})

describe('Kalėdų description rotation', () => {
  it('keeps an old single description in slot 1 and adds the two new ones', () => {
    const slots = normalizeUniversalDescriptions(undefined, 'Mano senas aprašymas')
    expect(slots).toEqual(['Mano senas aprašymas', KALEDU_UNIVERSAL_DESCRIPTION_2, KALEDU_UNIVERSAL_DESCRIPTION_3])
    expect(normalizeUniversalDescriptions(['a'])).toEqual(['a', '', ''])
  })

  it('rotates only filled descriptions and never repeats the previous one', () => {
    const list = resolveUniversalUgcDescriptions('christmas-gifts', ['A', '  ', 'C'])!
    expect(list).toEqual(['A', 'C'])
    for (let i = 0; i < 20; i++) expect(pickUniversalDescription(list, 'A')).toBe('C')
    expect(resolveUniversalUgcDescriptions('christmas-gifts', ['A'], true)).toBeUndefined()
    expect(resolveUniversalUgcDescriptions('tavo-knyga', ['A'])).toBeUndefined()
  })

  it('spreads picks across all three descriptions', () => {
    const seen = new Set<string>()
    let prev: string | undefined
    for (let i = 0; i < 60; i++) {
      prev = pickUniversalDescription(KALEDU_UNIVERSAL_DESCRIPTIONS, prev)
      seen.add(prev)
    }
    expect(seen.size).toBe(3)
  })
})
