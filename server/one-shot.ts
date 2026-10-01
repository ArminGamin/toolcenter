import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadVault } from './cc-services.js'
import { extractJsonObject } from './json-extract.js'
import { publishOneShotMediaToDiscord } from './discord-publisher.js'
import { loadToolEnv, type LaunchEntry } from './launch-runtime.js'
import { getOllamaStatus, isOllamaConfigured, ollamaGenerateJson } from './ollama-client.js'
import { readPostMakerDiscordApp } from './ugc-discord-settings.js'
import {
  ONE_SHOT_MAX_WORDS,
  ONE_SHOT_SYSTEM_PROMPT,
  buildOneShotUserPrompt,
  countWords,
  detectVoice,
  normalizeOneShotText,
  validateOneShotText,
  discordCaptionForNote,
  resolveOneShotCaptions,
  type OneShotVoice,
} from './one-shot-copy-skill.js'
import {
  getOneShotThemePoolStatus,
  pickBatchOneShotThemes,
  pickUnusedOneShotTheme,
} from './one-shot-theme-pool.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CC_ROOT = path.resolve(__dirname, '..')

const ONE_SHOT_TOOL: LaunchEntry = {
  id: 'one_shot',
  path: CC_ROOT,
  launch: '',
  settingsFile: 'assets/one-shot/settings.env',
}

const OLLAMA_OFFLINE_MSG =
  'Ollama is not running. Start Ollama, then set the model in One-Shot settings.'

const ONE_SHOT_VIDEO_DURATION_SEC = 7
const ONE_SHOT_VIDEO_MAX_BYTES = Math.floor(9.5 * 1024 * 1024)

function parseMp4DurationSec(buf: Buffer): number | null {
  const marker = buf.indexOf(Buffer.from('mvhd'))
  if (marker < 0) return null
  const version = buf[marker + 4]
  const timescale = version === 1 ? buf.readUInt32BE(marker + 24) : buf.readUInt32BE(marker + 16)
  const duration = version === 1 ? Number(buf.readBigUInt64BE(marker + 28)) : buf.readUInt32BE(marker + 20)
  return timescale ? duration / timescale : 0
}

