import { planNextPostNumber, saveCategoryNextPost } from './ugc-discord-settings.js'
import { publishUgcViaPostMakerPython } from './discord-python-publisher.js'

const DISCORD_API = 'https://discord.com/api/v10'
const MAX_MESSAGE_LEN = 2000
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024
export const ONE_SHOT_MAX_UPLOAD_BYTES = Math.floor(9.5 * 1024 * 1024)
/** UGC post channels: slides-N (older ones were post-NN); both count when numbering. */
const POST_NAME_RE = /^(?:slides|post)-(\d+)(?:-.+)?$/i
const DISCORD_FETCH_TIMEOUT_MS = 120_000
const DISCORD_UPLOAD_TIMEOUT_MS = 300_000
const DISCORD_FETCH_RETRIES = 2
const DISCORD_UPLOAD_RETRIES = 3
/** Fewer slides per message avoids undici timeouts on large 1080×1920 PNG batches (REST fallback only). */
const UPLOAD_BATCH_SIZE = 10

export type DiscordPublishSlide = {
  filename: string
  data: Buffer
  contentType?: string
}

export type DiscordPublishCredentials = {
  token: string
  guildId: string
  categoryId: string
}

export type DiscordPublishInput = {
  token: string
  guildId: string
  categoryId?: string
  caption: string
  slides: DiscordPublishSlide[]
}

export type DiscordPublishResult = {
  ok: boolean
  channel?: string
  channelId?: string
  error?: string
}

export type DiscordMultipartPart =
  | { name: string; value: string }
  | { name: string; filename: string; contentType: string; data: Buffer }

/** Manual multipart body — Node FormData+Blob is unreliable for Discord file uploads. */
export function buildDiscordMultipartBody(parts: DiscordMultipartPart[]): {
  body: Buffer
  contentType: string
} {
  const boundary = `----cc-discord-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const chunks: Buffer[] = []

  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`))
    if ('filename' in part) {
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\n` +
            `Content-Type: ${part.contentType}\r\n\r\n`,
        ),
      )
      chunks.push(part.data)
    } else {
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="${part.name}"\r\n\r\n`))
      chunks.push(Buffer.from(part.value, 'utf8'))
    }
    chunks.push(Buffer.from('\r\n'))
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`))

  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  }
}

function categoryKey(guildId: string, categoryId?: string) {
  return categoryId ? `${guildId}:${categoryId}` : `${guildId}:none`
}

function planPostNumber(
  taken: Set<number>,
  categoryKeyStr: string,
  guildId: string,
  categoryId: string,
): number {
  return planNextPostNumber(taken, categoryKeyStr, guildId, categoryId)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryableDiscordNetwork(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|socket|aborted|network/i.test(
    msg,
  )
}

function formatDiscordNetworkError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  const cause = err instanceof Error ? err.cause : undefined
  const causeMsg = cause instanceof Error ? cause.message : cause ? String(cause) : ''
  const causeCode =
    cause && typeof cause === 'object' && 'code' in cause
      ? String((cause as { code?: unknown }).code)
      : ''
  if (/fetch failed/i.test(msg)) {
    if (/headers timeout|UND_ERR_HEADERS_TIMEOUT/i.test(`${causeMsg} ${causeCode}`)) {
      return 'Discord upload timed out (large PNG batch). Retry, or disable “Post to Discord” and export locally first.'
    }
    if (/ECONNRESET|ETIMEDOUT|ENOTFOUND|ECONNREFUSED/i.test(`${causeMsg} ${causeCode}`)) {
      return `Discord connection failed (${causeCode || causeMsg || 'network'}). Check internet/VPN/firewall.`
    }
    return 'Discord API unreachable (network/DNS/firewall). Check internet and that discord.com is not blocked.'
  }
  return msg.slice(0, 240) || 'Discord request failed'
}

async function createPostChannel(
  token: string,
  guildId: string,
  baseName: string,
  categoryId?: string,
): Promise<{ id: string; name: string }> {
  const names = [baseName, `${baseName}-${Date.now() % 100000}`]
  let lastError = ''

  for (const name of names) {
    const body: Record<string, unknown> = { name, type: 0 }
    if (categoryId) body.parent_id = categoryId
    const res = await discordFetch(token, `/guilds/${guildId}/channels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      return (await res.json()) as { id: string; name: string }
    }
    const text = await res.text().catch(() => '')
    lastError = text.trim().slice(0, 240) || `Discord create channel error (${res.status})`
    if (res.status === 403) {
      throw new Error(
        'Bot lacks permission to create channels. Re-invite with Manage Channels, Send Messages, and Attach Files.',
      )
    }
    if (res.status === 400 && name === names[0]) continue
    break
  }

  throw new Error(lastError || `Could not create Discord channel '${baseName}'`)
}

