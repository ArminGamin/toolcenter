import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
// Set before any application import: tests must not mutate live queues or assets.
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-tests-'))
process.env.CC_DATA_DIR = path.join(testRoot, 'data')
process.env.UGC_TEST_ASSETS = path.join(testRoot, 'ugc')
process.env.UGC_IMAGE_SOURCE_DIR = path.join(testRoot, 'ugc', 'new-images')
process.env.UGC_VISION_ROOT = path.join(testRoot, 'vision')
fs.mkdirSync(process.env.UGC_IMAGE_SOURCE_DIR, { recursive: true })
fs.mkdirSync(path.join(testRoot, 'ugc', 'used-images'), { recursive: true })
fs.copyFileSync(path.join(root, 'assets', 'ugc-slides', 'theme_pool.json'), path.join(testRoot, 'ugc', 'theme_pool.json'))
fs.copyFileSync(
  path.join(root, 'assets', 'ugc-slides', 'theme_pool_kaledu.json'),
  path.join(testRoot, 'ugc', 'theme_pool_kaledu.json'),
)
// Individual tests install explicit provider mocks. No real messages during tests.
globalThis.fetch = async () => { throw new Error('External fetch disabled in tests; install a mock') }
