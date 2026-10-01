export type PipelineStage = 'active' | 'bought' | 'dead'

export type PipelineTouch = {
  at: string
  note: string
}

export type StageHistoryEntry = {
  at: string
  stage: PipelineStage
}

export type PipelineContact = {
  id: string
  email: string
  name: string
  source: string
  stage: PipelineStage
  tags: string[]
  promoStep: number
  nextActionAt: string | null
  action: string
  value?: number
  noteId?: string
  touches: PipelineTouch[]
  stageHistory: StageHistoryEntry[]
  createdAt: string
  updatedAt: string
}

export type PipelineData = {
  contacts: PipelineContact[]
}

export type PipelineSummary = {
  total: number
  active: number
  bought: number
  dead: number
  engaged: number
  replied: number
  followUpsDue: number
  outreachSent: number
}

export type PipelineExportSegment = 'engaged' | 'replied' | 'due-today' | 'active'

function authHeaders(extra?: HeadersInit): HeadersInit {
  const token =
    typeof window !== 'undefined'
      ? (window as unknown as { __CC_AUTH__?: string }).__CC_AUTH__
      : undefined
  return { ...(extra || {}), ...(token ? { 'X-CC-Token': token } : {}) }
}

export async function fetchPipeline(): Promise<{
  ok: boolean
  message?: string
  data: PipelineData
  summary: PipelineSummary
}> {
  const emptySummary: PipelineSummary = {
    total: 0,
    active: 0,
    bought: 0,
    dead: 0,
    engaged: 0,
    replied: 0,
    followUpsDue: 0,
    outreachSent: 0,
  }
  try {
    const res = await fetch('/api/pipeline', { headers: authHeaders() })
    const contentType = res.headers.get('content-type') || ''
    const raw = await res.text()
    if (!contentType.includes('application/json')) {
      const stale =
        raw.trimStart().startsWith('<!') || raw.trimStart().startsWith('<')
      return {
        ok: false,
        message: stale
          ? 'Pipeline API missing — restart ToolsAI (close dev server and run Start ToolsAI.bat again)'
          : `Pipeline API returned ${contentType || 'non-JSON'}`,
        data: { contacts: [] },
        summary: emptySummary,
      }
    }
    const json = JSON.parse(raw) as {
      ok?: boolean
      message?: string
      data?: PipelineData
      summary?: PipelineSummary
    }
    const ok = res.ok && Boolean(json.ok)
    return {
      ok,
      message: json.message || (ok ? undefined : `Pipeline API failed (${res.status})`),
      data: json.data || { contacts: [] },
      summary: json.summary || emptySummary,
    }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
      data: { contacts: [] },
      summary: emptySummary,
    }
  }
}

export async function savePipeline(data: PipelineData): Promise<{
  ok: boolean
  message?: string
  data?: PipelineData
  summary?: PipelineSummary
}> {
  try {
    const res = await fetch('/api/pipeline', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data),
    })
    return (await res.json()) as {
      ok: boolean
      message?: string
      data?: PipelineData
      summary?: PipelineSummary
    }
  } catch {
    return { ok: false, message: 'Pipeline bridge offline' }
  }
}

export async function importPipelineFromOutreach(): Promise<{
  ok: boolean
  message?: string
  added?: number
  skipped?: number
  data?: PipelineData
  summary?: PipelineSummary
}> {
  try {
    const res = await fetch('/api/pipeline', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ action: 'import-outreach' }),
    })
    return (await res.json()) as {
      ok: boolean
      message?: string
      added?: number
      skipped?: number
      data?: PipelineData
      summary?: PipelineSummary
    }
  } catch {
    return { ok: false, message: 'Pipeline bridge offline' }
  }
}

export async function downloadPipelineExport(segment: PipelineExportSegment): Promise<{
  ok: boolean
  message: string
}> {
  try {
    const res = await fetch(`/api/pipeline?action=export&segment=${encodeURIComponent(segment)}`, {
      headers: authHeaders(),
    })
    if (!res.ok) return { ok: false, message: `Export failed (${res.status})` }
    const text = await res.text()
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pipeline-${segment}-${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
    return { ok: true, message: 'Export downloaded' }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}
