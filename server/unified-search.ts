import fs from 'node:fs'
import { listAutomationFailures } from './automation-failures.js'
import { getNotes } from './notes.js'
import { getPipeline } from './pipeline.js'
import { getOutreachState } from './outreach.js'
import { getSeoBlogState } from './seoBlog.js'
import { currentProfileDataDir } from './business-profiles.js'

export type UnifiedSearchKind =
  | 'note'
  | 'contact'
  | 'lead'
  | 'draft'
  | 'run'
  | 'error'
  | 'file'
  | 'campaign'

export type UnifiedSearchHit = {
  id: string
  kind: UnifiedSearchKind
  title: string
  subtitle: string
  module: string
  href?: string
}

function match(q: string, ...parts: (string | undefined)[]): boolean {
  const needle = q.toLowerCase()
  return parts.some((p) => (p || '').toLowerCase().includes(needle))
}

function push(
  out: UnifiedSearchHit[],
  hit: UnifiedSearchHit,
  limit: number,
) {
  if (out.length >= limit) return
  out.push(hit)
}

export function unifiedSearch(query: string, limit = 24): UnifiedSearchHit[] {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []

  const out: UnifiedSearchHit[] = []
  const cap = Math.max(4, Math.min(limit, 40))

  for (const note of getNotes().notes) {
    if (!match(q, note.title, note.body, note.tags?.join(' '))) continue
    push(out, {
      id: note.id,
      kind: 'note',
      title: note.title || 'Untitled note',
      subtitle: note.tags?.length ? note.tags.join(', ') : 'Note',
      module: 'notes',
    }, cap)
  }

  for (const c of getPipeline().contacts) {
    if (!match(q, c.email, c.name, c.source, c.action, c.tags?.join(' '))) continue
    push(out, {
      id: c.id,
      kind: 'contact',
      title: c.name || c.email,
      subtitle: `${c.email} · ${c.stage}`,
      module: 'pipeline',
    }, cap)
  }

  try {
    const seo = getSeoBlogState()
    for (const d of seo.drafts || []) {
      if (!match(q, d.slug, d.title, d.h1, d.metaDescription)) continue
      push(out, {
        id: d.slug,
        kind: 'draft',
        title: d.title || d.slug,
        subtitle: `SEO draft · ${d.slug}`,
        module: 'seo-blog',
      }, cap)
    }
    const run = seo.run
    if (run && match(q, run.status, run.message, run.stage, run.error || '', 'seo blog run')) {
      push(out, {
        id: 'seo-blog-run',
        kind: 'run',
        title: `SEO Blog run — ${run.status}`,
        subtitle: run.message || run.stage || 'Pipeline run',
        module: 'seo-blog',
      }, cap)
    }
  } catch {
    /* seo paths optional */
  }

  try {
    const outreach = getOutreachState({ light: true })
    const run = outreach.run
    if (run && match(q, run.status, run.message, run.stage, 'outreach')) {
      push(out, {
        id: 'outreach-run',
        kind: 'run',
        title: `Outreach — ${run.status}`,
        subtitle: run.message || run.stage || 'Campaign run',
        module: 'outreach',
      }, cap)
    }
    for (const c of run?.candidates || []) {
      if (!match(q, c.email, c.reason, c.decision)) continue
      push(out, {
        id: c.email,
        kind: 'lead',
        title: c.email,
        subtitle: [c.decision, c.reason].filter(Boolean).join(' · ') || 'Outreach lead',
        module: 'outreach',
      }, cap)
    }
  } catch {
    /* outreach optional */
  }

  for (const f of listAutomationFailures(40)) {
    if (!match(q, f.name, f.module, 'error failure screenshot')) continue
    push(out, {
      id: f.id,
      kind: 'error',
      title: f.name,
      subtitle: `${f.module} failure`,
      module: 'logs',
    }, cap)
  }

  const profileDir = currentProfileDataDir()
  if (fs.existsSync(profileDir)) {
    for (const name of fs.readdirSync(profileDir).slice(0, 80)) {
      if (!match(q, name)) continue
      if (!/\.(json|jsonl|log|txt|html)$/i.test(name)) continue
      push(out, {
        id: `file:${name}`,
        kind: 'file',
        title: name,
        subtitle: 'Control Center data file',
        module: 'home',
      }, cap)
    }
  }

  return out.slice(0, cap)
}
