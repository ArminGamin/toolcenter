import fs from 'node:fs'
import https from 'node:https'

const root = new URL('.', import.meta.url)
const css = fs.readFileSync(new URL('fonts.google.css', root), 'utf8')
const urls = []
let i = 0
while ((i = css.indexOf('https://', i)) !== -1) {
  const end = css.indexOf(')', i)
  urls.push(css.slice(i, end))
  i = end
}

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400) {
        get(res.headers.location).then(resolve, reject)
        return
      }
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
    }).on('error', reject)
  })
}

const map = new Map()
let n = 0
for (const url of [...new Set(urls)]) {
  n += 1
  const name = `f${n}.woff2`
  const buf = await get(url)
  fs.writeFileSync(new URL(`fonts/${name}`, root), buf)
  map.set(url, `fonts/${name}`)
  console.log(name, buf.length)
}

let out = css
for (const [url, local] of map) out = out.split(url).join(local)
fs.writeFileSync(new URL('fonts.css', root), out)
