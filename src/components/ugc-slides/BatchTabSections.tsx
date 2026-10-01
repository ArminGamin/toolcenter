import { SLIDE_OPTS, formatBatchElapsed, BatchLabel } from './batch-shared'
import {
    clearUgcBatchRun
} from '../../lib/ugc-batch-run'
import { ErrorRetryCallout, inputCls } from '../ui/primitives'
import type { UgcSlidesBatchTabVm } from './useUgcSlidesBatchTab'

export function BatchSourceColumn({ vm }: { vm: UgcSlidesBatchTabVm }) {
  const { canvasRef, slideHeight, slideWidth } = vm
  return (
    <canvas ref={canvasRef} className="hidden" width={slideWidth} height={slideHeight} />
  )
}

export function BatchSettingsCard({ vm }: { vm: UgcSlidesBatchTabVm }) {
  const { batchBusy, batchError, draft, onBrowseOutput, onGenerateBatch, outputOptional, patchPrefs, prefs, tokenReady } = vm
  return (
    <section className="fit-scroll min-w-0 rounded-2xl border border-line bg-panel p-5 sm:p-6">
      <p className="mb-5 text-sm text-fog">
        Generate multiple posts into separate folders (slides + caption.txt). Copy is Lithuanian.
      </p>
    
      {batchError && (
        <div className="mb-4">
          <ErrorRetryCallout title={batchError} onRetry={() => void onGenerateBatch()} />
        </div>
      )}
    
      <div className="grid grid-cols-1 gap-y-1">
        <BatchLabel>Posts to generate</BatchLabel>
        <input
          className={`${inputCls} mb-3`}
          value={prefs.batchCount}
          onChange={(e) => patchPrefs({ batchCount: e.target.value })}
          placeholder="10"
          disabled={batchBusy}
        />
    
        <BatchLabel>Slides per post</BatchLabel>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select
            className={`${inputCls} !w-[88px]`}
            value={prefs.slideMin}
            onChange={(e) => patchPrefs({ slideMin: e.target.value })}
            disabled={batchBusy}
          >
            {SLIDE_OPTS.map((v) => (
              <option key={`min-${v}`} value={v}>
                {v}
              </option>
            ))}
          </select>
          <span className="text-fog">-</span>
          <select
            className={`${inputCls} !w-[88px]`}
            value={prefs.slideMax}
            onChange={(e) => patchPrefs({ slideMax: e.target.value })}
            disabled={batchBusy}
          >
            {SLIDE_OPTS.map((v) => (
              <option key={`max-${v}`} value={v}>
                {v}
              </option>
            ))}
          </select>
          <span className="font-mono text-[11px] text-fog">slides (random)</span>
        </div>
    
        <BatchLabel>{outputOptional ? 'Output folder (optional)' : 'Output folder'}</BatchLabel>
        <div className="mb-3 flex gap-2">
          <input
            className={`${inputCls} min-w-0 flex-1`}
            value={prefs.outputFolder}
            onChange={(e) => patchPrefs({ outputFolder: e.target.value })}
            placeholder="D:\ugc-batch-vision\batch"
            disabled={batchBusy}
          />
          <button
            type="button"
            onClick={() => void onBrowseOutput()}
            disabled={batchBusy}
            className="shrink-0 rounded-lg border border-lineStrong bg-well px-4 py-2 font-mono text-[11px] uppercase tracking-wide text-mist hover:border-brass/30"
          >
            Browse
          </button>
        </div>
    
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={prefs.postToDiscord}
              onChange={(e) => patchPrefs({ postToDiscord: e.target.checked })}
              disabled={batchBusy || !tokenReady}
              className="accent-brass"
            />
            <span className="font-mono text-[11px] uppercase tracking-wide text-mist">
              Post to Discord
            </span>
          </label>
          <span className="font-mono text-[10px] text-fog">
            {!tokenReady
              ? 'Configure in Settings tab'
              : !draft.discordGuildId.trim()
                ? 'Add guild ID in Settings'
                : ''}
          </span>
        </div>
      </div>
    
    </section>
  )
}

