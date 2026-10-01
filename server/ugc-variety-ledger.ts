/**
 * Cross-post variety ledger — remembers what recent posts already said so the next
 * post cannot recycle the same opener, lead noun, or seasonal filler.
 */

import fs from 'node:fs'
import path from 'node:path'

const LEDGER_ROOT = process.env.UGC_VISION_ROOT?.trim() || 'D:\\ugc-batch-vision'
const LEDGER_PATH = path.join(LEDGER_ROOT, 'variety-ledger.json')

/** How many recent posts stay in the banned set. */
export const UGC_VARIETY_WINDOW = 12

/** Cross-post slide-body dedup — covers full fallback pool cycle + gap buffer. */
export const UGC_BODY_REPEAT_WINDOW = 16

export type UgcVarietyEntry = {
  at: string
  theme: string
  hookTitle: string
  leadPhrases: string[]
  keyNouns: string[]
  slideBodies: string[]
}

type Ledger = { entries: UgcVarietyEntry[] }

const LT_STOP = new Set([
  'kad', 'bet', 'nes', 'jau', 'dar', 'tik', 'kaip', 'kai', 'tavo', 'tau', 'tave', 'turi',
  'būti', 'bus', 'gali', 'labai', 'daug', 'mažai', 'vis', 'per', 'nuo', 'iki', 'apie', 'kas',
  'kur', 'kodėl', 'jei', 'tada', 'ten', 'čia', 'todėl', 'savo', 'toks', 'tokia', 'visai',
  'nori', 'jauti', 'esi', 'yra', 'tai', 'kiekvien', 'lieka', 'tampa',
])

function normToken(word: string): string {
  const base = word.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  if (base.length < 5 || LT_STOP.has(base)) return ''
  return base.slice(0, Math.max(4, base.length - 2))
}

function readLedger(): Ledger {
  try {
    if (!fs.existsSync(LEDGER_PATH)) return { entries: [] }
    const parsed = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8')) as Ledger
    return Array.isArray(parsed?.entries) ? parsed : { entries: [] }
  } catch {
    return { entries: [] }
  }
}

function writeLedger(ledger: Ledger) {
  try {
    fs.mkdirSync(LEDGER_ROOT, { recursive: true })
    fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2) + '\n', 'utf8')
  } catch {
    // ledger is an optimisation, never break generation for it
  }
}

