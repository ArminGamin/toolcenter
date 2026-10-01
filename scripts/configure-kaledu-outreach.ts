import fs from 'node:fs'
import path from 'node:path'
import {
  CHRISTMAS_BUSINESS_PROFILE_ID,
  DEFAULT_BUSINESS_PROFILE_ID,
  runWithBusinessProfile,
} from '../server/business-profiles.js'
import { currentProfileBrand } from '../server/profile-brand.js'
import { CURRENT_FILE } from '../server/outreach/paths.js'
import { readJsonFile } from '../server/outreach/json-store.js'
import {
  getOutreachSettings,
  readSendProfiles,
  saveOutreachSettings,
  writeSendProfiles,
} from '../server/outreach/settings.js'
import type { OutreachRun, OutreachSendProfile } from '../server/outreach/types.js'
import { loadSubjectsFile } from '../server/outreach/send-identity.js'

const source = runWithBusinessProfile(DEFAULT_BUSINESS_PROFILE_ID, getOutreachSettings)

runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, () => {
  const run = readJsonFile<Partial<OutreachRun>>(CURRENT_FILE(), {})
  if (run.status === 'running' || run.status === 'sending' || run.pendingSend?.length) {
    throw new Error('Stop the Kalėdų Kampelis campaign before changing its configuration')
  }
  const brand = currentProfileBrand()
  const html = fs.readFileSync(brand.outreachPromoHtml, 'utf8')
  if (!html.trim()) throw new Error('Kalėdų Kampelis promo HTML is empty')
  const current = getOutreachSettings()
  const apiKey = process.env.KALEDU_OUTREACH_API_KEY?.trim() || current.send.resendApiKey.trim()
  if (!apiKey) throw new Error('Set KALEDU_OUTREACH_API_KEY before configuring Outreach')
  const promoHtmlPaths = [brand.outreachPromoHtml, ...[2, 3, 4].map(number =>
    path.join(path.dirname(brand.outreachPromoHtml), `kaledu-kampelis-promotional-email-${number}.html`))]
  for (const file of promoHtmlPaths) {
    if (!fs.readFileSync(file, 'utf8').trim()) throw new Error(`Promo HTML is empty: ${file}`)
  }
  const subjects = loadSubjectsFile()
  if (subjects.length !== 4) throw new Error('Configure the four Kalėdų Kampelis subjects before continuing')
  const { settings } = saveOutreachSettings({
    find: { ...source.find, pasteList: '', seedUrls: '' },
    clean: structuredClone(source.clean),
    requireApprove: source.requireApprove,
    send: {
      ...current.send,
      subject: '',
      html,
      useAssetHtml: true,
      promoHtmlPaths,
      rotateSubjects: true,
      fromOverride: '',
      activeProfile: 'kaledukampelis',
      testRecipient: 'kajuska166@gmail.com',
      resendApiKey: apiKey,
      resendFrom: 'Kalėdų Kampelis <labas@kaledukampelis.com>',
      dailyCap: source.send.dailyCap,
      delayMs: source.send.delayMs,
      autoContinueNextDay: source.send.autoContinueNextDay,
      discordNotify: source.send.discordNotify,
    },
    chain: { ...source.chain, profiles: ['kaledukampelis'] },
  })
  const { activeProfile, resendApiKey, resendFrom, ...send } = settings.send
  const snapshot: OutreachSendProfile = {
    name: activeProfile,
    updatedAt: new Date().toISOString(),
    resendApiKey,
    resendFrom,
    send,
  }
  const data = readSendProfiles()
  const index = data.profiles.findIndex(profile => profile.name.toLowerCase() === activeProfile)
  if (index < 0) data.profiles.push(snapshot)
  else data.profiles[index] = snapshot
  writeSendProfiles(data)
  console.log(JSON.stringify({
    configured: brand.name,
    from: resendFrom,
    testRecipient: send.testRecipient,
    subjects,
    dailyCap: send.dailyCap,
    delayMs: send.delayMs,
    promoPath: brand.outreachPromoHtml,
    promoHtmlPaths,
    htmlUnchanged: settings.send.html === html,
    sendingStarted: false,
  }))
})