export function BatchRunCard({ vm }: { vm: UgcSlidesBatchTabVm }) {
  const { auditStatus, batchBusy, batchElapsedSec, batchProgress, batchRunId, batchStatus, canUseImages, estimate, lastBatchAbsPath, onGenerateBatch, onOpenBatchFolder, requestBatchAbort, resultsText, setBatchElapsedSec, setBatchRunId, setBatchStatus, setResultLines } = vm
  return (
    <section className="flex min-h-0 min-w-0 flex-col self-stretch rounded-2xl border border-line bg-panel p-5 sm:p-6">
      <p className="mb-3 font-mono text-[11px] text-fog">{estimate}</p>
      {batchRunId && batchBusy && (
        <p className="mb-2 font-mono text-[10px] text-fog/70">Run {batchRunId.slice(0, 8)}…</p>
      )}
      <p className="mb-3 font-mono text-[10px] text-fog/80">
        {auditStatus?.active
          ? `Vision capture ON (${auditStatus.completed}/${auditStatus.target} done, ${auditStatus.remaining} left) → D:\\ugc-batch-vision\\`
          : auditStatus
            ? `Vision capture idle - batch start auto-resets audit → D:\\ugc-batch-vision\\`
            : `Vision capture → D:\\ugc-batch-vision\\ (audit + batch + pc-logs)`}
      </p>
    
      {(batchBusy || batchElapsedSec > 0) && (
        <p className="mb-2 font-mono text-[13px] tabular-nums text-brass">
          <span className="text-[10px] uppercase tracking-wide text-fog">
            {batchBusy ? 'Elapsed' : 'Finished in'}
          </span>{' '}
          {formatBatchElapsed(batchElapsedSec)}
        </p>
      )}
    
      <div className="mb-2 h-2 overflow-hidden rounded-full bg-well">
        <div
          className="h-full rounded-full bg-brass transition-all"
          style={{ width: `${Math.round(batchProgress * 100)}%` }}
        />
      </div>
      {batchStatus && (
        <p className="mb-4 font-mono text-[11px] text-phosphor">{batchStatus}</p>
      )}
    
      <div className="mb-6 flex gap-2">
        <button
          type="button"
          disabled={batchBusy || !canUseImages}
          onClick={() => void onGenerateBatch()}
          className="flex min-h-[44px] flex-1 items-center justify-center rounded-lg border border-brass/50 bg-brass/20 px-4 py-2.5 font-mono text-[12px] font-semibold uppercase tracking-wide text-brass disabled:opacity-50"
        >
          {batchBusy ? 'Generating batch…' : 'Generate batch'}
        </button>
        {batchBusy ? (
          <button
            type="button"
            onClick={requestBatchAbort}
            className="min-h-[44px] shrink-0 rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2.5 font-mono text-[12px] font-semibold uppercase tracking-wide text-red-300 hover:bg-red-500/20"
          >
            Abort
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void clearUgcBatchRun().then(() => {
              setBatchRunId(null)
              setResultLines([])
              setBatchStatus('')
              setBatchElapsedSec(0)
            })}
            className="min-h-[44px] shrink-0 rounded-lg border border-lineStrong bg-well px-4 py-2.5 font-mono text-[12px] uppercase tracking-wide text-mist"
          >
            Clear
          </button>
        )}
      </div>
    
      <h3 className="mb-2 text-sm font-semibold text-snow">Results</h3>
      <textarea
        readOnly
        value={resultsText}
        placeholder="Batch results will appear here…"
        className={`${inputCls} mb-3 min-h-[280px] flex-1 resize-none min-[1180px]:min-h-[160px] font-mono text-[11px] leading-relaxed`}
      />
    
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!lastBatchAbsPath || batchBusy}
          onClick={() => void onOpenBatchFolder()}
          className="min-h-[40px] flex-1 rounded-lg border border-lineStrong bg-well px-4 py-2 font-mono text-[11px] uppercase tracking-wide text-mist disabled:opacity-40"
        >
          Open batch folder
        </button>
      </div>
    </section>
  )
}
