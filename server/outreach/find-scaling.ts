import type { OutreachSettings } from './types.js'
import { defaultSettings } from './settings.js'
import { getRemainingQuota } from './quota.js'

const SMALL_SEND_THRESHOLD = 25
const LARGE_SEND_THRESHOLD = 60

/** Pass UI cap strings through unchanged (0 = unlimited where supported). */
export function findCapString(raw: string | undefined, fallback: string): string {
  const text = String(raw ?? fallback).trim()
  if (!text) return fallback
  const n = Number(text)
  if (!Number.isFinite(n) || n < 0) return fallback
  return String(Math.floor(n))
}

/** Raw emails to find so enough survive clean for the send quota. */
export function inflateFindTargetForCleanDrops(sendsNeeded: number, dailyCap: number): number {
  if (sendsNeeded <= 0) return 0
  const ratio =
    sendsNeeded <= 5
      ? 1.15
      : sendsNeeded <= SMALL_SEND_THRESHOLD
        ? 1.25
        : sendsNeeded <= LARGE_SEND_THRESHOLD
          ? 1.4
          : sendsNeeded <= 100
            ? 1.55
            : 1.75
  const inflated = Math.ceil(sendsNeeded * ratio)
  // Find budget may exceed send cap — clean drops a large share on strict profiles.
  const ceiling = Math.max(dailyCap, Math.ceil(dailyCap * 1.75))
  return Math.min(ceiling, inflated)
}

/** User-facing lead goal. Internal clean-drop buffering must never leak into this value. */
export function configuredFindLeadTarget(settings: OutreachSettings): number {
  const rawTarget = Number(settings.find.leadTarget)
  return Number.isFinite(rawTarget) && rawTarget > 0
    ? Math.floor(rawTarget)
    : Number(defaultSettings().find.leadTarget)
}

/** How many raw emails this find wave should aim for (quota-aware, clean-adjusted). */
export function effectiveFindLeadTarget(settings: OutreachSettings): number {
  return configuredFindLeadTarget(settings)
}

/** Sends still needed today (before clean-drop inflation). */
export function effectiveSendsNeeded(settings: OutreachSettings): number {
  const uiTarget = configuredFindLeadTarget(settings)
  const q = getRemainingQuota(settings.send.dailyCap, settings)
  return q.remaining > 0 ? Math.min(uiTarget, q.remaining) : uiTarget
}

/**
 * Scale discovery/scrape caps with send need:
 * - small runs: shrink (don't crawl 100+ URLs for 2 sends)
 * - large runs: use a broad crawl with a small focused query set
 */
export function scaleFindCapsForTarget(
  leadTarget: number,
  settings: OutreachSettings,
): { maxPages: string; maxUrls: string; maxQueries: string; scaled: boolean; mode: 'down' | 'up' | 'none' } {
  const base = defaultSettings().find
  const uiPages = Number(findCapString(settings.find.maxPages, base.maxPages))
  const uiUrls = Number(findCapString(settings.find.maxUrls, base.maxUrls))
  const uiQueries = Number(findCapString(settings.find.maxQueries, base.maxQueries))
  const sendsNeeded = effectiveSendsNeeded(settings)

  if (leadTarget <= 0) {
    return {
      maxPages: findCapString(settings.find.maxPages, base.maxPages),
      maxUrls: findCapString(settings.find.maxUrls, base.maxUrls),
      maxQueries: findCapString(settings.find.maxQueries, base.maxQueries),
      scaled: false,
      mode: 'none',
    }
  }

  if (sendsNeeded > 0 && sendsNeeded <= SMALL_SEND_THRESHOLD) {
    const scaledPages = Math.min(uiPages, Math.max(12, Math.ceil(leadTarget * 6)))
    const scaledUrls = Math.min(uiUrls, Math.max(10, Math.ceil(leadTarget * 5)))
    const scaledQueries = Math.min(uiQueries, Math.max(6, Math.ceil(leadTarget * 2)))
    const scaled = scaledPages < uiPages || scaledUrls < uiUrls || scaledQueries < uiQueries
    return {
      maxPages: String(scaledPages),
      maxUrls: String(scaledUrls),
      maxQueries: String(scaledQueries),
      scaled,
      mode: scaled ? 'down' : 'none',
    }
  }

  if (sendsNeeded >= LARGE_SEND_THRESHOLD) {
    // Zero is the explicit uncapped setting. Do not turn it back into a small
    // fast-mode cap: a large run must keep discovering until its target is met.
    const scaledPages = uiPages === 0 ? 0 : Math.max(uiPages, Math.ceil(leadTarget * 0.9))
    const scaledUrls = uiUrls === 0 ? 0 : uiUrls
    const scaledQueries = uiQueries === 0 ? 0 : uiQueries
    const scaled = scaledPages !== uiPages || scaledUrls !== uiUrls || scaledQueries !== uiQueries
    return {
      maxPages: String(scaledPages),
      maxUrls: String(scaledUrls),
      maxQueries: String(scaledQueries),
      scaled,
      mode: scaled ? 'up' : 'none',
    }
  }

  return {
    maxPages: findCapString(settings.find.maxPages, base.maxPages),
    maxUrls: findCapString(settings.find.maxUrls, base.maxUrls),
    maxQueries: findCapString(settings.find.maxQueries, base.maxQueries),
    scaled: false,
    mode: 'none',
  }
}

export function scaledFindMaxRounds(_leadTarget: number, settings: OutreachSettings): number {
  const target = Math.max(1, configuredFindLeadTarget(settings))
  return Math.max(4, Math.ceil(target / 50))
}
