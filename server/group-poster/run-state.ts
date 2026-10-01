/** Run state, worker status sync and the aggregated Group Poster state. (Split out of group-poster.ts.) */

import fs from 'node:fs'
import path from 'node:path'
import {
    currentProfileBrand,
    ensureCampaignImagesDir,
    getProfileImages
} from '../profile-brand.js'
import { buildGroupQueuePreview, getGroupBlacklist, getGroups, type FbGroup, type GroupBlacklistEntry, type GroupCapability, type GroupQueuePreview } from './groups.js'
import { brandGpDir, ensureDir, getCaptionsText, getGroupPosterSettings, gpDir, normalizeSettings, readGpSecrets, readJson, writeJson, type GroupPosterSettings } from './settings.js'
import { getGroupPosterLog, getGroupPosterProgress, isGroupPosterWorkerRunning, nowIso, statusFile, workerChild, type GroupPosterLogEntry, type GroupPosterProgress } from './worker-state.js'

export const currentFile = () => path.join(gpDir(), 'current.json')

export const groupCapabilitiesFile = () => path.join(gpDir(), 'group-capabilities.json')


export const profilesFile = () => path.join(brandGpDir(), 'profiles.json')

export const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'])

export type GroupPosterStatus =
  | 'idle'
  | 'waiting_login'
  | 'running'
  | 'paused'
  | 'done'
  | 'error'

export type GroupPosterRun = {
  id: string
  mode: 'post' | 'refresh-groups' | 'join-groups' | 'scan-buy-sell' | null
  status: GroupPosterStatus
  createdAt: string
  updatedAt: string
  message?: string
  error?: string
  posted: number
  failed: number
  total: number
  currentGroup?: string | null
  captionIndex: number
  /** ISO timestamp when the current wait ends (live countdown in UI). */
  waitEndsAt?: string | null
  waitLabel?: string | null
}

export type GroupPosterProfileMeta = {
  name: string
  updatedAt: string
  linkUrl: string
  imagesDir: string
  captionsCount: number
}



export type GroupPosterProfile = {
  name: string
  updatedAt: string
  settings: GroupPosterSettings
  captions: string
}



export type ProfilesFile = {
  activeProfile: string
  profiles: GroupPosterProfile[]
}



export type GroupPosterState = {
  ok: boolean
  settings: GroupPosterSettings
  run: GroupPosterRun
  groups: FbGroup[]
  captions: string
  captionsCount: number
  captionsPreview: string[]
  imagesVyrasCount: number
  imagesMoterisCount: number
  imagesOtherCount: number
  log: GroupPosterLogEntry[]
  workerRunning: boolean
  workerPid?: number
  message?: string
  /** Whether vault has a login password (also returned as loginPassword for the local UI). */
  hasLoginPassword: boolean
  /** Plain password for local Control Center reveal/edit — never logged. */
  loginPassword?: string
  profiles: GroupPosterProfileMeta[]
  activeProfile: string
  blacklist: GroupBlacklistEntry[]
  progress: GroupPosterProgress
  queuePreview: GroupQueuePreview
  defaultImagesDir: string
}

export function getGroupCapabilities(): Record<string, GroupCapability> {
  return readJson<Record<string, GroupCapability>>(groupCapabilitiesFile(), {})
}

