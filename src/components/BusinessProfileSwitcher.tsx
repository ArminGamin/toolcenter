import { useCallback, useEffect, useRef, useState } from 'react'
import {
  activeBusinessProfileId,
  createBusinessProfile,
  deleteBusinessProfile,
  fetchBusinessProfiles,
  renameBusinessProfile,
  setActiveBusinessProfileId,
  type BusinessProfile,
} from '../lib/business-profiles'

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase())
    .join('')
}

/** Site logos (copied from each shop's own favicon); other profiles show initials. */
const PROFILE_LOGOS: Record<string, string> = {
  'tavo-knyga': '/brand/tavo-knyga.png?v=2',
  'christmas-gifts': '/brand/christmas-gifts.png?v=3',
}

function ProfileMark({ profile }: { profile: BusinessProfile }) {
  const [failed, setFailed] = useState(false)
  const logo = PROFILE_LOGOS[profile.id]
  if (!logo || failed) return <>{initials(profile.name)}</>
  return <img src={logo} alt="" draggable={false} onError={() => setFailed(true)} className="h-full w-full object-contain" />
}

export function BusinessProfileSwitcher() {
  const [profiles, setProfiles] = useState<BusinessProfile[]>([])
  const [open, setOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameName, setRenameName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const activeId = activeBusinessProfileId()
  const active = profiles.find((profile) => profile.id === activeId) || profiles[0]

  const refresh = useCallback(async () => {
    const result = await fetchBusinessProfiles()
    if (!result.ok) {
      setError(result.message || 'Could not load profiles')
      return
    }
    setProfiles(result.profiles)
    if (result.profiles.length && !result.profiles.some((profile) => profile.id === activeId)) {
      setActiveBusinessProfileId(result.profiles[0].id)
    }
  }, [activeId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  function select(profile: BusinessProfile) {
    if (profile.id === activeId) {
      setOpen(false)
      return
    }
    setActiveBusinessProfileId(profile.id)
    setOpen(false)
  }

  async function create() {
    if (!newName.trim() || busy) return
    setBusy(true)
    setError('')
    const result = await createBusinessProfile(newName)
    setBusy(false)
    if (!result.ok) {
      setError(result.message || 'Could not create profile')
      return
    }
    const created = result.profiles.find(
      (profile) => profile.name.toLocaleLowerCase() === newName.trim().toLocaleLowerCase(),
    )
    if (created) setActiveBusinessProfileId(created.id)
    setManageOpen(false)
  }

  async function rename() {
    if (!renameId || !renameName.trim() || busy) return
    setBusy(true)
    setError('')
    const result = await renameBusinessProfile(renameId, renameName)
    setBusy(false)
    if (!result.ok) {
      setError(result.message || 'Could not rename profile')
      return
    }
    setProfiles(result.profiles)
    setRenameId(null)
  }

  async function remove(profile: BusinessProfile) {
    if (busy) return
    const confirmed = window.confirm(
      `Archive “${profile.name}”?\n\nIts data will be moved to the recoverable profile trash and will not be permanently deleted.`,
    )
    if (!confirmed) return
    setBusy(true)
    setError('')
    const result = await deleteBusinessProfile(profile.id)
    setBusy(false)
    if (!result.ok) {
      setError(result.message || 'Could not archive profile')
      return
    }
    if (profile.id === activeId) {
      setActiveBusinessProfileId(result.profiles[0]?.id || 'tavo-knyga')
      return
    }
    setProfiles(result.profiles)
  }

  return (
    <>
      <div ref={rootRef} className="relative shrink-0" onKeyDown={(event) => {
        if (open && event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          setOpen(false)
          rootRef.current?.querySelector('button')?.focus()
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          if (!open) {
            setOpen(true)
            return
          }
          const items = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') || [])
          const index = items.indexOf(document.activeElement as HTMLElement)
          items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
        }
      }}>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Switch business profile: ${active?.name || 'Loading profile'}`}
          className="flex min-h-8 items-center gap-2 rounded-lg border border-brass/35 bg-brass/10 px-2 py-1 text-left transition hover:border-brass/60 hover:bg-brass/15"
          title="Switch business profile"
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-md border border-brass/30 bg-well font-mono text-[9px] font-semibold text-brass">
            {active ? <ProfileMark profile={active} /> : '…'}
          </span>
          <span className="max-w-36 truncate font-mono text-[10px] font-semibold text-snow max-[400px]:max-w-32">
            {active?.name || 'Loading profile'}
          </span>
          <svg viewBox="0 0 16 16" width="11" height="11" fill="none" className="text-mist" aria-hidden>
            <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>

        {open ? (
          <div
            role="menu"
            className="absolute right-0 top-[calc(100%+8px)] z-[120] w-64 max-w-[calc(100vw-24px)] overflow-hidden rounded-xl border border-lineStrong bg-panel p-1.5 shadow-2xl"
          >
            <div className="px-2 pb-1.5 pt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-fog">
              Business workspace
            </div>
            {profiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                role="menuitemradio"
                aria-checked={profile.id === activeId}
                onClick={() => select(profile)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition hover:bg-lift"
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg border font-mono text-[10px] font-semibold ${
                    profile.id === activeId
                      ? 'border-brass/50 bg-brass/15 text-brass'
                      : 'border-line bg-well text-mist'
                  }`}
                >
                  <ProfileMark profile={profile} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium text-snow">{profile.name}</span>
                  <span className="block font-mono text-[9px] text-fog">
                    {profile.id === activeId ? 'Currently open' : 'Switch workspace'}
                  </span>
                </span>
                {profile.id === activeId ? <span className="h-1.5 w-1.5 rounded-full bg-phosphor" /> : null}
              </button>
            ))}
            <div className="mt-1 border-t border-line pt-1">
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  setManageOpen(true)
                }}
                className="w-full rounded-lg px-2 py-2 text-left font-mono text-[10px] text-mist transition hover:bg-lift hover:text-snow"
              >
                Manage workspaces…
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {manageOpen ? (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <button className="absolute inset-0" aria-label="Close" onClick={() => setManageOpen(false)} />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-manager-title"
            className="relative flex max-h-[82vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-lineStrong bg-panel shadow-2xl"
          >
            <header className="flex items-start justify-between border-b border-line px-5 py-4">
              <div>
                <h2 id="profile-manager-title" className="font-mono text-sm font-semibold text-snow">
                  Business workspaces
                </h2>
                <p className="mt-1 text-[11px] text-fog">One isolated workspace across every ToolsAI tool.</p>
              </div>
              <button
                type="button"
                onClick={() => setManageOpen(false)}
                className="rounded-lg border border-lineStrong bg-raised px-2.5 py-1.5 font-mono text-[10px] text-mist hover:bg-lift hover:text-snow"
              >
                Close
              </button>
            </header>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
              {profiles.map((profile) => (
                <div key={profile.id} className="rounded-xl border border-line bg-well p-3">
                  {renameId === profile.id ? (
                    <div className="flex gap-2">
                      <input
                        autoFocus
                        value={renameName}
                        onChange={(event) => setRenameName(event.target.value)}
                        onKeyDown={(event) => event.key === 'Enter' && void rename()}
                        className="min-w-0 flex-1 rounded-lg border border-lineStrong bg-ink px-3 py-2 text-xs text-snow outline-none focus:border-brass/55"
                      />
                      <button type="button" onClick={() => void rename()} disabled={busy} className="rounded-lg border border-brass/40 bg-brass/15 px-3 font-mono text-[10px] text-brass disabled:opacity-50">
                        Save
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-lineStrong bg-raised font-mono text-[11px] font-semibold text-brass">
                        <ProfileMark profile={profile} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[13px] font-medium text-snow">{profile.name}</span>
                          {profile.id === activeId ? <span className="rounded-full bg-phosphor/10 px-2 py-0.5 font-mono text-[8px] text-phosphor">Open</span> : null}
                        </div>
                        <span className="font-mono text-[9px] text-fog">{profile.id}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setRenameId(profile.id)
                          setRenameName(profile.name)
                        }}
                        className="rounded-lg px-2 py-1.5 font-mono text-[9px] text-mist hover:bg-lift hover:text-snow"
                      >
                        Rename
                      </button>
                      {profile.id !== 'tavo-knyga' ? (
                        <button type="button" onClick={() => void remove(profile)} disabled={busy} className="rounded-lg px-2 py-1.5 font-mono text-[9px] text-ember hover:bg-ember/10 disabled:opacity-50">
                          Archive
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
              ))}

              <div className="rounded-xl border border-dashed border-lineStrong bg-card/40 p-3">
                <label className="font-mono text-[9px] uppercase tracking-[0.12em] text-mist">New blank workspace</label>
                <div className="mt-2 flex gap-2">
                  <input
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                    onKeyDown={(event) => event.key === 'Enter' && void create()}
                    placeholder="Business name"
                    className="min-w-0 flex-1 rounded-lg border border-lineStrong bg-ink px-3 py-2 text-xs text-snow outline-none focus:border-brass/55"
                  />
                  <button type="button" onClick={() => void create()} disabled={busy || !newName.trim()} className="rounded-lg border border-brass/40 bg-brass/15 px-3 font-mono text-[10px] text-brass transition hover:bg-brass/25 disabled:opacity-40">
                    {busy ? 'Working…' : 'Create'}
                  </button>
                </div>
                <p className="mt-2 text-[10px] text-fog">Starts with empty settings, vault, history, queues, and browser storage.</p>
              </div>

              {error ? <p role="alert" className="rounded-lg border border-ember/30 bg-ember/10 px-3 py-2 text-[11px] text-ember">{error}</p> : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}
