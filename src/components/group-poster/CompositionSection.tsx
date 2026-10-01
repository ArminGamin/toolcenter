import {
    type GroupPosterSettings,
    type GroupPosterState
} from '../../lib/group-poster'
import { checkCls, Field, inputCls } from '../ui/primitives'

export function CompositionSection({
  settings,
  state,
  captions,
  setCaptions,
  captionsRef,
  captionsDirtyRef,
  captionsFileInputRef,
  busy,
  patchSettings,
  recomputeUnsaved,
  flash,
}: {
  settings: GroupPosterSettings
  state: GroupPosterState | null
  captions: string
  setCaptions: (v: string) => void
  captionsRef: React.MutableRefObject<string>
  captionsDirtyRef: React.MutableRefObject<boolean>
  captionsFileInputRef: React.RefObject<HTMLInputElement | null>
  busy: boolean
  patchSettings: (partial: Partial<GroupPosterSettings>) => void
  recomputeUnsaved: () => void
  flash: (msg: string) => void
}) {
  return (
    <section className="rounded-2xl border border-lineStrong bg-panel p-5 sm:p-6">
      <h2 className="mb-3 text-sm font-semibold text-snow">Composition</h2>
      <div className="mb-4 flex flex-wrap gap-4">
        {(
          [
            ['includeText', 'Text'],
            ['includeLink', 'Link'],
            ['includeImage', 'Image'],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm text-snow">
            <input
              type="checkbox"
              className={checkCls}
              checked={Boolean(settings[key])}
              onChange={(e) => {
                const on = e.target.checked
                if (key === 'includeImage' && on && !(settings.imagesDir || '').trim()) {
                  patchSettings({
                    includeImage: true,
                    imagesDir: state?.defaultImagesDir || 'D:\\toolsai\\facebook-group-poster\\images',
                    rotateImages: settings.rotateImages !== false,
                  })
                  return
                }
                patchSettings({ [key]: on })
              }}
            />
            {label}
          </label>
        ))}
      </div>

      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm text-snow">
          <input
            type="checkbox"
            className={checkCls}
            checked={settings.rotateCaptions}
            disabled={!settings.includeText}
            onChange={(e) => patchSettings({ rotateCaptions: e.target.checked })}
          />
          Rotate captions from captions.txt ({state?.captionsCount ?? 0} lines)
        </label>

        {settings.includeText && !settings.rotateCaptions && (
          <Field label="Fixed caption">
            <textarea
              className={`${inputCls} min-h-[88px]`}
              value={settings.fixedCaption}
              onChange={(e) => patchSettings({ fixedCaption: e.target.value })}
              placeholder="What to type into each post…"
              disabled={settings.rotateCaptions}
            />
          </Field>
        )}

        {settings.includeText && settings.rotateCaptions && (
          <div className="space-y-2">
            <Field
              label="captions.txt"
            >
              <textarea
                className={`${inputCls} min-h-[120px]`}
                value={captions}
                onChange={(e) => {
                  const v = e.target.value
                  setCaptions(v)
                  captionsRef.current = v
                  captionsDirtyRef.current = true
                  recomputeUnsaved()
                }}
                placeholder={
                  'Sveiki vyrai - naujas pasiūlymas!\nSveikos moterys - šis pasiūlymas jums\nSpecialiai vyrui šią savaitę…'
                }
              />
            </Field>
            <input
              ref={captionsFileInputRef}
              type="file"
              accept=".txt,text/plain"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                const reader = new FileReader()
                reader.onload = () => {
                  const text = String(reader.result || '')
                  setCaptions(text)
                  captionsRef.current = text
                  captionsDirtyRef.current = true
                  recomputeUnsaved()
                  flash(`Loaded ${file.name}`)
                }
                reader.onerror = () => flash('Could not read file')
                reader.readAsText(file)
              }}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => captionsFileInputRef.current?.click()}
                className="rounded-lg border border-lineStrong bg-lift px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-snow hover:border-brass/35 disabled:opacity-50"
              >
                Load .txt
              </button>
            </div>
          </div>
        )}

        {settings.includeLink && (
          <Field
            label="Link URL"
          >
            <input
              className={inputCls}
              value={settings.linkUrl}
              onChange={(e) => patchSettings({ linkUrl: e.target.value })}
              placeholder="https://…"
            />
          </Field>
        )}

        {settings.includeImage && (
          <>
            <Field
              label="Preload images from folder"
            >
              <div className="flex gap-2">
                <input
                  className={inputCls}
                  value={settings.imagesDir || ''}
                  onChange={(e) => patchSettings({ imagesDir: e.target.value })}
                  placeholder={state?.defaultImagesDir || 'D:\\toolsai\\facebook-group-poster\\images'}
                />
                <button
                  type="button"
                  title="Use default images folder"
                  onClick={() =>
                    patchSettings({
                      imagesDir: state?.defaultImagesDir || 'D:\\toolsai\\facebook-group-poster\\images',
                    })
                  }
                  className="shrink-0 rounded-lg border border-lineStrong bg-lift px-2.5 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-mist hover:border-brass/35 hover:text-snow"
                >
                  Default
                </button>
              </div>
            </Field>
            <p className="font-mono text-[10px] text-fog">
              {state?.imagesVyrasCount ?? 0} VYRAS · {state?.imagesMoterisCount ?? 0} MOTERIS
              {(state?.imagesOtherCount ?? 0) > 0 ? ` · ${state?.imagesOtherCount} other` : ''}
            </p>
            <label className="flex items-center gap-2 text-sm text-snow">
              <input
                type="checkbox"
                className={checkCls}
                checked={settings.rotateImages !== false}
                onChange={(e) => patchSettings({ rotateImages: e.target.checked })}
              />
              Rotate images (VYRAS/MOTERIS match caption) (
              {state?.imagesVyrasCount ?? 0} VYRAS + {state?.imagesMoterisCount ?? 0} MOTERIS)
            </label>
            {settings.rotateImages !== false ? (
              <p className="font-mono text-[10px] text-fog">
                Indices: {settings.imageIndexVyras ?? 0}/{settings.imageIndexMoteris ?? 0}
              </p>
            ) : (
              <Field
                label="Extra image paths (optional)"
              >
                <textarea
                  className={`${inputCls} min-h-[72px]`}
                  value={(settings.imagePaths || []).join('\n')}
                  onChange={(e) =>
                    patchSettings({
                      imagePaths: e.target.value
                        .split(/\r?\n/)
                        .map((l) => l.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder={'D:\\photos\\promo_VYRAS.jpg'}
                />
              </Field>
            )}
          </>
        )}
      </div>
    </section>
  )
}
