import type { Note } from './notes'

export type NoteExportFormat =
  | 'md'
  | 'txt'
  | 'html'
  | 'json'
  | 'csv'
  | 'tsv'
  | 'yaml'
  | 'xml'
  | 'rtf'
  | 'pdf'

export type NoteExportScope = 'current' | 'picked' | 'visible' | 'all'

export const exportFormats: { id: NoteExportFormat; label: string; ext: string; mime: string }[] = [
  { id: 'md', label: 'Markdown (.md)', ext: 'md', mime: 'text/markdown;charset=utf-8' },
  { id: 'txt', label: 'Plain text (.txt)', ext: 'txt', mime: 'text/plain;charset=utf-8' },
  { id: 'html', label: 'HTML (.html)', ext: 'html', mime: 'text/html;charset=utf-8' },
  { id: 'pdf', label: 'PDF (.pdf)', ext: 'pdf', mime: 'application/pdf' },
  { id: 'json', label: 'JSON (.json)', ext: 'json', mime: 'application/json;charset=utf-8' },
  { id: 'csv', label: 'CSV (.csv)', ext: 'csv', mime: 'text/csv;charset=utf-8' },
  { id: 'tsv', label: 'TSV (.tsv)', ext: 'tsv', mime: 'text/tab-separated-values;charset=utf-8' },
  { id: 'yaml', label: 'YAML (.yaml)', ext: 'yaml', mime: 'text/yaml;charset=utf-8' },
  { id: 'xml', label: 'XML (.xml)', ext: 'xml', mime: 'application/xml;charset=utf-8' },
  { id: 'rtf', label: 'Rich text (.rtf)', ext: 'rtf', mime: 'application/rtf;charset=utf-8' },
]

const CSV_COLUMNS = [
  'id',
  'title',
  'body',
  'bodyRight',
  'tags',
  'folderId',
  'color',
  'pinned',
  'archived',
  'symbol',
  'createdAt',
  'updatedAt',
] as const

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (value) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[value] || value)
}

function inlineMarkdown(text: string) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
}

export function bodyToPlainText(body: string) {
  return body
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^- \[([ xX])\]\s+/gm, '- ')
    .replace(/^-\s+/gm, '• ')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1 ($2)')
}

function noteMarkdownExport(note: Note) {
  const left = note.body.trimEnd()
  const right = note.bodyRight.trim()
  if (!right) return left
  if (!left) return right
  return `${left}\n\n---\n\n${right}`
}

function notePlainTextExport(note: Note) {
  const left = bodyToPlainText(note.body).trim()
  const right = bodyToPlainText(note.bodyRight).trim()
  if (!right) return left
  if (!left) return right
  return `${left}\n\n---\n\n${right}`
}

