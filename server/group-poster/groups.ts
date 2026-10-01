/** Group list, blacklist and queue preview for the Facebook Group Poster. (Split out of group-poster.ts.) */

import path from 'node:path'
import { getGroupPosterSettings, gpDir, readJson, writeJson } from './settings.js'
import { nowIso } from './worker-state.js'


export const groupsFile = () => path.join(gpDir(), 'groups.json')


export const buySellBlacklistFile = () => path.join(gpDir(), 'buy_sell_blacklist.json')


export const groupBlacklistFile = () => path.join(gpDir(), 'group_blacklist.json')



export type FbGroup = {
  id: string
  name: string
  url: string
}



export type GroupBlacklistEntry = {
  id: string
  name: string
  reason: string
  removedAt?: string
}



export type GroupCapability = {
  id: string
  name: string
  capability: string
  evidence?: string
  checkedAt: string
}



export type GroupQueuePreview = {
  selected: number
  eligible: number
  excluded: number
  excludedByReason: Record<string, number>
  staleOrUnscanned: number
  scanRecommended: boolean
  eligibleIds: string[]
}



export function buildGroupQueuePreview(
  groups: FbGroup[],
  selectedGroupIds: string[],
  blacklist: GroupBlacklistEntry[],
  capabilities: Record<string, GroupCapability>,
  nowMs = Date.now(),
): GroupQueuePreview {
  const wanted = new Set(selectedGroupIds)
  const selected = wanted.size ? groups.filter((group) => wanted.has(group.id)) : groups.slice()
  const blocked = new Map(blacklist.map((entry) => [entry.id, entry.reason || 'blacklisted']))
  const excludedByReason: Record<string, number> = {}
  const eligibleIds: string[] = []
  let staleOrUnscanned = 0
  for (const group of selected) {
    const capability = capabilities[group.id]
    const checkedMs = capability ? Date.parse(capability.checkedAt) : Number.NaN
    const stale = !Number.isFinite(checkedMs) || nowMs - checkedMs > 7 * 24 * 60 * 60 * 1000
    if (stale) staleOrUnscanned += 1
    const recentCapability = !stale ? capability?.capability : undefined
    const reason = blocked.get(group.id) ||
      (recentCapability && ['buy_sell', 'admin_approval', 'not_member', 'wrong_redirect'].includes(recentCapability)
        ? recentCapability
        : '')
    if (reason) {
      excludedByReason[reason] = (excludedByReason[reason] || 0) + 1
    } else {
      eligibleIds.push(group.id)
    }
  }
  return {
    selected: selected.length,
    eligible: eligibleIds.length,
    excluded: selected.length - eligibleIds.length,
    excludedByReason,
    staleOrUnscanned,
    scanRecommended: staleOrUnscanned > 0,
    eligibleIds,
  }
}



export const GAME_BLOCK_NAME_RE =
  /fortnite|fort\s*nite|valorant|apex\s*legends|apexlegends|apex|warzone|cs:?\s*go|counter[\s-]?strike/i



export function isGameBlockedGroupName(name: string): boolean {
  return GAME_BLOCK_NAME_RE.test(name || '')
}



export function isGameBlockedGroup(id: string, name: string, url: string): boolean {
  return isGameBlockedGroupName(`${name} ${url} ${id}`)
}



export const LT_CHARS_RE = /[ąčęėįšųūž]/i


export const LT_WORD_RE =
  /\b(lietuv\w*|vilni\w*|kaun\w*|klaip[eė]d\w*|klaiped\w*|[šs]iaul\w*|panev[eė]ž\w*|panevez\w*|alyt\w*|marijampol\w*|grup[eė]|skelbim\w*|parduod\w*|perku|mainai|bendruomen\w*|mamyt\w*|t[eė]v\w*|vaik\w*|darb\w*|nuoma|butai|automobil\w*|pirk\w*|pardav\w*|lietuvoje|lietuvos|lietuvi[uų]\w*|lietuviai|šeim\w*|seim\w*|sveik\w*|svoris|svorio|motocikl\w*)\b/i


