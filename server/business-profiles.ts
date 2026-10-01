import { AsyncLocalStorage } from 'node:async_hooks'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Stable machine-level root. Business-owned data lives below profiles/<id>/data. */
export const GLOBAL_CC_DATA =
  process.env.CC_DATA_DIR || path.resolve(__dirname, '..', '..', '.control-center-data')

export const BUSINESS_PROFILES_DIR = path.join(GLOBAL_CC_DATA, 'profiles')
const REGISTRY_FILE = path.join(BUSINESS_PROFILES_DIR, 'registry.json')
const MIGRATION_FILE = path.join(BUSINESS_PROFILES_DIR, '.migration-v1.json')
const TRASH_DIR = path.join(BUSINESS_PROFILES_DIR, '.trash')

export const DEFAULT_BUSINESS_PROFILE_ID = 'tavo-knyga'
export const CHRISTMAS_BUSINESS_PROFILE_ID = 'christmas-gifts'

export type BusinessProfile = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  migrated?: boolean
}

type BusinessProfileRegistry = {
  version: 1
  profiles: BusinessProfile[]
}

type ProfileContext = {
  profile: BusinessProfile
  dataDir: string
}

const profileStorage = new AsyncLocalStorage<ProfileContext>()
let registryCache: BusinessProfileRegistry | null = null
let registryCacheMtimeMs = -1

function nowIso() {
  return new Date().toISOString()
}

export function isValidBusinessProfileId(id: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(id)
}

function slugify(name: string): string {
  const slug = name
    .trim()
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return slug || 'profile'
}

function profileRootUnchecked(id: string) {
  return path.join(BUSINESS_PROFILES_DIR, id)
}

function dataDirUnchecked(id: string) {
  return path.join(profileRootUnchecked(id), 'data')
}

function writeRegistry(registry: BusinessProfileRegistry) {
  fs.mkdirSync(BUSINESS_PROFILES_DIR, { recursive: true })
  const temp = `${REGISTRY_FILE}.tmp`
  fs.writeFileSync(temp, JSON.stringify(registry, null, 2), 'utf8')
  fs.renameSync(temp, REGISTRY_FILE)
  registryCache = registry
  registryCacheMtimeMs = fs.statSync(REGISTRY_FILE).mtimeMs
}

function copyLegacyDataIntoTavo(targetDataDir: string) {
  fs.mkdirSync(targetDataDir, { recursive: true })
  if (!fs.existsSync(GLOBAL_CC_DATA)) return
  for (const name of fs.readdirSync(GLOBAL_CC_DATA)) {
    if (name === 'profiles' || name.startsWith('_backup_staging_')) continue
    const source = path.join(GLOBAL_CC_DATA, name)
    const target = path.join(targetDataDir, name)
    if (fs.existsSync(target)) continue
    fs.cpSync(source, target, { recursive: true, errorOnExist: false })
  }
}

export function ensureBusinessProfiles(): BusinessProfileRegistry {
  fs.mkdirSync(BUSINESS_PROFILES_DIR, { recursive: true })
  if (fs.existsSync(REGISTRY_FILE)) {
    try {
      const mtimeMs = fs.statSync(REGISTRY_FILE).mtimeMs
      if (registryCache && registryCacheMtimeMs === mtimeMs) return registryCache
      const parsed = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8')) as BusinessProfileRegistry
      const profiles = Array.isArray(parsed.profiles)
        ? parsed.profiles.filter(
            (profile) =>
              profile &&
              isValidBusinessProfileId(String(profile.id || '')) &&
              String(profile.name || '').trim(),
          )
        : []
      if (profiles.length) {
        let renamed = false
        for (const profile of profiles) {
          fs.mkdirSync(dataDirUnchecked(profile.id), { recursive: true })
          if (profile.id === CHRISTMAS_BUSINESS_PROFILE_ID && profile.name !== 'Kalėdų Kampelis') {
            profile.name = 'Kalėdų Kampelis'
            profile.updatedAt = nowIso()
            renamed = true
          }
        }
        const registry: BusinessProfileRegistry = { version: 1, profiles }
        if (renamed) writeRegistry(registry)
        registryCache = registry
        registryCacheMtimeMs = mtimeMs
        return registry
      }
    } catch {
      // Recreate below; legacy data is copied, never removed.
    }
  }

  const createdAt = nowIso()
  const tavo: BusinessProfile = {
    id: DEFAULT_BUSINESS_PROFILE_ID,
    name: 'Tavo Knyga',
    createdAt,
    updatedAt: createdAt,
    migrated: true,
  }
  const christmas: BusinessProfile = {
    id: CHRISTMAS_BUSINESS_PROFILE_ID,
    name: 'Kalėdų Kampelis',
    createdAt,
    updatedAt: createdAt,
  }

  copyLegacyDataIntoTavo(dataDirUnchecked(tavo.id))
  fs.mkdirSync(dataDirUnchecked(christmas.id), { recursive: true })
  const registry: BusinessProfileRegistry = { version: 1, profiles: [tavo, christmas] }
  writeRegistry(registry)
  fs.writeFileSync(
    MIGRATION_FILE,
    JSON.stringify(
      {
        version: 1,
        migratedAt: createdAt,
        source: GLOBAL_CC_DATA,
        destination: dataDirUnchecked(tavo.id),
        mode: 'copy',
        rollback: 'Legacy files remain at the data-root level until manually archived.',
      },
      null,
      2,
    ),
    'utf8',
  )
  registryCache = registry
  registryCacheMtimeMs = fs.statSync(REGISTRY_FILE).mtimeMs
  return registry
}

