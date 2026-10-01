import { pauseFriendDms, resumeFriendDms } from './group-poster-dms'
import { pauseGroupPoster, resumeGroupPoster } from './group-poster'
import { pauseProfileShare, resumeProfileShare } from './group-poster-share'
import { pauseOutreachSend, resumeOutreachSend } from './outreach'
import type { HubModuleSnapshot } from './hub'

export type QuickAction = {
  id: string
  label: string
}

export function buildQuickActions(modules: HubModuleSnapshot[]): QuickAction[] {
  const byId = new Map(modules.map((m) => [m.id, m]))
  const out: QuickAction[] = []

  const outreach = byId.get('outreach')
  if (outreach?.status === 'sending') {
    out.push({ id: 'pause-outreach', label: 'Pause Outreach send' })
  }
  if (outreach?.status === 'paused') {
    out.push({ id: 'resume-outreach', label: 'Resume Outreach send' })
  }

  const groups = byId.get('group-poster')
  if (groups?.status === 'running') {
    out.push({ id: 'pause-groups', label: 'Pause Group Poster' })
  }
  if (groups?.status === 'paused') {
    out.push({ id: 'resume-groups', label: 'Resume Group Poster' })
  }

  const dm = byId.get('friend-dms')
  if (dm?.status === 'running') {
    out.push({ id: 'pause-dms', label: 'Pause Friend DMs' })
  }
  if (dm?.status === 'paused') {
    out.push({ id: 'resume-dms', label: 'Resume Friend DMs' })
  }

  const share = byId.get('profile-share')
  if (share?.status === 'running') {
    out.push({ id: 'pause-share', label: 'Pause Profile share' })
  }
  if (share?.status === 'paused') {
    out.push({ id: 'resume-share', label: 'Resume Profile share' })
  }

  return out
}

export async function runQuickAction(id: string): Promise<{ ok: boolean; message: string }> {
  switch (id) {
    case 'pause-outreach':
      return pauseOutreachSend()
    case 'resume-outreach':
      return resumeOutreachSend()
    case 'pause-groups':
      return pauseGroupPoster()
    case 'resume-groups':
      return resumeGroupPoster()
    case 'pause-dms':
      return pauseFriendDms()
    case 'resume-dms':
      return resumeFriendDms()
    case 'pause-share':
      return pauseProfileShare()
    case 'resume-share':
      return resumeProfileShare()
    default:
      return { ok: false, message: 'Unknown action' }
  }
}
