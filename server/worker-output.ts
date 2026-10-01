import type { ChildProcess } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'
import { isRunEvent, type RunEvent } from './run-event.js'

export type WorkerOutputKind = 'info' | 'error'

export function classifyWorkerLine(
  stream: WorkerOutputKind,
  line: string,
): { kind: WorkerOutputKind; message: string; event?: RunEvent } | null {
  const raw = String(line || '').trim()
  if (!raw) return null

  if (raw.startsWith('{')) {
    try {
      const event = JSON.parse(raw) as unknown
      if (isRunEvent(event)) {
        return {
          kind: event.level === 'error' ? 'error' : 'info',
          message: event.message.slice(0, 500),
          event,
        }
      }
    } catch {
      // Fall through to a bounded, classified plain line.
    }
  }

  const pythonLog = raw.match(/^\d{2}:\d{2}:\d{2}\s+\[(INFO|WARNING|ERROR|CRITICAL)\]\s+(.*)$/i)
  if (pythonLog) {
    const level = pythonLog[1].toUpperCase()
    return {
      kind: level === 'ERROR' || level === 'CRITICAL' ? 'error' : 'info',
      message: pythonLog[2].trim().slice(0, 500),
    }
  }

  return {
    kind: stream,
    message: `${stream === 'error' ? '[worker_stderr_unparsed] ' : ''}${raw}`.slice(0, 500),
  }
}

function attachLineStream(
  stream: NodeJS.ReadableStream | null | undefined,
  source: WorkerOutputKind,
  onLine: (kind: WorkerOutputKind, message: string, event?: RunEvent) => void,
) {
  if (!stream) return
  const decoder = new StringDecoder('utf8')
  const maxLineChars = 64 * 1024
  let pending = ''
  let truncated = false
  const emit = () => {
    const parsed = classifyWorkerLine(source, truncated ? `[worker_output_truncated] ${pending}` : pending)
    if (parsed) onLine(parsed.kind, parsed.message, parsed.event)
    pending = ''
    truncated = false
  }
  const consume = (text: string) => {
    const parts = text.split('\n')
    for (let i = 0; i < parts.length; i++) {
      if (!truncated) {
        const remaining = maxLineChars - pending.length
        pending += parts[i].slice(0, remaining)
        truncated = parts[i].length > remaining
      }
      if (i < parts.length - 1) emit()
    }
  }
  stream.on('data', (chunk: Buffer | string) => {
    consume(Buffer.isBuffer(chunk) ? decoder.write(chunk) : String(chunk))
  })
  stream.on('end', () => {
    consume(decoder.end())
    emit()
  })
}

export function attachWorkerOutput(
  child: ChildProcess,
  onLine: (kind: WorkerOutputKind, message: string, event?: RunEvent) => void,
) {
  attachLineStream(child.stdout, 'info', onLine)
  attachLineStream(child.stderr, 'error', onLine)
}
