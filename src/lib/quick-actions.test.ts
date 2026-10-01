import { describe, expect, it } from 'vitest'
import { buildQuickActions } from './quick-actions'
import type { HubModuleSnapshot } from './hub'

describe('quick-actions', () => {
  it('offers pause when outreach is sending', () => {
    const modules: HubModuleSnapshot[] = [
      { id: 'outreach', label: 'Outreach', status: 'sending' },
    ]
    const actions = buildQuickActions(modules)
    expect(actions.some((a) => a.id === 'pause-outreach')).toBe(true)
  })

  it('offers pause when profile share is running', () => {
    const modules: HubModuleSnapshot[] = [
      { id: 'profile-share', label: 'Profile share', status: 'running' },
    ]
    const actions = buildQuickActions(modules)
    expect(actions.some((a) => a.id === 'pause-share')).toBe(true)
  })

  it('offers resume when group poster is paused', () => {
    const modules: HubModuleSnapshot[] = [
      { id: 'group-poster', label: 'Groups', status: 'paused' },
    ]
    const actions = buildQuickActions(modules)
    expect(actions.some((a) => a.id === 'resume-groups')).toBe(true)
  })
})
