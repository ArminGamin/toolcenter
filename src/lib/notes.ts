export type NoteColor = 'brass' | 'phosphor' | 'ember' | 'mist'

export type Note = {
  id: string
  title: string
  body: string
  bodyRight: string
  folderId: string | null
  tags: string[]
  pinned: boolean
  archived: boolean
  color: NoteColor
  symbol?: string
  createdAt: string
  updatedAt: string
}

export type NoteFolder = {
  id: string
  name: string
  createdAt: string
}

export type NotesData = {
  notes: Note[]
  folders: NoteFolder[]
}

function authHeaders(extra?: HeadersInit): HeadersInit {
  const token =
    typeof window !== 'undefined'
      ? (window as unknown as { __CC_AUTH__?: string }).__CC_AUTH__
      : undefined
  return { ...(extra || {}), ...(token ? { 'X-CC-Token': token } : {}) }
}

export async function fetchNotes(): Promise<{ ok: boolean; data: NotesData }> {
  try {
    const res = await fetch('/api/notes')
    return (await res.json()) as { ok: boolean; data: NotesData }
  } catch {
    return { ok: false, data: { notes: [], folders: [] } }
  }
}

export async function saveNotes(data: NotesData): Promise<{ ok: boolean; message?: string; data?: NotesData }> {
  try {
    const res = await fetch('/api/notes', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data),
    })
    return (await res.json()) as { ok: boolean; message?: string; data?: NotesData }
  } catch {
    return { ok: false, message: 'Notes bridge offline' }
  }
}