export function countImagesByGender(settings: GroupPosterSettings): {
  imagesVyrasCount: number
  imagesMoterisCount: number
  imagesOtherCount: number
} {
  const catalog = currentProfileBrand().productCatalogFile
    ? new Set(getProfileImages().map((p) => path.basename(p).toLowerCase()))
    : null
  let imagesVyrasCount = 0
  let imagesMoterisCount = 0
  let imagesOtherCount = 0
  const dirs = [settings.imagesDir, ...settings.imagePaths.filter((p) => {
    try {
      return fs.existsSync(p) && fs.statSync(p).isDirectory()
    } catch {
      return false
    }
  })]
  const files = new Set<string>()
  for (const dir of dirs) {
    if (!dir || !fs.existsSync(dir)) continue
    try {
      if (!fs.statSync(dir).isDirectory()) continue
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name)
        const ext = path.extname(name).toLowerCase()
        if (!IMAGE_EXTS.has(ext)) continue
        if (catalog && !catalog.has(name.toLowerCase())) continue
        try {
          if (!fs.statSync(full).isFile()) continue
        } catch {
          continue
        }
        files.add(full.toLowerCase())
        const upper = name.toUpperCase()
        const hasV = upper.includes('VYRAS')
        const hasM = upper.includes('MOTERIS')
        if (hasV && !hasM) imagesVyrasCount += 1
        else if (hasM && !hasV) imagesMoterisCount += 1
        else imagesOtherCount += 1
      }
    } catch {
      /* ignore */
    }
  }
  for (const p of settings.imagePaths) {
    try {
      if (!fs.existsSync(p) || !fs.statSync(p).isFile()) continue
      const key = p.toLowerCase()
      if (files.has(key)) continue
      const ext = path.extname(p).toLowerCase()
      if (!IMAGE_EXTS.has(ext)) continue
      if (catalog && !catalog.has(path.basename(p).toLowerCase())) continue
      const upper = path.basename(p).toUpperCase()
      const hasV = upper.includes('VYRAS')
      const hasM = upper.includes('MOTERIS')
      if (hasV && !hasM) imagesVyrasCount += 1
      else if (hasM && !hasV) imagesMoterisCount += 1
      else imagesOtherCount += 1
    } catch {
      /* ignore */
    }
  }
  return { imagesVyrasCount, imagesMoterisCount, imagesOtherCount }
}



export function emptyRun(): GroupPosterRun {
  const t = nowIso()
  return {
    id: '',
    mode: null,
    status: 'idle',
    createdAt: t,
    updatedAt: t,
    posted: 0,
    failed: 0,
    total: 0,
    currentGroup: null,
    captionIndex: 0,
  }
}



export function mapWorkerStatus(raw: string | undefined): GroupPosterStatus {
  switch (raw) {
    case 'waiting_login':
      return 'waiting_login'
    case 'running':
      return 'running'
    case 'paused':
      return 'paused'
    case 'done':
      return 'done'
    case 'error':
      return 'error'
    case 'idle':
    default:
      return 'idle'
  }
}



export function syncRunFromWorkerFiles(run: GroupPosterRun): GroupPosterRun {
  const status = readJson<Record<string, unknown>>(statusFile(), {})
  const settings = getGroupPosterSettings()
  const next: GroupPosterRun = { ...run }
  if (status && typeof status === 'object') {
    if (typeof status.status === 'string') next.status = mapWorkerStatus(status.status)
    if (typeof status.message === 'string') next.message = status.message
    if (typeof status.error === 'string') next.error = status.error
    if (typeof status.posted === 'number') next.posted = status.posted
    if (typeof status.failed === 'number') next.failed = status.failed
    if (typeof status.total === 'number') next.total = status.total
    if (typeof status.captionIndex === 'number') next.captionIndex = status.captionIndex
    if (status.currentGroup === null || typeof status.currentGroup === 'string') {
      next.currentGroup = status.currentGroup as string | null
    }
    if (status.waitEndsAt === null) next.waitEndsAt = null
    else if (typeof status.waitEndsAt === 'string') next.waitEndsAt = status.waitEndsAt
    if (status.waitLabel === null) next.waitLabel = null
    else if (typeof status.waitLabel === 'string') next.waitLabel = status.waitLabel
    if (typeof status.updatedAt === 'string') next.updatedAt = status.updatedAt
    else next.updatedAt = nowIso()
  }
  // Prefer settings captionIndex if worker bumped it
  if (typeof settings.captionIndex === 'number' && settings.captionIndex > next.captionIndex) {
    next.captionIndex = settings.captionIndex
  }
  // If child died and status still running, mark error
  const alive = isGroupPosterWorkerRunning()
  if (!alive && (next.status === 'running' || next.status === 'waiting_login' || next.status === 'paused')) {
    // keep last status file if done/error already written
    if (next.status === 'running' || next.status === 'waiting_login' || next.status === 'paused') {
      const st = typeof status.status === 'string' ? status.status : ''
      if (st !== 'done' && st !== 'error') {
        next.status = 'error'
        next.message = next.message || 'Worker exited unexpectedly'
        next.error = next.error || 'worker_exit'
      }
    }
  }
  return next
}



