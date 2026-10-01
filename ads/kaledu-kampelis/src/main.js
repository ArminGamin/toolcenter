import { T, DURATION, WIDTH, HEIGHT } from './timing.js'
import { lerp, ramp } from './easing.js'
import { setOpacity } from './dom.js'
import { mountHook } from './scenes/hook.js'
import { mountOverwhelm } from './scenes/overwhelm.js'
import { mountShop } from './scenes/shop.js'
import { mountSolution, mountCalm } from './scenes/lines.js'
import { mountEnd } from './scenes/endcard.js'

const stage = document.querySelector('#stage')

function mulberry32(seed) {
  return function rand() {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function mountBackground() {
  const bg = document.createElement('div')
  bg.className = 'bg'
  const glow = document.createElement('div')
  glow.className = 'glow'
  stage.append(bg, glow)
  const rand = mulberry32(7)
  const motes = Array.from({ length: 12 }, () => {
    const el = document.createElement('div')
    el.className = 'mote'
    const edge = Math.floor(rand() * 4)
    const x = edge < 2 ? rand() * WIDTH : edge === 2 ? rand() * 120 : WIDTH - rand() * 130
    const y = edge === 0 ? rand() * 320 : edge === 1 ? 1580 + rand() * 280 : rand() * HEIGHT
    const size = 3 + rand() * 5
    el.style.width = `${size}px`
    el.style.height = `${size}px`
    el.dataset.x = String(x)
    el.dataset.y = String(y)
    el.dataset.phase = String(rand() * Math.PI * 2)
    el.dataset.speed = String(0.45 + rand() * 0.4)
    stage.appendChild(el)
    return el
  })
  const grain = document.createElement('canvas')
  grain.width = 180
  grain.height = 180
  const ctx = grain.getContext('2d')
  const img = ctx.createImageData(180, 180)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 180 + Math.floor(rand() * 70)
    img.data[i] = v
    img.data[i + 1] = v
    img.data[i + 2] = v
    img.data[i + 3] = 46
  }
  ctx.putImageData(img, 0, 0)
  const grainEl = document.createElement('div')
  grainEl.className = 'grain'
  grainEl.style.backgroundImage = `url(${grain.toDataURL()})`
  const vignette = document.createElement('div')
  vignette.className = 'vignette'
  stage.append(vignette, grainEl)

  return {
    update(t) {
      const calm = ramp(t, [4.9, 7.2])
      const gx = lerp(42, 50, calm)
      const gy = lerp(36, 42, calm)
      bg.style.setProperty('--gx', `${gx}%`)
      bg.style.setProperty('--gy', `${gy}%`)
      bg.style.transform = `scale(${lerp(1.05, 1.12, t / DURATION)})`
      glow.style.transform = `translate3d(${lerp(180, 140, calm)}px, ${lerp(280, 420, ramp(t, [12.8, 14]))}px, 0)`
      const moteFade = 1 - ramp(t, T.endIn) * 0.7
      motes.forEach((el) => {
        const phase = Number(el.dataset.phase)
        const speed = Number(el.dataset.speed)
        const y = Number(el.dataset.y) + Math.sin(t * speed + phase) * 10
        el.style.transform = `translate3d(${el.dataset.x}px, ${y}px, 0)`
        setOpacity(el, (0.08 + 0.16 * (0.5 + 0.5 * Math.sin(t * speed + phase))) * moteFade)
      })
    },
  }
}

const scenes = [
  mountBackground(),
  mountHook(stage),
  mountOverwhelm(stage),
  mountShop(stage),
  mountSolution(stage),
  mountCalm(stage),
  mountEnd(stage),
]

function seek(t) {
  const time = Math.min(DURATION, Math.max(0, t))
  for (const scene of scenes) scene.update(time)
}

window.seek = seek

const manual = new URLSearchParams(location.search).has('manual')
if (!manual) {
  const start = performance.now()
  const loop = (now) => {
    seek(((now - start) / 1000) % DURATION)
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
} else {
  seek(0)
}
