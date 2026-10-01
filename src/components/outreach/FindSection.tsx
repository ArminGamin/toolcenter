import { useCallback, useEffect, useState } from 'react'
import type { EmailCandidate, LeadFinderExportFile, OutreachSettings } from '../../lib/outreach'
import { fetchLeadFinderExports } from '../../lib/outreach'
import { inputCls } from '../ui/primitives'
import { Btn, Field, Section } from './outreach-ui'

export function FindSection({
  settings,
  models: _models,
  findPath,
  foundCount,
  onChange,
  onClearScrapeCache,
  onImportFile,
  onExportLeads,
  busy,
  live,
  onSendLive,
}: {
  settings: OutreachSettings
  models: string[]
  findPath?: string
  foundCount: number
  onChange: (find: OutreachSettings['find']) => void
  onClearScrapeCache: () => void
  onImportFile: (filePath?: string) => void
  onExportLeads: () => void
  busy: boolean
  live: {
    finderRunning: boolean
    sendActive: boolean
    finderComplete: boolean
    provisional: number
    eligible: number
    approvalPending: number
    candidates: EmailCandidate[]
    requireApprove: boolean
    verifying: boolean
  }
  onSendLive: (selected: string[]) => void
}) {
  const f = settings.find
  const patch = (p: Partial<typeof f>) => onChange({ ...f, ...p })
  const scraping = f.source === 'headless'
  const importing = f.source === 'import'
  const [exportFiles, setExportFiles] = useState<LeadFinderExportFile[]>([])
  const [outputDir, setOutputDir] = useState<string | null>(null)
  const [exportsMsg, setExportsMsg] = useState<string | null>(null)
  const [selectedImportPath, setSelectedImportPath] = useState('')
  const [selectedLive, setSelectedLive] = useState<string[]>([])
  const liveKeepCandidates = live.candidates.filter((candidate) => candidate.decision === 'keep')
  useEffect(() => {
    const available = new Set(live.candidates.filter((candidate) => candidate.decision === 'keep').map((candidate) => candidate.email))
    setSelectedLive((current) => current.filter((email) => available.has(email)))
  }, [live.candidates])

  const runModeHint: Record<'full' | 'discover' | 'scrape', string> = {
    full: 'Discover public professional pages, validate the person and contact intent, then store qualified leads.',
    discover: 'Find source URLs only - scrape them in a later run.',
    scrape: 'Skip discovery - only crawl the seed URLs you paste.',
  }

  const refreshExports = useCallback(async () => {
    const res = await fetchLeadFinderExports()
    if (!res.ok) {
      setExportsMsg(res.message || 'Could not list exports')
      setExportFiles([])
      return
    }
    setExportsMsg(null)
    setExportFiles(res.files || [])
    setOutputDir(res.outputDir || null)
    setSelectedImportPath((cur) => {
      if (cur && res.files?.some((file) => file.path === cur)) return cur
      return res.files?.[0]?.path || ''
    })
  }, [])

  useEffect(() => {
    if (!importing) return
    void refreshExports()
  }, [importing, refreshExports])

  return (
    <div className="fit-stack space-y-5">
      {(live.finderRunning || live.sendActive) && !live.finderComplete ? (
        <Section title="Live send while finding">
          <div className="grid gap-5 min-[1400px]:grid-cols-3">
            <div className="rounded-lg border border-lineStrong bg-well/40 px-3 py-2 font-mono text-[10px] text-fog">
              Provisional <span className="text-snow">{live.provisional}</span>
            </div>
            <div className="rounded-lg border border-lineStrong bg-well/40 px-3 py-2 font-mono text-[10px] text-fog">
              Eligible <span className="text-phosphor">{live.eligible}</span>
            </div>
            <div className="rounded-lg border border-lineStrong bg-well/40 px-3 py-2 font-mono text-[10px] text-fog">
              Approval pending <span className="text-brass">{live.approvalPending}</span>
            </div>
          </div>
          {live.requireApprove && liveKeepCandidates.length > 0 ? (
            <div className="mt-3 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-lineStrong bg-well/30 p-2">
              {liveKeepCandidates.map((candidate) => (
                <label key={candidate.email} className="flex items-center gap-2 font-mono text-[10px] text-mist">
                  <input
                    type="checkbox"
                    checked={selectedLive.includes(candidate.email)}
                    onChange={(event) => setSelectedLive((current) => event.target.checked
                      ? [...new Set([...current, candidate.email])]
                      : current.filter((email) => email !== candidate.email))}
                  />
                  <span className="truncate">{candidate.email}</span>
                </label>
              ))}
            </div>
          ) : null}
          {live.verifying && live.provisional > 0 ? (
            <p className="mt-2 font-mono text-[10px] text-fog">Waiting for MX/SMTP verification before leads can enter the queue.</p>
          ) : null}
          <div className="mt-3 flex items-center gap-2">
            <Btn
              primary
              disabled={busy || (!live.requireApprove && live.eligible === 0) || (live.requireApprove && selectedLive.length === 0)}
              onClick={() => onSendLive(live.requireApprove ? selectedLive : [])}
            >
              {live.sendActive ? 'Live sending…' : `Send eligible now (${live.requireApprove ? selectedLive.length : live.eligible})`}
            </Btn>
          </div>
        </Section>
      ) : null}
      <Section title="How to get emails">
        <div className="grid gap-5 min-[1400px]:grid-cols-3">
          {(
            [
              ['headless', 'Lead Finder scrape'],
              ['paste', 'Paste list'],
              ['import', 'Import export'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => patch({ source: value })}
              className={[
                'rounded-xl border px-3 py-2.5 text-left transition',
                f.source === value
                  ? 'border-brass/45 bg-brass/10 shadow-card'
                  : 'border-lineStrong bg-panel shadow-card hover:border-brass/35 hover:bg-lift',
              ].join(' ')}
            >
              <div className={`font-mono text-[11px] ${f.source === value ? 'text-brass' : 'text-snow'}`}>
                {label}
              </div>
            </button>
          ))}
        </div>
      </Section>

      {f.source === 'paste' && (
        <Section title="Paste emails">
          <Field label="Email list">
            <textarea
              className={`${inputCls} min-h-[140px]`}
              value={f.pasteList}
              onChange={(e) => patch({ pasteList: e.target.value })}
              placeholder="name@gmail.com"
            />
          </Field>
        </Section>
      )}

      {importing && (
        <Section title="Lead Finder exports">
          <p className="mb-3 font-mono text-[10px] leading-relaxed text-fog">
            Reads <span className="text-mist">ai-lead-finder/output</span> -{' '}
            <span className="text-mist">emails-*.txt</span> and{' '}
            <span className="text-mist">autopilot-*.txt</span>. Import loads a file into the pipeline
            (clean → approve → send). Export writes current found leads back to that folder.
          </p>
          {outputDir ? (
            <p className="mb-3 font-mono text-[10px] text-fog break-all">{outputDir}</p>
          ) : null}
          {exportsMsg ? (
            <p className="mb-3 font-mono text-[10px] text-ember">{exportsMsg}</p>
          ) : null}
          <Field label="File to import">
            <select
              className={inputCls}
              value={selectedImportPath}
              onChange={(e) => setSelectedImportPath(e.target.value)}
              disabled={!exportFiles.length}
            >
              {!exportFiles.length ? (
                <option value="">No export files found</option>
              ) : (
                exportFiles.map((file) => (
                  <option key={file.path} value={file.path}>
                    {file.name} · {file.emailCount} emails ·{' '}
                    {new Date(file.mtimeMs).toLocaleString()}
                  </option>
                ))
              )}
            </select>
          </Field>
          {exportFiles.length > 0 ? (
            <ul className="mb-3 max-h-32 space-y-1 overflow-y-auto rounded-lg border border-lineStrong bg-well/40 px-2 py-1.5 font-mono text-[10px] text-fog">
              {exportFiles.map((file) => (
                <li key={file.path} className="truncate">
                  {file.name} · {file.emailCount} · {new Date(file.mtimeMs).toLocaleString()}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Btn
              onClick={() => onImportFile(selectedImportPath || undefined)}
              disabled={busy || !exportFiles.length}
              primary
            >
              Import
            </Btn>
            <Btn onClick={() => onExportLeads()} disabled={busy || foundCount === 0}>
              Export ({foundCount})
            </Btn>
            <Btn onClick={() => void refreshExports()} disabled={busy}>
              Refresh list
            </Btn>
          </div>
        </Section>
      )}

      {scraping && (
        <>
          {/* Optional goal (campaign hint + Ollama model) hidden from the UI; saved values still apply. */}

          <Section title="Pipeline mode">
            <div className="grid gap-5 min-[1400px]:grid-cols-3">
              {(
                [
                  ['full', 'Find & scrape leads'],
                  ['discover', 'Find sources only'],
                  ['scrape', 'Scrape pasted URLs'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => patch({ runMode: value })}
                  className={[
                    'rounded-lg border px-3 py-2 font-mono text-[11px] transition',
                    f.runMode === value
                      ? 'border-phosphor/40 bg-phosphor/10 text-phosphor'
                      : 'border-lineStrong text-mist hover:text-snow',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-2 font-mono text-[10px] leading-relaxed text-fog">
              {runModeHint[f.runMode as 'full' | 'discover' | 'scrape'] || runModeHint.full}
            </p>
            {f.runMode === 'scrape' && (
              <Field label="Seed URLs">
                <textarea
                  className={`${inputCls} min-h-[110px]`}
                  value={f.seedUrls}
                  onChange={(e) => patch({ seedUrls: e.target.value })}
                  placeholder="https://forum.example/…"
                />
              </Field>
            )}
          </Section>

          <Section title="Find speed">
            <div className="grid gap-5 min-[1180px]:grid-cols-2">
              {(
                [
                  [true, 'Fast', 'Parallel workers with durable checkpoints and adaptive source switching'],
                  [false, 'Original', 'Lower concurrency with the same qualification and exhaustion rules'],
                ] as const
              ).map(([value, label, hint]) => {
                const active = (f.fastMode !== false) === value
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => patch({ fastMode: value })}
                    className={[
                      'rounded-lg border px-3 py-2.5 text-left font-mono transition',
                      active
                        ? 'border-phosphor/40 bg-phosphor/10 text-phosphor'
                        : 'border-lineStrong text-mist hover:text-snow',
                    ].join(' ')}
                  >
                    <span className="block text-[11px] font-semibold">{label}</span>
                    <span className="mt-1 block text-[10px] leading-relaxed text-fog">{hint}</span>
                  </button>
                )
              })}
            </div>
          </Section>

          {/* Settings block (quality note + AI auto campaign / AI recommended pages) hidden; saved values still apply. */}

          <Section title="Caps">
            <div className="grid gap-5 min-[1180px]:grid-cols-2 min-[1600px]:grid-cols-3">
              <Field label="Max pages">
                <input className={inputCls} value={f.maxPages} onChange={(e) => patch({ maxPages: e.target.value })} />
              </Field>
              <Field label="Max URLs">
                <input className={inputCls} value={f.maxUrls} onChange={(e) => patch({ maxUrls: e.target.value })} />
              </Field>
              <Field label="Max queries">
                <input
                  className={inputCls}
                  value={f.maxQueries ?? '120'}
                  onChange={(e) => patch({ maxQueries: e.target.value })}
                />
              </Field>
              <Field label="Lead target">
                <input
                  className={inputCls}
                  type="number"
                  min={1}
                  value={f.leadTarget}
                  onChange={(e) => patch({ leadTarget: e.target.value })}
                />
              </Field>
              <Field label="Min score">
                <input className={inputCls} value={f.minScore} onChange={(e) => patch({ minScore: e.target.value })} />
              </Field>
            </div>
          </Section>

          <Section title="Scrape cache">
            <p className="mb-2 font-mono text-[10px] leading-relaxed text-fog">
              Wipes this profile’s known emails, page cache, yield stats, and sent history so they can be
              re-scraped. Permanent bounce blacklist stays.
            </p>
            <Btn onClick={onClearScrapeCache} disabled={busy} danger>
              Clear scrape cache
            </Btn>
          </Section>
        </>
      )}

      {findPath && <p className="font-mono text-[10px] text-fog">Last output: {findPath}</p>}
    </div>
  )
}
