import type { OutreachSettings } from '../../lib/outreach'
import { inputCls } from '../ui/primitives'
import { Btn, Check, Field, Section } from './outreach-ui'

export function CleanSection({
  settings,
  dropCount,
  onChange,
  onDryClean,
  onRequireApprove,
  busy,
}: {
  settings: OutreachSettings
  dropCount: number
  onChange: (clean: OutreachSettings['clean']) => void
  onDryClean: () => void
  onRequireApprove: (v: boolean) => void
  busy: boolean
}) {
  const c = settings.clean
  return (
    <div className="fit-stack space-y-5">
      <Section title="Gate">
        <Check
          label="Require human approve before send (recommended)"
          checked={settings.requireApprove}
          onChange={onRequireApprove}
        />
        <Field label="Strictness">
          <select
            className={inputCls}
            value={c.strictness}
            onChange={(e) => onChange({ ...c, strictness: e.target.value as 'normal' | 'strict' })}
          >
            <option value="normal">Normal</option>
            <option value="strict">Strict</option>
          </select>
        </Field>
      </Section>
      <Section title="Lists">
        <Field label="Allowlist domains">
          <textarea
            className={`${inputCls} min-h-[90px]`}
            value={c.allowlist.join('\n')}
            onChange={(e) =>
              onChange({
                ...c,
                allowlist: e.target.value.split(/\r?\n/).map((s) => s.trim().toLowerCase()).filter(Boolean),
              })
            }
          />
        </Field>
        <Field label="Block locals">
          <textarea
            className={`${inputCls} min-h-[80px]`}
            value={c.blockLocals.join('\n')}
            onChange={(e) =>
              onChange({
                ...c,
                blockLocals: e.target.value.split(/\r?\n/).map((s) => s.trim().toLowerCase()).filter(Boolean),
              })
            }
          />
        </Field>
        <Field label="Block domain fragments">
          <textarea
            className={`${inputCls} min-h-[56px]`}
            value={c.blockDomains.join('\n')}
            onChange={(e) =>
              onChange({
                ...c,
                blockDomains: e.target.value.split(/\r?\n/).map((s) => s.trim().toLowerCase()).filter(Boolean),
              })
            }
          />
        </Field>
      </Section>
      <div className="flex flex-wrap items-center gap-3">
        <Btn onClick={onDryClean} disabled={busy} primary>
          Dry-run clean on paste list
        </Btn>
        {dropCount > 0 && <span className="font-mono text-[11px] text-fog">{dropCount} dropped in last run</span>}
      </div>
    </div>
  )
}
