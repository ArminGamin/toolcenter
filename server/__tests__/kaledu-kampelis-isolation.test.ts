import fs from 'node:fs'
import path from 'node:path'
import type { ChildProcess } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import {
  CHRISTMAS_BUSINESS_PROFILE_ID,
  DEFAULT_BUSINESS_PROFILE_ID,
  businessProfileDataDir,
  ensureBusinessProfiles,
  profileDataPath,
  runWithBusinessProfile,
} from '../business-profiles.js'
import {
  getProfileBrand,
  getProfileImages,
} from '../profile-brand.js'
import { GIFT_GUIDE_TOPICS } from '../kaledu-seo-topics.js'
import { getOutreachSettings } from '../outreach.js'
import { loadUgcThemePool } from '../ugc-theme-pool.js'
import { ugcActiveCaptionCta, ugcActiveCta, ugcActiveHashtags } from '../ugc-cta-normalize.js'
import { getHubSummary } from '../hub-summary.js'
import {
  getCaptionsText,
  getGroupBlacklist,
  getGroupPosterSettings,
  getGroups,
  listGroupPosterWorkerProfileIds,
  saveCaptionsText,
  saveGroupPosterSettings,
  seedGroupPosterWorkerSlot,
} from '../group-poster.js'
import {
  getFriendDmSettings,
  getFriends,
  getPostaiMessages,
  saveFriendDmSettings,
  savePostaiMessages,
} from '../group-poster-dms.js'
import { ensureBrowserSessionDir } from '../browser-sessions.js'
import { getSeoBlogState } from '../seoBlog.js'

const fakeWorker = (pid: number) =>
  ({ killed: false, pid, exitCode: null, kill() { (this as { killed: boolean }).killed = true } }) as ChildProcess

