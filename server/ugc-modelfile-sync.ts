import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { UGC_OLLAMA_SYSTEM_PROMPT } from './ugc-lt-normalize.js'
import { resolveUgcOllamaModel } from './ugc-env-bridge.js'

const execFileAsync = promisify(execFile)

const DEFAULT_FROM = 'FROM jobautomation/OpenEuroLLM-Lithuanian:latest'
const DEFAULT_PARAMETERS = `PARAMETER num_gpu 44
PARAMETER num_ctx 4096
PARAMETER temperature 0.35
PARAMETER top_p 0.8
PARAMETER repeat_penalty 1.2`

export function extractSystemFromModelfile(content: string): string {
  const match = content.match(/SYSTEM\s+"""\s*([\s\S]*?)\s+"""/)
  return match?.[1]?.trim() ?? ''
}

export function hashModelfileSystem(system: string): string {
  return createHash('sha256').update(system, 'utf8').digest('hex')
}

export function buildModelfileContent(
  systemPrompt: string,
  opts?: { fromLine?: string; parameters?: string },
): string {
  const fromLine = opts?.fromLine?.trim() || DEFAULT_FROM
  const parameters = opts?.parameters?.trim() || DEFAULT_PARAMETERS
  return `# ugc-lt-gpu — SYSTEM generated from UGC_OLLAMA_SYSTEM_PROMPT. Do not edit SYSTEM by hand.
# Run: node scripts/sync-ugc-modelfile.ts && ollama create ugc-lt-gpu -f ollama/Modelfile.ugc-lt-gpu
${fromLine}

SYSTEM """
${systemPrompt}
"""

${parameters}
`
}

export function resolveDefaultModelfilePath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(here, '../ollama/Modelfile.ugc-lt-gpu')
}

export function readCommittedModelfileSystem(modelfilePath = resolveDefaultModelfilePath()): string {
  const content = fs.readFileSync(modelfilePath, 'utf8')
  return extractSystemFromModelfile(content)
}

export function buildSyncedModelfileFromPrompt(
  systemPrompt = UGC_OLLAMA_SYSTEM_PROMPT,
  modelfilePath = resolveDefaultModelfilePath(),
): string {
  let fromLine = DEFAULT_FROM
  let parameters = DEFAULT_PARAMETERS
  if (fs.existsSync(modelfilePath)) {
    const existing = fs.readFileSync(modelfilePath, 'utf8')
    const fromMatch = existing.match(/^FROM .+$/m)
    if (fromMatch) fromLine = fromMatch[0].trim()
    const paramMatch = existing.match(/^(PARAMETER[\s\S]*)$/m)
    if (paramMatch) parameters = paramMatch[1].trim()
  }
  return buildModelfileContent(systemPrompt, { fromLine, parameters })
}

export function syncUgcModelfile(modelfilePath = resolveDefaultModelfilePath()): string {
  const content = buildSyncedModelfileFromPrompt(UGC_OLLAMA_SYSTEM_PROMPT, modelfilePath)
  fs.writeFileSync(modelfilePath, content, 'utf8')
  return content
}

export function getExpectedUgcSystemHash(): string {
  return hashModelfileSystem(UGC_OLLAMA_SYSTEM_PROMPT)
}

export function resolveUgcModelDigestPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(here, '../ollama/ugc-lt-gpu.digest.json')
}

export function writeUgcModelDigestFile(modelfilePath = resolveDefaultModelfilePath()): {
  systemHash: string
  modelfileHash: string
  updatedAt: string
} {
  const modelfileContent = fs.readFileSync(modelfilePath, 'utf8')
  const digest = {
    systemHash: getExpectedUgcSystemHash(),
    modelfileHash: createHash('sha256').update(modelfileContent, 'utf8').digest('hex'),
    updatedAt: new Date().toISOString(),
  }
  fs.writeFileSync(resolveUgcModelDigestPath(), `${JSON.stringify(digest, null, 2)}\n`, 'utf8')
  return digest
}

function resolveOllamaExecutable(): string {
  if (process.env.LOCALAPPDATA) {
    const exe = path.join(process.env.LOCALAPPDATA, 'Programs', 'Ollama', 'ollama.exe')
    if (fs.existsSync(exe)) return exe
  }
  return 'ollama'
}

/** Sync Modelfile from code and rebuild the Ollama custom model. */
export async function redeployUgcOllamaModel(
  modelName = resolveUgcOllamaModel(),
): Promise<{ ok: boolean; message: string }> {
  const modelfilePath = resolveDefaultModelfilePath()
  syncUgcModelfile(modelfilePath)
  writeUgcModelDigestFile(modelfilePath)
  const ollamaExe = resolveOllamaExecutable()
  try {
    await execFileAsync(ollamaExe, ['create', modelName, '-f', modelfilePath], {
      timeout: 600_000,
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
    })
    return { ok: true, message: `Rebuilt ${modelName} from ${modelfilePath}` }
  } catch (err) {
    const detail =
      err instanceof Error && 'stderr' in err && typeof (err as { stderr?: string }).stderr === 'string'
        ? (err as { stderr: string }).stderr.trim().slice(0, 400)
        : err instanceof Error
          ? err.message
          : String(err)
    return { ok: false, message: `ollama create ${modelName} failed: ${detail}` }
  }
}
