import { wrapNotesLines } from './one-shot-render'
import { describe, expect, it } from 'vitest'

function mockMeasure(text: string, fontSize: number): number {
  return text.length * fontSize * 0.45
}

describe('wrapNotesLines', () => {
  it('wraps only at word boundaries', () => {
    const lines = wrapNotesLines(
      'I am striving for freedom and I will not go back to the life I outgrew',
      180,
      mockMeasure,
      40,
    )
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) {
      expect(line).not.toMatch(/-$/)
      expect(line.trim()).toBe(line)
    }
  })
})
