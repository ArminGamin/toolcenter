import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { profileDataPath } from '../business-profiles.js'
import { getFriendDmLog } from '../group-poster-dms.js'
import { getGroupPosterLog } from '../group-poster.js'

vi.mock('../cc-services.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../cc-services.js')>(),
  loadVault: () => ({ GROUP_POSTER_SECRETS: JSON.stringify({ v: 1, loginPassword: 'test-only' }) }),
}))

const gpDir = profileDataPath('group-poster')
const dmDir = path.join(gpDir, 'friend-dms')
const outreachDir = profileDataPath('outreach')
const entry = (message: string) => ({ at: '2026-09-16T12:00:00Z', kind: 'info', stage: 'find', message })

beforeEach(() => {
  vi.resetModules()
  for (const dir of [gpDir, dmDir, outreachDir]) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(gpDir, 'settings.json'), JSON.stringify({ loginEmail: 'test@example.com', autoLogin: false }))
})

describe('Facebook log readers', () => {
  it.each([
    ['Group Poster', gpDir, getGroupPosterLog],
    ['Friend DMs', dmDir, getFriendDmLog],
  ] as const)('%s keeps newest-first order, limits, and plain-text events', (_, dir, readLog) => {
    const records = Array.from({ length: 600 }, (_, i) => JSON.stringify(entry(`event ${i}`)))
    fs.writeFileSync(path.join(dir, 'log.jsonl'), records.join('\r\n') + '\r\nplain progress\r\n')
    const log = readLog(80)
    expect(log).toHaveLength(80)
    expect(log[0]).toMatchObject({ kind: 'info', message: 'plain progress' })
    expect(log[1]).toEqual(entry('event 599'))
    expect(log[79]).toEqual(entry('event 521'))
    expect(readLog(1)).toHaveLength(20)
    expect(readLog(1000)).toHaveLength(500)
  })
})

describe('Outreach log loading', () => {
  it('retains valid events around malformed and incomplete records', async () => {
    const first = entry('Searching')
    const last = entry('Ready')
    fs.writeFileSync(path.join(outreachDir, 'log.jsonl'), [
      JSON.stringify(first), '{broken}', '', JSON.stringify(last), '{"at":',
    ].join('\n'))
    const { loadLog } = await import('../outreach/log.js')
    expect(loadLog()).toEqual([first, last])
  })

  it('loads only the configured recent history in chronological order', async () => {
    const records = Array.from({ length: 900 }, (_, i) => entry(`event ${i}`))
    fs.writeFileSync(path.join(outreachDir, 'log.jsonl'), records.map((row) => JSON.stringify(row)).join('\n'))
    const { loadLog } = await import('../outreach/log.js')
    expect(loadLog()).toEqual(records.slice(-800))
  })
})
