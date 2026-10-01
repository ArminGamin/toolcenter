import { useEffect, useState } from 'react'
import type { Tool } from '../types'
import { fetchPaths, updatePath, type PathsSnapshot } from '../lib/paths'
import { FolderField } from './FolderField'

/** More → Folders: every folder the Control Center depends on, editable in one place. */
export function FoldersModal({ open, onClose, tools }: { open: boolean; onClose: () => void; tools: Tool[] }) {
  const [snap, setSnap] = useState<PathsSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    fetchPaths()
      .then(setSnap)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  const nameOf = (id: string) => tools.find((t) => t.id === id)?.name || id
  const missing = snap ? snap.tools.filter((t) => !t.exists).length + snap.dirs.filter((d) => !d.exists).length : 0

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden onClick={onClose} />
      <div
        role="dialog"
        aria-label="Folders"
        className="relative z-10 flex max-h-[88vh] w-full max-w-3xl flex-col rounded-2xl border border-lineStrong bg-panel shadow-panel"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-6 py-5">
          <div>
            <h2 className="text-xl font-bold text-snow">Folders</h2>
            <p className="mt-1 text-sm text-mist">
              Where each tool and data folder lives on this PC. Change a path here if you move a folder.
              {missing ? <span className="font-semibold text-ember"> {missing} folder(s) not found.</span> : null}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-lineStrong bg-raised px-3 py-2 text-sm font-semibold text-snow hover:bg-lift">
            Close
          </button>
        </div>
        <div className="min-h-0 space-y-8 overflow-y-auto px-6 py-6">
          {error ? <p className="text-sm text-ember">{error}</p> : null}
          {!snap && !error ? <p className="text-sm text-mist">Loading…</p> : null}
          {snap ? (
            <>
              <section className="space-y-5">
                <h3 className="text-base font-semibold text-snow">UGC data</h3>
                {snap.dirs.map((d) => (
                  <FolderField
                    key={d.key}
                    label={d.label}
                    help={d.help}
                    path={d.path}
                    defaultPath={d.default}
                    overridden={d.overridden}
                    exists={d.exists}
                    locked={d.envLocked}
                    onSave={async (p) => setSnap(await updatePath({ action: 'set-dir', key: d.key, path: p }))}
                    onReset={async () => setSnap(await updatePath({ action: 'reset-dir', key: d.key }))}
                  />
                ))}
              </section>
              <section className="space-y-5">
                <h3 className="text-base font-semibold text-snow">Tools</h3>
                {[...snap.tools]
                  .sort((a, b) => Number(a.exists) - Number(b.exists) || nameOf(a.id).localeCompare(nameOf(b.id)))
                  .map((t) => (
                    <FolderField
                      key={t.id}
                      label={nameOf(t.id)}
                      path={t.path}
                      defaultPath={t.defaultPath}
                      overridden={t.overridden}
                      exists={t.exists}
                      onSave={async (p) => setSnap(await updatePath({ action: 'set-tool', id: t.id, path: p }))}
                      onReset={async () => setSnap(await updatePath({ action: 'reset-tool', id: t.id }))}
                    />
                  ))}
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