export const EN_PHRASE_RE =
  /\b(buy\s*(?:&|and)\s*sell|for\s+sale|for\s+free|free\s+stuff|official\s+group|fan\s+club|fan\s+page|community\s+group|discussion\s+group|only\s+for|welcome\s+to|marketplace|classifieds|buying\s+and\s+selling|buy\s+sell\s+trade|tips\s+and\s+tricks|help\s+and\s+support|jobs?\s+and\s+vacancies|real\s+estate|housing\s+market|car\s+sales|account\s+sellers?)\b/i


export const EN_WORDS = new Set([
  'the',
  'and',
  'for',
  'of',
  'to',
  'in',
  'on',
  'with',
  'from',
  'your',
  'our',
  'my',
  'group',
  'groups',
  'club',
  'clubs',
  'community',
  'communities',
  'official',
  'fans',
  'fan',
  'buy',
  'sell',
  'sale',
  'sales',
  'selling',
  'buying',
  'trade',
  'trading',
  'free',
  'stuff',
  'market',
  'marketplace',
  'classifieds',
  'discussion',
  'chat',
  'chats',
  'friends',
  'members',
  'member',
  'public',
  'private',
  'world',
  'global',
  'english',
  'international',
  'tips',
  'tricks',
  'help',
  'support',
  'news',
  'updates',
  'only',
  'best',
  'top',
  'new',
  'used',
  'cars',
  'car',
  'house',
  'houses',
  'home',
  'homes',
  'jobs',
  'job',
  'work',
  'business',
  'services',
  'service',
  'account',
  'accounts',
  'gaming',
  'game',
  'games',
  'players',
  'player',
  'team',
  'teams',
  'shop',
  'store',
  'deals',
  'deal',
  'offer',
  'offers',
  'welcome',
  'hello',
  'guys',
  'people',
  'everyone',
  'anyone',
  'here',
  'this',
  'that',
  'page',
  'pages',
  'post',
  'posts',
  'share',
  'sharing',
  'info',
  'information',
  'usa',
  'uk',
  'dubai',
  'london',
  'europe',
  'asia',
  'america',
  'canada',
  'australia',
  'india',
  'pakistan',
  'philippines',
  'nigeria',
  'weight',
  'loss',
  'fitness',
  'health',
  'crypto',
  'bitcoin',
  'forex',
  'investing',
  'investment',
  'money',
  'make',
  'earn',
  'online',
  'digital',
  'marketing',
  'advertising',
  'promo',
  'promotion',
  'reviews',
  'review',
  'sellers',
  'seller',
  'buyers',
  'buyer',
  'cheap',
  'discount',
  'discounts',
  'wholesale',
  'retail',
  'fashion',
  'beauty',
  'travel',
  'vacation',
  'holiday',
  'family',
  'moms',
  'dads',
  'parents',
  'kids',
  'women',
  'men',
  'dating',
  'singles',
  'meetup',
  'events',
  'event',
  'network',
  'networking',
  'entrepreneurs',
  'startup',
  'startups',
  'tech',
  'technology',
  'software',
  'hardware',
  'phones',
  'mobile',
  'laptop',
  'laptops',
  'pc',
])



export function isJunkGroupName(name: string): boolean {
  const low = (name || '').trim().toLowerCase()
  return (
    !low ||
    low.length < 2 ||
    [
      'view group',
      'see group',
      'group',
      'groups',
      'join',
      'joined',
      'visit group',
    ].includes(low)
  )
}



export function isObviousEnglishGroupName(name: string): boolean {
  const raw = (name || '').trim().replace(/\s+/g, ' ')
  if (raw.length < 4 || isJunkGroupName(raw)) return false
  if (!/\s|-|_/.test(raw) && /^[a-z0-9]+$/i.test(raw) && raw.length < 28) {
    if (!EN_PHRASE_RE.test(raw)) return false
  }
  if (LT_CHARS_RE.test(raw) || LT_WORD_RE.test(raw)) return false
  if (EN_PHRASE_RE.test(raw)) return true
  const words = (raw.match(/[A-Za-z]+/g) || []).map((w) => w.toLowerCase()).filter((w) => w.length >= 2)
  if (words.length < 2) return false
  const enHits = words.filter((w) => EN_WORDS.has(w)).length
  const ratio = enHits / words.length
  if (enHits >= 2 && ratio >= 0.65) return true
  if (enHits >= 3 && ratio >= 0.5) return true
  return false
}



export const CYRILLIC_RE = /[\u0400-\u04FF]/



