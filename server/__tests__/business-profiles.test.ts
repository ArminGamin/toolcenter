import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CC_AUTH_HEADER, getOrCreateApiToken } from '../cc-auth.js'
import {
  bindCurrentProfile,
  businessProfileDataDir,
  businessProfileFromHeader,
  createBusinessProfile,
  currentBusinessProfile,
  DEFAULT_BUSINESS_PROFILE_ID,
  deleteBusinessProfile,
  ensureBusinessProfiles,
  isValidBusinessProfileId,
  profileDataPath,
  runWithBusinessProfile,
} from '../business-profiles.js'
import { ensureBrowserSessionDir } from '../browser-sessions.js'
import { attachLaunchMiddleware } from '../launch.js'
import { createMiddlewareApp, invokeApp } from './helpers/test-middleware.js'

function createApiApp() {
  const app = createMiddlewareApp()
  attachLaunchMiddleware(app as never)
  return app
}

describe('whole-center business profiles', () => {
  it('creates the migrated primary profile and a blank Christmas workspace', () => {
    const registry = ensureBusinessProfiles()
    const tavo = registry.profiles.find((profile) => profile.id === DEFAULT_BUSINESS_PROFILE_ID)
    const christmas = registry.profiles.find((profile) => profile.id === 'christmas-gifts')
    expect(tavo).toMatchObject({ name: 'Tavo Knyga', migrated: true })
    expect(christmas).toMatchObject({ name: 'Kalėdų Kampelis' })

    const marker = profileDataPath('migration-isolation-marker.txt')
    fs.writeFileSync(marker, 'tavo-only', 'utf8')
    expect(fs.existsSync(path.join(businessProfileDataDir('christmas-gifts'), path.basename(marker)))).toBe(false)
  })

  it('validates identifiers and keeps all resolved paths inside profile data roots', () => {
    expect(isValidBusinessProfileId('safe-workspace-2')).toBe(true)
    expect(isValidBusinessProfileId('../escape')).toBe(false)
    expect(isValidBusinessProfileId('UPPER')).toBe(false)
    const root = businessProfileDataDir(DEFAULT_BUSINESS_PROFILE_ID)
    const resolved = runWithBusinessProfile(DEFAULT_BUSINESS_PROFILE_ID, () =>
      profileDataPath('notes.json'),
    )
    expect(path.relative(root, resolved)).toBe('notes.json')
  })

  it('isolates files and browser sessions between profiles', () => {
    const created = createBusinessProfile(`Isolation ${Date.now()}`)
    try {
      runWithBusinessProfile(DEFAULT_BUSINESS_PROFILE_ID, () => {
        fs.writeFileSync(profileDataPath('vault-marker.txt'), 'primary', 'utf8')
        const session = ensureBrowserSessionDir('facebook')
        fs.writeFileSync(path.join(session, 'cookie-marker'), 'primary', 'utf8')
      })
      runWithBusinessProfile(created.id, () => {
        expect(fs.existsSync(profileDataPath('vault-marker.txt'))).toBe(false)
        expect(fs.existsSync(path.join(ensureBrowserSessionDir('facebook'), 'cookie-marker'))).toBe(false)
      })
    } finally {
      deleteBusinessProfile(created.id)
    }
  })

  it('pins deferred callbacks to the profile where they were created', () => {
    const created = createBusinessProfile(`Pinned ${Date.now()}`)
    try {
      const callback = runWithBusinessProfile(created.id, () =>
        bindCurrentProfile(() => currentBusinessProfile().id),
      )
      expect(currentBusinessProfile().id).toBe(DEFAULT_BUSINESS_PROFILE_ID)
      expect(callback()).toBe(created.id)
    } finally {
      deleteBusinessProfile(created.id)
    }
  })

  it('protects the primary profile and rejects unknown profiles', () => {
    expect(() => deleteBusinessProfile(DEFAULT_BUSINESS_PROFILE_ID)).toThrow(/protected primary/i)
    expect(() => businessProfileFromHeader('../escape')).toThrow(/unknown business profile/i)
    expect(() => businessProfileFromHeader('does-not-exist')).toThrow(/unknown business profile/i)
  })

  it('returns 400 for an unknown API profile header', async () => {
    const response = await invokeApp(createApiApp(), {
      method: 'GET',
      url: '/api/health',
      headers: {
        [CC_AUTH_HEADER]: getOrCreateApiToken(),
        'x-cc-profile': 'does-not-exist',
      },
    })
    expect(response.status).toBe(400)
    expect((response.json as { ok?: boolean; message?: string }).ok).toBe(false)
    expect((response.json as { message?: string }).message).toMatch(/unknown business profile/i)
  }, 20_000)
})
