import { useEffect, useState } from 'react'

function formatClock(d: Date): string {
  const weekday = d.toLocaleDateString(undefined, { weekday: 'short' })
  const month = d.toLocaleDateString(undefined, { month: 'short' })
  const day = String(d.getDate()).padStart(2, '0')
  const year = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${weekday} ${month} ${day}, ${year} · ${hh}:${mm}:${ss}`
}

export function useClock(): string {
  const [clock, setClock] = useState(() => formatClock(new Date()))

  useEffect(() => {
    const id = window.setInterval(() => setClock(formatClock(new Date())), 1000)
    return () => window.clearInterval(id)
  }, [])

  return clock
}
