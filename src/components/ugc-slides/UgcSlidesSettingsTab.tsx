import {
  DEFAULT_UGC_VAULT_SETTINGS,
  deleteUgcProfile,
  draftProfileSettings,
  EXPORT_SIZE_OPTIONS,
  listUgcProfiles,
  PLACEMENT_OPTIONS,
  saveUgcProfile,
  TEMPLATE_OPTIONS,
  type UgcSlidesDraft,
  type UgcSlidesProfile,
  type UgcVaultSettings,
} from '../../lib/ugc-slides'
import { SecretInput } from '../SecretInput'
import { Field, inputCls } from '../ui/primitives'

type Props = {
  draft: UgcSlidesDraft
  vaultSettings: UgcVaultSettings
  profiles: UgcSlidesProfile[]
  profileName: string
  selectedProfile: string
  onProfilesChange: (profiles: UgcSlidesProfile[]) => void
  onProfileNameChange: (name: string) => void
  onSelectedProfileChange: (name: string) => void
  onPatchDraft: (partial: Partial<UgcSlidesDraft>) => void
  onVaultSettingsChange: (partial: Partial<UgcVaultSettings>) => void
}

export function UgcSlidesSettingsTab({
  draft,
  vaultSettings,
  profiles,
  profileName,
  selectedProfile,
  onProfilesChange,
  onProfileNameChange,
  onSelectedProfileChange,
  onPatchDraft,
  onVaultSettingsChange,
}: Props) {
  function refreshProfiles() {
    onProfilesChange(listUgcProfiles())
  }

  function onSaveProfile() {
    const name = (profileName || selectedProfile).trim()
    if (!name) return
    saveUgcProfile(name, draftProfileSettings(draft))
    onProfileNameChange(name)
    onSelectedProfileChange(name)
    refreshProfiles()
  }

  function onLoadProfile() {
    const name = selectedProfile.trim()
    if (!name) return
    const profile = profiles.find((p) => p.name === name)
    if (!profile) return
    onPatchDraft(profile.settings)
    onProfileNameChange(name)
  }

  function onDeleteProfile() {
    const name = selectedProfile.trim()
    if (!name) return
    if (!window.confirm(`Delete profile "${name}"?`)) return
    deleteUgcProfile(name)
    onSelectedProfileChange('')
    onProfileNameChange('')
    refreshProfiles()
  }

  return (
    <div className="tool-settings-grid">
      <section className="space-y-5 rounded-2xl border border-line bg-panel p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-snow">Ollama</h2>
        <p className="text-xs text-fog">
          Local copy generation. Status and model picker are in the bar above — save changes to
          persist.
        </p>
        <Field label="Ollama URL">
          <input
            className={inputCls}
            value={vaultSettings.OLLAMA_URL}
            onChange={(e) => onVaultSettingsChange({ OLLAMA_URL: e.target.value })}
            placeholder={DEFAULT_UGC_VAULT_SETTINGS.OLLAMA_URL}
          />
          <p className="mt-1 text-[11px] text-fog">
            Use <span className="text-mist">ugc-lt-gpu</span> (default) — OpenEuroLLM Lithuanian on
            full GPU. Do not use ugc-lt-fast / llama3.1 for LT slides (word salad).
          </p>
        </Field>
        <Field label="GPU layers (num_gpu)">
          <input
            className={inputCls}
            type="number"
            min={2}
            max={36}
            value={vaultSettings.OLLAMA_NUM_GPU}
            onChange={(e) => onVaultSettingsChange({ OLLAMA_NUM_GPU: e.target.value })}
            placeholder="32"
          />
          <p className="mt-1 text-[11px] text-fog">
            Default 32 = speed/VRAM sweet spot on RX 5700 XT 8GB. 99 crashes. Max 34.
          </p>
        </Field>
        <Field label="Context (num_ctx)">
          <input
            className={inputCls}
            type="number"
            min={5000}
            max={5120}
            step={64}
            value={vaultSettings.OLLAMA_NUM_CTX}
            onChange={(e) => onVaultSettingsChange({ OLLAMA_NUM_CTX: e.target.value })}
            placeholder="5000"
          />
          <p className="mt-1 text-[11px] text-fog">
            Default 5000 (never below). Soft max 5120 on 8GB with GPU layers ≤34.
          </p>
        </Field>
      </section>

      <section className="space-y-5 rounded-2xl border border-line bg-panel p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-snow">Profiles</h2>
        <p className="text-xs text-fog">
          Save angle, export size, layout, Discord IDs, and caption defaults. Slide photos and copy
          stay in the current draft.
        </p>
        <div className="grid gap-5 min-[1400px]:grid-cols-2">
          <Field label="Saved profiles">
            <select
              className={inputCls}
              value={selectedProfile}
              onChange={(e) => {
                onSelectedProfileChange(e.target.value)
                onProfileNameChange(e.target.value)
              }}
            >
              <option value="">Select profile…</option>
              {profiles.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Profile name">
            <input
              className={inputCls}
              value={profileName}
              onChange={(e) => onProfileNameChange(e.target.value)}
              placeholder="e.g. TikTok LT default"
            />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onLoadProfile}
            disabled={!selectedProfile}
            className="min-h-[40px] rounded-lg border border-lineStrong px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-mist disabled:opacity-40"
          >
            Load profile
          </button>
          <button
            type="button"
            onClick={onSaveProfile}
            disabled={!profileName.trim()}
            className="min-h-[40px] rounded-lg border border-brass/40 bg-brass/15 px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-brass disabled:opacity-40"
          >
            Save profile
          </button>
          <button
            type="button"
            onClick={onDeleteProfile}
            disabled={!selectedProfile}
            className="min-h-[40px] rounded-lg border border-ember/30 px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-ember disabled:opacity-40"
          >
            Delete
          </button>
        </div>
      </section>

      <section className="space-y-5 rounded-2xl border border-line bg-panel p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-snow">Export size</h2>
        <Field label="Platform format">
          <select
            className={inputCls}
            value={draft.exportSizeId}
            onChange={(e) =>
              onPatchDraft({ exportSizeId: e.target.value as UgcSlidesDraft['exportSizeId'] })
            }
          >
            {EXPORT_SIZE_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label} · {o.width}×{o.height}
              </option>
            ))}
          </select>
        </Field>
      </section>

      <section className="grid gap-5 rounded-2xl border border-line bg-panel p-5 sm:p-6 min-[1400px]:grid-cols-2">
        <Field label="Template (all slides)">
          <select
            className={inputCls}
            value={draft.template}
            onChange={(e) => onPatchDraft({ template: e.target.value as UgcSlidesDraft['template'] })}
          >
            {TEMPLATE_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Text placement">
          <select
            className={inputCls}
            value={draft.placement}
            onChange={(e) => onPatchDraft({ placement: e.target.value as UgcSlidesDraft['placement'] })}
          >
            {PLACEMENT_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </section>

      <section className="space-y-5 rounded-2xl border border-line bg-panel p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-snow">Discord</h2>
        <Field label="Bot token">
          <SecretInput
            className={inputCls}
            value={vaultSettings.DISCORD_BOT_TOKEN}
            onChange={(v) => onVaultSettingsChange({ DISCORD_BOT_TOKEN: v })}
          />
        </Field>
        <Field label="Guild ID">
          <input
            className={inputCls}
            value={draft.discordGuildId}
            onChange={(e) => onPatchDraft({ discordGuildId: e.target.value })}
            placeholder="Discord server snowflake ID"
          />
        </Field>
        <Field label="Category ID">
          <input
            className={inputCls}
            value={draft.discordCategoryId}
            onChange={(e) => onPatchDraft({ discordCategoryId: e.target.value })}
            placeholder="Category channel snowflake ID"
          />
        </Field>
      </section>
    </div>
  )
}
