export function setOpacity(el, value) {
  const o = value <= 0.004 ? 0 : value >= 0.996 ? 1 : value
  el.style.opacity = o === 0 || o === 1 ? String(o) : o.toFixed(3)
  el.style.visibility = o === 0 ? 'hidden' : 'visible'
}

export function setBlur(el, px) {
  el.style.filter = px < 0.08 ? 'none' : `blur(${px.toFixed(2)}px)`
}
