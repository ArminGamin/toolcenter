import { describeFailure, raiseAlert } from './alerts.js'
import fs from 'node:fs'
import path from 'node:path'
import { CC_DATA, loadVault, TOOLSAI_ROOT } from './cc-services.js'
import { loadToolEnv, readEnvFile, type LaunchEntry } from './launch-runtime.js'
import { auditOllamaCall, getActiveAuditPostId } from './ugc-batch-audit.js'

const POST_MAKER_ENV = path.join(TOOLSAI_ROOT, 'post-maker', '.env')

const OLLAMA_TOOL: LaunchEntry = {
  id: 'ollama',
  path: path.join(CC_DATA, 'ollama'),
  launch: 'ollama.exe',
  processMatch: 'ollama',
  settingsFile: 'control-center.env',
}

const FALLBACK_BASES = ['http://127.0.0.1:11434', 'http://localhost:11434']
const PROBE_PATHS = ['/api/version', '/']
const PROBE_TIMEOUT_MS = 6000

let cachedBaseUrl: string | null = null
let cacheExpiresAt = 0

let ollamaMutexChain: Promise<void> = Promise.resolve()

async function withOllamaMutex<T>(fn: () => Promise<T>): Promise<T> {
  const prev = ollamaMutexChain
  let release!: () => void
  ollamaMutexChain = new Promise<void>((resolve) => {
    release = resolve
  })
  await prev
  try {
    return await fn()
  } finally {
    release()
  }
}

export function isOllamaMutexBusy(): boolean {
  return ollamaMutexChain !== Promise.resolve()
}

export type OllamaCallType =
  | 'draft'
  | 'story_repair'
  | 'native_rewrite'
  | 'final_qa_judge'
  | 'final_qa_rewrite'
  | 'final_qa_rejudge'
  | 'product_debt_repair'
  | 'story_generation'
  | 'hook_title'
  | 'caption'
  | 'other'

export type OllamaCallOutcome = 'ok' | 'partial' | 'timeout' | 'error' | 'empty' | 'aborted'

export type OllamaCallStat = {
  callType: OllamaCallType
  outcome: OllamaCallOutcome
  durationMs: number
  evalCount?: number
  promptEvalCount?: number
  numPredict: number
  doneReason?: string
}

const EVAL_RATE_FILE = path.join(CC_DATA, 'ollama-eval-rate.json')
const evalRate = { tokensPerSec: 0, samples: 0, loaded: false }

function loadPersistedEvalRate() {
  if (evalRate.loaded) return
  evalRate.loaded = true
  try {
    const parsed = JSON.parse(fs.readFileSync(EVAL_RATE_FILE, 'utf8')) as { tokensPerSec?: number }
    if (typeof parsed.tokensPerSec === 'number' && parsed.tokensPerSec > 0) {
      evalRate.tokensPerSec = parsed.tokensPerSec
    }
  } catch {
    /* first run — measured on the first completed call */
  }
}

function recordEvalRate(evalCount?: number, evalDurationNs?: number) {
  if (!evalCount || !evalDurationNs || evalCount < 40) return
  const tps = evalCount / (evalDurationNs / 1e9)
  if (!Number.isFinite(tps) || tps <= 0) return
  loadPersistedEvalRate()
  evalRate.tokensPerSec = evalRate.tokensPerSec ? evalRate.tokensPerSec * 0.7 + tps * 0.3 : tps
  evalRate.samples += 1
  try {
    fs.writeFileSync(
      EVAL_RATE_FILE,
      JSON.stringify({ tokensPerSec: evalRate.tokensPerSec, at: new Date().toISOString() }) + '\n',
      'utf8',
    )
  } catch {
    /* throughput cache is optional */
  }
}

/** Measured generation speed of the loaded model (EMA, persisted across restarts); 0 if never measured. */
export function ollamaObservedTokensPerSec(): number {
  loadPersistedEvalRate()
  return evalRate.tokensPerSec
}

