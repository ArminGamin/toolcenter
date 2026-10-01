import {
    unblacklistGroupPosterGroup,
    type GroupPosterState
} from '../../lib/group-poster'
import { checkCls, EmptyState, inputCls } from '../ui/primitives'

export function GroupsListSection({
  showBlacklist,
  setShowBlacklist,
  blacklist,
  groups,
  selectedSet,
  groupFilter,
  setGroupFilter,
  filteredGroups,
  filteredBlacklist,
  blacklistReasonLabel,
  busy,
  onBlacklistSelected,
  onClearWarm,
  selectAllVisible,
  clearSelection,
  toggleGroup,
  flash,
  refresh,
}: {
  showBlacklist: boolean
  setShowBlacklist: React.Dispatch<React.SetStateAction<boolean>>
  blacklist: NonNullable<GroupPosterState['blacklist']>
  groups: NonNullable<GroupPosterState['groups']>
  selectedSet: Set<string>
  groupFilter: string
  setGroupFilter: (v: string) => void
  filteredGroups: NonNullable<GroupPosterState['groups']>
  filteredBlacklist: NonNullable<GroupPosterState['blacklist']>
  blacklistReasonLabel: (reason: string) => string
  busy: boolean
  onBlacklistSelected: () => Promise<void>
  onClearWarm: () => void
  selectAllVisible: () => void
  clearSelection: () => void
  toggleGroup: (id: string) => void
  flash: (msg: string) => void
  refresh: (opts?: { syncSettings?: boolean; light?: boolean }) => Promise<void>
}) {
  return (
    <section className="rounded-2xl border border-lineStrong bg-panel p-5 sm:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-snow">
          {showBlacklist
            ? `Blacklist · ${blacklist.length}`
            : `Groups · ${selectedSet.size || groups.length}${
                selectedSet.size ? ` selected / ${groups.length}` : ' loaded'
              }`}
        </h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowBlacklist((v) => !v)}
            className={[
              'rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] transition',
              showBlacklist
                ? 'border-brass/40 bg-brass/15 text-brass'
                : 'border-lineStrong text-mist hover:text-snow',
            ].join(' ')}
          >
            {showBlacklist ? 'Show groups' : `Blacklist (${blacklist.length})`}
          </button>
          {!showBlacklist && (
            <>
              {selectedSet.size > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  title="Remove selected groups from the list permanently (can Restore from Blacklist)"
                  onClick={() => void onBlacklistSelected()}
                  className="rounded-md border border-ember/45 bg-ember/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-ember hover:bg-ember/20 disabled:opacity-50"
                >
                  Blacklist selected ({selectedSet.size})
                </button>
              )}
              <button
                type="button"
                onClick={selectAllVisible}
                className="rounded-md border border-lineStrong px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-mist hover:text-snow"
              >
                Select visible
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="rounded-md border border-lineStrong px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-mist hover:text-snow"
              >
                Clear
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onClearWarm}
                className="rounded-md border border-lineStrong px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-mist hover:text-snow disabled:opacity-50"
              >
                Clear warm
              </button>
            </>
          )}
        </div>
      </div>
      <input
        className={`${inputCls} mb-3`}
        value={groupFilter}
        onChange={(e) => setGroupFilter(e.target.value)}
        placeholder={showBlacklist ? 'Filter blacklist…' : 'Filter groups…'}
      />
      {showBlacklist ? (
        !blacklist.length ? (
          <EmptyState title="No blacklisted groups yet" />
        ) : (
          <ul className="max-h-[270px] space-y-1 overflow-y-auto">
            {filteredBlacklist.map((g) => (
              <li key={g.id} className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-lift">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-snow">{g.name}</span>
                  <span className="block truncate font-mono text-[10px] text-fog">
                    {g.id}
                    {g.removedAt ? ` · ${new Date(g.removedAt).toLocaleString()}` : ''}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] text-ember/90">
                  {blacklistReasonLabel(g.reason)}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  title="Restore to groups list"
                  onClick={() => {
                    void unblacklistGroupPosterGroup(g.id).then(async (r) => {
                      flash(r.message || (r.ok ? 'Restored' : 'Failed'))
                      await refresh({ syncSettings: true })
                    })
                  }}
                  className="shrink-0 rounded-md border border-lineStrong px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-mist hover:text-snow disabled:opacity-40"
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        )
      ) : !groups.length ? (
        <EmptyState title="No groups loaded" />
      ) : (
        <ul className="max-h-[270px] space-y-1 overflow-y-auto">
          {filteredGroups.map((g) => {
            const checked = selectedSet.size === 0 || selectedSet.has(g.id)
            const explicitly = selectedSet.has(g.id)
            return (
              <li key={g.id}>
                <label className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-lift">
                  <input
                    type="checkbox"
                    className={`${checkCls} mt-0.5`}
                    checked={explicitly}
                    onChange={() => toggleGroup(g.id)}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-snow">{g.name}</span>
                    {g.name !== g.id ? (
                      <span className="block truncate font-mono text-[10px] text-fog">{g.id}</span>
                    ) : null}
                  </span>
                  {!explicitly && selectedSet.size === 0 ? (
                    <span className="ml-auto shrink-0 font-mono text-[9px] uppercase text-phosphor/80">
                      all
                    </span>
                  ) : checked && explicitly ? null : null}
                </label>
              </li>
            )
          })}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-fog">
        {showBlacklist
          ? 'Restore puts a group back on the main list.'
          : 'Empty selection = all loaded groups. Check boxes to limit, or blacklist to hide.'}
      </p>
    </section>
  )
}
