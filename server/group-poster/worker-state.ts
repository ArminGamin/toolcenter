/** Worker lock, idle state, log and warm-progress files for the Group Poster worker. (Split out of group-poster.ts.) */

import { type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {
    facebookAccountProfileId
} from '../facebook-account-store.js'
import { readLastNonEmptyLines } from '../log-tail.js'
import { ensureDir, getWorkerLock, gpDir, readJson, workerLockFile, writeJson, writeJsonRobust } from './settings.js'


export const statusFile = () => path.join(gpDir(), 'status.json')


export const progressFile = () => path.join(gpDir(), 'progress.json')


export const logFile = () => path.join(gpDir(), 'log.jsonl')

export const MAX_LOG = 500



/** Warm resume window after stop — Start within this to skip already-posted groups. */
export const GROUP_POSTER_PROGRESS_TTL_SEC = 10 * 60



export type GroupPosterProgress = {
  active: boolean
  postedCount: number
  postedIds: string[]
  remainingSec: number
  updatedAt?: string
  stoppedAt?: string | null
}



export type GroupPosterLogEntry = {
  at: string
  kind: 'info' | 'error' | string
  message: string
  profileId?: string
  profileName?: string
}



export const workerChildren = new Map<string, ChildProcess>()


export const workerChild = () => workerChildren.get(facebookAccountProfileId()) || null

export function writeWorkerLock(mode: string, pid: number, dataDir: string) {
  writeJsonRobust(workerLockFile(), {
    mode,
    pid,
    dataDir,
    startedAt: nowIso(),
  })
}



export function clearWorkerLock(pid?: number) {
  const cur = getWorkerLock()
  if (!cur) return
  if (pid && cur.pid !== pid) return
  try {
    fs.unlinkSync(workerLockFile())
  } catch {
    /* ignore */
  }
}



export function idleGroupPosterWorkerState() {
  writeJsonRobust(statusFile(), {
    status: 'idle',
    message: 'Idle',
    updatedAt: nowIso(),
  })
}



export function isGroupPosterLockMode(mode: string) {
  return mode === 'post' || mode === 'refresh-groups' || mode === 'join-groups' || mode === 'scan-buy-sell'
}



export function isGroupPosterWorkerRunning(): boolean {
  if (workerChild() && !workerChild()!.killed && workerChild()!.exitCode == null) return true
  const lock = getWorkerLock()
  return Boolean(lock && isGroupPosterLockMode(lock.mode))
}

export function nowIso() {
  return new Date().toISOString()
}



export function progressIsoAgeSec(ts: unknown): number | null {
  if (typeof ts !== 'string' || !ts.trim()) return null
  const ms = Date.parse(ts)
  if (!Number.isFinite(ms)) return null
  return Math.max(0, (Date.now() - ms) / 1000)
}



export function clearGroupPosterProgress(): void {
  try {
    if (fs.existsSync(progressFile())) fs.unlinkSync(progressFile())
  } catch {
    /* ignore */
  }
}



export function sealGroupPosterProgress(): void {
  try {
    const raw = readJson<Record<string, unknown>>(progressFile(), {})
    const idsRaw = raw.postedIds
    if (!Array.isArray(idsRaw) || !idsRaw.length) return
    const postedIds = idsRaw.map((x) => String(x || '').trim()).filter(Boolean)
    if (!postedIds.length) return
    writeJson(progressFile(), {
      v: 1,
      postedIds,
      updatedAt: nowIso(),
      stoppedAt: nowIso(),
    })
  } catch {
    /* ignore */
  }
}



export function getGroupPosterProgress(): GroupPosterProgress {
  const empty: GroupPosterProgress = {
    active: false,
    postedCount: 0,
    postedIds: [],
    remainingSec: 0,
  }
  try {
    const raw = readJson<Record<string, unknown>>(progressFile(), {})
    const idsRaw = raw.postedIds
    if (!Array.isArray(idsRaw) || !idsRaw.length) return empty
    const postedIds = [
      ...new Set(idsRaw.map((x) => String(x || '').trim()).filter(Boolean)),
    ]
    if (!postedIds.length) return empty

    const age =
      progressIsoAgeSec(raw.stoppedAt) ?? progressIsoAgeSec(raw.updatedAt)
    if (age != null && age > GROUP_POSTER_PROGRESS_TTL_SEC) {
      clearGroupPosterProgress()
      return empty
    }
    const remainingSec =
      age == null
        ? GROUP_POSTER_PROGRESS_TTL_SEC
        : Math.max(0, Math.floor(GROUP_POSTER_PROGRESS_TTL_SEC - age))
    return {
      active: remainingSec > 0,
      postedCount: postedIds.length,
      postedIds,
      remainingSec,
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
      stoppedAt:
        raw.stoppedAt === null || typeof raw.stoppedAt === 'string'
          ? (raw.stoppedAt as string | null)
          : undefined,
    }
  } catch {
    return empty
  }
}



export function getGroupPosterLog(limit = 80): GroupPosterLogEntry[] {
  ensureDir()
  if (!fs.existsSync(logFile())) return []
  try {
    const lines = readLastNonEmptyLines(logFile(), Math.min(MAX_LOG, Math.max(20, limit)))
    return lines
      .map((line) => {
        try {
          return JSON.parse(line) as GroupPosterLogEntry
        } catch {
          return { at: nowIso(), kind: 'info', message: line }
        }
      })
      .reverse()
  } catch {
    return []
  }
}



export function clearGroupPosterLog(): { ok: boolean; message: string } {
  ensureDir()
  fs.writeFileSync(logFile(), '', 'utf8')
  return { ok: true, message: 'Log cleared' }
}