/**
 * Cap num_predict so generation finishes inside the timeout at the measured speed.
 * A capped call returns truncated-but-salvageable JSON instead of timing out with nothing.
 */
export function ollamaTimeFitNumPredict(requested: number, timeoutMs: number, promptChars = 0): number {
  const tps = ollamaObservedTokensPerSec()
  if (!tps) return requested
  const promptSec = promptChars / 4 / 450
  const usableSec = timeoutMs / 1000 - promptSec - 6
  const fit = Math.floor(tps * usableSec * 0.75)
  return Math.max(96, Math.min(requested, fit))
}

type OllamaStatListener = (stat: OllamaCallStat) => void
const statListeners = new Set<OllamaStatListener>()

export function onOllamaCallStat(listener: OllamaStatListener): () => void {
  statListeners.add(listener)
  return () => statListeners.delete(listener)
}

function emitOllamaStat(stat: OllamaCallStat) {
  for (const listener of statListeners) {
    try {
      listener(stat)
    } catch {
      /* stats never break generation */
    }
  }
}

/**
 * Streamed generate: on timeout, keep every token produced so far instead of losing the call.
 * External (user) aborts still throw.
 */
async function streamGenerateKeepPartial(
  base: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
  external?: AbortSignal,
): Promise<{ text: string; meta: Record<string, unknown>; timedOut: boolean }> {
  const res = await fetch(`${base}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, stream: true }),
    signal,
  })
  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Ollama stream error (${res.status}): ${errText.trim().slice(0, 200)}`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''
  let meta: Record<string, unknown> = {}
  let timedOut = false
  const consume = (line: string) => {
    if (!line.trim()) return
    try {
      const obj = JSON.parse(line) as Record<string, unknown>
      if (typeof obj.response === 'string') text += obj.response
      if (obj.done) {
        meta = {
          total_duration: obj.total_duration,
          load_duration: obj.load_duration,
          prompt_eval_count: obj.prompt_eval_count,
          prompt_eval_duration: obj.prompt_eval_duration,
          eval_count: obj.eval_count,
          eval_duration: obj.eval_duration,
          done_reason: obj.done_reason,
          responseModel: obj.model,
        }
      }
    } catch {
      /* partial NDJSON line — completed on the next chunk */
    }
  }
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let nl = buffer.indexOf('\n')
      while (nl >= 0) {
        consume(buffer.slice(0, nl))
        buffer = buffer.slice(nl + 1)
        nl = buffer.indexOf('\n')
      }
    }
    consume(buffer)
  } catch (err) {
    if (external?.aborted || !text.trim()) throw err
    timedOut = true
    meta = { ...meta, done_reason: 'timeout_partial', partial_chars: text.length }
  }
  return { text, meta, timedOut }
}

function classifyOllamaError(err: unknown): OllamaCallOutcome {
  if (!(err instanceof Error)) return 'error'
  if (err.name === 'TimeoutError' || /timeout/i.test(err.message)) return 'timeout'
  if (err.name === 'AbortError' || /abort/i.test(err.message)) return 'aborted'
  if (/empty response/i.test(err.message)) return 'empty'
  return 'error'
}

function mergeAbortSignals(timeoutMs: number, external?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs)
  if (!external) return timeout
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([external, timeout])
  }
  const ctrl = new AbortController()
  const onAbort = () => ctrl.abort()
  if (external.aborted || timeout.aborted) {
    ctrl.abort()
    return ctrl.signal
  }
  external.addEventListener('abort', onAbort, { once: true })
  timeout.addEventListener('abort', onAbort, { once: true })
  return ctrl.signal
}

function normalizeBase(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed.replace(/\/$/, '')
  return `http://${trimmed.replace(/\/$/, '')}`
}

