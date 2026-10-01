export type ColorTheme = 'paper' | 'slate'
export type ReadingSize = 'comfortable' | 'large'
export type Appearance = { theme: ColorTheme; textSize: ReadingSize }

export const APPEARANCE_KEY = 'cc.appearance.v2'
/** v1 defaulted to oversized text; only its colour choice is carried forward. */
const LEGACY_APPEARANCE_KEY = 'cc.appearance.v1'
export const DEFAULT_APPEARANCE: Appearance = { theme: 'paper', textSize: 'comfortable' }

export const APPEARANCE_PALETTES = {
  /* Light: neutral surfaces, one blue accent */
  paper: {
    'surface-page': '#f3f4f7', 'surface-panel': '#fcfcfd', 'surface-card': '#f8f9fb',
    'surface-lift': '#eef0f4', 'surface-input': '#fcfcfd',
    'text-primary': '#111827', 'text-secondary': '#334155', 'text-muted': '#4b5563',
    'accent-brass': '#1d4ed8', 'accent-success': '#047857', 'accent-danger': '#b91c1c',
    'accent-violet': '#6d28d9', 'on-accent': '#f8fafc', 'tool-contrast': '#111827',
    'border-color': '#64748b', 'shadow-color': '#0f172a',
  },
  /* Dark: true dark surfaces with soft, high-contrast text */
  slate: {
    'surface-page': '#0e1116', 'surface-panel': '#161a22', 'surface-card': '#1b2029',
    'surface-lift': '#232936', 'surface-input': '#11151c',
    'text-primary': '#f1f3f7', 'text-secondary': '#cdd3de', 'text-muted': '#a3abba',
    'accent-brass': '#93c5fd', 'accent-success': '#6ee7b7', 'accent-danger': '#fca5a5',
    'accent-violet': '#c4b5fd', 'on-accent': '#111827', 'tool-contrast': '#f1f3f7',
    'border-color': '#94a3b8', 'shadow-color': '#05070a',
  },
} as const

export function normalizeAppearance(value: unknown): Appearance {
  const settings = value && typeof value === 'object' ? value as Partial<Appearance> : {}
  return {
    theme: settings.theme === 'slate' ? 'slate' : 'paper',
    textSize: settings.textSize === 'large' ? 'large' : 'comfortable',
  }
}

export function readAppearance(): Appearance {
  try {
    const stored = localStorage.getItem(APPEARANCE_KEY)
    if (stored) return normalizeAppearance(JSON.parse(stored))
    const legacy = normalizeAppearance(JSON.parse(localStorage.getItem(LEGACY_APPEARANCE_KEY) || 'null'))
    return { ...DEFAULT_APPEARANCE, theme: legacy.theme }
  } catch {
    return { ...DEFAULT_APPEARANCE }
  }
}

export function applyAppearance(settings: Appearance) {
  const root = document.documentElement
  root.dataset.colorTheme = settings.theme
  root.dataset.readingSize = settings.textSize
  root.style.setProperty('--reading-scale', settings.textSize === 'large' ? '1.133' : '1')
  root.style.setProperty('--tool-accent-share', settings.theme === 'paper' ? '45%' : '55%')
  for (const [token, hex] of Object.entries(APPEARANCE_PALETTES[settings.theme])) {
    const rgb = [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16)).join(' ')
    root.style.setProperty(`--${token}`, rgb)
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', APPEARANCE_PALETTES[settings.theme]['surface-page'])
}

export function saveAppearance(settings: Appearance): boolean {
  applyAppearance(settings)
  try {
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify(settings))
    return true
  } catch {
    return false
  }
}

export function initializeAppearance() {
  applyAppearance(readAppearance())
  window.addEventListener('storage', event => {
    if (event.key === APPEARANCE_KEY || event.key === null) applyAppearance(readAppearance())
  })
}

export function readableToolAccent(accent: string): string {
  return `color-mix(in srgb, ${accent} var(--tool-accent-share), rgb(var(--tool-contrast)))`
}
