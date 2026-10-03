import type { UgcPlacement, UgcTemplate, UgcTemplateChoice } from './ugc-slides-render'
import { KALEDU_UNIVERSAL_DESCRIPTION, KALEDU_UNIVERSAL_DESCRIPTIONS, normalizeUniversalDescriptions } from './ugc-universal-description'
import { isAbortError, type UgcRequestOptions } from './ugc-fetch'
import {
  activeBusinessProfileId,
  CHRISTMAS_BUSINESS_PROFILE_ID,
  DEFAULT_BUSINESS_PROFILE_ID,
  profileLocalStorageKey,
} from './business-profiles'

export type UgcAngle =
  | 'save_money'
  | 'reduce_waste'
  | 'quick_meals'
  | 'personalisation'
  | 'planning'
  | 'one_time_payment'
  | 'avoid_disliked_foods'
  | 'gift_ideas'
  | 'last_minute'
  | 'gifts_family'
  | 'cozy_home'
  | 'shopping_stress'
  | 'countdown'
  | 'product_focus'
  | 'custom'

export type { UgcPlacement, UgcTemplate, UgcTemplateChoice }

export type UgcSlideshowSlideCopy = {
  id: string
  title: string
  body: string
  cta?: string
  role?: string
  productId?: string
  productVariantId?: string
  visualIntent?: string
  showProductPrice?: boolean
  productPriceLabel?: string
}

export type UgcSlideContent = {
  title: string
  body: string
  cta: string
  focalX: number
  focalY: number
}

export const UGC_DRAFT_KEY = 'cc-ugc-slides-draft-v3'
export const UGC_PROFILES_KEY = 'cc-ugc-slides-profiles-v1'

function ugcDraftStorageKey(profileId = activeBusinessProfileId()): string {
  if (profileId === DEFAULT_BUSINESS_PROFILE_ID) return UGC_DRAFT_KEY
  return profileLocalStorageKey(UGC_DRAFT_KEY)
}

export const UGC_VAULT_SETTING_KEYS = [
  'OLLAMA_URL',
  'OLLAMA_MODEL',
  'OLLAMA_NUM_GPU',
  'OLLAMA_NUM_CTX',
  'DISCORD_BOT_TOKEN',
] as const

export type UgcVaultSettingKey = (typeof UGC_VAULT_SETTING_KEYS)[number]

export type UgcVaultSettings = Record<UgcVaultSettingKey, string>

export const DEFAULT_UGC_VAULT_SETTINGS: UgcVaultSettings = {
  OLLAMA_URL: 'http://127.0.0.1:11434',
  OLLAMA_MODEL: 'ugc-lt-gpu',
  OLLAMA_NUM_GPU: '32',
  OLLAMA_NUM_CTX: '4096',
  DISCORD_BOT_TOKEN: '',
}

export function vaultSettingsSnapshot(settings: UgcVaultSettings): string {
  return JSON.stringify(settings)
}

export function normalizeUgcVaultSettings(raw?: Record<string, string>): UgcVaultSettings {
  return {
    OLLAMA_URL: String(raw?.OLLAMA_URL ?? DEFAULT_UGC_VAULT_SETTINGS.OLLAMA_URL),
    OLLAMA_MODEL: String(raw?.OLLAMA_MODEL ?? DEFAULT_UGC_VAULT_SETTINGS.OLLAMA_MODEL),
    OLLAMA_NUM_GPU: String(raw?.OLLAMA_NUM_GPU ?? DEFAULT_UGC_VAULT_SETTINGS.OLLAMA_NUM_GPU),
    OLLAMA_NUM_CTX: String(raw?.OLLAMA_NUM_CTX ?? DEFAULT_UGC_VAULT_SETTINGS.OLLAMA_NUM_CTX),
    DISCORD_BOT_TOKEN: String(raw?.DISCORD_BOT_TOKEN ?? ''),
  }
}

export function shortOllamaModelName(model: string): string {
  const trimmed = model.trim()
  if (!trimmed) return 'No model'
  const slash = trimmed.lastIndexOf('/')
  return slash >= 0 ? trimmed.slice(slash + 1) : trimmed
}

export type UgcOllamaStatusView = {
  ok: boolean
  online: boolean
  url: string | null
  model: string
  modelReady: boolean
  models: string[]
  message?: string
}

