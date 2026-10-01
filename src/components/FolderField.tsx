import { useEffect, useState } from 'react'

/** One editable folder: shows the current path, lets you change it, and flags missing folders. */
export function FolderField({
  label,
  help,
  path,
  defaultPath,
  overridden,
  exists,
  locked,
  onSave,
  onReset,
}: {
  label: string
  help?: string
  path: string
  defaultPath: string
  overridden: boolean
  exists: boolean
  locked?: boolean
  onSave: (next: string) => Promise<void>
  onReset: () => Promise<void>
}) {
  const [draft, setDraft] = useState(path)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => setDraft(path), [path])

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await fn()
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const dirty = draft.trim() !== path
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-snow">{label}</span>
        {!exists ? <span className="text-xs font-semibold text-ember">Folder not found</span> : null}
      </div>
      {help ? <p className="text-xs text-fog">{help}</p> : null}
      <div className="flex flex-wrap gap-2">
        <input
          value={draft}
          disabled={locked || busy}
          onChange={(e) => {
            setDraft(e.target.value)
            setSaved(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && dirty) void run(() => onSave(draft))
          }}
          spellCheck={false}
          className={`surface-input min-h-10 min-w-[240px] flex-1 rounded-lg px-3 py-2 font-mono text-xs text-snow outline-none ${exists ? '' : '!border-ember/60'}`}
        />
        <button
          type="button"
          disabled={locked || busy || !dirty}
          onClick={() => void run(() => onSave(draft))}
          className="min-h-10 rounded-lg border border-brass/40 bg-brass/15 px-4 py-2 text-xs font-semibold text-brass hover:bg-brass/25 disabled:opacity-40"
        >
          Save
        </button>
        {overridden ? (
          <button
            type="button"
            disabled={locked || busy}
            onClick={() => void run(onReset)}
            className="min-h-10 rounded-lg border border-lineStrong bg-raised px-4 py-2 text-xs font-semibold text-mist hover:bg-lift disabled:opacity-40"
            title={`Default: ${defaultPath}`}
          >
            Reset to default
          </button>
        ) : null}
      </div>
      {locked ? <p className="text-xs text-fog">Set by an environment variable on this PC.</p> : null}
      {error ? <p className="text-xs text-ember">{error}</p> : null}
      {saved && !error ? <p className="text-xs text-phosphor">Saved.</p> : null}
    </div>
  )
}