function collectOllamaBaseCandidates(): string[] {
  const vault = loadVault()
  const toolEnv = loadToolEnv(OLLAMA_TOOL)
  const postMakerEnv = readEnvFile(POST_MAKER_ENV)
  const rawValues = [
    ...FALLBACK_BASES,
    toolEnv.OLLAMA_HOST,
    toolEnv.OLLAMA_URL,
    vault.OLLAMA_HOST,
    vault.OLLAMA_URL,
    postMakerEnv.OLLAMA_HOST,
    postMakerEnv.OLLAMA_URL,
  ]
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of rawValues) {
    const base = normalizeBase(String(raw || ''))
    if (base && !seen.has(base)) {
      seen.add(base)
      out.push(base)
    }
  }
  return out
}

async function probeBase(base: string): Promise<boolean> {
  for (const p of PROBE_PATHS) {
    try {
      const res = await fetch(`${base}${p}`, {
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      })
      if (res.ok) return true
    } catch {
      /* try next path */
    }
  }
  return false
}

export type OllamaStatus = {
  ok: boolean
  url: string | null
  model: string
  tried: string[]
}

export async function getOllamaStatus(): Promise<OllamaStatus> {
  const tried = collectOllamaBaseCandidates()
  const model = resolveOllamaModel()
  const probes = await Promise.all(
    tried.map(async (base) => ({ base, ok: await probeBase(base) })),
  )
  const hit = probes.find((p) => p.ok)
  if (hit) {
    cachedBaseUrl = hit.base
    cacheExpiresAt = Date.now() + 30_000
    return { ok: true, url: hit.base, model, tried }
  }
  cachedBaseUrl = null
  cacheExpiresAt = 0
  return { ok: false, url: null, model, tried }
}

export function resolveOllamaBaseUrl(): string {
  if (cachedBaseUrl && Date.now() < cacheExpiresAt) return cachedBaseUrl
  const first = collectOllamaBaseCandidates()[0]
  return first || FALLBACK_BASES[0]
}

export function resolveOllamaModel(): string {
  const vault = loadVault()
  const toolEnv = loadToolEnv(OLLAMA_TOOL)
  const postMakerEnv = readEnvFile(POST_MAKER_ENV)
  return (
    (
      toolEnv.OLLAMA_MODEL ||
      vault.OLLAMA_MODEL ||
      postMakerEnv.OLLAMA_MODEL ||
      'llama3.1:8b'
    ).trim() || 'llama3.1:8b'
  )
}

/** GPU layers to offload (Ollama num_gpu). Undefined = Ollama auto (PostMaker — full GPU). */
export function resolveOllamaNumGpu(): number | undefined {
  const vault = loadVault()
  const toolEnv = loadToolEnv(OLLAMA_TOOL)
  const postMakerEnv = readEnvFile(POST_MAKER_ENV)
  const raw = (toolEnv.OLLAMA_NUM_GPU || vault.OLLAMA_NUM_GPU || postMakerEnv.OLLAMA_NUM_GPU || '').trim()
  if (!raw) return undefined
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return undefined
  return Math.min(99, Math.round(n))
}

export async function isOllamaConfigured(): Promise<boolean> {
  const status = await getOllamaStatus()
  return status.ok
}

async function resolveWorkingBase(): Promise<string> {
  if (cachedBaseUrl && Date.now() < cacheExpiresAt) return cachedBaseUrl
  const status = await getOllamaStatus()
  if (!status.ok || !status.url) {
    throw new Error(
      `Ollama not reachable. Tried: ${status.tried.join(', ') || 'none'}. Check OLLAMA_HOST / OLLAMA_URL in vault.`,
    )
  }
  return status.url
}

