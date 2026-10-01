import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'
import { FPS, DURATION, WIDTH, HEIGHT } from './src/timing.js'

const root = path.dirname(fileURLToPath(import.meta.url))
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const stillsArg = process.argv.find((arg) => arg.startsWith('--stills'))
const stills = stillsArg ? stillsArg.split('=')[1].split(',').map(Number) : null

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
}

function serve() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0])
    const file = path.normalize(path.join(root, urlPath === '/' ? 'index.html' : urlPath))
    if (!file.startsWith(root)) {
      res.writeHead(403)
      res.end()
      return
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404)
        res.end()
        return
      }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' })
      res.end(data)
    })
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: 'inherit' })
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}`))))
  })
}

const server = await serve()
const port = server.address().port
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--hide-scrollbars', '--force-device-scale-factor=1', '--font-render-hinting=none'],
})
const page = await browser.newPage()
await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 })
await page.goto(`http://127.0.0.1:${port}/index.html?manual=1`, { waitUntil: 'networkidle0' })
await page.evaluate(async () => {
  await document.fonts.ready
  await document.fonts.load('500 104px Fraunces')
  await document.fonts.load('italic 500 62px Fraunces')
  await document.fonts.load('400 34px Outfit')
})

if (stills) {
  fs.mkdirSync(path.join(root, 'preview'), { recursive: true })
  for (const t of stills) {
    await page.evaluate((time) => window.seek(time), t)
    const name = `t${String(t).replace('.', '_')}.png`
    await page.screenshot({ path: path.join(root, 'preview', name), type: 'png' })
    console.log(name)
  }
} else {
  const frames = path.join(root, 'frames')
  fs.mkdirSync(frames, { recursive: true })
  const count = FPS * DURATION
  for (let i = 0; i < count; i++) {
    await page.evaluate((time) => window.seek(time), i / FPS)
    await page.screenshot({ path: path.join(frames, `f_${String(i).padStart(4, '0')}.png`), type: 'png' })
    if (i % 30 === 0) console.log(`${i}/${count}`)
  }
  const outDir = path.join(root, 'out')
  fs.mkdirSync(outDir, { recursive: true })
  const out = path.join(outDir, 'kaledu-kampelis.mp4')
  await ffmpeg([
    '-y',
    '-framerate', String(FPS),
    '-start_number', '0',
    '-i', path.join(frames, 'f_%04d.png'),
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-crf', '16',
    '-preset', 'medium',
    '-movflags', '+faststart',
    out,
  ])
  fs.rmSync(frames, { recursive: true, force: true })
  console.log(out)
}

await browser.close()
server.close()
