import type { SeoBlogRun } from '../../lib/seoBlog'
import { EmptyState } from '../ui/primitives'
import { Btn } from './seo-blog-ui'

export function RunSection({
  run,
  draftCount,
  onOpenReview,
}: {
  run: SeoBlogRun | undefined
  draftCount: number
  onOpenReview: () => void
}) {
  return (
    <div className="space-y-4">
      <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-fog">Live log</h2>
      <div className="max-h-[52vh] overflow-auto rounded-xl border border-lineStrong bg-well p-3 font-mono text-[11px] leading-relaxed text-mist">
        {(run?.log || []).length === 0 ? (
          <EmptyState title="No logs yet" />
        ) : (
          [...(run?.log || [])].reverse().map((line, i) => (
            <div
              key={`${line.at}-${i}-${line.message.slice(0, 24)}`}
              className="border-b border-line/40 py-1 last:border-0"
            >
              <span className="text-fog">{line.at.slice(11, 19)}</span>{' '}
              <span
                className={
                  line.level === 'ERROR'
                    ? 'text-rose-300'
                    : line.level === 'WARN'
                      ? 'text-brass'
                      : 'text-snow'
                }
              >
                {line.message}
              </span>
            </div>
          ))
        )}
      </div>
      {draftCount > 0 && (
        <Btn primary onClick={onOpenReview}>
          Open review ({draftCount})
        </Btn>
      )}
    </div>
  )
}
