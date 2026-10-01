import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { profileDataPath, runWithBusinessProfile } from '../business-profiles.js'
import { advanceContentRotation, getContentRotationIndex } from '../outreach/content-rotation.js'
import { getOutreachSettings, readSendProfiles, saveOutreachSettings } from '../outreach/settings.js'
import { prepareSendContent } from '../outreach/send-identity.js'
import { startOutreachSend, testOutreachSend } from '../outreach/send-run.js'
import { idleRun, rt, syncOutreachRuntime } from '../outreach/runtime.js'
import * as findProcess from '../outreach/find-process.js'
import * as quota from '../outreach/quota.js'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function configureRotation() {
  const dir = profileDataPath('outreach', 'rotation-fixtures')
  fs.mkdirSync(dir, { recursive: true })
  const paths = ['original', 'new-2', 'new-3', 'new-4'].map(name => {
    const file = path.join(dir, `${name}.html`)
    fs.writeFileSync(file, `<p>${name} {{{EMAIL}}}</p>`, 'utf8')
    return file
  })
  fs.writeFileSync(profileDataPath('outreach', 'subjects.txt'), 'Subject A\nSubject B\nSubject C\nSubject D\n', 'utf8')
  const current = getOutreachSettings()
  return saveOutreachSettings({
    send: { ...current.send, activeProfile: 'rotation-test', resendApiKey: 'test-key',
      resendFrom: 'Test <sender@example.test>', subject: '', rotateSubjects: true,
      useAssetHtml: true, promoHtmlPaths: paths, delayMs: 0, dailyCap: 100, discordNotify: false },
    chain: { ...current.chain, enabled: false, profiles: [] },
  }).settings
}

describe('per-email content rotation', () => {
  it('cycles all four subjects and templates, snapshots files and survives new batches', () => {
    runWithBusinessProfile('christmas-gifts', () => {
      const settings = configureRotation()
      const contentAt = prepareSendContent(settings)
      for (let index = 0; index < 12; index++) {
        const content = contentAt(index)
        expect(content.subject).toBe(['Subject A', 'Subject B', 'Subject C', 'Subject D'][index % 4])
        expect(content.html).toContain(['original', 'new-2', 'new-3', 'new-4'][index % 4])
        if (index) {
          expect(content.subject).not.toBe(contentAt(index - 1).subject)
          expect(content.html).not.toBe(contentAt(index - 1).html)
        }
      }
      fs.writeFileSync(settings.send.promoHtmlPaths![0], '<p>changed</p>', 'utf8')
      expect(contentAt(0).html).toContain('original')
      advanceContentRotation(settings, 4)
      expect(getContentRotationIndex(getOutreachSettings())).toBe(5)
      expect(getContentRotationIndex({ ...settings, send: { ...settings.send, activeProfile: 'other' } })).toBe(0)
      expect(runWithBusinessProfile('tavo-knyga', () => getContentRotationIndex(settings))).toBe(0)
    })
  }, 30_000)

  it('refuses to send if any rotating template is missing or empty', () => {
    runWithBusinessProfile('christmas-gifts', () => {
      const settings = configureRotation()
      fs.writeFileSync(settings.send.promoHtmlPaths![3], '', 'utf8')
      expect(() => prepareSendContent(settings)).toThrow('Promo HTML is empty')
      fs.unlinkSync(settings.send.promoHtmlPaths![3])
      expect(() => prepareSendContent(settings)).toThrow()
      settings.send.useAssetHtml = false
      settings.send.html = '<p>editor override</p>'
      expect(prepareSendContent(settings)(2).html).toBe('<p>editor override</p>')
    })
  }, 30_000)

  it('rotates actual mocked send payloads across batches and keeps retries identical', async () => {
    await runWithBusinessProfile('christmas-gifts', async () => {
      const settings = configureRotation()
      // Use a separate account store so earlier unit checks cannot set its cursor.
      settings.send.activeProfile = 'send-loop-rotation'
      saveOutreachSettings({ send: settings.send })
      vi.spyOn(findProcess, 'countHeadlessFindRuns').mockReturnValue(0)
      vi.spyOn(quota, 'reconcileQuotaFromResend').mockResolvedValue(null)
      const payloads: { subject: string; html: string; to: string[] }[] = []
      vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
        if (url !== 'https://api.resend.com/emails' || options.method !== 'POST') {
          throw new Error('Unexpected external request in rotation test')
        }
        payloads.push(JSON.parse(String(options.body)))
        return new Response(JSON.stringify({ id: 'mock-id' }), { status: payloads.length === 1 ? 429 : 200 })
      }))
      for (const [batch, size] of [5, 7].entries()) {
        rt.currentRun = { ...idleRun(), id: `rotation-batch-${batch}`, stage: 'send', status: 'waiting',
          pendingSend: Array.from({ length: size }, (_, index) => `person${batch}_${index}@gmail.com`) }
        syncOutreachRuntime()
        expect((await startOutreachSend()).ok).toBe(true)
        await vi.waitFor(() => {
          expect(rt.sendLoopActive).toBe(false)
          expect(rt.currentRun.status).toBe('done')
          expect(rt.currentRun.sent).toHaveLength(size)
        }, { timeout: 5000 })
      }
      expect(payloads[0]).toEqual(payloads[1])
      const sent = payloads.slice(1)
      expect(sent).toHaveLength(12)
      sent.forEach((payload, index) => {
        expect(payload.subject).toBe(['Subject A', 'Subject B', 'Subject C', 'Subject D'][index % 4])
        expect(payload.html).toContain(['original', 'new-2', 'new-3', 'new-4'][index % 4])
        expect(payload.html).toContain(payload.to[0])
      })
      expect(getContentRotationIndex(getOutreachSettings())).toBe(12)
      expect(readSendProfiles().profiles.find(profile => profile.name === 'send-loop-rotation')).toBeUndefined()
    })
  }, 30_000)

  it('sends tests only to the configured recipient, even with a different campaign lead', async () => {
    await runWithBusinessProfile('christmas-gifts', async () => {
      const settings = configureRotation()
      settings.send.testRecipient = 'kajuska166@gmail.com'
      saveOutreachSettings({ send: settings.send })
      rt.currentRun = { ...idleRun(), pendingSend: ['actual-lead@gmail.com'] }
      const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'mock-test' }), { status: 200 }))
      vi.stubGlobal('fetch', fetchMock)
      expect((await testOutreachSend()).ok).toBe(true)
      const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body))
      expect(body.to).toEqual(['kajuska166@gmail.com'])
      expect(body.subject).toMatch(/^\[TEST\] /)
      expect(rt.currentRun.pendingSend).toEqual(['actual-lead@gmail.com'])
      rt.currentRun = idleRun()
      expect((await testOutreachSend()).ok).toBe(true)
      expect(fetchMock).toHaveBeenCalledTimes(2)
      saveOutreachSettings({ send: { ...getOutreachSettings().send, testRecipient: 'invalid email' } })
      expect((await testOutreachSend()).ok).toBe(false)
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(runWithBusinessProfile('tavo-knyga', getOutreachSettings).send.testRecipient).toBe('')
    })
  }, 30_000)
})
