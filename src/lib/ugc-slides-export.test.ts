import { describe, expect, it } from 'vitest'
import {
  buildUgcSlideIndexFilename,
  buildUgcSlideshowZipFilename,
} from './ugc-slides-export'
import { slideRoleForIndex } from './ugc-slides'

describe('buildUgcSlideshowZipFilename', () => {
  it('uses slideshow prefix and timestamp', () => {
    const name = buildUgcSlideshowZipFilename(new Date('2026-08-02T14:30:45'))
    expect(name).toBe('tavo-knyga-ugc-slideshow-20260802-143045.zip')
  })
})

describe('buildUgcSlideIndexFilename', () => {
  it('zero-pads slide numbers', () => {
    expect(buildUgcSlideIndexFilename(0)).toBe('slide_01.png')
    expect(buildUgcSlideIndexFilename(9)).toBe('slide_10.png')
  })
})

describe('slideRoleForIndex', () => {
  it('assigns hook, value, and close roles', () => {
    expect(slideRoleForIndex(0, 4)).toBe('hook')
    expect(slideRoleForIndex(1, 4)).toBe('value')
    expect(slideRoleForIndex(2, 4)).toBe('value')
    expect(slideRoleForIndex(3, 4)).toBe('close')
  })
})
