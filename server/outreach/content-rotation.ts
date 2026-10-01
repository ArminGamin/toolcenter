import path from 'node:path'
import { profileDataDir } from './profile-data.js'
import { readJsonFile, writeJsonFile } from './json-store.js'
import type { OutreachSettings } from './types.js'

function rotationFile(settings: OutreachSettings) {
  return path.join(profileDataDir(settings), 'content-rotation.json')
}

export function usesContentRotation(settings: OutreachSettings): boolean {
  return settings.send.rotateSubjects || Boolean(settings.send.useAssetHtml && settings.send.promoHtmlPaths?.length)
}

export function getContentRotationIndex(settings: OutreachSettings, fallback = 0): number {
  const state = readJsonFile<{ nextIndex?: number }>(rotationFile(settings), {})
  const index = state.nextIndex ?? fallback
  return Number.isSafeInteger(index) && index >= 0 ? index : 0
}

export function advanceContentRotation(settings: OutreachSettings, index: number) {
  writeJsonFile(rotationFile(settings), { nextIndex: index + 1 })
}
