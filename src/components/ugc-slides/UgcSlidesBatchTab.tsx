import {
    isChristmasUgcProfile,
    type UgcSlidesDraft
} from '../../lib/ugc-slides'
import { type UgcBatchRunState } from './batch-shared'
import { BatchRunCard, BatchSettingsCard, BatchSourceColumn } from "./BatchTabSections"
import { UgcUniversalDescription, type UgcDescriptionSettings } from './UgcUniversalDescription'
import { useUgcSlidesBatchTab } from "./useUgcSlidesBatchTab"
export type { UgcBatchRunState } from './batch-shared'

export function UgcSlidesBatchTab({
  active,
  draft,
  onDescriptionChange,
  tokenReady,
  testMode,
  onTestModeChange,
  onOpenSettings,
  onRunStateChange,
}: {
  active: boolean
  draft: UgcSlidesDraft
  onDescriptionChange: (settings: Partial<UgcDescriptionSettings>) => void
  tokenReady: boolean
  testMode: boolean
  onTestModeChange: (value: boolean) => void
  onOpenSettings: () => void
  onRunStateChange?: (state: UgcBatchRunState) => void
}) {
    const vm = useUgcSlidesBatchTab({ active, draft, onDescriptionChange, tokenReady, testMode, onTestModeChange, onOpenSettings, onRunStateChange })
    const { batchBusy, fileInputRef, imageError, imageMeterPct, imagePoolStatus, meterPct, onOpenImageFolder, onPickFiles, onResetPool, poolStatus, resetBusy, themeAvailableDisplay } = vm
  return (
    <div className="fit-body grid items-start gap-6 pb-6 min-[1180px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)] min-[1180px]:pb-0">
      <BatchSourceColumn vm={vm} />
      <div className="fit-scroll min-w-0 space-y-6">
      {isChristmasUgcProfile() && (
        <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
          <UgcUniversalDescription draft={draft} onChange={onDescriptionChange} />
        </section>
      )}

      {/* Theme pool + photos - UGC-specific, above PostMaker-style form */}
      <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
        <div className="mb-5 grid gap-5">
          {poolStatus && (
            <div className="flex flex-col justify-end">
              <div className="mb-1 flex justify-between font-mono text-[10px] text-fog">
                <span>Themes left</span>
                <span>
                  {themeAvailableDisplay} / {poolStatus.totalInScope}
                  {testMode ? ' (test)' : poolStatus.used > 0 ? ` · ${poolStatus.used} used` : ''}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-well">
                  <div
                    className="h-full rounded-full bg-brass transition-all"
                    style={{ width: `${Math.round(meterPct * 100)}%` }}
                  />
                </div>
                <button
                  type="button"
                  disabled={resetBusy || batchBusy || testMode}
                  onClick={() => void onResetPool()}
                  title={
                    testMode
                      ? 'Test mode does not mark themes used'
                      : 'Clear used_themes.json - full pool again'
                  }
                  className="shrink-0 rounded-lg border border-lineStrong bg-well px-3 py-1 font-mono text-[10px] uppercase tracking-wide text-mist hover:border-brass/30 disabled:opacity-40"
                >
                  {resetBusy ? '…' : 'Reset pool'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mb-3 rounded-xl border border-lineStrong bg-well/30 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-mist">
              Photos are pulled from{' '}
              <span className="font-mono text-snow">{imagePoolStatus?.newImagesDir || 'D:\\new-pics'}</span>{' '}
              - each post picks one at random and marks it used. When every photo has been used, the
              pool resets automatically. Your originals stay in the source folder.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={batchBusy || !imagePoolStatus?.newImagesDir}
                onClick={() => void onOpenImageFolder('new')}
                className="rounded-lg border border-lineStrong bg-well px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide text-mist hover:border-brass/30 disabled:opacity-40"
              >
                Open source folder
              </button>
              <button
                type="button"
                disabled={batchBusy || !imagePoolStatus?.usedImagesDir}
                onClick={() => void onOpenImageFolder('used')}
                className="rounded-lg border border-lineStrong bg-well px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide text-mist hover:border-brass/30 disabled:opacity-40"
              >
                Open used-images
              </button>
            </div>
          </div>
          {imagePoolStatus && (
            <div>
              <div className="mb-1 flex justify-between font-mono text-[10px] text-fog">
                <span>Source images</span>
                <span>
                  {imagePoolStatus.available} new · {imagePoolStatus.used} used
                  {imagePoolStatus.recycleCount > 0
                    ? ` · cycle ${imagePoolStatus.recycleCount + 1}`
                    : ''}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-well">
                <div
                  className="h-full rounded-full bg-phosphor transition-all"
                  style={{ width: `${Math.round(imageMeterPct * 100)}%` }}
                />
              </div>
            </div>
          )}
          <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-phosphor/25 bg-phosphor/5 px-3 py-2">
            <input
              type="checkbox"
              checked={testMode}
              onChange={(e) => onTestModeChange(e.target.checked)}
              disabled={batchBusy}
              className="mt-0.5 accent-phosphor"
            />
            <span className="text-sm text-mist">
              <span className="font-mono text-[10px] uppercase tracking-wide text-phosphor">
                Test mode
              </span>
              <span className="mt-0.5 block text-xs text-fog">
                Reuse theme/image pool without marking used, and save full generation audit to{' '}
                <span className="font-mono text-[10px]">D:\ugc-batch-vision\audit</span> (prompts,
                Ollama I/O, rewrites, gates, captions, rendered PNGs) for AI review.
              </span>
            </span>
          </label>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => onPickFiles(e.target.files)}
        />
        {imageError && <p className="mt-2 text-xs text-ember">{imageError}</p>}
      </section>
      </div>

      {/* PostMaker-style batch form */}
      <BatchSettingsCard vm={vm} />

      <BatchRunCard vm={vm} />
    </div>
  )
}
