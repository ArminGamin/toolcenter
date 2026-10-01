import { ToolIcon } from '../../data/icons'
import { readableToolAccent } from '../../lib/appearance'
import {
    fetchOllamaModels
} from '../../lib/launch'
import { logLevelClass } from '../../lib/logLevels'
import { SecretInput } from '../SecretInput'
import type { ToolPanelVm } from './useToolPanel'

export function ToolHeader({ vm }: { vm: ToolPanelVm }) {
  const { commitName, nameDraft, onHome, onTogglePin, pinned, powerLabel, readiness, running, setNameDraft, tool } = vm
  return (
    <div className="relative mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-line pb-6">
      <div className="min-w-0 flex-[1_1_100%] sm:flex-1">
        <button
          type="button"
          onClick={onHome}
          aria-label="Back to home"
          className="mb-4 inline-flex items-center gap-2 font-mono text-[11px] tracking-wide text-mist transition-colors hover:text-snow"
        >
          <span aria-hidden>←</span> All tools
        </button>
    
        <div className="flex items-start gap-4">
          <span
            className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border bg-raised"
            style={{
              borderColor: `${tool.accent}55`,
              color: readableToolAccent(tool.accent),
              boxShadow: `0 0 0 1px ${tool.accent}22, 0 0 40px ${tool.accent}18`,
            }}
          >
            <ToolIcon id={tool.icon} size={24} />
            <span
              className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-ink"
              style={{ background: running ? '#5ec4b4' : '#a8afba' }}
              title={powerLabel}
            />
          </span>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-mist">
                {tool.category}
              </span>
              <span
                className={[
                  'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider',
                  running
                    ? 'border-phosphor/35 bg-phosphor/10 text-phosphor'
                    : 'border-lineStrong text-fog',
                ].join(' ')}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: running ? '#5ec4b4' : '#a8afba' }}
                />
                {powerLabel}
              </span>
              {readiness ? (
                <span
                  className={[
                    'rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider',
                    readiness.ready
                      ? 'border-phosphor/35 bg-phosphor/10 text-phosphor'
                      : 'border-brass/35 bg-brass/10 text-brass',
                  ].join(' ')}
                  title={
                    readiness.missingSettingNames.length
                      ? `Missing settings: ${readiness.missingSettingNames.join(', ')}`
                      : readiness.code
                  }
                >
                  {readiness.ready ? 'Ready' : readiness.code.replaceAll('_', ' ')}
                </span>
              ) : null}
            </div>
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  ;(e.target as HTMLInputElement).blur()
                }
              }}
              className="w-full border-b border-dashed border-transparent bg-transparent text-[28px] font-semibold tracking-tight text-snow outline-none hover:border-lineStrong focus:border-brass/50"
              aria-label="Tool name"
            />
            <p className="mt-1.5 text-sm text-mist">{tool.blurb}</p>
          </div>
        </div>
      </div>
    
      <button type="button" onClick={onTogglePin} disabled={tool.removed} aria-pressed={pinned}
        className={`rounded-xl border px-3 py-2.5 text-sm transition disabled:opacity-40 ${pinned ? 'border-brass/35 bg-brass/10 text-brass' : 'border-lineStrong bg-raised text-mist hover:text-snow'}`}>
        {pinned ? 'Unpin from sidebar' : 'Pin to sidebar'}
      </button>
    </div>
  )
}

