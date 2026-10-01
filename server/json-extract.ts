/**
 * Robust JSON extraction from LLM output (markdown fences, prose wrappers, brace balancing).
 */

function stripMarkdownFences(text: string): string {
  let trimmed = text.trim()
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence?.[1]?.trim()) return fence[1].trim()
  if (trimmed.startsWith('```')) {
    trimmed = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  }
  return trimmed
}

function repairJsonText(raw: string): string {
  let text = raw
    .replace(/^\uFEFF/, '')
    .replace(/\u201c|\u201d|\u201e|\u00ab|\u00bb/g, '"')
    .replace(/,\s*([}\]])/g, '$1')

  // Literal newlines / tabs inside JSON strings → spaces (invalid JSON otherwise)
  text = text.replace(/"([^"\\]|\\.)*"/gs, (m) =>
    m.replace(/[\r\n\t]+/g, ' '),
  )

  // Single-quoted keys/strings → double quotes (common LLM slip)
  text = text.replace(/'([^'\\]|\\.)*'/g, (m) => `"${m.slice(1, -1).replace(/"/g, '\\"')}"`)

  return text
}

function findBalancedBraceEnd(raw: string, start: number): number {
  if (raw[start] !== '{') return -1
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i]
    if (inString) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

function parseJsonObjectSlice(slice: string): unknown {
  for (const candidate of [slice, repairJsonText(slice)]) {
    try {
      return JSON.parse(candidate)
    } catch {
      /* try next */
    }
  }
  throw new Error('Invalid object slice')
}

function extractCompleteObjectsFromArray(raw: string, arrayStart: number): unknown[] {
  const out: unknown[] = []
  let i = arrayStart
  while (i < raw.length) {
    while (i < raw.length && /[\s,]/.test(raw[i]!)) i++
    if (i >= raw.length || raw[i] === ']') break
    if (raw[i] !== '{') break
    const objEnd = findBalancedBraceEnd(raw, i)
    if (objEnd < 0) break
    try {
      out.push(parseJsonObjectSlice(raw.slice(i, objEnd + 1)))
      i = objEnd + 1
    } catch {
      break
    }
  }
  return out
}

/** Pull fully closed slide objects from truncated LLM output. */
export function salvageSlidesJsonText(raw: string): { slides: unknown[] } | null {
  const m = raw.match(/"slides"\s*:\s*\[/i)
  if (!m || m.index === undefined) return null
  const slides = extractCompleteObjectsFromArray(raw, m.index + m[0].length)
  return slides.length ? { slides } : null
}

function dropIncompleteTrailingArrayItem(text: string): string {
  const m = text.match(/"slides"\s*:\s*\[/i)
  if (!m || m.index === undefined) return text
  const slides = extractCompleteObjectsFromArray(text, m.index + m[0].length)
  if (!slides.length) return text
  return text.slice(0, m.index) + `"slides":${JSON.stringify(slides)}}`
}

function closeTruncatedJson(raw: string): string {
  const trimmed = raw.trim()
  const salvaged = dropIncompleteTrailingArrayItem(trimmed)
  if (salvaged !== trimmed) return salvaged

  let text = repairJsonText(trimmed)
  if (!text.includes('{') && !text.includes('[')) return text

  let inString = false
  let escape = false
  const stack: Array<'{' | '['> = []

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') stack.push('{')
    else if (ch === '[') stack.push('[')
    else if (ch === '}' || ch === ']') stack.pop()
  }

  if (inString) text += '"'
  text = text.replace(/,\s*$/, '')
  while (stack.length) {
    const open = stack.pop()
    text += open === '[' ? ']' : '}'
  }
  return text
}

function tryParseJson(slice: string): unknown {
  const attempts = [slice, repairJsonText(slice), closeTruncatedJson(slice)]
  let lastErr: unknown
  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate)
    } catch (err) {
      lastErr = err
    }
  }
  const salvaged = salvageSlidesJsonText(slice)
  if (salvaged) return salvaged
  throw lastErr instanceof Error ? lastErr : new Error('Invalid JSON response')
}

function parseBalancedObject(raw: string, start: number): unknown {
  let depth = 0
  let inString = false
  let escape = false

  for (let i = start; i < raw.length; i++) {
    const ch = raw[i]
    if (inString) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        return tryParseJson(raw.slice(start, i + 1))
      }
    }
  }

  // Truncated mid-object — close braces and parse
  return tryParseJson(raw.slice(start))
}

function previewForError(raw: string): string {
  return raw.slice(0, 160).replace(/\s+/g, ' ').trim()
}

export function extractJsonObject(text: string): unknown {
  const input = String(text ?? '')
  const raw = stripMarkdownFences(input)
  if (!raw.trim()) {
    const preview = input.replace(/\s+/g, ' ').trim().slice(0, 200)
    throw new Error(
      `Invalid JSON response: empty (input length ${input.length}${preview ? `, preview: ${preview}` : ''})`,
    )
  }

  // Prefer first object; also try if response starts with array
  if (raw.trimStart().startsWith('{')) {
    try {
      return tryParseJson(raw.trim())
    } catch {
      /* fall through */
    }
  }

  if (raw.trimStart().startsWith('[')) {
    try {
      return tryParseJson(raw.trim())
    } catch {
      /* fall through */
    }
  }

  const start = raw.indexOf('{')
  if (start < 0) {
    const arrStart = raw.indexOf('[')
    if (arrStart >= 0) {
      try {
        return tryParseJson(closeTruncatedJson(raw.slice(arrStart)))
      } catch {
        /* fall through */
      }
    }
    throw new Error(`Invalid JSON response: ${previewForError(raw) || 'no object'}`)
  }

  try {
    return parseBalancedObject(raw, start)
  } catch {
    try {
      return tryParseJson(raw.slice(start))
    } catch {
      const salvaged = salvageSlidesJsonText(raw)
      if (salvaged) return salvaged
      throw new Error(`Invalid JSON response: ${previewForError(raw.slice(start))}`)
    }
  }
}

const SLIDE_ARRAY_KEYS = [
  'slides',
  'slide',
  'skaidrės',
  'skaidres',
  'Skaidrės',
  'items',
  'carousel',
  'pages',
  'frames',
  'cards',
  'story',
  'stories',
  'beats',
]

const ROLE_ORDER = ['hook', 'context', 'build', 'close', 'value', 'solution', 'cta'] as const

function looksLikeSlideRow(row: unknown): boolean {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return false
  const v = row as Record<string, unknown>
  return Boolean(v.text || v.body || v.title || v.role || v.cta)
}

function objectValuesAsSlides(obj: Record<string, unknown>): unknown[] | null {
  const keys = Object.keys(obj)
  if (!keys.length) return null

  // Numbered / slide_N keys → ordered rows
  const numbered = keys
    .map((k) => {
      const m = k.match(/^(?:slide[_-]?)?(\d+)$/i)
      return m ? { i: Number(m[1]), k } : null
    })
    .filter((x): x is { i: number; k: string } => Boolean(x))
    .sort((a, b) => a.i - b.i)
  if (numbered.length >= 2 && numbered.length === keys.length) {
    const rows = numbered.map(({ k }) => obj[k]).filter((row) => row != null)
    return rows.length ? rows : null
  }

  // Role-keyed object: { hook: {...}, context: {...}, close: {...} }
  const roleKeys = keys.filter((k) => ROLE_ORDER.includes(k.toLowerCase() as (typeof ROLE_ORDER)[number]))
  if (roleKeys.length >= 2) {
    const byRole = new Map(roleKeys.map((k) => [k.toLowerCase(), obj[k]]))
    const ordered: unknown[] = []
    for (const role of ROLE_ORDER) {
      const row = byRole.get(role)
      if (row == null) continue
      if (typeof row === 'string' || Array.isArray(row)) {
        ordered.push({ role, text: row })
      } else if (row && typeof row === 'object') {
        const r = row as Record<string, unknown>
        ordered.push({ role: r.role || role, ...r })
      }
    }
    if (ordered.length >= 2) return ordered
  }

  // Homogeneous object-of-slide-rows (any key order)
  const values = Object.values(obj)
  if (values.length >= 2 && values.every(looksLikeSlideRow)) return values

  return null
}

function normalizeSlideRows(rows: unknown[]): unknown[] | null {
  const out = rows
    .map((row) => {
      if (row == null) return null
      if (typeof row === 'string') {
        const text = row.trim()
        return text ? { text } : null
      }
      if (Array.isArray(row)) {
        const text = row.map((x) => String(x).trim()).filter(Boolean).join(' ')
        return text ? { text } : null
      }
      if (looksLikeSlideRow(row)) return row
      return flattenRoleKeyedRow(row as Record<string, unknown>)
    })
    .filter(Boolean)
  return out.length ? out : null
}

/** `{ "hook": { "title", "text" }, "productId": "…" }` → `{ role: "hook", title, text, productId }`. */
function flattenRoleKeyedRow(row: Record<string, unknown>): Record<string, unknown> | null {
  const roleKey = Object.keys(row).find((k) =>
    ROLE_ORDER.includes(k.toLowerCase() as (typeof ROLE_ORDER)[number]),
  )
  if (!roleKey) return null
  const inner = row[roleKey]
  if (!looksLikeSlideRow(inner)) return null
  const rest = Object.fromEntries(Object.entries(row).filter(([k]) => k !== roleKey))
  return { ...rest, ...(inner as Record<string, unknown>), role: roleKey.toLowerCase() }
}

function coerceSlideValue(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return normalizeSlideRows(value)
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    try {
      return coerceSlidesArray(extractJsonObject(trimmed))
    } catch {
      return trimmed.length > 8 ? [{ text: trimmed }] : null
    }
  }
  if (value && typeof value === 'object') {
    if (looksLikeSlideRow(value)) return [value]
    return objectValuesAsSlides(value as Record<string, unknown>)
  }
  return null
}

function findSlidesKey(v: Record<string, unknown>): unknown {
  if ('slides' in v) return v.slides
  const lower = new Map(Object.keys(v).map((k) => [k.toLowerCase(), v[k]]))
  for (const key of SLIDE_ARRAY_KEYS) {
    if (lower.has(key.toLowerCase())) return lower.get(key.toLowerCase())
  }
  return undefined
}

/** Normalize common LLM JSON shapes into a slides array. */
export function coerceSlidesArray(data: unknown): unknown[] | null {
  if (Array.isArray(data)) return normalizeSlideRows(data)
  if (!data || typeof data !== 'object') return null
  const v = data as Record<string, unknown>

  const direct = findSlidesKey(v)
  if (direct !== undefined) {
    const coerced = coerceSlideValue(direct)
    if (coerced?.length) return coerced
  }

  const slide = v.slide
  if (slide && typeof slide === 'object' && !Array.isArray(slide) && looksLikeSlideRow(slide)) {
    return [slide]
  }

  if (looksLikeSlideRow(v)) return [v]

  const roleKeyed = objectValuesAsSlides(v)
  if (roleKeyed?.length) return roleKeyed

  for (const key of ['data', 'result', 'output', 'response', 'content', 'json', 'payload']) {
    const nested = v[key]
    if (nested && typeof nested === 'object') {
      const inner = coerceSlidesArray(nested)
      if (inner) return inner
    } else if (typeof nested === 'string' && nested.trim().startsWith('{')) {
      try {
        const inner = coerceSlidesArray(extractJsonObject(nested))
        if (inner) return inner
      } catch {
        /* ignore */
      }
    }
  }

  return null
}
