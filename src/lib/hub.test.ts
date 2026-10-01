import { describe, expect, it } from 'vitest'
import { railRunningFromHub, type HubModuleSnapshot } from './hub'

function snap(partial: Partial<HubModuleSnapshot> & Pick<HubModuleSnapshot, 'id' | 'label'>): HubModuleSnapshot {
  return { status: 'idle', ...partial }
}

describe('railRunningFromHub', () => {
  it('maps live hub jobs onto rail ids', () => {
    expect(
      railRunningFromHub([
        snap({ id: 'outreach', label: 'Outreach', status: 'sending' }),
        snap({ id: 'group-poster', label: 'Groups', status: 'idle' }),
        snap({ id: 'friend-dms', label: 'DMs', status: 'running' }),
        snap({ id: 'reddit-commenter', label: 'Reddit', status: 'idle', workerRunning: true }),
      ]),
    ).toEqual({
      outreach: true,
      groupPoster: true,
      redditCommenter: true,
    })
  })

  it('ignores idle modules', () => {
    expect(
      railRunningFromHub([snap({ id: 'outreach', label: 'Outreach', status: 'done' })]),
    ).toEqual({})
  })
})
