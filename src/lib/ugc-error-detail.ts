export type ErrorDetailSource = {
  message?: string
  error?: string
  errorDetail?: string
  [key: string]: unknown
}

export function serializeClientError(err: unknown, context?: Record<string, unknown>): string {
  const lines: string[] = []
  let cur: unknown = err
  let depth = 0
  while (cur != null && depth < 6) {
    if (cur instanceof Error) {
      lines.push(`[${depth}] ${cur.name}: ${cur.message}`)
      if (cur.stack) lines.push(cur.stack)
      const detail = (cur as Error & { detail?: string }).detail
      if (detail?.trim()) lines.push(`detail:\n${detail.trim()}`)
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

export function errorDetailFromApi(payload: ErrorDetailSource | null | undefined): string | undefined {
  if (!payload) return undefined
  if (typeof payload.errorDetail === 'string' && payload.errorDetail.trim()) {
    return payload.errorDetail.trim()
  }
  const extras = { ...payload }
  delete extras.message
  delete extras.error
  delete extras.errorDetail
  delete extras.ok
  if (!Object.keys(extras).length) return undefined
  return `api:\n${JSON.stringify(extras, null, 2)}`
}

export function batchErrorDetail(
  err: unknown,
  context?: Record<string, unknown>,
  apiPayload?: ErrorDetailSource | null,
): string {
  const parts = [serializeClientError(err, context)]
  const api = errorDetailFromApi(apiPayload)
  if (api) parts.push(api)
  return parts.filter(Boolean).join('\n\n---\n\n')
}
