/**
 * Adaptive GPU layer count for the UGC model on the 8GB RX 5700 XT.
 *
 * Bench (2026-10-02, idle desktop): 32 layers → 7.0 tok/s, 44 → 11 tok/s, 46 → 12–13.8 tok/s.
 * But VRAM is shared with the desktop, Electron and canvas rendering: during a real batch
 * 44 layers spilled into shared memory and dropped to ~4.4 tok/s (slower than 32) and the
 * first draft call of several posts hit the 90 s timeout. So the layer count is measured
 * live: a slow call steps down 4 layers; each new batch probes one step back up.
 * Same model and weights at every layer count — only where the layers run changes.
 */
import fs from 'node:fs'
import path from 'node:path'
import { CC_DATA } from './cc-services.js'

export const UGC_GPU_LADDER = [44, 40, 36, 32] as const
export const UGC_GPU_MIN_LAYERS = 32
export const UGC_GPU_MAX_LAYERS = 44
/** Below this a non-spilled run is never this slow (32 layers measured ~7 tok/s). */
export const UGC_GPU_SLOW_TOKENS_PER_SEC = 6

const STATE_FILE = path.join(CC_DATA, 'ugc-gpu-layers.json')

type TunerState = { layers: number; loaded: boolean; history: Array<{ at: string; layers: number; reason: string }> }

const state: TunerState = { layers: UGC_GPU_MAX_LAYERS, loaded: false, history: [] }

function load() {
  if (state.loaded) return
  state.loaded = true
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as { layers?: number }
    if (typeof parsed.layers === 'number') state.layers = clamp(parsed.layers)
  } catch {
    /* first run starts at the top of the ladder */
  }
}

function clamp(n: number): number {
  return Math.max(UGC_GPU_MIN_LAYERS, Math.min(UGC_GPU_MAX_LAYERS, Math.round(n)))
}

function save(reason: string) {
  if (process.env.VITEST) return
  state.history.push({ at: new Date().toISOString(), layers: state.layers, reason })
  state.history = state.history.slice(-20)
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true })
    fs.writeFileSync(STATE_FILE, `${JSON.stringify({ layers: state.layers, history: state.history }, null, 2)}\n`, 'utf8')
  } catch {
    /* the tuner works in memory if the file cannot be written */
  }
}

export function ugcTunedGpuLayers(): number {
  load()
  return state.layers
}

/** New batch: probe one step up from the last good value (conditions may have improved). */
export function ugcGpuTunerBatchStart(): number {
  load()
  const next = clamp(state.layers + 4)
  if (next !== state.layers) {
    state.layers = next
    save('batch_start_probe_up')
  }
  return state.layers
}

/**
 * Record one finished UGC call. Slow generation (or a timeout) at the current layer count
 * means VRAM spilled — step down so the next call runs fully in dedicated memory.
 */
export function noteUgcGpuCall(stat: {
  outcome: string
  evalCount?: number
  evalDurationNs?: number
  numGpu?: number
}): { stepped: boolean; layers: number; tokensPerSec?: number } {
  load()
  if (stat.numGpu !== state.layers || state.layers <= UGC_GPU_MIN_LAYERS) return { stepped: false, layers: state.layers }
  const timedOut = stat.outcome === 'timeout' || stat.outcome === 'partial'
  const tps =
    stat.evalCount && stat.evalDurationNs && stat.evalCount >= 60 ? stat.evalCount / (stat.evalDurationNs / 1e9) : undefined
  const slow = timedOut || (tps !== undefined && tps < UGC_GPU_SLOW_TOKENS_PER_SEC)
  if (!slow) return { stepped: false, layers: state.layers, tokensPerSec: tps }
  state.layers = clamp(state.layers - 4)
  save(timedOut ? 'timeout' : `slow ${tps?.toFixed(1)} tok/s`)
  return { stepped: true, layers: state.layers, tokensPerSec: tps }
}

/** Test hook. */
export function resetUgcGpuTunerForTests(layers = UGC_GPU_MAX_LAYERS) {
  state.layers = layers
  state.loaded = true
  state.history = []
}
