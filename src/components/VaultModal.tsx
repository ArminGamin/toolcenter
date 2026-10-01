import { useEffect, useState } from 'react'
import { fetchOllamaModels, fetchVault, saveVault } from '../lib/launch'
import { SecretInput } from './SecretInput'

interface VaultModalProps {
  open: boolean
  onClose: () => void
}

export function VaultModal({ open, onClose }: VaultModalProps) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [fields, setFields] = useState<
    { key: string; label: string; type: string }[]
  >([])
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setMsg(null)
    void fetchVault().then((res) => {
      if (res.ok) {
        setValues(res.values || {})
        setFields(res.fields || [])
      } else {
        setMsg(res.message || 'Failed to load vault')
      }
    })
    void fetchOllamaModels().then((res) => setOllamaModels(res.models || []))
  }, [open])

  if (!open) return null

  async function onSave() {
    setBusy(true)
    setMsg(null)
    const result = await saveVault(values)
    setBusy(false)
    setMsg(result.message)
    if (result.ok) window.setTimeout(onClose, 700)
  }

  const inputCls =
    'w-full rounded-xl border border-lineStrong bg-well px-3 py-2.5 font-mono text-xs text-snow outline-none placeholder:text-fog focus:border-brass/50'

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label="Close vault"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal
        className="relative z-10 max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-lineStrong bg-panel p-5 shadow-panel"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold leading-snug text-snow">Shared secrets vault</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-lineStrong px-2.5 py-1 font-mono text-[11px] text-mist hover:text-snow"
          >
            Esc
          </button>
        </div>

        <div className="space-y-3">
          {fields.map((field) => {
            const isSecret =
              field.type === 'password' ||
              field.key === 'RESEND_API_KEY' ||
              field.key === 'DISCORD_STATUS_WEBHOOK' ||
              field.key === 'DISCORD_BOT_TOKEN' ||
              field.key === 'GEMINI_API_KEY' ||
              field.key === 'GEMINI_API_KEYS' ||
              field.key === 'CRYPTOCOMPARE_API_KEY'

            return (
              <label key={field.key} className="block">
                <span className="mb-1.5 block font-mono text-xs uppercase tracking-[0.12em] text-mist">
                  {field.label}
                </span>
                {field.key === 'OLLAMA_MODEL' ? (
                  <select
                    value={values[field.key] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                    className="w-full rounded-xl border border-lineStrong bg-well px-3 py-2.5 text-sm text-snow outline-none focus:border-brass/50"
                  >
                    <option value="">
                      {ollamaModels.length ? 'Select model…' : 'No models - start Ollama'}
                    </option>
                    {ollamaModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                    {values.OLLAMA_MODEL && !ollamaModels.includes(values.OLLAMA_MODEL) && (
                      <option value={values.OLLAMA_MODEL}>{values.OLLAMA_MODEL}</option>
                    )}
                  </select>
                ) : field.key === 'GEMINI_API_KEYS' ? (
                  <textarea
                    value={values[field.key] ?? ''}
                    onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    rows={4}
                    spellCheck={false}
                    className={`${inputCls} min-h-[96px]`}
                    placeholder="key-1,key-2,key-3"
                  />
                ) : isSecret ? (
                  <SecretInput
                    className={inputCls}
                    value={values[field.key] ?? ''}
                    onChange={(v) => setValues((prev) => ({ ...prev, [field.key]: v }))}
                  />
                ) : (
                  <input
                    type="text"
                    value={values[field.key] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                    placeholder={
                      field.key === 'OLLAMA_URL'
                        ? 'http://127.0.0.1:11434'
                        : field.key === 'RESEND_FROM'
                          ? 'Name <you@domain.com>'
                          : undefined
                    }
                    className={inputCls}
                  />
                )}
              </label>
            )
          })}
        </div>

        {msg && (
          <div className="mt-4 rounded-xl border border-lineStrong bg-raised px-3 py-2 font-mono text-xs text-mist">
            {msg}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-lineStrong px-4 py-2 text-sm text-mist hover:text-snow"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onSave()}
            className="rounded-xl bg-brass px-4 py-2 text-sm font-semibold text-onAccent hover:brightness-110 disabled:opacity-40"
          >
            {busy ? 'Saving…' : 'Save vault'}
          </button>
        </div>
      </div>
    </div>
  )
}
