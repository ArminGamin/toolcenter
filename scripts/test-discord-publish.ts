import { resolveDiscordCredentials } from '../server/ugc-discord-settings.js'
import { publishUgcSlideshowToDiscord } from '../server/discord-publisher.js'

const creds = resolveDiscordCredentials()
console.log('token:', creds.token ? `set (${creds.token.length} chars)` : 'MISSING')
console.log('guildId:', creds.guildId || 'MISSING')
console.log('categoryId:', creds.categoryId || '(none)')

if (!creds.token || !creds.guildId) {
  console.log('SKIP: credentials incomplete')
  process.exit(1)
}

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const result = await publishUgcSlideshowToDiscord({
  token: creds.token,
  guildId: creds.guildId,
  categoryId: creds.categoryId || undefined,
  caption: 'CC Discord publish test — safe to delete',
  slides: [{ filename: 'slide_01.png', data: png }],
})

console.log('RESULT:', JSON.stringify(result, null, 2))
process.exit(result.ok ? 0 : 1)
