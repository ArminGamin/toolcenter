import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { TOOLSAI_ROOT } from './cc-services.js'
import type {
  DiscordPublishCredentials,
  DiscordPublishResult,
  DiscordPublishSlide,
} from './discord-publisher.js'

const BRIDGE_SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'scripts',
  'cc_discord_publish.py',
)

function resolvePythonExe(): string {
  const candidates = [
    path.join(TOOLSAI_ROOT, '.venv', 'Scripts', 'python.exe'),
    path.join(TOOLSAI_ROOT, 'post-maker', '.venv', 'Scripts', 'python.exe'),
    'python',
    'python3',
  ]
  for (const exe of candidates) {
    if (exe === 'python' || exe === 'python3' || fs.existsSync(exe)) return exe
  }
  return 'python'
}

function slideFilename(slide: DiscordPublishSlide, index: number): string {
  const name = slide.filename.trim()
  if (name) {
    if (/^slide_\d+\.[a-z0-9]+$/i.test(name)) return name
    const ext = path.extname(name) || '.png'
    return `slide_${String(index + 1).padStart(2, '0')}${ext}`
  }
  return `slide_${String(index + 1).padStart(2, '0')}.png`
}

/** Publish via post-maker/discord_publisher.py — UGC category override, PostMaker settings unchanged. */
export function publishUgcViaPostMakerPython(
  slides: DiscordPublishSlide[],
  caption: string,
  postIndex = 1,
  creds?: DiscordPublishCredentials,
): DiscordPublishResult {
  if (!slides.length) return { ok: false, error: 'No slides to publish.' }
  if (!fs.existsSync(BRIDGE_SCRIPT)) {
    return { ok: false, error: `Discord bridge script missing: ${BRIDGE_SCRIPT}` }
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-discord-'))
  try {
    fs.writeFileSync(path.join(tmpDir, 'caption.txt'), caption.trim(), 'utf8')
    slides.forEach((slide, i) => {
      fs.writeFileSync(path.join(tmpDir, slideFilename(slide, i)), slide.data)
    })

    const args = [
      BRIDGE_SCRIPT,
      tmpDir,
      String(postIndex),
      creds?.guildId?.trim() || '',
      creds?.categoryId?.trim() || '',
      creds?.token?.trim() || '',
    ]

    const py = resolvePythonExe()
    const proc = spawnSync(py, args, {
      cwd: path.join(TOOLSAI_ROOT, 'post-maker'),
      encoding: 'utf8',
      timeout: 600_000,
      windowsHide: true,
      // UGC posts are named slides-N (PostMaker on its own keeps post-NN).
      env: { ...process.env, PYTHONUTF8: '1', DISCORD_CHANNEL_PREFIX: 'slides' },
    })

    const stdout = (proc.stdout || '').trim()
    const stderr = (proc.stderr || '').trim()

    if (proc.error) {
      return { ok: false, error: `Discord bridge: ${proc.error.message}` }
    }

    let results: Array<Record<string, unknown>> = []
    try {
      results = JSON.parse(stdout || '[]') as Array<Record<string, unknown>>
    } catch {
      const detail = stderr || stdout || `exit ${proc.status ?? '?'}`
      return { ok: false, error: `Discord bridge parse error: ${detail.slice(0, 240)}` }
    }

    const first = results[0]
    if (first?.ok) {
      return {
        ok: true,
        channel: String(first.channel || ''),
        channelId: String(first.channel_id || first.channelId || ''),
      }
    }

    return {
      ok: false,
      error: String(first?.error || stderr || 'Discord publish failed'),
    }
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      /* best-effort cleanup */
    }
  }
}
