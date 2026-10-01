import { describe, expect, it } from 'vitest'
import { redactDiagnosticText } from '../diagnostic-pack.js'

describe('diagnostic pack redaction', () => {
  it('redacts emails, provider keys, and query credentials', () => {
    const redacted = redactDiagnosticText(
      'send to person@example.com key re_1234567890abcdef https://x.test/?token=supersecret',
    )
    expect(redacted).not.toContain('person@example.com')
    expect(redacted).not.toContain('re_1234567890abcdef')
    expect(redacted).not.toContain('supersecret')
  })
})
