import type { SeoBlogDraft } from '../../lib/seoBlog'
import { EmptyState } from '../ui/primitives'
import { Btn, DraftCard } from './seo-blog-ui'

export function ReviewSection({
  drafts,
  busy,
  expanded,
  onToggleExpanded,
  onAccept,
  onReject,
  onAcceptAll,
  onRejectAll,
  acceptLabel,
}: {
  drafts: SeoBlogDraft[]
  busy: boolean
  expanded: string | null
  onToggleExpanded: (slug: string) => void
  onAccept: (slug: string) => void
  onReject: (slug: string) => void
  onAcceptAll: () => void
  onRejectAll: () => void
  acceptLabel?: string
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-fog">
          Review drafts ({drafts.length})
        </h2>
        <div className="flex flex-wrap gap-2">
          <Btn primary disabled={busy || drafts.length === 0 || drafts.some((d) => d.mock)} onClick={onAcceptAll}>
            Accept all
          </Btn>
          <Btn danger disabled={busy || drafts.length === 0} onClick={onRejectAll}>
            Reject all
          </Btn>
        </div>
      </div>
      {drafts.length === 0 ? (
        <EmptyState title="No pending drafts" />
      ) : (
        drafts.map((draft) => (
          <DraftCard
            key={draft.slug}
            draft={draft}
            acceptLabel={acceptLabel}
            expanded={expanded === draft.slug}
            busy={busy}
            onToggle={() => onToggleExpanded(draft.slug)}
            onAccept={() => onAccept(draft.slug)}
            onReject={() => onReject(draft.slug)}
          />
        ))
      )}
    </div>
  )
}
