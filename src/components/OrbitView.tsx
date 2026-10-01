import { readableToolAccent } from '../lib/appearance'
import { useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { ToolIcon } from '../data/icons'
import { OrbitStageSkeleton } from './ui/primitives'
import type { Tool } from '../types'

type LabelSide = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

type NodeLayout = {
  x: number
  y: number
  angleDeg: number
  labelSide: LabelSide
}

function clamp(min: number, val: number, max: number) {
  return Math.min(max, Math.max(min, val))
}

function labelSideForAngle(angleDeg: number): LabelSide {
  const a = ((angleDeg % 360) + 360) % 360
  if (a >= 337.5 || a < 22.5) return 'e'
  if (a < 67.5) return 'se'
  if (a < 112.5) return 's'
  if (a < 157.5) return 'sw'
  if (a < 202.5) return 'w'
  if (a < 247.5) return 'nw'
  if (a < 292.5) return 'n'
  return 'ne'
}

const LABEL_SIDE_CLASS: Record<LabelSide, string> = {
  n: 'left-1/2 bottom-[calc(100%+10px)] -translate-x-1/2 text-center',
  ne: 'left-[calc(100%+10px)] bottom-[calc(100%+2px)]',
  e: 'left-[calc(100%+10px)] top-1/2 -translate-y-1/2',
  se: 'left-[calc(100%+10px)] top-[calc(100%+2px)]',
  s: 'left-1/2 top-[calc(100%+10px)] -translate-x-1/2 text-center',
  sw: 'right-[calc(100%+10px)] top-[calc(100%+2px)] text-right',
  w: 'right-[calc(100%+10px)] top-1/2 -translate-y-1/2 text-right',
  nw: 'right-[calc(100%+10px)] bottom-[calc(100%+2px)] text-right',
}

type StageLayout = {
  w: number
  h: number
  cx: number
  cy: number
  radiusX: number
  radiusY: number
  nodeSize: number
  hubSize: number
  hubNumSize: number
  hubLblSize: number
  positions: NodeLayout[]
}

interface OrbitViewProps {
  tools: Tool[]
  onlineMap: Record<string, boolean>
  onSelect: (id: string) => void
  onLaunch: (id: string) => void
  onAddToRail: (id: string) => void
  isOnRail: (id: string) => boolean
}

export function OrbitView({ tools, onlineMap, onSelect, onLaunch, onAddToRail, isOnRail }: OrbitViewProps) {
  const visible = useMemo(() => tools.filter((t) => !t.removed), [tools])
  const live = visible.filter((t) => onlineMap[t.id]).length
  const stageRef = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState<StageLayout | null>(null)

  function handleOrbitContextMenu(e: MouseEvent, toolId: string) {
    e.preventDefault()
    if (!isOnRail(toolId)) onAddToRail(toolId)
  }

  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    function measure() {
      const r = stage!.getBoundingClientRect()
      const w = r.width
      const h = r.height
      if (w < 40 || h < 40) return

      const cx = w / 2
      const cy = h / 2
      const maxR = Math.min(w, h) / 2
      const nodeSize = clamp(30, maxR * 0.24, 52)
      const hubSize = clamp(60, maxR * 0.46, 108)
      const labelPad = 52
      const maxRx = w / 2 - nodeSize / 2 - 12
      const maxRy = h / 2 - nodeSize / 2 - labelPad
      const radiusX = Math.max(52, maxRx)
      const radiusY = Math.max(28, Math.min(maxRy, radiusX * 0.55))
      const count = visible.length || 1

      const positions: NodeLayout[] = visible.map((_, i) => {
        const angleDeg = -90 + i * (360 / count)
        const angle = angleDeg * (Math.PI / 180)
        const x = cx + radiusX * Math.cos(angle)
        const y = cy + radiusY * Math.sin(angle)
        return { x, y, angleDeg, labelSide: labelSideForAngle(angleDeg) }
      })

      setLayout({
        w,
        h,
        cx,
        cy,
        radiusX,
        radiusY,
        nodeSize,
        hubSize,
        hubNumSize: hubSize * 0.3,
        hubLblSize: hubSize * 0.115,
        positions,
      })
    }

    measure()
    const ro = new ResizeObserver(() => measure())
    ro.observe(stage)
    return () => ro.disconnect()
  }, [visible])

  return (
    <section className="relative flex h-full min-h-0 flex-col items-center">
      <div className="flex shrink-0 flex-col items-center gap-1 px-2 pt-1 sm:gap-1.5 max-[860px]:px-1">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-brass/35 bg-brass/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-brass">
          <span className="h-1.5 w-1.5 rounded-full bg-brass shadow-[0_0_6px_rgb(var(--accent-brass)/0.65)]" />
          Control Center · {visible.length} tools · {live} available
        </span>
        <h1 className="text-center text-[clamp(16px,2.8vh,30px)] font-bold tracking-tight text-snow max-[860px]:text-lg">
          Explore your tools
        </h1>
        <p className="text-center text-[clamp(11px,1.3vh,13px)] text-mist">
          Click to open a tool. Double-click to launch - or press{' '}
          <kbd className="rounded border border-lineStrong bg-lift px-1.5 py-0.5 font-mono text-[11px] text-snow">
            /
          </kbd>{' '}
          to jump.
        </p>
      </div>

      <div
        ref={stageRef}
        className="relative min-h-0 w-full max-w-[900px] flex-1 py-1 max-[860px]:max-h-[min(52vh,420px)]"
      >
        {!layout ? (
          <OrbitStageSkeleton />
        ) : (
          <>
            <div
              className="pointer-events-none absolute inset-0 animate-hubGlow rounded-2xl bg-[radial-gradient(circle_at_50%_50%,rgb(var(--accent-brass)/0.18),transparent_58%)]"
              aria-hidden
            />
            <svg
              className="pointer-events-none absolute inset-0 overflow-visible"
              width={layout.w}
              height={layout.h}
              aria-hidden
            >
              <defs>
                <radialGradient id="orbitCoreGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" style={{ stopColor: 'rgb(var(--accent-brass) / 0.38)' }} />
                  <stop offset="100%" style={{ stopColor: 'rgb(var(--accent-brass) / 0)' }} />
                </radialGradient>
              </defs>
              <ellipse
                cx={layout.cx}
                cy={layout.cy}
                rx={layout.radiusX}
                ry={layout.radiusY}
                fill="none"
                strokeWidth={1.2}
                strokeDasharray="2 8"
                className="animate-orbitRingBreath"
                style={{ stroke: 'rgb(var(--accent-brass) / 0.28)' }}
              />
              <ellipse
                cx={layout.cx}
                cy={layout.cy}
                rx={Math.max(24, layout.radiusX - layout.nodeSize * 1.1)}
                ry={Math.max(20, layout.radiusY - layout.nodeSize * 1.1)}
                fill="none"
                strokeWidth={1}
                className="animate-orbitRingBreath"
                style={{ animationDelay: '1.1s', stroke: 'rgb(var(--border-color) / 0.25)' }}
              />
              <circle
                cx={layout.cx}
                cy={layout.cy}
                r={layout.hubSize * 0.72}
                fill="url(#orbitCoreGlow)"
                className="animate-hubGlow"
              />
              {layout.positions.map((pos, i) => {
                const t = visible[i]
                if (!t) return null
                return (
                  <line
                    key={t.id}
                    x1={layout.cx}
                    y1={layout.cy}
                    x2={pos.x}
                    y2={pos.y}
                    stroke={t.accent}
                    strokeWidth={1.2}
                    className="animate-orbitLineBreath"
                    style={{ animationDelay: `${i * 0.22}s` }}
                  />
                )
              })}
            </svg>

            <div
              className="absolute flex flex-col items-center justify-center rounded-full border border-brass/30 bg-[radial-gradient(circle_at_50%_38%,var(--bg-card),var(--bg-input))] shadow-glow"
              style={{
                left: layout.cx,
                top: layout.cy,
                width: layout.hubSize,
                height: layout.hubSize,
                transform: 'translate(-50%, -50%)',
                boxShadow:
                  '0 20px 50px -18px rgb(var(--accent-brass) / 0.35), inset 0 0 0 1px rgba(255,255,255,0.02)',
              }}
            >
              <span
                className="pointer-events-none absolute inset-0 animate-pulseRing rounded-full border border-brass/45"
                aria-hidden
              />
              <span
                className="font-bold leading-none tabular-nums text-snow"
                style={{ fontSize: layout.hubNumSize }}
              >
                {visible.length}
              </span>
              <span
                className="mt-1 font-mono uppercase tracking-[0.18em] text-brass"
                style={{ fontSize: layout.hubLblSize }}
              >
                ToolsAI
              </span>
            </div>

            {visible.map((t, i) => {
              const pos = layout.positions[i]
              if (!pos) return null
              const iconSize = Math.round(layout.nodeSize * 0.52)
              return (
                <div
                  key={t.id}
                  className="absolute"
                  style={{
                    left: pos.x,
                    top: pos.y,
                    width: layout.nodeSize,
                    height: layout.nodeSize,
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <button
                    type="button"
                    aria-label={`Open ${t.name}`}
                    title={`${shortName(t.name)} - right-click to add to side panel`}
                    onClick={() => onSelect(t.id)}
                    onDoubleClick={() => onLaunch(t.id)}
                    onContextMenu={(e) => handleOrbitContextMenu(e, t.id)}
                    className="relative flex h-full w-full items-center justify-center rounded-[13px] border transition duration-150 hover:scale-[1.08] focus-visible:scale-[1.08]"
                    style={{
                      backgroundColor: `${t.accent}26`,
                      borderColor: `${t.accent}73`,
                      color: readableToolAccent(t.accent),
                    }}
                  >
                    <ToolIcon id={t.icon} size={iconSize} />
                    {onlineMap[t.id] ? (
                      <span
                        className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-phosphor ring-2 ring-ink"
                        style={{ boxShadow: '0 0 7px 1px rgba(110, 231, 183, 0.85)' }}
                      />
                    ) : null}
                  </button>
                  <div
                    className={[
                      'pointer-events-none absolute max-w-[120px] whitespace-nowrap text-[10px] leading-none text-mist sm:text-[11px]',
                      LABEL_SIDE_CLASS[pos.labelSide],
                    ].join(' ')}
                  >
                    {shortName(t.name)}
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>


    </section>
  )
}

function shortName(name: string): string {
  const map: Record<string, string> = {
    'Newsletter Sender': 'Newsletter',
    'AI Lead Finder': 'Lead Finder',
    'Recipe Health': 'Health',
    'Recipe Factory': 'Factory',
    'Tavo Knyga UI': 'Tavo Knyga',
    'Video Creator': 'Video',
    'Motion Blur': 'Motion Blur',
    'Gmail Script': 'Gmail',
    'DC Scraper': 'DC Scraper',
    'SEO Blog Pipeline': 'SEO Blog',
    'UGC Slides': 'UGC Slides',
    'Autoplius Tracker': 'Autoplius',
    'Video Metadata Stripper': 'Video cleanup',
    'Picture Metadata Stripper': 'Photo cleanup',
    'Metadata Stripper → Discord': 'Discord uploader',
    Reddit: 'Reddit',
  }
  return map[name] || name
}