export function encodeOneShotStillToMp4(
  pngBase64: string,
): { ok: true; videoBase64: string; durationSec: number; bytes: number } | { ok: false; message: string } {
  const png = Buffer.from(pngBase64.trim(), 'base64')
  if (!png.length) return { ok: false, message: 'No PNG to encode' }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-oneshot-'))
  const inFile = path.join(tmp, 'slide.png')
  const outFile = path.join(tmp, 'slide.mp4')
  try {
    fs.writeFileSync(inFile, png)
    const proc = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-loop',
        '1',
        '-framerate',
        '15',
        '-i',
        inFile,
        '-t',
        String(ONE_SHOT_VIDEO_DURATION_SEC),
        '-vf',
        'scale=trunc(iw/2)*2:trunc(ih/2)*2',
        '-c:v',
        'libx264',
        '-tune',
        'stillimage',
        '-pix_fmt',
        'yuv420p',
        '-preset',
        'veryfast',
        '-b:v',
        '800k',
        '-maxrate',
        '1200k',
        '-bufsize',
        '1600k',
        '-movflags',
        '+faststart',
        '-an',
        outFile,
      ],
      { encoding: 'utf8', windowsHide: true, timeout: 120_000 },
    )
    if (proc.status !== 0 || !fs.existsSync(outFile)) {
      const err = (proc.stderr || proc.error?.message || 'ffmpeg failed').slice(0, 400)
      return { ok: false, message: err }
    }
    const mp4 = fs.readFileSync(outFile)
    if (mp4.byteLength > ONE_SHOT_VIDEO_MAX_BYTES) {
      return { ok: false, message: 'Encoded video exceeds 9.5MB' }
    }
    const durationSec = parseMp4DurationSec(mp4)
    return {
      ok: true,
      videoBase64: mp4.toString('base64'),
      durationSec: durationSec ?? 0,
      bytes: mp4.byteLength,
    }
  } finally {
    try {
      fs.rmSync(tmp, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
}

export type OneShotPost = {
  text: string
  caption: string
  captions: string[]
  voice: 'i' | 'you' | 'mixed'
  theme: string
  category: string
  words: number
}

function resolveOneShotModel(): string {
  const env = loadToolEnv(ONE_SHOT_TOOL)
  return (env.OLLAMA_MODEL || 'llama3.1:8b').trim() || 'llama3.1:8b'
}

function resolveOneShotNumGpu(): number | undefined {
  const env = loadToolEnv(ONE_SHOT_TOOL)
  const n = Number(env.OLLAMA_NUM_GPU || '')
  if (!Number.isFinite(n) || n <= 0) return undefined
  return Math.min(99, Math.round(n))
}

export async function getOneShotOllamaStatus() {
  const status = await getOllamaStatus()
  const model = resolveOneShotModel()
  let models: string[] = []
  let modelReady = false
  let message = status.ok ? undefined : OLLAMA_OFFLINE_MSG

  if (status.ok && status.url) {
    try {
      const res = await fetch(`${status.url}/api/tags`, { signal: AbortSignal.timeout(8000) })
      if (res.ok) {
        const data = (await res.json()) as { models?: { name?: string; model?: string }[] }
        models = (data.models || [])
          .map((m) => m.name || m.model || '')
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b))
        modelReady = models.some(
          (m) => m === model || m.startsWith(`${model}:`) || m.split(':')[0] === model.split(':')[0],
        )
        if (!modelReady) message = `Model not installed — ollama pull ${model}`
      } else {
        message = `Ollama HTTP ${res.status}`
      }
    } catch (err) {
      message = err instanceof Error ? err.message : 'Failed to list Ollama models'
    }
  }

  return {
    ok: status.ok && modelReady,
    online: status.ok,
    url: status.url,
    model,
    modelReady,
    models,
    message,
  }
}

function parseVoice(raw: unknown): OneShotVoice {
  const v = String(raw || 'auto').toLowerCase()
  if (v === 'i' || v === 'you' || v === 'auto') return v
  return 'auto'
}

async function generateOnce(input: {
  theme: string
  category: string
  topic?: string
  voice: OneShotVoice
}): Promise<OneShotPost> {
  const prompt = buildOneShotUserPrompt(input)
  const raw = await ollamaGenerateJson(prompt, {
    temperature: 0.85,
    model: resolveOneShotModel(),
    system: ONE_SHOT_SYSTEM_PROMPT,
    useJsonFormat: true,
    numPredict: 700,
    numCtx: 4096,
    numGpu: resolveOneShotNumGpu(),
    keepAlive: '10m',
    timeoutMs: 120_000,
  })
  const parsed = extractJsonObject(raw) as {
    text?: unknown
    voice?: unknown
    caption?: unknown
    captions?: unknown
  }
  const text = normalizeOneShotText(String(parsed?.text || ''))
  const err = validateOneShotText(text)
  if (err) throw new Error(err)
  let trimmed = text
  const words = countWords(trimmed)
  if (words > ONE_SHOT_MAX_WORDS) {
    const parts = trimmed.split(/(?<=[.!?])\s+/)
    while (countWords(trimmed) > ONE_SHOT_MAX_WORDS && parts.length > 2) {
      parts.pop()
      trimmed = parts.join(' ').trim()
    }
  }
  const after = validateOneShotText(trimmed)
  if (after && !after.startsWith('Too long')) throw new Error(after)
  const labeled = resolveOneShotCaptions(trimmed, parsed)
  return {
    text: trimmed,
    caption: labeled.caption,
    captions: labeled.captions,
    voice: detectVoice(trimmed),
    theme: input.theme,
    category: input.category,
    words: countWords(trimmed),
  }
}

