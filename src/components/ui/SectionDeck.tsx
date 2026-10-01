import { useState, type ReactNode } from 'react'

export type DeckSection = {
  id: string
  label: string
  /** Small count or status shown on the right of the nav item. */
  badge?: ReactNode
  content: ReactNode
}

function readStored(key: string, sections: DeckSection[]): string | undefined {
  try {
    const value = localStorage.getItem(`cc.deck.${key}`)
    if (value && sections.some((s) => s.id === value)) return value
  } catch {
    /* storage blocked: fall back to the first section */
  }
  return sections[0]?.id
}

/**
 * Fit-to-screen section switcher: a vertical section list beside one visible
 * section. Every section stays mounted (only hidden), so drafts and refs survive
 * switching. Inside `.fit-body` on wide screens the pane scrolls on its own and
 * the page does not.
 */
export function SectionDeck({
  sections,
  storageKey,
  className = '',
}: {
  sections: DeckSection[]
  storageKey: string
  className?: string
}) {
  const [active, setActive] = useState(() => readStored(storageKey, sections))
  const current = sections.some((s) => s.id === active) ? active : sections[0]?.id

  function pick(id: string) {
    setActive(id)
    try {
      localStorage.setItem(`cc.deck.${storageKey}`, id)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className={`fit-deck ${className}`.trim()}>
      <nav className="fit-deck-nav" role="tablist" aria-orientation="vertical">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={s.id === current}
            onClick={() => pick(s.id)}
            className="fit-deck-tab"
          >
            <span>{s.label}</span>
            {s.badge !== undefined && s.badge !== null ? (
              <span className="fit-deck-badge">{s.badge}</span>
            ) : null}
          </button>
        ))}
      </nav>
      {sections.map((s) => (
        <div key={s.id} role="tabpanel" className="fit-pane" hidden={s.id !== current}>
          {s.content}
        </div>
      ))}
    </div>
  )
}
