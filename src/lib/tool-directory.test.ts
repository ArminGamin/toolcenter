import { describe, expect, it } from 'vitest'
import { TOOL_CATALOG } from '../data/tools'
import { buildToolDirectory, matchesDirectoryQuery } from './tool-directory'

describe('tool directory destinations', () => {
  it('exposes each tool once and maps embedded tools to their existing panels and sidebar ids', () => {
    const entries = buildToolDirectory(TOOL_CATALOG)
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length)
    for (const tool of TOOL_CATALOG) expect(entries.filter((entry) => entry.toolId === tool.id)).toHaveLength(1)
    expect(entries.find((entry) => entry.id === 'ugc_slides')).toMatchObject({ module: 'ugc-slides', railId: 'ugcSlides' })
    expect(entries.find((entry) => entry.id === 'reddit_commenter')).toMatchObject({ module: 'reddit-commenter', railId: 'redditCommenter' })
    expect(entries.find((entry) => entry.id === 'outreach')).toMatchObject({ module: 'outreach', railId: 'outreach' })
  })

  it('respects the supplied business catalog without changing another profile catalog', () => {
    const changed = TOOL_CATALOG.map((tool) => ({ ...tool, removed: tool.id === 'downloader', name: tool.id === 'ugc_slides' ? 'Kalėdų kūrėjas' : tool.name }))
    const entries = buildToolDirectory(changed)
    expect(entries.some((entry) => entry.id === 'downloader')).toBe(false)
    expect(entries.find((entry) => entry.id === 'ugc_slides')?.name).toBe('Kalėdų kūrėjas')
    expect(buildToolDirectory(TOOL_CATALOG).some((entry) => entry.id === 'downloader')).toBe(true)
    expect(TOOL_CATALOG.find((tool) => tool.id === 'ugc_slides')?.name).toBe('UGC Slides')
  })

  it('finds the combined downloader by platform and accepts multiple search words', () => {
    const downloader = buildToolDirectory(TOOL_CATALOG).find((entry) => entry.id === 'downloader')!
    expect(matchesDirectoryQuery(downloader, 'YouTube downloader')).toBe(true)
    expect(matchesDirectoryQuery(downloader, 'medal')).toBe(true)
    expect(matchesDirectoryQuery(downloader, 'picture stripper')).toBe(false)
  })

  it('matches Lithuanian names without accents and hides removed embedded tools', () => {
    const entries = buildToolDirectory(TOOL_CATALOG.map((tool) => ({ ...tool, removed: tool.id === 'one_shot', name: tool.id === 'ugc_slides' ? 'Kalėdų kūrėjas' : tool.name })))
    expect(entries.some((entry) => entry.id === 'one_shot')).toBe(false)
    expect(matchesDirectoryQuery(entries.find((entry) => entry.id === 'ugc_slides')!, 'kaledu kurejas')).toBe(true)
  })

  it('makes hidden external and embedded tools available for restoration without exposing them by default', () => {
    const hidden = TOOL_CATALOG.map((tool) => ({ ...tool, removed: ['downloader', 'ugc_slides'].includes(tool.id) }))
    expect(buildToolDirectory(hidden).some((entry) => entry.id === 'downloader' || entry.id === 'ugc_slides')).toBe(false)
    const recovery = buildToolDirectory(hidden, true)
    expect(recovery.find((entry) => entry.id === 'downloader')).toMatchObject({ hidden: true, toolId: 'downloader' })
    expect(recovery.find((entry) => entry.id === 'ugc_slides')).toMatchObject({ hidden: true, module: 'ugc-slides', railId: 'ugcSlides' })
  })
})
