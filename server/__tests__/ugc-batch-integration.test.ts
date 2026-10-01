import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { saveUgcBatchToDisk } from '../ugc-batch-export.js'
import {
  NEW_IMAGES_DIR,
  USED_IMAGES_DIR,
  consumeUgcImage,
  listNewUgcImages,
  listUsedUgcImages,
  pickBatchUgcImages,
  resetUgcImagePoolState,
} from '../ugc-image-pool.js'
import { pickBatchUgcThemes, resetUsedUgcThemes } from '../ugc-theme-pool.js'
import { formatBatchDiscordCaption } from '../ugc-caption-format.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BATCH_TEST_ROOT = path.join(__dirname, '..', '..', 'output', 'batch-integration-test')
const TEST_PREFIX = '__integration-bg-'
const STASH_DIR = path.join(NEW_IMAGES_DIR, '..', '.integration-image-stash')

const SOURCE_IMAGES = [
  String.raw`C:\Users\kajus\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\tcl\tk8.6\demos\images\earthmenu.png`,
  String.raw`C:\Users\kajus\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\tcl\tk8.6\demos\images\ouster.png`,
  String.raw`C:\Users\kajus\.cache\codex-runtimes\codex-primary-runtime\plugins\openai-primary-runtime\plugins\pdf\assets\icon.png`,
]

function testImageNames(): string[] {
  return listNewUgcImages().filter((n) => n.startsWith(TEST_PREFIX))
}

function readImageBase64(filename: string): string {
  return fs.readFileSync(path.join(NEW_IMAGES_DIR, filename)).toString('base64')
}

function stashNonIntegrationImages() {
  fs.mkdirSync(STASH_DIR, { recursive: true })
  for (const dir of [NEW_IMAGES_DIR, USED_IMAGES_DIR]) {
    for (const name of fs.readdirSync(dir)) {
      if (!/\.(jpe?g|png|webp)$/i.test(name) || name.startsWith(TEST_PREFIX)) continue
      const src = path.join(dir, name)
      if (!fs.statSync(src).isFile()) continue
      const stashName = dir === USED_IMAGES_DIR ? `used-${name}` : name
      fs.renameSync(src, path.join(STASH_DIR, stashName))
    }
  }
}

function restoreNonIntegrationImages() {
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
  if (fs.readdirSync(STASH_DIR).length === 0) fs.rmdirSync(STASH_DIR)
}

function cleanupIntegrationImages() {
  for (const dir of [NEW_IMAGES_DIR, USED_IMAGES_DIR]) {
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith(TEST_PREFIX)) fs.unlinkSync(path.join(dir, name))
    }
  }
}

function seedTestImages(): string[] {
  fs.mkdirSync(NEW_IMAGES_DIR, { recursive: true })
  const seeded: string[] = []
  let i = 1
  for (const src of SOURCE_IMAGES) {
    if (!fs.existsSync(src)) continue
    const destName = `${TEST_PREFIX}${i}.png`
    fs.copyFileSync(src, path.join(NEW_IMAGES_DIR, destName))
    seeded.push(destName)
    i++
  }
  return seeded
}

describe.sequential('ugc batch integration (real images)', () => {
  let batchDir = ''
  let seeded: string[] = []

  beforeAll(() => {
    stashNonIntegrationImages()
    cleanupIntegrationImages()
    resetUgcImagePoolState()
    resetUsedUgcThemes()
    seeded = seedTestImages()
    if (seeded.length < 2) {
      throw new Error(
        `Need at least 2 source images on disk for integration test. Seeded: ${seeded.length}`,
      )
    }
  })

  afterAll(() => {
    resetUgcImagePoolState()
    if (batchDir && fs.existsSync(batchDir)) {
      fs.rmSync(batchDir, { recursive: true, force: true })
    }
    cleanupIntegrationImages()
    restoreNonIntegrationImages()
  })

  it('picks themes + images, saves batch posts, and moves images to used-images', () => {
    resetUsedUgcThemes()
    const postCount = Math.min(2, testImageNames().length)
    expect(postCount).toBeGreaterThanOrEqual(2)

    const themes = pickBatchUgcThemes(postCount)
    expect(themes.ok).toBe(true)
    expect(themes.themes).toHaveLength(postCount)

    const images = pickBatchUgcImages(postCount)
    expect(images.ok).toBe(true)
    expect(images.images).toHaveLength(postCount)
    expect(images.images!.every((i) => i.filename.startsWith(TEST_PREFIX))).toBe(true)

    const posts = themes.themes!.map((theme, i) => {
      const filename = images.images![i].filename
      const b64 = readImageBase64(filename)
      expect(b64.length).toBeGreaterThan(100)

      return {
        postIndex: i + 1,
        caption: formatBatchDiscordCaption(
          `${theme.hook}. ${theme.body} Tai papildomas lietuviškas aprašymas, kuris turi būti pakankamai ilgas, kad tilptų į Discord įrašą ir nekartotų skaidrių žodis į žodį.`,
          { seed: i + 1 },
        ),
        meta: { theme: theme.theme, hook: theme.hook, background_image: filename },
        slides: [
          { filename: 'slide_01.png', data: b64 },
          { filename: 'slide_02.png', data: b64 },
        ],
      }
    })

    const saved = saveUgcBatchToDisk(BATCH_TEST_ROOT, posts)
    expect(saved.ok).toBe(true)
    if (!saved.ok) return
    batchDir = saved.batchDir

    expect(fs.existsSync(batchDir)).toBe(true)
    for (let i = 1; i <= postCount; i++) {
      const postDir = path.join(batchDir, `Post ${String(i).padStart(2, '0')}`)
      expect(fs.existsSync(path.join(postDir, 'slide_01.png'))).toBe(true)
      expect(fs.existsSync(path.join(postDir, 'caption.txt'))).toBe(true)
      expect(fs.readFileSync(path.join(postDir, 'caption.txt'), 'utf8')).toContain('📌')
      expect(fs.readFileSync(path.join(postDir, 'caption.txt'), 'utf8')).not.toContain('HOOK:')
    }

    for (const img of images.images!) {
      expect(consumeUgcImage(img.filename).ok).toBe(true)
    }

    expect(testImageNames()).toHaveLength(seeded.length - postCount)
    expect(listUsedUgcImages().filter((n) => n.startsWith(TEST_PREFIX))).toHaveLength(postCount)
  })

  it('recycles used test images for another pick', () => {
    cleanupIntegrationImages()
    seeded = seedTestImages()
    for (const name of seeded) {
      expect(consumeUgcImage(name).ok).toBe(true)
    }
    expect(testImageNames()).toHaveLength(0)

    const pick = pickBatchUgcImages(1)
    expect(pick.ok).toBe(true)
    expect(pick.recycled).toBe(true)
    expect(pick.images).toHaveLength(1)
  })
})
