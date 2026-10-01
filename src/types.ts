export type IconKey =
  | 'scraper'
  | 'discord'
  | 'mail'
  | 'carousel'
  | 'leads'
  | 'gmail'
  | 'blur'
  | 'video'
  | 'book'
  | 'factory'
  | 'health'
  | 'ollama'
  | 'database'
  | 'markets'
  | 'notes'
  | 'outreach'
  | 'pipeline'
  | 'seoBlog'
  | 'groupPoster'
  | 'redditCommenter'
  | 'ugcSlides'
  | 'oneShot'
  | 'car'

export type SettingFieldType =
  | 'text'
  | 'password'
  | 'number'
  | 'select'
  | 'html'
  | 'textarea'
  | 'checkbox'

export interface SettingField {
  key: string
  label: string
  type: SettingFieldType
  options?: string[]
  /** Dynamic options loaded from Control Center (e.g. installed Ollama models). */
  optionsFrom?: 'ollama_models'
}

export interface ToolAsset {
  key: string
  label: string
  file: string
  type: 'html' | 'text'
}

export interface ToolLaunchOption {
  id: string
  label: string
  launch: string
  processMatch?: string
  outputPath?: string
}

export interface Tool {
  id: string
  name: string
  icon: IconKey
  accent: string
  status: 'active' | 'paused'
  removed: boolean
  path: string
  launch: string
  launchOptions?: ToolLaunchOption[]
  blurb: string
  category: string
  processMatch?: string
  settingsFile?: string
  settings?: SettingField[]
  assets?: ToolAsset[]
  actions?: { id: string; label: string }[]
}

export interface ToolProfile {
  name: string
  updatedAt: string
  settings: Record<string, string>
  assets: Record<string, string>
}
