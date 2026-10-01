import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CHRISTMAS_BUSINESS_PROFILE_ID,
  DEFAULT_BUSINESS_PROFILE_ID,
  profileDataPath,
  runWithBusinessProfile,
} from '../business-profiles.js'
import { saveVault } from '../cc-services.js'
import { currentProfileBrand } from '../profile-brand.js'
import { sentFilePath, quotaFilePath, profileDataDir } from '../outreach/profile-data.js'
import { getOutreachSettings, saveOutreachSettings } from '../outreach/settings.js'
import { loadSubjectsFile, resolveHtml, resolveSendIdentity, resolveSendSubject } from '../outreach/send-identity.js'

describe('Outreach business isolation', () => {
  it('uses independent sender credentials, promo HTML, lead stores and sent history', () => {
    const tavo = runWithBusinessProfile(DEFAULT_BUSINESS_PROFILE_ID, () => {
      saveVault({ RESEND_API_KEY: 'test-tavo-key', RESEND_FROM: 'Tavo <sender@tavo.test>' })
      const settings = saveOutreachSettings({
        send: { ...getOutreachSettings().send, activeProfile: 'same-name', html: '<p>Tavo</p>', useAssetHtml: false },
      }).settings
      const sentPath = sentFilePath(settings)
      fs.writeFileSync(sentPath, JSON.stringify(['jonas@gmail.com']), 'utf8')
      return { identity: resolveSendIdentity(settings), sentPath, quotaPath: quotaFilePath(settings), dbDir: profileDataDir(settings) }
    })
    runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, () => {
      const blank = getOutreachSettings()
      expect(resolveSendIdentity(blank).apiKey).toBe('')
      expect(resolveSendIdentity(blank).fromAddr).toBe('')
      const settings = saveOutreachSettings({
        send: { ...blank.send, activeProfile: 'same-name', resendApiKey: 'test-kaledu-key',
          resendFrom: 'Kalėdų Kampelis <labas@kaledukampelis.com>', html: '<p>Kalėdos</p>', useAssetHtml: false },
      }).settings
      expect(resolveSendIdentity(getOutreachSettings()).apiKey).toBe('test-kaledu-key')
      expect(resolveSendIdentity(settings).fromAddr).toContain('labas@kaledukampelis.com')
      expect(resolveHtml(settings)).toBe('<p>Kalėdos</p>')
      expect(sentFilePath(settings)).not.toBe(tavo.sentPath)
      expect(quotaFilePath(settings)).not.toBe(tavo.quotaPath)
      expect(profileDataDir(settings)).not.toBe(tavo.dbDir)
      expect(fs.existsSync(sentFilePath(settings))).toBe(false)
      expect(fs.existsSync(profileDataPath('outreach', 'profiles', '_default', 'leads.db'))).toBe(false)
      const onDisk = fs.readFileSync(profileDataPath('outreach', 'settings.json'), 'utf8')
      expect(onDisk).not.toContain('test-kaledu-key')
    })
    expect(tavo.identity.apiKey).toBe('test-tavo-key')
    expect(runWithBusinessProfile(DEFAULT_BUSINESS_PROFILE_ID, () => resolveHtml(getOutreachSettings()))).toBe('<p>Tavo</p>')
    expect(JSON.parse(fs.readFileSync(tavo.sentPath, 'utf8'))).toEqual(['jonas@gmail.com'])
  }, 30_000)

  it('does not rotate Tavo Knyga subjects into another business', () => {
    const tavoSubjects = runWithBusinessProfile(DEFAULT_BUSINESS_PROFILE_ID, loadSubjectsFile)
    runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, () => {
      const settings = getOutreachSettings()
      settings.send.subject = 'Kalėdų Kampelis only'
      settings.send.rotateSubjects = true
      expect(loadSubjectsFile()).toEqual([])
      expect(resolveSendSubject(settings, 0)).toBe('Kalėdų Kampelis only')
      const file = profileDataPath('outreach', 'subjects.txt')
      fs.mkdirSync(path.dirname(file), { recursive: true })
      try {
        fs.writeFileSync(file, 'Kalėdos A\nKalėdos B\n', 'utf8')
        expect(resolveSendSubject(settings, 1)).toBe('Kalėdos B')
        expect(runWithBusinessProfile(DEFAULT_BUSINESS_PROFILE_ID, loadSubjectsFile)).toEqual(tavoSubjects)
      } finally {
        fs.unlinkSync(file)
      }
    })
  })

  it('loads the unchanged Kalėdų Kampelis asset for its own business', () => {
    runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, () => {
      const settings = getOutreachSettings()
      settings.send.useAssetHtml = true
      const asset = currentProfileBrand().outreachPromoHtml
      expect(asset).toContain('kaledu_kampelis_kaledinis_promotional_email_v2 (1).html')
      expect(resolveHtml(settings)).toBe(fs.readFileSync(asset, 'utf8'))
    })
  })
})