export async function fetchUgcOllamaStatus(): Promise<UgcOllamaStatusView | null> {
  try {
    const res = await fetch('/api/ugc-slides?action=ollama-status', {
      headers: authHeaders(),
    })
    const data = (await res.json()) as { ok?: boolean; status?: UgcOllamaStatusView }
    return data.status ?? null
  } catch {
    return null
  }
}
export const MIN_SLIDESHOW_SLIDES = 2
export const MAX_SLIDESHOW_SLIDES = 12

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

export const ANGLE_OPTIONS: { id: UgcAngle; label: string }[] = [
  { id: 'save_money', label: 'Save money' },
  { id: 'reduce_waste', label: 'Less food waste' },
  { id: 'quick_meals', label: 'Quick dinners' },
  { id: 'personalisation', label: 'A plan for your life' },
  { id: 'avoid_disliked_foods', label: 'Recipes without disliked foods' },
  { id: 'one_time_payment', label: 'One-time payment' },
  { id: 'planning', label: 'Weekly planning' },
  { id: 'custom', label: 'Custom topic' },
]

export const CHRISTMAS_ANGLE_OPTIONS: { id: UgcAngle; label: string }[] = [
  { id: 'gift_ideas', label: 'Gift ideas' },
  { id: 'last_minute', label: 'Last-minute gifts' },
  { id: 'gifts_family', label: 'Gifts for family' },
  { id: 'cozy_home', label: 'Cozy Christmas' },
  { id: 'shopping_stress', label: 'Shopping stress' },
  { id: 'countdown', label: 'Holiday countdown' },
  { id: 'product_focus', label: 'A specific product' },
  { id: 'custom', label: 'Custom topic' },
]

export function isChristmasUgcProfile(profileId = activeBusinessProfileId()): boolean {
  return profileId === CHRISTMAS_BUSINESS_PROFILE_ID
}

export function ugcAngleOptions(profileId = activeBusinessProfileId()): { id: UgcAngle; label: string }[] {
  return isChristmasUgcProfile(profileId) ? CHRISTMAS_ANGLE_OPTIONS : ANGLE_OPTIONS
}

export const TAVO_DEFAULT_UGC_CTA = 'Apsilankyk tavoknyga.com ir pradėk 5 min. testą! 🤩'
export const KALEDU_DEFAULT_UGC_CTA = 'Rask dovaną Kalėdų Kampelyje - kaledukampelis.com 🎁'

export function defaultUgcCtaForProfile(profileId = activeBusinessProfileId()): string {
  return isChristmasUgcProfile(profileId) ? KALEDU_DEFAULT_UGC_CTA : TAVO_DEFAULT_UGC_CTA
}

export function defaultUgcAngleForProfile(profileId = activeBusinessProfileId()): UgcAngle {
  return isChristmasUgcProfile(profileId) ? 'gift_ideas' : 'personalisation'
}

export const TEMPLATE_OPTIONS: { id: UgcTemplateChoice; label: string }[] = [
  { id: 'random', label: 'Random (per post)' },
  { id: 'headline_body', label: 'Headline + body' },
  { id: 'single_statement', label: 'Single big statement' },
  { id: 'problem_solution', label: 'Problem → solution' },
  { id: 'headline_body_cta', label: 'Headline + body + CTA' },
]

export const PLACEMENT_OPTIONS: { id: UgcPlacement; label: string }[] = [
  { id: 'top', label: 'Top' },
  { id: 'center', label: 'Center' },
  { id: 'bottom', label: 'Bottom' },
]

export type UgcExportSizeId =
  | 'tiktok_reels'
  | 'instagram_reels'
  | 'instagram_story'
  | 'youtube_shorts'
  | 'facebook_reels'
  | 'instagram_post_45'
  | 'instagram_post_11'

export const EXPORT_SIZE_OPTIONS: {
  id: UgcExportSizeId
  label: string
  width: number
  height: number
}[] = [
  { id: 'tiktok_reels', label: 'TikTok (9:16)', width: 1080, height: 1920 },
  { id: 'instagram_reels', label: 'Instagram Reels (9:16)', width: 1080, height: 1920 },
  { id: 'instagram_story', label: 'Instagram Story (9:16)', width: 1080, height: 1920 },
  { id: 'youtube_shorts', label: 'YouTube Shorts (9:16)', width: 1080, height: 1920 },
  { id: 'facebook_reels', label: 'Facebook Reels (9:16)', width: 1080, height: 1920 },
  { id: 'instagram_post_45', label: 'Instagram Post (4:5)', width: 1080, height: 1350 },
  { id: 'instagram_post_11', label: 'Instagram Post (1:1)', width: 1080, height: 1080 },
]

