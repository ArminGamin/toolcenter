/**
 * Facebook Group Poster — Control Center orchestration.
 * Spawns D:\toolsai\facebook-group-poster\worker.py with a shared data dir.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {
    clearBrowserSessionDir,
    ensureBrowserSessionDir,
} from './browser-sessions.js'
import {
    bindCurrentProfile,
    currentBusinessProfile
} from './business-profiles.js'
import { TOOLSAI_ROOT } from './cc-services.js'
import {
    facebookAccountProfileId,
    sharesFacebookAccountWithTavo
} from './facebook-account-store.js'
import {
    isFriendDmWorkerRunning,
    killFriendDmWorker,
    prepareFriendDmLoginClear,
    resetFriendDmAfterLoginClear,
} from './group-poster-dms.js'
import { buildGroupQueuePreview, buySellBlacklistFile, getGroupBlacklist, getGroups, groupBlacklistFile, groupsFile } from './group-poster/groups.js'
import { countImagesByGender, emptyRun, getGroupCapabilities, getGroupPosterState, loadRun, profilesFile, profileToMeta, readProfilesFile, saveRun, syncRunFromWorkerFiles, type GroupPosterProfile, type GroupPosterProfileMeta, type GroupPosterRun, type GroupPosterState, type ProfilesFile } from './group-poster/run-state.js'
import { captionsFile, contentRestoreFile, endFacebookBrandRun, ensureDir, getCaptionsText, getGroupPosterSettings, getWorkerLock, gpDir, readGpSecrets, readJson, reclaimFacebookBrandContentIfIdle, resolvePosterImagesDir, saveCaptionsText, saveGroupPosterSettings, settingsFile, WORKER_DIR, writeJson, writeJsonRobust, type GroupPosterSettings } from './group-poster/settings.js'
import { clearGroupPosterProgress, clearWorkerLock, idleGroupPosterWorkerState, isGroupPosterLockMode, logFile, nowIso, sealGroupPosterProgress, statusFile, workerChild, workerChildren, writeWorkerLock } from './group-poster/worker-state.js'
import {
    currentProfileBrand,
    getProfileImages
} from './profile-brand.js'
import { attachWorkerOutput } from './worker-output.js'
export { buildGroupQueuePreview, getGroupBlacklist, getGroups } from './group-poster/groups.js'
export type { FbGroup, GroupBlacklistEntry, GroupCapability, GroupQueuePreview } from './group-poster/groups.js'
export { countImagesByGender, getGroupPosterState, listGroupPosterProfiles } from './group-poster/run-state.js'
export type { GroupPosterProfile, GroupPosterProfileMeta, GroupPosterRun, GroupPosterState, GroupPosterStatus } from './group-poster/run-state.js'
export { endFacebookBrandRun, getCaptionsText, getGroupPosterSettings, getWorkerLock, loadCaptionsFromPath, saveCaptionsText, saveGroupPosterSettings, writeJsonRobust } from './group-poster/settings.js'
export type { GroupPosterSettings } from './group-poster/settings.js'
export { clearGroupPosterLog, clearGroupPosterProgress, clearWorkerLock, getGroupPosterLog, getGroupPosterProgress, GROUP_POSTER_PROGRESS_TTL_SEC, idleGroupPosterWorkerState, isGroupPosterWorkerRunning, sealGroupPosterProgress, writeWorkerLock } from './group-poster/worker-state.js'
export type { GroupPosterLogEntry, GroupPosterProgress } from './group-poster/worker-state.js'
const controlFile = () => path.join(gpDir(), 'control.json')
const runConfigFile = () => path.join(gpDir(), 'run-config.json')
const WORKER_SCRIPT = path.join(WORKER_DIR, 'worker.py')
const dmStatusFile = () => path.join(gpDir(), 'friend-dms', 'status.json')
const shareStatusFile = () => path.join(gpDir(), 'profile-share', 'status.json')
const setWorkerChild = (child: ChildProcess | null) => {
  const id = facebookAccountProfileId()
  if (child) workerChildren.set(id, child)
  else workerChildren.delete(id)
}

export function listGroupPosterWorkerProfileIds(): string[] {
  return [...workerChildren.keys()]
}

export function seedGroupPosterWorkerSlot(child: ChildProcess | null) {
  setWorkerChild(child)
}

export function idleFriendDmWorkerState() {
  writeJsonRobust(dmStatusFile(), {
    status: 'idle',
    message: 'Idle',
    updatedAt: nowIso(),
  })
}

export function idleProfileShareWorkerState() {
  writeJsonRobust(shareStatusFile(), {
    status: 'idle',
    message: 'Idle',
    updatedAt: nowIso(),
  })
}

function isFriendDmLockMode(mode: string) {
  return mode === 'dm-friends' || mode === 'refresh-friends'
}

export function beginFacebookBrandRun() {
  reclaimFacebookBrandContentIfIdle()
  if (!sharesFacebookAccountWithTavo() || fs.existsSync(contentRestoreFile())) return
  const shared = readJson<Record<string, unknown>>(settingsFile(), {})
  const brand = getGroupPosterSettings()
  writeJson(contentRestoreFile(), {
    captionIndex: Number(shared.captionIndex) || 0,
    imageIndexVyras: Number(shared.imageIndexVyras) || 0,
    imageIndexMoteris: Number(shared.imageIndexMoteris) || 0,
  })
  writeJson(settingsFile(), {
    ...shared,
    captionIndex: brand.captionIndex,
    imageIndexVyras: brand.imageIndexVyras,
    imageIndexMoteris: brand.imageIndexMoteris,
  })
}

function resolvePython(cwd: string): string {
  const candidates = [
    path.join(cwd, '.venv312', 'Scripts', 'python.exe'),
    path.join(cwd, '.venv', 'Scripts', 'python.exe'),
    path.join(TOOLSAI_ROOT, '.venv', 'Scripts', 'python.exe'),
    'python',
  ]
  for (const c of candidates) {
    if (c === 'python') return c
    if (fs.existsSync(c)) return c
  }
  return 'python'
}

function writeControl(partial: Record<string, unknown>) {
  const prev = readJson<Record<string, unknown>>(controlFile(), {
    paused: false,
    abort: false,
    continueLogin: false,
  })
  writeJson(controlFile(), { ...prev, ...partial })
}

function appendHubLog(kind: string, message: string) {
  ensureDir()
  const profile = currentBusinessProfile()
  const entry = { at: nowIso(), kind, message, profileId: profile.id, profileName: profile.name }
  fs.appendFileSync(logFile(), `${JSON.stringify(entry)}\n`, 'utf8')
}

function profileKeyId(name: string) {
  return name.trim().toLocaleLowerCase()
}

function writeProfilesFile(data: ProfilesFile) {
  writeJson(profilesFile(), data)
}

function workerIsBusy(): boolean {
  return Boolean(workerChild() && !workerChild()!.killed && workerChild()!.exitCode == null)
}

export function saveGroupPosterProfile(name: string): {
  ok: boolean
  message: string
  profiles?: GroupPosterProfileMeta[]
  activeProfile?: string
  state?: GroupPosterState
} {
  const trimmed = (name || '').trim()
  if (!trimmed) return { ok: false, message: 'Enter a profile name' }
  if (workerIsBusy()) {
    return { ok: false, message: 'Abort or finish the current run before saving a profile' }
  }

  const snapshot: GroupPosterProfile = {
    name: trimmed,
    updatedAt: nowIso(),
    settings: getGroupPosterSettings(),
    captions: getCaptionsText(),
  }

  const data = readProfilesFile()
  const id = profileKeyId(trimmed)
  const idx = data.profiles.findIndex((p) => profileKeyId(p.name) === id)
  if (idx >= 0) data.profiles[idx] = snapshot
  else data.profiles.push(snapshot)
  data.activeProfile = trimmed
  writeProfilesFile(data)
  appendHubLog('info', `Saved profile “${trimmed}”`)
  return {
    ok: true,
    message: `Saved profile “${trimmed}”`,
    profiles: data.profiles.map(profileToMeta),
    activeProfile: trimmed,
    state: getGroupPosterState(),
  }
}

export function loadGroupPosterProfile(name: string): {
  ok: boolean
  message: string
  settings?: GroupPosterSettings
  captions?: string
  profiles?: GroupPosterProfileMeta[]
  activeProfile?: string
  state?: GroupPosterState
} {
  const trimmed = (name || '').trim()
  if (!trimmed) return { ok: false, message: 'Pick a profile to load' }
  if (workerIsBusy()) {
    return { ok: false, message: 'Abort or finish the current run before loading a profile' }
  }

  const data = readProfilesFile()
  const id = profileKeyId(trimmed)
  const found = data.profiles.find((p) => profileKeyId(p.name) === id)
  if (!found) return { ok: false, message: `Profile “${trimmed}” not found` }

  saveGroupPosterSettings(found.settings)
  saveCaptionsText(found.captions)
  data.activeProfile = found.name
  writeProfilesFile(data)
  appendHubLog('info', `Loaded profile “${found.name}”`)
  return {
    ok: true,
    message: `Loaded profile “${found.name}”`,
    settings: found.settings,
    captions: found.captions,
    profiles: data.profiles.map(profileToMeta),
    activeProfile: found.name,
    state: getGroupPosterState(),
  }
}

export function deleteGroupPosterProfile(name: string): {
  ok: boolean
  message: string
  profiles?: GroupPosterProfileMeta[]
  activeProfile?: string
  state?: GroupPosterState
} {
  const trimmed = (name || '').trim()
  if (!trimmed) return { ok: false, message: 'Pick a profile to delete' }
  if (workerIsBusy()) {
    return { ok: false, message: 'Abort or finish the current run before deleting a profile' }
  }

  const data = readProfilesFile()
  const id = profileKeyId(trimmed)
  const next = data.profiles.filter((p) => profileKeyId(p.name) !== id)
  if (next.length === data.profiles.length) {
    return { ok: false, message: `Profile “${trimmed}” not found` }
  }
  data.profiles = next
  if (profileKeyId(data.activeProfile) === id) data.activeProfile = ''
  writeProfilesFile(data)
  appendHubLog('info', `Deleted profile “${trimmed}”`)
  return {
    ok: true,
    message: `Deleted profile “${trimmed}”`,
    profiles: data.profiles.map(profileToMeta),
    activeProfile: data.activeProfile,
    state: getGroupPosterState(),
  }
}

function syncSelectedGroupsWithBlacklist(): void {
  const blocked = new Set(getGroupBlacklist().map((g) => g.id))
  const settings = getGroupPosterSettings()
  const next = (settings.selectedGroupIds || []).filter((id) => !blocked.has(id))
  if (next.length !== (settings.selectedGroupIds || []).length) {
    saveGroupPosterSettings({ selectedGroupIds: next })
  }
}

export function unblacklistGroupPosterGroup(id: string): {
  ok: boolean
  message: string
  state: GroupPosterState
} {
  const gid = String(id || '').trim()
  if (!gid) {
    return { ok: false, message: 'Missing group id', state: getGroupPosterState() }
  }

  const before = getGroupBlacklist()
  const entry = before.find((g) => g.id === gid)
  const next = before.filter((g) => g.id !== gid)
  if (next.length === before.length) {
    return { ok: false, message: 'Group not on blacklist', state: getGroupPosterState() }
  }

  writeJson(groupBlacklistFile(), next)
  writeJson(
    buySellBlacklistFile(),
    next
      .filter((g) => g.reason === 'buy_sell')
      .map((g) => ({ id: g.id, name: g.name, removedAt: g.removedAt || '' })),
  )

  // Put it back into groups.json so it shows up without a full refresh
  const raw = readJson<unknown>(groupsFile(), [])
  const groups = Array.isArray(raw) ? [...raw] : []
  const exists = groups.some(
    (g) => g && typeof g === 'object' && String((g as { id?: string }).id || '') === gid,
  )
  if (!exists) {
    groups.push({
      id: gid,
      name: entry?.name || gid,
      url: `https://www.facebook.com/groups/${gid}`,
    })
    groups.sort((a, b) => {
      const an =
        a && typeof a === 'object' && typeof (a as { name?: string }).name === 'string'
          ? String((a as { name: string }).name)
          : ''
      const bn =
        b && typeof b === 'object' && typeof (b as { name?: string }).name === 'string'
          ? String((b as { name: string }).name)
          : ''
      return an.localeCompare(bn)
    })
    writeJson(groupsFile(), groups)
  }

  return {
    ok: true,
    message: `Restored ${entry?.name || gid}`,
    state: getGroupPosterState(),
  }
}

export function blacklistGroupPosterGroups(ids: string[]): {
  ok: boolean
  message: string
  state: GroupPosterState
} {
  const wanted = [...new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean))]
  if (!wanted.length) {
    return { ok: false, message: 'Select at least one group', state: getGroupPosterState() }
  }

  const raw = readJson<unknown>(groupsFile(), [])
  const groups = Array.isArray(raw) ? raw : []
  const byId = new Map<string, { id: string; name: string; url?: string }>()
  for (const g of groups) {
    if (!g || typeof g !== 'object') continue
    const o = g as Record<string, unknown>
    const id = typeof o.id === 'string' ? o.id : ''
    if (!id) continue
    byId.set(id, {
      id,
      name: typeof o.name === 'string' && o.name.trim() ? o.name.trim() : id,
      url: typeof o.url === 'string' ? o.url : undefined,
    })
  }

  const bl = getGroupBlacklist()
  const blById = new Map(bl.map((g) => [g.id, g]))
  const stamp = nowIso()

  for (const gid of wanted) {
    const fromList = byId.get(gid)
    const name = fromList?.name || blById.get(gid)?.name || gid
    const prev = blById.get(gid)
    if (!prev) {
      blById.set(gid, { id: gid, name, reason: 'manual', removedAt: stamp })
    } else {
      prev.reason = 'manual'
      prev.name = name
      if (!prev.removedAt) prev.removedAt = stamp
    }
  }

  const nextBl = [...blById.values()].sort((a, b) => a.name.localeCompare(b.name))
  writeJson(groupBlacklistFile(), nextBl)
  writeJson(
    buySellBlacklistFile(),
    nextBl
      .filter((g) => g.reason === 'buy_sell')
      .map((g) => ({ id: g.id, name: g.name, removedAt: g.removedAt || '' })),
  )

  const blocked = new Set(wanted)
  const keptGroups = groups.filter((g) => {
    if (!g || typeof g !== 'object') return false
    const id = String((g as { id?: string }).id || '')
    return id && !blocked.has(id)
  })
  writeJson(groupsFile(), keptGroups)

  // Drop from selectedGroupIds so they don't linger as a phantom selection
  const settings = getGroupPosterSettings()
  const nextSelected = (settings.selectedGroupIds || []).filter((id) => !blocked.has(id))
  if (nextSelected.length !== (settings.selectedGroupIds || []).length) {
    saveGroupPosterSettings({ selectedGroupIds: nextSelected })
  }

  return {
    ok: true,
    message:
      wanted.length === 1
        ? `Blacklisted ${byId.get(wanted[0])?.name || wanted[0]}`
        : `Blacklisted ${wanted.length} groups`,
    state: getGroupPosterState(),
  }
}

/** Explicit UI action — drop the 10-minute warm resume without clearing the whole run. */
export function clearGroupPosterWarmProgress(): {
  ok: boolean
  message: string
  state: GroupPosterState
} {
  clearGroupPosterProgress()
  appendHubLog('info', 'Warm progress cleared')
  return { ok: true, message: 'Warm progress cleared', state: getGroupPosterState() }
}

