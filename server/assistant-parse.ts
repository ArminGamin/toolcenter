import type { AssistantAction, AssistantParseResult } from './assistant-actions.js'

type ToolRef = { id: string; name: string }

type HubCtx = {
  followUpsDue?: number
  failures?: number
  modules?: { id: string; label: string; status: string }[]
}

const FILLER_RE =
  /\b(?:rn|right\s+now|asap|please|pls|plz|just|maybe|kinda|kind\s+of|um+|uh+|ok(?:ay)?|toolsai|control\s+center|for\s+me|real\s+quick|quickly|tbh|ngl|lol|tho|thx|ty|gonna|gotta|wanna|literally|actually|basically|super|atm|btw|imo|prolly|probably|like|sorta|sort\s+of)\b/gi

const START_VERBS =
  /\b(?:start|run|launch|kick\s*off|fire\s+up|begin|trigger|execute|boot|spin\s+up|hit|crank|queue|handle|tackle|work\s+on|turn\s+on|activate|enable|pop\s+off|get\s+(?:on|going)|go\s+ahead(?:\s+and)?|do|get)\b/i

const SEND_VERBS = /\b(?:send|dispatch|blast|shoot|push|fire|deliver|mail)\b/i
const PAUSE_VERBS = /\b(?:pause|hold|freeze|halt|suspend)\b/i
const RESUME_VERBS = /\b(?:resume|unpause|continue|restart|unfreeze)\b/i
const OPEN_VERBS = /\b(?:open|show|go\s+to|switch\s+to|pull\s+up|take\s+me\s+to|view|see|check|peek\s+at|look\s+at)\b/i
const FIND_VERBS = /\b(?:find|search|scrape|hunt|look\s+for|gather|collect|pull)\b/i
const STOP_VERBS = /\b(?:stop|kill|shut\s+down|end|quit)\b/i