export function resolveExportSize(id: string): { width: number; height: number; label: string } {
  const preset = EXPORT_SIZE_OPTIONS.find((o) => o.id === id) || EXPORT_SIZE_OPTIONS[0]
  return { width: preset.width, height: preset.height, label: preset.label }
}

export const SLIDE_ROLE_LABELS: Record<string, string> = {
  hook: 'Hook',
  value: 'Value',
  close: 'CTA',
}

export type UgcSlidesProfileSettings = {
  angle: UgcAngle
  template: UgcTemplateChoice
  placement: UgcPlacement
  brief: string
  defaultCta: string
  exportSizeId: UgcExportSizeId
  ltDescription: string
  universalDescription?: string
  /** Kalėdų: up to three descriptions; each batch post picks one at random. */
  universalDescriptions?: string[]
  generateDescriptionAutomatically?: boolean
  discordGuildId: string
  discordCategoryId: string
}

export type UgcSlidesProfile = {
  name: string
  updatedAt: string
  settings: UgcSlidesProfileSettings
}

export type UgcSlidesDraft = UgcSlidesProfileSettings & {
  slides: UgcSlideContent[]
  activeSlideIndex: number
}

export const DEFAULT_SLIDE_CONTENT: UgcSlideContent = {
  title: '',
  body: '',
  cta: '',
  focalX: 50,
  focalY: 50,
}

export const DEFAULT_UGC_DRAFT: UgcSlidesDraft = {
  angle: 'personalisation',
  template: 'headline_body',
  placement: 'center',
  brief: '',
  defaultCta: TAVO_DEFAULT_UGC_CTA,
  exportSizeId: 'tiktok_reels',
  slides: [],
  activeSlideIndex: 0,
  ltDescription: '',
  discordGuildId: '',
  discordCategoryId: '',
}

/** Former hard-coded category id; the category was deleted on Discord. */
const STALE_DEFAULT_DISCORD_CATEGORY = '1533864166610436096'

export function emptyUgcDraft(profileId = activeBusinessProfileId()): UgcSlidesDraft {
  return {
    ...DEFAULT_UGC_DRAFT,
    angle: defaultUgcAngleForProfile(profileId),
    defaultCta: defaultUgcCtaForProfile(profileId),
    ...(isChristmasUgcProfile(profileId) ? {
      universalDescription: KALEDU_UNIVERSAL_DESCRIPTION,
      universalDescriptions: [...KALEDU_UNIVERSAL_DESCRIPTIONS],
      generateDescriptionAutomatically: false,
    } : {}),
    slides: [],
  }
}

export function draftProfileSettings(draft: UgcSlidesDraft): UgcSlidesProfileSettings {
  return {
    angle: draft.angle,
    template: draft.template,
    placement: draft.placement,
    brief: draft.brief,
    defaultCta: draft.defaultCta,
    exportSizeId: draft.exportSizeId,
    ltDescription: draft.ltDescription,
    universalDescription: draft.universalDescription,
    universalDescriptions: draft.universalDescriptions,
    generateDescriptionAutomatically: draft.generateDescriptionAutomatically,
    discordGuildId: draft.discordGuildId,
    discordCategoryId: draft.discordCategoryId,
  }
}

export function draftSnapshot(draft: UgcSlidesDraft): string {
  return JSON.stringify({
    ...draftProfileSettings(draft),
    slides: draft.slides,
    activeSlideIndex: draft.activeSlideIndex,
  })
}

