import { useMemo, useState } from 'react'
import type { RedditCommenterRun, RedditCommenterStatus } from '../lib/reddit-commenter'
import './OutreachStepLoader.css'

const STEP_NAMES = ['Subs', 'Scan', 'Approve', 'Post'] as const
const RING_LEN = 94.2

const CHECK_SVG = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

type StepVisual = 'pending' | 'running' | 'done'

function isRunActive(status?: RedditCommenterStatus, workerRunning = false): boolean {
  if (status === 'error') return false
  return workerRunning || status === 'running' || status === 'waiting_login' || status === 'paused'
}

function formatElapsed(ms: number): string {
  const s = ms / 1000
  const mm = String(Math.floor(s / 60)).padStart(2, '0')
  const ss = String(Math.floor(s % 60)).padStart(2, '0')
  return `${mm}:${ss}`
}

function deriveSteps(opts: {
  mode?: RedditCommenterRun['mode']
  status?: RedditCommenterStatus
  subredditCount: number
  selectedCount: number
  scanned: number
  scanTotal: number
  matched: number
  pendingCount: number
  approvedCount: number
  postedCount: number
  autoPost: boolean
  workerRunning: boolean
  runError?: string | null
}) {
  const {
    mode,
    status,
    subredditCount,
    selectedCount,
    scanned,
    scanTotal,
    matched,
    pendingCount,
    approvedCount,
    postedCount,
    autoPost,
    workerRunning,
  } = opts

  const visuals: StepVisual[] = ['pending', 'pending', 'pending', 'pending']
  const fills = [0, 0, 0, 0]
  let activeIndex = -1

  const running = isRunActive(status, workerRunning)
  const subsReady = subredditCount > 0
  const hasQueue = matched > 0 || pendingCount > 0 || approvedCount > 0 || postedCount > 0
  const scanDone = hasQueue || (status === 'done' && (mode === 'scan' || mode === 'scan-and-post')) || mode === 'post'
  const approveDone = approvedCount > 0 || postedCount > 0 || (autoPost && scanDone && pendingCount === 0 && hasQueue)
  const postDone = postedCount > 0 && status === 'done'

  if (status === 'error') {
    if (subsReady) {
      visuals[0] = 'done'
      fills[0] = 100
    }
    if (scanDone || matched > 0 || scanned > 0) {
      visuals[1] = scanDone || matched > 0 ? 'done' : 'pending'
      fills[1] =
        scanDone || matched > 0
          ? 100
          : scanTotal > 0
            ? Math.min(100, (scanned / Math.max(scanTotal, 1)) * 100)
            : 0
    }
    if (approveDone || approvedCount > 0) {
      visuals[2] = 'done'
      fills[2] = 100
    }
    if (postedCount > 0) {
      visuals[3] = postDone ? 'done' : 'pending'
      fills[3] = Math.min(100, (postedCount / Math.max(approvedCount || 1, 1)) * 100)
    }
    return { visuals, fills, activeIndex: -1 }
  }

  if (!mode && status === 'idle' && !running) {
    if (subsReady) {
      visuals[0] = 'done'
      fills[0] = 100
    }
    if (hasQueue) {
      visuals[0] = 'done'
      fills[0] = 100
      visuals[1] = 'done'
      fills[1] = 100
      if (pendingCount > 0 && !autoPost) {
        activeIndex = 2
        visuals[2] = 'running'
        fills[2] = approvedCount > 0 ? Math.min(100, (approvedCount / Math.max(pendingCount + approvedCount, 1)) * 100) : 25
      } else if (approvedCount > 0) {
        visuals[2] = 'done'
        fills[2] = 100
        activeIndex = 3
        visuals[3] = 'pending'
      }
    }
    return { visuals, fills, activeIndex }
  }

  if (mode === 'refresh-subreddits' || mode === 'join-subreddits') {
    activeIndex = running ? 0 : -1
    visuals[0] = running ? 'running' : status === 'done' ? 'done' : 'pending'
    fills[0] = status === 'done' ? 100 : running ? 60 : 0
    if (status === 'done') visuals[0] = 'done'
    return { visuals, fills, activeIndex }
  }

  visuals[0] = subsReady ? 'done' : 'pending'
  fills[0] = visuals[0] === 'done' ? 100 : 0

  if (mode === 'scan' || (mode === 'scan-and-post' && !postDone && postedCount === 0 && !(running && approvedCount > 0))) {
    const inPostPhase =
      mode === 'scan-and-post' &&
      running &&
      (approvedCount > 0 || (autoPost && pendingCount === 0 && scanDone))
    if (!inPostPhase) {
      activeIndex = running ? 1 : -1
      const total = Math.max(scanTotal || selectedCount || 1, 1)
      const pct = scanTotal > 0 ? Math.min(1, scanned / total) : matched > 0 ? 1 : 0.15
      visuals[1] = running ? 'running' : status === 'done' ? 'done' : 'pending'
      fills[1] = status === 'done' ? 100 : running ? Math.max(12, pct * 100) : pct > 0 ? Math.max(12, pct * 100) : 0
      if (status === 'done') {
        visuals[1] = 'done'
        if (mode === 'scan') {
          activeIndex = 2
          if (pendingCount > 0 && !autoPost) {
            visuals[2] = 'running'
            fills[2] = 35
          } else {
            visuals[2] = 'done'
            fills[2] = 100
          }
        }
      }
      return { visuals, fills, activeIndex }
    }
  }

  visuals[1] = scanDone || matched > 0 ? 'done' : visuals[1]
  fills[1] = visuals[1] === 'done' ? 100 : fills[1]

  if (mode === 'post' || (mode === 'scan-and-post' && (running || postDone))) {
    if (!autoPost) {
      activeIndex = 2
      if (approveDone || approvedCount > 0) {
        visuals[2] = 'done'
        fills[2] = 100
      } else if (pendingCount > 0) {
        visuals[2] = 'running'
        fills[2] = 30
      } else {
        visuals[2] = 'done'
        fills[2] = 100
      }
    } else {
      visuals[2] = 'done'
      fills[2] = 100
    }

    activeIndex = 3
    visuals[3] = running && !postDone ? 'running' : postDone ? 'done' : 'pending'
    const postTarget = Math.max(approvedCount || pendingCount || 1, 1)
    fills[3] =
      postDone ? 100 : postedCount > 0 ? Math.min(95, (postedCount / postTarget) * 100) : running ? 20 : 0
    if (postDone) visuals[3] = 'done'
    return { visuals, fills, activeIndex }
  }

  if (subsReady) {
    visuals[0] = 'done'
    fills[0] = 100
  }
  if (scanDone) {
    visuals[1] = 'done'
    fills[1] = 100
  }
  if (approveDone) {
    visuals[2] = 'done'
    fills[2] = 100
  }
  if (postDone) {
    visuals[3] = 'done'
    fills[3] = 100
    activeIndex = 4
  }

  return { visuals, fills, activeIndex }
}

