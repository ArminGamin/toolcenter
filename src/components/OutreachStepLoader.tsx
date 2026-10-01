import { useMemo, useState } from 'react'
import type { OutreachStage, OutreachStatus } from '../lib/outreach'
import './OutreachStepLoader.css'

const STEP_NAMES = ['Find', 'Leads', 'Clean', 'Approve'] as const

const CHECK_SVG = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

type StepVisual = 'pending' | 'running' | 'done'

const RING_LEN = 94.2

function formatElapsed(ms: number): string {
  const s = ms / 1000
  const mm = String(Math.floor(s / 60)).padStart(2, '0')
  const ss = String(Math.floor(s % 60)).padStart(2, '0')
  return `${mm}:${ss}`
}

/**
 * Find tracks live found/target while scraping.
 * Clean + Approve intentionally jump when auto-approve finishes in one tick.
 */
function deriveSteps(opts: {
  stage?: OutreachStage
  status?: OutreachStatus
  found: number
  leadTarget: number
  kept: number
  dropped: number
  approved: number
  findChildRunning: boolean
}): { visuals: StepVisual[]; fills: number[]; activeIndex: number; within: number } {
  const {
    stage,
    status,
    found,
    leadTarget,
    kept,
    dropped,
    approved,
    findChildRunning,
  } = opts

  const visuals: StepVisual[] = ['pending', 'pending', 'pending', 'pending']
  const fills = [0, 0, 0, 0]
  let activeIndex = -1
  let within = 0

  if (!stage || stage === 'idle') {
    return { visuals, fills, activeIndex, within }
  }

  const finding =
    findChildRunning ||
    (stage === 'find' && (status === 'running' || status === 'idle'))

  // -- Find: fill ring from live lead count --
  if (finding) {
    const findPct =
      leadTarget > 0
        ? Math.min(1, found / leadTarget)
        : Math.min(0.9, 0.1 + found * 0.04)
    // Visible motion before first email; then grow with found/target.
    within = found === 0 ? 0.06 : Math.max(0.12, findPct)
    activeIndex = 0
    visuals[0] = 'running'
    fills[0] = within * 100
    return { visuals, fills, activeIndex, within }
  }

  const hasLeads = found > 0
  const cleaned =
    kept + dropped > 0 ||
    stage === 'approve' ||
    stage === 'send' ||
    stage === 'done' ||
    status === 'waiting' ||
    status === 'sending' ||
    status === 'paused'
  const approvedDone =
    approved > 0 ||
    stage === 'send' ||
    stage === 'done' ||
    status === 'sending' ||
    status === 'paused' ||
    (status === 'waiting' && stage !== 'approve')
  const waitingManualApprove = status === 'waiting' && stage === 'approve'

  visuals[0] = hasLeads || stage !== 'find' ? 'done' : 'pending'
  fills[0] = visuals[0] === 'done' ? 100 : 0

  if (!hasLeads) {
    activeIndex = 0
    within = 1
    return { visuals, fills, activeIndex, within }
  }

  // -- Leads seen --
  visuals[1] = 'done'
  fills[1] = 100

  // Manual approve gate - only pause here when requireApprove is on
  if (waitingManualApprove) {
    activeIndex = 3
    within = approved > 0 ? Math.min(1, approved / Math.max(kept, 1)) : 0.25
    visuals[2] = cleaned ? 'done' : 'running'
    visuals[3] = 'running'
    fills[2] = visuals[2] === 'done' ? 100 : within * 100
    fills[3] = within * 100
    return { visuals, fills, activeIndex, within }
  }

  // Brief clean tick (rare - auto path usually skips straight to send)
  if (stage === 'clean' && status === 'running') {
    activeIndex = 2
    within = found > 0 ? Math.min(1, (kept + dropped) / Math.max(found, 1)) : 0.5
    visuals[2] = 'running'
    fills[2] = Math.max(20, within * 100)
    return { visuals, fills, activeIndex, within }
  }

  // -- Clean + Approve jump done (auto-approve / send / paused / done) --
  activeIndex = 4
  within = 1
  visuals[2] = cleaned ? 'done' : 'pending'
  visuals[3] = approvedDone ? 'done' : cleaned ? 'done' : 'pending'
  fills[2] = visuals[2] === 'done' ? 100 : 0
  fills[3] = visuals[3] === 'done' ? 100 : 0
  return { visuals, fills, activeIndex, within }
}

