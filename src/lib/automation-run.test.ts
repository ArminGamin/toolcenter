import { describe, expect, it } from 'vitest'
import {
  formatWaitSec,
  isActiveAutomation,
  liveWaitText,
  normalizeAutomationStatus,
  runHealth,
  statusLabel,
  statusTone,
} from './automation-run'

describe('automation-run', () => {
  it('normalizes status strings', () => {
    expect(normalizeAutomationStatus('RUNNING')).toBe('running')
    expect(normalizeAutomationStatus('')).toBe('idle')
    expect(normalizeAutomationStatus('waiting_login')).toBe('waiting_login')
  })

  it('labels known statuses', () => {
    expect(statusLabel('sending')).toBe('Sending')
    expect(statusLabel('unknown')).toBe('unknown')
  })

  it('tones active and error states', () => {
    expect(statusTone('running')).toContain('phosphor')
    expect(statusTone('error')).toContain('ember')
    expect(statusTone('waiting')).toContain('brass')
  })

  it('detects active automation', () => {
    expect(isActiveAutomation('running')).toBe(true)
    expect(isActiveAutomation('sending')).toBe(true)
    expect(isActiveAutomation('done')).toBe(false)
    expect(isActiveAutomation('idle')).toBe(false)
  })

  it('formats wait seconds', () => {
    expect(formatWaitSec(135)).toBe('2m 15s')
    expect(formatWaitSec(0)).toBe('0m 00s')
  })

  it('builds live wait text for friends and groups', () => {
    const endsAt = new Date(Date.now() + 90_000).toISOString()
    const text = liveWaitText('Waiting', endsAt, Date.now(), 'friend')
    expect(text).toMatch(/^Waiting \d+m \d{2}s before next friend$/)
    const groupText = liveWaitText('Waiting', endsAt, Date.now(), 'group')
    expect(groupText).toMatch(/^Waiting \d+m \d{2}s before next group$/)
    expect(liveWaitText('Warm-up', endsAt, Date.now(), null)).toMatch(/^Warm-up \d+m \d{2}s$/)
  })

  it('turns exact failure codes into actionable health states', () => {
    expect(runHealth({ status: 'error', error: 'network_disconnected' }).label).toBe('Network recovery')
    expect(runHealth({ status: 'paused', error: 'provider_circuit_open' }).label).toBe('Provider down')
    expect(runHealth({ status: 'waiting_login' }).label).toBe('Needs login')
  })

  it('does not treat outreach checkpoint recovery as a Facebook login problem', () => {
    expect(
      runHealth({ status: 'running', message: 'Resuming from checkpoint · 0 qualified saved' }),
    ).toEqual({ label: 'Running' })
  })
})
