import { UgcTabs } from './ugc-panel-shared'
import {
    MAX_SLIDESHOW_SLIDES,
    MIN_SLIDESHOW_SLIDES,
    SLIDE_ROLE_LABELS,
    type UgcSlidesDraft
} from '../../lib/ugc-slides'
import { ErrorRetryCallout, Field, inputCls } from '../ui/primitives'
import { SaveChangesBar } from '../ui/SaveChangesBar'
import { UgcOllamaModelBar } from './UgcOllamaModelBar'
import { UgcUniversalDescription } from './UgcUniversalDescription'
import type { UgcSlidesPanelVm } from './useUgcSlidesPanel'

export function UgcPanelHeader({ vm }: { vm: UgcSlidesPanelVm }) {
  const { active, batchRun, dirty, onSaveChanges, saveBusy, saveError, setTab, setVaultSettings, tab, vaultSettings } = vm
  return (
    <header className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <h1 className="font-sans text-2xl font-semibold tracking-tight text-snow">UGC Slide Creator</h1>
        <UgcTabs tab={tab} setTab={setTab} />
        <SaveChangesBar compact dirty={dirty} busy={saveBusy} onSave={onSaveChanges} className="ml-auto" />
      </div>
      {saveError ? <ErrorRetryCallout title={saveError} onRetry={onSaveChanges} /> : null}
      <UgcOllamaModelBar
        active={active}
        vaultSettings={vaultSettings}
        onModelChange={(model) =>
          setVaultSettings((prev) => ({ ...prev, OLLAMA_MODEL: model }))
        }
        compact
      />
      {batchRun.busy && tab !== 'batch' ? (
        <div className="rounded-xl border border-brass/30 bg-brass/5 px-4 py-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wide text-brass">
              Batch generating
              {batchRun.elapsedSec > 0 ? (
                <span className="ml-2 tabular-nums normal-case text-phosphor">
                  {Math.floor(batchRun.elapsedSec / 60)}:
                  {String(batchRun.elapsedSec % 60).padStart(2, '0')}
                </span>
              ) : null}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {batchRun.abort ? (
                <button
                  type="button"
                  onClick={batchRun.abort}
                  className="min-h-[32px] rounded-lg border border-red-500/50 px-3 py-1 font-mono text-[10px] uppercase tracking-wide text-red-300 hover:bg-red-500/10"
                >
                  Abort
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setTab('batch')}
                className="min-h-[32px] rounded-lg border border-brass/40 px-3 py-1 font-mono text-[10px] uppercase tracking-wide text-brass"
              >
                View batch
              </button>
            </div>
          </div>
          <div className="mb-2 h-2 overflow-hidden rounded-full bg-well">
            <div
              className="h-full rounded-full bg-brass transition-all"
              style={{ width: `${Math.round(batchRun.progress * 100)}%` }}
            />
          </div>
          {batchRun.status ? (
            <p className="font-mono text-[11px] text-phosphor">{batchRun.status}</p>
          ) : null}
        </div>
      ) : null}
    </header>
  )
}

export function UgcCreatePreview({ vm }: { vm: UgcSlidesPanelVm }) {
  const { activeImage, activeIndex, activeRole, canvasRef, exportSize, goToSlide, images, overflowWarning, removeSlide, slideCount, slideHeight, slideWidth } = vm
  return (
    <section id="ugc-preview" className="tool-preview order-2 flex min-w-0 flex-col gap-5 rounded-2xl border border-line bg-panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="font-mono text-xs text-fog">
              Preview · {slideWidth}×{slideHeight}
              <span className="ml-2 text-mist">{exportSize.label}</span>
              {slideCount > 0 && (
                <span className="ml-2 text-brass">
                  {activeIndex + 1} / {slideCount}
                </span>
              )}
            </div>
            {activeRole && slideCount > 0 && (
              <span className="rounded-full border border-lineStrong bg-well px-2 py-0.5 font-mono text-[10px] uppercase text-mist">
                {SLIDE_ROLE_LABELS[activeRole] || activeRole}
              </span>
            )}
          </div>
    
          <a href="#ugc-editor" onClick={(event) => { event.preventDefault(); document.getElementById('ugc-editor')?.scrollIntoView({ block: 'start' }) }} className="inline-flex self-start rounded-lg border border-lineStrong px-4 py-2.5 text-sm text-mist hover:text-snow min-[1180px]:hidden">Back to editing ↑</a>
          <div className="flex min-w-0 flex-col items-center justify-center gap-5">
            <div
              className="relative w-fit max-w-full overflow-hidden rounded-xl border border-lineStrong bg-ink shadow-panel"
            >
              <canvas
                ref={canvasRef}
                width={slideWidth}
                height={slideHeight}
                className="block h-auto max-h-[min(55vh,640px)] w-auto max-w-full"
              />
              {!activeImage && (
                <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-fog">
                  Upload photos to preview the slideshow
                </div>
              )}
            </div>
    
            {slideCount > 0 && (
              <div className="flex w-full max-w-md items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => goToSlide(activeIndex - 1)}
                  className="min-h-[40px] rounded-lg border border-lineStrong px-3 py-2 font-mono text-[10px] uppercase text-mist"
                  aria-label="Previous slide"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => goToSlide(activeIndex + 1)}
                  className="min-h-[40px] rounded-lg border border-lineStrong px-3 py-2 font-mono text-[10px] uppercase text-mist"
                  aria-label="Next slide"
                >
                  →
                </button>
              </div>
            )}
    
            {overflowWarning && (
              <p className="text-center text-xs text-ember">
                Text is too long on this slide - shorten the headline or body.
              </p>
            )}
          </div>
    
          {images.length > 0 && (
            <div className="shrink-0">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-fog">Slides</div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {images.map((img, i) => (
                  <div key={img.id} className="group relative shrink-0">
                    <button
                      type="button"
                      onClick={() => goToSlide(i)}
                      className={[
                        'relative h-16 w-10 overflow-hidden rounded-lg border-2 transition',
                        i === activeIndex ? 'border-brass ring-2 ring-brass/30' : 'border-lineStrong hover:border-brass/40',
                      ].join(' ')}
                      aria-label={`Slide ${i + 1}`}
                    >
                      <img src={img.url} alt="" className="h-full w-full object-cover" />
                      <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-center font-mono text-[9px] text-snow">
                        {i + 1}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSlide(i)}
                      className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-ember text-[10px] text-snow group-hover:flex"
                      aria-label="Remove"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
  )
}

export function UgcCreateEditor({ vm }: { vm: UgcSlidesPanelVm }) {
  const { activeImage, activeIndex, activeRole, activeSlide, angleOptions, christmasUgc, copyError, copyLoading, descriptionError, descriptionLoading, discordBusy, discordError, discordSuccess, draft, exportBusy, exportSize, fileInputRef, imageError, onDownloadCurrent, onDownloadZip, onGenerateLtDescription, onGenerateSlideshow, onPickFiles, onPublishDiscord, onReset, overflowWarning, patchActiveSlide, patchDraft, qualityIssues, qualityState, slideCount, tokenReady, universalDescription } = vm
  return (
    <div id="ugc-editor" className="order-1 min-w-0 space-y-6 pb-6">
          <a href="#ugc-preview" onClick={(event) => { event.preventDefault(); document.getElementById('ugc-preview')?.scrollIntoView({ block: 'start' }) }} className="inline-flex rounded-lg border border-lineStrong px-4 py-2.5 text-sm text-mist hover:text-snow min-[1180px]:hidden">Jump to preview ↓</a>
          <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6 min-[1180px]:!mt-0">
            <h2 className="mb-3 text-sm font-semibold text-snow">Photos</h2>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                onPickFiles(e.dataTransfer.files)
              }}
              className="flex min-h-[100px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-lineStrong bg-well/40 px-4 py-5 text-center transition hover:border-brass/40"
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
            >
              <p className="text-sm text-mist">Drag photos here or click to browse</p>
              <p className="mt-1 font-mono text-[10px] text-fog">
                JPG · PNG · WEBP · up to 15 MB · {MIN_SLIDESHOW_SLIDES}-{MAX_SLIDESHOW_SLIDES} slides
              </p>
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
            {slideCount > 0 && (
              <p className="mt-2 font-mono text-[10px] text-fog">
                {slideCount} slide{slideCount === 1 ? '' : 's'} ready
              </p>
            )}
          </section>
    
          <section className="space-y-5 rounded-2xl border border-line bg-panel p-5 sm:p-6">
            <h2 className="text-sm font-semibold text-snow">Slideshow copy</h2>
            <Field label="Angle">
              <select
                className={inputCls}
                value={draft.angle}
                onChange={(e) => patchDraft({ angle: e.target.value as UgcSlidesDraft['angle'] })}
              >
                {angleOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Extra context">
              <textarea
                className={`${inputCls} min-h-[120px]`}
                value={draft.brief}
                onChange={(e) => patchDraft({ brief: e.target.value })}
                placeholder={
                  christmasUgc
                    ? 'e.g. last-minute gift for dad under 30 euros'
                    : 'e.g. $40 weekly food budget and very little time to cook'
                }
              />
            </Field>
            <Field label="Default CTA (last slide)">
              <input
                className={inputCls}
                value={draft.defaultCta}
                onChange={(e) => patchDraft({ defaultCta: e.target.value })}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={copyLoading || slideCount < MIN_SLIDESHOW_SLIDES}
                onClick={() => void onGenerateSlideshow()}
                className="min-h-[44px] rounded-lg border border-brass/40 bg-brass/15 px-4 py-2 font-mono text-[11px] uppercase tracking-wide text-brass disabled:opacity-50"
              >
                {copyLoading ? 'Generating…' : 'Generate slideshow'}
              </button>
              {slideCount >= MIN_SLIDESHOW_SLIDES && (
                <button
                  type="button"
                  disabled={copyLoading}
                  onClick={() => void onGenerateSlideshow()}
                  className="min-h-[44px] rounded-lg border border-lineStrong px-4 py-2 font-mono text-[11px] uppercase tracking-wide text-mist disabled:opacity-50"
                >
                  Regenerate
                </button>
              )}
            </div>
            {copyError && (
              <ErrorRetryCallout title={copyError} onRetry={() => void onGenerateSlideshow()} />
            )}
          </section>
    
          {slideCount > 0 && (
            <section className="space-y-5 rounded-2xl border border-line bg-panel p-5 sm:p-6">
              <h2 className="text-sm font-semibold text-snow">
                Slide {activeIndex + 1} copy
              </h2>
              <Field label="Headline">
                <input
                  className={inputCls}
                  value={activeSlide.title}
                  onChange={(e) => patchActiveSlide({ title: e.target.value })}
                />
              </Field>
              <Field label="Body">
                <textarea
                  className={`${inputCls} min-h-[144px]`}
                  value={activeSlide.body}
                  onChange={(e) => patchActiveSlide({ body: e.target.value })}
                />
              </Field>
              {(activeRole === 'close' || draft.template === 'headline_body_cta') && (
                <Field label="CTA">
                  <input
                    className={inputCls}
                    value={activeSlide.cta}
                    onChange={(e) => patchActiveSlide({ cta: e.target.value })}
                    placeholder={draft.defaultCta}
                  />
                </Field>
              )}
              <Field label="Horizontal focal point">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={activeSlide.focalX}
                  onChange={(e) => patchActiveSlide({ focalX: Number(e.target.value) })}
                  className="w-full accent-brass"
                />
              </Field>
              <Field label="Vertical focal point">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={activeSlide.focalY}
                  onChange={(e) => patchActiveSlide({ focalY: Number(e.target.value) })}
                  className="w-full accent-brass"
                />
              </Field>
            </section>
          )}
    
          <section className="space-y-5 rounded-2xl border border-line bg-panel p-5 sm:p-6">
            <h2 className="text-sm font-semibold text-snow">Discord description</h2>
            {christmasUgc && <UgcUniversalDescription draft={draft} onChange={patchDraft} />}
            {universalDescription === undefined && (
            <Field label="Lithuanian caption (caption.txt)">
              <textarea
                className={`${inputCls} min-h-[240px]`}
                value={draft.ltDescription}
                onChange={(e) => patchDraft({ ltDescription: e.target.value })}
                placeholder="Discord post description in Lithuanian"
              />
            </Field>
            )}
            <button
              type="button"
              disabled={descriptionLoading || slideCount < 1 || universalDescription !== undefined}
              onClick={() => void onGenerateLtDescription()}
              className="min-h-[44px] rounded-lg border border-brass/40 bg-brass/15 px-4 py-2 font-mono text-[11px] uppercase tracking-wide text-brass disabled:opacity-50"
            >
              {universalDescription !== undefined ? 'Using universal description' : descriptionLoading ? 'Generating…' : 'Generate LT description'}
            </button>
            {descriptionError && (
              <ErrorRetryCallout title={descriptionError} onRetry={() => void onGenerateLtDescription()} />
            )}
          </section>
    
          <section className="space-y-5 rounded-2xl border border-line bg-panel p-5 sm:p-6">
            <h2 className="text-sm font-semibold text-snow">Export & publish</h2>
            {!tokenReady && (
              <p className="text-xs text-ember">
                Discord bot token missing. Add it in Settings, then Save changes.
              </p>
            )}
            {discordError && <p className="text-xs text-ember">{discordError}</p>}
            {discordSuccess && <p className="text-xs text-phosphor">{discordSuccess}</p>}
            <div className="rounded-lg border border-lineStrong bg-well/30 px-3 py-2 font-mono text-[10px]">
              <span className={qualityState === 'passed' ? 'text-phosphor' : qualityState === 'blocked' ? 'text-ember' : 'text-brass'}>
                {qualityState === 'passed' ? 'Lithuanian quality gate passed' : qualityState === 'blocked' ? 'Lithuanian quality gate blocked export' : qualityState === 'checking' ? 'Checking Lithuanian quality…' : 'Lithuanian quality needs a final check before export'}
              </span>
              {qualityIssues.length > 0 ? (
                <ul className="mt-1 list-disc pl-4 text-ember">{qualityIssues.slice(0, 6).map((issue) => <li key={issue}>{issue}</li>)}</ul>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={slideCount < 1 || exportBusy || overflowWarning}
                onClick={() => void onDownloadZip()}
                className="min-h-[44px] rounded-lg border border-phosphor/40 bg-phosphor/15 px-4 py-2 font-mono text-[11px] uppercase tracking-wide text-phosphor disabled:opacity-40"
              >
                {exportBusy ? 'Exporting…' : 'Download ZIP'}
              </button>
              <button
                type="button"
                disabled={!activeImage || exportBusy || overflowWarning}
                onClick={() => void onDownloadCurrent()}
                className="min-h-[44px] rounded-lg border border-lineStrong px-4 py-2 font-mono text-[11px] uppercase tracking-wide text-mist disabled:opacity-40"
              >
                This slide only
              </button>
              <button
                type="button"
                disabled={discordBusy || !tokenReady || slideCount < 1 || overflowWarning}
                onClick={() => void onPublishDiscord()}
                className="min-h-[44px] rounded-lg border border-[#5865F2]/40 bg-[#5865F2]/15 px-4 py-2 font-mono text-[11px] uppercase tracking-wide text-[#8ea1ff] disabled:opacity-40"
              >
                {discordBusy ? 'Publishing…' : 'Post to Discord'}
              </button>
              <button
                type="button"
                onClick={onReset}
                className="min-h-[44px] rounded-lg border border-lineStrong px-4 py-2 font-mono text-[11px] uppercase tracking-wide text-mist"
              >
                Clear
              </button>
            </div>
            <p className="text-xs text-fog">
              Export size: <span className="text-mist">{exportSize.label}</span> - change in Settings.
            </p>
          </section>
        </div>
  )
}
