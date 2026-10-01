import { beforeEach, describe, expect, it } from 'vitest'
import { describeFailure, dismissAlert, dismissAllAlerts, listAlerts, raiseAlert } from '../alerts.js'
import { fireNotify } from '../cc-services.js'

describe('alerts', () => {
  beforeEach(() => dismissAllAlerts())

  it('raises, de-duplicates repeats and dismisses', () => {
    const a = raiseAlert('Ollama warm-up failed', 'Timed out')
    raiseAlert('Ollama warm-up failed', 'Timed out')
    expect(listAlerts()).toHaveLength(1)
    expect(listAlerts()[0].count).toBe(2)
    expect(dismissAlert(a.id)).toBe(true)
    expect(listAlerts()).toHaveLength(0)
  })

  it('turns error and critical notifications into alerts, but not info', () => {
    fireNotify('Saved', 'All good', 'ok')
    fireNotify('Group Poster failed', 'Comment box not found', 'err', 'group-poster')
    fireNotify('Outreach stopped', 'Quota blocked', 'critical', 'outreach')
    const alerts = listAlerts()
    expect(alerts.map((a) => a.title)).toEqual(['Outreach stopped', 'Group Poster failed'])
    expect(alerts[0].level).toBe('critical')
    expect(alerts[1].source).toBe('group-poster')
  })

  it('calls out timeouts explicitly', () => {
    const timeout = new Error('The operation was aborted due to timeout')
    timeout.name = 'TimeoutError'
    expect(describeFailure(timeout, 'model did not load')).toBe('Timed out: model did not load')
    expect(describeFailure(new Error('boom'))).toBe('boom')
  })
})
