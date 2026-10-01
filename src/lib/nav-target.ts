export const NAV_TARGET_KEY = 'cc-nav-target'

export type NavTarget = {
  module: string
  id: string
  kind: string
}

export function setNavTarget(target: NavTarget) {
  try {
    sessionStorage.setItem(NAV_TARGET_KEY, JSON.stringify(target))
  } catch {
    /* ignore */
  }
}

export function consumeNavTarget(): NavTarget | null {
  try {
    const raw = sessionStorage.getItem(NAV_TARGET_KEY)
    sessionStorage.removeItem(NAV_TARGET_KEY)
    if (!raw) return null
    return JSON.parse(raw) as NavTarget
  } catch {
    return null
  }
}
