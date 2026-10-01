import { afterEach, expect, it, vi } from 'vitest'
import { notifyOutreachEmailSent } from '../outreach/email-notify.js'

afterEach(() => vi.unstubAllGlobals())

it('omits the account line while preserving the promo notification details', async () => {
  const fetchMock = vi.fn(async (_url: string, _options: RequestInit) => new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetchMock)
  expect(await notifyOutreachEmailSent('person@gmail.com', '‼️ Subject', 'promo', {
    profile: 'kaledukampelis', quotaSent: 1, quotaCap: 150,
  })).toBe(true)
  const payload = JSON.parse(String(fetchMock.mock.calls[0][1].body))
  expect(payload.content).toBe('📧 **Newsletter sent** (promo)\n**Quota:** 1/150\n**To:** `person@gmail.com`\n**Subject:** ‼️ Subject')
  expect(payload.content).not.toContain('Account:')
})
