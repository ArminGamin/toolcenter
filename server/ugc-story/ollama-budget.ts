/** Per-post Ollama call budget and chunk sizing. (Split out of ugc-story-engine.ts.) */

export function batchChunkSize(slideCount: number): number {
  if (slideCount <= 3) return slideCount
  if (slideCount === 4) return 4
  return 3
}

export function postOllamaBudgetForSlideCount(slideCount: number): number {
  const chunks = Math.ceil(slideCount / batchChunkSize(slideCount))
  return Math.max(4, chunks * 2)
}

export const MAX_OLLAMA_CALLS_PER_POST = 8

export let postOllamaBudget = { max: MAX_OLLAMA_CALLS_PER_POST, used: 0 }

export function resetPostOllamaBudget(max = MAX_OLLAMA_CALLS_PER_POST) {
  postOllamaBudget = { max, used: 0 }
}

export function isPostOllamaBudgetExhausted(): boolean {
  return postOllamaBudget.used >= postOllamaBudget.max
}

export function consumePostOllamaCall(): boolean {
  if (postOllamaBudget.used >= postOllamaBudget.max) return false
  postOllamaBudget.used += 1
  return true
}
