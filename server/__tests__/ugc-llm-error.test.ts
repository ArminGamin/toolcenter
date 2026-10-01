import { describe, expect, it } from 'vitest'
import { llmErrorMessage } from '../ugc-slides.js'
import { collectLtCaseAgreementIssues } from '../ugc-lt-case-check.js'

describe('llmErrorMessage', () => {
  it('does not remap Gemini semantic QA fetch failures to Ollama offline', () => {
    expect(llmErrorMessage(new Error('Semantic QA failed: fetch failed (provider=gemini)'))).toMatch(
      /Gemini semantic QA/i,
    )
    expect(llmErrorMessage(new Error('Semantic QA failed: fetch failed (provider=gemini)'))).not.toMatch(
      /Ollama request failed/i,
    )
  })

  it('still maps bare Ollama fetch failures', () => {
    expect(llmErrorMessage(new Error('fetch failed'))).toMatch(/Ollama request failed/i)
  })
})

describe('case check: genitive attribute before accusative head', () => {
  it('passes sukelti alkio jausmą', () => {
    expect(collectLtCaseAgreementIssues('Gali sukelti alkio jausmą dienos bėgyje.')).toHaveLength(0)
  })
})
