import type { Tool } from '../types'
import { DiscordDropPanel } from './media/DiscordDropPanel'
import { PictureStripperPanel } from './media/PictureStripperPanel'
import { StripperPanel } from './media/StripperPanel'
import { ToolHeader, ToolLaunchCard, ToolPathsCard, ToolProfilesCard, ToolSettingsCard, ToolVisibilityCard } from "./tool-panel/ToolPanelSections"
import { useToolPanel } from "./tool-panel/useToolPanel"
import { BridgeOfflineBanner } from './ui/bridge-offline'

/** Tools whose UI runs inside the Tool Center instead of a separate browser tab. */
const EMBEDDED_TOOL_IDS = new Set(['video_metadata_stripper', 'discord_uploader', 'picture_metadata_stripper'])

export interface ToolPanelProps {
  tool: Tool
  online: boolean
  bridgeOk: boolean | null
  pinned: boolean
  onTogglePin: () => void
  onHome: () => void
  onUpdate: (next: Tool) => void
}

export function ToolPanel({ tool, online, bridgeOk, pinned, onTogglePin, onHome, onUpdate }: ToolPanelProps) {
    const vm = useToolPanel({ tool, online, bridgeOk, pinned, onTogglePin, onHome, onUpdate })
    const { hasAssets, hasSettings, profiles, setView, settingsDirty, view } = vm
  return (
    <div className="tool-page relative mx-auto max-w-none overflow-x-clip px-2">
      {bridgeOk === false && (
        <div className="mb-4">
          <BridgeOfflineBanner
            message="Bridge offline - launch and settings are unavailable until the local bridge is back."
          />
        </div>
      )}
      <div
        className="pointer-events-none absolute -inset-x-16 -top-16 h-48 rounded-full blur-3xl"
        style={{ background: `${tool.accent}14` }}
      />

      <ToolHeader vm={vm} />

      <div className="relative space-y-6">
        <div className="cc-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={view === 'launch'} onClick={() => setView('launch')} className="cc-tab">
            Launch
          </button>
          <button type="button" role="tab" aria-selected={view === 'settings'} onClick={() => setView('settings')} className="cc-tab">
            Settings{settingsDirty ? ' •' : ''}
          </button>
        </div>

        {view === 'launch' && tool.id === 'video_metadata_stripper' ? <StripperPanel /> : null}
        {view === 'launch' && tool.id === 'discord_uploader' ? <DiscordDropPanel /> : null}
        {view === 'launch' && tool.id === 'picture_metadata_stripper' ? <PictureStripperPanel /> : null}

        {view === 'launch' && !EMBEDDED_TOOL_IDS.has(tool.id) && (
        <ToolLaunchCard vm={vm} />

        )}

        {view === 'settings' && (
        <>
        {(hasSettings || hasAssets) && (
          <ToolSettingsCard vm={vm} />
        )}

        {(hasSettings || hasAssets || profiles.length > 0) && (
        <ToolProfilesCard vm={vm} />

        )}

        <ToolPathsCard vm={vm} />

        <ToolVisibilityCard vm={vm} />
        </>
        )}
      </div>
    </div>
  )
}
