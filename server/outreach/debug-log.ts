import fs from 'node:fs'
import path from 'node:path'
import { TOOLSAI_ROOT } from '../cc-services.js'

// #region agent log
const _DBG_LOG = path.join(TOOLSAI_ROOT, 'control-center', 'debug-8015a5.log')
export function dbgLog(hypothesisId: string, location: string, message: string, data: Record<string, unknown> = {}) {
  const payload = {
    sessionId: '8015a5',
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  }
  try {
    fs.appendFileSync(_DBG_LOG, `${JSON.stringify(payload)}\n`, 'utf8')
  } catch {
    /* ignore */
  }
  fetch('http://127.0.0.1:7655/ingest/5edfce39-04a2-4060-960b-2becbc5055fd', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '8015a5' },
    body: JSON.stringify(payload),
  }).catch(() => {})
}
// #endregion
