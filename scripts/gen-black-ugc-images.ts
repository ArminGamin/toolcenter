import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  encodeSolidPng,
  KALEDU_BG_CATEGORIES,
  KALEDU_BGS_DIR,
} from '../server/ugc-kaledu-bgs.ts'

const count = Math.max(1, Number(process.argv[2]) || 60)
const W = 1080
const H = 1920
const BLACK: [number, number, number] = [0, 0, 0]
const png = encodeSolidPng(W, H, BLACK)
const tavoDir = String.raw`D:\new-pics`

fs.mkdirSync(tavoDir, { recursive: true })
for (let i = 1; i <= count; i++) {
  const name = `black-screen-${String(i).padStart(3, '0')}.png`
  fs.writeFileSync(path.join(tavoDir, name), png)
}

const perCat = Math.ceil(count / KALEDU_BG_CATEGORIES.length)
for (const cat of KALEDU_BG_CATEGORIES) {
  const folder = path.join(KALEDU_BGS_DIR, cat)
  fs.mkdirSync(folder, { recursive: true })
  for (let j = 1; j <= perCat; j++) {
    const name = `black-screen-${String(j).padStart(3, '0')}.png`
    fs.writeFileSync(path.join(folder, name), png)
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      count,
      size: `${W}x${H}`,
      tavoDir,
      kaleduDir: KALEDU_BGS_DIR,
      perKaleduCategory: perCat,
    },
    null,
    2,
  ),
)