/** First 3–5 content words of a sentence — the shape that makes posts feel identical. */
export function leadPhraseOf(text: string): string {
  const words = String(text || '')
    .replace(/[^\p{L}\s]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  return words.slice(0, 4).join(' ').toLowerCase()
}

export function keyNounsOf(text: string): string[] {
  const out = new Set<string>()
  for (const word of String(text || '').replace(/[^\p{L}\s]/gu, ' ').split(/\s+/)) {
    const token = normToken(word)
    if (token) out.add(token)
  }
  return [...out]
}

function normBodyKey(body: string): string {
  return String(body || '')
    .replace(/[^\p{L}\s]/gu, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

export function getUgcVarietyEntries(limit = UGC_VARIETY_WINDOW): UgcVarietyEntry[] {
  return readLedger().entries.slice(-limit)
}

export function getRecentSlideBodyKeys(limit = UGC_BODY_REPEAT_WINDOW): string[] {
  const keys: string[] = []
  for (const entry of readLedger().entries.slice(-limit)) {
    for (const body of entry.slideBodies || []) {
      const key = normBodyKey(body)
      if (key) keys.push(key)
    }
  }
  return keys
}

function sentenceKeysOf(text: string): string[] {
  return String(text || '')
    .split(/(?<=[.!?…])\s+/)
    .map((s) => normBodyKey(s))
    .filter((key) => key.split(' ').length >= 4)
}

/** Sentence key → posts-ago of last use (0 = most recent post). */
export function getRecentSentenceAges(limit = UGC_BODY_REPEAT_WINDOW): Map<string, number> {
  const ages = new Map<string, number>()
  const entries = readLedger().entries.slice(-limit)
  for (let i = entries.length - 1; i >= 0; i--) {
    const age = entries.length - 1 - i
    for (const body of entries[i].slideBodies || []) {
      for (const key of sentenceKeysOf(body)) {
        if (!ages.has(key)) ages.set(key, age)
      }
    }
  }
  return ages
}

/** Posts-ago a sentence last shipped, or null if not in the window. */
export function recentSentenceAge(sentence: string, limit = UGC_BODY_REPEAT_WINDOW): number | null {
  const key = normBodyKey(sentence)
  if (!key) return null
  const age = getRecentSentenceAges(limit).get(key)
  return age === undefined ? null : age
}

/**
 * Order fallback candidates so unused lines come first, then the least recently shipped.
 * Every sentence of a multi-sentence candidate counts; the freshest sentence decides.
 */
export function rankByLedgerFreshness(candidates: string[], limit = UGC_BODY_REPEAT_WINDOW): string[] {
  const ages = getRecentSentenceAges(limit)
  const score = (candidate: string) => {
    const keys = sentenceKeysOf(candidate)
    if (!keys.length) return Number.MAX_SAFE_INTEGER
    let freshest = Number.MAX_SAFE_INTEGER
    for (const key of keys) {
      const age = ages.get(key)
      if (age !== undefined && age < freshest) freshest = age
    }
    return freshest
  }
  return candidates
    .map((candidate, index) => ({ candidate, index, score: score(candidate) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((row) => row.candidate)
}

/** True when this body text matches a recent shipped slide body (exact normalized match). */
export function isRepeatOfRecentSlideBody(body: string, limit = UGC_BODY_REPEAT_WINDOW): boolean {
  const key = normBodyKey(body)
  if (!key || key.length < 24) return false
  return getRecentSlideBodyKeys(limit).includes(key)
}

/** Prompt block listing openers recent posts already used. */
export function buildUgcVarietyBanBlock(limit = 6): string {
  const entries = getUgcVarietyEntries(limit)
  if (!entries.length) return ''
  const hooks = entries
    .map((e) => e.hookTitle)
    .filter(Boolean)
    .slice(-limit)
  if (!hooks.length) return ''
  return `\nKITI ĮRAŠAI JAU NAUDOJO ŠIUOS KABLIUKUS — sugalvok visiškai kitokį kampą ir kitokią pirmą frazę:\n${hooks
    .map((h) => `- ${h}`)
    .join('\n')}`
}

/** True when this hook repeats a recent post's opener or leans on the same nouns. */
export function isRepeatOfRecentPost(hookTitle: string, bodyText = ''): boolean {
  const lead = leadPhraseOf(hookTitle)
  if (!lead) return false
  const nouns = new Set(keyNounsOf(`${hookTitle} ${bodyText}`))

  for (const entry of getUgcVarietyEntries()) {
    if (entry.leadPhrases.includes(lead)) return true
    if (!nouns.size || !entry.keyNouns.length) continue
    let shared = 0
    for (const noun of entry.keyNouns) if (nouns.has(noun)) shared++
    if (shared / Math.min(nouns.size, entry.keyNouns.length) >= 0.7) return true
  }
  return false
}

export function recordUgcVarietyEntry(entry: {
  theme: string
  hookTitle: string
  slideTexts: string[]
  slideBodies?: string[]
}) {
  const ledger = readLedger()
  const leadPhrases = [entry.hookTitle, ...entry.slideTexts]
    .map(leadPhraseOf)
    .filter(Boolean)
  const slideBodies =
    entry.slideBodies?.filter(Boolean) ||
    entry.slideTexts
      .map((text) => text.split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter(Boolean).join(' '))
      .filter(Boolean)
  ledger.entries.push({
    at: new Date().toISOString(),
    theme: entry.theme,
    hookTitle: entry.hookTitle,
    leadPhrases,
    keyNouns: keyNounsOf([entry.hookTitle, ...entry.slideTexts].join(' ')),
    slideBodies,
  })
  ledger.entries = ledger.entries.slice(-UGC_VARIETY_WINDOW * 3)
  writeLedger(ledger)
}

export function resetUgcVarietyLedger() {
  writeLedger({ entries: [] })
}