export async function generateOneShotPost(input: {
  category?: string
  topic?: string
  voice?: string
}): Promise<{ ok: true; post: OneShotPost } | { ok: false; message: string }> {
  if (!(await isOllamaConfigured())) return { ok: false, message: OLLAMA_OFFLINE_MSG }
  const voice = parseVoice(input.voice)
  const topic = input.topic?.trim()
  const picked = topic
    ? { category: input.category?.trim() || 'Custom', theme: topic }
    : pickUnusedOneShotTheme(input.category)
  if (!picked) {
    return { ok: false, message: 'No unused themes left. Reset the theme pool in Settings.' }
  }
  let last = 'Generation failed'
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const post = await generateOnce({
        theme: picked.theme,
        category: picked.category,
        topic,
        voice,
      })
      return { ok: true, post }
    } catch (err) {
      last = err instanceof Error ? err.message : String(err)
    }
  }
  return { ok: false, message: last }
}

export async function generateOneShotBatch(input: {
  count: number
  category?: string
  topic?: string
  voice?: string
}): Promise<{ ok: true; posts: OneShotPost[] } | { ok: false; message: string; posts?: OneShotPost[] }> {
  if (!(await isOllamaConfigured())) return { ok: false, message: OLLAMA_OFFLINE_MSG }
  const n = Math.max(1, Math.min(50, Math.floor(input.count)))
  const voice = parseVoice(input.voice)
  const topic = input.topic?.trim()
  const posts: OneShotPost[] = []

  if (topic) {
    for (let i = 0; i < n; i++) {
      let last = 'Generation failed'
      let ok = false
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          posts.push(
            await generateOnce({
              theme: topic,
              category: input.category?.trim() || 'Custom',
              topic,
              voice,
            }),
          )
          ok = true
          break
        } catch (err) {
          last = err instanceof Error ? err.message : String(err)
        }
      }
      if (!ok) return { ok: false, message: `Post ${i + 1}: ${last}`, posts }
    }
    return { ok: true, posts }
  }

  const picked = pickBatchOneShotThemes(n, input.category)
  if (!picked.ok || !picked.themes?.length) {
    return { ok: false, message: picked.message || 'No unused themes left.' }
  }
  for (let i = 0; i < picked.themes.length; i++) {
    const theme = picked.themes[i]
    let last = 'Generation failed'
    let ok = false
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        posts.push(
          await generateOnce({
            theme: theme.theme,
            category: theme.category,
            voice,
          }),
        )
        ok = true
        break
      } catch (err) {
        last = err instanceof Error ? err.message : String(err)
      }
    }
    if (!ok) return { ok: false, message: `Post ${i + 1}: ${last}`, posts }
  }
  return { ok: true, posts }
}

export type OneShotDiscordSettingsView = {
  guildId: string
  categoryId: string
  tokenConfigured: boolean
}

export function loadOneShotDiscordSettings(): OneShotDiscordSettingsView {
  const creds = resolveOneShotDiscord()
  return {
    guildId: creds.guildId,
    categoryId: creds.categoryId,
    tokenConfigured: Boolean(creds.token),
  }
}

export function resolveOneShotDiscord(overrides?: {
  token?: string
  guildId?: string
  categoryId?: string
}): { token: string; guildId: string; categoryId: string } {
  const env = loadToolEnv(ONE_SHOT_TOOL)
  const vault = loadVault()
  const pm = readPostMakerDiscordApp()
  return {
    token: (
      overrides?.token ||
      env.DISCORD_BOT_TOKEN ||
      vault.DISCORD_BOT_TOKEN ||
      pm.token ||
      ''
    ).trim(),
    guildId: (
      overrides?.guildId ||
      env.DISCORD_GUILD_ID ||
      vault.DISCORD_GUILD_ID ||
      pm.guildId ||
      ''
    ).trim(),
    categoryId: (overrides?.categoryId || env.DISCORD_CATEGORY_ID || '').trim(),
  }
}