describe('Kalėdų Kampelis isolation', () => {
  it('renames the christmas-gifts workspace and keeps the slug', () => {
    const registry = ensureBusinessProfiles()
    const christmas = registry.profiles.find((p) => p.id === CHRISTMAS_BUSINESS_PROFILE_ID)
    expect(christmas?.name).toBe('Kalėdų Kampelis')
    expect(getProfileBrand(CHRISTMAS_BUSINESS_PROFILE_ID).name).toBe('Kalėdų Kampelis')
    expect(getProfileBrand(DEFAULT_BUSINESS_PROFILE_ID).name).toBe('Tavo Knyga')
  })

  it('keeps Tavo vault/outreach/SEO files out of the Christmas data dir', () => {
    runWithBusinessProfile(DEFAULT_BUSINESS_PROFILE_ID, () => {
      fs.writeFileSync(profileDataPath('vault.json'), '{"tavo":true}', 'utf8')
      fs.mkdirSync(profileDataPath('outreach'), { recursive: true })
      fs.writeFileSync(profileDataPath('outreach', 'sent.json'), '[]', 'utf8')
      fs.mkdirSync(profileDataPath('seo-blog'), { recursive: true })
      fs.writeFileSync(profileDataPath('seo-blog', 'history.json'), '{"diet":true}', 'utf8')
    })
    const christmasRoot = businessProfileDataDir(CHRISTMAS_BUSINESS_PROFILE_ID)
    expect(fs.existsSync(path.join(christmasRoot, 'vault.json'))).toBe(false)
    expect(fs.existsSync(path.join(christmasRoot, 'outreach', 'sent.json'))).toBe(false)
    expect(fs.existsSync(path.join(christmasRoot, 'seo-blog', 'history.json'))).toBe(false)
  })

  it('limits Christmas Group images to jaukumas catalog product files', () => {
    const tavo = getProfileImages(DEFAULT_BUSINESS_PROFILE_ID)
    const christmas = getProfileImages(CHRISTMAS_BUSINESS_PROFILE_ID)
    const productsDir = path.normalize('D:\\jaukumas\\public\\products').toLowerCase()
    for (const file of christmas) {
      expect(path.normalize(file).toLowerCase().startsWith(productsDir)).toBe(true)
    }
    if (christmas.length) {
      const catalog = fs.readFileSync('D:\\jaukumas\\src\\lib\\data\\products.ts', 'utf8')
      for (const file of christmas) {
        expect(catalog).toContain(`/products/${path.basename(file)}`)
      }
    }
    expect(tavo.some((file) => path.normalize(file).toLowerCase().startsWith(productsDir))).toBe(false)
    const brand = getProfileBrand(CHRISTMAS_BUSINESS_PROFILE_ID)
    expect(brand.ugcImagesDir.toLowerCase()).toContain(path.join('jaukumas', 'ugc pics').toLowerCase())
    expect(brand.siteHost).toBe('kaledukampelis.com')
    expect(brand.website).toBe('kaledukampelis.com')
    expect(brand.groupsImagesDir.toLowerCase()).toContain(path.join('jaukumas', 'public', 'products').toLowerCase())
  })

  it('seeds Christmas outreach from the kaledinis HTML only', () => {
    const tavoHtml = runWithBusinessProfile(DEFAULT_BUSINESS_PROFILE_ID, () => getOutreachSettings().send.html)
    const christmasHtml = runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, () => getOutreachSettings().send.html)
    expect(christmasHtml).not.toMatch(/tavoknyga\.com/i)
    expect(christmasHtml).not.toMatch(/mityb|svorio/i)
    if (fs.existsSync(getProfileBrand(CHRISTMAS_BUSINESS_PROFILE_ID).outreachPromoHtml)) {
      expect(christmasHtml.toLowerCase()).toMatch(/kalėd|kaled|kampel/)
      expect(christmasHtml.length).toBeGreaterThan(20)
    }
    if (tavoHtml.trim() && christmasHtml.trim()) {
      expect(tavoHtml).not.toBe(christmasHtml)
    }
  })

  it('uses Christmas UGC copy with no diet or tavoknyga.com', () => {
    runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, () => {
      const pool = loadUgcThemePool()
      const blob = JSON.stringify(pool)
      expect(blob).not.toMatch(/tavoknyga\.com/i)
      expect(blob).not.toMatch(/mitybos planas|svorio|kalorij/i)
      expect(ugcActiveCta()).toMatch(/kaledukampelis\.com/i)
      expect(ugcActiveCaptionCta()).toMatch(/kaledukampelis\.com/i)
      expect(ugcActiveHashtags()).toMatch(/#kaledukampelis/)
      expect(ugcActiveCta()).not.toMatch(/tavoknyga/i)
      expect(ugcActiveCta()).not.toMatch(/kaledukampelis\.lt/i)
    })
    runWithBusinessProfile(DEFAULT_BUSINESS_PROFILE_ID, () => {
      expect(ugcActiveCta()).toMatch(/tavoknyga\.com/i)
    })
  })

  it('returns both profiles from hub scope=all and shares Group Poster workers', () => {
    ensureBusinessProfiles()
    runWithBusinessProfile(DEFAULT_BUSINESS_PROFILE_ID, () => seedGroupPosterWorkerSlot(fakeWorker(11)))
    runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, () => seedGroupPosterWorkerSlot(fakeWorker(22)))
    expect(listGroupPosterWorkerProfileIds()).toEqual([DEFAULT_BUSINESS_PROFILE_ID])
    runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, () => seedGroupPosterWorkerSlot(null))
    expect(listGroupPosterWorkerProfileIds()).toEqual([])

    const summary = getHubSummary({ scope: 'all' })
    const ids = new Set(summary.modules.map((m) => m.profileId))
    expect(ids.has(DEFAULT_BUSINESS_PROFILE_ID)).toBe(true)
    expect(ids.has(CHRISTMAS_BUSINESS_PROFILE_ID)).toBe(true)
    expect(summary.modules.some((m) => m.profileName === 'Kalėdų Kampelis')).toBe(true)
    expect(summary.modules.some((m) => m.profileName === 'Tavo Knyga')).toBe(true)
  }, 20_000)

  it('shares Tavo Facebook login/blacklist/session with Kalėdų Kampelis but not captions, DMs, or images', () => {
    const snapshot = (file: string) => (fs.existsSync(file) ? fs.readFileSync(file) : null)
    const restore = (file: string, prev: Buffer | null) => {
      if (prev) fs.writeFileSync(file, prev)
      else {
        try {
          fs.unlinkSync(file)
        } catch {
          /* ignore */
        }
      }
    }
    const tavoGp = path.join(businessProfileDataDir(DEFAULT_BUSINESS_PROFILE_ID), 'group-poster')
    const kkGp = path.join(businessProfileDataDir(CHRISTMAS_BUSINESS_PROFILE_ID), 'group-poster')
    const files = [
      path.join(tavoGp, 'groups.json'),
      path.join(tavoGp, 'group_blacklist.json'),
      path.join(tavoGp, 'settings.json'),
      path.join(tavoGp, 'captions.txt'),
      path.join(tavoGp, 'friend-dms', 'friends.json'),
      path.join(tavoGp, 'friend-dms', 'settings.json'),
      path.join(tavoGp, 'friend-dms', 'messages.txt'),
      path.join(kkGp, 'settings.json'),
      path.join(kkGp, 'captions.txt'),
      path.join(kkGp, 'friend-dms', 'settings.json'),
      path.join(kkGp, 'friend-dms', 'messages.txt'),
    ]
    const prev = files.map(snapshot)
    try {
      fs.mkdirSync(path.join(tavoGp, 'friend-dms'), { recursive: true })
      fs.writeFileSync(
        path.join(tavoGp, 'groups.json'),
        JSON.stringify([{ id: 'g1', name: 'Vilniaus mamytės', url: 'https://facebook.test/groups/g1' }]),
        'utf8',
      )
      fs.writeFileSync(
        path.join(tavoGp, 'group_blacklist.json'),
        JSON.stringify([{ id: 'b1', name: 'Blocked', reason: 'buy_sell' }]),
        'utf8',
      )
      fs.writeFileSync(
        path.join(tavoGp, 'friend-dms', 'friends.json'),
        JSON.stringify([{ id: 'f1', name: 'Friend One', url: 'https://facebook.test/f1' }]),
        'utf8',
      )
      runWithBusinessProfile(DEFAULT_BUSINESS_PROFILE_ID, () => {
        saveGroupPosterSettings({
          loginEmail: 'shared-login@test.com',
          imagesDir: 'D:\\tavo-poster-images',
          linkUrl: 'https://tavoknyga.com',
          fixedCaption: 'Tavo caption',
        })
        saveCaptionsText('tavo-only-caption')
        savePostaiMessages('tavo-only-dm')
        saveFriendDmSettings({ message: 'tavo-dm-line' })
      })
      runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, () => {
        expect(getGroupPosterSettings().loginEmail).toBe('shared-login@test.com')
        expect(getGroups().some((g) => g.id === 'g1')).toBe(true)
        expect(getGroupBlacklist().some((g) => g.id === 'b1')).toBe(true)
        expect(getFriends().some((f) => f.id === 'f1')).toBe(true)
        expect(getCaptionsText()).not.toBe('tavo-only-caption')
        expect(getPostaiMessages()).not.toBe('tavo-only-dm')
        saveCaptionsText('kaledu-only-caption')
        savePostaiMessages('kaledu-only-dm')
        saveGroupPosterSettings({
          imagesDir: 'D:\\kk-poster-images',
          linkUrl: 'https://kaledukampelis.com',
          fixedCaption: 'KK caption',
        })
        saveFriendDmSettings({ message: 'kk-dm-line' })
        expect(ensureBrowserSessionDir('facebook')).toBe(
          path.join(businessProfileDataDir(DEFAULT_BUSINESS_PROFILE_ID), 'browser-sessions', 'facebook'),
        )
      })
      runWithBusinessProfile(DEFAULT_BUSINESS_PROFILE_ID, () => {
        expect(getCaptionsText()).toBe('tavo-only-caption')
        expect(getPostaiMessages()).toBe('tavo-only-dm')
        expect(getFriendDmSettings().message).toBe('tavo-dm-line')
        expect(getGroupPosterSettings().imagesDir).toBe('D:\\tavo-poster-images')
        expect(getGroupPosterSettings().linkUrl).toBe('https://tavoknyga.com')
        expect(getGroupPosterSettings().fixedCaption).toBe('Tavo caption')
        expect(getGroupPosterSettings().loginEmail).toBe('shared-login@test.com')
      })
      runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, () => {
        expect(getCaptionsText()).toBe('kaledu-only-caption')
        expect(getPostaiMessages()).toBe('kaledu-only-dm')
        expect(getFriendDmSettings().message).toBe('kk-dm-line')
        expect(getGroupPosterSettings().imagesDir).toBe('D:\\kk-poster-images')
        expect(getGroupPosterSettings().linkUrl).toBe('https://kaledukampelis.com')
        expect(getGroupPosterSettings().fixedCaption).toBe('KK caption')
      })
    } finally {
      files.forEach((file, i) => restore(file, prev[i] || null))
    }
  })

  it('does not spawn the Tavo ebook SEO CLI for Kalėdų Kampelis', () => {
    runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, () => {
      const state = getSeoBlogState()
      expect(state.siteRoot).toBe('D:\\jaukumas')
      expect(state.seoEngine).toBe(true)
      expect(state.engine).toBe('kaledu')
      expect(state.settings.autoPublish).toBe(false)
      expect(state.drafts).toEqual([])
      expect(state.topics).toEqual(GIFT_GUIDE_TOPICS)
    })
  })
})
