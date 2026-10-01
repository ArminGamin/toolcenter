import { useCallback, useEffect, useRef, useState } from 'react'
import { SecretInput } from '../SecretInput'
import { Field, inputCls } from '../ui/primitives'
import { mediaFetch, mediaJson } from '../../lib/media-embed'

type Profile = {
  id: string
  name: string
  bot_token: string
  category_id: string
  guild_id: string
  folder_path: string
  description: string
  start_index: number
  limit: number
  strip_metadata: boolean
}
type Store = { active_id: string | null; profiles: Profile[] }
type Video = { index: number; name: string; size_mb: number; too_large: boolean }
type QueueItem = Video & { state?: 'busy' | 'fail' }
type LogLine = { text: string; tone: 'ok' | 'err' | 'info' }
type DropEvent = {
  type: string
  total?: number
  guild_id?: string
  strip_metadata?: boolean
  file?: string
  channel?: string
  size_mb?: number
  message?: string
}

const EMPTY: Omit<Profile, 'id'> = {
  name: 'New profile',
  bot_token: '',
  category_id: '',
  guild_id: '',
  folder_path: '',
  description: '',
  start_index: 1,
  limit: 10,
  strip_metadata: true,
}

function newId() {
  return Math.random().toString(16).slice(2, 14).padEnd(12, '0')
}

const btn = 'min-h-11 rounded-lg border px-4 py-2 text-sm font-semibold transition disabled:opacity-50'
const ghost = `${btn} border-lineStrong bg-raised text-snow hover:bg-lift`