function killWorker() {
  if (workerChild() && !workerChild()!.killed) {
    try {
      workerChild()!.kill()
    } catch {
      /* ignore */
    }
  }
  setWorkerChild(null)
}

function spawnWorker(mode: 'post' | 'refresh-groups' | 'join-groups' | 'scan-buy-sell'): { ok: boolean; message: string } {
  if (!fs.existsSync(WORKER_SCRIPT)) {
    return { ok: false, message: `Worker missing: ${WORKER_SCRIPT}` }
  }
  const lock = getWorkerLock()
  if (lock) {
    if (isFriendDmLockMode(lock.mode)) {
      return { ok: false, message: 'Friend DM worker is running — abort it first' }
    }
    if (lock.mode === 'share-profile') {
      return { ok: false, message: 'Profile share worker is running — abort it first' }
    }
    if (!isGroupPosterLockMode(lock.mode)) {
      return { ok: false, message: 'Another worker is running — abort first' }
    }
    return { ok: false, message: 'Worker already running — abort first' }
  }
  if (workerChild() && !workerChild()!.killed && workerChild()!.exitCode == null) {
    return { ok: false, message: 'Worker already running — abort first' }
  }
  if (isFriendDmWorkerRunning()) {
    return { ok: false, message: 'Friend DM worker is running — abort it first' }
  }

  ensureDir()
  beginFacebookBrandRun()
  idleFriendDmWorkerState()
  idleProfileShareWorkerState()
  writeControl({ paused: false, abort: false, continueLogin: false, showBrowser: false })
  writeJson(statusFile(), {
    status: 'running',
    message:
      mode === 'refresh-groups'
        ? 'Starting group refresh…'
        : mode === 'join-groups'
          ? 'Starting group joins…'
          : mode === 'scan-buy-sell'
            ? 'Scanning for Buy & Sell groups…'
            : 'Starting…',
    mode,
    posted: 0,
    failed: 0,
    updatedAt: nowIso(),
  })

  const py = resolvePython(WORKER_DIR)
  const browserProfileDir = ensureBrowserSessionDir(
    'facebook',
    path.join(WORKER_DIR, 'browser_profile'),
  )
  const child = spawn(py, [WORKER_SCRIPT, '--data-dir', gpDir(), '--mode', mode], {
    cwd: WORKER_DIR,
    windowsHide: false,
    env: {
      ...process.env,
      TOOLSAI_BROWSER_PROFILE_DIR: browserProfileDir,
    },
  })
  setWorkerChild(child)
  if (child.pid) writeWorkerLock(mode, child.pid, gpDir())

  attachWorkerOutput(child, (kind, message, event) => {
    // Structured events are already durably written by the Python worker.
    if (!event) appendHubLog(kind, message)
  })
  child.on('error', bindCurrentProfile((error) => {
    if (workerChild() !== child) return
    appendHubLog('error', `Worker could not start: ${error.message}`)
    writeJson(statusFile(), { status: 'error', error: 'worker_spawn_failed', message: error.message, updatedAt: nowIso() })
  }))
  child.on('close', bindCurrentProfile((code) => {
    if (child.pid) clearWorkerLock(child.pid)
    if (workerChild() !== child) return
    setWorkerChild(null)
    endFacebookBrandRun()
    appendHubLog('info', `Worker exited (code ${code ?? '?'})`)
    if (mode === 'post') sealGroupPosterProgress()
    const run = loadRun()
    const synced = syncRunFromWorkerFiles(run)
    if (synced.status === 'running' || synced.status === 'waiting_login' || synced.status === 'paused') {
      synced.status = code === 0 ? 'done' : 'error'
      synced.message = code === 0 ? 'Worker finished' : `Worker exited with code ${code}`
    }
    saveRun(synced)
  }))

  return {
    ok: true,
    message:
      mode === 'refresh-groups'
        ? 'Refreshing groups…'
        : mode === 'join-groups'
          ? 'Joining groups…'
          : mode === 'scan-buy-sell'
            ? 'Scanning Buy & Sell groups…'
            : 'Poster started',
  }
}

