import fs from 'node:fs'
import { currentProfileDataDir, profileDataPath } from './business-profiles.js'

export type Note = {
  id: string
  title: string
  body: string
  bodyRight: string
  folderId: string | null
  tags: string[]
  pinned: boolean
  archived: boolean
  color: string
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

const notesFile = () => profileDataPath('notes.json')

function emptyNotes(): NotesData {
  return { notes: [], folders: [] }
}

function normalizeNotes(raw: Partial<NotesData>): NotesData {
  const notes = Array.isArray(raw.notes)
    ? raw.notes.flatMap((note): Note[] => {
        if (!note || typeof note !== 'object' || typeof note.id !== 'string') return []
        const value = note as Partial<Note>
        const id = String(note.id)
        return [{
          id,
          title: typeof value.title === 'string' ? value.title.slice(0, 240) : 'Untitled note',
          body: typeof value.body === 'string' ? value.body : '',
          bodyRight: typeof value.bodyRight === 'string' ? value.bodyRight : '',
          folderId: typeof value.folderId === 'string' ? value.folderId : null,
          tags: Array.isArray(value.tags)
            ? value.tags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.slice(0, 40)).slice(0, 20)
            : [],
          pinned: Boolean(value.pinned),
          archived: Boolean(value.archived),
          color: typeof value.color === 'string' ? value.color.slice(0, 32) : 'brass',
          ...(typeof value.symbol === 'string' && value.symbol.trim() ? { symbol: value.symbol.slice(0, 20) } : {}),
          createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString(),
          updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
        }]
      })
    : []
  const folders = Array.isArray(raw.folders)
    ? raw.folders.flatMap((folder): NoteFolder[] => {
        if (!folder || typeof folder !== 'object' || typeof folder.id !== 'string') return []
        const value = folder as Partial<NoteFolder>
        const id = String(folder.id)
        return [{
          id,
          name: typeof value.name === 'string' ? value.name.slice(0, 80) : 'Untitled folder',
          createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString(),
        }]
      })
    : []
  return { notes, folders }
}

export function getNotes(): NotesData {
  fs.mkdirSync(currentProfileDataDir(), { recursive: true })
  if (!fs.existsSync(notesFile())) return emptyNotes()
  try {
    return normalizeNotes(JSON.parse(fs.readFileSync(notesFile(), 'utf8')) as Partial<NotesData>)
  } catch {
    return emptyNotes()
  }
}

export function saveNotes(data: Partial<NotesData>): { ok: boolean; message: string; data: NotesData } {
  const next = normalizeNotes(data)
  fs.mkdirSync(currentProfileDataDir(), { recursive: true })
  fs.writeFileSync(notesFile(), JSON.stringify(next, null, 2), 'utf8')
  return { ok: true, message: 'Notes saved', data: next }
}
