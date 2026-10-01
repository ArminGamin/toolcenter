import type { SeoBlogDraft } from '../../lib/seoBlog'

export function Btn({
  children,
  onClick,
  disabled,
  primary,
  danger,
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  primary?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'min-h-11 rounded-lg border px-3.5 py-2 text-sm font-medium transition disabled:opacity-40',
        primary
          ? 'border-brass/50 bg-brass/20 text-brass hover:bg-brass/30'
          : danger
            ? 'border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20'
            : 'border-lineStrong bg-raised text-fog hover:border-teal/40 hover:text-snow',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-lineStrong bg-well px-3 py-2">
      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-fog">{label}</p>
      <p className="mt-0.5 font-mono text-lg text-snow">{value}</p>
    </div>
  )
}

export function DraftCard({
  draft,
  expanded,
  busy,
  onToggle,
  onAccept,
  onReject,
  acceptLabel = 'Accept → publish',
}: {
  draft: SeoBlogDraft
  expanded: boolean
  busy: boolean
  onToggle: () => void
  onAccept: () => void
  onReject: () => void
  acceptLabel?: string
}) {
  return (
    <div className="rounded-xl border border-lineStrong bg-well p-3">
      <button type="button" onClick={onToggle} className="w-full text-left">
        <p className="font-mono text-[11px] text-snow">{draft.h1 || draft.title}</p>
        <p className="mt-0.5 font-mono text-[10px] text-fog">{draft.slug}</p>
        <p className="mt-2 line-clamp-2 font-mono text-[11px] text-mist">{draft.intro}</p>
      </button>
      {expanded && (
        <div className="mt-3 max-h-72 space-y-3 overflow-auto border-t border-lineStrong pt-3">
          <p className="font-mono text-[10px] text-fog">{draft.metaDescription}</p>
          {draft.editorial && <details className="font-mono text-[10px] text-fog">
            <summary className="cursor-pointer">Automated editorial review · {draft.editorial.model}</summary>
            <p className="mt-1">Check facts and Lithuanian wording before accepting. Search intent is inferred; live search results have not been checked.</p>
            {Object.entries(draft.editorial.checks).map(([name, check]) => <p key={name} className="mt-1">{name}: {check.status} - {check.evidence}{check.correction ? ` → ${check.correction}` : ''}</p>)}
          </details>}
          <p className="font-mono text-[11px] text-mist">{draft.intro}</p>
          {(draft.sections || []).map((section) => (
            <div key={section.heading}>
              <p className="font-mono text-[11px] font-semibold text-snow">{section.heading}</p>
              {(section.paragraphs || []).map((p) => (
                <p key={p.slice(0, 40)} className="mt-1 font-mono text-[11px] text-mist">
                  {p}
                </p>
              ))}
            </div>
          ))}
          {(draft.faq || []).map((item) => <div key={item.q}>
            <p className="font-mono text-[11px] font-semibold text-snow">{item.q}</p>
            <p className="mt-1 font-mono text-[11px] text-mist">{item.a}</p>
          </div>)}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {draft.mock && <p className="w-full font-mono text-xs text-fog">Mock preview - reject this draft to generate a real article.</p>}
        <Btn primary disabled={busy || draft.mock} onClick={onAccept}>
          {acceptLabel}
        </Btn>
        <Btn danger disabled={busy} onClick={onReject}>
          Reject
        </Btn>
        <Btn disabled={busy} onClick={onToggle}>
          {expanded ? 'Hide' : 'Read full'}
        </Btn>
      </div>
    </div>
  )
}
