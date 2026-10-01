export type UnifiedSearchKind =
  | 'note'
  | 'contact'
  | 'lead'
  | 'draft'
  | 'run'
  | 'error'
  | 'file'
  | 'campaign'

export type UnifiedSearchHit = {
  id: string
  kind: UnifiedSearchKind
  title: string
  subtitle: string
  module: string
  href?: string
}

export const SEARCH_KIND_LABELS: Record<UnifiedSearchKind, string> = {
  note: 'Note',
  contact: 'Customer',
  lead: 'Lead',
  draft: 'Blog draft',
  run: 'Run',
  error: 'Error',
  file: 'File',
  campaign: 'Campaign',
}

export async function fetchUnifiedSearch(
  q: string,
  limit = 24,
): Promise<{ ok: boolean; hits: UnifiedSearchHit[] }> {
  const query = q.trim()
  if (query.length < 2) return { ok: true, hits: [] }
  try {
    const res = await fetch(
      `/api/search?q=${encodeURIComponent(query)}&limit=${encodeURIComponent(String(limit))}`,
    )
    const data = (await res.json()) as { ok?: boolean; hits?: UnifiedSearchHit[] }
    return { ok: Boolean(data.ok), hits: data.hits || [] }
  } catch {
    return { ok: false, hits: [] }
  }
}
