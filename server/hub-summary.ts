import fs from 'node:fs'
import { listBusinessProfiles, profileDataPath, runWithBusinessProfile } from './business-profiles.js'
import { listAutomationFailures } from './automation-failures.js'
import { abortFriendDms, getFriendDmState, isFriendDmWorkerRunning } from './group-poster-dms.js'
import { abortGroupPoster, getGroupPosterState, isGroupPosterWorkerRunning } from './group-poster.js'
import { abortProfileShare, getProfileShareState, isProfileShareWorkerRunning } from './group-poster-share.js'
import { abortRedditCommenter, getRedditCommenterState, isRedditCommenterWorkerRunning } from './reddit-commenter.js'
import { abortOutreach, getOutreachState } from './outreach.js'
import { getPipelineSummary } from './pipeline.js'
import { abortUgcBatchRun, getUgcBatchRun } from './ugc-batch-run.js'
import { abortSeoBlogRun, getSeoBlogState } from './seoBlog.js'

export type HubModuleSnapshot = {
  id: string
  label: string
  status: string
  message?: string
  sent?: number
  failed?: number
  skipped?: number
  workerRunning?: boolean
  profileId?: string
  profileName?: string
  live?: boolean
}

export type HubSummary = {
  ok: boolean
  at: string
  failures: number
  modules: HubModuleSnapshot[]
  deskOpen: number
  followUpsDue: number
  scope?: 'current' | 'all'
}

function runIsActive(status: string): boolean {
  const s = (status || 'idle').toLowerCase()
  return (
    s === 'running' ||
    s === 'waiting_login' ||
    s === 'paused' ||
    s === 'waiting' ||
    s === 'sending'
  )
}

export function getHubSummary(opts?: { scope?: 'current' | 'all' }): HubSummary {
  if (opts?.scope === 'all') {
    const profiles = listBusinessProfiles()
    const modules: HubModuleSnapshot[] = []
    let failures = 0
    let deskOpen = 0
    let followUpsDue = 0
    for (const profile of profiles) {
      const part = runWithBusinessProfile(profile.id, () => getHubSummary())
      for (const module of part.modules) {
        modules.push({
          ...module,
          profileId: profile.id,
          profileName: profile.name,
        })
      }
      failures += part.failures
      deskOpen += part.deskOpen
      followUpsDue += part.followUpsDue
    }
    return {
      ok: true,
      at: new Date().toISOString(),
      failures,
      modules,
      deskOpen,
      followUpsDue,
      scope: 'all',
    }
  }

  const gp = getGroupPosterState({ light: true })
  const dm = getFriendDmState({ light: true })
  const share = getProfileShareState()
  const rc = getRedditCommenterState({ light: true })
  const outreach = getOutreachState()
  const pipeline = getPipelineSummary()
  const ugc = getUgcBatchRun()
  const seo = getSeoBlogState()

  const modules: HubModuleSnapshot[] = [
    {
      id: 'outreach',
      label: 'Outreach',
      status: outreach.run?.status || 'idle',
      message: outreach.run?.message,
      sent: outreach.run?.sent?.length ?? 0,
      failed: outreach.run?.failed?.length ?? 0,
      workerRunning: Boolean(outreach.sendLoopActive || outreach.findChildRunning),
    },
    {
      id: 'group-poster',
      label: 'Group Poster',
      status: gp.run?.status || 'idle',
      message: gp.run?.message,
      sent: gp.run?.posted ?? 0,
      failed: gp.run?.failed ?? 0,
      workerRunning: isGroupPosterWorkerRunning(),
    },
    {
      id: 'friend-dms',
      label: 'Friend DMs',
      status: dm.run?.status || 'idle',
      message: dm.run?.message,
      sent: dm.run?.sent ?? 0,
      failed: dm.run?.failed ?? 0,
      skipped: dm.run?.skipped ?? 0,
      workerRunning: isFriendDmWorkerRunning(),
    },
    {
      id: 'profile-share',
      label: 'Profile share',
      status: share.run?.status || 'idle',
      message: share.run?.message,
      sent: share.run?.sent ?? 0,
      failed: share.run?.failed ?? 0,
      skipped: share.run?.skipped ?? 0,
      workerRunning: isProfileShareWorkerRunning(),
    },
    {
      id: 'reddit-commenter',
      label: 'Reddit',
      status: rc.run?.status || 'idle',
      message: rc.run?.message,
      sent: rc.run?.posted ?? 0,
      failed: rc.run?.failed ?? 0,
      workerRunning: isRedditCommenterWorkerRunning(),
    },
    {
      id: 'ugc-slides',
      label: 'UGC',
      status: ugc.status || 'idle',
      message: ugc.message,
      sent: ugc.okCount ?? 0,
      failed: ugc.posts.filter((p) => p.copyStatus === 'failed').length,
      workerRunning: ugc.status === 'running',
    },
    {
      id: 'seo-blog',
      label: 'SEO Blog',
      status: seo.run?.status || 'idle',
      message: seo.run?.message,
      sent: Array.isArray(seo.run?.posts) ? seo.run.posts.length : 0,
      workerRunning: Boolean(seo.childRunning),
    },
  ].map((module) => ({ ...module, live: runIsActive(module.status) || Boolean(module.workerRunning) }))

  const outcomesFile = profileDataPath('desk-outcomes.jsonl')
  let deskOpen = 0
  if (fs.existsSync(outcomesFile)) {
    for (const line of fs.readFileSync(outcomesFile, 'utf8').split('\n')) {
      if (!line.trim()) continue
      try {
        const row = JSON.parse(line) as { status?: string }
        if (row.status === 'open') deskOpen += 1
      } catch {
        /* skip */
      }
    }
  }

  return {
    ok: true,
    at: new Date().toISOString(),
    failures: listAutomationFailures(200).length,
    modules,
    deskOpen,
    followUpsDue: pipeline.followUpsDue,
    scope: 'current',
  }
}

export function stopHubModule(
  profileId: string,
  moduleId: string,
): { ok: boolean; message: string } {
  return runWithBusinessProfile(profileId, () => {
    switch (moduleId) {
      case 'outreach':
        return abortOutreach()
      case 'group-poster':
        return abortGroupPoster()
      case 'friend-dms':
        return abortFriendDms()
      case 'profile-share':
        return abortProfileShare()
      case 'reddit-commenter':
        return abortRedditCommenter()
      case 'ugc-slides':
        return abortUgcBatchRun()
      case 'seo-blog':
        return abortSeoBlogRun()
      default:
        return { ok: false, message: `Unknown module: ${moduleId}` }
    }
  })
}

export function getActiveModuleCount(summary: HubSummary): number {
  return summary.modules.filter((m) => runIsActive(m.status)).length
}
