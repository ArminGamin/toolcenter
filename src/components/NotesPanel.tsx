import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchNotes, saveNotes, type Note, type NoteColor, type NoteFolder, type NotesData } from '../lib/notes'
import {
  exportFormats,
  exportNotesToFile,
  type NoteExportFormat,
  type NoteExportScope,
} from '../lib/notes-export'
import { LoadingPanel, ErrorRetryCallout } from './ui/primitives'
import { BridgeOfflinePanel } from './ui/bridge-offline'

type ViewMode = 'write' | 'preview' | 'split'
type SortMode = 'updated' | 'created' | 'title'
type TemplateId = 'blank' | 'meeting' | 'trade' | 'research'

const templates: Record<TemplateId, { label: string; title: string; body: string }> = {
  blank: { label: 'Blank', title: 'Untitled note', body: '' },
  meeting: {
    label: 'Meeting',
    title: 'Meeting - ',
    body: '# Meeting\n\n**Date:** \n**Attendees:** \n\n## Agenda\n- [ ] \n\n## Notes\n\n## Decisions\n- \n\n## Next actions\n- [ ] ',
  },
  trade: {
    label: 'Trade idea',
    title: 'Trade idea - ',
    body: '# Trade idea\n\n**Symbol:** \n**Bias:** \n**Timeframe:** \n\n## Thesis\n\n## Levels\n- Entry: \n- Invalidation: \n- Target: \n\n## Checklist\n- [ ] Catalyst confirmed\n- [ ] Risk defined\n- [ ] Position size set\n',
  },
  research: {
    label: 'Research',
    title: 'Research - ',
    body: '# Research brief\n\n## Question\n\n## Sources\n- \n\n## Evidence\n\n## Takeaway\n',
  },
}

const colorClasses: Record<NoteColor, string> = {
  brass: 'bg-brass',
  phosphor: 'bg-phosphor',
  ember: 'bg-ember',
  mist: 'bg-mist',
}

function id() {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (value) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[value] || value)
}

function MarkdownPreview({ body, onToggle }: { body: string; onToggle: (line: number) => void }) {
  const blocks = body.split('\n').map((line, index) => {
    const checklist = line.match(/^- \[([ xX])\] (.*)$/)
    if (checklist) {
      const checked = checklist[1].toLowerCase() === 'x'
      return <label key={index} className="flex cursor-pointer items-start gap-2 py-0.5 text-sm text-mist">
        <input type="checkbox" checked={checked} onChange={() => onToggle(index)} className="mt-1 accent-brass" />
        <span className={checked ? 'text-fog line-through' : ''}>{inlineMarkdown(checklist[2])}</span>
      </label>
    }
    if (line.startsWith('### ')) return <h3 key={index} className="mt-5 font-sans text-base font-semibold text-snow">{line.slice(4)}</h3>
    if (line.startsWith('## ')) return <h2 key={index} className="mt-6 border-b border-line pb-2 font-sans text-lg font-semibold text-snow">{line.slice(3)}</h2>
    if (line.startsWith('# ')) return <h1 key={index} className="mb-4 font-sans text-2xl font-semibold tracking-tight text-snow">{line.slice(2)}</h1>
    if (line.startsWith('- ')) return <div key={index} className="flex gap-2 text-sm leading-6 text-mist"><span className="text-brass">•</span><span dangerouslySetInnerHTML={{ __html: inlineMarkdown(line.slice(2)) }} /></div>
    if (!line.trim()) return <div key={index} className="h-3" />
    return <p key={index} className="text-sm leading-7 text-mist" dangerouslySetInnerHTML={{ __html: inlineMarkdown(line) }} />
  })
  return <div className="min-h-full px-5 py-5">{blocks}</div>
}

function inlineMarkdown(text: string) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
}