function buildRunConfigPayload(
  settings: GroupPosterSettings,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  const secrets = readGpSecrets()
  return {
    ...settings,
    imagesDir: resolvePosterImagesDir(settings.imagesDir),
    imagePaths: currentProfileBrand().productCatalogFile ? getProfileImages() : settings.imagePaths,
    captionsPath: captionsFile(),
    loginEmail: settings.loginEmail,
    loginPassword: secrets.loginPassword,
    autoLogin: settings.autoLogin,
    preserveExistingBlacklist: settings.preserveExistingBlacklist,
    blacklistedGroupIds: getGroupBlacklist().map((g) => g.id),
    ...extra,
  }
}

export function startGroupPoster(
  partial?: Partial<GroupPosterSettings> & { loginPassword?: string },
): { ok: boolean; message: string; state?: GroupPosterState } {
  if (partial && Object.keys(partial).length) {
    saveGroupPosterSettings(partial)
  }
  const settings = getGroupPosterSettings()

  if (!settings.includeText && !settings.includeLink && !settings.includeImage) {
    return { ok: false, message: 'Enable at least one of Text, Link, or Image' }
  }
  if (settings.includeImage && settings.imagePaths.length === 0) {
    const dir = settings.imagesDir.trim()
    const hasDir = dir && fs.existsSync(dir)
    if (!hasDir) {
      return { ok: false, message: 'Set an images folder or add image paths' }
    }
  }
  if (settings.includeImage && settings.rotateImages) {
    const counts = countImagesByGender(settings)
    const catalogOk =
      Boolean(currentProfileBrand().productCatalogFile) && counts.imagesOtherCount > 0
    if (!catalogOk && counts.imagesVyrasCount + counts.imagesMoterisCount === 0) {
      return {
        ok: false,
        message: 'Rotate images needs files named with VYRAS or MOTERIS in the folder',
      }
    }
  }
  if (settings.includeLink && !settings.linkUrl.trim()) {
    return { ok: false, message: 'Link is enabled but URL is empty' }
  }
  if (settings.includeText && !settings.rotateCaptions && !settings.fixedCaption.trim()) {
    const caps = getCaptionsText()
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
    if (!caps.length) {
      return { ok: false, message: 'Add a fixed caption or captions in the rotator' }
    }
  }

  const groups = getGroups()
  const selectedIds = new Set(settings.selectedGroupIds)
  const selectedBeforePreflight =
    selectedIds.size > 0 ? groups.filter((g) => selectedIds.has(g.id)) : groups.slice()

  if (!selectedBeforePreflight.length) {
    return {
      ok: false,
      message: groups.length
        ? 'Select at least one group (or refresh groups first)'
        : 'No groups yet — click Refresh groups first',
    }
  }

  const preview = buildGroupQueuePreview(
    groups,
    settings.selectedGroupIds,
    getGroupBlacklist(),
    getGroupCapabilities(),
  )
  const eligible = new Set(preview.eligibleIds)
  const selected = selectedBeforePreflight.filter((group) => eligible.has(group.id))
  if (!selected.length) {
    return {
      ok: false,
      message: preview.excluded
        ? `No eligible groups — ${preview.excluded} excluded by preflight; review the queue or run Scan Buy & Sell`
        : 'No eligible groups — run Scan Buy & Sell first',
      state: getGroupPosterState(),
    }
  }

  const runId = `gp-${Date.now().toString(36)}`
  const run: GroupPosterRun = {
    id: runId,
    mode: 'post',
    status: 'running',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    message: 'Starting…',
    posted: 0,
    failed: 0,
    total: selected.length,
    currentGroup: null,
    captionIndex: settings.captionIndex,
  }
  saveRun(run)

  writeJson(
    runConfigFile(),
    buildRunConfigPayload(settings, {
      selectedGroups: selected,
      selectedGroupIds: selected.map((g) => g.id),
    }),
  )

  appendHubLog(
    'info',
    `Start post run · ${selected.length} eligible groups · ${preview.excluded} excluded · ${preview.staleOrUnscanned} stale/unscanned`,
  )
  const spawned = spawnWorker('post')
  if (!spawned.ok) return spawned
  return { ok: true, message: spawned.message, state: getGroupPosterState() }
}

