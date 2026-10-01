import { extractSystemFromModelfile, getExpectedUgcSystemHash, hashModelfileSystem } from './ugc-modelfile-sync.js'
import { getOllamaStatus } from './ollama-client.js'
import { resolveUgcOllamaModel } from './ugc-env-bridge.js'

function modelNameMatches(installed: string, selected: string): boolean {
  if (!installed || !selected) return false
  const base = (name: string) => name.split(':')[0].toLowerCase()
  const a = base(installed)
  const b = base(selected)
  return a === b || installed === selected || installed.startsWith(`${selected}:`)
}

export type UgcModelDeployVerification = {
  modelReady: boolean
  systemHashMatch: boolean
  expectedHash: string
  actualHash: string | null
  message?: string
}

export type UgcOllamaStatusView = {
  ok: boolean
  online: boolean
  url: string | null
  model: string
  modelReady: boolean
  models: string[]
  message?: string
  deploy?: UgcModelDeployVerification
}

let deployCache: { at: number; value: UgcModelDeployVerification } | null = null
const DEPLOY_CACHE_MS = 5 * 60_000

export function clearUgcModelDeployCache(): void {
  deployCache = null
}

export async function verifyUgcModelDeploy(force = false): Promise<UgcModelDeployVerification> {
  if (!force && deployCache && Date.now() - deployCache.at < DEPLOY_CACHE_MS) {
    return deployCache.value
  }

  const expectedHash = getExpectedUgcSystemHash()
  const status = await getOllamaStatus()
  const model = resolveUgcOllamaModel()

  if (!status.ok || !status.url) {
    return {
      modelReady: false,
      systemHashMatch: false,
      expectedHash,
      actualHash: null,
      message: 'Ollama offline — cannot verify ugc-lt-gpu SYSTEM prompt',
    }
  }

  try {
    const res = await fetch(`${status.url}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model }),
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) {
      return {
        modelReady: false,
        systemHashMatch: false,
        expectedHash,
        actualHash: null,
        message: `Ollama /api/show HTTP ${res.status}`,
      }
    }
    const data = (await res.json()) as { modelfile?: string; parameters?: string }
    const modelfile = String(data.modelfile || '')
    const system = extractSystemFromModelfile(modelfile)
    if (!system) {
      return {
        modelReady: false,
        systemHashMatch: false,
        expectedHash,
        actualHash: null,
        message: `Model ${model} has no SYSTEM block — run: npx tsx scripts/sync-ugc-modelfile.ts && ollama create ugc-lt-gpu -f ollama/Modelfile.ugc-lt-gpu`,
      }
    }
    const actualHash = hashModelfileSystem(system)
    const systemHashMatch = actualHash === expectedHash
    const result = {
      modelReady: true,
      systemHashMatch,
      expectedHash,
      actualHash,
      message: systemHashMatch
        ? undefined
        : 'ugc-lt-gpu SYSTEM prompt out of date — run: npx tsx scripts/sync-ugc-modelfile.ts && ollama create ugc-lt-gpu -f ollama/Modelfile.ugc-lt-gpu && restart Control Center',
    }
    deployCache = { at: Date.now(), value: result }
    return result
  } catch (err) {
    return {
      modelReady: false,
      systemHashMatch: false,
      expectedHash,
      actualHash: null,
      message: err instanceof Error ? err.message : 'Failed to verify ugc-lt-gpu deploy',
    }
  }
}

export async function getUgcOllamaStatus(): Promise<UgcOllamaStatusView> {
  const status = await getOllamaStatus()
  const model = resolveUgcOllamaModel()
  let models: string[] = []
  let modelReady = false
  let message = status.ok ? undefined : 'Ollama offline — start ollama serve'

  if (status.ok && status.url) {
    try {
      const res = await fetch(`${status.url}/api/tags`, {
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) {
        message = `Ollama HTTP ${res.status}`
      } else {
        const data = (await res.json()) as { models?: { name?: string; model?: string }[] }
        models = (data.models || [])
          .map((m) => m.name || m.model || '')
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b))
        modelReady = models.some((m) => modelNameMatches(m, model))
        if (!modelReady) {
          if (/^ugc-lt-gpu$/i.test(model.split(':')[0])) {
            message =
              'Model not installed — run: powershell -File scripts/setup-ugc-ollama-models.ps1 (needs OpenEuroLLM pull first)'
          } else if (/^ugc-lt-/i.test(model)) {
            message = `Model not installed — run scripts/setup-ugc-ollama-models.ps1 (custom model, not ollama pull)`
          } else {
            message = `Model not installed — ollama pull ${model}`
          }
        }
      }
    } catch (err) {
      message = err instanceof Error ? err.message : 'Failed to list Ollama models'
    }
  }

  const deploy = modelReady ? await verifyUgcModelDeploy() : undefined
  if (deploy && !deploy.systemHashMatch && deploy.message) {
    message = deploy.message
  }

  return {
    ok: status.ok && modelReady && (deploy?.systemHashMatch ?? true),
    online: status.ok,
    url: status.url,
    model,
    modelReady,
    models,
    message,
    deploy,
  }
}