export function loadRun(): GroupPosterRun {
  const raw = readJson<Partial<GroupPosterRun>>(currentFile(), emptyRun())
  const base: GroupPosterRun = {
    ...emptyRun(),
    ...raw,
    id: typeof raw.id === 'string' ? raw.id : '',
    mode:
      raw.mode === 'post' ||
      raw.mode === 'refresh-groups' ||
      raw.mode === 'join-groups' ||
      raw.mode === 'scan-buy-sell'
        ? raw.mode
        : null,
    status: mapWorkerStatus(raw.status as string | undefined),
    posted: Number(raw.posted) || 0,
    failed: Number(raw.failed) || 0,
    total: Number(raw.total) || 0,
    captionIndex: Number(raw.captionIndex) || 0,
  }
  return syncRunFromWorkerFiles(base)
}



export function saveRun(run: GroupPosterRun) {
  writeJson(currentFile(), { ...run, updatedAt: nowIso() })
}



export function readProfilesFile(): ProfilesFile {
  ensureDir()
  const raw = readJson<Partial<ProfilesFile>>(profilesFile(), { activeProfile: '', profiles: [] })
  const profiles = Array.isArray(raw.profiles)
    ? raw.profiles.flatMap((p): GroupPosterProfile[] => {
        if (!p || typeof p !== 'object' || typeof p.name !== 'string' || !p.name.trim()) return []
        return [
          {
            name: p.name.trim(),
            updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : nowIso(),
            settings: normalizeSettings(p.settings),
            captions: typeof p.captions === 'string' ? p.captions : '',
          },
        ]
      })
    : []
  return {
    activeProfile: typeof raw.activeProfile === 'string' ? raw.activeProfile : '',
    profiles,
  }
}



export function profileToMeta(p: GroupPosterProfile): GroupPosterProfileMeta {
  const captionsCount = p.captions
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean).length
  return {
    name: p.name,
    updatedAt: p.updatedAt,
    linkUrl: p.settings.linkUrl || '',
    imagesDir: p.settings.imagesDir || '',
    captionsCount,
  }
}



export function listGroupPosterProfiles(): {
  ok: boolean
  profiles: GroupPosterProfileMeta[]
  activeProfile: string
} {
  const data = readProfilesFile()
  return {
    ok: true,
    profiles: data.profiles.map(profileToMeta),
    activeProfile: data.activeProfile,
  }
}

export function captionsMeta(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  return {
    captions: text,
    captionsCount: lines.length,
    captionsPreview: lines.slice(0, 5),
  }
}



export function getGroupPosterState(opts?: { light?: boolean }): GroupPosterState {
  ensureDir()
  const settings = getGroupPosterSettings()
  let run = loadRun()
  run = syncRunFromWorkerFiles(run)
  if (run.id) saveRun(run)

  const alive = isGroupPosterWorkerRunning()
  // Keep the full response contract until consumers support a partial state.
  void opts
  const secrets = readGpSecrets()
  const groups = getGroups()
  const base: GroupPosterState = {
    ok: true,
    settings,
    run,
    groups,
    ...captionsMeta(getCaptionsText()),
    ...countImagesByGender(settings),
    log: getGroupPosterLog(80),
    workerRunning: alive,
    workerPid: alive && workerChild()?.pid ? workerChild()!.pid : undefined,
    hasLoginPassword: Boolean(secrets.loginPassword.trim()),
    loginPassword: secrets.loginPassword,
    profiles: listGroupPosterProfiles().profiles,
    activeProfile: readProfilesFile().activeProfile || '',
    blacklist: getGroupBlacklist(),
    progress: getGroupPosterProgress(),
    queuePreview: buildGroupQueuePreview(
      groups,
      settings.selectedGroupIds,
      getGroupBlacklist(),
      getGroupCapabilities(),
    ),
    defaultImagesDir: ensureCampaignImagesDir(),
  }
  return base
}
