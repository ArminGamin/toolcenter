import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'

type Next = (err?: unknown) => void
export type TestMiddleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: Next,
) => void | Promise<void>

type StackEntry = { route: string; handle: TestMiddleware }

export function createMiddlewareApp() {
  const stack: StackEntry[] = []
  return {
    use(routeOrHandle: string | TestMiddleware, maybeHandle?: TestMiddleware) {
      if (typeof routeOrHandle === 'function') {
        stack.push({ route: '', handle: routeOrHandle })
      } else {
        stack.push({ route: routeOrHandle, handle: maybeHandle! })
      }
    },
    handle(req: IncomingMessage, res: ServerResponse) {
      return new Promise<void>((resolve, reject) => {
        let i = 0
        let next: Next = () => {}
        const dispatch = () => {
          if (i >= stack.length) {
            if (!res.writableEnded) {
              res.statusCode = 404
              res.end('Not Found')
            }
            resolve()
            return
          }
          const { route, handle } = stack[i++]
          const path = (req.url || '').split('?')[0] || '/'
          if (route && !path.startsWith(route)) {
            dispatch()
            return
          }
          let advanced = false
          next = (err) => {
            if (err) {
              reject(err)
              return
            }
            advanced = true
            if (res.writableEnded) {
              resolve()
              return
            }
            dispatch()
          }
          Promise.resolve(handle(req, res, next))
            .then(() => {
              if (!advanced) resolve()
            })
            .catch(reject)
        }
        dispatch()
      })
    },
  }
}

export type TestResponse = ServerResponse & {
  getBody: () => { status: number; json: unknown; text: string }
}

export function mockRequest(opts: {
  method: string
  url: string
  headers?: Record<string, string>
  body?: unknown
}): IncomingMessage {
  const bodyStr = opts.body !== undefined ? JSON.stringify(opts.body) : ''
  const req = Readable.from([bodyStr]) as IncomingMessage
  req.method = opts.method
  req.url = opts.url
  req.headers = {
    'content-type': 'application/json',
    'content-length': String(Buffer.byteLength(bodyStr)),
    ...opts.headers,
  }
  return req
}

export function mockResponse(): TestResponse {
  let status = 200
  let text = ''
  let ended = false
  const headers: Record<string, string | string[]> = {}
  const res = {
    statusCode: 200,
    get writableEnded() {
      return ended
    },
    setHeader(k: string, v: string) {
      headers[k.toLowerCase()] = v
    },
    getHeader(k: string) {
      return headers[k.toLowerCase()]
    },
    end(chunk?: string | Buffer) {
      ended = true
      text = typeof chunk === 'string' ? chunk : chunk?.toString('utf8') || ''
    },
  } as ServerResponse
  Object.defineProperty(res, 'statusCode', {
    get() {
      return status
    },
    set(v: number) {
      status = v
    },
  })
  return Object.assign(res, {
    getBody() {
      let json: unknown
      try {
        json = JSON.parse(text)
      } catch {
        json = text
      }
      return { status, json, text }
    },
  }) as TestResponse
}

export async function invokeApp(
  app: ReturnType<typeof createMiddlewareApp>,
  opts: {
    method: string
    url: string
    headers?: Record<string, string>
    body?: unknown
  },
) {
  const req = mockRequest(opts)
  const res = mockResponse()
  await app.handle(req, res)
  return res.getBody()
}
