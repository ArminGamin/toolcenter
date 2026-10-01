import { describe, expect, it } from 'vitest'
import { expandAliases, normalizePrompt, parseAssistantRules } from '../assistant-parse.js'

describe('normalizePrompt', () => {
  it('strips casual filler', () => {
    expect(normalizePrompt('start outreach rn pls')).toBe('start outreach')
    expect(normalizePrompt('can u run reddit right now')).toBe('run reddit')
    expect(normalizePrompt('hey backup asap!!')).toBe('hey backup')
    expect(normalizePrompt('gonna start outreach tbh')).toBe('start outreach')
    expect(normalizePrompt("let's do the outreach thing")).toBe('start outreach thing')
  })
})

describe('expandAliases', () => {
  it('maps vague terms to canonical modules', () => {
    expect(expandAliases('get emails going')).toBe('send outreach')
    expect(expandAliases('hit reddit')).toBe('start reddit')
    expect(expandAliases('fb groups')).toBe('group poster')
    expect(expandAliases('what broke')).toBe('failures')
    expect(expandAliases('save everything')).toBe('backup')
    expect(expandAliases('find some leads')).toBe('outreach find')
  })
})

describe('parseAssistantRules', () => {
  it('starts outreach find from casual phrasing', () => {
    const cases = [
      'start outreach find',
      'start outreach rn',
      'can you start outreach please',
      'run outreach',
      'outreach start',
      'i need to start outreach',
      'go ahead and start outreach',
      'do outreach',
      'handle outreach',
      'outreach',
      'outreach time',
      'find some leads',
      'prospecting',
    ]
    for (const prompt of cases) {
      const r = parseAssistantRules(prompt, { tools: [] })
      expect(r?.actions.some((a) => a.type === 'start_outreach_find'), prompt).toBe(true)
    }
  })

  it('sends outreach from varied phrasing', () => {
    const cases = [
      'send outreach',
      'start sending outreach',
      'outreach send emails',
      'dispatch outreach',
      'get emails going',
      'blast emails',
    ]
    for (const prompt of cases) {
      const r = parseAssistantRules(prompt, { tools: [] })
      expect(r?.actions.some((a) => a.type === 'start_outreach_send'), prompt).toBe(true)
    }
  })

  it('generates ugc slides from casual phrasing', () => {
    const cases = [
      'generate 5 slides about saving money',
      'make slides about meal prep',
      'need 3 ugc slides on budgeting',
      'slides about quick dinners',
      'cook up slides about gym meals',
      'tiktok about saving money',
      'content about weekly planning',
    ]
    for (const prompt of cases) {
      const r = parseAssistantRules(prompt, { tools: [] })
      expect(r?.actions.some((a) => a.type === 'generate_ugc'), prompt).toBe(true)
    }
  })

  it('runs reddit from casual phrasing', () => {
    const cases = [
      'run reddit',
      'start reddit rn',
      'reddit run pls',
      'kick off reddit',
      'hit reddit',
      'reddit time',
      'reddit',
      'comment on reddit',
    ]
    for (const prompt of cases) {
      const r = parseAssistantRules(prompt, { tools: [] })
      expect(r?.actions.some((a) => a.type === 'start_reddit'), prompt).toBe(true)
    }
  })

  it('starts blog and groups from vague refs', () => {
    expect(parseAssistantRules('write some posts', { tools: [] })?.actions.some((a) => a.type === 'start_seo_blog')).toBe(
      true,
    )
    expect(parseAssistantRules('seo', { tools: [] })?.actions.some((a) => a.type === 'start_seo_blog')).toBe(true)
    expect(parseAssistantRules('post to groups', { tools: [] })?.actions.some((a) => a.type === 'start_group_poster')).toBe(
      true,
    )
    expect(parseAssistantRules('fb groups', { tools: [] })?.actions.some((a) => a.type === 'start_group_poster')).toBe(
      true,
    )
  })

  it('handles status and failure vague refs', () => {
    expect(parseAssistantRules('what broke', { tools: [], hub: { modules: [] } })?.actions[0]?.type).toBe(
      'open_failures',
    )
    expect(
      parseAssistantRules("what's running", {
        tools: [],
        hub: { modules: [{ id: 'outreach', label: 'Outreach', status: 'idle' }] },
      })?.actions[0]?.type,
    ).toBe('reply')
  })

  it('pauses outreach with flexible order', () => {
    expect(parseAssistantRules('pause outreach', { tools: [] })?.actions[0]?.type).toBe('pause_outreach')
    expect(parseAssistantRules('outreach pause rn', { tools: [] })?.actions[0]?.type).toBe('pause_outreach')
    expect(parseAssistantRules('stop outreach', { tools: [] })?.actions[0]?.type).toBe('pause_outreach')
  })

  it('starts multiple tools from compound phrasing', () => {
    const cases = [
      'start outreach and reddit',
      'run outreach and blog',
      'start reddit + groups',
      'do outreach and seo',
      'hit reddit and fb groups',
      'launch outreach, reddit, and blog',
    ]
    for (const prompt of cases) {
      const r = parseAssistantRules(prompt, { tools: [] })
      expect(r?.actions.length, prompt).toBeGreaterThanOrEqual(2)
    }
    const outreachReddit = parseAssistantRules('start outreach and reddit', { tools: [] })
    expect(outreachReddit?.actions.some((a) => a.type === 'start_outreach_find')).toBe(true)
    expect(outreachReddit?.actions.some((a) => a.type === 'start_reddit')).toBe(true)
  })

  it('does not split ugc topics with and', () => {
    const r = parseAssistantRules('slides about saving money and meal prep', { tools: [] })
    expect(r?.actions.some((a) => a.type === 'generate_ugc')).toBe(true)
    expect(r?.actions.filter((a) => a.type === 'start_reddit').length).toBe(0)
  })

  it('handles casual greetings without duplicate reply field', () => {
    const r = parseAssistantRules('hey', { tools: [] })
    expect(r?.actions[0]?.type).toBe('reply')
    expect(r?.reply).toBe('')
  })
})
