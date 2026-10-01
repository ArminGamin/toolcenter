export function clamp(v, a = 0, b = 1) {
  return Math.min(b, Math.max(a, v))
}

export function lerp(a, b, t) {
  return a + (b - a) * t
}

export function invLerp(a, b, t) {
  if (a === b) return t >= b ? 1 : 0
  return clamp((t - a) / (b - a))
}

export function easeOutCubic(t) {
  return 1 - (1 - t) ** 3
}

export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2
}

export function ramp(t, range, ease = easeOutCubic) {
  return ease(invLerp(range[0], range[1], t))
}

export function envelope(t, enter, exit, ease = easeInOutCubic) {
  return ramp(t, enter, ease) * (1 - ramp(t, exit, ease))
}
