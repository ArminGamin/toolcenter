import { describe, expect, it } from 'vitest'
import {
  CHRISTMAS_BUSINESS_PROFILE_ID,
  DEFAULT_BUSINESS_PROFILE_ID,
  runWithBusinessProfile,
} from '../business-profiles.js'
import { finalizeHookBody, KALEDU_HOOK_BODY_OPENERS } from '../ugc-hook-templates.js'
import { UGC_KALEDU_DIET_LEAK_RE } from '../ugc-lt-normalize.js'
import {
  copyMatchesSelectedProduct,
  enforceKaleduProductSlide,
  type KaleduCatalogProduct,
} from '../ugc-kaledu-catalog.js'
import {
  detectKaleduNativeIssues,
  isIncompleteSubordinateHook,
} from '../ugc-kaledu-native.js'
import { normalizeTerminalEmojiPunctuation } from '../ugc-kaledu-emoji.js'
import { APPLE_EMOJI_ASSETS, appleEmojiAsset } from '../../src/lib/ugc-apple-emoji-assets.js'
import { assertShipableLtSlide } from '../ugc-lt-normalize.js'

const ZVAKIDE: KaleduCatalogProduct = {
  productId: 'zvakide',
  slug: 'zvakide',
  sku: 'JK-Z',
  name: 'Žvakidė',
  tagline: 'Jauku',
  priceCents: 1900,
  recipients: [],
  vibes: [],
  images: [],
  inStock: true,
}

describe('Kalėdų carousel gates', () => {
  it('treats food rhythm copy as Christmas contamination and keeps Tavo hook bodies', () => {
    expect(UGC_KALEDU_DIET_LEAK_RE.test('kasdieniai maisto sprendimai')).toBe(true)
    runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, () => {
      const body = finalizeHookBody('dovana', 'x', 0, KALEDU_HOOK_BODY_OPENERS)
      expect(body).not.toMatch(/maisto sprendimai/)
      expect(body).toMatch(/dovan/i)
    })
    runWithBusinessProfile(DEFAULT_BUSINESS_PROFILE_ID, () => {
      const body = finalizeHookBody('planas', 'x', 0)
      expect(body).toMatch(/maisto sprendimai/)
    })
  })

  it('flags an unfinished Kai hook and leaves a real question alone', () => {
    expect(isIncompleteSubordinateHook('Kai nenori dovanoti didelio daikto, bet ir ateiti tuščiomis')).toBe(true)
    expect(
      detectKaleduNativeIssues({
        role: 'hook',
        title: 'Kai nenori dovanoti didelio daikto, bet ir ateiti tuščiomis',
        body: 'Šventė artėja, o tu vis atidedi.',
      }).map((issue) => issue.code),
    ).toContain('incomplete_subordinate_hook')
    expect(isIncompleteSubordinateHook('Kalėdos jau rytoj?')).toBe(false)
  })

  it('rejects a candle when the catalog item is a candle holder', () => {
    expect(copyMatchesSelectedProduct('Šita žvakė.', ZVAKIDE)).toBe(false)
    expect(copyMatchesSelectedProduct('Ši žvakidė tinka namams.', ZVAKIDE)).toBe(true)
    expect(copyMatchesSelectedProduct('Ieškai žvakidės vėlyvam vakarui.', ZVAKIDE)).toBe(true)
  })

  it('drops productId when the catalog image is missing', () => {
    const slide = enforceKaleduProductSlide({
      title: '',
      body: 'Šita žvakė.',
      productId: 'missing-sku',
      showProductPrice: true,
    })
    expect(slide.productId).toBeUndefined()
    expect(slide.body).toMatch(/dovan/i)
    expect(slide.body).not.toMatch(/žvakė/)
  })

  it('flags the poetic payoff and normalizes emoji punctuation', () => {
    expect(
      detectKaleduNativeIssues({
        role: 'close',
        title: '',
        body: 'Pasikliauk intuicija ir padovanok šviesą bei jaukumą.',
      }, { giftNiche: true }).map((issue) => issue.code),
    ).toContain('empty_poetic_payoff')
    expect(
      detectKaleduNativeIssues({
        role: 'close',
        title: '',
        body: 'Net maža dovana gali būti gera, jei ji išrinkta galvojant apie žmogų.',
      }, { giftNiche: true }).some((issue) => issue.code === 'empty_poetic_payoff'),
    ).toBe(false)
    expect(normalizeTerminalEmojiPunctuation('šilumos ✨.')).toBe('šilumos. ✨')
    expect(normalizeTerminalEmojiPunctuation('šilumos. ✨')).toBe('šilumos. ✨')
    expect(normalizeTerminalEmojiPunctuation('Kalėdos jau rytoj, o dovanos dar nėra? 😵‍💫')).toBe(
      'Kalėdos jau rytoj, o dovanos dar nėra? 😵‍💫',
    )
  })

  it('maps every approved emoji to an Apple PNG and has no Windows fallback', () => {
    expect(appleEmojiAsset('✨')).toBe('/ugc/apple-emojis/sparkles.png')
    expect(appleEmojiAsset('🎁')).toBe('/ugc/apple-emojis/wrapped-gift.png')
    expect(appleEmojiAsset('😵‍💫')).toBe('/ugc/apple-emojis/dizzy-face.png')
    expect(Object.values(APPLE_EMOJI_ASSETS).every((path) => path.startsWith('/ugc/apple-emojis/'))).toBe(true)
    expect(appleEmojiAsset('🪬')).toBeNull()
  })

  it('still rejects emoji inside Tavo slide copy', () => {
    runWithBusinessProfile(DEFAULT_BUSINESS_PROFILE_ID, () => {
      expect(() =>
        assertShipableLtSlide({
          title: 'Be plano',
          body: 'Vakare vėl sprendi, ką valgyti, nors šaldytuvas pilnas. 🎁',
          role: 'context',
        }),
      ).toThrow(/emoji/i)
    })
  })
})
