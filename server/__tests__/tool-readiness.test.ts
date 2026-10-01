import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { inspectToolReadiness } from '../tool-readiness.js'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('non-destructive tool readiness', () => {
  it('checks paths, entrypoints, runtime, and setting names without launching', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-ready-'))
    dirs.push(dir)
    fs.writeFileSync(path.join(dir, 'worker.py'), 'print("never executed")')
    const result = inspectToolReadiness(
      { id: 'fixture', path: dir, launch: 'python worker.py', settingsKeys: ['TOKEN_NAME'] },
      { runtimeAvailable: true, env: { TOKEN_NAME: 'present' } },
    )
    expect(result).toMatchObject({ ready: true, entryExists: true, runtimeAvailable: true })
  })

  it('reports only missing setting names and never their values', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-ready-'))
    dirs.push(dir)
    const result = inspectToolReadiness(
      { id: 'fixture', path: dir, launch: '', settingsKeys: ['SECRET_TOKEN'] },
      { runtimeAvailable: true, env: {} },
    )
    expect(result.code).toBe('settings_missing')
    expect(result.missingSettingNames).toEqual(['SECRET_TOKEN'])
    expect(JSON.stringify(result)).not.toContain('secret-value')
  })

  it('checks every platform launcher in a combined downloader', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-ready-'))
    dirs.push(dir)
    fs.writeFileSync(path.join(dir, 'medal.bat'), '@echo off')
    const tool = {
      id: 'downloader', path: dir, launch: 'medal.bat',
      launchOptions: [
        { id: 'medal', label: 'Medal', launch: 'medal.bat' },
        { id: 'youtube', label: 'YouTube', launch: 'youtube.bat' },
      ],
    }
    expect(inspectToolReadiness(tool, { runtimeAvailable: true, env: {} }).code).toBe('entry_missing')
    fs.writeFileSync(path.join(dir, 'youtube.bat'), '@echo off')
    expect(inspectToolReadiness(tool, { runtimeAvailable: true, env: {} }).ready).toBe(true)
  })
})
