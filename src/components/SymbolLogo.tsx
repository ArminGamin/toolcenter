import { useEffect, useMemo, useState } from 'react'
import { resolveSymbolLogoCandidates, symbolMonogram, type SymbolLogoInput } from '../lib/symbol-logos'

/** Remember permanently broken URLs so we skip them next time. */
const failedUrls = new Set<string>()

export function SymbolLogo({
  symbol,
  kind,
  coingecko,
  domain,
  size = 40,
  className = '',
}: SymbolLogoInput & { size?: number; className?: string }) {
  const candidates = useMemo(
    () => resolveSymbolLogoCandidates({ symbol, kind, coingecko, domain }, size),
    [symbol, kind, coingecko, domain, size],
  )
  const usable = useMemo(() => candidates.filter((u) => !failedUrls.has(u)), [candidates])
  const [index, setIndex] = useState(0)
  const url = usable[index] || null
  const monogram = symbolMonogram(symbol)

  // Reset cascade when the symbol/kind changes
  useEffect(() => {
    setIndex(0)
  }, [symbol, kind, coingecko, domain, size])

  if (!url) {
    return (
      <div
        aria-hidden
        className={[
          'flex shrink-0 items-center justify-center rounded-full border border-lineStrong bg-well font-mono font-semibold uppercase text-mist',
          className,
        ].join(' ')}
        style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.32)) }}
      >
        {monogram}
      </div>
    )
  }

  return (
    <img
      key={url}
      src={url}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className={[
        'shrink-0 rounded-full border border-lineStrong bg-raised object-contain',
        className,
      ].join(' ')}
      style={{ width: size, height: size }}
      onError={() => {
        failedUrls.add(url)
        setIndex((i) => i + 1)
      }}
    />
  )
}
