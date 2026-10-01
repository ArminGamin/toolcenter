import { FriendDmsPanel } from './FriendDmsPanel'
import { ProfileSharePanel } from './ProfileSharePanel'
import { GroupPosterGroupsSection } from './group-poster/GroupPosterGroupsSection'
import { useGroupPosterState } from '../hooks/useGroupPosterState'
import { SaveChangesBar, SaveChangesFooter } from './ui/SaveChangesBar'
import { LoadingPanel } from './ui/primitives'
import { BridgeOfflinePanel } from './ui/bridge-offline'

export function GroupPosterPanel({ active = true }: { active?: boolean }) {
  const vm = useGroupPosterState(active)
  const { panelTab, setPanelTab, settings, offline, refresh, unsavedChanges, saveChanges, busy } = vm

  if (panelTab === 'groups' && offline && !settings) {
    return (
      <div className="flex h-full items-center justify-center">
        <BridgeOfflinePanel onRetry={() => void refresh({ syncSettings: true })} />
      </div>
    )
  }

  if (panelTab === 'groups' && !settings) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingPanel title="Loading Group Poster…" />
      </div>
    )
  }

  return (
    <div className="tool-workspace flex flex-col gap-5">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <h1 className="text-2xl font-semibold tracking-tight text-snow">Facebook Group Poster</h1>
        <div className="contents">
          <div className="cc-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={panelTab === 'groups'}
              onClick={() => setPanelTab('groups')}
              className="cc-tab"
            >
              Groups
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={panelTab === 'dms'}
              onClick={() => setPanelTab('dms')}
              className="cc-tab"
            >
              Friend DMs
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={panelTab === 'share'}
              onClick={() => setPanelTab('share')}
              className="cc-tab"
            >
              Profile share
            </button>
          </div>
        </div>
        {panelTab === 'groups' ? (
          <SaveChangesBar compact className="ml-auto" dirty={unsavedChanges} busy={busy} onSave={() => void saveChanges()} />
        ) : null}
      </header>

      {panelTab === 'groups' ? <GroupPosterGroupsSection vm={vm} /> : null}
      {panelTab === 'dms' ? <FriendDmsPanel active={active} /> : null}
      {panelTab === 'share' ? <ProfileSharePanel active={active} /> : null}
      {panelTab === 'groups' && <SaveChangesFooter dirty={unsavedChanges} busy={busy} onSave={() => void saveChanges()} />}
    </div>
  )
}
