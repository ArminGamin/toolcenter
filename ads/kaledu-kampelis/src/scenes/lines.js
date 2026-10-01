import { T } from '../timing.js'
import { copy } from '../copy.js'
import { ramp, envelope } from '../easing.js'
import { setOpacity } from '../dom.js'

function poster(stage, lines) {
  const root = document.createElement('div')
  root.className = 'scene poster'
  root.innerHTML = lines.map((line) => `<p>${line}</p>`).join('')
  stage.appendChild(root)
  return root
}

export function mountSolution(stage) {
  const root = poster(stage, copy.solution)
  return {
    update(t) {
      const p = envelope(t, T.solutionIn, T.solutionOut)
      setOpacity(root, p)
      root.style.transform = `translate3d(0, ${(1 - ramp(t, T.solutionIn)) * 18}px, 0)`
    },
  }
}

export function mountCalm(stage) {
  const root = poster(stage, [copy.calm])
  return {
    update(t) {
      const p = envelope(t, T.calmIn, T.calmOut)
      setOpacity(root, p)
      root.style.transform = `translate3d(0, ${(1 - ramp(t, T.calmIn)) * 16}px, 0)`
    },
  }
}