export function OutreachStepLoader({
  stage,
  status,
  found = 0,
  leadTarget = 0,
  kept = 0,
  dropped = 0,
  approved = 0,
  findChildRunning = false,
  elapsedMs = null,
  chainActive = false,
}: {
  stage?: OutreachStage
  status?: OutreachStatus
  found?: number
  leadTarget?: number
  kept?: number
  dropped?: number
  approved?: number
  findChildRunning?: boolean
  elapsedMs?: number | null
  chainActive?: boolean
}) {
  const [animKey, setAnimKey] = useState(0)

  const { visuals, fills, activeIndex } = useMemo(
    () =>
      deriveSteps({
        stage,
        status,
        found,
        leadTarget,
        kept,
        dropped,
        approved,
        findChildRunning,
      }),
    [stage, status, found, leadTarget, kept, dropped, approved, findChildRunning],
  )

  const finding = visuals[0] === 'running'
  const pipelineComplete = activeIndex >= STEP_NAMES.length
  const paused = status === 'paused'
  const waiting = status === 'waiting'
  const running =
    !paused &&
    (Boolean(chainActive && status !== 'error' && status !== 'done') ||
      status === 'running' ||
      status === 'sending' ||
      findChildRunning ||
      finding)
  const complete =
    pipelineComplete &&
    visuals.every((v) => v === 'done') &&
    (status === 'done' || stage === 'done')

  const doneCount = visuals.filter((v) => v === 'done').length
  const runningFrac = visuals.findIndex((v) => v === 'running')
  const progressPct = complete
    ? 100
    : runningFrac >= 0
      ? ((runningFrac + fills[runningFrac] / 100) / STEP_NAMES.length) * 100
      : (doneCount / STEP_NAMES.length) * 100

  const pillLabel = complete
    ? 'Complete'
    : paused
      ? 'Paused'
      : waiting
        ? 'Waiting'
        : running
          ? 'Running'
          : 'Idle'
  const pillClass = complete
    ? 'oa-step-loader__pill--complete'
    : paused || waiting
      ? 'oa-step-loader__pill--idle'
      : running
        ? ''
        : 'oa-step-loader__pill--idle'

  const footerText = useMemo(() => {
    if (complete) return <>All <b>{STEP_NAMES.length}</b> steps done</>
    if (pipelineComplete && status === 'sending') return <>Sending emails…</>
    if (status === 'paused') return <>Paused</>
    if (!stage || stage === 'idle') return <>Ready to <b>Start</b></>
    if (finding) {
      const target = leadTarget > 0 ? leadTarget : '…'
      const progressFound = leadTarget > 0 ? Math.min(found, leadTarget) : found
      return (
        <>
          Finding <b>{progressFound}</b> / {target}
        </>
      )
    }
    if (activeIndex < 0) return <>Waiting to <b>start</b></>
    if (activeIndex < STEP_NAMES.length) {
      return (
        <>
          Step <b>{activeIndex + 1}</b> of {STEP_NAMES.length} - {STEP_NAMES[activeIndex]}
        </>
      )
    }
    return <>Pipeline ready</>
  }, [activeIndex, complete, finding, found, leadTarget, pipelineComplete, stage, status])

  const timerLabel = elapsedMs != null ? formatElapsed(elapsedMs) : '00:00'

  return (
    <div className="oa-step-loader" key={animKey}>
      <div className="oa-step-loader__card">
        <div className="oa-step-loader__head">
          <div>
            <span className="oa-step-loader__eyebrow">Pipeline</span>
            <span className="oa-step-loader__title">Outreach Autopilot</span>
          </div>
          <div className="oa-step-loader__head-right">
            <div className={`oa-step-loader__pill ${pillClass}`} role="status" aria-live="polite">
              {running && !complete ? <span className="oa-step-loader__pill-dot" /> : null}
              <span>{pillLabel}</span>
            </div>
            <span className="oa-step-loader__timer">
              {complete ? <b>{timerLabel}</b> : timerLabel}
            </span>
          </div>
        </div>

        <div className="oa-step-loader__steps">
          {STEP_NAMES.map((name, i) => {
            const visual = visuals[i]
            const fill = fills[i]
            const ring =
              visual === 'done' ? 1 : visual === 'running' ? Math.max(0.08, fill / 100) : 0
            const indeterminate = visual === 'running' && i === 0 && found === 0
            return (
              <div
                key={name}
                className={[
                  'oa-step-loader__step',
                  visual === 'running' ? 'oa-step-loader__step--running' : '',
                  visual === 'done' ? 'oa-step-loader__step--done' : '',
                  indeterminate ? 'oa-step-loader__step--indeterminate' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{
                  animationDelay: `${i * 70}ms`,
                  ['--connector-fill' as string]: String(fill),
                }}
              >
                <div className="oa-step-loader__indicator">
                  <svg className="oa-step-loader__ring-svg" viewBox="0 0 36 36" aria-hidden>
                    <circle className="oa-step-loader__ring-track" cx="18" cy="18" r="15" />
                    <circle
                      className="oa-step-loader__ring-progress"
                      cx="18"
                      cy="18"
                      r="15"
                      style={
                        indeterminate
                          ? undefined
                          : { strokeDashoffset: RING_LEN * (1 - ring) }
                      }
                    />
                  </svg>
                  <div className="oa-step-loader__check-circle">{CHECK_SVG}</div>
                </div>
                <div className="oa-step-loader__label">
                  <span className="oa-step-loader__name">{name}</span>
                  {visual === 'running' && i === 0 ? (
                    <span className="oa-step-loader__meta">
                      {leadTarget > 0 ? Math.min(found, leadTarget) : found}
                      {leadTarget > 0 ? ` / ${leadTarget}` : ''}
                    </span>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>

        <div className="oa-step-loader__footer">
          <div className="oa-step-loader__progress-track">
            <div className="oa-step-loader__progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="oa-step-loader__footer-row">
            <span className="oa-step-loader__footer-text">{footerText}</span>
            <button
              type="button"
              className="rounded-md border border-lineStrong bg-raised px-2.5 py-1 font-mono text-[10px] text-fog transition hover:border-teal/40 hover:bg-teal/10 hover:text-snow"
              onClick={() => setAnimKey((k) => k + 1)}
            >
              Replay
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
