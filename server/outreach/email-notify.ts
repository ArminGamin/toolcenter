import { appendLog } from './log.js'
import { NEWSLETTER } from './paths.js'
import { fireNotify, loadVault } from '../cc-services.js'
import fs from 'node:fs'
import path from 'node:path'

/** Set DISCORD_NEWSLETTER_SEND_WEBHOOK_URL in the vault or newsletter .env; never hard-code it. */
const DEFAULT_SEND_DISCORD_WEBHOOK = ''

export function resolveSendDiscordWebhook(): string {
  const vault = loadVault()
  const fromVault = String(vault.DISCORD_NEWSLETTER_SEND_WEBHOOK_URL || '').trim()
  if (fromVault.startsWith('https://discord.com/api/webhooks/')) return fromVault
  try {
    const envPath = path.join(NEWSLETTER, '.env')
    if (fs.existsSync(envPath)) {
      const m = fs.readFileSync(envPath, 'utf8').match(/^DISCORD_NEWSLETTER_SEND_WEBHOOK_URL\s*=\s*(.+)$/m)
      if (m?.[1]) {
        const u = m[1].trim().replace(/^["']|["']$/g, '')
        if (u.startsWith('https://discord.com/api/webhooks/')) return u
      }
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_SEND_DISCORD_WEBHOOK
}

/** Same Discord payload as newsletter-sender/discord_notify.py */
export async function notifyOutreachEmailSent(
  toEmail: string,
  subject: string,
  kind: string = 'promo',
  opts?: { profile?: string; quotaSent?: number; quotaCap?: number },
): Promise<boolean> {
  const webhookUrl = resolveSendDiscordWebhook()
  if (!webhookUrl.startsWith('https://discord.com/api/webhooks/')) return false
  const quotaLine =
    typeof opts?.quotaSent === 'number' && typeof opts?.quotaCap === 'number'
      ? `**Quota:** ${opts.quotaSent}/${opts.quotaCap}\n`
      : ''
  const content =
    `📧 **Newsletter sent** (${kind})\n` +
    quotaLine +
    `**To:** \`${toEmail}\`\n` +
    `**Subject:** ${subject}`
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'VasarosKampelis-NewsletterSender/1.0',
      },
      body: JSON.stringify({ content }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      appendLog(
        'error',
        'send',
        `Discord notify failed (${res.status})${body ? `: ${body.slice(0, 120)}` : ''}`,
      )
      return false
    }
    return true
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    appendLog('error', 'send', `Discord notify error: ${msg.slice(0, 160)}`)
    return false
  }
}

export function notifyOutreachSendDiscord(
  email: string,
  subject: string,
  kind: string = 'promo',
  opts?: { profile?: string; quotaSent?: number; quotaCap?: number },
) {
  const quotaBit =
    typeof opts?.quotaSent === 'number' && typeof opts?.quotaCap === 'number'
      ? ` · ${opts.quotaSent}/${opts.quotaCap}`
      : ''
  const profileBit = opts?.profile && opts.profile !== '(default)' ? ` · ${opts.profile}` : ''
  // Status webhook — same alerts operators saw before (Control Center channel).
  fireNotify(
    'Outreach · Sent',
    `${email}${profileBit}${quotaBit} · ${subject.slice(0, 80)}`,
    'ok',
    'outreach',
  )
  // Newsletter webhook — matches newsletter-sender GUI per-send pings.
  void notifyOutreachEmailSent(email, subject, kind, opts)
}
