import type { EmailCandidate } from '../../lib/outreach'
import { checkCls, EmptyState } from '../ui/primitives'
import { Btn } from './outreach-ui'

export function ApproveSection({
  keep,
  drop,
  selected,
  showDropped,
  onToggleShowDropped,
  onToggle,
  onSelectAll,
  onSelectNone,
  onApprove,
  busy,
  waiting,
}: {
  keep: EmailCandidate[]
  drop: EmailCandidate[]
  selected: Set<string>
  showDropped: boolean
  onToggleShowDropped: () => void
  onToggle: (email: string) => void
  onSelectAll: () => void
  onSelectNone: () => void
  onApprove: () => void
  busy: boolean
  waiting: boolean
}) {
  const rows = showDropped ? [...keep, ...drop] : keep
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Btn onClick={onSelectAll}>Select all keep</Btn>
        <Btn onClick={onSelectNone}>Select none</Btn>
        <Btn onClick={onToggleShowDropped}>{showDropped ? 'Hide dropped' : 'Show dropped'}</Btn>
        <Btn onClick={onApprove} primary disabled={busy || !selected.size || !waiting}>
          Approve selected ({selected.size})
        </Btn>
      </div>
      {!keep.length && !drop.length && (
        <EmptyState title="No candidates yet" />
      )}
      <div className="max-h-[440px] overflow-y-auto rounded-xl border border-line">
        <table className="w-full font-mono text-[11px]">
          <thead className="sticky top-0 bg-lift text-left text-fog">
            <tr>
              <th className="px-3 py-2 w-14">Keep</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr
                key={c.email}
                className={['border-t border-line', c.decision === 'drop' ? 'text-fog' : 'text-mist'].join(' ')}
              >
                <td className="px-3 py-1.5">
                  {c.decision === 'keep' ? (
                    <input
                      type="checkbox"
                      className={checkCls}
                      checked={selected.has(c.email)}
                      onChange={() => onToggle(c.email)}
                    />
                  ) : (
                    <span className="text-ember">×</span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-snow">{c.email}</td>
                <td className="px-3 py-1.5">{c.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