function bodyToHtmlDocument(title: string, body: string) {
  const lines = body.split('\n').map((line) => {
    const checklist = line.match(/^- \[([ xX])\] (.*)$/)
    if (checklist) {
      const checked = checklist[1].toLowerCase() === 'x'
      return `<p><input type="checkbox"${checked ? ' checked disabled' : ' disabled'} /> ${inlineMarkdown(checklist[2])}</p>`
    }
    if (line.startsWith('### ')) return `<h3>${escapeHtml(line.slice(4))}</h3>`
    if (line.startsWith('## ')) return `<h2>${escapeHtml(line.slice(3))}</h2>`
    if (line.startsWith('# ')) return `<h1>${escapeHtml(line.slice(2))}</h1>`
    if (line.startsWith('- ')) return `<li>${inlineMarkdown(line.slice(2))}</li>`
    if (!line.trim()) return ''
    return `<p>${inlineMarkdown(line)}</p>`
  })
  const safeTitle = escapeHtml(title || 'Untitled note')
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
<style>
body{font-family:Georgia,serif;line-height:1.6;max-width:720px;margin:2rem auto;padding:0 1rem;color:#222;background:#fff}
code{background:#f4f4f4;padding:0.1em 0.35em;border-radius:3px;font-size:0.92em}
a{color:#2563eb}
h1,h2,h3{line-height:1.25}
</style>
</head>
<body>
<h1>${safeTitle}</h1>
${lines.join('\n')}
</body>
</html>`
}

function escapeDelimitedField(value: string, delimiter: string) {
  if (/["\n\r]/.test(value) || value.includes(delimiter)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function noteToDelimitedRow(note: Note, delimiter: string) {
  const values = [
    note.id,
    note.title || 'Untitled note',
    note.body,
    note.bodyRight,
    note.tags.join('; '),
    note.folderId || '',
    note.color,
    note.pinned ? 'true' : 'false',
    note.archived ? 'true' : 'false',
    note.symbol || '',
    note.createdAt,
    note.updatedAt,
  ]
  return values.map((value) => escapeDelimitedField(value, delimiter)).join(delimiter)
}

function notesToDelimited(notes: Note[], delimiter: string) {
  const header = CSV_COLUMNS.join(delimiter)
  const rows = notes.map((note) => noteToDelimitedRow(note, delimiter))
  return [header, ...rows].join('\n')
}

function yamlScalar(value: string) {
  if (!value) return '""'
  if (/[\n:"'#{}[\],&*!|>@`]/.test(value) || value.startsWith(' ') || value.endsWith(' ')) {
    return JSON.stringify(value)
  }
  return value
}

function noteToYaml(note: Note, listItem = false) {
  const indent = listItem ? '    ' : ''
  const tagIndent = listItem ? '      ' : '  '
  const lines = [
    ...(listItem ? [`  - id: ${yamlScalar(note.id)}`] : [`id: ${yamlScalar(note.id)}`]),
    `${indent}title: ${yamlScalar(note.title || 'Untitled note')}`,
    `${indent}body: |`,
    ...note.body.split('\n').map((line) => `${indent}  ${line}`),
    `${indent}bodyRight: |`,
    ...note.bodyRight.split('\n').map((line) => `${indent}  ${line}`),
    `${indent}tags: ${note.tags.length ? '' : '[]'}`,
    ...(note.tags.length ? note.tags.map((tag) => `${tagIndent}- ${yamlScalar(tag)}`) : []),
    `${indent}folderId: ${yamlScalar(note.folderId || '')}`,
    `${indent}color: ${yamlScalar(note.color)}`,
    `${indent}pinned: ${note.pinned}`,
    `${indent}archived: ${note.archived}`,
    `${indent}symbol: ${yamlScalar(note.symbol || '')}`,
    `${indent}createdAt: ${yamlScalar(note.createdAt)}`,
    `${indent}updatedAt: ${yamlScalar(note.updatedAt)}`,
  ]
  return lines.join('\n')
}

function notesToYaml(notes: Note[]) {
  if (notes.length === 1) return noteToYaml(notes[0])
  return [`exportedAt: ${yamlScalar(new Date().toISOString())}`, 'notes:', ...notes.map((note) => noteToYaml(note, true))].join('\n')
}

function escapeXml(text: string) {
  return text.replace(/[<>&'"]/g, (value) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[value] || value)
}

function noteToXml(note: Note) {
  return `<note id="${escapeXml(note.id)}">
  <title>${escapeXml(note.title || 'Untitled note')}</title>
  <body><![CDATA[${note.body}]]></body>
  <bodyRight><![CDATA[${note.bodyRight}]]></bodyRight>
  <tags>${note.tags.map((tag) => `<tag>${escapeXml(tag)}</tag>`).join('')}</tags>
  <folderId>${escapeXml(note.folderId || '')}</folderId>
  <color>${escapeXml(note.color)}</color>
  <pinned>${note.pinned}</pinned>
  <archived>${note.archived}</archived>
  <symbol>${escapeXml(note.symbol || '')}</symbol>
  <createdAt>${escapeXml(note.createdAt)}</createdAt>
  <updatedAt>${escapeXml(note.updatedAt)}</updatedAt>
</note>`
}

function notesToXml(notes: Note[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<notes exportedAt="${escapeXml(new Date().toISOString())}" count="${notes.length}">
${notes.map((note) => noteToXml(note)).join('\n')}
</notes>`
}

function escapeRtf(text: string) {
  return text.replace(/\\/g, '\\\\').replace(/{/g, '\\{').replace(/}/g, '\\}').replace(/\r?\n/g, '\\par ')
}

function noteToRtf(note: Note) {
  const title = escapeRtf(note.title || 'Untitled note')
  const left = escapeRtf(bodyToPlainText(note.body))
  const right = note.bodyRight.trim() ? escapeRtf(bodyToPlainText(note.bodyRight)) : ''
  return `{\\rtf1\\ansi\\deff0
{\\fonttbl{\\f0 Georgia;}}
\\f0\\fs32\\b ${title}\\b0\\par\\par
\\fs22 ${left}\\par
${right ? `\\par\\par\\fs24\\b Right pane\\b0\\par\\par\\fs22 ${right}\\par` : ''}
}`
}

function notesToRtf(notes: Note[]) {
  if (notes.length === 1) return noteToRtf(notes[0])
  const sections = notes
    .map((note) => {
      const title = escapeRtf(note.title || 'Untitled note')
      const body = escapeRtf(notePlainTextExport(note))
      return `\\fs32\\b ${title}\\b0\\par\\par\\fs22 ${body}\\par\\par\\line`
    })
    .join('\n')
  return `{\\rtf1\\ansi\\deff0
{\\fonttbl{\\f0 Georgia;}}
\\f0
${sections}
}`
}

export function noteExportFilename(title: string, ext: string) {
  return `${(title || 'note').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80)}.${ext}`
}

export function notesExportFilename(notes: Note[], ext: string) {
  if (notes.length === 1) return noteExportFilename(notes[0].title, ext)
  const stamp = new Date().toISOString().slice(0, 10)
  return `notes-export-${notes.length}-${stamp}.${ext}`
}

export type NoteExportPayload = {
  kind: 'text'
  content: string
  ext: string
  mime: string
} | {
  kind: 'pdf'
  ext: 'pdf'
  mime: 'application/pdf'
}

export function noteExportPayload(note: Note, format: NoteExportFormat): NoteExportPayload {
  switch (format) {
    case 'txt':
      return { kind: 'text', content: notePlainTextExport(note), ext: 'txt', mime: 'text/plain;charset=utf-8' }
    case 'html':
      return { kind: 'text', content: bodyToHtmlDocument(note.title, noteMarkdownExport(note)), ext: 'html', mime: 'text/html;charset=utf-8' }
    case 'json':
      return { kind: 'text', content: JSON.stringify(note, null, 2), ext: 'json', mime: 'application/json;charset=utf-8' }
    case 'csv':
      return { kind: 'text', content: notesToDelimited([note], ','), ext: 'csv', mime: 'text/csv;charset=utf-8' }
    case 'tsv':
      return { kind: 'text', content: notesToDelimited([note], '\t'), ext: 'tsv', mime: 'text/tab-separated-values;charset=utf-8' }
    case 'yaml':
      return { kind: 'text', content: notesToYaml([note]), ext: 'yaml', mime: 'text/yaml;charset=utf-8' }
    case 'xml':
      return { kind: 'text', content: notesToXml([note]), ext: 'xml', mime: 'application/xml;charset=utf-8' }
    case 'rtf':
      return { kind: 'text', content: notesToRtf([note]), ext: 'rtf', mime: 'application/rtf;charset=utf-8' }
    case 'pdf':
      return { kind: 'pdf', ext: 'pdf', mime: 'application/pdf' }
    default:
      return { kind: 'text', content: noteMarkdownExport(note), ext: 'md', mime: 'text/markdown;charset=utf-8' }
  }
}

export function notesExportPayload(notes: Note[], format: NoteExportFormat): NoteExportPayload {
  if (notes.length === 1) return noteExportPayload(notes[0], format)

  switch (format) {
    case 'json':
      return {
        kind: 'text',
        content: JSON.stringify({ exportedAt: new Date().toISOString(), notes }, null, 2),
        ext: 'json',
        mime: 'application/json;charset=utf-8',
      }
    case 'txt':
      return {
        kind: 'text',
        content: notes
          .map((note) => {
            const title = note.title || 'Untitled note'
            return `${title}\n${'='.repeat(Math.min(title.length, 40))}\n\n${notePlainTextExport(note)}`
          })
          .join('\n\n---\n\n'),
        ext: 'txt',
        mime: 'text/plain;charset=utf-8',
      }
    case 'html': {
      const sections = notes
        .map(
          (note) =>
            `<section style="margin-bottom:2.5rem;padding-bottom:2rem;border-bottom:1px solid #ddd">${bodyToHtmlDocument(note.title, noteMarkdownExport(note)).replace(/^[\s\S]*<body>\s*/i, '').replace(/\s*<\/body>[\s\S]*$/i, '')}</section>`,
        )
        .join('\n')
      return {
        kind: 'text',
        content: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Notes export (${notes.length})</title>
<style>
body{font-family:Georgia,serif;line-height:1.6;max-width:720px;margin:2rem auto;padding:0 1rem;color:#222}
code{background:#f4f4f4;padding:0.1em 0.35em;border-radius:3px}
a{color:#2563eb}
section:last-child{border-bottom:none}
</style>
</head>
<body>
${sections}
</body>
</html>`,
        ext: 'html',
        mime: 'text/html;charset=utf-8',
      }
    }
    case 'csv':
      return { kind: 'text', content: notesToDelimited(notes, ','), ext: 'csv', mime: 'text/csv;charset=utf-8' }
    case 'tsv':
      return { kind: 'text', content: notesToDelimited(notes, '\t'), ext: 'tsv', mime: 'text/tab-separated-values;charset=utf-8' }
    case 'yaml':
      return { kind: 'text', content: notesToYaml(notes), ext: 'yaml', mime: 'text/yaml;charset=utf-8' }
    case 'xml':
      return { kind: 'text', content: notesToXml(notes), ext: 'xml', mime: 'application/xml;charset=utf-8' }
    case 'rtf':
      return { kind: 'text', content: notesToRtf(notes), ext: 'rtf', mime: 'application/rtf;charset=utf-8' }
    case 'pdf':
      return { kind: 'pdf', ext: 'pdf', mime: 'application/pdf' }
    default:
      return {
        kind: 'text',
        content: notes
          .map((note) => `# ${note.title || 'Untitled note'}\n\n${noteMarkdownExport(note)}`.trim())
          .join('\n\n---\n\n'),
        ext: 'md',
        mime: 'text/markdown;charset=utf-8',
      }
  }
}

