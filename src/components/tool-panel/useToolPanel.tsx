import type { ToolPanelProps } from '../ToolPanel'
import { useEffect, useRef, useState } from 'react'
import {
    clearConsole,
    deleteProfile,
    fetchConsole,
    fetchOllamaModels,
    fetchProfiles,
    fetchToolReadiness,
    fetchToolSettings,
    launchTool,
    loadProfile,
    openToolFolder,
    openToolOutputFolder,
    runToolAction,
    saveProfile,
    saveToolSettings,
    stopTool,
    type ToolReadiness,
} from '../../lib/launch'
import { type LogEntry } from '../../lib/logLevels'
import type { Tool } from '../../types'

/** State and handlers for ToolPanel (kept separate from its markup). */
export function useToolPanel({ tool, online, bridgeOk, pinned, onTogglePin, onHome, onUpdate }: ToolPanelProps) {
  const defaultLaunchOptionId = tool.launchOptions?.[0]?.id
  const [nameDraft, setNameDraft] = useState(tool.name)
  const [launchOptionId, setLaunchOptionId] = useState(tool.launchOptions?.[0]?.id)
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<{ ok: boolean; message: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [assets, setAssets] = useState<Record<string, string>>({})
  const [settingsDirty, setSettingsDirty] = useState(false)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [profiles, setProfiles] = useState<{ name: string; updatedAt: string }[]>([])
  const [selectedProfile, setSelectedProfile] = useState('')
  const [profileName, setProfileName] = useState('')
  const [consoleOpen, setConsoleOpen] = useState(true)
  const [consoleEntries, setConsoleEntries] = useState<LogEntry[]>([])
  const [consoleRunning, setConsoleRunning] = useState(false)
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [ollamaModelsMsg, setOllamaModelsMsg] = useState<string | null>(null)
  const [readiness, setReadiness] = useState<ToolReadiness | null>(null)
  const [view, setView] = useState<'launch' | 'settings'>('launch')
  const consoleBoxRef = useRef<HTMLDivElement | null>(null)

  const hasSettings = Boolean(tool.settings?.length)
  const hasAssets = Boolean(tool.assets?.length)
  const needsOllamaModels = Boolean(
    tool.settings?.some((f) => f.optionsFrom === 'ollama_models'),
  )

  async function refreshProfiles() {
    const res = await fetchProfiles(tool.id)
    if (res.ok) {
      setProfiles(res.profiles || [])
      return true
    }
    setProfiles([])
    if (res.message) {
      setToast({ ok: false, message: res.message })
    }
    return false
  }

  useEffect(() => {
    setNameDraft(tool.name)
    setLaunchOptionId(defaultLaunchOptionId)
    setToast(null)
    setCopied(false)
    setSettingsDirty(false)
    setSettings({})
    setAssets({})
    setProfiles([])
    setSelectedProfile('')
    setProfileName('')

    let cancelled = false
    setSettingsLoading(true)
    Promise.all([fetchToolSettings(tool.id), fetchProfiles(tool.id)]).then(
      ([settingsRes, profilesRes]) => {
        if (cancelled) return
        setSettingsLoading(false)
        if (settingsRes.ok) {
          setSettings(settingsRes.values || {})
          setAssets(settingsRes.assets || {})
        } else {
          setToast({
            ok: false,
            message: settingsRes.message || 'Failed to load settings',
          })
        }
        if (profilesRes.ok) {
          setProfiles(profilesRes.profiles || [])
        } else {
          setProfiles([])
          setToast({
            ok: false,
            message: profilesRes.message || 'Failed to load profiles',
          })
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [tool.id, tool.name, defaultLaunchOptionId])

  useEffect(() => {
    let active = true
    setReadiness(null)
    void fetchToolReadiness(tool.id).then((next) => {
      if (active) setReadiness(next)
    })
    return () => {
      active = false
    }
  }, [tool.id])

  useEffect(() => {
    setConsoleOpen(true)
    setConsoleEntries([])
    setConsoleRunning(false)
    setOllamaModels([])
    setOllamaModelsMsg(null)
  }, [tool.id])

  useEffect(() => {
    if (!needsOllamaModels) return
    let cancelled = false
    void fetchOllamaModels().then((res) => {
      if (cancelled) return
      setOllamaModels(res.models || [])
      setOllamaModelsMsg(res.ok ? null : res.message || 'Ollama offline - start it to refresh models')
    })
    return () => {
      cancelled = true
    }
  }, [tool.id, needsOllamaModels])

  useEffect(() => {
    if (!consoleOpen) return
    let alive = true
    async function tick() {
      const res = await fetchConsole(tool.id)
      if (!alive || !res.ok) return
      setConsoleEntries(res.entries || [])
      setConsoleRunning(Boolean(res.running))
    }
    void tick()
    const id = window.setInterval(() => void tick(), 1000)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [consoleOpen, tool.id])

  useEffect(() => {
    // Scroll only the log box - never scrollIntoView (that jumps the whole tool panel)
    const box = consoleBoxRef.current
    if (!consoleOpen || !box) return
    box.scrollTop = box.scrollHeight
  }, [consoleEntries, consoleOpen])

  function patch(partial: Partial<Tool>) {
    onUpdate({ ...tool, ...partial })
  }

  function commitName() {
    const next = nameDraft.trim() || tool.name
    setNameDraft(next)
    if (next !== tool.name) patch({ name: next })
  }

  async function withBusy(key: string, fn: () => Promise<{ ok: boolean; message: string }>) {
    setBusy(key)
    setToast(null)
    const result = await fn()
    setBusy(null)
    setToast(result)
    return result
  }

  async function ensureSettingsSaved(): Promise<boolean> {
    if (!settingsDirty) return true
    const result = await saveToolSettings(tool.id, settings, assets)
    if (!result.ok) {
      setToast({ ok: false, message: result.message || 'Save settings before continuing' })
      return false
    }
    setSettingsDirty(false)
    return true
  }

  async function onLaunch() {
    setConsoleOpen(true)
    setBusy('launch')
    setToast(null)
    if (!(await ensureSettingsSaved())) {
      setBusy(null)
      return
    }
    const result = await launchTool(tool.id, launchOptionId)
    setBusy(null)
    setToast(result)
  }

  async function onStop() {
    setConsoleOpen(true)
    await withBusy('stop', () => stopTool(tool.id))
  }

  async function onOpenFolder() {
    await withBusy('folder', () => openToolFolder(tool.id))
  }

  async function onOpenOutput() {
    await withBusy('output', () => openToolOutputFolder(tool.id, launchOptionId))
  }

  async function onClearConsole() {
    await clearConsole(tool.id)
    setConsoleEntries([])
  }

  async function onAction(actionId: string) {
    setBusy(actionId)
    setToast(null)
    if (!(await ensureSettingsSaved())) {
      setBusy(null)
      return
    }
    const model = settings.OLLAMA_MODEL || undefined
    const result = await runToolAction(tool.id, actionId, model)
    setBusy(null)
    setToast(result)
    if (
      result.ok &&
      (actionId === 'ollama_start' || actionId === 'ollama_pull') &&
      needsOllamaModels
    ) {
      window.setTimeout(() => {
        void fetchOllamaModels().then((res) => {
          setOllamaModels(res.models || [])
          setOllamaModelsMsg(res.ok ? null : res.message || 'Ollama offline')
        })
      }, 1500)
    }
  }

  async function onSaveSettings() {
    const result = await withBusy('settings', () => saveToolSettings(tool.id, settings, assets))
    if (result.ok) setSettingsDirty(false)
  }

  async function onSaveProfile() {
    const name = (profileName || selectedProfile).trim()
    if (!name) {
      setToast({ ok: false, message: 'Enter a profile name first' })
      return
    }
    if (settingsLoading) {
      setToast({ ok: false, message: 'Wait for settings to finish loading' })
      return
    }
    const result = await withBusy('profile-save', () =>
      saveProfile(tool.id, name, settings, assets),
    )
    if (result.ok) {
      setProfileName(name)
      setSelectedProfile(name)
      await refreshProfiles()
    }
  }

  async function onLoadProfile() {
    const name = selectedProfile.trim()
    if (!name) {
      setToast({ ok: false, message: 'Pick a profile to load' })
      return
    }
    setBusy('profile-load')
    setToast(null)
    const result = await loadProfile(tool.id, name)
    setBusy(null)
    setToast({ ok: result.ok, message: result.message })
    if (result.ok) {
      setSettings(result.settings || {})
      setAssets(result.assets || {})
      setSettingsDirty(false)
      setProfileName(name)
    }
  }

  async function onDeleteProfile() {
    const name = selectedProfile.trim()
    if (!name) return
    const result = await withBusy('profile-delete', () => deleteProfile(tool.id, name))
    if (result.ok) {
      setSelectedProfile('')
      setProfileName('')
      await refreshProfiles()
    }
  }

  async function copyPath() {
    try {
      await navigator.clipboard.writeText(tool.path)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setToast({ ok: false, message: 'Clipboard blocked' })
    }
  }

  const running = online || consoleRunning
  const powerLabel = tool.removed ? 'Hidden' : running ? 'Running' : 'Idle'

  return { tool, online, bridgeOk, pinned, onTogglePin, onHome, onUpdate, defaultLaunchOptionId, nameDraft, setNameDraft, launchOptionId, setLaunchOptionId, busy, setBusy, toast, setToast, copied, setCopied, settings, setSettings, assets, setAssets, settingsDirty, setSettingsDirty, settingsLoading, setSettingsLoading, profiles, setProfiles, selectedProfile, setSelectedProfile, profileName, setProfileName, consoleOpen, setConsoleOpen, consoleEntries, setConsoleEntries, consoleRunning, setConsoleRunning, ollamaModels, setOllamaModels, ollamaModelsMsg, setOllamaModelsMsg, readiness, setReadiness, view, setView, consoleBoxRef, hasSettings, hasAssets, needsOllamaModels, refreshProfiles, patch, commitName, withBusy, ensureSettingsSaved, onLaunch, onStop, onOpenFolder, onOpenOutput, onClearConsole, onAction, onSaveSettings, onSaveProfile, onLoadProfile, onDeleteProfile, copyPath, running, powerLabel }
}

export type ToolPanelVm = ReturnType<typeof useToolPanel>
