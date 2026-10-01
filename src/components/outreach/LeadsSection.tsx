import { Btn, Section } from './outreach-ui'
import type { OutreachLeadEvidence } from '../../lib/outreach'

export function LeadsSection({
  emails,
  evidence,
  onCopy,
  onClean,
  busy,
}: {
  emails: string[]
  evidence: Record<string, OutreachLeadEvidence>
  onCopy: () => void
  onClean: () => void
  busy?: boolean
}) {
  return (
    <div className="space-y-4">
      <Section title="Qualified people">
        {emails.length > 0 ? (
          <p className="font-mono text-[11px] text-mist">
            {emails.length} public professional contact{emails.length === 1 ? '' : 's'}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-1.5">
          <Btn onClick={onCopy} disabled={!emails.length || busy}>
            Copy all
          </Btn>
          <Btn onClick={onClean} disabled={!emails.length || busy} primary>
            Clean
          </Btn>
        </div>
      </Section>
      <div className="overflow-hidden rounded-xl border border-lineStrong bg-well shadow-card">
        {!emails.length ? (
          <p className="px-3 py-6 text-center font-mono text-[11px] text-fog">Empty</p>
        ) : (
          <ul className="max-h-[min(60vh,520px)] divide-y divide-lineStrong overflow-y-auto font-mono text-[11px]">
            {[...emails].reverse().map((email, i) => {
              const proof = evidence[email]
              return (
                <li key={`${email}-${i}`} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-2 px-3 py-2 text-snow">
                  <span className="pt-0.5 text-[10px] text-fog">{emails.length - i}</span>
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="font-sans text-xs font-medium text-snow">{proof?.name || 'Public contact'}</span>
                      <span className="truncate text-[10px] text-mist">{email}</span>
                    </div>
                    {proof?.sourceUrl ? (
                      <a
                        href={proof.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-0.5 block truncate text-[10px] text-phosphor hover:underline"
                        title={[...proof.personEvidence, ...proof.locationEvidence, ...proof.contactEvidence].join(' · ')}
                      >
                        {proof.sourceType} · {proof.sourceUrl}
                      </a>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
