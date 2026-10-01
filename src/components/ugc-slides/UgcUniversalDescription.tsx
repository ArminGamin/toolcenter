import type { UgcSlidesDraft } from '../../lib/ugc-slides'
import { Field, inputCls } from '../ui/primitives'

export type UgcDescriptionSettings = Pick<UgcSlidesDraft, 'universalDescription' | 'generateDescriptionAutomatically'>

export function UgcUniversalDescription({ draft, onChange }: {
  draft: UgcDescriptionSettings
  onChange: (settings: Partial<UgcDescriptionSettings>) => void
}) {
  return (
    <div className="space-y-5">
      <Field label="Universal post description">
        <textarea
          className={`${inputCls} min-h-[480px]`}
          value={draft.universalDescription || ''}
          onChange={(event) => onChange({ universalDescription: event.target.value, generateDescriptionAutomatically: false })}
          placeholder="Enter the description to use for every Kalėdų Kampelis post"
        />
      </Field>
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
        {draft.generateDescriptionAutomatically || !draft.universalDescription?.trim()
          ? 'Descriptions are generated separately for each post. '
          : 'Your text is reused unchanged for every post, caption.txt, and Discord caption. Description generation is skipped. '}
        Leave the box empty or enable automatic descriptions to generate them instead. Save changes to keep this setting.
      </p>
    </div>
  )
}
