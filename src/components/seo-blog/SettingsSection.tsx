import type { SeoBlogSettings } from '../../lib/seoBlog'

export function SettingsSection({
  settings,
  onPersist,
  kaledu = false,
}: {
  settings: SeoBlogSettings
  onPersist: (next: SeoBlogSettings) => void
  kaledu?: boolean
}) {
  return (
    <div className="grid gap-5">
      {kaledu && <>
        <p className="font-mono text-xs text-fog">kaledukampelis.com · Drafts stay in this profile. Accept saves articles to the store; a deployment makes them live.</p>
        <p className="font-mono text-xs text-fog">Short guides: aim for 220–350 words, three focused sections and one or two relevant examples. Each draft gets factual and Lithuanian editorial checks; failed checks trigger a rewrite. Review before accepting.</p>
        <label className="block space-y-2 text-sm font-medium text-mist">
          Ollama model (blank = choose an installed writing model)
          <input value={settings.ollamaModel || ''} onChange={(e) => onPersist({ ...settings, ollamaModel: e.target.value })} placeholder="Installed Lithuanian writing model" className="mt-2 min-h-11 w-full rounded-lg border border-lineStrong bg-well px-3 py-2.5 text-sm leading-relaxed text-snow" />
        </label>
        <label className="block space-y-2 text-sm font-medium text-mist">
          Topics (one per line; existing articles and drafts are skipped)
          <textarea rows={10} value={(settings.topics || []).join('\n')} onChange={(e) => onPersist({ ...settings, topics: e.target.value.split('\n') })} className="mt-2 min-h-11 w-full rounded-lg border border-lineStrong bg-well px-3 py-2.5 text-sm leading-relaxed text-snow" />
        </label>
      </>}
      <label className="block space-y-2 text-sm font-medium text-mist">
        Blogs per run (1–10)
        <input
          type="number"
          min={1}
          max={10}
          value={settings.postsPerRun}
          onChange={(e) =>
            onPersist({
              ...settings,
              postsPerRun: Math.max(1, Math.min(10, Number(e.target.value) || 2)),
            })
          }
          className="mt-2 min-h-11 w-full rounded-lg border border-lineStrong bg-well px-3 py-2.5 text-sm leading-relaxed text-snow"
        />
      </label>
      <label className="flex min-h-11 items-start gap-3 py-2 text-sm text-mist">
        <input
          type="checkbox"
          checked={settings.mock}
          onChange={(e) => onPersist({ ...settings, mock: e.target.checked })}
        />
        Mock (no Ollama)
      </label>
      <label className="flex min-h-11 items-start gap-3 py-2 text-sm text-mist">
        <input
          type="checkbox"
          checked={settings.strict}
          onChange={(e) => onPersist({ ...settings, strict: e.target.checked })}
        />
        {kaledu ? 'Strict similarity checks (editorial review always runs)' : 'Strict QA'}
      </label>
      <label className="flex min-h-11 items-start gap-3 py-2 text-sm text-mist">
        <input
          type="checkbox"
          checked={settings.autoPublish}
          onChange={(e) =>
            onPersist({
              ...settings,
              autoPublish: e.target.checked,
              autoPush: e.target.checked ? true : settings.autoPush,
            })
          }
        />
        Fully automatic (skip review — publish + git push)
      </label>
      <label
        className={[
          'flex min-h-11 items-start gap-3 py-2 text-sm text-mist',
          settings.autoPublish ? 'opacity-40' : '',
        ].join(' ')}
      >
        <input
          type="checkbox"
          checked={settings.autoPush || settings.autoPublish}
          disabled={settings.autoPublish}
          onChange={(e) => onPersist({ ...settings, autoPush: e.target.checked })}
        />
        Auto git push on Accept → Vercel
      </label>
      <label className="block space-y-2 text-sm font-medium text-mist">
        IndexNow key
        <input
          type="text"
          value={settings.indexnowKey}
          onChange={(e) => onPersist({ ...settings, indexnowKey: e.target.value })}
          className="mt-2 min-h-11 w-full rounded-lg border border-lineStrong bg-well px-3 py-2.5 text-sm leading-relaxed text-snow"
          placeholder="optional"
        />
      </label>
    </div>
  )
}
