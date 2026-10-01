import { describe, expect, it } from 'vitest'
import { classifyWorkerLine } from '../worker-output.js'

describe('worker output classification', () => {
  it('does not turn Python INFO on stderr into an error', () => {
    expect(classifyWorkerLine('error', '12:34:56 [INFO] [info] Opening Messenger')).toEqual({
      kind: 'info',
      message: '[info] Opening Messenger',
    })
  })

  it('keeps actual Python errors as errors', () => {
    expect(classifyWorkerLine('error', '12:34:56 [ERROR] browser crashed')).toEqual({
      kind: 'error',
      message: 'browser crashed',
    })
  })

  it('uses the source stream for plain output', () => {
    expect(classifyWorkerLine('info', 'ready')).toEqual({ kind: 'info', message: 'ready' })
  })

  it('parses a structured run event without changing its level', () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      at: '2026-09-11T12:00:00.000Z',
      runId: 'run-1',
      tool: 'friend-dms',
      phase: 'navigate',
      level: 'warn',
      code: 'navigation_retry',
      message: 'Retrying navigation',
    })
    const parsed = classifyWorkerLine('info', raw)
    expect(parsed?.kind).toBe('info')
    expect(parsed?.event?.code).toBe('navigation_retry')
  })
})