export function listBusinessProfiles(): BusinessProfile[] {
  return ensureBusinessProfiles().profiles.map((profile) => ({ ...profile }))
}

export function getBusinessProfile(id: string): BusinessProfile | null {
  if (!isValidBusinessProfileId(id)) return null
  return listBusinessProfiles().find((profile) => profile.id === id) || null
}

export function businessProfileDataDir(id: string): string {
  const profile = getBusinessProfile(id)
  if (!profile) throw new Error(`Unknown business profile: ${id}`)
  const dir = dataDirUnchecked(profile.id)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function currentBusinessProfile(): BusinessProfile {
  return (
    profileStorage.getStore()?.profile ||
    getBusinessProfile(DEFAULT_BUSINESS_PROFILE_ID) ||
    listBusinessProfiles()[0]
  )
}

export function currentProfileDataDir(): string {
  return profileStorage.getStore()?.dataDir || businessProfileDataDir(currentBusinessProfile().id)
}

export function profileDataPath(...parts: string[]): string {
  return path.join(currentProfileDataDir(), ...parts)
}

export function runWithBusinessProfile<T>(id: string, callback: () => T): T {
  const profile = getBusinessProfile(id)
  if (!profile) throw new Error(`Unknown business profile: ${id}`)
  return profileStorage.run({ profile, dataDir: businessProfileDataDir(id) }, callback)
}

export function bindCurrentProfile<TArgs extends unknown[], TResult>(
  callback: (...args: TArgs) => TResult,
): (...args: TArgs) => TResult {
  const profileId = currentBusinessProfile().id
  return (...args: TArgs) => runWithBusinessProfile(profileId, () => callback(...args))
}

export function createBusinessProfile(name: string): BusinessProfile {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Profile name is required')
  const registry = ensureBusinessProfiles()
  if (registry.profiles.some((profile) => profile.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase())) {
    throw new Error(`A profile named “${trimmed}” already exists`)
  }
  const base = slugify(trimmed)
  let id = base
  let suffix = 2
  while (registry.profiles.some((profile) => profile.id === id)) id = `${base.slice(0, 60)}-${suffix++}`
  if (!isValidBusinessProfileId(id)) throw new Error('Profile name cannot produce a safe identifier')
  const createdAt = nowIso()
  const profile: BusinessProfile = { id, name: trimmed, createdAt, updatedAt: createdAt }
  fs.mkdirSync(dataDirUnchecked(id), { recursive: true })
  registry.profiles.push(profile)
  writeRegistry(registry)
  return { ...profile }
}

export function renameBusinessProfile(id: string, name: string): BusinessProfile {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Profile name is required')
  const registry = ensureBusinessProfiles()
  const profile = registry.profiles.find((item) => item.id === id)
  if (!profile) throw new Error(`Unknown business profile: ${id}`)
  if (
    registry.profiles.some(
      (item) => item.id !== id && item.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase(),
    )
  ) {
    throw new Error(`A profile named “${trimmed}” already exists`)
  }
  profile.name = trimmed
  profile.updatedAt = nowIso()
  writeRegistry(registry)
  return { ...profile }
}

export function deleteBusinessProfile(id: string): { deleted: BusinessProfile; recoverableAt: string } {
  if (id === DEFAULT_BUSINESS_PROFILE_ID) throw new Error('Tavo Knyga is the protected primary profile')
  const registry = ensureBusinessProfiles()
  if (registry.profiles.length <= 1) throw new Error('At least one business profile must remain')
  const index = registry.profiles.findIndex((profile) => profile.id === id)
  if (index < 0) throw new Error(`Unknown business profile: ${id}`)
  const [deleted] = registry.profiles.splice(index, 1)
  fs.mkdirSync(TRASH_DIR, { recursive: true })
  const source = profileRootUnchecked(id)
  const recoverableAt = path.join(TRASH_DIR, `${id}-${Date.now()}`)
  if (fs.existsSync(source)) fs.renameSync(source, recoverableAt)
  writeRegistry(registry)
  return { deleted, recoverableAt }
}

export function businessProfileFromHeader(value: unknown): BusinessProfile {
  const requested = String(Array.isArray(value) ? value[0] : value || '').trim()
  const id = requested || DEFAULT_BUSINESS_PROFILE_ID
  const profile = getBusinessProfile(id)
  if (!profile) throw new Error(`Unknown business profile: ${id}`)
  return profile
}
