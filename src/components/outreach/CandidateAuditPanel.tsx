import { useState } from 'react'
import {
  fetchOutreachCandidateAudit,
  type OutreachDiscoveryCandidate,
} from '../../lib/outreach'

export function CandidateAuditPanel({ count }: { count: number }) {
  const [rows, setRows] = useState<OutreachDiscoveryCandidate[]>([])
  const [total, setTotal] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = () => {
    if (loading) return
    setLoading(true)
    setError('')
    void fetchOutreachCandidateAudit().then((audit) => { setRows(audit.candidates); setTotal(audit.total) }).catch((err: Error) => setError(err.message)).finally(() => {
      setLoaded(true)
      setLoading(false)
    })
  }

  return (
    <details
      className="rounded-xl border border-lineStrong bg-panel"
      onToggle={(event) => {
        if (event.currentTarget.open && !loaded) load()
      }}
    >
      <summary className="cursor-pointer select-none px-4 py-2 font-mono text-[11px] text-mist">
        Candidate inspector · {loaded ? `${total} unique contacts` : `${count} reported by crawler`}
      </summary>
      <div className="border-t border-lineStrong p-3">
        <div className="mb-2 flex items-center justify-between text-[11px] text-fog">
          <span>{loading ? 'Loading…' : `${total} unique contacts · showing ${rows.length} · repeated page encounters grouped`}</span>
          <button type="button" className="text-brass hover:text-phosphor" onClick={load}>Refresh</button>
        </div>
        {error ? <p className="mb-2 text-xs text-ember" role="alert">{error}</p> : null}
        <div className="max-h-72 overflow-auto rounded-lg border border-lineStrong bg-well">
          {rows.map((row, index) => (
            <div key={`${row.email}-${row.sourceUrl}-${index}`} className="grid gap-1 border-b border-line px-3 py-2 text-[11px] last:border-b-0 sm:grid-cols-[90px_minmax(180px,1fr)_minmax(220px,1.4fr)]">
              <span className={row.status === 'qualified' ? 'text-phosphor' : row.status === 'rejected' ? 'text-ember' : 'text-fog'}>{row.status}</span>
              <div className="min-w-0">
                <div className="truncate text-mist">{row.name || row.email}</div>
                {row.name ? <div className="truncate font-mono text-fog">{row.email}</div> : null}
              </div>
              <div className="min-w-0">
                <div className="truncate text-fog">{row.reason}</div>
                {(row.encounters || 0) > 1 ? <div className="text-fog">Seen {row.encounters} times</div> : null}
                <a className="block truncate text-brass hover:text-phosphor" href={row.sourceUrl} target="_blank" rel="noreferrer">{row.sourceUrl}</a>
              </div>
            </div>
          ))}
          {!loading && loaded && rows.length === 0 ? <div className="px-3 py-4 text-[11px] text-fog">No recorded candidates yet.</div> : null}
        </div>
      </div>
    </details>
  )
}
