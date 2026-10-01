/** Server-side action schema for assistant parsing (mirrors client). */

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

const ACTION_TYPES = new Set([
  'open_module',
  'open_failures',
  'open_pipeline',
  'open_vault',
  'open_logs',
  'reply',
  'backup',
  'stop_all',
  'launch_tool',
  'create_note',
  'start_outreach_find',
  'start_outreach_send',
  'pause_outreach',
  'resume_outreach',
  'clear_outreach_run',
  'start_group_poster',
  'pause_group_poster',
  'resume_group_poster',
  'start_friend_dms',
  'pause_friend_dms',
  'resume_friend_dms',
  'start_reddit',
  'pause_reddit',
  'resume_reddit',
  'clear_reddit_run',
  'start_seo_blog',
  'generate_ugc',
  'import_pipeline_outreach',
  'refresh_markets',
])

export function sanitizeActions(raw: unknown): AssistantAction[] {
  if (!Array.isArray(raw)) return []
  const out: AssistantAction[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const type = (item as { type?: string }).type
    if (!type || !ACTION_TYPES.has(type)) continue
    out.push(item as AssistantAction)
  }
  return out
}