export function NotesPanel() {
  const [data, setData] = useState<NotesData>({ notes: [], folders: [] })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [folderFilter, setFolderFilter] = useState<string | null>(null)
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [sort, setSort] = useState<SortMode>('updated')
  const [view, setView] = useState<ViewMode>('split')
  const [exportFormat, setExportFormat] = useState<NoteExportFormat>('md')
  const [exportScope, setExportScope] = useState<NoteExportScope>('current')
  const [exporting, setExporting] = useState(false)
  const [pickMode, setPickMode] = useState(false)
  const [pickedIds, setPickedIds] = useState<Set<string>>(() => new Set())
  const [status, setStatus] = useState<'loading' | 'saved' | 'saving' | 'offline'>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [newTag, setNewTag] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const saveTimer = useRef<number | null>(null)
  const hydrated = useRef(false)

  const loadNotes = useCallback(async () => {
    setStatus('loading')
    setLoadError(null)
    const result = await fetchNotes()
    if (result.ok) {
      setData(result.data)
      setSelectedId((prev) => prev ?? result.data.notes[0]?.id ?? null)
      setStatus('saved')
    } else {
      setLoadError('Notes unavailable - bridge may be offline')
      setStatus('offline')
    }
    hydrated.current = true
  }, [])

  useEffect(() => {
    void loadNotes()
  }, [loadNotes])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        createNote('blank')
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void persist()
      }
      if (event.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  const persist = useCallback(async () => {
    if (!hydrated.current) return
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    setStatus('saving')
    const result = await saveNotes(data)
    setStatus(result.ok ? 'saved' : 'offline')
  }, [data])

  useEffect(() => {
    if (!hydrated.current) return
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    setStatus('saving')
    saveTimer.current = window.setTimeout(() => void persist(), 700)
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [data, persist])

  function createNote(template: TemplateId) {
    const base = templates[template]
    const now = new Date().toISOString()
    const note: Note = {
      id: id(), title: base.title, body: base.body, bodyRight: '', folderId: folderFilter, tags: [],
      pinned: false, archived: false, color: 'brass', createdAt: now, updatedAt: now,
    }
    setData((current) => ({ ...current, notes: [note, ...current.notes] }))
    setSelectedId(note.id)
  }

  function updateNote(patch: Partial<Note>) {
    if (!selectedId) return
    setData((current) => ({
      ...current,
      notes: current.notes.map((note) => note.id === selectedId ? { ...note, ...patch, updatedAt: new Date().toISOString() } : note),
    }))
  }

  function deleteNote() {
    if (!selected) return
    if (!window.confirm(`Delete “${selected.title || 'Untitled note'}”?`)) return
    setData((current) => ({ ...current, notes: current.notes.filter((note) => note.id !== selected.id) }))
    setSelectedId(null)
  }

  function createFolder() {
    const name = window.prompt('Notebook name')
    if (!name?.trim()) return
    const folder: NoteFolder = { id: id(), name: name.trim(), createdAt: new Date().toISOString() }
    setData((current) => ({ ...current, folders: [...current.folders, folder] }))
    setFolderFilter(folder.id)
  }

  function renameFolder(folder: NoteFolder) {
    const name = window.prompt('Rename notebook', folder.name)
    if (!name?.trim()) return
    setData((current) => ({ ...current, folders: current.folders.map((item) => item.id === folder.id ? { ...item, name: name.trim() } : item) }))
  }

  function deleteFolder(folder: NoteFolder) {
    if (!window.confirm(`Delete notebook “${folder.name}”? Notes will remain unfiled.`)) return
    setData((current) => ({
      folders: current.folders.filter((item) => item.id !== folder.id),
      notes: current.notes.map((note) => note.folderId === folder.id ? { ...note, folderId: null, updatedAt: new Date().toISOString() } : note),
    }))
    if (folderFilter === folder.id) setFolderFilter(null)
  }

  function toggleChecklist(lineIndex: number) {
    if (!selected) return
    const body = selected.body.split('\n').map((line, index) =>
      index === lineIndex ? line.replace(/^- \[([ xX])\]/, (_full, value: string) => `- [${value.toLowerCase() === 'x' ? ' ' : 'x'}]`) : line,
    ).join('\n')
    updateNote({ body })
  }

  function addTag() {
    const tag = newTag.trim().replace(/^#/, '')
    if (!tag || !selected || selected.tags.some((item) => item.toLowerCase() === tag.toLowerCase())) return
    updateNote({ tags: [...selected.tags, tag] })
    setNewTag('')
  }

  function togglePicked(noteId: string) {
    setPickedIds((prev) => {
      const next = new Set(prev)
      if (next.has(noteId)) next.delete(noteId)
      else next.add(noteId)
      return next
    })
  }

  function pickAllVisible() {
    setPickedIds(new Set(visibleNotes.map((note) => note.id)))
  }

  function clearPicked() {
    setPickedIds(new Set())
  }

  function notesForExport(scope: NoteExportScope): Note[] {
    switch (scope) {
      case 'picked':
        return data.notes.filter((note) => pickedIds.has(note.id))
      case 'visible':
        return visibleNotes
      case 'all':
        return data.notes
      default:
        return selected ? [selected] : []
    }
  }

  async function exportNotes(scope: NoteExportScope = exportScope, format: NoteExportFormat = exportFormat) {
    const notes = notesForExport(scope)
    if (!notes.length || exporting) return
    setExporting(true)
    try {
      await exportNotesToFile(notes, format)
    } finally {
      setExporting(false)
    }
  }

  const selected = data.notes.find((note) => note.id === selectedId) || null
  const tags = useMemo(() => [...new Set(data.notes.flatMap((note) => note.tags))].sort((a, b) => a.localeCompare(b)), [data.notes])
  const visibleNotes = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return data.notes.filter((note) => {
      const searchable = `${note.title} ${note.body} ${note.bodyRight}`.toLowerCase()
      return (showArchived || !note.archived) &&
        (!folderFilter || note.folderId === folderFilter) &&
        (!tagFilter || note.tags.includes(tagFilter)) &&
        (!needle || searchable.includes(needle))
    }).sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      if (sort === 'title') return a.title.localeCompare(b.title)
      return new Date(b[sort === 'updated' ? 'updatedAt' : 'createdAt']).getTime() - new Date(a[sort === 'updated' ? 'updatedAt' : 'createdAt']).getTime()
    })
  }, [data.notes, folderFilter, query, showArchived, sort, tagFilter])
  const wordCount = selected
    ? `${selected.body} ${selected.bodyRight}`.trim().split(/\s+/).filter(Boolean).length
    : 0
  const pickedCount = pickedIds.size
  const exportScopeOptions: { id: NoteExportScope; label: string; disabled?: boolean }[] = [
    { id: 'current', label: 'Current note', disabled: !selected },
    { id: 'picked', label: pickedCount ? `Selected (${pickedCount})` : 'Selected', disabled: pickedCount === 0 },
    { id: 'visible', label: `Visible (${visibleNotes.length})`, disabled: visibleNotes.length === 0 },
    { id: 'all', label: `All notes (${data.notes.length})`, disabled: data.notes.length === 0 },
  ]

  if (status === 'loading' && !hydrated.current) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center rounded-2xl border border-lineStrong bg-panel p-6">
        <LoadingPanel title="Loading notes…" />
      </div>
    )
  }

  if (status === 'offline' && loadError) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-4 rounded-2xl border border-lineStrong bg-panel p-6">
        <BridgeOfflinePanel compact onRetry={() => void loadNotes()} />
        <ErrorRetryCallout
          title="Notes unavailable"
          body={loadError}
          onRetry={() => void loadNotes()}
        />
      </div>
    )
  }

  return <div className="notes-workspace grid h-full min-h-0 overflow-hidden rounded-2xl border border-lineStrong bg-panel shadow-panel">
    <aside className="flex min-h-0 min-w-0 flex-col border-r border-lineStrong bg-raised">
      <div className="border-b border-line p-3">
        <div className="mb-3 flex items-center justify-between">
          <div><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-brass">Field notes</p><p className="mt-1 text-xs text-fog">{data.notes.filter((note) => !note.archived).length} active records</p></div>
          <button type="button" onClick={createFolder} className="rounded-md border border-lineStrong px-2 py-1 font-mono text-xs text-mist hover:border-brass/40 hover:text-brass">+</button>
        </div>
        <button type="button" onClick={() => createNote('blank')} className="w-full rounded-lg border border-brass/40 bg-brassSoft px-3 py-2 font-mono text-xs text-brass transition hover:bg-brass/20">+ New note <span className="float-right text-brass/60">⌘N</span></button>
        <div className="mt-2 grid grid-cols-2 gap-1">
          {(['meeting', 'trade', 'research', 'blank'] as TemplateId[]).map((template) => <button key={template} type="button" onClick={() => createNote(template)} className="rounded-md border border-lineStrong bg-well px-2 py-1.5 text-left font-mono text-[10px] text-mist hover:bg-lift hover:text-snow">{templates[template].label}</button>)}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <button type="button" onClick={() => setFolderFilter(null)} className={`mb-1 flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs ${!folderFilter ? 'bg-lift text-snow' : 'text-mist hover:bg-raised'}`}>All notes <span className="font-mono text-[10px] text-fog">{data.notes.length}</span></button>
        <div className="mb-2 mt-4 flex items-center justify-between px-2 font-mono text-[10px] uppercase tracking-wider text-mist"><span>Notebooks</span><span>{data.folders.length}</span></div>
        {data.folders.map((folder) => <div key={folder.id} className={`group mb-1 flex items-center rounded-md ${folderFilter === folder.id ? 'bg-lift' : 'hover:bg-raised'}`}>
          <button type="button" onClick={() => setFolderFilter(folder.id)} className={`min-w-0 flex-1 truncate px-2 py-1.5 text-left text-xs ${folderFilter === folder.id ? 'text-snow' : 'text-mist'}`}>{folder.name}</button>
          <button type="button" onClick={() => renameFolder(folder)} className="hidden px-1.5 text-fog hover:text-snow group-hover:block" title="Rename notebook">·</button>
          <button type="button" onClick={() => deleteFolder(folder)} className="hidden px-1.5 text-fog hover:text-ember group-hover:block" title="Delete notebook">×</button>
        </div>)}
        <div className="mb-2 mt-5 font-mono text-[10px] uppercase tracking-wider text-mist">Tags</div>
        <div className="flex flex-wrap gap-1">{tags.map((tag) => <button key={tag} type="button" onClick={() => setTagFilter(tagFilter === tag ? null : tag)} className={`rounded px-1.5 py-1 font-mono text-[10px] ${tagFilter === tag ? 'bg-phosphorSoft text-phosphor' : 'bg-raised text-fog hover:text-mist'}`}>#{tag}</button>)}</div>
      </div>
      <button type="button" onClick={() => setShowArchived((value) => !value)} className={`border-t border-line px-3 py-2.5 text-left font-mono text-[10px] uppercase tracking-wider ${showArchived ? 'text-brass' : 'text-fog hover:text-mist'}`}>{showArchived ? '✓ Archive visible' : 'Show archive'}</button>
    </aside>

    <section className="flex min-h-0 min-w-0 flex-col border-r border-line bg-panel">
      <div className="border-b border-line p-3">
        <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search notes  /" className="w-full rounded-lg border border-lineStrong bg-well px-3 py-2 font-mono text-xs text-snow outline-none placeholder:text-fog focus:border-brass/50" />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-mist">{visibleNotes.length} shown</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as SortMode)} className="bg-transparent font-mono text-[10px] text-mist outline-none"><option value="updated">Updated</option><option value="created">Created</option><option value="title">Title</option></select>
          <button
            type="button"
            onClick={() => {
              setPickMode((value) => {
                const next = !value
                if (!next) clearPicked()
                else if (selectedId) setPickedIds(new Set([selectedId]))
                return next
              })
            }}
            className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${pickMode ? 'border-brass/40 bg-brass/15 text-brass' : 'border-lineStrong text-fog hover:text-mist'}`}
          >
            {pickMode ? 'Done' : 'Select'}
          </button>
          {pickMode ? (
            <>
              <button type="button" onClick={pickAllVisible} className="font-mono text-[10px] text-mist hover:text-snow">
                All visible
              </button>
              <button type="button" onClick={clearPicked} className="font-mono text-[10px] text-mist hover:text-snow">
                Clear
              </button>
            </>
          ) : null}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {visibleNotes.map((note) => (
          <div
            key={note.id}
            className={`mb-1 flex items-start gap-2 rounded-lg border p-3 transition ${selectedId === note.id ? 'border-brass/35 bg-lift shadow-card' : 'border-lineStrong bg-raised hover:bg-lift'}`}
          >
            {pickMode ? (
              <input
                type="checkbox"
                checked={pickedIds.has(note.id)}
                onChange={() => togglePicked(note.id)}
                className="mt-1 accent-brass"
                aria-label={`Select ${note.title || 'Untitled note'}`}
              />
            ) : null}
            <button
              type="button"
              onClick={() => setSelectedId(note.id)}
              className="min-w-0 flex-1 text-left"
            >
              <div className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 rounded-full ${colorClasses[note.color]}`} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-snow">
                  {note.pinned ? '★ ' : ''}
                  {note.title || 'Untitled note'}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-fog">
                {(note.body || note.bodyRight).replace(/[#*`[\]-]/g, '').trim() || 'No content yet'}
              </p>
              <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-fog">
                <span>{relativeTime(note.updatedAt)}</span>
                <span>{note.tags.slice(0, 2).map((tag) => `#${tag}`).join(' ')}</span>
              </div>
            </button>
          </div>
        ))}
        {!visibleNotes.length && <div className="p-5 text-center font-mono text-xs text-fog">No notes match this view.</div>}
      </div>
    </section>

    <section className="flex min-w-0 flex-1 flex-col bg-ink">
      {selected ? <><header className="border-b border-line px-5 py-3">
        <div className="flex items-center gap-2">
          <input value={selected.title} onChange={(event) => updateNote({ title: event.target.value })} className="min-w-0 flex-1 bg-transparent font-sans text-xl font-semibold tracking-tight text-snow outline-none placeholder:text-fog" placeholder="Untitled note" />
          <button type="button" onClick={() => updateNote({ pinned: !selected.pinned })} title={selected.pinned ? 'Unpin note' : 'Pin note'} className={`rounded-md px-2 py-1 text-sm ${selected.pinned ? 'text-brass' : 'text-fog hover:text-snow'}`}>★</button>
          <button type="button" onClick={() => updateNote({ archived: !selected.archived })} title={selected.archived ? 'Restore note' : 'Archive note'} className="rounded-md px-2 py-1 font-mono text-[10px] text-fog hover:text-snow">{selected.archived ? 'Restore' : 'Archive'}</button>
          <button type="button" onClick={deleteNote} className="rounded-md px-2 py-1 text-fog hover:text-ember" title="Delete note">×</button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select value={selected.folderId || ''} onChange={(event) => updateNote({ folderId: event.target.value || null })} className="rounded-md border border-line bg-raised px-2 py-1 font-mono text-[10px] text-mist outline-none"><option value="">Unfiled</option>{data.folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select>
          {(['brass', 'phosphor', 'ember', 'mist'] as NoteColor[]).map((color) => <button key={color} type="button" onClick={() => updateNote({ color })} className={`h-4 w-4 rounded-full ${colorClasses[color]} ${selected.color === color ? 'ring-2 ring-snow ring-offset-2 ring-offset-panel' : ''}`} title={`${color} label`} />)}
          <input value={selected.symbol || ''} onChange={(event) => updateNote({ symbol: event.target.value.toUpperCase() || undefined })} placeholder="Symbol" className="w-20 border-b border-line bg-transparent px-1 py-1 font-mono text-[10px] uppercase text-mist outline-none focus:border-brass" />
          {selected.tags.map((tag) => <button key={tag} type="button" onClick={() => updateNote({ tags: selected.tags.filter((item) => item !== tag) })} className="rounded bg-phosphorSoft px-1.5 py-1 font-mono text-[10px] text-phosphor">#{tag} ×</button>)}
          <input value={newTag} onChange={(event) => setNewTag(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addTag() } }} placeholder="+ tag" className="w-16 border-b border-line bg-transparent px-1 py-1 font-mono text-[10px] text-mist outline-none focus:border-brass" />
        </div>
      </header>
      <div className="flex items-center justify-between border-b border-line bg-panel px-5 py-2">
        <div className="flex rounded-md border border-line bg-ink p-0.5">{(['write', 'preview', 'split'] as ViewMode[]).map((mode) => <button key={mode} type="button" onClick={() => setView(mode)} className={`rounded px-2.5 py-1 font-mono text-[10px] uppercase ${view === mode ? 'bg-lift text-brass' : 'text-fog hover:text-mist'}`}>{mode}</button>)}</div>
        <div className="flex items-center gap-3 font-mono text-[10px] text-fog">
          <span>{wordCount} words · {Math.max(1, Math.ceil(wordCount / 220))} min read</span>
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              value={exportScope}
              onChange={(event) => setExportScope(event.target.value as NoteExportScope)}
              className="rounded border border-line bg-raised px-1.5 py-0.5 text-[10px] text-mist outline-none"
              aria-label="Export scope"
            >
              {exportScopeOptions.map((option) => (
                <option key={option.id} value={option.id} disabled={option.disabled}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={exportFormat}
              onChange={(event) => setExportFormat(event.target.value as NoteExportFormat)}
              className="rounded border border-line bg-raised px-1.5 py-0.5 text-[10px] text-mist outline-none"
              aria-label="Export format"
            >
              {exportFormats.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void exportNotes()}
              disabled={!notesForExport(exportScope).length || exporting}
              className="text-mist hover:text-brass disabled:opacity-40"
            >
              {exporting ? 'Exporting…' : 'Export'}
            </button>
          </div>
          <span className={status === 'offline' ? 'text-ember' : status === 'saving' ? 'text-brass' : 'text-phosphor'}>{status === 'saving' ? 'Saving…' : status === 'offline' ? 'Offline' : 'Saved'}</span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className={`grid h-full min-h-0 ${view === 'split' ? 'grid-cols-1 grid-rows-2 min-[640px]:grid-cols-2 min-[640px]:grid-rows-1' : 'grid-cols-1'}`}>
          {view === 'write' && (
            <textarea
              value={selected.body}
              onChange={(event) => updateNote({ body: event.target.value })}
              spellCheck
              className="h-full min-h-0 resize-none bg-transparent p-5 font-mono text-sm leading-7 text-snow outline-none placeholder:text-fog"
              placeholder="Write in Markdown…&#10;&#10;Use - [ ] for checklists."
            />
          )}
          {view === 'preview' && (
            <div className="h-full overflow-y-auto bg-panel">
              <MarkdownPreview body={selected.body} onToggle={toggleChecklist} />
              {selected.bodyRight.trim() && (
                <>
                  <div className="mx-5 border-t border-line" />
                  <MarkdownPreview body={selected.bodyRight} onToggle={() => {}} />
                </>
              )}
            </div>
          )}
          {view === 'split' && (
            <>
              <textarea
                value={selected.body}
                onChange={(event) => updateNote({ body: event.target.value })}
                spellCheck
                className="h-full min-h-0 min-w-0 resize-none border-r border-line bg-transparent p-5 font-mono text-sm leading-7 text-snow outline-none placeholder:text-fog"
                placeholder="Left pane…"
              />
              <textarea
                value={selected.bodyRight}
                onChange={(event) => updateNote({ bodyRight: event.target.value })}
                spellCheck
                className="h-full min-h-0 min-w-0 resize-none bg-transparent p-5 font-mono text-sm leading-7 text-snow outline-none placeholder:text-fog"
                placeholder="Right pane…"
              />
            </>
          )}
        </div>
      </div></> : <div className="m-auto max-w-sm p-8 text-center"><p className="font-sans text-xl font-semibold text-snow">A clear desk starts here.</p><p className="mt-2 text-sm leading-6 text-mist">Capture a trade thesis, research thread, or meeting decision in a local note.</p><button type="button" onClick={() => createNote('blank')} className="mt-5 rounded-lg border border-brass/40 bg-brassSoft px-4 py-2 font-mono text-xs text-brass">Create your first note</button></div>}
    </section>
  </div>
}
