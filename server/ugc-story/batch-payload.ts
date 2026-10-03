/** Parsing of batched model JSON into slide rows, plus chunk repair planning. (Split out of ugc-story-engine.ts.) */

import { coerceSlidesArray, extractJsonObject } from '../json-extract.js'
import {
    stripEnglishCopyLabels
} from '../ugc-copy-skill.js'
import { stripProductIdTags } from '../ugc-lt/normalize-copy.js'

export type StoryBatchItem = { role: string; text: string; title: string; cta: string }

export type StoryBatchItems = StoryBatchItem[] & {
  truncated: boolean
  requestedCount: number
  parsedCount: number
  emptyRows: Array<{ localRow: number; globalSlide: number; role: string; message: string }>
  resultType: 'OK' | 'TRUNCATED_RESPONSE' | 'EMPTY_ROW'
}

export function parseStoryBatchPayload(
  raw: unknown,
  roles: string[],
  chunkStart = 1,
): StoryBatchItems {
  let data = raw
  if (typeof raw === 'string') data = extractJsonObject(raw)
  if (!data || typeof data !== 'object') throw new Error('Invalid JSON response')
  const items = coerceSlidesArray(data)
  if (!items) {
    const keys =
      data && typeof data === 'object' && !Array.isArray(data)
        ? Object.keys(data as object).slice(0, 12).join(',')
        : typeof data
    throw new Error(`JSON must include a "slides" array (got keys: ${keys || 'none'})`)
  }
  let slideRows: unknown[] = items
  if (slideRows.length !== roles.length) {
    if (roles.length === 1 && slideRows.length >= 1) {
      slideRows = [slideRows[0]]
    } else if (slideRows.length > roles.length) {
      slideRows = slideRows.slice(0, roles.length)
    } else if (slideRows.length >= 1) {
      // Truncated JSON — keep what we got; caller requests the rest next
      slideRows = slideRows.slice(0, slideRows.length)
    } else {
      throw new Error(`Expected ${roles.length} slides, got ${slideRows.length}`)
    }
  }
  const out = [] as unknown as StoryBatchItems
  const emptyRows: StoryBatchItems['emptyRows'] = []
  for (let i = 0; i < slideRows.length; i++) {
    const row = slideRows[i]
    if (!row || typeof row !== 'object') throw new Error(`Chunk starting @${chunkStart}: global slide ${chunkStart + i} (${roles[i] || 'build'}), local row ${i + 1} invalid`)
    const v = row as Record<string, unknown>
    const role = String(v.role || roles[i]).trim() || roles[i]
    let text = normalizeSlideTextValue(v.text)
    if (!text) {
      const title = String(v.title ?? '').trim()
      const body = normalizeSlideTextValue(v.body)
      text = [title, body].filter(Boolean).join('\n')
    }
    if (!text) {
      emptyRows.push({
        localRow: i + 1,
        globalSlide: chunkStart + i,
        role,
        message: `Chunk starting @${chunkStart}: global slide ${chunkStart + i} (${role}), local row ${i + 1} has no text`,
      })
      break
    }
    out.push({
      role,
      text,
      title: String(v.title ?? '').trim(),
      cta: String(v.cta ?? '').trim(),
    })
  }
  out.requestedCount = roles.length
  out.parsedCount = out.length
  out.emptyRows = emptyRows
  out.truncated = out.length < roles.length
  out.resultType = emptyRows.length ? 'EMPTY_ROW' : out.truncated ? 'TRUNCATED_RESPONSE' : 'OK'
  return out
}

export type ChunkRoleOutcome = { ok: boolean; role: string; reason?: string }

/** Accepted story progress is the contiguous OK prefix. A later OK row cannot skip a rejected role. */
export function planChunkRepair(opts: {
  requestedRoles: string[]
  outcomes: ChunkRoleOutcome[]
}): {
  advanceCount: number
  repair: 'none' | 'single' | 'suffix' | 'full'
  repairRoles: string[]
  rejectedRole: string | null
} {
  let advance = 0
  for (const row of opts.outcomes) {
    if (!row.ok) break
    advance += 1
  }
  const rejected = opts.outcomes[advance]
  if (!rejected) {
    const rest = opts.requestedRoles.slice(advance)
    return {
      advanceCount: advance,
      repair: rest.length ? 'suffix' : 'none',
      repairRoles: rest,
      rejectedRole: null,
    }
  }
  const after = opts.outcomes.slice(advance + 1)
  const singleGap = after.length > 0 && after.every((row) => row.ok) && opts.outcomes.length === opts.requestedRoles.length
  if (advance === 0 && rejected.role === 'hook') {
    return { advanceCount: 0, repair: 'full', repairRoles: opts.requestedRoles, rejectedRole: rejected.role }
  }
  if (singleGap && rejected.role !== 'hook') {
    return { advanceCount: advance, repair: 'single', repairRoles: [rejected.role], rejectedRole: rejected.role }
  }
  return {
    advanceCount: advance,
    repair: 'suffix',
    repairRoles: opts.requestedRoles.slice(advance),
    rejectedRole: rejected.role,
  }
}

export const DEICTIC_SUFFIX_RE = /šit(?:a|as|ą|o)\s+(?:dovan|daikt)|ši\s+dovan|šis\s+daikt/iu

/** A later valid row can be held while the hole is repaired, unless it points at that hole. */
export function holdPendingSuffix(outcomes: Array<{ ok: boolean; role: string; text?: string }>): {
  prefixCount: number
  repairRoles: string[]
  pending: Array<{ index: number; role: string; text: string }>
} {
  const hole = outcomes.findIndex((row) => !row.ok)
  if (hole < 0) return { prefixCount: outcomes.length, repairRoles: [], pending: [] }
  const pending = outcomes.slice(hole + 1).flatMap((row, offset) => {
    if (!row.ok) return []
    const text = row.text || ''
    if (DEICTIC_SUFFIX_RE.test(text)) return []
    return [{ index: hole + 1 + offset, role: row.role, text }]
  })
  return {
    prefixCount: hole,
    repairRoles: [outcomes[hole].role],
    pending,
  }
}

export function normalizeSlideTextValue(value: unknown): string {
  if (Array.isArray(value)) {
    return stripEnglishCopyLabels(
      value
        .map((x) => stripProductIdTags(String(x)).replace(/\*\*/g, '').trim())
        .filter(Boolean)
        .join(' '),
    )
  }
  return stripEnglishCopyLabels(stripProductIdTags(String(value ?? '')).replace(/\*\*/g, '').trim())
}
