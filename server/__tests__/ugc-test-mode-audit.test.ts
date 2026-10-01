import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  deactivateUgcAuditCapture,
  getUgcAuditStatus,
  isUgcAuditActive,
  resetUgcAuditSession,
} from '../ugc-batch-audit.js'

const tmpRoot = path.join(os.tmpdir(), `ugc-test-mode-audit-${Date.now()}`)

beforeEach(() => {
  process.env.UGC_AUDIT_ROOT = path.join(tmpRoot, 'audit')
  process.env.UGC_VISION_ROOT = tmpRoot
  fs.mkdirSync(process.env.UGC_AUDIT_ROOT, { recursive: true })
})

afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
  delete process.env.UGC_AUDIT_ROOT
  delete process.env.UGC_VISION_ROOT
})

describe('UGC test mode audit gating', () => {
  it('is inactive until test batch reset', () => {
    expect(isUgcAuditActive()).toBe(false)
    const status = getUgcAuditStatus()
    expect(status.captureMode).toBe('off')
    expect(status.active).toBe(false)
  })

  it('activates only after resetUgcAuditSession', () => {
    resetUgcAuditSession({ target: 3, runId: 'run-1' })
    expect(isUgcAuditActive()).toBe(true)
    expect(getUgcAuditStatus().captureMode).toBe('test-batch')
    expect(getUgcAuditStatus().remaining).toBe(3)
  })

  it('deactivate turns capture off', () => {
    resetUgcAuditSession({ target: 2 })
    expect(isUgcAuditActive()).toBe(true)
    deactivateUgcAuditCapture()
    expect(isUgcAuditActive()).toBe(false)
    expect(getUgcAuditStatus().captureMode).toBe('off')
  })
})
