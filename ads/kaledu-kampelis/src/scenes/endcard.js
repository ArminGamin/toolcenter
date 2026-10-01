import { T } from '../timing.js'
import { copy } from '../copy.js'
import { ramp } from '../easing.js'
import { setOpacity } from '../dom.js'

export function mountEnd(stage) {
  const root = document.createElement('div')
  root.className = 'scene end'
  root.innerHTML = `
    <p class="brand">${copy.brand[0]}</p>
    <p class="brand">${copy.brand[1]}</p>
    <div class="end-rule"></div>
    <p class="cta-lead">${copy.ctaLead}</p>
    <p class="cta-url">${copy.ctaUrl}</p>`
  stage.appendChild(root)
  const brands = [...root.querySelectorAll('.brand')]
  const rule = root.querySelector('.end-rule')
  const cta = [...root.querySelectorAll('.cta-lead, .cta-url')]

  return {
    update(t) {
      const shown = ramp(t, T.endIn)
      setOpacity(root, shown)
      brands.forEach((el, i) => {
        const p = ramp(t, [T.endIn[0] + i * 0.06, T.endIn[1] + i * 0.06])
        el.style.transform = `translate3d(0, ${(1 - p) * 18}px, 0)`
        setOpacity(el, p)
      })
      rule.style.transform = `scaleX(${ramp(t, T.endRule)})`
      cta.forEach((el) => setOpacity(el, ramp(t, T.endCta)))
    },
  }
}
