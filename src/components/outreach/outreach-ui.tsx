import type { ReactNode } from 'react'
import { checkCls } from '../ui/primitives'

export function Stat({
  label,
  value,
  accent,
  className = '',
}: {
  label: string
  value: string | number
  accent?: boolean
  className?: string
}) {
  return (
    <div className={`bg-raised px-3 py-2.5 ${className}`.trim()}>
      <p className="font-mono text-xs uppercase tracking-wider text-mist">{label}</p>
      <p className={`mt-0.5 font-mono text-sm tabular-nums ${accent ? 'text-brass' : 'text-snow'}`}>{value}</p>
    </div>
  )
}

export function Btn({
  children,
  onClick,
  disabled,
  primary,
  danger,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  primary?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'min-h-11 rounded-lg border px-3.5 py-2 text-sm font-medium transition disabled:opacity-40',
        primary
          ? 'border-phosphor/40 bg-phosphor/15 text-phosphor hover:bg-phosphor/25'
          : danger
            ? 'border-ember/35 bg-ember/10 text-ember hover:bg-ember/20'
            : 'border-lineStrong bg-raised text-mist hover:bg-lift hover:text-snow',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

export function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="block min-w-0 space-y-2">
      <span className="block text-sm font-medium leading-relaxed text-mist">{label}</span>
      {children}
    </label>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-5 rounded-xl border border-line bg-raised p-5 sm:p-6">
      <p className="border-b border-line pb-3 text-sm font-semibold text-snow">
        {title}
      </p>
      {children}
    </div>
  )
}

export function Check({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <label
      className={[
        'flex min-h-11 items-start gap-3 py-2 text-sm leading-relaxed text-mist',
        disabled ? 'opacity-40' : '',
      ].join(' ')}
    >
      <input
        type="checkbox"
        className={checkCls}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  )
}
