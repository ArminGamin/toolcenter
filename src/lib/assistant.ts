import type { AssistantParseResult } from './assistant-actions'
import type { Tool } from '../types'

function authHeaders(extra?: HeadersInit): HeadersInit {
  const token =
    typeof window !== 'undefined' && (window as unknown as { __CC_AUTH__?: string }).__CC_AUTH__
  return { ...(token ? { 'X-CC-Token': token } : {}), ...extra }
}

export async function resolveAssistantPrompt(
  prompt: string,
  tools: Tool[],
): Promise<AssistantParseResult | null> {
  try {
    const res = await fetch('/api/assistant', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        prompt,
        tools: tools.filter((t) => !t.removed).map((t) => ({ id: t.id, name: t.name })),
      }),
    })
    const data = (await res.json()) as AssistantParseResult & { ok?: boolean }
    if (!res.ok || !data.actions?.length) return null
    return {
      actions: data.actions,
      reply: data.reply || '',
      source: data.source || 'rules',
    }
  } catch {
    return null
  }
}