export function listUgcProfiles(): UgcSlidesProfile[] {
  try {
    const raw = localStorage.getItem(UGC_PROFILES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as { profiles?: UgcSlidesProfile[] }
    return Array.isArray(parsed.profiles) ? parsed.profiles : []
  } catch {
    return []
  }
}

function writeUgcProfiles(profiles: UgcSlidesProfile[]) {
  localStorage.setItem(UGC_PROFILES_KEY, JSON.stringify({ profiles }))
}

export function saveUgcProfile(name: string, settings: UgcSlidesProfileSettings): UgcSlidesProfile {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Profile name is required')
  const profiles = listUgcProfiles().filter((p) => p.name !== trimmed)
  const profile: UgcSlidesProfile = {
    name: trimmed,
    updatedAt: new Date().toISOString(),
    settings,
  }
  profiles.unshift(profile)
  writeUgcProfiles(profiles)
  return profile
}

export function deleteUgcProfile(name: string) {
  const trimmed = name.trim()
  writeUgcProfiles(listUgcProfiles().filter((p) => p.name !== trimmed))
}

function authHeaders(extra?: HeadersInit): HeadersInit {
  const token =
    typeof window !== 'undefined'
      ? (window as unknown as { __CC_AUTH__?: string }).__CC_AUTH__
      : undefined
  return { ...(extra || {}), ...(token ? { 'X-CC-Token': token } : {}) }
}

export async function warmUgcOllama(options?: UgcRequestOptions): Promise<void> {
  await fetch('/api/ugc-slides?action=ollama-warm', {
    method: 'POST',
    headers: authHeaders(),
    signal: options?.signal,
  })
}

export async function unloadUgcOllama(options?: UgcRequestOptions): Promise<void> {
  await fetch('/api/ugc-slides?action=ollama-unload', {
    method: 'POST',
    headers: authHeaders(),
    signal: options?.signal,
  })
}

export async function generateUgcSlideshow(
  body: {
    angle: UgcAngle
    brief?: string
    cta?: string
    slideCount: number
    batchStory?: boolean
    seed?: number
    skipWarm?: boolean
    theme?: string
    category?: string
  },
  options?: UgcRequestOptions,
): Promise<{
  ok: boolean
  slides?: UgcSlideshowSlideCopy[]
  arcName?: string
  hookStyle?: string
  storyArc?: string
  auditId?: string | null
  message?: string
  errorDetail?: string
}> {
  try {
    const res = await fetch('/api/ugc-slides?action=generate-slideshow', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
      signal: options?.signal,
    })
    const data = (await res.json()) as {
      ok: boolean
      slides?: UgcSlideshowSlideCopy[]
      arcName?: string
      hookStyle?: string
      storyArc?: string
      auditId?: string | null
      message?: string
      errorDetail?: string
      error?: string
    }
    if (!data.ok) {
      return {
        ok: false,
        message: data.message || data.error || `Slideshow failed (${res.status})`,
        errorDetail: data.errorDetail,
      }
    }
    return data
  } catch (err) {
    if (options?.signal?.aborted || isAbortError(err)) throw err
    return {
      ok: false,
      message: 'Ollama is not running. Start Ollama and set OLLAMA_URL / OLLAMA_MODEL in Settings.',
    }
  }
}

export type UgcAuditStatusView = {
  target: number
  completed: number
  active: boolean
  remaining: number
  root: string
  note: string
}

export async function fetchUgcAuditStatus(): Promise<UgcAuditStatusView | null> {
  try {
    const res = await fetch('/api/ugc-slides?action=audit-status', { headers: authHeaders() })
    const data = (await res.json()) as { ok?: boolean; audit?: UgcAuditStatusView }
    return data.audit || null
  } catch {
    return null
  }
}

export async function resetUgcAuditSession(opts?: {
  target?: number
  note?: string
  archivePrevious?: boolean
}): Promise<UgcAuditStatusView | null> {
  try {
    const res = await fetch('/api/ugc-slides?action=reset-audit', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(opts || {}),
    })
    const data = (await res.json()) as { ok?: boolean; audit?: UgcAuditStatusView }
    return data.audit || null
  } catch {
    return null
  }
}

export async function postUgcVisionLog(
  event: string,
  detail: Record<string, unknown> = {},
  auditId?: string,
): Promise<void> {
  try {
    await fetch('/api/ugc-slides?action=vision-log', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ event, auditId, detail }),
    })
  } catch {
    /* never block batch for logging */
  }
}

export async function validateUgcExport(body: {
  caption: string
  meta: Record<string, unknown>
}): Promise<{ ok: boolean; issues: string[]; message?: string }> {
  try {
    const res = await fetch('/api/ugc-slides?action=validate-export', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    })
    const data = (await res.json()) as {
      ok?: boolean
      issues?: string[]
      message?: string
    }
    return {
      ok: res.ok && data.ok === true,
      issues: Array.isArray(data.issues) ? data.issues : [],
      message: data.message,
    }
  } catch {
    return { ok: false, issues: ['quality_gate_unavailable'], message: 'Quality gate unavailable' }
  }
}

