import { useCallback, useEffect, useRef, useState } from 'react'
import { Field, inputCls } from '../ui/primitives'
import { mediaFetch, mediaJson } from '../../lib/media-embed'

type Profile = { id: string; name: string; folder_path: string; output_path: string; limit: number; strip_metadata: boolean }
type Store = { active_id: string | null; profiles: Profile[] }
type Picture = { index: number; name: string; size_mb: number }
type QueueItem = Picture & { state?: 'busy' | 'done' | 'fail'; out?: string }
type LogLine = { text: string; tone: 'ok' | 'err' | 'info' }
type StripEvent = { type: string; total?: number; file?: string; out?: string; message?: string; stripped_dir?: string }

const EMPTY: Omit<Profile, 'id'> = { name: 'New profile', folder_path: '', output_path: '', limit: 50, strip_metadata: true }

function newId() {
  return Math.random().toString(16).slice(2, 14).padEnd(12, '0')
}

const btn = 'min-h-11 rounded-lg border px-4 py-2 text-sm font-semibold transition disabled:opacity-50'
const ghost = `${btn} border-lineStrong bg-raised text-snow hover:bg-lift`

/** In-app panel for Picture Metadata Stripper (backend: D:\picture stripper metadata\server.py). */
export function PictureStripperPanel() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [form, setForm] = useState<Profile | null>(null)
  const [hint, setHint] = useState<{ text: string; tone: 'ok' | 'err' } | null>(null)
  const [outDir, setOutDir] = useState('')
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [totalFound, setTotalFound] = useState<number | null>(null)
  const [log, setLog] = useState<LogLine[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const jobRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const logRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const box = logRef.current
    if (box) box.scrollTop = box.scrollHeight
  }, [log])
  const saveTimer = useRef<number | null>(null)

  const addLog = (text: string, tone: LogLine['tone'] = 'info') =>
    setLog((prev) => [...prev.slice(-199), { text: `${new Date().toLocaleTimeString()}  ${text}`, tone }])

  useEffect(() => {
    let alive = true
    let timer: number | undefined
    // The Python backend may still be starting on first open: retry until it answers.
    const load = async (attempt: number) => {
      try {
        const store = await mediaJson<Store>(await mediaFetch('pictures', 'profiles'))
        const defaults = await mediaJson<{ stripped_dir: string }>(await mediaFetch('pictures', 'defaults'))
        if (!alive) return
        setProfiles(store.profiles)
        setOutDir(defaults.stripped_dir)
        const active = store.profiles.find((p) => p.id === store.active_id) || store.profiles[0] || null
        if (active) {
          setForm({ ...EMPTY, ...active, output_path: active.output_path || '', strip_metadata: active.strip_metadata !== false })
          setHint({ text: `Loaded “${active.name}” · autosave on`, tone: 'ok' })
        }
      } catch (err) {
        if (!alive) return
        if (attempt < 15) timer = window.setTimeout(() => void load(attempt + 1), 2000)
        else setHint({ text: err instanceof Error ? err.message : String(err), tone: 'err' })
      }
    }
    void load(0)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [])

  const persist = useCallback(async (next: Profile) => {
    try {
      const data = await mediaJson<{ profile: Profile; profiles: Profile[] }>(
        await mediaFetch('pictures', 'profiles/autosave', { method: 'PUT', json: next }),
      )
      setProfiles(data.profiles)
      setHint({ text: `Saved · ${data.profile.name}`, tone: 'ok' })
    } catch (err) {
      setHint({ text: err instanceof Error ? err.message : String(err), tone: 'err' })
    }
  }, [])

  function patch(fields: Partial<Profile>) {
    setForm((prev) => {
      if (!prev) return prev
      const next = { ...prev, ...fields }
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(() => void persist(next), 400)
      return next
    })
  }

  async function switchProfile(id: string) {
    if (!form || id === form.id) return
    try {
      const data = await mediaJson<{ profile: Profile; profiles: Profile[] }>(
        await mediaFetch('pictures', 'profiles/active', { json: { id } }),
      )
      setProfiles(data.profiles)
      setForm({ ...EMPTY, ...data.profile, strip_metadata: data.profile.strip_metadata !== false })
      setQueue([])
      setTotalFound(null)
      setHint({ text: `Switched to “${data.profile.name}”`, tone: 'ok' })
    } catch (err) {
      setHint({ text: err instanceof Error ? err.message : String(err), tone: 'err' })
    }
  }

  async function newProfile() {
    const next: Profile = { id: newId(), ...EMPTY }
    setForm(next)
    setQueue([])
    setTotalFound(null)
    await persist(next)
  }

  async function deleteProfile() {
    if (!form || !window.confirm(`Delete profile “${form.name}”?`)) return
    try {
      const store = await mediaJson<Store>(await mediaFetch('pictures', `profiles/${form.id}`, { method: 'DELETE' }))
      setProfiles(store.profiles)
      const next = store.profiles.find((p) => p.id === store.active_id) || null
      setForm(next ? { ...EMPTY, ...next } : null)
      setHint({ text: next ? `Deleted. Switched to “${next.name}”.` : 'Deleted.', tone: 'ok' })
    } catch (err) {
      setHint({ text: err instanceof Error ? err.message : String(err), tone: 'err' })
    }
  }

  async function scan(folder = form?.folder_path || '') {
    if (!folder.trim()) {
      addLog('Set a folder path first.', 'err')
      return
    }
    try {
      const params = new URLSearchParams({ path: folder.trim(), limit: String(Math.max(1, form?.limit || 50)) })
      const data = await mediaJson<{ images: Picture[]; total_found: number; count: number }>(
        await mediaFetch('pictures', `images?${params}`),
      )
      setQueue(data.images)
      setTotalFound(data.total_found)
      setProgress(0)
      addLog(`Found ${data.total_found} picture(s) · queued ${data.count}`, 'ok')
    } catch (err) {
      setQueue([])
      setTotalFound(null)
      addLog(err instanceof Error ? err.message : String(err), 'err')
    }
  }

  async function browse(target: 'folder_path' | 'output_path' = 'folder_path') {
    try {
      const data = await mediaJson<{ path: string }>(await mediaFetch('pictures', 'browse-folder', { method: 'POST' }))
      patch({ [target]: data.path })
      if (target === 'folder_path') void scan(data.path)
    } catch (err) {
      addLog(err instanceof Error ? err.message : String(err), 'err')
    }
  }

  function handleEvent(ev: StripEvent, bump: () => void) {
    switch (ev.type) {
      case 'start':
        addLog(`${ev.total} picture(s) · output ${ev.stripped_dir}`)
        break
      case 'item_start':
        setQueue((q) => q.map((v) => (v.name === ev.file ? { ...v, state: 'busy' } : v)))
        break
      case 'item_done':
        setQueue((q) => q.map((v) => (v.name === ev.file ? { ...v, state: 'done', out: ev.out } : v)))
        addLog(`${ev.file} → ${ev.out}`, 'ok')
        bump()
        break
      case 'item_error':
        setQueue((q) => q.map((v) => (v.name === ev.file ? { ...v, state: 'fail' } : v)))
        addLog(`${ev.file}: ${ev.message}`, 'err')
        bump()
        break
      case 'stopped':
        addLog('Stopped by user.', 'err')
        break
      case 'complete':
        setProgress(100)
        addLog('All done.', 'ok')
        break
    }
  }

  async function run() {
    if (!form || busy || !queue.length) return
    await persist(form)
    const jobId = newId()
    jobRef.current = jobId
    const total = queue.length
    let done = 0
    setBusy(true)
    setProgress(0)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const res = await mediaFetch('pictures', 'strip', {
        signal: controller.signal,
        json: {
          folder_path: form.folder_path.trim(),
          output_path: form.output_path.trim(),
          limit: Math.max(1, form.limit || 50),
          strip_metadata: form.strip_metadata,
          job_id: jobId,
        },
      })
      if (!res.ok || !res.body) await mediaJson(res)
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { value, done: end } = await reader.read()
        if (end) break
        buffer += decoder.decode(value, { stream: true })
        const chunks = buffer.split('\n\n')
        buffer = chunks.pop() || ''
        for (const chunk of chunks) {
          const line = chunk.trim()
          if (!line.startsWith('data:')) continue
          handleEvent(JSON.parse(line.slice(5).trim()) as StripEvent, () => {
            done += 1
            setProgress(Math.round((done / total) * 100))
          })
        }
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        addLog(err instanceof Error ? err.message : String(err), 'err')
      }
    } finally {
      setBusy(false)
      jobRef.current = null
      abortRef.current = null
    }
  }

  async function stop() {
    if (jobRef.current) {
      await mediaFetch('pictures', 'stop', { json: { job_id: jobRef.current } }).catch(() => {})
    }
    abortRef.current?.abort()
  }

  if (!form) {
    return (
      <div className="rounded-2xl border border-lineStrong bg-panel p-6 text-sm text-mist">
        {hint?.text || 'Starting Picture Metadata Stripper…'}
      </div>
    )
  }

  const doneCount = queue.filter((q) => q.state === 'done').length

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-lineStrong bg-panel p-5 sm:p-6">
        <div className="grid items-end gap-4 min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <Field label="Profile">
            <select className={inputCls} value={form.id} onChange={(e) => void switchProfile(e.target.value)}>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
              {!profiles.some((p) => p.id === form.id) ? <option value={form.id}>{form.name}</option> : null}
            </select>
          </Field>
          <Field label="Profile name">
            <input className={inputCls} value={form.name} maxLength={80} onChange={(e) => patch({ name: e.target.value })} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={ghost} onClick={() => void newProfile()}>New</button>
            <button type="button" className={ghost} onClick={() => void persist(form)}>Save</button>
            <button type="button" className={`${btn} border-ember/35 bg-ember/10 text-ember hover:bg-ember/20`} onClick={() => void deleteProfile()}>Delete</button>
          </div>
        </div>
        {hint ? <p className={`mt-3 text-xs ${hint.tone === 'err' ? 'text-ember' : 'text-fog'}`}>{hint.text}</p> : null}
      </section>

      <div className="grid items-start gap-6 min-[1180px]:grid-cols-2">
        <section className="space-y-4 rounded-2xl border border-lineStrong bg-panel p-5 sm:p-6">
          <h2 className="text-sm font-semibold text-snow">Source</h2>
          <Field label="Folder path">
            <div className="flex gap-2">
              <input className={inputCls} value={form.folder_path} onChange={(e) => patch({ folder_path: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') void scan() }} placeholder="Pick a folder of pictures" />
              <button type="button" className={`${ghost} shrink-0`} onClick={() => void browse('folder_path')}>Browse</button>
            </div>
          </Field>
          <Field label="Output folder">
            <div className="flex gap-2">
              <input className={inputCls} value={form.output_path} onChange={(e) => patch({ output_path: e.target.value })}
                placeholder={outDir ? `Default: ${outDir}` : 'Default stripped folder'} />
              <button type="button" className={`${ghost} shrink-0`} onClick={() => void browse('output_path')}>Browse</button>
            </div>
          </Field>
          <Field label="Strip limit">
            <input className={inputCls} type="number" min={1} value={form.limit} onChange={(e) => patch({ limit: Math.max(1, Number(e.target.value) || 1) })} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-snow">
            <input type="checkbox" checked={form.strip_metadata} onChange={(e) => patch({ strip_metadata: e.target.checked })} />
            Strip metadata (off = copy files as-is)
          </label>
          <p className="text-xs text-fog">
            Removes EXIF, IPTC, XMP and GPS by rebuilding each image from its pixels. Clean files go to{' '}
            <span className="font-mono">{form.output_path.trim() || outDir}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={ghost} disabled={busy} onClick={() => void scan()}>Scan folder</button>
            <button type="button" disabled={busy || !queue.length} onClick={() => void run()}
              className={`${btn} border-phosphor/40 bg-phosphor/15 text-phosphor hover:bg-phosphor/25`}>
              Process
            </button>
            <button type="button" disabled={!busy} onClick={() => void stop()}
              className={`${btn} border-ember/35 bg-ember/10 text-ember hover:bg-ember/20`}>
              Stop
            </button>
          </div>
        </section>

        <section className="flex flex-col rounded-2xl border border-lineStrong bg-panel p-5 sm:p-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold text-snow">Queue</h2>
            <p className="text-xs text-fog">
              {totalFound === null ? 'No folder scanned' : `${doneCount} / ${queue.length} done · ${totalFound} in folder`}
            </p>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-well">
            <div className="h-full rounded-full bg-phosphor transition-all" style={{ width: `${progress}%` }} />
          </div>
          <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto">
            {queue.map((v) => (
              <li key={v.name} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm">
                <span className="min-w-0 truncate text-snow">{v.name}</span>
                <span className={`shrink-0 text-xs ${v.state === 'fail' ? 'text-ember' : v.state === 'done' ? 'text-phosphor' : v.state === 'busy' ? 'text-brass' : 'text-fog'}`}>
                  {v.state === 'busy' ? 'Stripping' : v.state === 'fail' ? 'Failed' : v.state === 'done' ? `→ ${v.out}` : `${v.size_mb} MB`}
                </span>
              </li>
            ))}
          </ul>
          <div ref={logRef} className="mt-3 h-64 space-y-1 overflow-y-auto overscroll-contain rounded-xl border border-line bg-well p-3 font-mono text-xs">
            {log.length === 0 ? <p className="text-fog">Activity appears here.</p> : null}
            {log.map((l, i) => (
              <p key={i} className={l.tone === 'err' ? 'text-ember' : l.tone === 'ok' ? 'text-phosphor' : 'text-mist'}>{l.text}</p>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
