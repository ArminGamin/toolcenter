type SaveChangesBarProps = {
  dirty: boolean
  busy?: boolean
  onSave: () => void | Promise<void>
  className?: string
  /** Slim inline variant for page headers (no card while everything is saved). */
  compact?: boolean
}

export function SaveChangesFooter({ dirty, busy, onSave }: Parameters<typeof SaveChangesBar>[0]) {
  if (!dirty) return null
  return <SaveChangesBar dirty={dirty} busy={busy} onSave={onSave} className="tool-save-footer" />
}

/** Shared explicit-save affordance for tool panels. */
export function SaveChangesBar({ dirty, busy, onSave, className = '', compact = false }: SaveChangesBarProps) {
  if (compact) {
    return (
      <div
        className={[
          'inline-flex items-center gap-3 rounded-xl px-3 py-1.5',
          dirty ? 'border border-brass/40 bg-brass/10' : 'border border-transparent',
          className,
        ].join(' ')}
      >
        <span className={['text-xs font-medium', dirty ? 'text-brass' : 'text-fog'].join(' ')}>
          {dirty ? 'Unsaved changes' : 'All changes saved'}
        </span>
        <button
          type="button"
          disabled={busy || !dirty}
          onClick={() => void onSave()}
          className="min-h-10 rounded-lg border border-brass/40 bg-brass/15 px-4 py-2 text-xs font-medium text-brass hover:bg-brass/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    )
  }
  return (
    <div
      className={[
        'flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-raised/50 px-4 py-3',
        className,
      ].join(' ')}
    >
      <span
        className={[
          'text-xs font-medium',
          dirty ? 'text-brass' : 'text-fog',
        ].join(' ')}
      >
        {dirty ? 'Unsaved changes' : 'All changes saved on site'}
      </span>
      <button
        type="button"
        disabled={busy || !dirty}
        onClick={() => void onSave()}
        className="min-h-10 rounded-lg border border-brass/40 bg-brass/15 px-4 py-2 text-xs font-medium text-brass hover:bg-brass/25 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  )
}
