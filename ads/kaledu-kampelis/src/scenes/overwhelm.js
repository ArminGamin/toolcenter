import { T } from '../timing.js'
import { copy } from '../copy.js'
import { lerp, ramp, envelope } from '../easing.js'
import { setOpacity, setBlur } from '../dom.js'

const PLACED = [
  { text: 'Mamai', x: 96, y: 430, rot: -4.5, size: 34, depth: 0.7, phase: 0.2 },
  { text: 'Jam', x: 610, y: 400, rot: 3.5, size: 30, depth: 0.45, phase: 1.1 },
  { text: 'Jai', x: 150, y: 640, rot: 3, size: 28, depth: 0.2, phase: 2.2 },
  { text: 'Porai', x: 500, y: 600, rot: -2, size: 44, depth: 1, phase: 0.6 },
  { text: 'Kolegai', x: 280, y: 860, rot: 2.2, size: 34, depth: 0.62, phase: 1.7 },
]

export function mountOverwhelm(stage) {
  const root = document.createElement('div')
  root.className = 'scene'
  const labels = PLACED.map((item, i) => {
    const el = document.createElement('div')
    el.className = 'label'
    el.textContent = copy.labels[i]
    el.style.fontSize = `${item.size}px`
    el.style.zIndex = String(3 + Math.round(item.depth * 5))
    root.appendChild(el)
    return el
  })
  const copyEl = document.createElement('div')
  copyEl.className = 'overwhelm-copy'
  copyEl.innerHTML = `<p class="ow-line">${copy.overwhelm[0]}</p><p class="ow-line">${copy.overwhelm[1]}<em>${copy.overwhelm[2]}</em></p>`
  root.appendChild(copyEl)
  stage.appendChild(root)
  const lines = [...copyEl.querySelectorAll('.ow-line')]

  return {
    update(t) {
      labels.forEach((el, i) => {
        const item = PLACED[i]
        const enter = ramp(t, [T.labelIn + i * T.labelStagger, T.labelIn + i * T.labelStagger + T.labelInDur])
        const leave = ramp(t, T.labelOut)
        const amp = lerp(12, 4, item.depth)
        const float = Math.sin(t * 0.8 + item.phase) * amp
        const o = enter * (1 - leave) * lerp(0.55, 1, item.depth)
        setOpacity(el, o)
        setBlur(el, (1 - enter) * 7 + leave * 3 + (1 - item.depth) * 0.7)
        el.style.transform = `translate3d(${item.x}px, ${item.y + float + (1 - enter) * 22 + leave * -18}px, 0) rotate(${item.rot}deg)`
      })
      const block = envelope(t, [T.overwhelmCopy1[0], T.overwhelmCopy2[1]], T.overwhelmCopyOut)
      setOpacity(copyEl, block)
      lines.forEach((line, i) => {
        const p = ramp(t, i === 0 ? T.overwhelmCopy1 : T.overwhelmCopy2)
        setOpacity(line, p)
        line.style.transform = `translate3d(0, ${(1 - p) * 18}px, 0)`
      })
    },
  }
}
