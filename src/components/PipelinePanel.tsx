import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  downloadPipelineExport,
  fetchPipeline,
  importPipelineFromOutreach,
  savePipeline,
  type PipelineContact,
  type PipelineData,
  type PipelineStage,
  type PipelineSummary,
} from '../lib/pipeline'
import { LoadingPanel, ErrorRetryCallout, EmptyState } from './ui/primitives'
import { BridgeOfflinePanel } from './ui/bridge-offline'

type Tab = 'today' | 'board' | 'contacts' | 'import'

const STAGES: PipelineStage[] = ['active', 'bought', 'dead']
const STAGE_LABEL: Record<PipelineStage, string> = {
  active: 'Active',
  bought: 'Bought',
  dead: 'Dead',
}
const STAGE_TONE: Record<PipelineStage, string> = {
  active: 'text-phosphor',
  bought: 'text-brass',
  dead: 'text-fog',
}

function id() {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function formatDue(value: string | null) {
  if (!value) return '-'
  const when = new Date(value)
  const diff = when.getTime() - Date.now()
  const days = Math.round(diff / 86_400_000)
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  return when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function isDue(contact: PipelineContact) {
  if (contact.stage !== 'active' || !contact.nextActionAt) return false
  return new Date(contact.nextActionAt).getTime() <= Date.now()
}

function toggleTag(contact: PipelineContact, tag: string): PipelineContact {
  const has = contact.tags.includes(tag)
  const tags = has ? contact.tags.filter((t) => t !== tag) : [...contact.tags, tag]
  return { ...contact, tags, updatedAt: new Date().toISOString() }
}

function setStage(contact: PipelineContact, stage: PipelineStage): PipelineContact {
  if (contact.stage === stage) return contact
  const now = new Date().toISOString()
  return {
    ...contact,
    stage,
    updatedAt: now,
    stageHistory: [...contact.stageHistory, { at: now, stage }],
  }
}

function bumpContact(contact: PipelineContact): PipelineContact {
  const now = new Date()
  const next = new Date(now)
  next.setDate(next.getDate() + 3)
  const step = contact.promoStep + 1
  return {
    ...contact,
    promoStep: step,
    action: `Promo bump #${step}`,
    nextActionAt: next.toISOString(),
    updatedAt: now.toISOString(),
    touches: [...contact.touches, { at: now.toISOString(), note: `Bump #${step} scheduled` }],
  }
}

export function PipelinePanel({ active = true }: { active?: boolean }) {
  const [data, setData] = useState<PipelineData>({ contacts: [] })
  const [summary, setSummary] = useState<PipelineSummary | null>(null)
  const [tab, setTab] = useState<Tab>('today')
  const [query, setQuery] = useState('')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [newEmail, setNewEmail] = useState('')

  const refresh = useCallback(async () => {
    try {
      const res = await fetchPipeline()
      if (!res.ok) {
        setLoadError(res.message || 'Bridge offline')
        return
      }
      setLoadError(null)
      setData(res.data)
      setSummary(res.summary)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => void refresh(), 8000)
    return () => window.clearInterval(id)
  }, [active, refresh])

  const contacts = data.contacts
  const selected = contacts.find((c) => c.id === selectedId) || null

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return contacts.filter((c) => {
      if (tagFilter && !c.tags.includes(tagFilter)) return false
      if (!q) return true
      return (
        c.email.includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.action.toLowerCase().includes(q) ||
        c.source.toLowerCase().includes(q)
      )
    })
  }, [contacts, query, tagFilter])

  const dueToday = useMemo(
    () => contacts.filter((c) => isDue(c)).sort((a, b) => String(a.nextActionAt).localeCompare(String(b.nextActionAt))),
    [contacts],
  )

  function showFlash(msg: string) {
    setFlash(msg)
    window.setTimeout(() => setFlash(null), 2800)
  }

  async function persist(next: PipelineData, msg?: string) {
    setBusy(true)
    const res = await savePipeline(next)
    setBusy(false)
    if (!res.ok) {
      showFlash(res.message || 'Save failed')
      return
    }
    if (res.data) setData(res.data)
    if (res.summary) setSummary(res.summary)
    if (msg) showFlash(msg)
  }

  async function updateContact(nextContact: PipelineContact) {
    const next: PipelineData = {
      contacts: contacts.map((c) => (c.id === nextContact.id ? nextContact : c)),
    }
    await persist(next)
  }

  async function onImport() {
    setBusy(true)
    const res = await importPipelineFromOutreach()
    setBusy(false)
    if (!res.ok) {
      showFlash(res.message || 'Import failed')
      return
    }
    if (res.data) setData(res.data)
    if (res.summary) setSummary(res.summary)
    showFlash(res.message || 'Import complete')
    if ((res.added ?? 0) > 0) setTab('today')
  }

  async function onAddManual() {
    const email = newEmail.trim().toLowerCase()
    if (!email || !email.includes('@')) {
      showFlash('Enter a valid email')
      return
    }
    if (contacts.some((c) => c.email === email)) {
      showFlash('Already in pipeline')
      return
    }
    const now = new Date()
    const nextAction = new Date(now)
    nextAction.setDate(nextAction.getDate() + 3)
    const contact: PipelineContact = {
      id: id(),
      email,
      name: '',
      source: 'manual',
      stage: 'active',
      tags: [],
      promoStep: 1,
      nextActionAt: nextAction.toISOString(),
      action: 'Promo bump #1',
      touches: [],
      stageHistory: [{ at: now.toISOString(), stage: 'active' }],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }
    await persist({ contacts: [...contacts, contact] }, 'Contact added')
    setNewEmail('')
    setSelectedId(contact.id)
    setTab('contacts')
  }

  if (loadError && !summary) {
    const isBridge = loadError.toLowerCase().includes('bridge') || loadError.includes('Failed to fetch')
    return (
      <div className="flex h-full items-center justify-center px-4">
        {isBridge ? (
          <BridgeOfflinePanel compact onRetry={() => {
            setLoading(true)
            void refresh()
          }} />
        ) : (
          <ErrorRetryCallout
            title="Could not load pipeline"
            body={loadError}
            onRetry={() => {
              setLoading(true)
              void refresh()
            }}
          />
        )}
      </div>
    )
  }

  if (loading && !summary) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingPanel title="Loading promo pipeline…" />
      </div>
    )
  }

  return (
    <div className="tool-workspace flex flex-col gap-6">
      <header className="shrink-0 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-sans text-xl font-semibold tracking-tight text-snow">Promo Pipeline</h1>
            <p className="mt-1 text-sm text-fog">
              Track promo bumps after Outreach sends - not where mail goes out.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-wide text-mist">
            <Stat label="Due" value={summary?.followUpsDue ?? 0} tone="text-phosphor" />
            <Stat label="Active" value={summary?.active ?? 0} />
            <Stat label="Engaged" value={summary?.engaged ?? 0} />
            <Stat label="Bought" value={summary?.bought ?? 0} tone="text-brass" />
          </div>
        </div>

        <div className="rounded-xl border border-lineStrong bg-well/50 px-3 py-2.5 text-[12.5px] text-mist">
          Sends happen in <span className="text-snow">Outreach</span>. This tab only tracks who needs a promo bump,
          who engaged, and who bought or went cold.
        </div>

        <nav className="cc-tabs" role="tablist">
          {(
            [
              ['today', `Today${dueToday.length ? ` (${dueToday.length})` : ''}`],
              ['board', 'Board'],
              ['contacts', 'Contacts'],
              ['import', 'Import'],
            ] as const
          ).map(([key, label]) => (
            <TabBtn key={key} active={tab === key} onClick={() => setTab(key)}>{label}</TabBtn>
          ))}
        </nav>
      </header>

      <div className="tool-workspace-body fit-body grid items-start gap-6 min-[1280px]:grid-cols-[minmax(0,1fr)_420px]">
        <section className="fit-scroll min-w-0 rounded-2xl border border-lineStrong bg-panel">
          {tab === 'today' && (
            <div className="flex h-full min-h-0 flex-col">
              <div className="border-b border-line px-4 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-mist">
                Due for follow-up
              </div>
              <div className="max-h-[560px] min-h-0 flex-1 overflow-y-auto p-5">
                {dueToday.length === 0 ? (
                  <EmptyState title="Nothing due today" body="Import from Outreach or add contacts manually." />
                ) : (
                  <ul className="space-y-2">
                    {dueToday.map((c) => (
                      <ContactRow
                        key={c.id}
                        contact={c}
                        selected={c.id === selectedId}
                        onSelect={() => setSelectedId(c.id)}
                      />
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {tab === 'board' && (
            <div className="grid min-h-[280px] grid-cols-1 gap-5 p-5 sm:grid-cols-2 min-[1400px]:grid-cols-3">
              {STAGES.map((stage) => {
                const list = filtered.filter((c) => c.stage === stage)
                return (
                  <div key={stage} className="min-h-0 rounded-xl border border-line bg-well/40">
                    <div className="border-b border-line px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-mist">
                      <span className={STAGE_TONE[stage]}>{STAGE_LABEL[stage]}</span>
                      <span className="ml-2 text-fog">{list.length}</span>
                    </div>
                    <ul className="max-h-[420px] space-y-2 overflow-y-auto p-2">
                      {list.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedId(c.id)}
                            className={[
                              'w-full rounded-lg border px-2.5 py-2 text-left transition',
                              c.id === selectedId
                                ? 'border-brass/40 bg-lift'
                                : 'border-line bg-panel hover:border-brass/25 hover:bg-lift',
                            ].join(' ')}
                          >
                            <div className="truncate text-[12.5px] font-medium text-snow">{c.email}</div>
                            <div className="mt-0.5 truncate font-mono text-[10px] text-fog">{c.action || '-'}</div>
                          </button>
                        </li>
                      ))}
                      {list.length === 0 ? (
                        <li className="px-2 py-4 text-center text-[12px] text-fog">Empty</li>
                      ) : null}
                    </ul>
                  </div>
                )
              })}
            </div>
          )}

          {tab === 'contacts' && (
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search email, name, action…"
                  className="min-w-[180px] flex-1 rounded-lg border border-lineStrong bg-well px-3 py-1.5 font-mono text-xs text-snow outline-none focus:border-brass/50"
                />
                <div className="flex gap-1">
                  {['engaged', 'replied', 'warm'].map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setTagFilter((t) => (t === tag ? null : tag))}
                      className={[
                        'rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-wide',
                        tagFilter === tag
                          ? 'border-brass/40 bg-lift text-brass'
                          : 'border-line text-fog hover:text-snow',
                      ].join(' ')}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
              <div className="max-h-[560px] min-h-0 flex-1 overflow-y-auto p-5">
                {filtered.length === 0 ? (
                  <EmptyState title="No contacts" body="Try a different filter or import from Outreach." />
                ) : (
                  <ul className="space-y-2">
                    {filtered.map((c) => (
                      <ContactRow
                        key={c.id}
                        contact={c}
                        selected={c.id === selectedId}
                        onSelect={() => setSelectedId(c.id)}
                      />
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {tab === 'import' && (
            <div className="space-y-6 p-5 sm:p-6">
              <Section title="From Outreach">
                <p className="text-sm text-mist">
                  Pulls sent emails from the active Outreach profile. Skips duplicates and permanent blacklist.
                  New contacts land as <span className="text-snow">active</span> with bump #1 in 3 days.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onImport()}
                    className="rounded-lg border border-brass/40 bg-lift px-4 py-2 font-mono text-[11px] uppercase tracking-wide text-brass hover:border-brass/60 disabled:opacity-50"
                  >
                    Import sent list
                  </button>
                  <span className="font-mono text-[11px] text-fog">
                    {summary?.outreachSent ?? 0} in Outreach sent · {summary?.total ?? 0} in pipeline
                  </span>
                </div>
              </Section>

              <Section title="Add manually">
                <div className="flex flex-wrap gap-2">
                  <input
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="email@example.com"
                    className="min-w-[220px] flex-1 rounded-lg border border-lineStrong bg-well px-3 py-2 font-mono text-xs text-snow outline-none focus:border-brass/50"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onAddManual()}
                    className="rounded-lg border border-lineStrong bg-raised px-4 py-2 font-mono text-[11px] uppercase tracking-wide text-mist hover:text-snow disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              </Section>

              <Section title="Export segments (.txt)">
                <p className="text-sm text-mist">One email per line - paste into Outreach or your mail tool.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(
                    [
                      ['due-today', 'Due today'],
                      ['engaged', 'Engaged'],
                      ['replied', 'Replied'],
                      ['active', 'All active'],
                    ] as const
                  ).map(([segment, label]) => (
                    <button
                      key={segment}
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void downloadPipelineExport(segment).then((r) => {
                          if (!r.ok) showFlash(r.message)
                          else showFlash(r.message)
                        })
                      }
                      className="rounded-lg border border-lineStrong bg-raised px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide text-mist hover:text-snow disabled:opacity-50"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Section>
            </div>
          )}
        </section>

        <aside className="fit-scroll min-w-0 rounded-2xl border border-lineStrong bg-panel">
          {selected ? (
            <ContactDetail
              contact={selected}
              busy={busy}
              onChange={(c) => void updateContact(c)}
              onBump={() => void updateContact(bumpContact(selected))}
              onStage={(stage) => void updateContact(setStage(selected, stage))}
              onToggleEngaged={() => void updateContact(toggleTag(selected, 'engaged'))}
              onToggleReplied={() => void updateContact(toggleTag(selected, 'replied'))}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-6">
              <EmptyState title="Select a contact" body="Pick someone from the list to edit stage, tags, and bumps." />
            </div>
          )}
        </aside>
      </div>

      {flash ? (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-lineStrong bg-lift px-4 py-2 font-mono text-xs text-snow shadow-panel">
          {flash}
        </div>
      ) : null}
    </div>
  )
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="cc-tab"
    >
      {children}
    </button>
  )
}

function Stat({
  label,
  value,
  tone = 'text-snow',
}: {
  label: string
  value: number
  tone?: string
}) {
  return (
    <span className="rounded-md border border-lineStrong bg-panel px-2 py-1">
      {label} <span className={tone}>{value}</span>
    </span>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-well/30 p-4">
      <h3 className="font-mono text-[10px] uppercase tracking-[0.12em] text-mist">{title}</h3>
      <div className="mt-2">{children}</div>
    </div>
  )
}

function ContactRow({
  contact,
  selected,
  onSelect,
}: {
  contact: PipelineContact
  selected: boolean
  onSelect: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={[
          'w-full rounded-xl border px-3 py-2.5 text-left transition',
          selected ? 'border-brass/40 bg-lift' : 'border-line bg-well/30 hover:border-brass/25 hover:bg-lift',
        ].join(' ')}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium text-snow">{contact.email}</div>
            {contact.name ? <div className="truncate text-[12px] text-fog">{contact.name}</div> : null}
          </div>
          <span className={`shrink-0 font-mono text-[10px] uppercase ${STAGE_TONE[contact.stage]}`}>
            {STAGE_LABEL[contact.stage]}
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-[10px] text-fog">
          <span>{contact.action || '-'}</span>
          <span>·</span>
          <span className={isDue(contact) ? 'text-phosphor' : ''}>{formatDue(contact.nextActionAt)}</span>
          {contact.tags.includes('engaged') ? <TagPill label="engaged" /> : null}
          {contact.tags.includes('replied') ? <TagPill label="replied" /> : null}
        </div>
      </button>
    </li>
  )
}

function TagPill({ label }: { label: string }) {
  return (
    <span className="rounded border border-lineStrong bg-panel px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-brass">
      {label}
    </span>
  )
}

function ContactDetail({
  contact,
  busy,
  onChange,
  onBump,
  onStage,
  onToggleEngaged,
  onToggleReplied,
}: {
  contact: PipelineContact
  busy: boolean
  onChange: (c: PipelineContact) => void
  onBump: () => void
  onStage: (stage: PipelineStage) => void
  onToggleEngaged: () => void
  onToggleReplied: () => void
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-line px-4 py-3">
        <div className="truncate font-sans text-base font-semibold text-snow">{contact.email}</div>
        <div className="mt-1 font-mono text-[10px] uppercase tracking-wide text-fog">
          {contact.source} · step {contact.promoStep}
        </div>
      </div>
      <div className="space-y-6 p-5">
        <label className="block space-y-2">
          <span className="text-sm font-medium text-mist">Name</span>
          <input
            value={contact.name}
            onChange={(e) => onChange({ ...contact, name: e.target.value, updatedAt: new Date().toISOString() })}
            className="min-h-11 w-full rounded-lg border border-lineStrong bg-well px-3 py-2.5 text-sm text-snow outline-none focus:border-brass/50"
          />
        </label>

        <div>
          <div className="font-mono text-[10px] uppercase tracking-wide text-mist">Stage</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {STAGES.map((stage) => (
              <button
                key={stage}
                type="button"
                disabled={busy}
                onClick={() => onStage(stage)}
                className={[
                  'rounded-lg border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide',
                  contact.stage === stage
                    ? 'border-brass/40 bg-lift text-brass'
                    : 'border-line text-fog hover:text-snow',
                ].join(' ')}
              >
                {STAGE_LABEL[stage]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="font-mono text-[10px] uppercase tracking-wide text-mist">Tags</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onToggleEngaged}
              className={[
                'rounded-lg border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide',
                contact.tags.includes('engaged')
                  ? 'border-phosphor/40 bg-lift text-phosphor'
                  : 'border-line text-fog hover:text-snow',
              ].join(' ')}
            >
              {contact.tags.includes('engaged') ? 'Engaged ✓' : 'Mark engaged'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onToggleReplied}
              className={[
                'rounded-lg border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide',
                contact.tags.includes('replied')
                  ? 'border-brass/40 bg-lift text-brass'
                  : 'border-line text-fog hover:text-snow',
              ].join(' ')}
            >
              {contact.tags.includes('replied') ? 'Replied ✓' : 'Mark replied'}
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-well/30 p-3">
          <div className="font-mono text-[10px] uppercase tracking-wide text-mist">Next action</div>
          <div className="mt-1 text-sm text-snow">{contact.action || '-'}</div>
          <div className="mt-1 font-mono text-[11px] text-fog">{formatDue(contact.nextActionAt)}</div>
          <button
            type="button"
            disabled={busy || contact.stage !== 'active'}
            onClick={onBump}
            className="mt-3 rounded-lg border border-brass/35 bg-lift px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide text-brass hover:border-brass/55 disabled:opacity-40"
          >
            Schedule next bump (+3d)
          </button>
        </div>

        {contact.touches.length > 0 ? (
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wide text-mist">Activity</div>
            <ul className="mt-2 space-y-1.5">
              {contact.touches.slice().reverse().slice(0, 8).map((touch, i) => (
                <li key={i} className="rounded-lg border border-line bg-well/20 px-2.5 py-1.5 text-[12px] text-mist">
                  <span className="font-mono text-[10px] text-fog">
                    {new Date(touch.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                  <span className="ml-2">{touch.note}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  )
}
