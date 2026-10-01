import type { IncomingMessage, ServerResponse } from 'node:http'

export function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      try {
        resolve(body ? (JSON.parse(body) as Record<string, unknown>) : {})
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

export function getId(req: IncomingMessage, parsed: Record<string, unknown>): string {
  let id = String(parsed.id || '')
  if (!id && req.url) {
    try {
      id = new URL(req.url, 'http://localhost').searchParams.get('id') || ''
    } catch {
      /* ignore */
    }
  }
  return id
}
