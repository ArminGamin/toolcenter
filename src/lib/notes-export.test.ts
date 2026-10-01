import { describe, expect, it } from 'vitest'
import type { Note } from './notes'
import { notesExportPayload } from './notes-export'

const sampleNote: Note = {
  id: 'note-1',
  title: 'Sample, note',
  body: '# Hello\n\n- [ ] Task one\n**bold**',
  bodyRight: 'Right pane notes',
  folderId: 'folder-1',
  tags: ['alpha', 'beta'],
  pinned: true,
  archived: false,
  color: 'brass',
  symbol: 'AAPL',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
}

describe('notesExportPayload', () => {
  it('exports CSV with escaped fields', () => {
    const payload = notesExportPayload([sampleNote], 'csv')
    expect(payload.kind).toBe('text')
    if (payload.kind !== 'text') return
    expect(payload.ext).toBe('csv')
    expect(payload.content).toContain('"Sample, note"')
    expect(payload.content).toContain('id,title,body,bodyRight,tags')
    expect(payload.content).toContain('alpha; beta')
  })

  it('exports TSV with tab delimiters', () => {
    const payload = notesExportPayload([sampleNote], 'tsv')
    expect(payload.kind).toBe('text')
    if (payload.kind !== 'text') return
    expect(payload.ext).toBe('tsv')
    expect(payload.content.split('\n')[0]).toBe('id\ttitle\tbody\tbodyRight\ttags\tfolderId\tcolor\tpinned\tarchived\tsymbol\tcreatedAt\tupdatedAt')
  })

  it('exports YAML with multiline body', () => {
    const payload = notesExportPayload([sampleNote], 'yaml')
    expect(payload.kind).toBe('text')
    if (payload.kind !== 'text') return
    expect(payload.content).toContain('body: |')
    expect(payload.content).toContain('  - alpha')
  })

  it('exports XML with CDATA body', () => {
    const payload = notesExportPayload([sampleNote], 'xml')
    expect(payload.kind).toBe('text')
    if (payload.kind !== 'text') return
    expect(payload.content).toContain('<![CDATA[# Hello')
    expect(payload.content).toContain('<tag>alpha</tag>')
  })

  it('exports RTF with escaped braces', () => {
    const payload = notesExportPayload(
      [{ ...sampleNote, body: 'Braces {test}' }],
      'rtf',
    )
    expect(payload.kind).toBe('text')
    if (payload.kind !== 'text') return
    expect(payload.content).toContain('\\{test\\}')
  })

  it('marks PDF exports as binary payload', () => {
    const payload = notesExportPayload([sampleNote], 'pdf')
    expect(payload.kind).toBe('pdf')
    expect(payload.ext).toBe('pdf')
  })
})
