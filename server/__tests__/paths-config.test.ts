import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LAUNCH_CATALOG, applyToolPathOverrides, defaultToolPath } from '../launch/catalog.js'
import { DIR_DEFAULTS, dirPath, setDirPath, setToolPathOverride } from '../paths-config.js'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-paths-'))

afterEach(() => {
  setToolPathOverride('video_metadata_stripper', null)
  setDirPath('kaleduBackgrounds', null)
  applyToolPathOverrides()
})

describe('folder overrides', () => {
  it('moves a tool folder and re-points paths inside it', () => {
    const tool = LAUNCH_CATALOG.find((t) => t.id === 'video_metadata_stripper')!
    const original = defaultToolPath(tool.id)!
    setToolPathOverride(tool.id, tmp)
    applyToolPathOverrides()
    expect(tool.path).toBe(path.normalize(tmp))
    expect(tool.outputPath?.startsWith(path.normalize(tmp))).toBe(true)
    setToolPathOverride(tool.id, null)
    applyToolPathOverrides()
    expect(tool.path).toBe(original)
  })

  it('rejects folders that do not exist', () => {
    expect(() => setToolPathOverride('video_metadata_stripper', path.join(tmp, 'missing'))).toThrow(/not found/)
    expect(() => setDirPath('kaleduBackgrounds', 'relative\\path')).toThrow(/full path/)
  })

  it('saves data folders and falls back to defaults', () => {
    expect(dirPath('kaleduBackgrounds')).toBe(DIR_DEFAULTS.kaleduBackgrounds.default)
    setDirPath('kaleduBackgrounds', tmp)
    expect(dirPath('kaleduBackgrounds')).toBe(path.normalize(tmp))
  })
})