export async function ollamaGenerateJson(
  prompt: string,
  options?: {
    temperature?: number
    model?: string
    system?: string
    useJsonFormat?: boolean
    numPredict?: number
    numCtx?: number
    keepAlive?: number | string
    timeoutMs?: number
    topP?: number
    numGpu?: number
    signal?: AbortSignal
    callType?: OllamaCallType
    /** Shrink num_predict to what the measured tokens/sec can finish before timeoutMs. */
    timeFit?: boolean
  },
): Promise<string> {
  const base = await resolveWorkingBase()
  const model = (options?.model || '').trim() || resolveOllamaModel()
  const useJsonFormat = options?.useJsonFormat !== false
  const callType: OllamaCallType = options?.callType || 'other'
  const requestedPredict = options?.numPredict ?? 2048
  const numPredict =
    options?.timeFit && options?.timeoutMs
      ? ollamaTimeFitNumPredict(
          requestedPredict,
          options.timeoutMs,
          prompt.length + (options?.system || '').length,
        )
      : requestedPredict
  const genOptions: Record<string, number> = {
    temperature: options?.temperature ?? 0.2,
    num_predict: numPredict,
    top_p: options?.topP ?? 0.9,
    // Larger prompt batch → better GPU; 256 keeps AMD+low-RAM from thrashing
    num_batch: options?.numCtx != null && options.numCtx <= 4096 ? 256 : 512,
  }
  if (options?.numCtx != null && Number.isFinite(options.numCtx)) {
    genOptions.num_ctx = Math.max(512, Math.round(options.numCtx))
  }
  const numGpu =
    options?.numGpu !== undefined ? options.numGpu : resolveOllamaNumGpu()
  if (numGpu !== undefined && numGpu >= 0) {
    genOptions.num_gpu = numGpu
  }
  const body: Record<string, unknown> = {
    model,
    prompt,
    stream: false,
    options: genOptions,
  }
  if (options?.keepAlive !== undefined) {
    body.keep_alive = options.keepAlive
  }
  if (useJsonFormat) body.format = 'json'
  if (options?.system?.trim()) {
    body.system = options.system.trim()
  }
  const timeoutMs = options?.timeoutMs ?? 180_000
  return withOllamaMutex(async () => {
  const requestSignal = mergeAbortSignals(timeoutMs, options?.signal)
  const t0 = Date.now()
  let emptyRetry = false
  let ollamaMeta: Record<string, unknown> = {}
  const audit = (payload: Omit<Parameters<typeof auditOllamaCall>[0], 'callType' | 'requestedNumPredict'>) => {
    if (!getActiveAuditPostId()) return
    auditOllamaCall({ ...payload, callType, requestedNumPredict: requestedPredict })
  }
  const stat = (outcome: OllamaCallOutcome) =>
    emitOllamaStat({
      callType,
      outcome,
      durationMs: Date.now() - t0,
      evalCount: typeof ollamaMeta.eval_count === 'number' ? ollamaMeta.eval_count : undefined,
      promptEvalCount:
        typeof ollamaMeta.prompt_eval_count === 'number' ? ollamaMeta.prompt_eval_count : undefined,
      numPredict,
      doneReason: typeof ollamaMeta.done_reason === 'string' ? ollamaMeta.done_reason : undefined,
    })
  try {
    if (options?.timeFit) {
      const streamed = await streamGenerateKeepPartial(base, body, requestSignal, options?.signal)
      ollamaMeta = streamed.meta
      recordEvalRate(
        typeof streamed.meta.eval_count === 'number' ? streamed.meta.eval_count : undefined,
        typeof streamed.meta.eval_duration === 'number' ? streamed.meta.eval_duration : undefined,
      )
      const streamedText = streamed.text.trim()
      if (!streamedText) throw new Error('Ollama stream returned no tokens')
      audit({
        prompt,
        system: options?.system,
        model,
        options: genOptions,
        keepAlive: options?.keepAlive,
        useJsonFormat,
        responseText: streamedText,
        ollamaMeta,
        durationMs: Date.now() - t0,
      })
      stat(streamed.timedOut ? 'partial' : 'ok')
      return streamedText
    }
    const res = await fetch(`${base}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: requestSignal,
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      const err = errText.trim().slice(0, 240) || `Ollama error (${res.status})`
      audit({
        prompt,
        system: options?.system,
        model,
        options: genOptions,
        keepAlive: options?.keepAlive,
        useJsonFormat,
        responseText: '',
        durationMs: Date.now() - t0,
        error: err,
      })
      stat('error')
      throw new Error(err)
    }
    const data = (await res.json()) as {
      response?: string
      total_duration?: number
      load_duration?: number
      prompt_eval_count?: number
      prompt_eval_duration?: number
      eval_count?: number
      eval_duration?: number
      done_reason?: string
      model?: string
    }
    ollamaMeta = {
      total_duration: data.total_duration,
      load_duration: data.load_duration,
      prompt_eval_count: data.prompt_eval_count,
      prompt_eval_duration: data.prompt_eval_duration,
      eval_count: data.eval_count,
      eval_duration: data.eval_duration,
      done_reason: data.done_reason,
      responseModel: data.model,
    }
    recordEvalRate(data.eval_count, data.eval_duration)
    let text = data.response?.trim()
    if (!text) {
      emptyRetry = true
      // One retry on empty (model occasionally returns blank under load)
      const retry = await fetch(`${base}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...body,
          options: {
            ...(body.options as object),
            temperature: Math.max(0.2, Number((body.options as { temperature?: number })?.temperature ?? 0.2) - 0.1),
          },
        }),
        signal: requestSignal,
      })
      if (!retry.ok) {
        const err = `Ollama error (${retry.status})`
        audit({
          prompt,
          system: options?.system,
          model,
          options: genOptions,
          keepAlive: options?.keepAlive,
          useJsonFormat,
          responseText: '',
          ollamaMeta,
          durationMs: Date.now() - t0,
          error: err,
          emptyRetry: true,
        })
        stat('error')
        throw new Error(err)
      }
      const retryData = (await retry.json()) as typeof data
      ollamaMeta = {
        ...ollamaMeta,
        retry: {
          total_duration: retryData.total_duration,
          eval_count: retryData.eval_count,
          eval_duration: retryData.eval_duration,
          done_reason: retryData.done_reason,
        },
      }
      text = retryData.response?.trim()
    }
    if (!text) {
      audit({
        prompt,
        system: options?.system,
        model,
        options: genOptions,
        keepAlive: options?.keepAlive,
        useJsonFormat,
        responseText: '',
        ollamaMeta,
        durationMs: Date.now() - t0,
        error: 'Ollama returned empty response',
        emptyRetry,
      })
      stat('empty')
      throw new Error('Ollama returned empty response')
    }
    audit({
      prompt,
      system: options?.system,
      model,
      options: genOptions,
      keepAlive: options?.keepAlive,
      useJsonFormat,
      responseText: text,
      ollamaMeta,
      durationMs: Date.now() - t0,
      emptyRetry,
    })
    stat('ok')
    return text
  } catch (err) {
    if (!(err instanceof Error && /Ollama error|empty response/i.test(err.message))) {
      audit({
        prompt,
        system: options?.system,
        model,
        options: genOptions,
        keepAlive: options?.keepAlive,
        useJsonFormat,
        responseText: '',
        ollamaMeta,
        durationMs: Date.now() - t0,
        error: err instanceof Error ? err.message : String(err),
        emptyRetry,
      })
      stat(classifyOllamaError(err))
    }
    throw err
  }
  })
}

