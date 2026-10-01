import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../gemini-client.js', () => ({
  geminiGenerateJson: vi.fn(),
  isGeminiConfigured: vi.fn(() => true),
  resolveGeminiModel: vi.fn(() => 'gemini-3.5-flash'),
}))

vi.mock('../ollama-client.js', () => ({
  isOllamaConfigured: vi.fn(async () => true),
  ollamaGenerateJson: vi.fn(),
}))

vi.mock('../cc-services.js', () => ({
  loadVault: vi.fn(() => ({})),
}))

vi.mock('../ugc-env-bridge.js', () => ({
  loadPostMakerEnv: vi.fn(() => ({})),
  resolveUgcOllamaModel: vi.fn(() => 'ugc-lt-gpu'),
  resolveUgcOllamaNumCtxBatch: vi.fn(() => 4096),
  resolveUgcOllamaNumGpu: vi.fn(() => 99),
  resolveUgcOllamaKeepAliveActive: vi.fn(() => '10m'),
}))

import { geminiGenerateJson, isGeminiConfigured } from '../gemini-client.js'
import { ollamaGenerateJson } from '../ollama-client.js'
import {
  qaGenerateJson,
  isUgcQaEnabled,
  assertUgcSemanticQaReady,
  resolveUgcQaProvider,
} from '../ugc-qa-client.js'

describe('ugc-qa-client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(isGeminiConfigured).mockReturnValue(true)
    delete process.env.UGC_QA_PROVIDER
    delete process.env.UGC_QA_ENABLED
  })

  it('LLM QA is opt-in by default', () => {
    expect(isUgcQaEnabled()).toBe(false)
    expect(resolveUgcQaProvider()).toBe('off')
  })

  it('assertUgcSemanticQaReady is a no-op when QA off', () => {
    process.env.UGC_QA_ENABLED = 'false'
    expect(() => assertUgcSemanticQaReady()).not.toThrow()
  })

  it('explicitly disables QA when UGC_QA_ENABLED=false', async () => {
    process.env.UGC_QA_ENABLED = 'false'
    expect(isUgcQaEnabled()).toBe(false)
    expect(resolveUgcQaProvider()).toBe('off')
    const { meta, raw } = await qaGenerateJson('fix slides')
    expect(meta.provider).toBe('skipped')
    expect(meta.ok).toBe(true)
    expect(raw).toBe('')
  })

  it('uses Ollama QA when enabled', async () => {
    process.env.UGC_QA_ENABLED = 'true'
    expect(resolveUgcQaProvider()).toBe('ollama')
    vi.mocked(ollamaGenerateJson).mockResolvedValue('{"slides":[],"rejects":[]}')
    const { meta } = await qaGenerateJson('fix slides')
    expect(meta.provider).toBe('ollama')
    expect(meta.ok).toBe(true)
    expect(ollamaGenerateJson).toHaveBeenCalledOnce()
    expect(geminiGenerateJson).not.toHaveBeenCalled()
  })

  it('uses Gemini when enabled + UGC_QA_PROVIDER=gemini', async () => {
    process.env.UGC_QA_ENABLED = 'true'
    process.env.UGC_QA_PROVIDER = 'gemini'
    vi.mocked(geminiGenerateJson).mockResolvedValue('{"slides":[],"rejects":[]}')
    const { meta } = await qaGenerateJson('fix slides')
    expect(meta.provider).toBe('gemini')
    expect(geminiGenerateJson).toHaveBeenCalledOnce()
  })

  it('assert throws when gemini provider missing key', () => {
    process.env.UGC_QA_ENABLED = 'true'
    process.env.UGC_QA_PROVIDER = 'gemini'
    vi.mocked(isGeminiConfigured).mockReturnValue(false)
    expect(() => assertUgcSemanticQaReady()).toThrow(/GEMINI_API_KEY/)
  })

})
