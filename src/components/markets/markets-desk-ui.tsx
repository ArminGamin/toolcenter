export function OddsBadge({
  pct,
  label,
  large,
}: {
  pct?: number | null
  label?: string
  large?: boolean
}) {
  const hasRate = typeof pct === 'number'
  return (
    <div
      className={[
        'inline-flex flex-col rounded-lg border px-3',
        hasRate
          ? 'border-phosphor/35 bg-phosphor/10'
          : 'border-brass/35 bg-brass/10',
        large ? 'py-2.5' : 'py-2',
      ].join(' ')}
    >
      <span
        className={[
          'font-mono text-xs uppercase tracking-[0.12em]',
          hasRate ? 'text-phosphor/80' : 'text-brass/80',
        ].join(' ')}
      >
        Chance
      </span>
      {hasRate ? (
        <span className={['font-semibold text-phosphor', large ? 'text-xl' : 'text-base'].join(' ')}>
          {pct}%
        </span>
      ) : (
        <span className={['font-semibold text-brass', large ? 'text-sm' : 'text-xs'].join(' ')}>
          n/a
        </span>
      )}
      <span className="max-w-[16rem] font-mono text-xs leading-relaxed tracking-wide text-mist">
        {label ||
          (hasRate
            ? 'historical hit rate'
            : 'Not enough history yet - collecting armed outcomes')}
      </span>
    </div>
  )
}