export function ToolLaunchCard({ vm }: { vm: ToolPanelVm }) {
  const { busy, consoleBoxRef, consoleEntries, consoleOpen, consoleRunning, launchOptionId, onAction, onClearConsole, onLaunch, onOpenFolder, onOpenOutput, onStop, running, setConsoleOpen, setLaunchOptionId, toast, tool } = vm
  return (
    <div
        className="overflow-hidden rounded-2xl border bg-gradient-to-br from-raised to-panel p-5 shadow-panel"
        style={{ borderColor: `${tool.accent}40` }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-snow">Launch {tool.name}</h2>
            <p className="mt-1 max-w-md text-sm text-mist">
              {tool.launchOptions?.length ? 'Choose a platform, then launch its downloader on this PC.' : 'Launch on this PC. Running means a process was detected.'}
            </p>
            {tool.launchOptions?.length ? (
              <label className="mt-3 block text-sm text-mist">
                Platform
                <select
                  value={launchOptionId}
                  onChange={(event) => setLaunchOptionId(event.target.value)}
                  disabled={busy !== null}
                  className="mt-1 block w-full rounded-xl border border-lineStrong bg-lift px-3 py-2 text-snow"
                >
                  {tool.launchOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onOpenFolder}
              disabled={busy !== null || tool.removed}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-lineStrong bg-lift px-4 py-3 text-sm font-medium text-mist transition hover:border-brass/40 hover:text-snow disabled:opacity-40"
            >
              {busy === 'folder' ? 'Opening…' : 'Open folder'}
            </button>
            <button
              type="button"
              onClick={onOpenOutput}
              disabled={busy !== null || tool.removed}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-lineStrong bg-lift px-4 py-3 text-sm font-medium text-mist transition hover:border-brass/40 hover:text-snow disabled:opacity-40"
            >
              {busy === 'output' ? 'Opening…' : 'Open output'}
            </button>
            <button
              type="button"
              onClick={onStop}
              disabled={busy !== null || tool.removed || !running}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-ember/40 bg-ember/10 px-4 py-3 text-sm font-medium text-ember transition hover:bg-ember/20 disabled:opacity-40"
            >
              {busy === 'stop' ? 'Stopping…' : 'Stop'}
            </button>
            <button
              type="button"
              onClick={onLaunch}
              disabled={busy !== null || tool.removed || Boolean(tool.launchOptions?.length && running)}
              className="inline-flex min-w-[148px] items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-onTool transition hover:brightness-110 disabled:opacity-40"
              style={{ background: tool.accent }}
            >
              {busy === 'launch' ? 'Starting…' : running ? tool.launchOptions?.length ? 'Running' : 'Relaunch' : 'Launch'}
            </button>
          </div>
        </div>
    
        {tool.launchOptions?.length && running ? <p className="mt-3 text-sm text-mist">Stop the current downloader before launching another platform.</p> : null}
    
        <div className="mt-4 border-t border-line pt-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-snow">Live logs</h3>
              <p className="mt-0.5 font-mono text-[10px] text-fog">
                This tool only ·{' '}
                <span className="text-mist">info</span>
                {' · '}
                <span className="text-fog">noise</span>
                {' · '}
                <span className="text-brass">warn</span>
                {' · '}
                <span className="text-ember">critical</span>
                {consoleRunning ? ' · streaming' : ''}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConsoleOpen((v) => !v)}
                className="rounded-lg border border-lineStrong px-2.5 py-1 font-mono text-[10px] text-mist hover:text-snow"
              >
                {consoleOpen ? 'Hide' : 'Show'}
              </button>
              {consoleOpen && (
                <button
                  type="button"
                  onClick={() => void onClearConsole()}
                  className="rounded-lg border border-lineStrong px-2.5 py-1 font-mono text-[10px] text-fog hover:text-snow"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          {consoleOpen && (
            <div
              ref={consoleBoxRef}
              className="max-h-64 min-h-[120px] overflow-y-auto rounded-xl border border-lineStrong bg-well p-3 font-mono text-[11px] leading-relaxed"
            >
              {consoleEntries.length === 0 ? (
                <div className="text-fog">No logs</div>
              ) : (
                consoleEntries.map((entry, i) => (
                  <div
                    key={`${entry.at}-${i}-${entry.text.slice(0, 24)}`}
                    className={logLevelClass(entry.level)}
                  >
                    {entry.text}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
    
        {tool.actions && tool.actions.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
            {tool.actions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => onAction(action.id)}
                disabled={busy !== null || tool.removed}
                className="rounded-lg border border-lineStrong bg-raised px-3 py-2 font-mono text-[11px] text-mist transition hover:border-brass/40 hover:text-snow disabled:opacity-40"
              >
                {busy === action.id ? 'Running…' : action.label}
              </button>
            ))}
          </div>
        )}
    
        {toast && (
          <div
            className={[
              'mt-4 rounded-xl border px-3.5 py-2.5 font-mono text-xs',
              toast.ok
                ? 'border-phosphor/30 bg-phosphor/10 text-phosphor'
                : 'border-ember/30 bg-ember/10 text-ember',
            ].join(' ')}
            role="status"
          >
            {toast.message}
          </div>
        )}
      </div>
  )
}

export function ToolSettingsCard({ vm }: { vm: ToolPanelVm }) {
  const { assets, busy, hasAssets, hasSettings, ollamaModels, ollamaModelsMsg, onSaveSettings, setAssets, setOllamaModels, setOllamaModelsMsg, setSettings, setSettingsDirty, settings, settingsDirty, settingsLoading, tool } = vm
  return (
    <div className="settings-preserve rounded-2xl border border-lineStrong bg-raised shadow-card p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-snow">Tool settings</h3>
            </div>
            <button
              type="button"
              onClick={onSaveSettings}
              disabled={!settingsDirty || busy !== null || settingsLoading}
              className="rounded-xl bg-brass px-4 py-2 text-sm font-semibold text-onAccent transition hover:brightness-110 disabled:opacity-40"
            >
              {busy === 'settings' ? 'Saving…' : 'Save changes'}
            </button>
          </div>
    
          {settingsLoading ? (
            <div className="font-mono text-xs text-fog">Loading settings…</div>
          ) : (
            <div className="space-y-4">
              {hasSettings && (
                <div className="grid gap-5 min-[1180px]:grid-cols-2">
                  {tool.settings!.map((field) => {
                    const isOllamaSelect = field.optionsFrom === 'ollama_models'
                    const dynamicOptions = isOllamaSelect
                      ? ollamaModels
                      : field.options || []
                    const useSelect =
                      field.type === 'select' || isOllamaSelect
                    const selectOptions = [
                      ...dynamicOptions,
                      ...(settings[field.key] &&
                      !dynamicOptions.includes(settings[field.key])
                        ? [settings[field.key]]
                        : []),
                    ]
                    return (
                    <label
                      key={field.key}
                      className={[
                        'block',
                        field.type === 'checkbox' || field.type === 'textarea' ? 'min-[1180px]:col-span-2' : '',
                      ].join(' ')}
                    >
                      {field.type === 'checkbox' ? (
                        <>
                          <span className="flex items-start gap-3 rounded-xl border border-lineStrong bg-raised px-3 py-3">
                            <input
                              type="checkbox"
                              checked={
                                settings[field.key] === '1' ||
                                settings[field.key]?.toLowerCase() === 'true'
                              }
                              onChange={(e) => {
                                setSettings((s) => ({
                                  ...s,
                                  [field.key]: e.target.checked ? '1' : '0',
                                }))
                                setSettingsDirty(true)
                              }}
                              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brass,#c9a259)]"
                            />
                            <span>
                              <span className="block text-sm text-snow">{field.label}</span>
                            </span>
                          </span>
                        </>
                      ) : (
                        <>
                      <span className="mb-2 flex items-center justify-between gap-2 text-sm font-medium text-mist">
                        <span>{field.label}</span>
                        {isOllamaSelect && (
                          <button
                            type="button"
                            className="normal-case tracking-normal text-brass hover:text-snow"
                            onClick={(e) => {
                              e.preventDefault()
                              void fetchOllamaModels().then((res) => {
                                setOllamaModels(res.models || [])
                                setOllamaModelsMsg(
                                  res.ok
                                    ? null
                                    : res.message || 'Ollama offline',
                                )
                              })
                            }}
                          >
                            Refresh
                          </button>
                        )}
                      </span>
                      {useSelect ? (
                        <select
                          value={settings[field.key] ?? ''}
                          onChange={(e) => {
                            setSettings((s) => ({ ...s, [field.key]: e.target.value }))
                            setSettingsDirty(true)
                          }}
                          className="min-h-11 w-full rounded-xl border border-lineStrong bg-well px-3 py-2.5 text-sm text-snow outline-none placeholder:text-fog focus:border-brass/50"
                        >
                          <option value="">
                            {isOllamaSelect
                              ? ollamaModels.length
                                ? 'Select model…'
                                : 'No models found — start Ollama'
                              : '—'}
                          </option>
                          {selectOptions.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : field.type === 'password' ? (
                        <SecretInput
                          value={settings[field.key] ?? ''}
                          onChange={(v) => {
                            setSettings((s) => ({ ...s, [field.key]: v }))
                            setSettingsDirty(true)
                          }}
                          className="min-h-11 w-full rounded-xl border border-lineStrong bg-well px-3 py-2.5 text-sm leading-relaxed text-snow outline-none placeholder:text-fog focus:border-brass/50"
                        />
                      ) : field.type === 'textarea' ? (
                        <textarea
                          value={settings[field.key] ?? ''}
                          onChange={(e) => {
                            setSettings((s) => ({ ...s, [field.key]: e.target.value }))
                            setSettingsDirty(true)
                          }}
                          rows={4}
                          spellCheck={false}
                          className="min-h-11 w-full rounded-xl border border-lineStrong bg-well px-3 py-2.5 text-sm leading-relaxed text-snow outline-none placeholder:text-fog focus:border-brass/50"
                        />
                      ) : (
                        <input
                          type={field.type === 'number' ? 'number' : 'text'}
                          value={settings[field.key] ?? ''}
                          onChange={(e) => {
                            setSettings((s) => ({ ...s, [field.key]: e.target.value }))
                            setSettingsDirty(true)
                          }}
                          className="min-h-11 w-full rounded-xl border border-lineStrong bg-well px-3 py-2.5 text-sm leading-relaxed text-snow outline-none placeholder:text-fog focus:border-brass/50"
                        />
                      )}
                      {isOllamaSelect && ollamaModelsMsg && (
                        <span className="mt-1 block font-mono text-[10px] text-ember">
                          {ollamaModelsMsg}
                        </span>
                      )}
                        </>
                      )}
                    </label>
                    )
                  })}
                </div>
              )}
    
              {hasAssets &&
                tool.assets!.map((asset) => (
                  <label key={asset.key} className="block">
                    <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-mist">
                      {asset.label}
                      <span className="ml-2 normal-case tracking-normal text-fog">
                        → {asset.file}
                      </span>
                    </span>
                    <textarea
                      value={assets[asset.key] ?? ''}
                      onChange={(e) => {
                        setAssets((a) => ({ ...a, [asset.key]: e.target.value }))
                        setSettingsDirty(true)
                      }}
                      spellCheck={false}
                      rows={asset.type === 'html' ? 14 : 6}
                      placeholder={
                        asset.type === 'html'
                          ? 'Paste your HTML email here…'
                          : 'Paste text…'
                      }
                      className="w-full resize-y rounded-xl border border-lineStrong bg-panel px-3 py-3 font-mono text-[11px] leading-relaxed text-snow outline-none focus:border-brass/50"
                    />
                  </label>
                ))}
            </div>
          )}
        </div>
  )
}

export function ToolProfilesCard({ vm }: { vm: ToolPanelVm }) {
  const { busy, onDeleteProfile, onLoadProfile, onSaveProfile, profileName, profiles, selectedProfile, setProfileName, setSelectedProfile, settingsLoading } = vm
  return (
    <div className="settings-preserve rounded-2xl border border-lineStrong bg-raised shadow-card p-5">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-snow">Saved tool configurations</h3>
          <p className="mt-1 text-xs text-mist">Reusable settings for this tool within your current business workspace.</p>
        </div>
    
        {profiles.length === 0 ? (
          <div className="mb-3 rounded-xl border border-dashed border-lineStrong bg-well px-3 py-3 font-mono text-[11px] text-mist">
            No saved profiles
          </div>
        ) : (
          <div className="mb-3 max-h-40 space-y-1 overflow-y-auto rounded-xl border border-lineStrong bg-raised p-1.5">
            {profiles.map((p) => {
              const active = selectedProfile === p.name
              const when = (() => {
                const ms = Date.parse(p.updatedAt)
                if (!Number.isFinite(ms)) return ''
                return new Date(ms).toLocaleString()
              })()
              return (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => {
                    setSelectedProfile(p.name)
                    setProfileName(p.name)
                  }}
                  className={[
                    'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition',
                    active
                      ? 'bg-brass/20 text-snow ring-1 ring-brass/40'
                      : 'text-mist hover:bg-raised hover:text-snow',
                  ].join(' ')}
                >
                  <span className="truncate text-sm font-medium">{p.name}</span>
                  {when && (
                    <span className="shrink-0 font-mono text-[10px] text-fog">{when}</span>
                  )}
                </button>
              )
            })}
          </div>
        )}
    
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <select
            value={selectedProfile}
            onChange={(e) => {
              setSelectedProfile(e.target.value)
              setProfileName(e.target.value)
            }}
            className="min-w-[160px] flex-1 rounded-xl border border-lineStrong bg-well px-3 py-2.5 text-sm text-snow outline-none focus:border-brass/50"
          >
            <option value="" className="bg-ink text-snow">
              {profiles.length ? 'Select profile…' : 'No profiles saved yet'}
            </option>
            {profiles.map((p) => (
              <option key={p.name} value={p.name} className="bg-ink text-snow">
                {p.name}
              </option>
            ))}
          </select>
          <input
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            placeholder="New profile name"
            className="min-w-[160px] flex-1 rounded-xl border border-lineStrong bg-raised px-3 py-2.5 text-sm text-snow outline-none placeholder:text-fog focus:border-brass/50"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onLoadProfile}
              disabled={!selectedProfile || busy !== null || settingsLoading}
              className="rounded-xl border border-lineStrong px-3 py-2 text-sm text-mist transition hover:border-brass/40 hover:text-snow disabled:opacity-40"
            >
              {busy === 'profile-load' ? 'Loading…' : 'Load'}
            </button>
            <button
              type="button"
              onClick={onSaveProfile}
              disabled={busy !== null || settingsLoading}
              className="rounded-xl bg-brass px-3 py-2 text-sm font-semibold text-onAccent transition hover:brightness-110 disabled:opacity-40"
            >
              {busy === 'profile-save' ? 'Saving…' : 'Save profile'}
            </button>
            <button
              type="button"
              onClick={onDeleteProfile}
              disabled={!selectedProfile || busy !== null || settingsLoading}
              className="rounded-xl border border-ember/35 px-3 py-2 text-sm text-ember transition hover:bg-ember/10 disabled:opacity-40"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
  )
}

export function ToolPathsCard({ vm }: { vm: ToolPanelVm }) {
  const { copied, copyPath, launchOptionId, tool } = vm
  return (
    <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-lineStrong bg-raised shadow-card p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-mist">
              Folder
            </div>
            <button
              type="button"
              onClick={copyPath}
              className="font-mono text-[10px] uppercase tracking-wide text-mist transition hover:text-brass"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <code className="block break-all font-mono text-xs leading-relaxed text-mist">
            {tool.path}
          </code>
        </div>
        <div className="rounded-2xl border border-lineStrong bg-raised shadow-card p-4">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-mist">
            Command
          </div>
          <code
            className="block break-all font-mono text-xs leading-relaxed"
            style={{ color: readableToolAccent(tool.accent) }}
          >
            {tool.launchOptions?.find((option) => option.id === launchOptionId)?.launch || tool.launch}
          </code>
        </div>
      </div>
  )
}

export function ToolVisibilityCard({ vm }: { vm: ToolPanelVm }) {
  const { patch, tool } = vm
  return (
    <div className="rounded-2xl border border-ember/25 bg-panel p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-snow">
              {tool.removed ? 'Hidden from tool directory' : 'Hide from tool directory'}
            </div>
          </div>
          <button
            type="button"
            onClick={() => patch({ removed: !tool.removed })}
            className="rounded-lg border border-ember/35 px-3.5 py-2 text-xs font-medium text-ember transition hover:bg-ember/10"
          >
            {tool.removed ? 'Restore' : 'Hide'}
          </button>
        </div>
      </div>
  )
}
