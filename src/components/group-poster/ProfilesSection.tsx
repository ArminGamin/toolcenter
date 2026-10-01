import {
    type GroupPosterState
} from '../../lib/group-poster'
import { inputCls } from '../ui/primitives'

export function ProfilesSection({
  state,
  selectedProfile,
  setSelectedProfile,
  profileName,
  setProfileName,
  busy,
  profileBusy,
  onLoadProfile,
  onSaveProfile,
  onDeleteProfile,
}: {
  state: GroupPosterState | null
  selectedProfile: string
  setSelectedProfile: (v: string) => void
  profileName: string
  setProfileName: (v: string) => void
  busy: boolean
  profileBusy: boolean
  onLoadProfile: () => Promise<void>
  onSaveProfile: () => Promise<void>
  onDeleteProfile: () => Promise<void>
}) {
  return (
    <section className="rounded-2xl border border-lineStrong bg-panel p-5 sm:p-6">
      <h2 className="mb-1 text-sm font-semibold text-snow">
        Saved snapshots
      </h2>
      <p className="mb-3 text-xs text-fog">
        Reuse legacy Group Poster settings inside the business workspace selected in the top bar.
      </p>
      {state?.activeProfile ? (
        <p className="mb-2 font-mono text-[11px] text-mist">
          Active: <span className="text-snow">{state.activeProfile}</span>
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <select
          className={`${inputCls} min-w-[160px] flex-1`}
          value={selectedProfile}
          onChange={(e) => {
            setSelectedProfile(e.target.value)
            if (e.target.value) setProfileName(e.target.value)
          }}
        >
          <option value="">
            {(state?.profiles || []).length ? 'Select profile…' : 'No profiles yet'}
          </option>
          {(state?.profiles || []).map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
              {p.linkUrl ? ` · ${p.linkUrl.replace(/^https?:\/\//, '').slice(0, 28)}` : ''}
              {p.captionsCount ? ` · ${p.captionsCount} caps` : ''}
            </option>
          ))}
        </select>
        <input
          className={`${inputCls} min-w-[140px] flex-1`}
          value={profileName}
          onChange={(e) => setProfileName(e.target.value)}
          placeholder="Profile 1"
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || profileBusy || !selectedProfile}
          onClick={() => void onLoadProfile()}
          className="rounded-lg border border-lineStrong bg-lift px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-snow hover:border-brass/35 disabled:opacity-50"
        >
          Load
        </button>
        <button
          type="button"
          disabled={busy || profileBusy}
          onClick={() => void onSaveProfile()}
          className="rounded-lg border border-phosphor/35 bg-phosphor/10 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-phosphor hover:bg-phosphor/20 disabled:opacity-50"
        >
          Save profile
        </button>
        <button
          type="button"
          disabled={busy || profileBusy || !selectedProfile}
          onClick={() => void onDeleteProfile()}
          className="rounded-lg border border-ember/40 bg-ember/10 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-ember hover:bg-ember/20 disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </section>
  )
}
