export type RunEventLevel = 'debug' | 'info' | 'warn' | 'error'

export type RunEvent = {
  schemaVersion: 1
  at: string
  runId: string
  tool: string
  phase: string
  level: RunEventLevel
  code: string
  message: string
  attempt?: number
  durationMs?: number
  targetHash?: string
  details?: Record<string, string | number | boolean | null>
}

export function isRunEvent(value: unknown): value is RunEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Partial<RunEvent>
  return (
    event.schemaVersion === 1 &&
    typeof event.at === 'string' &&
    typeof event.runId === 'string' &&
    typeof event.tool === 'string' &&
    typeof event.phase === 'string' &&
    (event.level === 'debug' || event.level === 'info' || event.level === 'warn' || event.level === 'error') &&
    typeof event.code === 'string' &&
    typeof event.message === 'string'
  )
}
