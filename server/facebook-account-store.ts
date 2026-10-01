import path from 'node:path'
import {
  CHRISTMAS_BUSINESS_PROFILE_ID,
  DEFAULT_BUSINESS_PROFILE_ID,
  businessProfileDataDir,
  currentBusinessProfile,
  runWithBusinessProfile,
} from './business-profiles.js'

/** Kalėdų Kampelis uses Tavo Knyga's Facebook account; other profiles stay isolated. */
export function facebookAccountProfileId(): string {
  return currentBusinessProfile().id === CHRISTMAS_BUSINESS_PROFILE_ID
    ? DEFAULT_BUSINESS_PROFILE_ID
    : currentBusinessProfile().id
}

export function sharesFacebookAccountWithTavo(): boolean {
  return currentBusinessProfile().id === CHRISTMAS_BUSINESS_PROFILE_ID
}

export function facebookAccountDataDir(...parts: string[]): string {
  return path.join(businessProfileDataDir(facebookAccountProfileId()), ...parts)
}

export function facebookBrandDataDir(...parts: string[]): string {
  return path.join(businessProfileDataDir(currentBusinessProfile().id), ...parts)
}

export function withFacebookAccount<T>(fn: () => T): T {
  const id = facebookAccountProfileId()
  if (id === currentBusinessProfile().id) return fn()
  return runWithBusinessProfile(id, fn)
}
