import type { MarketPricePoint } from '../../lib/markets'

export function LiveSparkline({
  points,
  up,
  label,
}: {
  points: MarketPricePoint[]
  up: boolean
  label: string
}) {
  if (points.length < 2) {
    return (
      <div className="flex h-16 items-center justify-center rounded-lg border border-dashed border-line bg-well font-mono text-xs uppercase tracking-wider text-mist">
        No intraday prints
      </div>
    )
  }

  const prices = points.map((point) => point.price)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || Math.max(max * 0.003, 1)
  const width = 280
  const height = 64
  const padding = 4
  const line = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * width
      const y = height - padding - ((point.price - min) / range) * (height - padding * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const area = `${padding},${height - padding} ${line} ${width - padding},${height - padding}`

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      className="h-16 w-full overflow-visible"
    >
      <polygon points={area} className={up ? 'fill-phosphor/10' : 'fill-ember/10'} />
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        vectorEffect="non-scaling-stroke"
        className={up ? 'text-phosphor' : 'text-ember'}
      />
    </svg>
  )
}
