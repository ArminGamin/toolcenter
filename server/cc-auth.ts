/**
 * Local API auth token — stops casual localhost calls from other tabs/scripts.
 * Token is generated once, stored in the encrypted vault, injected into index.html
 * at Vite middleware attach time (window.__CC_AUTH__).
 */

import crypto from 'node:crypto'
import { loadSystemVault, saveSystemVault } from './cc-services.js'

const HEADER = 'x-cc-token'
let cachedToken: string | null = null

/** Paths that return secrets / env — GET requires token (not exempt like markets). */
const SENSITIVE_GET_PREFIXES = [
  '/api/business-profiles',
  '/api/vault',
  '/api/settings',
  '/api/profiles',
  '/api/outreach',
]

export function getOrCreateApiToken(): string {
  if (cachedToken) return cachedToken
  const vault = loadSystemVault()
  let token = vault.CC_API_TOKEN?.trim()
  if (!token || token.length < 24) {
    token = crypto.randomBytes(32).toString('hex')
    saveSystemVault({ CC_API_TOKEN: token })
  }
  cachedToken = token
  return token
}

function pathNeedsAuthOnGet(urlPath: string): boolean {
  const pathOnly = urlPath.split('?')[0] || ''
  return SENSITIVE_GET_PREFIXES.some((p) => pathOnly === p || pathOnly.startsWith(`${p}/`))
}

/**
 * Returns true if request may proceed.
 * - Markets / health / desk GETs: open (SSE + read convenience)
 * - Vault / settings / profiles GET: require token (secrets)
 * - All mutating methods: require token
 */
export function requireApiToken(
  req: { method?: string; url?: string; headers: { [k: string]: unknown } },
  res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (s: string) => void },
): boolean {
  const method = (req.method || 'GET').toUpperCase()
  if (method === 'OPTIONS' || method === 'HEAD') return true
  const url = req.url || ''
  const isGet = method === 'GET'
  if (isGet && !pathNeedsAuthOnGet(url)) return true

  const expected = getOrCreateApiToken()
  const got = String(req.headers[HEADER] || req.headers['X-CC-Token'] || '').trim()
  if (got && got === expected) return true
  res.statusCode = 401
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ ok: false, message: 'Missing or invalid X-CC-Token' }))
  return false
}

export function authTokenInlineJs(): string {
  const token = getOrCreateApiToken()
  const safe = token.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  return `window.__CC_AUTH__='${safe}'`
}

export function authInjectScript(): string {
  return `<script>${authTokenInlineJs()}</script>`
}

export { HEADER as CC_AUTH_HEADER, SENSITIVE_GET_PREFIXES }
