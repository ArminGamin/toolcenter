import { getHubSummary } from './hub-summary.js'
import type { AssistantParseResult } from './assistant-actions.js'
import { sanitizeActions } from './assistant-actions.js'
import { parseAssistantRules } from './assistant-parse.js'
import { getOllamaStatus, ollamaGenerateJson } from './ollama-client.js'

type ParseRequest = {
  prompt: string
  tools?: { id: string; name: string }[]
}

const SYSTEM_PROMPT = `You are the ToolsAI Control Center assistant. Convert user requests into executable actions.

Return ONLY valid JSON:
{
  "actions": [ { "type": "<action>", ...params } ],
  "reply": "short confirmation for the user"
}

Available action types:
- open_module: module = outreach | group-poster | reddit-commenter | seo-blog | ugc-slides | one-shot | markets | notes | pipeline
- open_failures, open_pipeline, open_vault, open_logs, backup, stop_all
- launch_tool: toolId (from tools list)
- create_note: title, body
- start_outreach_find (optional pasteList), start_outreach_send, pause_outreach, resume_outreach, clear_outreach_run
- start_group_poster, pause_group_poster, resume_group_poster
- start_friend_dms, pause_friend_dms, resume_friend_dms
- start_reddit, pause_reddit, resume_reddit, clear_reddit_run
- start_seo_blog
- generate_ugc: topic (required), slideCount (2-12, default 5), brief (optional)
- import_pipeline_outreach, refresh_markets
- reply: message (when only answering or greeting — use ONLY reply actions, no duplicate text elsewhere)

Rules:
- Prefer EXECUTE actions over only opening UI when user says start/run/send/generate/make (including casual: rn, pls, right now, can you, go ahead).
- "start outreach" without "send" → start_outreach_find. "send outreach" / "start sending" → start_outreach_send.
- "open X" → open_module only.
- Combine steps when needed (e.g. generate_ugc + open_module ugc-slides).
- Support MULTIPLE tools: "start outreach and reddit", "run blog + groups".
- For greetings or chit-chat (hey, hello), return a single reply action with a brief helpful message.
- If unclear, use reply to ask one clarifying question.
- Never invent tool IDs not in the tools list.`

function finalizeLlmResult(
  parsed: { actions?: unknown; reply?: string },
  source: 'ollama',
): AssistantParseResult {
  const actions = sanitizeActions(parsed.actions)
  const replyText = String(parsed.reply || '').trim()

  if (!actions.length) {
    const message = replyText || 'No action taken.'
    return { actions: [{ type: 'reply', message }], reply: '', source }
  }

  const replyOnly = actions.every((a) => a.type === 'reply')
  if (replyOnly) {
    return { actions, reply: '', source }
  }

  return { actions, reply: replyText, source }
}

export async function parseAssistantPrompt(body: ParseRequest): Promise<AssistantParseResult> {
  const prompt = String(body.prompt || '').trim()
  const tools = Array.isArray(body.tools) ? body.tools : []
  const hub = getHubSummary()

  const ruled = parseAssistantRules(prompt, {
    tools,
    hub: {
      followUpsDue: hub.followUpsDue,
      failures: hub.failures,
      modules: hub.modules,
    },
  })
  if (ruled) {
    // Avoid duplicate reply text when rules return a single reply action.
    if (ruled.actions.length === 1 && ruled.actions[0]?.type === 'reply') {
      return { ...ruled, reply: '' }
    }
    return ruled
  }

  const lower = prompt.toLowerCase()
  if (/\bollama\b/i.test(lower) && /\b(?:start(?:ed)?|running|up|online|working|ready)\b/i.test(lower)) {
    const status = await getOllamaStatus()
    const message = status.ok
      ? `Yes — Ollama is up at ${status.url} (model: ${status.model}).`
      : `I can't reach Ollama yet. Tried: ${status.tried.join(', ')}. Set OLLAMA_URL in vault to match your host (usually http://127.0.0.1:11434).`
    return { actions: [{ type: 'reply', message }], reply: '', source: 'rules' }
  }

  const ollamaStatus = await getOllamaStatus()
  if (!ollamaStatus.ok) {
    return {
      actions: [
        {
          type: 'reply',
          message: `I can't reach Ollama for chat. Tried: ${ollamaStatus.tried.join(', ')}. Set OLLAMA_URL in vault (e.g. http://127.0.0.1:11434) or check the Ollama tool host setting.`,
        },
      ],
      reply: '',
      source: 'rules',
    }
  }

  try {
    const toolList = tools.map((t) => `${t.id}: ${t.name}`).join('\n')
    const hubLine = hub.modules.map((m) => `${m.id}=${m.status}`).join(', ')
    const raw = await ollamaGenerateJson(
      `${SYSTEM_PROMPT}

Hub status: ${hubLine || 'unknown'}
Tools:
${toolList || '(none)'}

User: ${prompt}`,
      { temperature: 0.2 },
    )
    const parsed = JSON.parse(raw) as { actions?: unknown; reply?: string }
    return finalizeLlmResult(parsed, 'ollama')
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return {
      actions: [
        {
          type: 'reply',
          message: `Ollama chat failed: ${detail}. Try a direct command like “start outreach” or “backup”.`,
        },
      ],
      reply: '',
      source: 'ollama',
    }
  }
}