async function discordFetch(
  token: string,
  path: string,
  init?: RequestInit,
  attempt = 0,
  timeoutMs = DISCORD_FETCH_TIMEOUT_MS,
): Promise<Response> {
  try {
    const headers = new Headers(init?.headers || {})
    headers.set('Authorization', `Bot ${token}`)
    return await fetch(`${DISCORD_API}${path}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    const maxRetries =
      timeoutMs >= DISCORD_UPLOAD_TIMEOUT_MS ? DISCORD_UPLOAD_RETRIES : DISCORD_FETCH_RETRIES
    if (attempt < maxRetries && isRetryableDiscordNetwork(err)) {
      await sleep(1200 * (attempt + 1))
      return discordFetch(token, path, init, attempt + 1, timeoutMs)
    }
    throw new Error(formatDiscordNetworkError(err))
  }
}

async function fetchTakenPostNumbers(
  token: string,
  guildId: string,
  categoryId?: string,
): Promise<Set<number>> {
  const res = await discordFetch(token, `/guilds/${guildId}/channels`)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text.slice(0, 200) || `Discord channels error (${res.status})`)
  }
  const channels = (await res.json()) as Array<{ id: string; name: string; type: number; parent_id?: string }>
  const taken = new Set<number>()
  for (const ch of channels) {
    if (ch.type !== 0) continue
    if (categoryId && ch.parent_id !== categoryId) continue
    const match = POST_NAME_RE.exec(ch.name)
    if (match) taken.add(Number(match[1]))
  }
  return taken
}

function assertUploadSizes(slides: DiscordPublishSlide[], maxBytes = MAX_UPLOAD_BYTES) {
  const oversized = slides.filter((s) => s.data.byteLength > maxBytes)
  if (oversized.length) {
    const limitMb = (maxBytes / (1024 * 1024)).toFixed(1)
    const names = oversized
      .slice(0, 3)
      .map((s) => s.filename)
      .join(', ')
    throw new Error(`File(s) exceed Discord ${limitMb}MB limit: ${names}`)
  }
}

async function publishSlideshowToDiscordRest(
  input: DiscordPublishInput,
  maxUploadBytes = MAX_UPLOAD_BYTES,
): Promise<DiscordPublishResult> {
  const { token, guildId, categoryId, caption, slides } = input
  if (!token) {
    return { ok: false, error: 'Discord bot token missing. Add DISCORD_BOT_TOKEN in Vault.' }
  }
  if (!guildId) {
    return { ok: false, error: 'Guild ID is required.' }
  }
  if (!slides.length) {
    return { ok: false, error: 'No slides to publish.' }
  }

  const resolvedCategory = (categoryId || '').trim()
  if (!resolvedCategory) {
    return { ok: false, error: 'Discord category ID is required.' }
  }

  let createdChannel: { id: string; name: string } | null = null
  try {
    const taken = await fetchTakenPostNumbers(token, guildId, categoryId || undefined)
    const catKey = categoryKey(guildId, categoryId || undefined)
    const postNum = planPostNumber(taken, catKey, guildId, categoryId || '')
    const channelName = `slides-${postNum}`
    createdChannel = await createPostChannel(
      token,
      guildId,
      channelName,
      categoryId || undefined,
    )
    await sendCaptionAndSlides(token, createdChannel.id, caption, slides, maxUploadBytes)
    saveCategoryNextPost(catKey, postNum + 1, guildId, categoryId || '')
    return { ok: true, channel: createdChannel.name, channelId: createdChannel.id }
  } catch (err) {
    if (createdChannel) {
      try {
        await deletePostChannel(token, createdChannel.id)
      } catch {
        // best-effort cleanup; original publish error is returned below
      }
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function sendCaptionAndSlides(
  token: string,
  channelId: string,
  caption: string,
  slides: DiscordPublishSlide[],
  maxUploadBytes = MAX_UPLOAD_BYTES,
) {
  assertUploadSizes(slides, maxUploadBytes)
  const chunks: string[] = []
  let text = caption.trim()
  while (text) {
    chunks.push(text.slice(0, MAX_MESSAGE_LEN))
    text = text.slice(MAX_MESSAGE_LEN)
  }

  let remaining = [...slides]
  const firstCaption = chunks[0] || undefined
  const firstBatch = remaining.slice(0, UPLOAD_BATCH_SIZE)
  remaining = remaining.slice(UPLOAD_BATCH_SIZE)

  await sendMultipartMessage(token, channelId, firstCaption, firstBatch)
  for (const chunk of chunks.slice(1)) {
    await sendMultipartMessage(token, channelId, chunk, [])
  }
  while (remaining.length) {
    const batch = remaining.slice(0, UPLOAD_BATCH_SIZE)
    remaining = remaining.slice(UPLOAD_BATCH_SIZE)
    await sendMultipartMessage(token, channelId, undefined, batch)
  }
}

async function deletePostChannel(token: string, channelId: string): Promise<void> {
  await discordFetch(token, `/channels/${channelId}`, { method: 'DELETE' })
}

async function sendMultipartMessage(
  token: string,
  channelId: string,
  content: string | undefined,
  slides: DiscordPublishSlide[],
) {
  const parts: DiscordMultipartPart[] = []
  const payload: { content?: string } = {}
  if (content) payload.content = content
  parts.push({ name: 'payload_json', value: JSON.stringify(payload) })
  slides.forEach((slide, i) => {
    parts.push({
      name: `files[${i}]`,
      filename: slide.filename,
      contentType: slide.contentType || 'image/png',
      data: slide.data,
    })
  })

  const { body, contentType } = buildDiscordMultipartBody(parts)
  const res = await discordFetch(
    token,
    `/channels/${channelId}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body,
    },
    0,
    DISCORD_UPLOAD_TIMEOUT_MS,
  )
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text.slice(0, 240) || `Discord message error (${res.status})`)
  }
}

