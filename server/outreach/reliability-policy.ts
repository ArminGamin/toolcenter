export const SEND_CIRCUIT_THRESHOLD = 2
export const CHAIN_MAX_DURATION_MS = 2 * 60 * 60 * 1000

export function shouldOpenSendCircuit(
  consecutiveTransientFailures: number,
  threshold = SEND_CIRCUIT_THRESHOLD,
): boolean {
  return consecutiveTransientFailures >= threshold
}

export function chainDurationExceeded(
  startedAt: string | null,
  nowMs = Date.now(),
  maxDurationMs = CHAIN_MAX_DURATION_MS,
): boolean {
  if (!startedAt) return false
  const startedMs = Date.parse(startedAt)
  return Number.isFinite(startedMs) && nowMs - startedMs >= maxDurationMs
}
