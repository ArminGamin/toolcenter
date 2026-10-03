export const BUSINESS_PROFILE_STORAGE_KEY = 'toolsai-business-profile-v1'
export const DEFAULT_BUSINESS_PROFILE_ID = 'tavo-knyga'
export const CHRISTMAS_BUSINESS_PROFILE_ID = 'christmas-gifts'
export const BUSINESS_PROFILE_CHANGED_EVENT = 'toolsai-business-profile-changed'
/** Last workspace picked; new windows and app restarts open on it. */
const LAST_BUSINESS_PROFILE_KEY = 'cc.last-business-profile'

export type BusinessProfile = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  migrated?: boolean
}

declare global {
  interface Window {
    __CC_AUTH__?: string
    __CC_PROFILE_FETCH_INSTALLED__?: boolean
  }
}

export function activeBusinessProfileId(): string {
  // sessionStorage is intentionally tab-local: two open Tool Center tabs may
  // represent two different businesses without changing each other.
  try {
    const legacy = localStorage.getItem(BUSINESS_PROFILE_STORAGE_KEY)
    if (legacy) {
      // A few embedded/browser test environments expose localStorage but not a
      // writable sessionStorage. The migration must still return the selected
      // profile in that case.
      let sessionStored = false
      try {
        sessionStorage.setItem(BUSINESS_PROFILE_STORAGE_KEY, legacy)
        sessionStored = true
      } catch {
        /* keep the local value usable for this runtime */
      }
      if (sessionStored) {
        try {
          localStorage.removeItem(BUSINESS_PROFILE_STORAGE_KEY)
        } catch {
          /* ignore storage cleanup failures */
        }
      }
      return legacy
    }
    try {
      const sessionId = sessionStorage.getItem(BUSINESS_PROFILE_STORAGE_KEY)
      if (sessionId) return sessionId
    } catch {
      /* fall through to the last-used profile */
    }
    return localStorage.getItem(LAST_BUSINESS_PROFILE_KEY) || DEFAULT_BUSINESS_PROFILE_ID
  } catch {
    return DEFAULT_BUSINESS_PROFILE_ID
  }
}

export function setActiveBusinessProfileId(id: string) {
  sessionStorage.setItem(BUSINESS_PROFILE_STORAGE_KEY, id)
  try {
    localStorage.setItem(LAST_BUSINESS_PROFILE_KEY, id)
  } catch {
    /* session choice still applies */
  }
  window.dispatchEvent(new CustomEvent(BUSINESS_PROFILE_CHANGED_EVENT, { detail: { id } }))
}

/** Browser-local settings (rail, orbit tools) scoped per business workspace. */
export function profileLocalStorageKey(base: string): string {
  return `${base}::${activeBusinessProfileId()}`
}

export function installBusinessProfileFetch() {
  if (window.__CC_PROFILE_FETCH_INSTALLED__) return
  window.__CC_PROFILE_FETCH_INSTALLED__ = true
  const nativeFetch = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const rawUrl = input instanceof Request ? input.url : String(input)
    const url = new URL(rawUrl, window.location.origin)
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) {
      return nativeFetch(input, init)
    }
    const headers = new Headers(input instanceof Request ? input.headers : undefined)
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value))
    headers.set('X-CC-Profile', activeBusinessProfileId())
    if (window.__CC_AUTH__) headers.set('X-CC-Token', window.__CC_AUTH__)
    return nativeFetch(input, { ...init, headers })
  }
}

async function profileRequest(body?: Record<string, unknown>): Promise<{
  ok: boolean
  profiles: BusinessProfile[]
  message?: string
}> {
  try {
    const response = await fetch('/api/business-profiles',
      body
        ? {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
        : undefined,
    )
    const data = (await response.json()) as {
      ok?: boolean
      profiles?: BusinessProfile[]
      message?: string
    }
    return {
      ok: response.ok && Boolean(data.ok),
      profiles: data.profiles || [],
      message: data.message,
    }
  } catch {
    return { ok: false, profiles: [], message: 'Profile service is offline' }
  }
}

export function fetchBusinessProfiles() {
  return profileRequest()
}

export function createBusinessProfile(name: string) {
  return profileRequest({ action: 'create', name })
}

export function renameBusinessProfile(id: string, name: string) {
  return profileRequest({ action: 'rename', id, name })
}

export function deleteBusinessProfile(id: string) {
  return profileRequest({ action: 'delete', id })
}
