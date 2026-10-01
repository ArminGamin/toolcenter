export type PublishedPostRow = {
  slug: string
  llmBackend?: string
  llmLabel: string
  published?: string
  publishedMs?: number
}

function labelClass(label: string): string {
  if (label === 'GEMINI') return 'text-violet-300'
  if (label === 'OLLAMA') return 'text-teal'
  if (label === 'COMPOSER') return 'text-fog'
  if (label === 'MOCK') return 'text-fog'
  return 'text-fog/60'
}

function publishedMs(row: PublishedPostRow): number {
  if (typeof row.publishedMs === 'number' && Number.isFinite(row.publishedMs)) {
    return row.publishedMs
  }
  const raw = String(row.published || '').trim()
  if (!raw) return 0
  const ms = Date.parse(raw)
  return Number.isFinite(ms) ? ms : 0
}

function formatPublished(value?: string): string {
  const raw = String(value || '').trim()
  if (!raw) return '-'
  const ms = Date.parse(raw)
  if (!Number.isFinite(ms)) return raw
  return new Date(ms).toLocaleDateString('lt-LT', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function sortPosts(rows: PublishedPostRow[]): PublishedPostRow[] {
  return [...rows].sort(
    (a, b) => publishedMs(b) - publishedMs(a) || a.slug.localeCompare(b.slug),
  )
}

export function PostsSection({
  postCount,
  slugs,
  publishedPosts,
  siteUrl = 'https://tavoknyga.com',
  localContent = false,
}: {
  postCount: number
  slugs: string[]
  publishedPosts?: PublishedPostRow[]
  siteUrl?: string
  localContent?: boolean
}) {
  const rows = sortPosts(
    publishedPosts?.length
      ? publishedPosts
      : slugs.map((slug) => ({ slug, llmLabel: '-' })),
  )

  return (
    <div>
      <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-fog">
        {localContent ? 'Saved articles' : 'Published'} · content/straipsniai ({postCount})
      </h2>
      <p className="mb-3 font-mono text-xs">
        <a
          href={`${siteUrl}/straipsniai/`}
          target="_blank"
          rel="noreferrer"
          className="text-teal underline-offset-2 hover:underline"
        >
          {siteUrl}/straipsniai/
        </a>
      </p>
      <ul className="space-y-1.5">
        {rows.map((row) => (
          <li key={row.slug} className="font-mono text-xs">
            <a
              className="text-teal underline-offset-2 hover:underline"
              href={`${siteUrl}/straipsniai/${row.slug}`}
              target="_blank"
              rel="noreferrer"
            >
              /straipsniai/{row.slug}
            </a>
            <span className="ml-2 text-fog/70">{formatPublished(row.published)}</span>
            <span className={`ml-2 ${labelClass(row.llmLabel)}`}>{row.llmLabel}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
