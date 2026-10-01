import {
    saveBatchPrefsTestMode
} from '../lib/ugc-batch-prefs'
import { UgcSlidesBatchTab } from './ugc-slides/UgcSlidesBatchTab'
import { UgcCreateEditor, UgcCreatePreview, UgcPanelHeader } from "./ugc-slides/UgcSlidesPanelSections"
import { UgcSlidesSettingsTab } from './ugc-slides/UgcSlidesSettingsTab'
import { useUgcSlidesPanel } from "./ugc-slides/useUgcSlidesPanel"
import { SaveChangesFooter } from './ui/SaveChangesBar'

export function UgcSlidesPanel({ active }: { active: boolean }) {
    const vm = useUgcSlidesPanel({ active })
    const { batchTestMode, dirty, draft, onSaveChanges, patchDraft, profileName, profiles, saveBusy, selectedProfile, setBatchRun, setBatchTestMode, setProfileName, setProfiles, setSelectedProfile, setTab, setVaultSettings, tab, tokenReady, vaultSettings } = vm
  return (
    <div className="tool-workspace flex flex-col gap-6">
      <UgcPanelHeader vm={vm} />

      <div
        className={[
          'tool-workspace-body settings-preserve pb-6',
          tab === 'settings' ? 'block' : 'hidden',
        ].join(' ')}
      >
        <UgcSlidesSettingsTab
          draft={draft}
          vaultSettings={vaultSettings}
          profiles={profiles}
          profileName={profileName}
          selectedProfile={selectedProfile}
          onProfilesChange={setProfiles}
          onProfileNameChange={setProfileName}
          onSelectedProfileChange={setSelectedProfile}
          onPatchDraft={patchDraft}
          onVaultSettingsChange={(partial) =>
            setVaultSettings((prev) => ({ ...prev, ...partial }))
          }
        />
      </div>

      <div
        className={[
          'tool-workspace-body fit-column flex-col',
          tab === 'batch' ? 'flex' : 'hidden',
        ].join(' ')}
      >
        <UgcSlidesBatchTab
          active={active}
          draft={draft}
          onDescriptionChange={patchDraft}
          tokenReady={tokenReady}
          testMode={batchTestMode}
          onTestModeChange={(value) => {
            setBatchTestMode(value)
            saveBatchPrefsTestMode(value)
          }}
          onOpenSettings={() => setTab('settings')}
          onRunStateChange={setBatchRun}
        />
      </div>

      <div
        className={[
          'tool-workspace-body grid grid-cols-1 items-start gap-6 min-[1180px]:grid-cols-[minmax(0,1fr)_360px]',
          tab === 'create' ? 'grid' : 'hidden',
        ].join(' ')}
      >
          <UgcCreatePreview vm={vm} />

          <UgcCreateEditor vm={vm} />
      </div>
      <SaveChangesFooter dirty={dirty} busy={saveBusy} onSave={onSaveChanges} />
    </div>
  )
}