export async function publishOneShotToDiscord(input: {
  caption: string
  text?: string
  videoBase64?: string
  videoExt?: string
  pngBase64?: string
  filename?: string
  guildId?: string
  categoryId?: string
  token?: string
}) {
  const creds = resolveOneShotDiscord({
    token: input.token,
    guildId: input.guildId,
    categoryId: input.categoryId,
  })
  if (!creds.token) {
    return { ok: false, error: 'Discord bot token missing. Set it in One-Shot settings.' }
  }
  if (!creds.guildId) {
    return { ok: false, error: 'Guild ID is required. Set it in One-Shot settings.' }
  }
  if (!creds.categoryId) {
    return { ok: false, error: 'Category ID is required. Set it in One-Shot settings.' }
  }
  const videoB64 = input.videoBase64?.trim()
  const pngB64 = input.pngBase64?.trim()
  const media = Buffer.from(videoB64 || pngB64 || '', 'base64')
  if (!media.length) return { ok: false, error: 'No video to publish.' }
  if (videoB64 && media.byteLength > 9.5 * 1024 * 1024) {
    return { ok: false, error: 'Video exceeds 9.5MB Discord limit. Re-export at a lower size.' }
  }
  const caption = discordCaptionForNote(input.caption, input.text)
  const ext = (input.videoExt || (videoB64 ? 'mp4' : 'png')).replace(/^\./, '')
  const mime =
    ext === 'webm' ? 'video/webm' : ext === 'mp4' ? 'video/mp4' : 'image/png'
  const filename = input.filename || `one-shot.${ext}`
  return publishOneShotMediaToDiscord({
    token: creds.token,
    guildId: creds.guildId,
    categoryId: creds.categoryId,
    caption,
    slides: [{ filename, data: media, contentType: mime }],
  })
}

export { getOneShotThemePoolStatus }

export type SaveOneShotPost = {
  postIndex: number
  text: string
  meta: Record<string, unknown>
  videoBase64?: string
  videoExt?: string
  pngBase64?: string
}

function batchDirStamp(): string {
  const stamp = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `Batch_${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())}_${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}`
}

export function defaultOneShotOutputRoot(): string {
  return path.join(CC_ROOT, 'output', 'one-shot')
}

export function saveOneShotBatchToDisk(
  posts: SaveOneShotPost[],
  outputRoot?: string,
  existingBatchDir?: string,
): { ok: true; batchDir: string } | { ok: false; message: string } {
  try {
    const root = path.resolve(outputRoot?.trim() || defaultOneShotOutputRoot())
    const allowed = path.resolve(defaultOneShotOutputRoot())
    if (root !== allowed && !root.startsWith(allowed + path.sep)) {
      return { ok: false, message: 'Output path must be under output/one-shot' }
    }
    fs.mkdirSync(root, { recursive: true })
    const batchDir =
      existingBatchDir && fs.existsSync(existingBatchDir)
        ? existingBatchDir
        : path.join(root, batchDirStamp())
    fs.mkdirSync(batchDir, { recursive: true })
    for (const post of posts) {
      const name = `post_${String(post.postIndex).padStart(2, '0')}`
      const postDir = path.join(batchDir, name)
      fs.mkdirSync(postDir, { recursive: true })
      const videoB64 = post.videoBase64?.trim()
      const pngB64 = post.pngBase64?.trim()
      const ext = (post.videoExt || (videoB64 ? 'mp4' : 'png')).replace(/^\./, '')
      const media = Buffer.from(videoB64 || pngB64 || '', 'base64')
      if (!media.length) continue
      fs.writeFileSync(path.join(postDir, `${name}.${ext}`), media)
      fs.writeFileSync(path.join(postDir, 'text.txt'), post.text.trim() + '\n')
      const caption = String(post.meta?.caption || '').trim()
      if (caption) fs.writeFileSync(path.join(postDir, 'caption.txt'), caption + '\n')
      fs.writeFileSync(path.join(postDir, 'meta.json'), JSON.stringify(post.meta, null, 2) + '\n')
    }
    return { ok: true, batchDir }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}