export async function publishUgcSlideshowToDiscord(
  input: DiscordPublishInput,
): Promise<DiscordPublishResult> {
  const { token, guildId, categoryId, caption, slides } = input
  if (!token) {
    return { ok: false, error: 'Discord bot token missing. Add DISCORD_BOT_TOKEN in Vault.' }
  }
  if (!guildId) {
    return { ok: false, error: 'Guild ID is required.' }
  }
  if (!slides.length) {
    return { ok: false, error: 'No slides to publish.' }
  }

  const resolvedCategory = (categoryId || '').trim()
  if (!resolvedCategory) {
    return { ok: false, error: 'Discord category ID is required.' }
  }

  // PostMaker path: discord.py with UGC guild/category passed at runtime (PostMaker json untouched).
  const pyResult = publishUgcViaPostMakerPython(slides, caption, 1, {
    token,
    guildId,
    categoryId: resolvedCategory,
  })
  if (pyResult.ok) return pyResult

  const pyErr = pyResult.error || ''
  const useRestFallback =
    /bridge script missing|Discord bridge parse error|spawn|ENOENT|python/i.test(pyErr) &&
    !/Invalid DISCORD|LoginFailure|permission|403|401/i.test(pyErr)

  if (!useRestFallback) {
    return pyResult
  }

  return publishSlideshowToDiscordRest(input)
}

export async function publishOneShotMediaToDiscord(
  input: DiscordPublishInput,
): Promise<DiscordPublishResult> {
  return publishSlideshowToDiscordRest(input, ONE_SHOT_MAX_UPLOAD_BYTES)
}