export async function validateUgcQuality(body: {
  slides: Array<{ title: string; body: string; cta?: string; role?: string }>
  description?: string
  theme?: string
}): Promise<{ ok: boolean; issues: string[]; message?: string }> {
  try {
    const res = await fetch('/api/ugc-slides?action=validate-quality', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    })
    const data = (await res.json()) as { ok?: boolean; issues?: string[]; message?: string }
    return {
      ok: res.ok && data.ok === true,
      issues: Array.isArray(data.issues) ? data.issues : [],
      message: data.message,
    }
  } catch {
    return { ok: false, issues: ['quality_gate_unavailable'], message: 'Quality gate unavailable' }
  }
}

export type UgcDiscordSettingsView = {
  guildId: string
  categoryId: string
  tokenConfigured: boolean
  source: 'saved' | 'post-maker' | 'empty'
}

export async function fetchUgcDiscordSettings(): Promise<UgcDiscordSettingsView | null> {
  try {
    const res = await fetch('/api/ugc-slides?action=discord-settings', {
      headers: authHeaders(),
    })
    const data = (await res.json()) as { ok?: boolean; settings?: UgcDiscordSettingsView }
    return data.settings || null
  } catch {
    return null
  }
}

export async function saveUgcDiscordSettings(settings: {
  guildId: string
  categoryId: string
}): Promise<{ ok: boolean; message?: string; settings?: UgcDiscordSettingsView }> {
  try {
    const res = await fetch('/api/ugc-slides?action=discord-settings', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(settings),
    })
    const data = (await res.json()) as {
      ok?: boolean
      message?: string
      settings?: UgcDiscordSettingsView
    }
    if (!res.ok || !data.ok) {
      return { ok: false, message: data.message || 'Failed to save Discord settings' }
    }
    return { ok: true, settings: data.settings }
  } catch {
    return { ok: false, message: 'Failed to save Discord settings' }
  }
}

export async function generateLtDescription(
  body: {
    angle: UgcAngle
    brief?: string
    cta?: string
    slides: Array<{ title: string; body: string; role?: string; cta?: string }>
    batchCaption?: boolean
    arcName?: string
    hookStyle?: string
    storyArc?: string
    seed?: number
  },
  options?: UgcRequestOptions,
): Promise<{ ok: boolean; description?: string; hook?: string; message?: string; errorDetail?: string }> {
  try {
    const res = await fetch('/api/ugc-slides?action=generate-description-lt', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
      signal: options?.signal,
    })
    const data = (await res.json()) as {
      ok: boolean
      description?: string
      hook?: string
      message?: string
      errorDetail?: string
      error?: string
    }
    if (!data.ok) {
      return {
        ok: false,
        message: data.message || data.error || `Description failed (${res.status})`,
        errorDetail: data.errorDetail,
      }
    }
    return data
  } catch (err) {
    if (options?.signal?.aborted || isAbortError(err)) throw err
    return {
      ok: false,
      message: 'Ollama is not running. Start Ollama and set OLLAMA_URL / OLLAMA_MODEL in Settings.',
    }
  }
}

export async function publishUgcToDiscord(
  body: {
    caption: string
    guildId: string
    categoryId: string
    slides: Array<{ filename: string; data: string }>
  },
  options?: UgcRequestOptions,
): Promise<{ ok: boolean; channel?: string; channelId?: string; error?: string; message?: string }> {
  try {
    const res = await fetch('/api/ugc-slides?action=publish-discord', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
      signal: options?.signal,
    })
    const data = (await res.json()) as {
      ok: boolean
      channel?: string
      channelId?: string
      error?: string
      message?: string
    }
    if (!data.ok && !data.error && data.message) data.error = data.message
    return data
  } catch (err) {
    if (options?.signal?.aborted || isAbortError(err)) throw err
    const msg = err instanceof Error ? err.message : 'Failed to reach Control Center backend.'
    return {
      ok: false,
      error: /fetch failed/i.test(msg)
        ? 'Upload to server failed (payload too large or connection reset). Try fewer slides per post.'
        : msg,
    }
  }
}

export function validateImageFile(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type.toLowerCase())) {
    return 'Supported formats: JPG, PNG, WEBP'
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return 'File is too large (max 15 MB)'
  }
  return null
}

export function createEmptySlideContent(cta = ''): UgcSlideContent {
  return { ...DEFAULT_SLIDE_CONTENT, cta }
}

export function slideRoleForIndex(index: number, total: number): string {
  if (total <= 1) return 'hook'
  if (index === 0) return 'hook'
  if (index === total - 1) return 'close'
  return 'value'
}