/** Unload every loaded Ollama model except `keepModel` — frees VRAM/RAM before UGC. */
export async function ollamaUnloadOtherModels(keepModel?: string): Promise<void> {
  try {
    const base = await resolveWorkingBase()
    const res = await fetch(`${base}/api/ps`, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) return
    const data = (await res.json()) as { models?: Array<{ name?: string; model?: string }> }
    const keep = (keepModel || '').trim().toLowerCase().replace(/:latest$/i, '')
    for (const row of data.models || []) {
      const name = (row.name || row.model || '').trim()
      if (!name) continue
      const norm = name.toLowerCase().replace(/:latest$/i, '')
      if (keep && (norm === keep || norm.startsWith(`${keep}:`) || keep.startsWith(norm))) continue
      await ollamaUnloadModel(name)
    }
  } catch {
    /* best-effort */
  }
}

/** True when `model` is already loaded in Ollama (/api/ps). */
export async function ollamaModelResident(model: string): Promise<boolean> {
  try {
    const base = await resolveWorkingBase()
    const res = await fetch(`${base}/api/ps`, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) return false
    const data = (await res.json()) as { models?: Array<{ name?: string; model?: string }> }
    const want = model.trim().toLowerCase().replace(/:latest$/i, '')
    return (data.models || []).some((row) => {
      const name = (row.name || row.model || '').trim().toLowerCase().replace(/:latest$/i, '')
      return name === want || name.startsWith(`${want}:`) || want.startsWith(name)
    })
  } catch {
    return false
  }
}

