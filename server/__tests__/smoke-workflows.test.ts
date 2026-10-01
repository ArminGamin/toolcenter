import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CC_AUTH_HEADER, getOrCreateApiToken } from '../cc-auth.js'
import * as ccServices from '../cc-services.js'
import { attachLaunchMiddleware } from '../launch.js'
import { getNotes, saveNotes } from '../notes.js'
import { archiveManualError, clearRunErrors, listRunErrors } from '../run-errors.js'
import { clearOutreachRun } from '../outreach.js'
import { createMiddlewareApp, invokeApp } from './helpers/test-middleware.js'
import { profileDataPath } from '../business-profiles.js'

const NOTES_FILE = profileDataPath('notes.json')
let notesBackup: string | null = null

function authHeaders() {
  return { [CC_AUTH_HEADER]: getOrCreateApiToken() }
}

function createApiApp() {
  const app = createMiddlewareApp()
  attachLaunchMiddleware(app as never)
  return app
}

describe('smoke: critical API workflows', () => {
  beforeEach(() => {
    if (fs.existsSync(NOTES_FILE)) {
      notesBackup = fs.readFileSync(NOTES_FILE, 'utf8')
    } else {
      notesBackup = null
    }
    clearRunErrors()
  })

  afterEach(() => {
    if (notesBackup != null) {
      fs.writeFileSync(NOTES_FILE, notesBackup, 'utf8')
    } else if (fs.existsSync(NOTES_FILE)) {
      fs.unlinkSync(NOTES_FILE)
    }
    clearRunErrors()
    vi.restoreAllMocks()
  })

  it('creates and persists notes content via /api/notes', async () => {
    const app = createApiApp()
    const note = {
      id: 'smoke-note-1',
      title: 'Smoke test note',
      body: 'Created by smoke test',
      bodyRight: '',
      folderId: null,
      tags: ['smoke'],
      pinned: false,
      archived: false,
      color: 'brass',
      createdAt: '2026-08-02T12:00:00.000Z',
      updatedAt: '2026-08-02T12:00:00.000Z',
    }

    const save = await invokeApp(app, {
      method: 'POST',
      url: '/api/notes',
      headers: authHeaders(),
      body: { notes: [note], folders: [] },
    })
    expect(save.status).toBe(200)
    expect((save.json as { ok?: boolean }).ok).toBe(true)

    const read = await invokeApp(app, {
      method: 'GET',
      url: '/api/notes',
      headers: authHeaders(),
    })
    expect(read.status).toBe(200)
    const data = (read.json as { data?: { notes?: Array<{ id: string; title: string }> } }).data
    expect(data?.notes?.some((n) => n.id === 'smoke-note-1' && n.title === 'Smoke test note')).toBe(
      true,
    )
    expect(getNotes().notes.some((n) => n.id === 'smoke-note-1')).toBe(true)
  }, 20_000)

  it('saves vault settings via /api/vault', async () => {
    const app = createApiApp()
    const token = getOrCreateApiToken()
    const marker = `http://smoke-test-${Date.now()}.local`

    const save = await invokeApp(app, {
      method: 'POST',
      url: '/api/vault',
      headers: authHeaders(),
      body: { values: { OLLAMA_URL: marker } },
    })
    expect(save.status).toBe(200)
    expect((save.json as { ok?: boolean }).ok).toBe(true)

    const read = await invokeApp(app, {
      method: 'GET',
      url: '/api/vault',
      headers: { [CC_AUTH_HEADER]: token },
    })
    expect(read.status).toBe(200)
    const values = (read.json as { values?: Record<string, string> }).values
    expect(values?.OLLAMA_URL).toBe(marker)
    expect(values?.CC_API_TOKEN).toBeUndefined()
  }, 20_000)

  it('rejects launch for unknown tools without spawning', async () => {
    const app = createApiApp()
    const res = await invokeApp(app, {
      method: 'POST',
      url: '/api/launch',
      headers: authHeaders(),
      body: { id: 'definitely_not_a_real_tool_id' },
    })
    expect(res.status).toBe(400)
    expect((res.json as { ok?: boolean; message?: string }).ok).toBe(false)
    expect((res.json as { message?: string }).message).toMatch(/unknown tool/i)
  })

  it('archives, lists, deletes run errors and clears outreach runs', async () => {
    const app = createApiApp()
    const archived = archiveManualError({
      toolId: 'smoke-tool',
      summary: 'Smoke test failure',
      lines: ['line one', 'line two'],
    })
    expect(archived?.id).toBeTruthy()

    const list = await invokeApp(app, {
      method: 'GET',
      url: '/api/run-errors',
      headers: authHeaders(),
    })
    expect(list.status).toBe(200)
    const errors = (list.json as { errors?: Array<{ id: string }> }).errors || []
    expect(errors.some((e) => e.id === archived!.id)).toBe(true)
    expect(listRunErrors().some((e) => e.id === archived!.id)).toBe(true)

    const detail = await invokeApp(app, {
      method: 'GET',
      url: `/api/run-errors?id=${encodeURIComponent(archived!.id)}`,
      headers: authHeaders(),
    })
    expect(detail.status).toBe(200)
    expect((detail.json as { ok?: boolean; body?: string }).body).toContain('Smoke test failure')

    const deleted = await invokeApp(app, {
      method: 'POST',
      url: '/api/run-errors',
      headers: authHeaders(),
      body: { action: 'delete', id: archived!.id },
    })
    expect(deleted.status).toBe(200)
    expect((deleted.json as { ok?: boolean }).ok).toBe(true)
    expect(listRunErrors().some((e) => e.id === archived!.id)).toBe(false)

    const cleared = clearOutreachRun()
    expect(cleared.ok).toBe(true)

    const retryClear = await invokeApp(app, {
      method: 'POST',
      url: '/api/outreach?action=clear-run',
      headers: authHeaders(),
      body: {},
    })
    expect(retryClear.status).toBe(200)
    expect((retryClear.json as { ok?: boolean }).ok).toBe(true)
  })

  it('creates backup via /api/backup', async () => {
    const app = createApiApp()
    const backupSpy = vi.spyOn(ccServices, 'createBackup').mockResolvedValue({
      ok: true,
      message: 'Backup saved (smoke)',
      path: 'C:\\Users\\Public\\Desktop\\toolsai-cc-backup-smoke.zip',
    })

    const res = await invokeApp(app, {
      method: 'POST',
      url: '/api/backup',
      headers: authHeaders(),
      body: {},
    })
    expect(res.status).toBe(200)
    expect((res.json as { ok?: boolean; message?: string }).ok).toBe(true)
    expect((res.json as { message?: string }).message).toMatch(/backup/i)
    expect(backupSpy).toHaveBeenCalledOnce()

    backupSpy.mockRestore()
  })

  it('rejects mutating API calls without auth token', async () => {
    const app = createApiApp()
    const res = await invokeApp(app, {
      method: 'POST',
      url: '/api/notes',
      body: { notes: [], folders: [] },
    })
    expect(res.status).toBe(401)
    expect((res.json as { ok?: boolean }).ok).toBe(false)

    const direct = saveNotes({ notes: [], folders: [] })
    expect(direct.ok).toBe(true)
  })
})