export function RedditCommenterStepLoader({
  mode,
  status = 'idle',
  subredditCount = 0,
  selectedCount = 0,
  scanned = 0,
  scanTotal = 0,
  matched = 0,
  pendingCount = 0,
  approvedCount = 0,
  postedCount = 0,
  autoPost = false,
  workerRunning = false,
  elapsedMs = null,
  runError = null,
}: {
  mode?: RedditCommenterRun['mode']
  status?: RedditCommenterStatus
  subredditCount?: number
  selectedCount?: number
  scanned?: number
  scanTotal?: number
  matched?: number
  pendingCount?: number
  approvedCount?: number
  postedCount?: number
  autoPost?: boolean
  workerRunning?: boolean
  elapsedMs?: number | null
  runError?: string | null
}) {
  const [animKey, setAnimKey] = useState(0)

  const { visuals, fills, activeIndex } = useMemo(
    () =>
      deriveSteps({
        mode,
        status,
        subredditCount,
        selectedCount,
        scanned,
        scanTotal,
        matched,
        pendingCount,
        approvedCount,
        postedCount,
        autoPost,
        workerRunning,
      }),
    [
      mode,
      status,
      subredditCount,
      selectedCount,
      scanned,
      scanTotal,
      matched,
      pendingCount,
      approvedCount,
      postedCount,
      autoPost,
      workerRunning,
    ],
  )

  const running = isRunActive(status, workerRunning)
  const complete = status === 'done' && postedCount > 0 && visuals.every((v) => v === 'done')
  const aborted = status === 'error' && runError === 'aborted'
  const doneCount = visuals.filter((v) => v === 'done').length
  const runningFrac = visuals.findIndex((v) => v === 'running')
  const barPct = complete
    ? 100
    : runningFrac >= 0
      ? ((runningFrac + fills[runningFrac] / 100) / STEP_NAMES.length) * 100
      : (doneCount / STEP_NAMES.length) * 100

  const pillLabel = complete
    ? 'Complete'
    : aborted
      ? 'Aborted'
      : status === 'paused'
        ? 'Paused'
        : status === 'waiting_login'
          ? 'Login'
          : running
            ? 'Running'
            : status === 'error'
              ? 'Error'
              : 'Idle'

  const pillClass = complete
    ? 'oa-step-loader__pill--complete'
    : aborted || status === 'error'
      ? 'oa-step-loader__pill--idle'
      : running
        ? ''
        : 'oa-step-loader__pill--idle'

  const timerLabel = elapsedMs != null ? formatElapsed(elapsedMs) : '00:00'

  const footerText = useMemo(() => {
    if (aborted) return <>Run <b>aborted</b></>
    if (complete) return <>Posted <b>{postedCount}</b> comments</>
    if (status === 'waiting_login') return <>Log in, then <b>Continue</b></>
    if (!mode && status === 'idle' && !workerRunning) {
      if (!subredditCount) return <>Ready to <b>refresh subs</b></>
      if (pendingCount > 0) return <><b>{pendingCount}</b> drafts to approve</>
      return <>Ready to <b>scan</b></>
    }
    if (mode === 'refresh-subreddits' && running) return <>Refreshing <b>subreddits</b>…</>
    if (mode === 'join-subreddits' && running) return <>Joining <b>subreddits</b>…</>
    if ((mode === 'scan' || mode === 'scan-and-post') && running && activeIndex <= 1) {
      return (
        <>
          Scanning <b>{scanned}</b>
          {scanTotal > 0 ? ` / ${scanTotal}` : ''} · <b>{matched}</b> matches
        </>
      )
    }
    if (mode === 'post' || (mode === 'scan-and-post' && activeIndex >= 3)) {
      return (
        <>
          Posting <b>{postedCount}</b>
          {approvedCount > 0 ? ` / ${approvedCount}` : ''}
        </>
      )
    }
    if (activeIndex >= 0 && activeIndex < STEP_NAMES.length) {
      return (
        <>
          Step <b>{activeIndex + 1}</b> - {STEP_NAMES[activeIndex]}
        </>
      )
    }
    if (status === 'done' && matched > 0) return <><b>{matched}</b> matches in queue</>
    return <>Ready to <b>start</b></>
  }, [
    activeIndex,
    approvedCount,
    aborted,
    complete,
    matched,
    mode,
    pendingCount,
    postedCount,
    running,
    scanTotal,
    scanned,
    status,
    subredditCount,
    workerRunning,
  ])

  return (
    <div className="oa-step-loader" key={animKey}>
      <div className="oa-step-loader__card">
        <div className="oa-step-loader__head">
          <div>
            <span className="oa-step-loader__eyebrow">Pipeline</span>
            <span className="oa-step-loader__title">Reddit Commenter</span>
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
            const indeterminate = visual === 'running' && i === 1 && scanned === 0 && matched === 0
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
                  {i === 0 && subredditCount > 0 ? (
                    <span className="oa-step-loader__meta">{subredditCount}</span>
                  ) : null}
                  {i === 1 && (visual === 'running' || matched > 0) ? (
                    <span className="oa-step-loader__meta">{matched}</span>
                  ) : null}
                  {i === 2 && (pendingCount > 0 || approvedCount > 0) ? (
                    <span className="oa-step-loader__meta">
                      {approvedCount}/{pendingCount + approvedCount}
                    </span>
                  ) : null}
                  {i === 3 && postedCount > 0 ? (
                    <span className="oa-step-loader__meta">{postedCount}</span>
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
