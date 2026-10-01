import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readLastNonEmptyLines } from '../log-tail.js'

const CHUNK_BYTES = 64 * 1024
const dirs: string[] = []

function fixture(contents: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-log-tail-'))
  dirs.push(dir)
  const file = path.join(dir, 'output.log')
  fs.writeFileSync(file, contents)
  return file
}

function fullReadTail(file: string, limit: number): string[] {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).slice(-limit)
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const dir of dirs.splice(0)) {
    const resolved = path.resolve(dir)
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('cc-log-tail-')) {
      throw new Error('Refusing to remove an unexpected fixture directory')
    }
    fs.rmSync(resolved, { recursive: true, force: true })
  }
})

describe('readLastNonEmptyLines', () => {
  it.each([
    ['', 10],
    ['\n\r\n\n', 10],
    ['old\n\nfirst\r\n \r\n\t\nlast\n\n', 4],
    ['old\r\nfirst\r\nlast', 2],
    ['first\nlast\r', 10],
    ['single line', 1],
  ])('matches the full-file tail for %j with limit %i', (contents, limit) => {
    const file = fixture(contents)
    expect(readLastNonEmptyLines(file, limit)).toEqual(fullReadTail(file, limit))
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'returns no lines for invalid limit %s',
    (limit) => {
      const file = fixture('first\nlast\n')
      expect(readLastNonEmptyLines(file, limit)).toEqual([])
    },
  )

  it('lets callers handle a missing file', () => {
    const file = fixture('temporary')
    fs.unlinkSync(file)
    expect(() => readLastNonEmptyLines(file, 1)).toThrow()
  })

  it('preserves a UTF-8 character split across backward chunks in a long line', () => {
    const file = fixture(`older\n${'a'.repeat(1000)}🙂${'z'.repeat(CHUNK_BYTES - 2)}`)
    expect(readLastNonEmptyLines(file, 1)).toEqual(fullReadTail(file, 1))
  })

  it('handles CRLF split across backward chunks', () => {
    const file = fixture(`older\nkeep\r\n${'z'.repeat(CHUNK_BYTES - 1)}`)
    expect(readLastNonEmptyLines(file, 2)).toEqual(fullReadTail(file, 2))
  })

  it('finds nonempty lines through blank runs longer than a chunk', () => {
    const file = fixture(`older\nkeep\n${'\r\n'.repeat(CHUNK_BYTES)} \nlast\n${'\n'.repeat(CHUNK_BYTES + 1)}`)
    expect(readLastNonEmptyLines(file, 3)).toEqual(['keep', ' ', 'last'])
  })

  it('reads at most one chunk for 80 ordinary lines in a 4 MiB log', () => {
    const contents = Array.from(
      { length: 16 * 1024 },
      (_, index) => `${String(index).padStart(6, '0')} ${'x'.repeat(248)}\n`,
    ).join('')
    const file = fixture(contents)
    const expected = fullReadTail(file, 80)
    const reads = vi.spyOn(fs, 'readSync')

    expect(readLastNonEmptyLines(file, 80)).toEqual(expected)
    const bytesRead = reads.mock.results.reduce(
      (total, result) => total + (result.type === 'return' ? Number(result.value) : 0),
      0,
    )
    expect(bytesRead).toBeGreaterThan(0)
    expect(bytesRead).toBeLessThanOrEqual(CHUNK_BYTES)
  })

  it('reflects appended, truncated, and replaced files on each call', () => {
    const file = fixture('first\nsecond\n')
    expect(readLastNonEmptyLines(file, 2)).toEqual(['first', 'second'])

    fs.appendFileSync(file, 'third\n')
    expect(readLastNonEmptyLines(file, 2)).toEqual(['second', 'third'])

    fs.truncateSync(file, 0)
    expect(readLastNonEmptyLines(file, 2)).toEqual([])
    fs.writeFileSync(file, 'short\n')
    expect(readLastNonEmptyLines(file, 2)).toEqual(['short'])

    const replacement = path.join(path.dirname(file), 'replacement.log')
    fs.writeFileSync(replacement, 'replacement\nfinal')
    fs.unlinkSync(file)
    fs.renameSync(replacement, file)
    expect(readLastNonEmptyLines(file, 2)).toEqual(['replacement', 'final'])
  })
})
