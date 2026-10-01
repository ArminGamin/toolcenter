import { T } from '../timing.js'
import { copy } from '../copy.js'
import { lerp, ramp, envelope, easeInOutCubic } from '../easing.js'
import { setOpacity, setBlur } from '../dom.js'

function box(variant) {
  return `<svg class="icon ${variant}" viewBox="0 0 112 112" aria-hidden="true">
    <rect class="g-body" x="18" y="48" width="76" height="50" rx="3"></rect>
    <rect class="g-lid" x="14" y="28" width="84" height="14" rx="2"></rect>
    <rect class="g-ribbon" x="52" y="28" width="8" height="70"></rect>
    <rect class="g-ribbon" x="18" y="68" width="76" height="7"></rect>
  </svg>`
}

function seal(variant) {
  return `<svg class="icon ${variant}" viewBox="0 0 112 112" aria-hidden="true">
    <circle class="seal-ring" cx="56" cy="56" r="34"></circle>
    <circle class="seal-core" cx="56" cy="56" r="26"></circle>
    <rect class="seal-mark" x="49" y="49" width="14" height="14" transform="rotate(45 56 56)"></rect>
  </svg>`
}

export function mountShop(stage) {
  const root = document.createElement('div')
  root.className = 'sheet'
  const cards = copy.cards.map((card) => `
    <article class="card">
      ${card.icon === 'seal' ? seal(card.variant) : box(card.variant)}
      <div>
        <h3 class="card-title">${card.title}</h3>
        <p class="card-note">${card.note}</p>
      </div>
    </article>`).join('')
  root.innerHTML = `
    <div class="toolbar"><span class="dot"></span><span class="url">${copy.url}</span></div>
    <h2 class="kicker">${copy.kicker}</h2>
    <div class="viewport"><div class="track">${cards}</div></div>`
  stage.appendChild(root)
  const viewport = root.querySelector('.viewport')
  const track = root.querySelector('.track')
  const cardEls = [...track.querySelectorAll('.card')]
  const focus = cardEls[3]

  function offset(t) {
    const vh = viewport.clientHeight
    const end = Math.max(0, focus.offsetTop - (vh - focus.offsetHeight) / 2)
    const p = ramp(t, T.shopScroll, easeInOutCubic)
    return lerp(0, end, p)
  }

  return {
    update(t) {
      const enter = ramp(t, T.shopIn)
      const leave = ramp(t, T.shopOut)
      const shown = envelope(t, T.shopIn, T.shopOut)
      setOpacity(root, shown)
      const y = lerp(64, 0, enter) + leave * -28
      const scale = lerp(0.975, 1, enter) * lerp(1, 0.985, leave)
      root.style.transform = `translate3d(0, ${y}px, 0) scale(${scale})`
      const scroll = offset(t)
      const prev = offset(t - 1 / 30)
      const velocityBlur = Math.min(2.2, Math.abs(scroll - prev) * 0.28)
      setBlur(root, (1 - enter) * 6 + leave * 3 + velocityBlur)
      track.style.transform = `translate3d(0, ${-scroll}px, 0)`
      const f = ramp(t, T.focus, easeInOutCubic) * (1 - leave)
      cardEls.forEach((card) => {
        const on = card === focus
        card.style.setProperty('--edge', `${Math.round(on ? lerp(28, 100, f) : lerp(28, 16, f))}%`)
        card.style.opacity = String(on ? 1 : lerp(1, 0.62, f))
        card.style.transform = on ? `translate3d(0, ${lerp(0, -8, f)}px, 0) scale(${lerp(1, 1.02, f)})` : 'none'
      })
    },
  }
}
