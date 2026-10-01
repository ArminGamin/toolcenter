import { pauseFriendDms, resumeFriendDms, startFriendDms } from './group-poster-dms'
import { pauseGroupPoster, resumeGroupPoster, startGroupPoster } from './group-poster'
import { createBackup, launchTool, stopAllTools } from './launch'
import { fetchDeskSignals, fetchMarketNews, fetchMarketQuotes } from './markets'
import { fetchNotes, saveNotes } from './notes'
import {
  clearOutreachRun,
  pauseOutreachSend,
  resumeOutreachSend,
  startOutreachRun,
  startOutreachSend,
} from './outreach'
import { importPipelineFromOutreach } from './pipeline'
import {
  clearRedditCommenterRun,
  pauseRedditCommenter,
  resumeRedditCommenter,
  startRedditScanAndPost,
} from './reddit-commenter'
import { startSeoBlogRun } from './seoBlog'
import {
  DEFAULT_UGC_DRAFT,
  generateUgcSlideshow,
  loadUgcDraft,
  saveUgcDraft,
  type UgcAngle,
} from './ugc-slides'
import type { Tool } from '../types'

export type AssistantAction =
  | { type: 'open_module'; module: string }
  | { type: 'open_failures' }
  | { type: 'open_pipeline' }
  | { type: 'open_vault' }
  | { type: 'open_logs' }
  | { type: 'reply'; message: string }
  | { type: 'backup' }
  | { type: 'stop_all' }
  | { type: 'launch_tool'; toolId: string }
  | { type: 'create_note'; title: string; body: string }
  | { type: 'start_outreach_find'; pasteList?: string }
  | { type: 'start_outreach_send' }
  | { type: 'pause_outreach' }
  | { type: 'resume_outreach' }
  | { type: 'clear_outreach_run' }
  | { type: 'start_group_poster' }
  | { type: 'pause_group_poster' }
  | { type: 'resume_group_poster' }
  | { type: 'start_friend_dms' }
  | { type: 'pause_friend_dms' }
  | { type: 'resume_friend_dms' }
  | { type: 'start_reddit' }
  | { type: 'pause_reddit' }
  | { type: 'resume_reddit' }
  | { type: 'clear_reddit_run' }
  | { type: 'start_seo_blog' }
  | { type: 'generate_ugc'; topic: string; slideCount?: number; brief?: string }
  | { type: 'import_pipeline_outreach' }
  | { type: 'refresh_markets' }

export type AssistantParseResult = {
  actions: AssistantAction[]
  reply: string
  source: 'rules' | 'ollama'
}

const RISKY = new Set<AssistantAction['type']>([
  'start_outreach_find',
  'start_outreach_send',
  'resume_outreach',
  'start_group_poster',
  'resume_group_poster',
  'start_friend_dms',
  'resume_friend_dms',
  'start_reddit',
  'resume_reddit',
  'start_seo_blog',
  'launch_tool',
  'stop_all',
  'import_pipeline_outreach',
  'clear_outreach_run',
  'clear_reddit_run',
])

export function isRiskyAction(action: AssistantAction): boolean {
  return RISKY.has(action.type)
}

export function describeAction(action: AssistantAction): string {
  switch (action.type) {
    case 'start_outreach_send':
      return 'Start sending outreach emails'
    case 'start_outreach_find':
      return 'Start outreach lead find'
    case 'start_reddit':
      return 'Start Reddit scan & post'
    case 'start_seo_blog':
      return 'Start SEO blog run (may publish)'
    case 'start_group_poster':
      return 'Start group poster'
    case 'start_friend_dms':
      return 'Start friend DMs'
    case 'launch_tool':
      return `Launch tool: ${action.toolId}`
    case 'stop_all':
      return 'Stop all running tools'
    case 'import_pipeline_outreach':
      return 'Import outreach into pipeline'
    case 'clear_outreach_run':
      return 'Clear outreach run state'
    case 'clear_reddit_run':
      return 'Clear Reddit run state'
    default:
      return action.type.replace(/_/g, ' ')
  }
}

export type ExecuteContext = {
  tools: Tool[]
  onOpenModule: (id: string) => void
  onOpenPipeline?: () => void
  onOpenFailures?: () => void
  onOpenVault?: () => void
  onOpenLogs?: () => void
  onLaunchTool?: (id: string) => Promise<{ ok: boolean; message: string }>
}

