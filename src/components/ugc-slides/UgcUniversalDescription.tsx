import type { UgcSlidesDraft } from '../../lib/ugc-slides'
import { normalizeUniversalDescriptions } from '../../lib/ugc-universal-description'
import { Field, inputCls } from '../ui/primitives'

export type UgcDescriptionSettings = Pick<UgcSlidesDraft, 'universalDescription' | 'universalDescriptions' | 'generateDescriptionAutomatically'>

export function UgcUniversalDescription({ draft, onChange }: {
  draft: UgcDescriptionSettings
  onChange: (settings: Partial<UgcDescriptionSettings>) => void
}) {
  const slots = normalizeUniversalDescriptions(draft.universalDescriptions, draft.universalDescription)
  const filled = slots.filter((d) => d.trim()).length
  function setSlot(index: number, value: string) {
    const next = slots.map((d, i) => (i === index ? value : d))
    // Slot 1 stays mirrored in the old single field for older readers.
    onChange({ universalDescriptions: next, universalDescription: next[0], generateDescriptionAutomatically: false })
  }
  return (
    <div className="space-y-5">
      {slots.map((value, index) => (
        <Field key={index} label={`Post description ${index + 1}`}>
          <textarea
            className={`${inputCls} min-h-[260px]`}
            value={value}
            onChange={(event) => setSlot(index, event.target.value)}
            placeholder="Leave empty to skip this description"
          />
        </Field>
      ))}
      <label className="flex min-h-11 items-start gap-3 py-2 text-sm leading-relaxed text-mist">
        <input
          type="checkbox"
          checked={draft.generateDescriptionAutomatically === true}
          onChange={(event) => onChange({ generateDescriptionAutomatically: event.target.checked })}
          className="accent-brass"
        />
        Generate descriptions automatically
      </label>
      <p className="text-xs text-fog">
        {draft.generateDescriptionAutomatically || filled === 0
          ? 'Descriptions are generated separately for each post. '
          : filled === 1
            ? 'This text is used unchanged for every post, caption.txt, and Discord caption. '
            : `Each post picks one of these ${filled} descriptions at random (never the same one twice in a row) for caption.txt and Discord. `}
        Empty boxes are skipped. Enable automatic descriptions to generate them instead. Save changes to keep this setting.
      </p>
    </div>
  )
}