export function isObviousRussianGroupName(name: string): boolean {
  const raw = (name || '').trim()
  if (!raw || isJunkGroupName(raw)) return false
  return CYRILLIC_RE.test(raw)
}



export function persistGroupBlacklist(entries: GroupBlacklistEntry[]) {
  writeJson(
    groupBlacklistFile(),
    entries.map((g) => ({
      id: g.id,
      name: g.name,
      reason: g.reason,
      removedAt: g.removedAt || nowIso(),
    })),
  )
  writeJson(
    buySellBlacklistFile(),
    entries
      .filter((g) => g.reason === 'buy_sell')
      .map((g) => ({ id: g.id, name: g.name, removedAt: g.removedAt || '' })),
  )
}



export function getGroups(): FbGroup[] {
  const preserve = getGroupPosterSettings().preserveExistingBlacklist
  const blocked = new Set(getGroupBlacklist().map((g) => g.id))
  const bl = getGroupBlacklist()
  const byId = new Map(bl.map((g) => [g.id, g]))
  let blChanged = false
  let groupsChanged = false

  const raw = readJson<unknown>(groupsFile(), [])
  if (!Array.isArray(raw)) return []

  const keptRaw: unknown[] = []
  const out: FbGroup[] = []

  for (const g of raw) {
    if (!g || typeof g !== 'object') continue
    const o = g as Record<string, unknown>
    const id = typeof o.id === 'string' ? o.id : ''
    if (!id) continue
    const name = typeof o.name === 'string' ? o.name : id
    const url = typeof o.url === 'string' ? o.url : `https://www.facebook.com/groups/${id}`

    if (blocked.has(id)) {
      groupsChanged = true
      continue
    }

    if (!preserve) {
      const gameHit = isGameBlockedGroup(id, name, url)
      const englishHit = isObviousEnglishGroupName(name)
      const russianHit = isObviousRussianGroupName(name)
      if (gameHit || englishHit || russianHit) {
        const reason = gameHit
          ? 'game_block'
          : englishHit
            ? 'english'
            : 'russian'
        if (!byId.has(id)) {
          byId.set(id, {
            id,
            name,
            reason,
            removedAt: nowIso(),
          })
          blChanged = true
        } else {
          const prev = byId.get(id)!
          if (prev.reason !== reason) {
            prev.reason = reason
            prev.name = name
            blChanged = true
          }
        }
        groupsChanged = true
        continue
      }
    }

    keptRaw.push(g)
    out.push({ id, name, url })
  }

  if (blChanged) persistGroupBlacklist([...byId.values()])
  if (groupsChanged) writeJson(groupsFile(), keptRaw)
  return out
}



export function normalizeBlacklistItem(item: unknown, fallbackReason = 'buy_sell'): GroupBlacklistEntry | null {
  if (typeof item === 'string' && item.trim()) {
    return { id: item.trim(), name: item.trim(), reason: fallbackReason, removedAt: '' }
  }
  if (!item || typeof item !== 'object') return null
  const o = item as Record<string, unknown>
  const id = typeof o.id === 'string' ? o.id.trim() : ''
  if (!id) return null
  return {
    id,
    name: typeof o.name === 'string' && o.name.trim() ? o.name.trim() : id,
    reason:
      typeof o.reason === 'string' && o.reason.trim() ? o.reason.trim() : fallbackReason,
    removedAt: typeof o.removedAt === 'string' ? o.removedAt : '',
  }
}



export function getGroupBlacklist(): GroupBlacklistEntry[] {
  const byId = new Map<string, GroupBlacklistEntry>()

  const ingest = (raw: unknown, fallbackReason: string) => {
    if (!Array.isArray(raw)) return
    for (const item of raw) {
      const norm = normalizeBlacklistItem(item, fallbackReason)
      if (!norm) continue
      const prev = byId.get(norm.id)
      if (prev?.reason === 'admin_approval' && norm.reason !== 'admin_approval') continue
      byId.set(norm.id, norm)
    }
  }

  try {
    ingest(readJson<unknown>(groupBlacklistFile(), []), 'buy_sell')
  } catch {
    /* ignore */
  }
  try {
    ingest(readJson<unknown>(buySellBlacklistFile(), []), 'buy_sell')
  } catch {
    /* ignore */
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
}