export async function executeAssistantAction(
  action: AssistantAction,
  ctx: ExecuteContext,
): Promise<{ ok: boolean; message: string }> {
  switch (action.type) {
    case 'open_module':
      ctx.onOpenModule(action.module)
      return { ok: true, message: `Opened ${action.module.replace(/-/g, ' ')}.` }
    case 'open_pipeline':
      ctx.onOpenPipeline?.()
      return { ok: true, message: 'Opened pipeline.' }
    case 'open_failures':
      ctx.onOpenFailures?.()
      return { ok: true, message: 'Opened failures.' }
    case 'open_vault':
      ctx.onOpenVault?.()
      return { ok: true, message: 'Opened vault.' }
    case 'open_logs':
      ctx.onOpenLogs?.()
      return { ok: true, message: 'Opened logs.' }
    case 'reply':
      return { ok: true, message: action.message }
    case 'backup': {
      const r = await createBackup()
      return { ok: r.ok, message: r.path ? `${r.message}: ${r.path}` : r.message }
    }
    case 'stop_all': {
      const r = await stopAllTools()
      return { ok: r.ok, message: r.message }
    }
    case 'launch_tool': {
      if (ctx.onLaunchTool) return ctx.onLaunchTool(action.toolId)
      const r = await launchTool(action.toolId)
      return { ok: r.ok, message: r.message }
    }
    case 'create_note': {
      const current = await fetchNotes()
      if (!current.ok) return { ok: false, message: 'Notes API unavailable.' }
      const now = new Date().toISOString()
      const saved = await saveNotes({
        ...current.data,
        notes: [
          {
            id: `note-${Date.now()}`,
            title: action.title,
            body: action.body,
            bodyRight: '',
            folderId: null,
            tags: [],
            pinned: false,
            archived: false,
            color: 'brass',
            createdAt: now,
            updatedAt: now,
          },
          ...current.data.notes,
        ],
      })
      return saved.ok
        ? { ok: true, message: `Created note “${action.title}”.` }
        : { ok: false, message: saved.message || 'Failed to save note.' }
    }
    case 'start_outreach_find': {
      const r = await startOutreachRun(action.pasteList ? { pasteList: action.pasteList } : {})
      return { ok: r.ok, message: r.message }
    }
    case 'start_outreach_send': {
      const r = await startOutreachSend()
      return { ok: r.ok, message: r.message }
    }
    case 'pause_outreach': {
      const r = await pauseOutreachSend()
      return { ok: r.ok, message: r.message }
    }
    case 'resume_outreach': {
      const r = await resumeOutreachSend()
      return { ok: r.ok, message: r.message }
    }
    case 'clear_outreach_run': {
      const r = await clearOutreachRun()
      return { ok: r.ok, message: r.message }
    }
    case 'start_group_poster': {
      const r = await startGroupPoster()
      return { ok: r.ok, message: r.message }
    }
    case 'pause_group_poster': {
      const r = await pauseGroupPoster()
      return { ok: r.ok, message: r.message }
    }
    case 'resume_group_poster': {
      const r = await resumeGroupPoster()
      return { ok: r.ok, message: r.message }
    }
    case 'start_friend_dms': {
      const r = await startFriendDms()
      return { ok: r.ok, message: r.message }
    }
    case 'pause_friend_dms': {
      const r = await pauseFriendDms()
      return { ok: r.ok, message: r.message }
    }
    case 'resume_friend_dms': {
      const r = await resumeFriendDms()
      return { ok: r.ok, message: r.message }
    }
    case 'start_reddit': {
      const r = await startRedditScanAndPost()
      return { ok: r.ok, message: r.message }
    }
    case 'pause_reddit': {
      const r = await pauseRedditCommenter()
      return { ok: r.ok, message: r.message }
    }
    case 'resume_reddit': {
      const r = await resumeRedditCommenter()
      return { ok: r.ok, message: r.message }
    }
    case 'clear_reddit_run': {
      const r = await clearRedditCommenterRun()
      return { ok: r.ok, message: r.message }
    }
    case 'start_seo_blog': {
      const r = await startSeoBlogRun()
      return { ok: r.ok, message: r.message }
    }
    case 'import_pipeline_outreach': {
      const r = await importPipelineFromOutreach()
      return { ok: r.ok, message: r.message || (r.ok ? 'Pipeline import done.' : 'Import failed.') }
    }
    case 'refresh_markets': {
      await Promise.all([
        fetchMarketQuotes(),
        fetchDeskSignals('crypto', { force: true }),
        fetchDeskSignals('stock', { force: true }),
        fetchMarketNews({ force: true }),
      ])
      return { ok: true, message: 'Markets refreshed.' }
    }
    case 'generate_ugc': {
      const slideCount = action.slideCount ?? 5
      const r = await generateUgcSlideshow({
        angle: 'custom' as UgcAngle,
        brief: action.brief || action.topic,
        slideCount,
      })
      if (!r.ok || !r.slides?.length) {
        return { ok: false, message: r.message || 'UGC generation failed.' }
      }
      const draft = loadUgcDraft()
      const cta = draft.defaultCta || DEFAULT_UGC_DRAFT.defaultCta
      saveUgcDraft({
        ...draft,
        angle: 'custom',
        brief: action.brief || action.topic,
        slides: r.slides.map((s) => ({
          title: s.title,
          body: s.body,
          cta: s.cta || cta,
          focalX: 50,
          focalY: 50,
        })),
        activeSlideIndex: 0,
      })
      return {
        ok: true,
        message: `Generated ${r.slides.length} slides about “${action.topic}” — saved to UGC draft.`,
      }
    }
    default:
      return { ok: false, message: 'Unknown action.' }
  }
}
