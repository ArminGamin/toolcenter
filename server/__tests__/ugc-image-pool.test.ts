import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  NEW_IMAGES_DIR,
  USED_IMAGES_DIR,
  consumeUgcImage,
  getUgcImagePoolStatus,
  listNewUgcImages,
  pickBatchUgcImages,
  resetUgcImagePoolState,
} from '../ugc-image-pool.js'

const TEST_FILES = ['__vitest-batch-a.jpg', '__vitest-batch-b.jpg', '__vitest-batch-c.jpg']
const STASH_DIR = path.join(NEW_IMAGES_DIR, '..', '.vitest-image-stash')

function isVitestFile(name: string) {
  return name.startsWith('__vitest-batch-')
}

function stashForeignImages() {
  fs.mkdirSync(STASH_DIR, { recursive: true })
  for (const name of listNewUgcImages()) {
    if (isVitestFile(name)) continue
    if (!name.startsWith('test-bg-') && !name.startsWith('__integration-bg-')) continue
    fs.renameSync(path.join(NEW_IMAGES_DIR, name), path.join(STASH_DIR, name))
  }
  for (const name of fs.readdirSync(USED_IMAGES_DIR)) {
    if (isVitestFile(name) || !/\.(jpe?g|png|webp)$/i.test(name)) continue
    const src = path.join(USED_IMAGES_DIR, name)
    if (!fs.existsSync(src) || !fs.statSync(src).isFile()) continue
    fs.renameSync(src, path.join(STASH_DIR, `used-${name}`))
  }
}

function restoreForeignImages() {
  if (!fs.existsSync(STASH_DIR)) return
  for (const name of fs.readdirSync(STASH_DIR)) {
    const src = path.join(STASH_DIR, name)
    if (!fs.statSync(src).isFile()) continue
    if (name.startsWith('used-')) {
      fs.renameSync(src, path.join(USED_IMAGES_DIR, name.slice(5)))
    } else {
      fs.renameSync(src, path.join(NEW_IMAGES_DIR, name))
    }
  }
  if (fs.readdirSync(STASH_DIR).length === 0) {
    fs.rmdirSync(STASH_DIR)
  }
}

function cleanupVitestFiles() {
  resetUgcImagePoolState()
  for (const dir of [NEW_IMAGES_DIR, USED_IMAGES_DIR]) {
    for (const name of TEST_FILES) {
      const file = path.join(dir, name)
      if (fs.existsSync(file)) fs.unlinkSync(file)
      const stem = path.parse(name).name
      const ext = path.parse(name).ext
      for (let n = 2; n <= 5; n++) {
        const alt = path.join(dir, `${stem}_${n}${ext}`)
        if (fs.existsSync(alt)) fs.unlinkSync(alt)
      }
    }
  }
}

describe('ugc-image-pool', () => {
  beforeEach(() => {
    stashForeignImages()
  })

  afterEach(() => {
    cleanupVitestFiles()
    restoreForeignImages()
  })

  it('reports image pool status', () => {
    const status = getUgcImagePoolStatus()
    expect(status.newImagesDir).toContain('new-images')
    expect(status.usedImagesDir).toContain('used-images')
    expect(status.available).toBeGreaterThanOrEqual(0)
    expect(status.total).toBe(status.available + status.used)
  })

  it('picks and consumes images from new-images', () => {
    fs.mkdirSync(NEW_IMAGES_DIR, { recursive: true })
    fs.writeFileSync(path.join(NEW_IMAGES_DIR, TEST_FILES[0]), 'fake-jpg')
    expect(listNewUgcImages()).toEqual([TEST_FILES[0]])

    const picked = pickBatchUgcImages(1)
    expect(picked.ok).toBe(true)
    expect(picked.images).toHaveLength(1)
    expect(picked.images![0].filename).toBe(TEST_FILES[0])

    const moved = consumeUgcImage(TEST_FILES[0])
    expect(moved.ok).toBe(true)
    expect(listNewUgcImages()).not.toContain(TEST_FILES[0])
    expect(fs.existsSync(path.join(NEW_IMAGES_DIR, TEST_FILES[0]))).toBe(true)
    expect(fs.existsSync(path.join(USED_IMAGES_DIR, TEST_FILES[0]))).toBe(true)
  })

  it('rejects pick when pool is empty', () => {
    resetUgcImagePoolState()
    const status = getUgcImagePoolStatus()
    expect(status.available).toBe(0)
    expect(status.used).toBe(0)
    expect(status.total).toBe(0)

    const picked = pickBatchUgcImages(1)
    expect(picked.ok).toBe(false)
    expect(picked.message).toMatch(/No images in/)
  })

  it('recycles used images when new-images is empty and shuffles order', () => {
    fs.mkdirSync(NEW_IMAGES_DIR, { recursive: true })
    for (const name of TEST_FILES) {
      fs.writeFileSync(path.join(NEW_IMAGES_DIR, name), 'fake-jpg')
    }

    const firstPick = pickBatchUgcImages(3)
    expect(firstPick.ok).toBe(true)
    expect(firstPick.images).toHaveLength(3)

    for (const img of firstPick.images!) {
      consumeUgcImage(img.filename)
    }
    expect(listNewUgcImages()).toHaveLength(0)

    const secondPick = pickBatchUgcImages(3)
    expect(secondPick.ok).toBe(true)
    expect(secondPick.recycled).toBe(true)
    expect(secondPick.recycleCount).toBe(1)
    expect(secondPick.images).toHaveLength(3)

    const firstOrder = firstPick.images!.map((i) => i.filename)
    const secondOrder = secondPick.images!.map((i) => i.filename)
    expect(secondOrder).not.toEqual(firstOrder)
  })
})
