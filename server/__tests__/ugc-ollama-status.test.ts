import { describe, expect, it, vi } from 'vitest'

vi.mock('../ollama-client.js', () => ({
  getOllamaStatus: vi.fn(),
}))

import { getOllamaStatus } from '../ollama-client.js'
import { getUgcOllamaStatus, verifyUgcModelDeploy } from '../ugc-ollama-status.js'
import { getExpectedUgcSystemHash } from '../ugc-modelfile-sync.js'
import { UGC_OLLAMA_SYSTEM_PROMPT } from '../ugc-lt-normalize.js'

describe('getUgcOllamaStatus', () => {
  it('reports model ready when installed tag matches', async () => {
    vi.mocked(getOllamaStatus).mockResolvedValue({
      ok: true,
      url: 'http://127.0.0.1:11434',
      model: 'ugc-lt-gpu',
      tried: ['http://127.0.0.1:11434'],
    })
    const expectedHash = getExpectedUgcSystemHash()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).endsWith('/api/tags')) {
          return {
            ok: true,
            json: async () => ({ models: [{ name: 'ugc-lt-gpu:latest' }] }),
          }
        }
        if (String(url).endsWith('/api/show')) {
          return {
            ok: true,
            json: async () => ({
              modelfile: `FROM test\nSYSTEM """\n${UGC_OLLAMA_SYSTEM_PROMPT}\n"""\n`,
            }),
          }
        }
        throw new Error(`unexpected fetch ${url}`)
      }),
    )

    const status = await getUgcOllamaStatus()
    expect(status.online).toBe(true)
    expect(status.modelReady).toBe(true)
    expect(status.model).toBe('ugc-lt-gpu')
    expect(status.deploy?.systemHashMatch).toBe(true)
    expect(status.deploy?.actualHash).toBe(expectedHash)
  }, 10_000)

  it('reports offline when Ollama is down', async () => {
    vi.mocked(getOllamaStatus).mockResolvedValue({
      ok: false,
      url: null,
      model: 'jobautomation/OpenEuroLLM-Lithuanian',
      tried: ['http://127.0.0.1:11434'],
    })

    const status = await getUgcOllamaStatus()
    expect(status.online).toBe(false)
    expect(status.modelReady).toBe(false)
    expect(status.message).toMatch(/offline/i)
  })
})

describe('verifyUgcModelDeploy', () => {
  it('detects SYSTEM hash mismatch', async () => {
    vi.mocked(getOllamaStatus).mockResolvedValue({
      ok: true,
      url: 'http://127.0.0.1:11434',
      model: 'ugc-lt-gpu',
      tried: ['http://127.0.0.1:11434'],
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          modelfile: 'FROM test\nSYSTEM """\nstale prompt\n"""\n',
        }),
      }),
    )

    const deploy = await verifyUgcModelDeploy(true)
    expect(deploy.modelReady).toBe(true)
    expect(deploy.systemHashMatch).toBe(false)
    expect(deploy.message).toMatch(/out of date/i)
  })
})
