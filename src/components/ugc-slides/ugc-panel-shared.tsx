
export type PanelTab = 'create' | 'batch' | 'settings'

export type SlideImage = {
  id: string
  url: string
}

export function newId() {
  return `slide-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function UgcTabs({ tab, setTab }: { tab: PanelTab; setTab: (tab: PanelTab) => void }) {
  return (
    <div className="cc-tabs" role="tablist">
      {(['batch', 'settings'] as PanelTab[]).map((id) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tab === id}
          onClick={() => setTab(id)}
          className="cc-tab"
        >
          {id === 'create' ? 'Create' : id === 'batch' ? 'Batch' : 'Settings'}
        </button>
      ))}
    </div>
  )
}
