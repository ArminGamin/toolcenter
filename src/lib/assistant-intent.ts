/** Quick-prompt chips for the home assistant. */

export type AssistantSuggestion = {
  id: string
  label: string
  prompt: string
}

export const ASSISTANT_QUICK_PROMPTS: AssistantSuggestion[] = [
  { id: 'combo', label: 'Outreach + Reddit', prompt: 'start outreach and reddit' },
  { id: 'outreach', label: 'Outreach', prompt: 'outreach' },
  { id: 'outreach-send', label: 'Send emails', prompt: 'get emails going' },
  { id: 'reddit', label: 'Reddit time', prompt: 'reddit time' },
  { id: 'seo', label: 'Write posts', prompt: 'write some posts' },
  { id: 'groups', label: 'FB groups', prompt: 'fb groups' },
  { id: 'ugc', label: 'Make slides', prompt: 'slides about meal planning' },
  { id: 'pipeline', label: 'Import CRM', prompt: 'import pipeline' },
  { id: 'markets', label: 'Refresh desk', prompt: 'refresh markets' },
  { id: 'backup', label: 'Save all', prompt: 'save everything' },
  { id: 'failures', label: 'What broke', prompt: 'what broke' },
  { id: 'pause', label: 'Pause outreach', prompt: 'pause outreach' },
  { id: 'status', label: "What's up", prompt: "what's running" },
]

export function buildAssistantSuggestions(): AssistantSuggestion[] {
  return ASSISTANT_QUICK_PROMPTS
}
