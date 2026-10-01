export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i
const EMAIL_IN_LINE_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i

/** Pull a single email out of a messy paste line (list numbers, mailto, angle brackets). */
function extractEmailFromLine(raw: string): string | null {
  let line = String(raw || '').trim()
  if (!line || line.startsWith('#')) return null

  if (/^mailto:/i.test(line)) {
    line = line.replace(/^mailto:/i, '').trim()
  }

  line = line.replace(/^\d+[).:-]\s+/, '').replace(/^[-*•]\s+/, '').trim()

  const angle = line.match(/<([^<>]*@[^<>]+)>/)
  if (angle) line = angle[1].trim()

  if (/%[0-9a-f]{2}/i.test(line)) {
    try {
      line = decodeURIComponent(line)
    } catch {
      /* keep as-is */
    }
  }

  const found = line.match(EMAIL_IN_LINE_RE)
  if (found) line = found[0]

  line = line.toLowerCase().replace(/^[<"']+/, '').replace(/[>"',;]+$/, '').trim()
  if (!EMAIL_RE.test(line)) return null
  return line
}

export function parseEmailList(text: string): { emails: string[]; skipped: string[] } {
  const emails: string[] = []
  const seen = new Set<string>()
  const skipped: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const trimmed = raw.trim()
    if (!trimmed) continue
    const email = extractEmailFromLine(trimmed)
    if (!email) {
      skipped.push(trimmed)
      continue
    }
    if (seen.has(email)) continue
    seen.add(email)
    emails.push(email)
  }
  return { emails, skipped }
}
