import { useCallback, useEffect, useState } from 'react'
import { mediaFetch, mediaJson } from '../../lib/media-embed'

type Row = { name: string; size: number; status: string; progress: number; output: string; error: string }
type Snapshot = { running: boolean; message: string; source: string; destination: string; rows: Row[] }

const STATUS_LABEL: Record<string, string> = {
  ready: 'Ready',
  processing: 'Stripping',
  verifying: 'Verifying',
  done: 'Verified',
  error: 'Needs attention',
  cancelled: 'Cancelled',
}

function formatSize(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

function tail(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() || path
}

/** In-app panel for the promo-vids metadata stripper (backend: metadata-stripper/stripper.py). */
export function StripperPanel({ active = true }: { active?: boolean }) {
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setSnap(await mediaJson<Snapshot>(await mediaFetch('stripper', 'status')))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    if (!active) return
    void load()
    const id = window.setInterval(() => void load(), snap?.running ? 1000 : 5000)
    return () => window.clearInterval(id)
  }, [active, load, snap?.running])

  async function act(path: 'start' | 'stop' | 'refresh' | 'open-output') {
    setBusy(true)
    try {
      setSnap(await mediaJson<Snapshot>(await mediaFetch('stripper', path, { method: 'POST' })))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const rows = snap?.rows ?? []
  const verified = rows.filter((r) => r.status === 'done').length
  const pending = rows.filter((r) => r.status !== 'done').length
  const problems = rows.filter((r) => r.status === 'error')
  const running = Boolean(snap?.running)

  return (
    <div className="space-y-6">
      <section className="grid gap-4 rounded-2xl border border-lineStrong bg-panel p-5 sm:p-6 min-[900px]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] min-[900px]:items-center">
        <div className="min-w-0">
          <p className="text-xs text-fog">Read from · originals kept</p>
          <p className="mt-1 text-lg font-semibold text-snow">{snap ? tail(snap.source) : '…'}</p>
          <p className="truncate font-mono text-xs text-mist">{snap?.source}</p>
        </div>
        <span className="text-xl text-phosphor max-[899px]:hidden" aria-hidden>→</span>
        <div className="min-w-0">
          <p className="text-xs text-fog">Write to · verified copies</p>
          <p className="mt-1 text-lg font-semibold text-phosphor">{snap ? tail(snap.destination) : '…'}</p>
          <p className="truncate font-mono text-xs text-mist">{snap?.destination}</p>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        {running ? (
          <button type="button" disabled={busy} onClick={() => void act('stop')}
            className="min-h-11 rounded-lg border border-ember/40 bg-ember/10 px-5 py-2 text-sm font-semibold text-ember hover:bg-ember/20 disabled:opacity-50">
            Stop
          </button>
        ) : (
          <button type="button" disabled={busy || pending === 0} onClick={() => void act('start')}
            className="min-h-11 rounded-lg border border-phosphor/40 bg-phosphor/15 px-5 py-2 text-sm font-semibold text-phosphor hover:bg-phosphor/25 disabled:opacity-50">
            {pending ? `Strip ${pending} video${pending === 1 ? '' : 's'}` : 'Nothing to strip'}
          </button>
        )}
        <button type="button" disabled={busy || running} onClick={() => void act('refresh')}
          className="min-h-11 rounded-lg border border-lineStrong bg-raised px-5 py-2 text-sm font-semibold text-snow hover:bg-lift disabled:opacity-50">
          Refresh folder
        </button>
        <button type="button" disabled={busy} onClick={() => void act('open-output')}
          className="min-h-11 rounded-lg border border-lineStrong bg-raised px-5 py-2 text-sm font-semibold text-snow hover:bg-lift disabled:opacity-50 min-[640px]:ml-auto">
          Open {snap ? tail(snap.destination) : 'output'}
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={`text-sm ${(error && snap) || problems.length ? 'text-ember' : 'text-mist'}`}>
          {(snap ? error : null) || (problems.length ? `${problems.length} video(s) need attention.` : snap?.message || 'Starting the stripper…')}
        </p>
        <p className="text-sm font-semibold text-snow">{verified} / {rows.length} verified</p>
      </div>

      <section className="rounded-2xl border border-lineStrong bg-panel">
        {rows.length === 0 ? (
          <p className="p-6 text-sm text-fog">No videos in the folder. Add videos, then refresh.</p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.name} className="space-y-2 px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="min-w-0 truncate font-medium text-snow">{r.name}</span>
                  <span className="flex items-center gap-3 text-xs">
                    <span className="text-fog">{formatSize(r.size)}</span>
                    {r.output ? <span className="font-mono text-mist">→ {r.output}</span> : null}
                    <span className={
                      r.status === 'done' ? 'font-semibold text-phosphor'
                        : r.status === 'error' ? 'font-semibold text-ember'
                          : r.status === 'ready' ? 'text-mist' : 'font-semibold text-brass'
                    }>
                      {STATUS_LABEL[r.status] || r.status}
                    </span>
                  </span>
                </div>
                {r.status === 'processing' || r.status === 'verifying' ? (
                  <div className="h-1.5 overflow-hidden rounded-full bg-well">
                    <div className="h-full rounded-full bg-brass transition-all" style={{ width: `${r.progress}%` }} />
                  </div>
                ) : null}
                {r.error ? <p className="text-xs text-ember">{r.error}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="rounded-2xl border border-lineStrong bg-panel px-5 py-4">
        <summary className="cursor-pointer text-sm font-semibold text-snow">What gets removed?</summary>
        <p className="mt-3 text-sm text-mist">
          Container tags, chapters, extra tracks, colour-profile side data and H.264 SEI payloads. Each video is
          re-encoded to a fresh MP4 with a neutral name (video_001.mp4…), then every frame is decoded to verify it.
          Originals are never changed. Everything stays on this computer.
        </p>
      </details>
    </div>
  )
}
