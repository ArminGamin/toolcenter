import { type ReactNode } from 'react'
import {
    MAX_SLIDESHOW_SLIDES,
    MIN_SLIDESHOW_SLIDES
} from '../../lib/ugc-slides'

export const SLIDE_OPTS = Array.from(
  { length: MAX_SLIDESHOW_SLIDES - MIN_SLIDESHOW_SLIDES + 1 },
  (_, i) => String(MIN_SLIDESHOW_SLIDES + i),
)

export type BatchImage = { id: string; url: string; file: File }

export type BatchResultLine = {
  ok: boolean
  text: string
  detail?: string
}

export type DiscordResultLine = {
  ok: boolean
  index: number
  channel?: string
  error?: string
  detail?: string
}

export function newId() {
  return `batch-img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function formatBatchElapsed(totalSec: number): string {
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`
}

export function BatchLabel({ children }: { children: ReactNode }) {
  return (
    <span className="pt-2 font-mono text-[11px] uppercase tracking-wide text-fog">{children}</span>
  )
}

export type UgcBatchRunState = {
  busy: boolean
  progress: number
  status: string
  elapsedSec: number
  abort: (() => void) | null
}
