import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../discord-python-publisher.js', () => ({
  publishUgcViaPostMakerPython: vi.fn(() => ({
    ok: false,
    error: 'Discord bridge script missing (test REST fallback)',
  })),
}))

import {
  buildDiscordMultipartBody,
  publishUgcSlideshowToDiscord,
} from '../discord-publisher.js'

const GUILD = 'guild-1'
const CHANNEL_ID = 'channel-99'
const TOKEN = 'test-token'
const API = 'https://discord.com/api/v10'

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => (typeof data === 'string' ? data : JSON.stringify(data)),
  } as Response
}

describe('buildDiscordMultipartBody', () => {
  it('builds payload_json and file parts', () => {
    const { body, contentType } = buildDiscordMultipartBody([
      { name: 'payload_json', value: '{"content":"hi"}' },
      {
        name: 'files[0]',
        filename: 'slide_01.png',
        contentType: 'image/png',
        data: Buffer.from('png-bytes'),
      },
    ])
    const text = body.toString('utf8')
    expect(contentType).toMatch(/multipart\/form-data; boundary=/)
    expect(text).toContain('name="payload_json"')
    expect(text).toContain('{"content":"hi"}')
    expect(text).toContain('filename="slide_01.png"')
    expect(text).toContain('png-bytes')
  })
})

describe('publishUgcSlideshowToDiscord', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('deletes channel when slide upload fails after creation', async () => {
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const path = url.replace(API, '')
        const method = init?.method || 'GET'
        calls.push(`${method} ${path}`)
        if (path === `/guilds/${GUILD}/channels` && method === 'GET') {
          return jsonResponse([])
        }
        if (path === `/guilds/${GUILD}/channels` && method === 'POST') {
          return jsonResponse({ id: CHANNEL_ID, name: 'post-01' })
        }
        if (path === `/channels/${CHANNEL_ID}/messages` && method === 'POST') {
          return jsonResponse({ message: 'upload failed' }, 500)
        }
        if (path === `/channels/${CHANNEL_ID}` && method === 'DELETE') {
          return jsonResponse(null, 204)
        }
        throw new Error(`Unexpected fetch: ${method} ${path}`)
      }),
    )

    const result = await publishUgcSlideshowToDiscord({
      token: TOKEN,
      guildId: GUILD,
      categoryId: '1533864166610436096',
      caption: 'test caption',
      slides: [{ filename: 'slide_01.png', data: Buffer.from('fake-png') }],
    })

    expect(result.ok).toBe(false)
    expect(calls).toContain(`DELETE /channels/${CHANNEL_ID}`)
    const createIdx = calls.indexOf(`POST /guilds/${GUILD}/channels`)
    const deleteIdx = calls.indexOf(`DELETE /channels/${CHANNEL_ID}`)
    expect(createIdx).toBeGreaterThan(-1)
    expect(deleteIdx).toBeGreaterThan(createIdx)
  })

  it('does not delete when channel creation fails', async () => {
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const path = url.replace(API, '')
        const method = init?.method || 'GET'
        calls.push(`${method} ${path}`)
        if (path === `/guilds/${GUILD}/channels` && method === 'GET') {
          return jsonResponse([])
        }
        if (path === `/guilds/${GUILD}/channels` && method === 'POST') {
          return jsonResponse({ message: 'forbidden' }, 403)
        }
        throw new Error(`Unexpected fetch: ${method} ${path}`)
      }),
    )

    const result = await publishUgcSlideshowToDiscord({
      token: TOKEN,
      guildId: GUILD,
      categoryId: '1533864166610436096',
      caption: 'test caption',
      slides: [{ filename: 'slide_01.png', data: Buffer.from('fake-png') }],
    })

    expect(result.ok).toBe(false)
    expect(calls.some((c) => c.startsWith('DELETE'))).toBe(false)
  })
})
