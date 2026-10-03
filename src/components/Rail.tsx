import { readableToolAccent } from '../lib/appearance'
import { useCallback, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import { AppLogo } from './AppLogo'
import { UpdateButton } from './UpdateButton'
import { ToolIcon } from '../data/icons'
import { type RailItemId, type RailModuleId } from '../hooks/useRailOrder'
import type { IconKey, Tool } from '../types'

interface RailProps {
  order: RailItemId[]
  reorder: (from: number, to: number) => void
  removeItem: (id: string) => void
  isRailModuleId: (id: string) => id is RailModuleId
  isDirty?: boolean
  onSaveRail?: () => void
  tools: Tool[]
  activeToolId: string | null
  runningMap: Record<string, boolean>
  marketsOpen: boolean
  notesOpen: boolean
  outreachOpen: boolean
  pipelineOpen: boolean
  seoBlogOpen: boolean
  groupPosterOpen: boolean
  redditCommenterOpen: boolean
  ugcSlidesOpen: boolean
  oneShotOpen: boolean
  pipelineDue?: number
  onHome: () => void
  onMarkets: () => void
  onNotes: () => void
  onOutreach: () => void
  onPipeline: () => void
  onSeoBlog: () => void
  onGroupPoster: () => void
  onRedditCommenter: () => void
  onUgcSlides: () => void
  onOneShot: () => void
  onToolSelect: (id: string) => void
}

type RailItemConfig = {
  id: string
  label: string
  icon: IconKey
  size: number
  active: boolean
  onClick: () => void
  badge?: number
  accent: string
  running?: boolean
}

/** Accent colors for built-in hub modules (orbit tools use their catalog accent). */
const RAIL_MODULE_ACCENTS: Record<RailModuleId, string> = {
  markets: '#5ec4b4',
  notes: '#d4a35c',
  outreach: '#e08a6a',
  pipeline: '#22d3ee',
  groupPoster: '#7b8cff',
  redditCommenter: '#ff5700',
  seoBlog: '#a78bfa',
  ugcSlides: '#f472b6',
  oneShot: '#c9b896',
}

export function Rail({
  order,
  reorder,
  removeItem,
  isRailModuleId,
  isDirty,
  onSaveRail,
  tools,
  activeToolId,
  runningMap,
  marketsOpen,
  notesOpen,
  outreachOpen,
  pipelineOpen,
  seoBlogOpen,
  groupPosterOpen,
  redditCommenterOpen,
  ugcSlidesOpen,
  oneShotOpen,
  pipelineDue = 0,
  onHome,
  onMarkets,
  onNotes,
  onOutreach,
  onPipeline,
  onSeoBlog,
  onGroupPoster,
  onRedditCommenter,
  onUgcSlides,
  onOneShot,
  onToolSelect,
}: RailProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  const homeActive =
    !marketsOpen &&
    !notesOpen &&
    !outreachOpen &&
    !pipelineOpen &&
    !seoBlogOpen &&
    !groupPosterOpen &&
    !redditCommenterOpen &&
    !ugcSlidesOpen &&
    !oneShotOpen &&
    !activeToolId

  const moduleMap: Record<RailModuleId, Omit<RailItemConfig, 'id'>> = {
    markets: {
      label: 'Markets',
      icon: 'markets',
      size: 22,
      active: marketsOpen,
      onClick: onMarkets,
      accent: RAIL_MODULE_ACCENTS.markets,
    },
    notes: {
      label: 'Notes',
      icon: 'notes',
      size: 21,
      active: notesOpen,
      onClick: onNotes,
      accent: RAIL_MODULE_ACCENTS.notes,
    },
    outreach: {
      label: 'Outreach',
      icon: 'outreach',
      size: 21,
      active: outreachOpen,
      onClick: onOutreach,
      accent: RAIL_MODULE_ACCENTS.outreach,
    },
    pipeline: {
      label: 'Pipeline',
      icon: 'pipeline',
      size: 21,
      active: pipelineOpen,
      onClick: onPipeline,
      badge: pipelineDue > 0 ? pipelineDue : undefined,
      accent: RAIL_MODULE_ACCENTS.pipeline,
    },
    groupPoster: {
      label: 'Groups',
      icon: 'groupPoster',
      size: 21,
      active: groupPosterOpen,
      onClick: onGroupPoster,
      accent: RAIL_MODULE_ACCENTS.groupPoster,
    },
    redditCommenter: {
      label: 'Reddit',
      icon: 'redditCommenter',
      size: 21,
      active: redditCommenterOpen,
      onClick: onRedditCommenter,
      accent: RAIL_MODULE_ACCENTS.redditCommenter,
    },
    seoBlog: {
      label: 'SEO Blog',
      icon: 'seoBlog',
      size: 21,
      active: seoBlogOpen,
      onClick: onSeoBlog,
      accent: RAIL_MODULE_ACCENTS.seoBlog,
    },
    ugcSlides: {
      label: 'UGC Slides',
      icon: 'ugcSlides',
      size: 21,
      active: ugcSlidesOpen,
      onClick: onUgcSlides,
      accent: RAIL_MODULE_ACCENTS.ugcSlides,
    },
    oneShot: {
      label: 'One-Shot',
      icon: 'oneShot',
      size: 21,
      active: oneShotOpen,
      onClick: onOneShot,
      accent: RAIL_MODULE_ACCENTS.oneShot,
    },
  }

  const toolById = new Map(tools.map((t) => [t.id, t]))

  const items: RailItemConfig[] = []
  for (const id of order) {
    if (isRailModuleId(id)) {
      items.push({ id, ...moduleMap[id], running: Boolean(runningMap[id]) })
      continue
    }
    const tool = toolById.get(id)
    if (!tool || tool.removed) continue
    items.push({
      id: tool.id,
      label: railToolLabel(tool.name),
      icon: tool.icon,
      size: 21,
      active: activeToolId === tool.id,
      onClick: () => onToolSelect(tool.id),
      accent: tool.accent,
      running: Boolean(runningMap[tool.id]),
    })
  }

  const findInsertIndex = useCallback((clientX: number, clientY: number) => {
    const root = listRef.current
    if (!root) return null
    const nodes = [...root.querySelectorAll<HTMLElement>('[data-rail-index]')]
    if (!nodes.length) return null
    const horizontal = window.matchMedia('(max-width: 860px)').matches
    for (let i = 0; i < nodes.length; i++) {
      const r = nodes[i].getBoundingClientRect()
      const mid = horizontal ? r.left + r.width / 2 : r.top + r.height / 2
      const pos = horizontal ? clientX : clientY
      if (pos < mid) return i
    }
    return nodes.length - 1
  }, [])

  const finishDrag = useCallback(
    (clientX: number, clientY: number) => {
      if (dragFrom == null) return
      const to = findInsertIndex(clientX, clientY)
      if (to != null && to !== dragFrom) reorder(dragFrom, to)
      setDragFrom(null)
      setDropIndex(null)
    },
    [dragFrom, findInsertIndex, reorder],
  )

  return (
    <aside className="z-20 flex w-[92px] shrink-0 flex-col items-center border-r border-lineStrong bg-panel py-5 max-[860px]:fixed max-[860px]:bottom-0 max-[860px]:left-0 max-[860px]:order-2 max-[860px]:h-[72px] max-[860px]:w-full max-[860px]:flex-row max-[860px]:justify-center max-[860px]:gap-3 max-[860px]:border-r-0 max-[860px]:border-t max-[860px]:px-2 max-[860px]:py-0 max-[860px]:pb-[max(0px,env(safe-area-inset-bottom))]">
      <button
        type="button"
        onClick={onHome}
        aria-label="Home"
        className={[
          'group relative mb-3 flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border transition max-[860px]:mb-0',
          homeActive
            ? 'border-brass/45 shadow-glow ring-1 ring-brass/25'
            : 'border-lineStrong hover:border-brass/30 hover:shadow-glow',
        ].join(' ')}
      >
        <AppLogo size={44} className="h-full w-full rounded-2xl" />
        <Tip>Home</Tip>
      </button>

      <div
        ref={listRef}
        className="flex min-h-0 w-full flex-1 flex-col items-center gap-2 overflow-y-auto max-[860px]:flex-row max-[860px]:overflow-x-auto max-[860px]:overflow-y-hidden max-[860px]:gap-2"
      >
        {items.map((item, index) => (
          <div
            key={item.id}
            data-rail-index={index}
            className={[
              'relative',
              item.badge ? 'pt-2 max-[860px]:pt-0 max-[860px]:pl-2' : '',
              dragFrom === index ? 'z-10 opacity-60' : '',
              dropIndex === index && dragFrom != null && dragFrom !== index
                ? 'before:absolute before:left-1/2 before:top-0 before:z-20 before:h-0.5 before:w-8 before:-translate-x-1/2 before:rounded-full before:bg-brass before:content-[""] max-[860px]:before:left-0 max-[860px]:before:top-1/2 max-[860px]:before:h-8 max-[860px]:before:w-0.5 max-[860px]:before:-translate-y-1/2 max-[860px]:before:translate-x-0'
                : '',
            ].join(' ')}
          >
            <RailBtn
              active={item.active}
              label={item.label}
              onClick={item.onClick}
              icon={item.icon}
              size={item.size}
              badge={item.badge}
              accent={item.accent}
              running={item.running}
              dragging={dragFrom === index}
              onContextMenu={(e) => {
                e.preventDefault()
                removeItem(item.id)
              }}
              onGripPointerDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                e.currentTarget.setPointerCapture(e.pointerId)
                setDragFrom(index)
                setDropIndex(index)
              }}
              onGripPointerMove={(e) => {
                if (dragFrom == null) return
                const next = findInsertIndex(e.clientX, e.clientY)
                if (next != null) setDropIndex(next)
              }}
              onGripPointerUp={(e) => {
                if (dragFrom == null) return
                e.currentTarget.releasePointerCapture(e.pointerId)
                finishDrag(e.clientX, e.clientY)
              }}
              onGripPointerCancel={(e) => {
                e.currentTarget.releasePointerCapture(e.pointerId)
                setDragFrom(null)
                setDropIndex(null)
              }}
            />
          </div>
        ))}
      </div>

      {isDirty && onSaveRail ? (
        <div className="mt-2 w-full shrink-0 px-2 max-[860px]:mt-0 max-[860px]:w-auto max-[860px]:px-0">
          <button
            type="button"
            onClick={onSaveRail}
            className="flex min-h-[36px] w-full items-center justify-center rounded-xl border border-brass/45 bg-brass/15 px-2 py-2 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-brass shadow-glow transition hover:bg-brass/25 max-[860px]:min-h-[44px] max-[860px]:w-[72px] max-[860px]:text-[8px]"
          >
            Save rail
          </button>
        </div>
      ) : null}

      <UpdateButton />
    </aside>
  )
}