/** In-app panel for Discord Video Drop (backend: ripper/discord-uploader/server.py). */
export function DiscordDropPanel() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [form, setForm] = useState<Profile | null>(null)
  const [hint, setHint] = useState<{ text: string; tone: 'ok' | 'err' | 'info' } | null>(null)
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
        const store = await mediaJson<Store>(await mediaFetch('discord', 'profiles'))
        if (!alive) return
        setProfiles(store.profiles)
        const active = store.profiles.find((p) => p.id === store.active_id) || store.profiles[0] || null
        if (active) {
          setForm({ ...EMPTY, ...active, strip_metadata: active.strip_metadata !== false })
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
        await mediaFetch('discord', 'profiles/autosave', { method: 'PUT', json: next }),
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
        await mediaFetch('discord', 'profiles/active', { json: { id } }),
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
      const store = await mediaJson<Store>(await mediaFetch('discord', `profiles/${form.id}`, { method: 'DELETE' }))
      setProfiles(store.profiles)
      const next = store.profiles.find((p) => p.id === store.active_id) || null
      setForm(next ? { ...EMPTY, ...next } : null)
      setHint({ text: next ? `Deleted. Switched to “${next.name}”.` : 'Deleted.', tone: 'ok' })
    } catch (err) {
      setHint({ text: err instanceof Error ? err.message : String(err), tone: 'err' })
    }
  }

  async function browse() {
    try {
      const data = await mediaJson<{ path: string }>(await mediaFetch('discord', 'browse-folder', { method: 'POST' }))
      patch({ folder_path: data.path })
      void scan(data.path)
    } catch (err) {
      addLog(err instanceof Error ? err.message : String(err), 'err')
    }
  }

  async function scan(folder = form?.folder_path || '') {
    if (!folder.trim()) {
      addLog('Set a folder path first.', 'err')
      return
    }
    try {
      const params = new URLSearchParams({ path: folder.trim(), limit: String(Math.max(1, form?.limit || 10)) })
      const data = await mediaJson<{ videos: Video[]; total_found: number; count: number }>(
        await mediaFetch('discord', `videos?${params}`),
      )
      setQueue(data.videos)
      setTotalFound(data.total_found)
      addLog(`Found ${data.total_found} video(s) · queued ${data.count}`, 'ok')
    } catch (err) {
      setQueue([])
      setTotalFound(null)
      addLog(err instanceof Error ? err.message : String(err), 'err')
    }
  }

  async function resolveCategory() {
    if (!form?.bot_token || !form.category_id) {
      setHint({ text: 'Bot token and category ID are required.', tone: 'err' })
      return
    }
    try {
      const params = new URLSearchParams({ bot_token: form.bot_token, category_id: form.category_id })
      const data = await mediaJson<{ guild_id: string; name: string }>(
        await mediaFetch('discord', `resolve-category?${params}`),
      )
      patch({ guild_id: data.guild_id })
      setHint({ text: `Category “${data.name}” in guild ${data.guild_id}`, tone: 'ok' })
    } catch (err) {
      setHint({ text: err instanceof Error ? err.message : String(err), tone: 'err' })
    }
  }

  function handleEvent(ev: DropEvent, bump: () => void) {
    switch (ev.type) {
      case 'start':
        addLog(`Guild ${ev.guild_id} · ${ev.total} file(s) · metadata wipe ${ev.strip_metadata === false ? 'off' : 'on'}`)
        break
      case 'item_start':
        setQueue((q) => q.map((v) => (v.name === ev.file ? { ...v, state: 'busy' } : v)))
        addLog(`#${ev.channel} ← ${ev.file} (${ev.size_mb} MB)`)
        break
      case 'scrubbing':
        addLog(`Wiping metadata: ${ev.file}`)
        break
      case 'channel_created':
        addLog(`Created #${ev.channel}`, 'ok')
        break
      case 'item_done':
        setQueue((q) => q.filter((v) => v.name !== ev.file))
        setTotalFound((n) => (n ? Math.max(0, n - 1) : n))
        addLog(`Uploaded to #${ev.channel}`, 'ok')
        bump()
        break
      case 'item_error':
        setQueue((q) => q.map((v) => (v.name === ev.file ? { ...v, state: 'fail' } : v)))
        addLog(`#${ev.channel}: ${ev.message}`, 'err')
        bump()
        break
      case 'stopped':
        addLog('Stopped by user.', 'err')
        break
      case 'complete':
        setProgress(100)
        addLog('Drop complete.', 'ok')
        break
      case 'error':
        addLog(ev.message || 'Upload failed', 'err')
        break
    }
  }

  async function drop() {
    if (!form || busy || !queue.length) return
    if (!form.bot_token.trim() || !form.category_id.trim() || !form.folder_path.trim()) {
      addLog('Bot token, category ID and folder are required.', 'err')
      return
    }
    await persist(form)
    const jobId = newId()
    jobRef.current = jobId
    const total = queue.length
    let done = 0
    setBusy(true)
    setProgress(0)
    addLog(form.strip_metadata ? 'Starting drop · scrubbing metadata before each upload…' : 'Starting drop · metadata strip off…')
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const res = await mediaFetch('discord', 'upload', {
        signal: controller.signal,
        json: {
          bot_token: form.bot_token.trim(),
          category_id: form.category_id.trim(),
          guild_id: form.guild_id.trim() || null,
          folder_path: form.folder_path.trim(),
          description: form.description,
          start_index: form.start_index || 1,
          limit: Math.max(1, form.limit || 10),
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
          handleEvent(JSON.parse(line.slice(5).trim()) as DropEvent, () => {
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
    addLog('Stopping…', 'err')
    if (jobRef.current) {
      await mediaFetch('discord', 'stop', { json: { job_id: jobRef.current } }).catch(() => {})
    }
    abortRef.current?.abort()
  }

  if (!form) {
    return (
      <div className="rounded-2xl border border-lineStrong bg-panel p-6 text-sm text-mist">
        {hint?.text || 'Starting Discord Video Drop…'}
      </div>
    )
  }

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

      <div className="grid items-start gap-6 min-[1180px]:grid-cols-3">
        <section className="space-y-4 rounded-2xl border border-lineStrong bg-panel p-5 sm:p-6">
          <h2 className="text-sm font-semibold text-snow">Auth & target</h2>
          <Field label="Bot token">
            <SecretInput className={inputCls} value={form.bot_token} onChange={(v) => patch({ bot_token: v })} placeholder="Paste bot token" autoComplete="off" />
          </Field>
          <Field label="Category ID">
            <input className={inputCls} inputMode="numeric" value={form.category_id} onChange={(e) => patch({ category_id: e.target.value })} placeholder="Category snowflake" />
          </Field>
          <Field label="Guild ID (optional, auto from category)">
            <input className={inputCls} inputMode="numeric" value={form.guild_id} onChange={(e) => patch({ guild_id: e.target.value })} placeholder="Auto-resolved" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Start numbering at">
              <input className={inputCls} type="number" min={1} value={form.start_index} onChange={(e) => patch({ start_index: Math.max(1, Number(e.target.value) || 1) })} />
            </Field>
            <Field label="Upload limit">
              <input className={inputCls} type="number" min={1} value={form.limit} onChange={(e) => patch({ limit: Math.max(1, Number(e.target.value) || 1) })} />
            </Field>
          </div>
          <button type="button" className={ghost} onClick={() => void resolveCategory()}>Resolve category</button>
        </section>

        <section className="space-y-4 rounded-2xl border border-lineStrong bg-panel p-5 sm:p-6">
          <h2 className="text-sm font-semibold text-snow">Source</h2>
          <Field label="Folder path">
            <div className="flex gap-2">
              <input className={inputCls} value={form.folder_path} onChange={(e) => patch({ folder_path: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') void scan() }} placeholder="C:\Videos\clips" />
              <button type="button" className={`${ghost} shrink-0`} onClick={() => void browse()}>Browse</button>
            </div>
          </Field>
          <Field label="Message description">
            <textarea className={`${inputCls} min-h-[96px]`} value={form.description} onChange={(e) => patch({ description: e.target.value })} placeholder="Caption posted with each video" />
          </Field>
          <label className="flex items-center gap-2 text-sm text-snow">
            <input type="checkbox" checked={form.strip_metadata} onChange={(e) => patch({ strip_metadata: e.target.checked })} />
            Strip metadata before upload
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={ghost} disabled={busy} onClick={() => void scan()}>Scan folder</button>
            <button type="button" disabled={busy || !queue.length} onClick={() => void drop()}
              className={`${btn} border-phosphor/40 bg-phosphor/15 text-phosphor hover:bg-phosphor/25`}>
              Drop to Discord
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
              {totalFound === null ? 'No folder scanned' : `${queue.length} queued · ${totalFound} in folder`}
            </p>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-well">
            <div className="h-full rounded-full bg-phosphor transition-all" style={{ width: `${progress}%` }} />
          </div>
          <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto">
            {queue.map((v, i) => (
              <li key={v.name} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm">
                <span className="min-w-0 truncate text-snow">
                  <span className="mr-2 font-mono text-xs text-fog">#video-{(form.start_index || 1) + i}</span>
                  {v.name}
                </span>
                <span className={`shrink-0 text-xs ${v.state === 'fail' || v.too_large ? 'text-ember' : v.state === 'busy' ? 'text-brass' : 'text-fog'}`}>
                  {v.state === 'busy' ? 'Uploading' : v.state === 'fail' ? 'Failed' : v.too_large ? `${v.size_mb} MB · too large` : `${v.size_mb} MB`}
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
