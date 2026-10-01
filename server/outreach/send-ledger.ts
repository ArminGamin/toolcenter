import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { ensureDirs, SEND_OUTCOMES_FILE } from './paths.js'

export type SendOutcomeState = 'sending' | 'sent' | 'failed' | 'needs_review'

export function recipientHash(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 20)
}

export function writeSendOutcome(
  runId: string,
  email: string,
  state: SendOutcomeState,
  idempotencyKey: string,
  code?: string,
) {
  ensureDirs()
  const event = {
    schemaVersion: 1,
    at: new Date().toISOString(),
    runId,
    tool: 'outreach',
    phase: 'send',
    level: state === 'failed' || state === 'needs_review' ? 'error' : 'info',
    code: code || `send_${state}`,
    message: `Recipient ${state.replace('_', ' ')}`,
    targetHash: recipientHash(email),
    details: { state, idempotencyKey },
  }
  fs.appendFileSync(SEND_OUTCOMES_FILE(), `${JSON.stringify(event)}\n`, 'utf8')
  return event
}
