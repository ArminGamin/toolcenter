import { T } from '../timing.js'
import { copy } from '../copy.js'
import { lerp, ramp } from '../easing.js'
import { setOpacity, setBlur } from '../dom.js'

const LINES = [
  { text: copy.hook[0], range: null },
  { text: copy.hook[1], range: T.hookLine2 },
  { text: copy.hook[2].replace('?', '<em>?</em>'), range: T.hookLine3 },
]

export function mountHook(stage) {
  const root = document.createElement('div')
  root.className = 'scene hook'
  root.innerHTML = LINES.map((line) => `<p class="hook-line">${line.text}</p>`).join('') + '<div class="rule"></div>'
  stage.appendChild(root)
  const lines = [...root.querySelectorAll('.hook-line')]
  const rule = root.querySelector('.rule')

  return {
    update(t) {
      const leave = ramp(t, T.hookOut)
      const drift = ramp(t, T.hookDrift) * -12
      setOpacity(root, 1 - leave)
      root.style.transform = `translate3d(0, ${drift + leave * -36}px, 0)`
      lines.forEach((line, i) => {
        const p = LINES[i].range ? ramp(t, LINES[i].range) : 1
        setOpacity(line, p)
        line.style.transform = `translate3d(0, ${(1 - p) * 26}px, 0)`
        setBlur(line, (1 - p) * 6)
      })
      rule.style.transform = `scaleX(${ramp(t, T.hookRule)})`
    },
  }
}