/** Preload model into VRAM with explicit GPU layers. Skips when already resident. */
export async function ollamaWarmModel(options?: {
  model?: string
  numGpu?: number
  numCtx?: number
  keepAlive?: number | string
  unloadOthers?: boolean
}): Promise<{ skipped: boolean; warmRequestMs: number; loadDurationNs?: number; evalDurationNs?: number; failed?: boolean }> {
  const started = Date.now()
  try {
    const model = (options?.model || '').trim() || resolveOllamaModel()
    if (await ollamaModelResident(model)) {
      console.log('Model already resident — warm skipped')
      return { skipped: true, warmRequestMs: Date.now() - started }
    }
    if (options?.unloadOthers !== false) {
      await ollamaUnloadOtherModels(model)
    }
    const base = await resolveWorkingBase()
    const genOptions: Record<string, number> = {
      num_predict: 1,
      num_ctx: options?.numCtx ?? 4096,
    }
    const numGpu =
      options?.numGpu !== undefined ? options.numGpu : resolveOllamaNumGpu()
    if (numGpu !== undefined && numGpu >= 0) {
      genOptions.num_gpu = numGpu
    }
    const res = await fetch(`${base}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: ' ',
        stream: false,
        keep_alive: options?.keepAlive ?? '10m',
        options: genOptions,
      }),
      signal: AbortSignal.timeout(180_000),
    })
    const data = (await res.json().catch(() => ({}))) as { load_duration?: number; eval_duration?: number }
    const warmRequestMs = Date.now() - started
    console.log(
      `Warm done ${warmRequestMs}ms load_duration=${data.load_duration ?? 0}ns eval_duration=${data.eval_duration ?? 0}ns`,
    )
    if (!res.ok) {
      raiseAlert('Ollama warm-up failed', `HTTP ${res.status} while loading ${options?.model || resolveOllamaModel()}`, { source: 'ollama' })
      return { skipped: false, warmRequestMs, failed: true }
    }
    return { skipped: false, warmRequestMs, loadDurationNs: data.load_duration, evalDurationNs: data.eval_duration }
  } catch (err) {
    const model = (options?.model || '').trim() || resolveOllamaModel()
    // Never fail silently: a hung load used to just eat 3 minutes with no message.
    raiseAlert(
      'Ollama warm-up failed',
      `${describeFailure(err, `${model} did not load within 3 minutes`)}. Is Ollama running, and is the GPU free?`,
      { source: 'ollama' },
    )
    return { skipped: false, warmRequestMs: Date.now() - started, failed: true }
  }
}

/** Drop a loaded model from RAM (keep_alive: 0). Best-effort — never throws. */
export async function ollamaUnloadModel(model?: string): Promise<void> {
  try {
    const base = await resolveWorkingBase()
    const name = (model || '').trim() || resolveOllamaModel()
    await fetch(`${base}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: name, prompt: ' ', keep_alive: 0 }),
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    /* idle cleanup should not break user flows */
  }
}