async function buildNotesPdfBlob(notes: Note[]) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const margin = 54
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const maxWidth = pageWidth - margin * 2
  let y = margin

  function ensureSpace(blockHeight: number) {
    if (y + blockHeight <= pageHeight - margin) return
    doc.addPage()
    y = margin
  }

  for (let index = 0; index < notes.length; index += 1) {
    const note = notes[index]
    if (index > 0) {
      doc.addPage()
      y = margin
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    const titleLines = doc.splitTextToSize(note.title || 'Untitled note', maxWidth) as string[]
    ensureSpace(titleLines.length * 22 + 12)
    doc.text(titleLines, margin, y)
    y += titleLines.length * 22 + 12

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    const bodyLines = doc.splitTextToSize(bodyToPlainText(note.body), maxWidth) as string[]
    for (const line of bodyLines) {
      ensureSpace(16)
      doc.text(line, margin, y)
      y += 16
    }

    if (note.bodyRight.trim()) {
      y += 12
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(13)
      ensureSpace(20)
      doc.text('Right pane', margin, y)
      y += 20
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(11)
      const rightLines = doc.splitTextToSize(bodyToPlainText(note.bodyRight), maxWidth) as string[]
      for (const line of rightLines) {
        ensureSpace(16)
        doc.text(line, margin, y)
        y += 16
      }
    }
  }

  return doc.output('blob')
}

function downloadBlobFile(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function downloadTextFile(filename: string, content: string, mime: string) {
  downloadBlobFile(filename, new Blob([content], { type: mime }))
}

export async function exportNotesToFile(notes: Note[], format: NoteExportFormat) {
  if (!notes.length) return
  const filename = notesExportFilename(notes, exportFormats.find((item) => item.id === format)?.ext || format)
  const payload = notesExportPayload(notes, format)
  if (payload.kind === 'pdf') {
    const blob = await buildNotesPdfBlob(notes)
    downloadBlobFile(filename, blob)
    return
  }
  downloadTextFile(filename, payload.content, payload.mime)
}
