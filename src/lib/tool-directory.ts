import type { AppModule } from '../hooks/useAppNavigation'
import type { IconKey, Tool } from '../types'

export const DIRECTORY_GROUPS = ['Create & publish', 'Media utilities', 'Outreach & community', 'Workspace & systems', 'Ebook & store'] as const
export type DirectoryGroup = (typeof DIRECTORY_GROUPS)[number]

export interface DirectoryEntry {
  id: string
  railId: string
  name: string
  description: string
  icon: IconKey
  accent: string
  group: DirectoryGroup
  module?: AppModule
  toolId?: string
  keywords?: string
  hidden?: boolean
}

const WORKSPACES: DirectoryEntry[] = [
  { id: 'ugc_slides', railId: 'ugcSlides', toolId: 'ugc_slides', module: 'ugc-slides', name: 'UGC Slides', description: 'Create photo slides, set captions, and send batches to Discord.', icon: 'ugcSlides', accent: '#f472b6', group: 'Create & publish' },
  { id: 'one_shot', railId: 'oneShot', toolId: 'one_shot', module: 'one-shot', name: 'One-Shot', description: 'Create Notes-style stories and render short videos.', icon: 'oneShot', accent: '#c9b896', group: 'Create & publish' },
  { id: 'pipeline', railId: 'pipeline', module: 'pipeline', name: 'Promo Pipeline', description: 'Manage your content and promotion workflow.', icon: 'pipeline', accent: '#38bdf8', group: 'Create & publish' },
  { id: 'seo-blog', railId: 'seoBlog', module: 'seo-blog', name: 'SEO Blog', description: 'Write and publish articles for the selected business.', icon: 'seoBlog', accent: '#a78bfa', group: 'Create & publish' },
  { id: 'outreach', railId: 'outreach', module: 'outreach', name: 'Outreach', description: 'Find leads, prepare campaigns, and send outreach.', icon: 'outreach', accent: '#e08a6a', group: 'Outreach & community' },
  { id: 'group-poster', railId: 'groupPoster', module: 'group-poster', name: 'Groups & Friend DMs', description: 'Manage Facebook group posts and Messenger outreach.', icon: 'groupPoster', accent: '#7b8cff', group: 'Outreach & community' },
  { id: 'reddit_commenter', railId: 'redditCommenter', toolId: 'reddit_commenter', module: 'reddit-commenter', name: 'Reddit', description: 'Find discussions and manage Reddit replies.', icon: 'redditCommenter', accent: '#f97316', group: 'Outreach & community' },
  { id: 'notes', railId: 'notes', module: 'notes', name: 'Notes', description: 'Keep ideas, drafts, and workspace notes.', icon: 'notes', accent: '#d4a35c', group: 'Workspace & systems' },
  { id: 'markets', railId: 'markets', module: 'markets', name: 'Markets', description: 'Open your market desk, quotes, and watchlists.', icon: 'markets', accent: '#5ec4b4', group: 'Workspace & systems' },
]

function toolGroup(tool: Tool): DirectoryGroup {
  if (tool.category === 'Ebook') return 'Ebook & store'
  if (tool.id === 'autoplius_bot' || tool.category === 'AI') return 'Workspace & systems'
  if (['Content', 'Video', 'Downloads'].includes(tool.category)) return 'Media utilities'
  return 'Outreach & community'
}

export function buildToolDirectory(tools: Tool[], includeHidden = false): DirectoryEntry[] {
  const embeddedIds = new Set(WORKSPACES.flatMap((entry) => entry.toolId ? [entry.toolId] : []))
  const workspaces = WORKSPACES.flatMap((entry) => {
    const tool = entry.toolId ? tools.find((item) => item.id === entry.toolId) : undefined
    if (entry.toolId && (!tool || (tool.removed && !includeHidden))) return []
    return [{ ...entry, ...(tool ? { name: tool.name, accent: tool.accent, hidden: tool.removed } : {}) }]
  })
  return [...workspaces, ...tools.filter((tool) => (includeHidden || !tool.removed) && !embeddedIds.has(tool.id)).map((tool) => ({
    id: tool.id, railId: tool.id, toolId: tool.id, name: tool.name,
    description: tool.blurb, icon: tool.icon, accent: tool.accent, group: toolGroup(tool),
    keywords: [tool.category, ...(tool.launchOptions?.map((option) => option.label) || [])].join(' '),
    hidden: tool.removed,
  }))]
}

export function matchesDirectoryQuery(entry: DirectoryEntry, query: string): boolean {
  const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()
  const haystack = normalize([entry.name, entry.description, entry.group, entry.keywords || ''].join(' '))
  return normalize(query).trim().split(/\s+/).every((word) => haystack.includes(word))
}