export function refreshGroupPosterGroups(): { ok: boolean; message: string; state?: GroupPosterState } {
  const runId = `gp-refresh-${Date.now().toString(36)}`
  const run: GroupPosterRun = {
    id: runId,
    mode: 'refresh-groups',
    status: 'running',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    message: 'Refreshing groups…',
    posted: 0,
    failed: 0,
    total: 0,
    currentGroup: null,
    captionIndex: getGroupPosterSettings().captionIndex,
  }
  saveRun(run)
  writeJson(runConfigFile(), buildRunConfigPayload(getGroupPosterSettings()))
  appendHubLog('info', 'Start refresh-groups')
  const spawned = spawnWorker('refresh-groups')
  if (!spawned.ok) return spawned
  return { ok: true, message: spawned.message, state: getGroupPosterState() }
}

export function joinGroupPosterGroups(): { ok: boolean; message: string; state?: GroupPosterState } {
  const groups = getGroups()
  if (!groups.length) {
    return { ok: false, message: 'No groups loaded — refresh groups first' }
  }

  const runId = `gp-join-${Date.now().toString(36)}`
  const run: GroupPosterRun = {
    id: runId,
    mode: 'join-groups',
    status: 'running',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    message: `Joining ${groups.length} groups…`,
    posted: 0,
    failed: 0,
    total: groups.length,
    currentGroup: null,
    captionIndex: getGroupPosterSettings().captionIndex,
  }
  saveRun(run)
  writeJson(runConfigFile(), buildRunConfigPayload(getGroupPosterSettings()))
  appendHubLog('info', `Start join-groups · ${groups.length} groups`)
  const spawned = spawnWorker('join-groups')
  if (!spawned.ok) return spawned
  return { ok: true, message: spawned.message, state: getGroupPosterState() }
}

