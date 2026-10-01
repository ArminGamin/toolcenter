import { useMemo, useState } from 'react'
import type { SeoBlogStage, SeoBlogStatus } from '../lib/seoBlog'
import './OutreachStepLoader.css'

const STEP_NAMES = ['Plan', 'Write', 'Links', 'Publish'] as const
const RING_LEN = 94.2

const CHECK_SVG = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

type StepVisual = 'pending' | 'running' | 'done'

function formatElapsed(ms: number): string {
  const s = ms / 1000
  const mm = String(Math.floor(s / 60)).padStart(2, '0')
  const ss = String(Math.floor(s % 60)).padStart(2, '0')
  return `${mm}:${ss}`
}

function stageToIndex(stage?: SeoBlogStage): number {
  switch (stage) {
    case 'plan':
      return 0
    case 'write':
    case 'qa':
      return 1
    case 'links':
      return 2
    case 'publish':
      return 3
    case 'done':
      return 4
    default:
      return -1
  }
}

function deriveSteps(
  stage?: SeoBlogStage,
  status?: SeoBlogStatus,
  progressPct = 0,
  postCount = 0,
  postsTarget = 2,
) {
  const visuals: StepVisual[] = ['pending', 'pending', 'pending', 'pending']
  const fills = [0, 0, 0, 0]
  if (!stage || stage === 'idle') {
    return { visuals, fills, activeIndex: -1 }
  }
  if (stage === 'error') {
    return { visuals, fills, activeIndex: -1 }
  }

  const idx = stageToIndex(stage)
  const complete = status === 'done' || stage === 'done'
  const writeFill =
    postsTarget > 0
      ? Math.max(8, Math.min(95, Math.round((postCount / postsTarget) * 100)))
      : Math.max(12, Math.min(95, progressPct || 20))

  for (let i = 0; i < STEP_NAMES.length; i++) {
    if (complete || idx > i) {
      visuals[i] = 'done'
      fills[i] = 100
    } else if (idx === i) {
      visuals[i] = 'running'
      fills[i] = i === 1 ? writeFill : Math.max(12, Math.min(95, progressPct || 20))
    }
  }

  return {
    visuals,
    fills,
    activeIndex: complete ? STEP_NAMES.length : idx,
  }
}

export function SeoBlogStepLoader({
  stage,
  status,
  progressPct = 0,
  postCount = 0,
  postsTarget = 2,
  elapsedMs = null,
}: {
  stage?: SeoBlogStage
  status?: SeoBlogStatus
  progressPct?: number
  postCount?: number
  postsTarget?: number
  elapsedMs?: number | null
}) {
  const [animKey, setAnimKey] = useState(0)
  const { visuals, fills, activeIndex } = useMemo(
    () => deriveSteps(stage, status, progressPct, postCount, postsTarget),
    [stage, status, progressPct, postCount, postsTarget],
  )

  const running = status === 'running'
  const complete = status === 'done' || stage === 'done'
  const doneCount = visuals.filter((v) => v === 'done').length
  const runningFrac = visuals.findIndex((v) => v === 'running')
  const barPct = complete
    ? 100
    : runningFrac >= 0
      ? ((runningFrac + fills[runningFrac] / 100) / STEP_NAMES.length) * 100
      : (doneCount / STEP_NAMES.length) * 100

  const pillLabel = complete
    ? 'Complete'
    : running
      ? 'Running'
      : status === 'error'
        ? 'Error'
        : 'Idle'

  const timerLabel = elapsedMs != null ? formatElapsed(elapsedMs) : '00:00'

  return (
    <div className="oa-step-loader" key={animKey}>
      <div className="oa-step-loader__card">
        <div className="oa-step-loader__head">
          <div>
            <span className="oa-step-loader__eyebrow">Pipeline</span>
            <span className="oa-step-loader__title">SEO Blog</span>
          </div>
          <div className="oa-step-loader__head-right">
            <div
              className={`oa-step-loader__pill ${
                complete
                  ? 'oa-step-loader__pill--complete'
                  : running
                    ? ''
                    : 'oa-step-loader__pill--idle'
              }`}
              role="status"
            >
              {running ? <span className="oa-step-loader__pill-dot" /> : null}
              <span>{pillLabel}</span>
            </div>
            <span className="oa-step-loader__timer">{timerLabel}</span>
          </div>
        </div>

        <div className="oa-step-loader__steps">
          {STEP_NAMES.map((name, i) => {
            const visual = visuals[i]
            const fill = fills[i]
            const ring =
              visual === 'done' ? 1 : visual === 'running' ? Math.max(0.08, fill / 100) : 0
            const indeterminate = visual === 'running' && postCount === 0 && i === 1
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
                  {i === 1 && (visual === 'running' || postCount > 0 || complete) ? (
                    <span className="oa-step-loader__meta">
                      {Math.min(postCount, postsTarget)}/{postsTarget}
                    </span>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>

        <div className="oa-step-loader__footer">
          <div className="oa-step-loader__progress-track">
            <div className="oa-step-loader__progress-fill" style={{ width: `${barPct}%` }} />
          </div>
          <div className="oa-step-loader__footer-row">
            <span className="oa-step-loader__footer-text">
              {complete
                ? <>Done - check <b>Review</b> or <b>Posts</b></>
                : !stage || stage === 'idle'
                  ? <>Ready to <b>Start</b></>
                  : activeIndex >= 0 && activeIndex < STEP_NAMES.length
                    ? <>Step <b>{activeIndex + 1}</b> - {STEP_NAMES[activeIndex]}</>
                    : <>Pipeline…</>}
            </span>
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
