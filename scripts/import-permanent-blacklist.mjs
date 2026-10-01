import fs from 'node:fs'
import path from 'node:path'

const files = [
  'c:/Users/kajus/Downloads/emails-sent-1784583516270.csv',
  'c:/Users/kajus/Downloads/emails-sent-1784583487498.csv',
  'c:/Users/kajus/Downloads/emails-sent-1784583523351.csv',
]

function parseCsvLine(line) {
  const cols = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === ',') {
      cols.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  cols.push(cur)
  return cols
}

const badEvents = new Set(['bounced', 'complained', 'failed', 'suppressed'])
const collected = new Set()

for (const filePath of files) {
  const text = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase())
  const toIdx = header.indexOf('to')
  const eventIdx = header.indexOf('last_event')
  let n = 0
  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line)
    const to = (toIdx >= 0 ? cols[toIdx] : '').trim().toLowerCase()
    const event = (eventIdx >= 0 ? cols[eventIdx] : '').trim().toLowerCase()
    if (!to || !to.includes('@')) continue
    if (event && !badEvents.has(event)) continue
    collected.add(to)
    n++
  }
  console.log(path.basename(filePath), 'imported rows=', n)
}

const outDir = 'D:/toolsai/.control-center-data/outreach'
fs.mkdirSync(outDir, { recursive: true })
const outFile = path.join(outDir, 'permanent-blacklist.json')
let existing = []
if (fs.existsSync(outFile)) {
  try {
    const raw = JSON.parse(fs.readFileSync(outFile, 'utf8'))
    existing = raw.emails || []
  } catch {
    /* ignore */
  }
}
const before = new Set(existing.map((e) => String(e).toLowerCase()))
const sizeBefore = before.size
for (const e of collected) before.add(e)
const emails = [...before].sort()
fs.writeFileSync(
  outFile,
  JSON.stringify(
    {
      note: 'Permanent bounce/complaint blacklist. Not cleared by Clear DB, Reset sent/rejected, or scrape cache. Delete this file manually to wipe.',
      updatedAt: new Date().toISOString(),
      emails,
    },
    null,
    2,
  ),
)
console.log('added', emails.length - sizeBefore, 'total', emails.length)
console.log('file', outFile)
