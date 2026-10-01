import { describe, expect, it } from 'vitest'
import { UGC_OLLAMA_SYSTEM_PROMPT } from '../ugc-lt-normalize.js'
import {
  buildSyncedModelfileFromPrompt,
  extractSystemFromModelfile,
  hashModelfileSystem,
  readCommittedModelfileSystem,
} from '../ugc-modelfile-sync.js'

describe('ugc prompt sync', () => {
  it('committed Modelfile SYSTEM SHA-256 matches sync output', () => {
    const committed = readCommittedModelfileSystem()
    const synced = extractSystemFromModelfile(buildSyncedModelfileFromPrompt())
    expect(hashModelfileSystem(committed)).toBe(hashModelfileSystem(synced))
    expect(hashModelfileSystem(committed)).toBe(hashModelfileSystem(UGC_OLLAMA_SYSTEM_PROMPT))
  })
})
