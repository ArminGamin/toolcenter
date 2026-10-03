import { useEffect } from 'react'
import { fetchHubSummary, hubModuleLive } from './hub'

export type FinishSound = 'chime' | 'bell' | 'pop' | 'arcade' | 'marimba' | 'off'

export const FINISH_SOUND_KEY = 'cc.finish-sound.v1'
export const DEFAULT_FINISH_SOUND: FinishSound = 'chime'

export const FINISH_SOUNDS: { id: FinishSound; name: string; description: string }[] = [
  { id: 'chime', name: 'Chime', description: 'Soft rising notes' },
  { id: 'bell', name: 'Bell', description: 'One clear ring' },
  { id: 'pop', name: 'Pop', description: 'Short and quiet' },
  { id: 'arcade', name: 'Arcade', description: 'Level-up jingle' },
  { id: 'marimba', name: 'Marimba', description: 'Warm wooden tones' },
  { id: 'off', name: 'Off', description: 'No sound' },
]

export function readFinishSound(): FinishSound {
  try {
    const value = localStorage.getItem(FINISH_SOUND_KEY)
    if (FINISH_SOUNDS.some((s) => s.id === value)) return value as FinishSound
  } catch {
    /* default */
  }
  return DEFAULT_FINISH_SOUND
}

export function saveFinishSound(sound: FinishSound) {
  try {
    localStorage.setItem(FINISH_SOUND_KEY, sound)
  } catch {
    /* session only */
  }
}

let ctx: AudioContext | null = null

type Note = { freq: number; at: number; dur: number; type?: OscillatorType; gain?: number; slideTo?: number }

function playNotes(notes: Note[]) {
  ctx ??= new AudioContext()
  const audio = ctx
  void audio.resume()
  const start = audio.currentTime + 0.02
  const master = audio.createGain()
  master.gain.value = 0.35
  master.connect(audio.destination)
  for (const n of notes) {
    const osc = audio.createOscillator()
    const env = audio.createGain()
    osc.type = n.type ?? 'sine'
    const t = start + n.at
    osc.frequency.setValueAtTime(n.freq, t)
    if (n.slideTo) osc.frequency.exponentialRampToValueAtTime(n.slideTo, t + n.dur)
    env.gain.setValueAtTime(0.0001, t)
    env.gain.exponentialRampToValueAtTime(n.gain ?? 0.6, t + 0.012)
    env.gain.exponentialRampToValueAtTime(0.0001, t + n.dur)
    osc.connect(env).connect(master)
    osc.start(t)
    osc.stop(t + n.dur + 0.05)
  }
}

const PATTERNS: Record<Exclude<FinishSound, 'off'>, Note[]> = {
  chime: [
    { freq: 784, at: 0, dur: 0.5 },
    { freq: 988, at: 0.12, dur: 0.5 },
    { freq: 1319, at: 0.24, dur: 0.9 },
  ],
  bell: [
    { freq: 880, at: 0, dur: 1.6, gain: 0.55 },
    { freq: 1760, at: 0, dur: 0.9, gain: 0.18 },
    { freq: 2640, at: 0, dur: 0.5, gain: 0.08 },
  ],
  pop: [{ freq: 520, at: 0, dur: 0.14, slideTo: 1040, gain: 0.7 }],
  arcade: [
    { freq: 523, at: 0, dur: 0.1, type: 'square', gain: 0.25 },
    { freq: 659, at: 0.09, dur: 0.1, type: 'square', gain: 0.25 },
    { freq: 784, at: 0.18, dur: 0.1, type: 'square', gain: 0.25 },
    { freq: 1047, at: 0.27, dur: 0.3, type: 'square', gain: 0.25 },
  ],
  marimba: [
    { freq: 587, at: 0, dur: 0.35, type: 'triangle', gain: 0.8 },
    { freq: 880, at: 0.16, dur: 0.45, type: 'triangle', gain: 0.8 },
  ],
}

export function playFinishSound(sound: FinishSound = readFinishSound()) {
  if (sound === 'off') return
  try {
    playNotes(PATTERNS[sound])
  } catch {
    /* audio unavailable */
  }
}

/** Plays the chosen sound whenever any automation (any workspace) stops running. */
export function useTaskFinishSound() {
  useEffect(() => {
    let alive = true
    let previous: Map<string, boolean> | null = null
    async function tick() {
      const summary = await fetchHubSummary('all')
      if (!alive || !summary) return
      const next = new Map<string, boolean>()
      let finished = false
      for (const m of summary.modules) {
        const key = `${m.profileId ?? ''}:${m.id}`
        const live = hubModuleLive(m)
        next.set(key, live)
        if (previous?.get(key) && !live) finished = true
      }
      previous = next
      if (finished) playFinishSound()
    }
    void tick()
    const id = window.setInterval(() => void tick(), 4000)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [])
}
