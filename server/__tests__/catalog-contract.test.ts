import { describe, expect, it } from 'vitest'
import { TOOL_CATALOG } from '../../src/data/tools.js'
import { LAUNCH_CATALOG } from '../launch.js'
import { resolveLaunchEntry } from '../launch-runtime.js'

const EXPECTED_TOOL_IDS = [
  'scraper', 'dc_scraper', 'newsletter_sender', 'post_maker', 'ugc_slides', 'one_shot',
  'ai_lead_finder', 'gmail_script', 'motion_blur', 'video_creator', 'ollama', 'tavo_knyga_ui',
  'tavo_factory_ui', 'tavo_health_ui', 'tavo_seo_blog', 'autoplius_bot', 'reddit_commenter',
  'video_metadata_stripper', 'downloader', 'discord_uploader',
  'picture_metadata_stripper',
]

describe('tool catalog contract', () => {
  it('keeps every tool visible and represented by the launch bridge', () => {
    expect(TOOL_CATALOG.map((tool) => tool.id)).toEqual(EXPECTED_TOOL_IDS)
    expect(TOOL_CATALOG.every((tool) => tool.removed === false)).toBe(true)
    expect(new Set(LAUNCH_CATALOG.map((tool) => tool.id))).toEqual(new Set(EXPECTED_TOOL_IDS))
  })

  it('keeps launch and settings metadata compatible', () => {
    for (const ui of TOOL_CATALOG) {
      const bridge = LAUNCH_CATALOG.find((tool) => tool.id === ui.id)
      expect(bridge, ui.id).toBeDefined()
      expect(bridge?.launch, ui.id).toBe(ui.launch)
      expect(bridge?.launchOptions, ui.id).toEqual(ui.launchOptions)
      expect(bridge?.processMatch, ui.id).toBe(ui.processMatch)
      expect(bridge?.settingsFile, ui.id).toBe(ui.settingsFile)
      const bridgeKeys = new Set(bridge?.settingsKeys || [])
      for (const key of (ui.settings || []).map((setting) => setting.key)) {
        expect(bridgeKeys.has(key), `${ui.id}.${key}`).toBe(true)
      }
      expect(new Set((ui.actions || []).map((action) => action.id)).size, ui.id).toBe((ui.actions || []).length)
    }
  })

  it('routes Downloader platforms to their existing launchers and output folders', () => {
    const tool = LAUNCH_CATALOG.find((entry) => entry.id === 'downloader')!
    expect(tool.launchOptions?.map((option) => option.id)).toEqual([
      'medal', 'instagram', 'youtube', 'tiktok', 'twitter', 'soundcloud',
    ])
    expect(resolveLaunchEntry(tool, 'youtube')).toMatchObject({ id: 'downloader', launch: 'youtube.bat' })
    expect(resolveLaunchEntry(tool, 'medal')?.outputPath).toBe(String.raw`D:\medal`)
    expect(resolveLaunchEntry(tool, '../other.bat')).toBeUndefined()
  })
})
