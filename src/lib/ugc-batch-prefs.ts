const BATCH_PREFS_KEY = 'cc-ugc-batch-prefs-v3'

export function loadBatchPrefsTestMode(): boolean {
  try {
    let raw = localStorage.getItem(BATCH_PREFS_KEY)
    if (!raw) raw = localStorage.getItem('cc-ugc-batch-prefs-v2')
    if (!raw) raw = localStorage.getItem('cc-ugc-batch-prefs-v1')
    if (!raw) return false
    const p = JSON.parse(raw) as { testMode?: boolean }
    return p.testMode === true
  } catch {
    return false
  }
}

export function saveBatchPrefsTestMode(testMode: boolean) {
  try {
    let raw = localStorage.getItem(BATCH_PREFS_KEY)
    const prefs = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    prefs.testMode = testMode
    localStorage.setItem(BATCH_PREFS_KEY, JSON.stringify(prefs))
  } catch {
    localStorage.setItem(BATCH_PREFS_KEY, JSON.stringify({ testMode }))
  }
}

export function parseBatchTestModeSetting(raw?: string): boolean | null {
  if (raw === 'true') return true
  if (raw === 'false') return false
  return null
}