function RailBtn({
  active,
  label,
  onClick,
  icon,
  size,
  badge,
  accent,
  running,
  dragging,
  onContextMenu,
  onGripPointerDown,
  onGripPointerMove,
  onGripPointerUp,
  onGripPointerCancel,
}: {
  active: boolean
  label: string
  onClick: () => void
  icon: IconKey
  size: number
  badge?: number
  accent: string
  running?: boolean
  dragging?: boolean
  onContextMenu: (e: MouseEvent) => void
  onGripPointerDown: (e: PointerEvent<HTMLSpanElement>) => void
  onGripPointerMove: (e: PointerEvent<HTMLSpanElement>) => void
  onGripPointerUp: (e: PointerEvent<HTMLSpanElement>) => void
  onGripPointerCancel: (e: PointerEvent<HTMLSpanElement>) => void
}) {
  return (
    <div className="group/rail relative h-12 w-12 shrink-0">
      <span
        role="button"
        tabIndex={-1}
        aria-label={`Drag to reorder ${label}`}
        title="Drag to reorder"
        onPointerDown={onGripPointerDown}
        onPointerMove={onGripPointerMove}
        onPointerUp={onGripPointerUp}
        onPointerCancel={onGripPointerCancel}
        className={[
          'absolute z-10 flex cursor-grab touch-none items-center justify-center gap-0.5 rounded opacity-0 transition active:cursor-grabbing',
          'group-hover/rail:opacity-100',
          '-left-0.5 top-1/2 h-8 w-3 -translate-y-1/2 flex-col',
          'max-[860px]:left-1/2 max-[860px]:top-auto max-[860px]:bottom-0 max-[860px]:h-2 max-[860px]:w-7 max-[860px]:-translate-x-1/2 max-[860px]:flex-row max-[860px]:opacity-40',
          dragging ? 'opacity-100' : '',
        ].join(' ')}
      >
        <span className="h-0.5 w-1 rounded-full bg-fog max-[860px]:h-1 max-[860px]:w-0.5" />
        <span className="h-0.5 w-1 rounded-full bg-fog max-[860px]:h-1 max-[860px]:w-0.5" />
        <span className="h-0.5 w-1 rounded-full bg-fog max-[860px]:h-1 max-[860px]:w-0.5" />
      </span>
      <button
        type="button"
        onClick={onClick}
        onContextMenu={onContextMenu}
        aria-label={running ? `${label} - running` : label}
        title={`${label}${running ? ' - running' : ''} - right-click to remove from side panel`}
        className={[
          'group relative flex h-full w-full items-center justify-center overflow-hidden rounded-xl border transition-all duration-150',
          active ? 'scale-[1.04] shadow-glow' : 'hover:scale-[1.03]',
        ].join(' ')}
        style={{
          color: readableToolAccent(accent),
          backgroundColor: `${accent}26`,
          borderColor: active ? `${accent}aa` : `${accent}73`,
          boxShadow: active ? `0 0 18px -6px ${accent}88` : undefined,
        }}
      >
        {active ? (
          <span
            className="absolute -left-2 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full max-[860px]:hidden"
            style={{ background: accent }}
          />
        ) : null}
        <ToolIcon id={icon} size={size} />
        <Tip>{label}</Tip>
      </button>
      {running ? (
        <span
          className="pointer-events-none absolute right-0.5 top-0.5 z-20 h-1.5 w-1.5 rounded-full bg-phosphor ring-2 ring-panel"
          style={{ boxShadow: '0 0 7px 1px rgba(110, 231, 183, 0.85)' }}
          aria-hidden
        />
      ) : null}
      {badge ? (
        <span
          className={[
            'pointer-events-none absolute -right-1.5 -top-1.5 z-10 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-phosphor px-1 font-sans font-bold leading-none text-panel ring-2 ring-panel tabular-nums',
          ].join(' ')}
          style={{ fontSize: 10 }}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </div>
  )
}

function Tip({ children }: { children: ReactNode }) {
  return (
    <span className="pointer-events-none absolute left-[60px] top-1/2 z-30 -translate-y-1/2 -translate-x-1 whitespace-nowrap rounded-lg border border-lineStrong bg-lift px-2.5 py-1 font-mono text-[11px] text-snow opacity-0 shadow-panel transition group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 max-[860px]:hidden">
      {children}
    </span>
  )
}

function railToolLabel(name: string): string {
  const map: Record<string, string> = {
    'Video Creator': 'Video',
    'Newsletter Sender': 'Newsletter',
    'AI Lead Finder': 'Lead Finder',
    'Gmail Script': 'Gmail',
    'DC Scraper': 'DC Scraper',
    'Motion Blur': 'Motion Blur',
    'Autoplius Tracker': 'Autoplius',
  }
  return map[name] || name
}
