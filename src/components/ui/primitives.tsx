import type { ReactNode } from 'react'

export const inputCls =
  'surface-input min-h-11 min-w-0 w-full rounded-lg border border-lineStrong bg-well px-3 py-2.5 text-sm leading-relaxed text-snow outline-none transition placeholder:text-fog focus:border-brass/55'

export const checkCls = 'accent-brass'

export function Panel({
  title,
  children,
  aside,
  className = '',
}: {
  title?: string
  children: ReactNode
  aside?: ReactNode
  className?: string
}) {
  return (
    <section
      className={`rounded-2xl border border-lineStrong bg-panel ${className}`.trim()}
    >
      {title ? (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <h2 className="text-sm font-semibold text-snow">
            {title}
          </h2>
          {aside}
        </header>
      ) : null}
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  )
}

export function Section({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-snow">
        {title}
      </h3>
      {children}
    </div>
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
      <span className="block text-sm font-medium leading-relaxed text-mist">
        {label}
      </span>
      {children}
    </label>
  )
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-lineStrong bg-well/40 px-6 py-10 text-center">
      <p className="font-mono text-sm text-snow">{title}</p>
      {body ? <p className="max-w-md text-[12px] text-fog">{body}</p> : null}
      {action}
    </div>
  )
}

export function Stat({
  label,
  value,
  tone = 'mist',
}: {
  label: string
  value: ReactNode
  tone?: 'mist' | 'phosphor' | 'ember' | 'brass'
}) {
  const toneCls =
    tone === 'phosphor'
      ? 'text-phosphor'
      : tone === 'ember'
        ? 'text-ember'
        : tone === 'brass'
          ? 'text-brass'
          : 'text-snow'
  return (
    <div className="rounded-lg border border-line bg-well px-3 py-2">
      <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-fog">{label}</div>
      <div className={`font-mono text-sm tabular-nums ${toneCls}`}>{value}</div>
    </div>
  )
}

export function LoadingSkeleton({
  lines = 3,
  className = '',
}: {
  lines?: number
  className?: string
}) {
  return (
    <div className={`space-y-2 ${className}`.trim()} aria-busy="true" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className="h-3 rounded bg-lineStrong/60 animate-pulse"
          style={{ width: `${68 + ((i * 17) % 28)}%` }}
        />
      ))}
    </div>
  )
}

export function LoadingPanel({ title = 'Loading…' }: { title?: string }) {
  return (
    <div className="rounded-2xl border border-lineStrong bg-panel p-6">
      <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.14em] text-mist">{title}</p>
      <LoadingSkeleton lines={5} />
    </div>
  )
}

/** Today strip placeholder - 3 module cards while hub summary loads. */
export function TodayStripSkeleton() {
  return (
    <section
      className="shrink-0 rounded-[14px] border border-lineStrong bg-panel px-4 py-3 sm:px-5 sm:py-3.5"
      aria-busy="true"
      aria-label="Loading today"
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-mono text-[13px] font-semibold tracking-wide text-brass">Today</span>
        <div className="h-3 w-40 rounded bg-lineStrong/50 animate-pulse" />
      </div>
      <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-[10px] border border-line bg-well px-3 py-2.5 space-y-2"
          >
            <div className="h-3.5 w-24 rounded bg-lineStrong/60 animate-pulse" />
            <div className="h-3 w-16 rounded bg-lineStrong/40 animate-pulse" />
            <div className="h-2.5 w-32 rounded bg-lineStrong/30 animate-pulse" />
          </div>
        ))}
      </div>
    </section>
  )
}

/** Subtle orbit stage shimmer while layout measures or tools hydrate. */
export function OrbitStageSkeleton() {
  return (
    <div
      className="relative mx-auto flex aspect-[1.35/1] w-full max-w-[900px] items-center justify-center"
      aria-busy="true"
      aria-label="Loading orbit"
    >
      <div className="absolute inset-[12%] rounded-full border border-lineStrong/40 animate-pulse bg-well/30" />
      <div className="h-16 w-16 rounded-full border border-brass/20 bg-brass/5 animate-pulse" />
    </div>
  )
}

export function ErrorRetryCallout({
  title,
  body,
  onRetry,
  retrying,
}: {
  title: string
  body?: string
  onRetry?: () => void
  retrying?: boolean
}) {
  return (
    <div className="rounded-xl border border-ember/35 bg-ember/8 px-4 py-3">
      <p className="font-mono text-sm text-ember">{title}</p>
      {body ? <p className="mt-1 text-xs text-mist">{body}</p> : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="mt-2 min-h-[40px] rounded-lg border border-brass/40 bg-brass/15 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide text-brass disabled:opacity-50"
        >
          {retrying ? 'Retrying…' : 'Retry'}
        </button>
      ) : null}
    </div>
  )
}