export function scanGroupPosterBuySell(): { ok: boolean; message: string; state?: GroupPosterState } {
  const groups = getGroups()
  if (!groups.length) {
    return { ok: false, message: 'No groups loaded — refresh groups first' }
  }

  const runId = `gp-scan-bs-${Date.now().toString(36)}`
  const run: GroupPosterRun = {
    id: runId,
    mode: 'scan-buy-sell',
    status: 'running',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    message: `Scanning ${groups.length} groups for Buy & Sell…`,
    posted: 0,
    failed: 0,
    total: groups.length,
    currentGroup: null,
    captionIndex: getGroupPosterSettings().captionIndex,
  }
  saveRun(run)
  writeJson(runConfigFile(), buildRunConfigPayload(getGroupPosterSettings()))
  appendHubLog('info', `Start scan-buy-sell · ${groups.length} groups`)
  const spawned = spawnWorker('scan-buy-sell')
  if (!spawned.ok) return spawned
  return { ok: true, message: spawned.message, state: getGroupPosterState() }
}

export function continueGroupPosterLogin(): { ok: boolean; message: string } {
  writeControl({ continueLogin: true })
  appendHubLog('info', 'Continue login signaled')
  return { ok: true, message: 'Continue sent — worker will proceed' }
}

export function clearGroupPosterLoginSession(): { ok: boolean; message: string } {
  writeControl({ abort: true, clearLoginSession: true })
  prepareFriendDmLoginClear()
  killWorker()
  killFriendDmWorker()
  clearWorkerLock()

  try {
    clearBrowserSessionDir('facebook')
  } catch (err) {
    appendHubLog(
      'error',
      `Could not delete browser profile: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  saveGroupPosterSettings({ autoLogin: false, preserveExistingBlacklist: true })
  syncSelectedGroupsWithBlacklist()

  const run = loadRun()
  if (run.status === 'waiting_login' || run.status === 'running' || run.status === 'paused') {
    run.status = 'idle'
    run.message = 'Login session cleared — start again to sign in'
    run.waitEndsAt = undefined
    run.waitLabel = undefined
    saveRun(run)
  }
  idleGroupPosterWorkerState()
  resetFriendDmAfterLoginClear()
  writeControl({
    paused: false,
    abort: false,
    continueLogin: false,
    showBrowser: false,
    clearLoginSession: false,
  })

  appendHubLog('info', 'Facebook login session cleared — browser profile wiped')
  return {
    ok: true,
    message:
      'Saved login cleared. Refresh groups or start a run, then sign in with your new Facebook account.',
  }
}

export function showGroupPosterBrowser(): { ok: boolean; message: string } {
  writeControl({ showBrowser: true })
  appendHubLog('info', 'Show browser signaled')
  return {
    ok: true,
    message: 'Chrome will move on-screen within ~1s (if the worker is running)',
  }
}

export function pauseGroupPoster(): { ok: boolean; message: string } {
  writeControl({ paused: true })
  const run = loadRun()
  run.status = 'paused'
  run.message = 'Paused'
  saveRun(run)
  return { ok: true, message: 'Paused' }
}

export function resumeGroupPoster(): { ok: boolean; message: string } {
  writeControl({ paused: false })
  const run = loadRun()
  if (run.status === 'paused') {
    run.status = 'running'
    run.message = 'Resumed'
    saveRun(run)
  }
  return { ok: true, message: 'Resumed' }
}

export function abortGroupPoster(): { ok: boolean; message: string } {
  writeControl({ abort: true, paused: false })
  appendHubLog('info', 'Abort signaled')
  // Give worker a moment, then force-kill
  const abortedChild = workerChild()
  const abortTimer = setTimeout(bindCurrentProfile(() => {
    if (abortedChild && workerChild() === abortedChild) killWorker()
  }), 1500)
  abortTimer.unref()
  abortedChild?.once('close', () => clearTimeout(abortTimer))
  const run = loadRun()
  run.status = 'error'
  run.message = 'Aborted'
  run.error = 'aborted'
  writeJson(statusFile(), { status: 'error', message: 'Aborted', error: 'aborted', waitEndsAt: null, waitLabel: null, updatedAt: nowIso() })
  saveRun(run)
  return { ok: true, message: 'Abort sent' }
}

export function clearGroupPosterRun(): { ok: boolean; message: string; state: GroupPosterState } {
  if (workerChild() && !workerChild()!.killed) {
    writeControl({ abort: true })
    killWorker()
  }
  clearGroupPosterProgress()
  saveRun(emptyRun())
  writeJson(statusFile(), { status: 'idle', updatedAt: nowIso() })
  writeControl({ paused: false, abort: false, continueLogin: false, showBrowser: false })
  return { ok: true, message: 'Run cleared', state: getGroupPosterState() }
}
