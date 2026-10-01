import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { APP_SHORT_NAME } from '../lib/brand'
import {
  describeAction,
  executeAssistantAction,
  isRiskyAction,
  type AssistantAction,
} from '../lib/assistant-actions'
import { resolveAssistantPrompt } from '../lib/assistant'
import { buildAssistantSuggestions, type AssistantSuggestion } from '../lib/assistant-intent'
import { fetchHubSummary, stopHubModule, type HubModuleSnapshot, type HubSummary } from '../lib/hub'
import { ErrorRetryCallout } from './ui/primitives'
import type { Tool } from '../types'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
}

type AssistantHomeProps = {
  tools: Tool[]
  onOpenModule: (id: string) => void
  onOpenPipeline?: () => void
  onOpenFailures?: () => void
  onOpenVault?: () => void
  onOpenLogs?: () => void
  onLaunchTool?: (id: string) => Promise<{ ok: boolean; message: string }>
}

function msgId() {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function AssistantHome({
  tools,
  onOpenModule,
  onOpenPipeline,
  onOpenFailures,
  onOpenVault,
  onOpenLogs,
  onLaunchTool,
}: AssistantHomeProps) {
  const [summary, setSummary] = useState<HubSummary | null>(null)
  const [summaryError, setSummaryError] = useState(false)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [suggestions] = useState<AssistantSuggestion[]>(() => buildAssistantSuggestions())
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const execCtx = useMemo(
    () => ({
      tools,
      onOpenModule,
      onOpenPipeline,
      onOpenFailures,
      onOpenVault,
      onOpenLogs,
      onLaunchTool,
    }),
    [
      tools,
      onOpenModule,
      onOpenPipeline,
      onOpenFailures,
      onOpenVault,
      onOpenLogs,
      onLaunchTool,
    ],
  )

  const refreshSummary = useCallback(async () => {
    const next = await fetchHubSummary('all')
    if (next) {
      setSummary(next)
      setSummaryError(false)
    } else {
      setSummaryError(true)
    }
  }, [])

  useEffect(() => {
    void refreshSummary()
    const id = window.setInterval(() => void refreshSummary(), 12000)
    return () => window.clearInterval(id)
  }, [refreshSummary])

  useEffect(() => {
    if (messages.length === 0) {
      const intro = `Hi - tell me what to run. I can start outreach, Reddit, SEO blog, generate UGC slides, back up, and more.`
      setMessages([{ id: 'welcome', role: 'assistant', text: intro }])
    }
  }, [messages.length])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, busy])

  const append = useCallback((role: ChatMessage['role'], text: string) => {
    setMessages((prev) => [...prev, { id: msgId(), role, text }])
  }, [])

  const [stoppingKey, setStoppingKey] = useState('')

  const activeByProfile = useMemo(() => {
    const live = (summary?.modules || []).filter(
      (m) => m.live || m.workerRunning || ['running', 'waiting_login', 'paused', 'waiting', 'sending'].includes((m.status || '').toLowerCase()),
    )
    const groups = new Map<string, { name: string; modules: HubModuleSnapshot[] }>()
    for (const module of live) {
      const id = module.profileId || 'current'
      const name = module.profileName || 'Active'
      const group = groups.get(id) || { name, modules: [] }
      group.modules.push(module)
      groups.set(id, group)
    }
    return [...groups.entries()]
  }, [summary])

  const stopTool = useCallback(
    async (profileId: string, moduleId: string) => {
      const key = `${profileId}:${moduleId}`
      setStoppingKey(key)
      await stopHubModule(profileId, moduleId)
      setStoppingKey('')
      void refreshSummary()
    },
    [refreshSummary],
  )

  const confirmRisky = useCallback((actions: AssistantAction[]) => {
    const risky = actions.filter(isRiskyAction)
    if (!risky.length) return true
    const lines = risky.map((a) => `• ${describeAction(a)}`).join('\n')
    return window.confirm(`Confirm these actions?\n\n${lines}`)
  }, [])

  const runActions = useCallback(
    async (actions: AssistantAction[], preamble?: string) => {
      const execActions = actions.filter((a) => a.type !== 'reply')
      const replyLines = actions
        .filter((a): a is Extract<AssistantAction, { type: 'reply' }> => a.type === 'reply')
        .map((a) => a.message.trim())
        .filter(Boolean)

      const parts: string[] = []
      const add = (text: string) => {
        const t = text.trim()
        if (t && !parts.includes(t)) parts.push(t)
      }

      if (preamble) add(preamble)
      for (const line of replyLines) add(line)

      if (execActions.length) {
        if (!confirmRisky(execActions)) {
          add('Cancelled.')
        } else {
          for (const action of execActions) {
            const result = await executeAssistantAction(action, execCtx)
            add(result.message)
            if (!result.ok) break
          }
        }
      }

      if (parts.length) append('assistant', parts.join('\n'))
      void refreshSummary()
    },
    [append, confirmRisky, execCtx, refreshSummary],
  )

  const submit = useCallback(
    async (text: string) => {
      const q = text.trim()
      if (!q || busy) return
      setInput('')
      append('user', q)
      setBusy(true)

      const parsed = await resolveAssistantPrompt(q, tools)
      if (parsed?.actions.length) {
        await runActions(parsed.actions, parsed.reply || undefined)
      } else {
        append('assistant', 'Could not reach the assistant. Is the bridge running?')
      }

      setBusy(false)
      inputRef.current?.focus()
    },
    [append, busy, runActions, tools],
  )

  if (summaryError && !summary) {
    return (
      <div className="shrink-0">
        <ErrorRetryCallout
          title="Assistant offline"
          body="Bridge may be unavailable - commands need the server running."
          onRetry={() => void refreshSummary()}
        />
      </div>
    )
  }

  return (
    <section className="flex min-h-0 shrink-0 flex-col overflow-hidden rounded-[14px] border border-lineStrong bg-panel">
      <div className="shrink-0 border-b border-lineStrong px-4 py-3 sm:px-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-fog">Active Tools</h2>
          <span className="font-mono text-[10px] text-fog">
            {activeByProfile.reduce((n, [, g]) => n + g.modules.length, 0)} live
          </span>
        </div>
        {activeByProfile.length === 0 ? (
          <p className="font-mono text-[11px] text-fog">No tools running.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {activeByProfile.map(([profileId, group]) => (
              <div key={profileId} className="rounded-xl border border-lineStrong bg-raised px-3 py-2">
                <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-brass">{group.name}</p>
                <ul className="flex flex-col gap-1.5">
                  {group.modules.map((module) => {
                    const key = `${profileId}:${module.id}`
                    const progress = module.sent ?? 0
                    return (
                      <li key={module.id} className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-phosphor" />
                        <span className="min-w-0 flex-1 truncate text-[12px] text-snow">{module.label}</span>
                        <span className="shrink-0 font-mono text-[10px] uppercase text-fog">{module.status}</span>
                        <span className="shrink-0 font-mono text-[10px] text-mist">{progress}</span>
                        <button
                          type="button"
                          disabled={stoppingKey === key}
                          onClick={() => void stopTool(profileId, module.id)}
                          className="shrink-0 rounded-lg border border-ember/40 bg-ember/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-ember hover:bg-ember/20 disabled:opacity-40"
                        >
                          Stop
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
      <div
        ref={scrollRef}
        className="min-h-[120px] flex-1 overflow-y-auto px-4 py-3 sm:px-5 sm:py-4"
        aria-live="polite"
      >
        <ul className="flex flex-col gap-3">
          {messages.map((m) => (
            <li
              key={m.id}
              className={[
                'max-w-[92%] whitespace-pre-wrap rounded-xl px-3 py-2 text-[13px] leading-relaxed',
                m.role === 'user'
                  ? 'ml-auto bg-brass/15 text-snow'
                  : 'mr-auto border border-line bg-well text-mist',
              ].join(' ')}
            >
              {m.text}
            </li>
          ))}
          {busy ? (
            <li className="mr-auto max-w-[92%] rounded-xl border border-line bg-well px-3 py-2 font-mono text-[11px] text-fog">
              Working…
            </li>
          ) : null}
        </ul>
      </div>

      {suggestions.length > 0 ? (
        <div className="flex shrink-0 flex-wrap gap-1.5 border-t border-line px-4 py-2 sm:px-5">
          {suggestions.map((chip) => (
            <button
              key={chip.id}
              type="button"
              disabled={busy}
              onClick={() => void submit(chip.prompt)}
              className="min-h-[30px] rounded-full border border-lineStrong bg-raised px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-mist transition hover:border-brass/35 hover:text-snow disabled:opacity-50"
            >
              {chip.label}
            </button>
          ))}
        </div>
      ) : null}

      <form
        className="flex shrink-0 items-end gap-2 border-t border-lineStrong bg-panel px-3 py-2.5 sm:px-4"
        onSubmit={(e) => {
          e.preventDefault()
          void submit(input)
        }}
      >
        <textarea
          ref={inputRef}
          value={input}
          rows={1}
          disabled={busy}
          placeholder={`Tell ${APP_SHORT_NAME} what to run - start outreach, generate slides, backup…`}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void submit(input)
            }
          }}
          className="max-h-28 min-h-[40px] flex-1 resize-none rounded-xl border border-lineStrong bg-well px-3 py-2.5 font-mono text-[13px] text-snow outline-none transition placeholder:text-fog focus:border-brass/55 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="min-h-[40px] shrink-0 rounded-xl border border-brass/40 bg-brass/15 px-3.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-brass transition hover:bg-brass/25 disabled:opacity-40"
        >
          Run
        </button>
      </form>
    </section>
  )
}
