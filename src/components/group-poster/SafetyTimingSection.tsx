import {
    type GroupPosterSettings
} from '../../lib/group-poster'
import { checkCls, Field, inputCls } from '../ui/primitives'

export function SafetyTimingSection({
  settings,
  patchSettings,
}: {
  settings: GroupPosterSettings
  patchSettings: (partial: Partial<GroupPosterSettings>) => void
}) {
  return (
    <section className="rounded-2xl border border-lineStrong bg-panel p-5 sm:p-6">
      <h2 className="mb-3 text-sm font-semibold text-snow">
        Safety & timing
      </h2>
      <div className="grid gap-5 min-[1180px]:grid-cols-3">
        <Field label="Min interval (min)">
          <input
            type="number"
            className={inputCls}
            min={1}
            value={settings.minIntervalMin}
            onChange={(e) => patchSettings({ minIntervalMin: Number(e.target.value) || 1 })}
          />
        </Field>
        <Field label="Max interval (min)">
          <input
            type="number"
            className={inputCls}
            min={1}
            value={settings.maxIntervalMin}
            onChange={(e) => patchSettings({ maxIntervalMin: Number(e.target.value) || 1 })}
          />
        </Field>
        <Field label="Warm-up (sec)">
          <input
            type="number"
            className={inputCls}
            min={0}
            value={settings.warmupSec}
            onChange={(e) => patchSettings({ warmupSec: Number(e.target.value) || 0 })}
          />
        </Field>
        <Field label="Daily cap (0 = unlimited)">
          <input
            type="number"
            className={inputCls}
            min={0}
            value={settings.dailyCap}
            onChange={(e) => patchSettings({ dailyCap: Number(e.target.value) || 0 })}
          />
        </Field>
        <Field label="Type delay min (ms)">
          <input
            type="number"
            className={inputCls}
            min={20}
            value={settings.minTypeDelayMs}
            onChange={(e) => patchSettings({ minTypeDelayMs: Number(e.target.value) || 20 })}
          />
        </Field>
        <Field label="Type delay max (ms)">
          <input
            type="number"
            className={inputCls}
            min={20}
            value={settings.maxTypeDelayMs}
            onChange={(e) => patchSettings({ maxTypeDelayMs: Number(e.target.value) || 20 })}
          />
        </Field>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-snow">
        <input
          type="checkbox"
          className={checkCls}
          checked={settings.autoJoinBeforePost}
          onChange={(e) => patchSettings({ autoJoinBeforePost: e.target.checked })}
        />
        Auto-join groups before post (30s wait after join · skips pending approval)
      </label>
      <label className="mt-3 flex items-center gap-2 text-sm text-snow">
        <input
          type="checkbox"
          className={checkCls}
          checked={settings.shuffleGroups}
          onChange={(e) => patchSettings({ shuffleGroups: e.target.checked })}
        />
        Shuffle group order each run
      </label>
    </section>
  )
}
