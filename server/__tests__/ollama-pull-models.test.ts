import { describe, expect, it } from 'vitest'
import { resolveOllamaPullModels } from '../launch.js'

describe('resolveOllamaPullModels', () => {
  it('includes the custom UGC Lithuanian model alongside the selected model', () => {
    const models = resolveOllamaPullModels('llama3.1:8b')
    expect(models).toHaveLength(2)
    expect(models[0]).toBe('llama3.1:8b')
    expect(models[1]).toBe('ugc-lt-gpu')
  })

  it('dedupes when selected model is already the UGC default', () => {
    const models = resolveOllamaPullModels('ugc-lt-gpu')
    expect(models).toHaveLength(1)
    expect(models[0]).toBe('ugc-lt-gpu')
  })

  it('dedupes :latest suffix against base name', () => {
    const models = resolveOllamaPullModels('ugc-lt-gpu:latest')
    expect(models).toHaveLength(1)
  })
})
