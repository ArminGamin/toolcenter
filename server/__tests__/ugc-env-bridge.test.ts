import { describe, expect, it } from 'vitest'
import {
  UGC_DEFAULT_OLLAMA_MODEL,
  UGC_DEFAULT_OLLAMA_NUM_CTX,
  UGC_FORCE_OLLAMA_NUM_GPU,
  resolveUgcOllamaModel,
  resolveUgcOllamaNumCtx,
  resolveUgcOllamaNumCtxBatch,
  resolveUgcOllamaNumGpu,
  resolveUgcOllamaKeepAlive,
  resolveUgcOllamaKeepAliveActive,
  UGC_OLLAMA_KEEP_ALIVE,
  UGC_OLLAMA_KEEP_ALIVE_ACTIVE,
} from '../ugc-env-bridge.js'

describe('resolveUgcOllamaModel', () => {
  it('defaults to ugc-lt-gpu (OpenEuroLLM + full GPU)', () => {
    expect(UGC_DEFAULT_OLLAMA_MODEL).toBe('ugc-lt-gpu')
  }, 15_000)

  it('resolves to ugc-lt-gpu when vault unset or legacy llama/fast', () => {
    expect(resolveUgcOllamaModel()).toBe('ugc-lt-gpu')
  }, 15_000)
})

describe('resolveUgcOllamaNumCtx', () => {
  it('defaults to 4096 and stays in the AMD-safe band', () => {
    expect(UGC_DEFAULT_OLLAMA_NUM_CTX).toBe(4096)
    expect(resolveUgcOllamaNumCtx()).toBeGreaterThanOrEqual(3072)
    expect(resolveUgcOllamaNumCtx()).toBeLessThanOrEqual(4096)
    expect(resolveUgcOllamaNumCtxBatch()).toBeLessThanOrEqual(4096)
  })
})

describe('resolveUgcOllamaNumGpu', () => {
  it('defaults to 32 and clamps vault 99 (8GB safety)', () => {
    expect(UGC_FORCE_OLLAMA_NUM_GPU).toBe(44)
    expect(resolveUgcOllamaNumGpu()).toBeLessThanOrEqual(46)
  })
})

describe('resolveUgcOllamaKeepAlive', () => {
  it('unloads model after session (0)', () => {
    expect(UGC_OLLAMA_KEEP_ALIVE).toBe(0)
    expect(resolveUgcOllamaKeepAlive()).toBe(0)
  })

  it('keeps model loaded during active generation', () => {
    expect(UGC_OLLAMA_KEEP_ALIVE_ACTIVE).toBe('30m')
    expect(resolveUgcOllamaKeepAliveActive()).toBe('30m')
  })
})
