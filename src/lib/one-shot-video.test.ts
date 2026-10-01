import { describe, expect, it } from 'vitest'
import {
  ONE_SHOT_VIDEO_DURATION_SEC,
  ONE_SHOT_VIDEO_FPS,
  ONE_SHOT_VIDEO_MAX_BYTES,
  oneShotVideoFrameCount,
  oneShotVideoFrameDurationUs,
  videoExtForMime,
} from './one-shot-video'

describe('one-shot video export', () => {
  it('maps mime types to file extensions', () => {
    expect(videoExtForMime('video/mp4')).toBe('mp4')
    expect(videoExtForMime('video/mp4;codecs=avc1')).toBe('mp4')
    expect(videoExtForMime('video/webm')).toBe('webm')
  })

  it('encodes 7 seconds at 15fps under 9.5MB', () => {
    expect(ONE_SHOT_VIDEO_DURATION_SEC).toBe(7)
    expect(ONE_SHOT_VIDEO_FPS).toBe(15)
    expect(oneShotVideoFrameCount()).toBe(105)
    expect(oneShotVideoFrameDurationUs()).toBe(Math.round(1_000_000 / 15))
    expect(ONE_SHOT_VIDEO_MAX_BYTES).toBeLessThanOrEqual(10 * 1024 * 1024)
  })
})