function migrateV1Draft(parsed: Record<string, unknown>): UgcSlidesDraft {
  const slide: UgcSlideContent = {
    title: String(parsed.title || ''),
    body: String(parsed.body || ''),
    cta: String(parsed.cta || parsed.defaultCta || DEFAULT_UGC_DRAFT.defaultCta),
    focalX: typeof parsed.focalX === 'number' ? parsed.focalX : 50,
    focalY: typeof parsed.focalY === 'number' ? parsed.focalY : 50,
  }
  return {
    angle: (parsed.angle as UgcAngle) || DEFAULT_UGC_DRAFT.angle,
    template: (parsed.template as UgcTemplateChoice) || DEFAULT_UGC_DRAFT.template,
    placement: (parsed.placement as UgcPlacement) || DEFAULT_UGC_DRAFT.placement,
    brief: String(parsed.brief || ''),
    defaultCta: String(parsed.cta || parsed.defaultCta || DEFAULT_UGC_DRAFT.defaultCta),
    slides: slide.title || slide.body ? [slide] : [],
    activeSlideIndex: 0,
    ltDescription: '',
    discordGuildId: '',
    discordCategoryId: '',
    exportSizeId: 'tiktok_reels',
  }
}

export function loadUgcDraft(): UgcSlidesDraft {
  const fallback = emptyUgcDraft()
  try {
    const raw = localStorage.getItem(ugcDraftStorageKey())
    if (!raw) {
      if (activeBusinessProfileId() === DEFAULT_BUSINESS_PROFILE_ID) {
        const legacy = localStorage.getItem('cc-ugc-slides-draft-v1')
        if (legacy) return migrateV1Draft(JSON.parse(legacy) as Record<string, unknown>)
      }
      return fallback
    }
    const parsed = JSON.parse(raw) as Partial<UgcSlidesDraft>
    const exportSizeId = EXPORT_SIZE_OPTIONS.some((o) => o.id === parsed.exportSizeId)
      ? (parsed.exportSizeId as UgcExportSizeId)
      : DEFAULT_UGC_DRAFT.exportSizeId
    const angleOptions = ugcAngleOptions()
    const angle = angleOptions.some((o) => o.id === parsed.angle)
      ? (parsed.angle as UgcAngle)
      : fallback.angle
    const defaultCta = String(parsed.defaultCta || fallback.defaultCta)
    const otherBrandCta = isChristmasUgcProfile() ? TAVO_DEFAULT_UGC_CTA : KALEDU_DEFAULT_UGC_CTA
    return {
      ...fallback,
      ...parsed,
      angle,
      exportSizeId,
      defaultCta: defaultCta === otherBrandCta ? fallback.defaultCta : defaultCta,
      // The old built-in category no longer exists on Discord; let the server setting fill it in.
      discordCategoryId: parsed.discordCategoryId === STALE_DEFAULT_DISCORD_CATEGORY ? '' : (parsed.discordCategoryId ?? ''),
      ...(isChristmasUgcProfile()
        ? { universalDescriptions: normalizeUniversalDescriptions(parsed.universalDescriptions, parsed.universalDescription) }
        : {}),
      slides: Array.isArray(parsed.slides)
        ? parsed.slides.map((s) => ({
            ...DEFAULT_SLIDE_CONTENT,
            ...s,
            focalX: typeof s.focalX === 'number' ? s.focalX : 50,
            focalY: typeof s.focalY === 'number' ? s.focalY : 50,
          }))
        : [],
      activeSlideIndex:
        typeof parsed.activeSlideIndex === 'number' ? parsed.activeSlideIndex : 0,
    }
  } catch {
    return fallback
  }
}

export function saveUgcDraft(draft: UgcSlidesDraft) {
  try {
    localStorage.setItem(ugcDraftStorageKey(), JSON.stringify(draft))
  } catch {
    /* ignore */
  }
}

export function loadImageElement(url: string, options?: UgcRequestOptions): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const signal = options?.signal
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      img.onload = null
      img.onerror = null
      fn()
    }
    const onAbort = () => {
      img.src = ''
      finish(() => reject(new DOMException('Aborted', 'AbortError')))
    }
    const timer = window.setTimeout(() => {
      img.src = ''
      finish(() => reject(new Error(`Timed out loading image after 20s: ${url}`)))
    }, 20000)
    if (signal?.aborted) {
      onAbort()
      return
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    img.onload = () => finish(() => resolve(img))
    img.onerror = () => finish(() => reject(new Error(`Failed to load image: ${url}`)))
    img.src = url
  })
}