/** Maps vague slang → canonical tokens the rest of the parser understands. */
const ALIAS_REPLACEMENTS: [RegExp, string][] = [
  // Outreach
  [/\bcold\s*emails?\b/gi, 'outreach'],
  [/\boutbound\b/gi, 'outreach'],
  [/\bemail\s*campaigns?\b/gi, 'outreach'],
  [/\bprospecting\b/gi, 'outreach find'],
  [/\blead\s*gen\b/gi, 'outreach find'],
  [/\bfind\s+(?:some\s+)?leads?\b/gi, 'outreach find'],
  [/\bhunt\s+leads?\b/gi, 'outreach find'],
  [/\bget\s+emails?\s+going\b/gi, 'send outreach'],
  [/\bemails?\s+going\b/gi, 'send outreach'],
  [/\bblast\s+emails?\b/gi, 'send outreach'],
  [/\bmail\s+(?:the\s+)?list\b/gi, 'send outreach'],
  // Reddit
  [/\bsubreddit\b/gi, 'reddit'],
  [/\bkarma\s+farm(?:ing)?\b/gi, 'reddit'],
  [/\breddit\s+comments?\b/gi, 'reddit'],
  [/\bcomment\s+on\s+reddit\b/gi, 'start reddit'],
  [/\bhit\s+reddit\b/gi, 'start reddit'],
  // Blog / SEO
  [/\bseo\b/gi, 'seo blog'],
  [/\bwrite\s+(?:some\s+)?(?:blog\s+)?posts?\b/gi, 'start seo blog'],
  [/\bpublish\s+(?:blog\s+)?articles?\b/gi, 'start seo blog'],
  [/\bcontent\s+machine\b/gi, 'seo blog'],
  [/\bnew\s+articles?\b/gi, 'start seo blog'],
  // Groups
  [/\bfb\s+groups?\b/gi, 'group poster'],
  [/\bfacebook\s+groups?\b/gi, 'group poster'],
  [/\bpost\s+to\s+groups?\b/gi, 'start group poster'],
  [/\bgroup\s+posting\b/gi, 'group poster'],
  // Friend DMs
  [/\binbox\b/gi, 'friend dms'],
  [/\bmessage\s+friends?\b/gi, 'start friend dms'],
  [/\bdm\s+friends?\b/gi, 'start friend dms'],
  [/\bfriend\s+messages?\b/gi, 'friend dms'],
  // UGC
  [/\btiktoks?\b/gi, 'ugc slides'],
  [/\breels?\b/gi, 'ugc slides'],
  [/\bcarousel\b/gi, 'ugc slides'],
  [/\bslideshow\b/gi, 'ugc slides'],
  [/\bshort[\s-]?form\s+content\b/gi, 'ugc slides'],
  [/\bsocial\s+slides?\b/gi, 'ugc slides'],
  [/\bmake\s+content\s+about\b/gi, 'generate slides about'],
  [/\bcontent\s+about\b/gi, 'slides about'],
  // Markets
  [/\btickers?\b/gi, 'markets'],
  [/\bquotes?\b/gi, 'markets'],
  [/\btrading\s+desk\b/gi, 'markets'],
  [/\bcrypto\s+desk\b/gi, 'markets'],
  [/\bstock\s+desk\b/gi, 'markets'],
  // Pipeline
  [/\bcrm\b/gi, 'pipeline'],
  [/\bfollow[\s-]?ups?\b/gi, 'pipeline'],
  [/\bpromo\s+pipeline\b/gi, 'pipeline'],
  [/\bcontacts?\s+list\b/gi, 'pipeline'],
  // Notes
  [/\bnotepad\b/gi, 'notes'],
  [/\bscratchpad\b/gi, 'notes'],
  [/\bmemo\b/gi, 'note'],
  // Backup / status / failures
  [/\bsnapshot\b/gi, 'backup'],
  [/\bsave\s+everything\b/gi, 'backup'],
  [/\bzip\s+it\b/gi, 'backup'],
  [/\bwhat\s+broke\b/gi, 'failures'],
  [/\bwhat\s+failed\b/gi, 'failures'],
  [/\bwhat\s+went\s+wrong\b/gi, 'failures'],
  [/\bbroken\s+stuff\b/gi, 'failures'],
  [/\bscreenshots?\b/gi, 'failures'],
  [/\bautomation\s+errors?\b/gi, 'failures'],
  [/\bapi\s+keys?\b/gi, 'vault'],
  [/\bcredentials?\b/gi, 'vault'],
  [/\bpasswords?\b/gi, 'vault'],
  [/\btokens?\b/gi, 'vault'],
  [/\bwhat(?:'s| is)\s+(?:up|running|going\s+on)\b/gi, 'status'],
  [/\banything\s+running\b/gi, 'status'],
  [/\bcheck\s+in\b/gi, 'status'],
  [/\bdashboard\b/gi, 'status'],
  // Video
  [/\bvideo\s+creator\b/gi, 'video creator'],
  [/\bmake\s+videos?\b/gi, 'launch video creator'],
]

function norm(s: string): string {
  return s
    .trim()
    .replace(/[“”]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[!?.]+$/g, '')
    .replace(/\s+/g, ' ')
}

/** Strip casual filler so “start outreach rn pls” → “start outreach”. */
export function normalizePrompt(raw: string): string {
  let q = norm(raw).toLowerCase()
  q = q.replace(/\bcan\s+(?:you|u)\b/g, '')
  q = q.replace(/\bcould\s+(?:you|u)\b/g, '')
  q = q.replace(/\bwould\s+(?:you|u)\b/g, '')
  q = q.replace(/\bwill\s+(?:you|u)\b/g, '')
  q = q.replace(/\bi\s+(?:want|need|wanna|would\s+like|should|gotta|gonna)\s+(?:to\s+)?/g, '')
  q = q.replace(/\bwe\s+(?:should|need\s+to|gotta|gonna)\s+/g, '')
  q = q.replace(/\blet'?s\b/g, '')
  q = q.replace(/\btime\s+to\b/g, 'start')
  q = q.replace(/\bdo\s+the\s+/g, 'start ')
  q = q.replace(FILLER_RE, '')
  q = q.replace(/\s+/g, ' ').trim()
  return q
}

export function expandAliases(q: string): string {
  let out = q
  for (const [re, replacement] of ALIAS_REPLACEMENTS) {
    out = out.replace(re, replacement)
  }
  return out.replace(/\s+/g, ' ').trim()
}

function prepare(raw: string): string {
  return expandAliases(normalizePrompt(raw))
}

function hasStartIntent(q: string): boolean {
  return START_VERBS.test(q) || /^go\b/.test(q)
}

function hasSendIntent(q: string): boolean {
  return SEND_VERBS.test(q)
}

function hasPauseIntent(q: string): boolean {
  return PAUSE_VERBS.test(q) && !/\bstop\s+all\b/i.test(q)
}

function hasResumeIntent(q: string): boolean {
  return RESUME_VERBS.test(q)
}

function hasOpenIntent(q: string): boolean {
  return OPEN_VERBS.test(q)
}

function hasFindIntent(q: string): boolean {
  return FIND_VERBS.test(q) || /\bleads?\b/i.test(q)
}

function hasStopIntent(q: string): boolean {
  return STOP_VERBS.test(q) && !/\bstop\s+all\b/i.test(q)
}

function mentionsOutreach(q: string): boolean {
  return /\b(?:outreach|cold\s*email|email\s*outreach)\b/i.test(q)
}

function mentionsReddit(q: string): boolean {
  return /\breddit\b/i.test(q)
}

function mentionsBlog(q: string): boolean {
  return /\b(?:seo\s*blog|blog)\b/i.test(q)
}

function mentionsGroups(q: string): boolean {
  return /\b(?:group\s*poster|groups?|poster)\b/i.test(q) && !mentionsFriendDms(q)
}

function mentionsFriendDms(q: string): boolean {
  return /\b(?:friend\s*dms?|inbox)\b/i.test(q) || (/\bdms?\b/i.test(q) && !mentionsGroups(q))
}

const MODULES: { re: RegExp; module: string; label: string; startable?: boolean }[] = [
  { re: /\b(?:one[- ]?shot|notes?\s*shot|iphone\s*notes?\s*post)\b/i, module: 'one-shot', label: 'One-Shot', startable: false },
  { re: /\b(?:ugc\s*slides?|tiktoks?|reels?|carousel|slideshow)\b/i, module: 'ugc-slides', label: 'UGC Slides', startable: false },
  { re: /\b(?:seo\s*blog|blog)\b/i, module: 'seo-blog', label: 'SEO Blog', startable: true },
  { re: /\b(?:friend\s*dms?|inbox)\b/i, module: 'group-poster', label: 'Friend DMs', startable: true },
  { re: /\b(?:group\s*poster|groups?|poster)\b/i, module: 'group-poster', label: 'Group Poster', startable: true },
  { re: /\breddit\b/i, module: 'reddit-commenter', label: 'Reddit', startable: true },
  { re: /\b(?:outreach|cold\s*email)\b/i, module: 'outreach', label: 'Outreach', startable: true },
  { re: /\b(?:markets?|stocks?|desk|tickers?|trading)\b/i, module: 'markets', label: 'Markets', startable: false },
  { re: /\b(?:pipeline|promo|crm)\b/i, module: 'pipeline', label: 'Pipeline', startable: false },
  { re: /\b(?:notes?|notepad|memo)\b/i, module: 'notes', label: 'Notes', startable: false },
]

function matchModule(q: string) {
  return MODULES.find((m) => m.re.test(q)) ?? null
}

/** Single-word or “<module> time” → implicit start. */
function parseImplicitStart(q: string): AssistantAction[] | null {
  const bare = q.replace(/^(?:the|my)\s+/i, '').trim()
  if (/^(outreach|reddit|blog|groups?|poster|dms?|seo)$/i.test(bare)) {
    const map: Record<string, AssistantAction[]> = {
      outreach: [{ type: 'start_outreach_find' }, { type: 'open_module', module: 'outreach' }],
      reddit: [{ type: 'start_reddit' }, { type: 'open_module', module: 'reddit-commenter' }],
      blog: [{ type: 'start_seo_blog' }, { type: 'open_module', module: 'seo-blog' }],
      seo: [{ type: 'start_seo_blog' }, { type: 'open_module', module: 'seo-blog' }],
      groups: [{ type: 'start_group_poster' }, { type: 'open_module', module: 'group-poster' }],
      group: [{ type: 'start_group_poster' }, { type: 'open_module', module: 'group-poster' }],
      poster: [{ type: 'start_group_poster' }, { type: 'open_module', module: 'group-poster' }],
      dms: [{ type: 'start_friend_dms' }, { type: 'open_module', module: 'group-poster' }],
      dm: [{ type: 'start_friend_dms' }, { type: 'open_module', module: 'group-poster' }],
    }
    return map[bare.toLowerCase()] ?? null
  }
  const timeMatch = bare.match(/^(.+?)\s+time$/i)
  if (timeMatch?.[1]) {
    return parseImplicitStart(timeMatch[1])
  }
  return null
}

function matchTool(q: string, tools: ToolRef[]): ToolRef | null {
  const stripped = q
    .replace(START_VERBS, '')
    .replace(/\b(?:the|a|my|tool)\b/g, '')
    .trim()
  const needle = stripped.toLowerCase()
  if (!needle || needle.length < 3) return null
  return (
    tools.find((t) => t.id.toLowerCase() === needle) ||
    tools.find((t) => t.name.toLowerCase() === needle) ||
    tools.find((t) => t.name.toLowerCase().includes(needle)) ||
    tools.find((t) => t.id.toLowerCase().includes(needle)) ||
    null
  )
}

function parseUgcGenerate(q: string): Extract<AssistantAction, { type: 'generate_ugc' }> | null {
  const patterns = [
    /\b(?:generate|make|create|build|write|draft|need|want|give\s+me|cook\s+up)\s+(?:(\d{1,2})\s+)?(?:ugc\s*)?(?:tiktok\s*)?slides?\s+(?:about|on|for|re:?)\s+(.+)/i,
    /\b(?:generate|make|create|build|write|draft)\s+(.+?)\s+slides?\b/i,
    /\bslides?\s+(?:about|on|for)\s+(.+)/i,
    /\b(?:ugc|tiktok|reels?|carousel)\s+(?:about|on|for)\s+(.+)/i,
    /\bcontent\s+(?:about|on|for)\s+(.+)/i,
  ]
  for (const re of patterns) {
    const m = q.match(re)
    if (!m) continue
    const slideCount = m[1] && /^\d+$/.test(m[1]) ? Math.min(12, Math.max(2, Number(m[1]))) : 5
    const topic = (m[2] || m[1] || '').trim().replace(/^(?:some|a few|me\s+some)\s+/i, '')
    if (!topic || /^\d+$/.test(topic)) continue
    if (/^(?:vault|notes?|backup|status)$/i.test(topic)) continue
    return { type: 'generate_ugc', topic, slideCount, brief: topic }
  }
  return null
}

function parseNote(q: string): AssistantAction | null {
  const patterns = [
    /^(?:create|add|make|write|jot\s+down|save)\s+(?:a\s+)?(?:note|memo)(?:\s+about|\s*:|\s+for)?\s+(.+)$/i,
    /^note(?:\s+that)?[:\s]+(.+)$/i,
    /^remember\s+(?:that\s+)?(.+)$/i,
    /^don't\s+forget\s+(.+)$/i,
  ]
  for (const re of patterns) {
    const m = q.match(re)
    if (m?.[1]) {
      const body = m[1].trim()
      const title = body.length > 60 ? `${body.slice(0, 57)}…` : body
      return { type: 'create_note', title, body }
    }
  }
  return null
}

function result(actions: AssistantAction[], reply: string): AssistantParseResult {
  return { actions, reply, source: 'rules' }
}

const CONJUNCTION_RE = /\s+(?:and|&|\+|,|then|also|plus|as\s+well\s+as)\s+/i

const MODULE_TOKEN_RE =
  /^(?:outreach|reddit|blog|seo(?:\s+blog)?|groups?|group\s+poster|poster|dms?|friend\s+dms?|inbox|pipeline|crm|markets?|notes?|ugc(?:\s+slides?)?|tiktok|reels?|fb\s+groups?)$/i

const VERB_PREFIX_RE = /^(start|run|launch|do|hit|open|pause|resume|stop|kick\s+off|fire\s+up)\s+/i

function stripVerb(part: string): string {
  return part.replace(VERB_PREFIX_RE, '').trim()
}

function isToolishClause(part: string, tools: ToolRef[]): boolean {
  const p = expandAliases(part.trim().toLowerCase())
  if (!p || p.length > 56) return false
  if (parseUgcGenerate(p) || parseNote(p)) return false
  if (parseImplicitStart(p)) return true
  if (matchModule(p)) return true
  if (matchTool(p, tools)) return true
  const core = stripVerb(p)
  if (MODULE_TOKEN_RE.test(core)) return true
  if (
    core.length <= 36 &&
    (mentionsOutreach(p) ||
      mentionsReddit(p) ||
      mentionsBlog(p) ||
      mentionsGroups(p) ||
      mentionsFriendDms(p) ||
      /\b(?:pipeline|crm|markets?|notes?|vault|backup|failures?)\b/i.test(p))
  ) {
    return true
  }
  return false
}

/** Split “start outreach and reddit” / “run blog + groups” into per-tool clauses. */
export function splitCompoundPrompt(q: string, tools: ToolRef[]): string[] | null {
  if (!CONJUNCTION_RE.test(q)) return null

  const verbMatch = q.match(
    /^(start|run|launch|do|hit|open|pause|resume|stop|kick\s+off|fire\s+up)\s+(.+)$/i,
  )
  if (verbMatch) {
    const verb = verbMatch[1]
    const rest = verbMatch[2]
    if (CONJUNCTION_RE.test(rest)) {
      const segments = rest.split(CONJUNCTION_RE).map((s) => s.trim()).filter(Boolean)
      if (segments.length >= 2 && segments.every((s) => isToolishClause(s, tools) || isToolishClause(`${verb} ${s}`, tools))) {
        return segments.map((s) => (VERB_PREFIX_RE.test(s) ? s : `${verb} ${s}`))
      }
    }
  }

  const segments = q.split(CONJUNCTION_RE).map((s) => s.trim()).filter(Boolean)
  if (segments.length >= 2 && segments.every((s) => isToolishClause(s, tools))) {
    return segments
  }

  return null
}

function mergeActions(actions: AssistantAction[]): AssistantAction[] {
  const out: AssistantAction[] = []
  const seen = new Set<string>()
  for (const action of actions) {
    if (action.type === 'open_module') {
      const key = `open:${action.module}`
      if (seen.has(key)) continue
      seen.add(key)
    }
    if (action.type === 'reply') continue
    out.push(action)
  }
  return out
}

function parseAssistantRulesSingle(
  raw: string,
  ctx: { tools: ToolRef[]; hub?: HubCtx | null },
): AssistantParseResult | null {
  const q = prepare(raw)
  if (!q) return null

  const note = parseNote(q)
  if (note) {
    return result([note, { type: 'open_module', module: 'notes' }], 'Creating note and opening Notes.')
  }

  const ugc = parseUgcGenerate(q)
  if (ugc) {
    return result(
      [ugc, { type: 'open_module', module: 'ugc-slides' }],
      `Generating ${ugc.slideCount ?? 5} UGC slides about “${ugc.topic}”.`,
    )
  }

  const implicit = parseImplicitStart(q)
  if (implicit) {
    return result(implicit, 'On it.')
  }

  if (/^(?:hey|hi|hello|yo|sup|howdy|hiya|gm|good\s+(?:morning|afternoon|evening))$/i.test(q)) {
    return result(
      [
        {
          type: 'reply',
          message: `Hey — tell me what to run. Try “start outreach and reddit”, “backup”, or “slides about meal prep”.`,
        },
      ],
      '',
    )
  }

  if (/\b(?:backup|back\s*up|snapshot|archive)\b/i.test(q) || /\bsave\s+all\b/i.test(q)) {
    return result([{ type: 'backup' }], 'Creating backup…')
  }

  if (/\b(?:stop\s*all|kill\s*all|shutdown\s*everything|nuke\s*everything)\b/i.test(q)) {
    return result([{ type: 'stop_all' }], 'Stopping all tools…')
  }

  if (/\b(?:vault|secrets?)\b/i.test(q) && !hasStartIntent(q)) {
    return result([{ type: 'open_vault' }], 'Opening vault.')
  }

  if (
    /\b(?:failures?|errors?|broke|broken|issues?|problems?|bugs?|went\s+wrong)\b/i.test(q) &&
    !hasStartIntent(q) &&
    !mentionsBlog(q)
  ) {
    return result([{ type: 'open_failures' }], 'Opening failures.')
  }

  if (/\b(?:live\s+)?logs?\b/i.test(q) && !mentionsBlog(q) && !hasStartIntent(q) && !/\berrors?\b/i.test(q)) {
    return result([{ type: 'open_logs' }], 'Opening logs.')
  }

  if (
    /\b(?:refresh|update|reload)\b/i.test(q) &&
    /\b(?:markets?|stocks?|desk|tickers?|quotes?|trading)\b/i.test(q)
  ) {
    return result(
      [{ type: 'refresh_markets' }, { type: 'open_module', module: 'markets' }],
      'Refreshing markets data.',
    )
  }

  if (/\bimport\b/i.test(q) && (mentionsOutreach(q) || /\bpipeline\b/i.test(q) || /\bcrm\b/i.test(q))) {
    return result(
      [{ type: 'import_pipeline_outreach' }, { type: 'open_module', module: 'pipeline' }],
      'Importing outreach leads into pipeline.',
    )
  }

  if ((/\bclear\b/i.test(q) || /\breset\b/i.test(q)) && mentionsOutreach(q)) {
    return result([{ type: 'clear_outreach_run' }], 'Clearing outreach run.')
  }

  if ((/\bclear\b/i.test(q) || /\breset\b/i.test(q)) && mentionsReddit(q)) {
    return result([{ type: 'clear_reddit_run' }], 'Clearing Reddit run.')
  }

  // Pause / resume
  if (hasPauseIntent(q) || hasResumeIntent(q)) {
    const pausing = hasPauseIntent(q) && !hasResumeIntent(q)
    if (mentionsOutreach(q)) {
      return result(
        [{ type: pausing ? 'pause_outreach' : 'resume_outreach' }],
        pausing ? 'Pausing outreach send.' : 'Resuming outreach send.',
      )
    }
    if (mentionsGroups(q)) {
      return result(
        [{ type: pausing ? 'pause_group_poster' : 'resume_group_poster' }],
        pausing ? 'Pausing group poster.' : 'Resuming group poster.',
      )
    }
    if (mentionsFriendDms(q)) {
      return result(
        [{ type: pausing ? 'pause_friend_dms' : 'resume_friend_dms' }],
        pausing ? 'Pausing friend DMs.' : 'Resuming friend DMs.',
      )
    }
    if (mentionsReddit(q)) {
      return result(
        [{ type: pausing ? 'pause_reddit' : 'resume_reddit' }],
        pausing ? 'Pausing Reddit.' : 'Resuming Reddit.',
      )
    }
  }

  // Stop single module
  if (hasStopIntent(q) && !/\ball\b/i.test(q)) {
    if (mentionsOutreach(q)) {
      return result([{ type: 'pause_outreach' }], 'Pausing outreach.')
    }
    if (mentionsReddit(q)) {
      return result([{ type: 'pause_reddit' }], 'Pausing Reddit.')
    }
    if (mentionsGroups(q)) {
      return result([{ type: 'pause_group_poster' }], 'Pausing group poster.')
    }
  }

  // Outreach send
  if (
    mentionsOutreach(q) &&
    (hasSendIntent(q) || /\bsending\b/i.test(q) || /\boutreach\s+send\b/i.test(q) || /\bblast\b/i.test(q))
  ) {
    return result(
      [{ type: 'start_outreach_send' }, { type: 'open_module', module: 'outreach' }],
      'Starting outreach send.',
    )
  }

  // Outreach find
  if (
    mentionsOutreach(q) &&
    (hasStartIntent(q) || hasFindIntent(q) || /^outreach\b/.test(q)) &&
    !hasSendIntent(q) &&
    !/\bsending\b/i.test(q)
  ) {
    const paste = raw.match(/(?:with|from|list:?|paste)\s+(.+)/i)?.[1]?.trim()
    return result(
      [{ type: 'start_outreach_find', pasteList: paste || undefined }, { type: 'open_module', module: 'outreach' }],
      'Starting outreach find run.',
    )
  }

  if (mentionsReddit(q) && (hasStartIntent(q) || /^reddit\b/.test(q)) && !hasPauseIntent(q) && !hasStopIntent(q)) {
    return result(
      [{ type: 'start_reddit' }, { type: 'open_module', module: 'reddit-commenter' }],
      'Starting Reddit scan & post.',
    )
  }

  if (mentionsBlog(q) && (hasStartIntent(q) || /^blog\b/.test(q) || /^seo\b/.test(q)) && !hasOpenIntent(q)) {
    return result(
      [{ type: 'start_seo_blog' }, { type: 'open_module', module: 'seo-blog' }],
      'Starting SEO blog run.',
    )
  }

  if (mentionsGroups(q) && (hasStartIntent(q) || /\bpost(?:ing)?\b/i.test(q))) {
    return result(
      [{ type: 'start_group_poster' }, { type: 'open_module', module: 'group-poster' }],
      'Starting group poster.',
    )
  }

  if (mentionsFriendDms(q) && (hasStartIntent(q) || /\bmessage\b/i.test(q))) {
    return result(
      [{ type: 'start_friend_dms' }, { type: 'open_module', module: 'group-poster' }],
      'Starting friend DMs.',
    )
  }

  if (hasStartIntent(q)) {
    const tool = matchTool(q, ctx.tools)
    if (tool) {
      return result([{ type: 'launch_tool', toolId: tool.id }], `Launching ${tool.name}.`)
    }
  }

  const mod = matchModule(q)
  if (mod) {
    if (hasOpenIntent(q)) {
      return result([{ type: 'open_module', module: mod.module }], `Opening ${mod.label}.`)
    }
    if (mod.startable && !hasPauseIntent(q) && q.length <= 48) {
      if (mod.module === 'outreach') {
        return result(
          [{ type: 'start_outreach_find' }, { type: 'open_module', module: 'outreach' }],
          'Starting outreach find run.',
        )
      }
      if (mod.module === 'reddit-commenter') {
        return result(
          [{ type: 'start_reddit' }, { type: 'open_module', module: 'reddit-commenter' }],
          'Starting Reddit.',
        )
      }
      if (mod.module === 'seo-blog') {
        return result(
          [{ type: 'start_seo_blog' }, { type: 'open_module', module: 'seo-blog' }],
          'Starting SEO blog.',
        )
      }
      if (mod.module === 'group-poster' && mentionsFriendDms(q)) {
        return result(
          [{ type: 'start_friend_dms' }, { type: 'open_module', module: 'group-poster' }],
          'Starting friend DMs.',
        )
      }
      if (mod.module === 'group-poster') {
        return result(
          [{ type: 'start_group_poster' }, { type: 'open_module', module: 'group-poster' }],
          'Starting group poster.',
        )
      }
    }
    if (!hasStartIntent(q) && q.length <= 40) {
      return result([{ type: 'open_module', module: mod.module }], `Opening ${mod.label}.`)
    }
  }

  if (
    /\b(?:status|summary|overview|check[\s-]?in|how(?:'s| is)\s+(?:everything|it\s+going))\b/i.test(q) &&
    ctx.hub
  ) {
    const active = (ctx.hub.modules || []).filter((m) => !/idle|done/i.test(m.status))
    const reply = [
      active.length ? `Active: ${active.map((m) => `${m.label} (${m.status})`).join(', ')}` : 'All automations idle.',
      ctx.hub.followUpsDue ? `${ctx.hub.followUpsDue} follow-up(s) due.` : '',
      ctx.hub.failures ? `${ctx.hub.failures} failure(s).` : '',
    ]
      .filter(Boolean)
      .join(' ')
    return result([{ type: 'reply', message: reply }], reply)
  }

  if (/\bhelp\b/i.test(q)) {
    const reply =
      'Say stuff like “start outreach and reddit”, “run blog + groups”, “outreach”, “what broke”, “save everything”, “cook up slides about meal prep”.'
    return result([{ type: 'reply', message: reply }], reply)
  }

  return null
}

export function parseAssistantRules(
  raw: string,
  ctx: { tools: ToolRef[]; hub?: HubCtx | null },
): AssistantParseResult | null {
  const q = prepare(raw)
  if (!q) return null

  // Don't split content-generation phrases that use “and” in the topic.
  if (parseUgcGenerate(q) || parseNote(q)) {
    return parseAssistantRulesSingle(raw, ctx)
  }

  const parts = splitCompoundPrompt(q, ctx.tools)
  if (parts && parts.length >= 2) {
    const allActions: AssistantAction[] = []
    const replies: string[] = []
    for (const part of parts) {
      const sub = parseAssistantRulesSingle(part, ctx)
      if (!sub) return parseAssistantRulesSingle(raw, ctx)
      allActions.push(...sub.actions)
      if (sub.reply) replies.push(sub.reply)
    }
    const merged = mergeActions(allActions)
    if (merged.length) {
      return result(merged, replies.join(' → '))
    }
  }

  return parseAssistantRulesSingle(raw, ctx)
}
