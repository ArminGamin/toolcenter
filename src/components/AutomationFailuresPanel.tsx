import { useCallback, useEffect, useState } from 'react'
import {
  automationFailureImageUrl,
  fetchAutomationFailures,
  type AutomationFailureItem,
} from '../lib/hub'
import { EmptyState } from './ui/primitives'

export function AutomationFailuresPanel({ active = true }: { active?: boolean }) {
  const [items, setItems] = useState<AutomationFailureItem[]>([])
  const [selected, setSelected] = useState<AutomationFailureItem | null>(null)

  const refresh = useCallback(async () => {
    if (!active) return
    setItems(await fetchAutomationFailures(60))
  }, [active])

  useEffect(() => {
    void refresh()
    if (!active) return
    const id = window.setInterval(() => void refresh(), 6000)
    return () => window.clearInterval(id)
  }, [active, refresh])

  if (!items.length) {
    return (
      <EmptyState title="No failure screenshots" />
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <ul className="space-y-1 overflow-auto max-h-[420px]">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => setSelected(item)}
              className={[
                'w-full rounded-lg border px-2 py-2 text-left font-mono text-[10px] transition',
                selected?.id === item.id
                  ? 'border-brass/40 bg-lift text-snow'
                  : 'border-line bg-well text-mist hover:border-lineStrong',
              ].join(' ')}
            >
              <span className="block text-brass">{item.module}</span>
              <span className="block truncate text-fog">{item.name}</span>
              <span className="block text-[9px] text-fog">
                {new Date(item.at).toLocaleString()}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="rounded-xl border border-lineStrong bg-well p-2">
        {selected ? (
          <img
            src={automationFailureImageUrl(selected.module, selected.name)}
            alt={selected.name}
            className="max-h-[400px] w-full rounded-lg object-contain"
          />
        ) : (
          <p className="px-4 py-12 text-center font-mono text-[11px] text-fog">
            Select a failure to preview
          </p>
        )}
      </div>
    </div>
  )
}
