export function serializeError(err: unknown, context?: Record<string, unknown>): string {
  const lines: string[] = []
  let cur: unknown = err
  let depth = 0
  while (cur != null && depth < 6) {
    if (cur instanceof Error) {
      lines.push(`[${depth}] ${cur.name}: ${cur.message}`)
      if (cur.stack) lines.push(cur.stack)
      cur = cur.cause
    } else {
      lines.push(`[${depth}] ${String(cur)}`)
      break
    }
    depth++
  }
  if (context && Object.keys(context).length) {
    lines.push(`context:\n${JSON.stringify(context, null, 2)}`)
  }
  return lines.join('\n\n')
}

export type UgcFailPayload = {
  ok: false
  message: string
  errorDetail: string
}

export function ugcFail(message: string, err: unknown, context?: Record<string, unknown>): UgcFailPayload {
  return {
    ok: false,
    message,
    errorDetail: serializeError(err, context),
  }
}
