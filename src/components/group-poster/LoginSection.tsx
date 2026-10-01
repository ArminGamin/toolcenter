import {
    type GroupPosterSettings
} from '../../lib/group-poster'
import { SecretInput } from '../SecretInput'
import { checkCls, Field, inputCls } from '../ui/primitives'

export function LoginSection({
  settings,
  loginPassword,
  setLoginPassword,
  loginPasswordRef,
  passwordDirtyRef,
  patchSettings,
  recomputeUnsaved,
  busy,
  onClearLoginSession,
  blacklistCount,
}: {
  settings: GroupPosterSettings
  loginPassword: string
  setLoginPassword: (v: string) => void
  loginPasswordRef: React.MutableRefObject<string>
  passwordDirtyRef: React.MutableRefObject<boolean>
  patchSettings: (partial: Partial<GroupPosterSettings>) => void
  recomputeUnsaved: () => void
  busy: boolean
  onClearLoginSession: () => Promise<void>
  blacklistCount: number
}) {
  return (
    <section className="rounded-2xl border border-lineStrong bg-panel p-5 sm:p-6">
      <h2 className="mb-3 text-sm font-semibold text-snow">
        Facebook login
      </h2>
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm text-snow">
          <input
            type="checkbox"
            className={checkCls}
            checked={settings.autoLogin !== false}
            onChange={(e) => patchSettings({ autoLogin: e.target.checked })}
          />
          Auto-login with saved account
        </label>
        <div className="grid gap-3 min-[1180px]:grid-cols-2">
        <Field label="Email">
          <input
            className={inputCls}
            value={settings.loginEmail || ''}
            onChange={(e) => patchSettings({ loginEmail: e.target.value })}
            placeholder="you@gmail.com"
            autoComplete="username"
          />
        </Field>
        <Field
          label="Password"
        >
          <SecretInput
            className={inputCls}
            value={loginPassword}
            onChange={(v) => {
              setLoginPassword(v)
              loginPasswordRef.current = v
              passwordDirtyRef.current = true
              recomputeUnsaved()
            }}
            placeholder="Password"
            autoComplete="current-password"
          />
        </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-snow">
          <input
            type="checkbox"
            className={checkCls}
            checked={settings.preserveExistingBlacklist === true}
            onChange={(e) => patchSettings({ preserveExistingBlacklist: e.target.checked })}
          />
          Use saved blacklist only (no new auto-blocks)
        </label>
        {settings.preserveExistingBlacklist && blacklistCount > 0 ? (
          <p className="text-[11px] leading-relaxed text-fog">
            {blacklistCount} blacklisted group(s) from your previous account stay blocked. Refresh
            keeps your group list; nothing new gets blacklisted.
          </p>
        ) : null}
        <p className="text-[11px] leading-relaxed text-fog">
          Session cookies live in the shared Chrome profile. Clear saved login to switch Facebook
          accounts.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onClearLoginSession()}
          className="rounded-lg border border-line px-3 py-1.5 text-[11px] text-mist hover:border-brass/40 hover:text-brass disabled:opacity-50"
        >
          Clear saved login
        </button>
      </div>
    </section>
  )
}
