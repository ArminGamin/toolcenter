import fs from 'node:fs'
import { kaleduDeterministicQa, findRegisterErrors } from '../../server/ugc-kaledu-final-qa.js'

const file = process.argv[2]
const kits = JSON.parse(fs.readFileSync(file, 'utf8')) as Array<any>

const STEMS = 'pled antklod žvak puodel termos gertuv difuzori kvepal piniginė piniginės ausin rankšluost kosmetik knyg kalendori laikrod šalik pirštin kepur megztin chalat pižam kojin šlepet lemp žibint girliand žaisliuk žaisl lėl dėlion konstruktori kilim užvalkal patalyn auskar apyrank vyn šampan šokolad saldain sausain projektori drėkintuv masažuokl dėkl užrašin sąsiuvin dienorašt album rėmel vaz arbatinuk krepš krem muil baterij įkrovikl purškikl plakikl pakabuk šildykl rož arbat kav mieg žaid telefon pakavim pakuot lent rinkin sod viski gaubl takel sijon džemper kardigan golf'.split(' ')
const stemRe = new RegExp(`(?<!\\p{L})(?:${STEMS.join('|')})`, 'iu')
const stemAnyRe = new RegExp(`(?:${STEMS.join('|')})`, 'iu')
const CUE_RE = /rinkis|gali rinktis|siūl|puiki dovana|tinka dovanai|galima padovanoti|(?<!\p{L})(?:šis|ši|šią|šio|šiai|šiam)\s+(?:dovan|daikt)/iu
const PAIN_RE = /stres|panik|paskutin\p{L}* minut|laiko (?:mažai|mažiau|neliko)|sąrašas ilgėja|atided|atidėlio|chaos|dilem|galvos skausm|vis dar nežinai|vis dar be dovanos|nežinai, ką|Kalėdos (?:artėja|arti|rytoj|čia pat)|tas jausmas|vėl tas|jautiesi kaip/iu
const POETRY_RE = /magij|(?<!\p{L})siel|nepakartojam|nepamirštam|tobul|ramybės oaz|ypating\p{L}* akcent|šilumos kupin|sušildo širdį|užpildo namus|kelion|patirt/iu
const PUNCT_RE = /[-–—:;…"„“”«»]|\.\.\./u
const EMOJI_RE = /\p{Extended_Pictographic}/u
const GENDER_RE = /(?<!\p{L})\p{L}{3,}(?:damas|dama|ęs|usi|ęsi)(?!\p{L})/u
const OPEN_BAN = /^(Kiekvienais metais)|Svarbiausia ne kaina|tas žmogus/iu

for (const kit of kits) {
  const issues: string[] = []
  const lines: Array<{ role: string; field: string; text: string }> = []
  kit.hooks.forEach((h: any, i: number) => {
    lines.push({ role: 'hook', field: `hook${i}.title`, text: h.title })
    lines.push({ role: 'hook', field: `hook${i}.body`, text: h.body })
  })
  kit.context.forEach((t: string, i: number) => lines.push({ role: 'context', field: `context${i}`, text: t }))
  kit.build.forEach((t: string, i: number) => lines.push({ role: 'build', field: `build${i}`, text: t }))
  kit.close.forEach((t: string, i: number) => lines.push({ role: 'close', field: `close${i}`, text: t }))
  let bangs = 0
  for (const l of lines) {
    const t = l.text
    bangs += (t.match(/!/g) || []).length
    const isTitle = l.field.endsWith('title')
    if (isTitle && t.length > 55) issues.push(`${l.field} title too long ${t.length}`)
    if (!isTitle && t.length > 160) issues.push(`${l.field} too long ${t.length}`)
    const sentences = t.split(/(?<=[.!?])\s+/u).filter(Boolean)
    if (!isTitle && sentences.length > 2) issues.push(`${l.field} >2 sentences`)
    if (isTitle && /\.$/.test(t)) issues.push(`${l.field} title ends with period`)
    if (isTitle && !/[?]$/.test(t) && /[.!]$/.test(t)) issues.push(`${l.field} title ends badly`)
    if (stemRe.test(t)) issues.push(`${l.field} forbidden stem (word start) ${t.match(stemRe)?.[0]}`)
    else if (stemAnyRe.test(t)) issues.push(`NOTE ${l.field} stem inside word: ${t.match(stemAnyRe)?.[0]}`)
    if (CUE_RE.test(t)) issues.push(`${l.field} recommendation cue ${t.match(CUE_RE)?.[0]}`)
    if ((l.role === 'build' || l.role === 'close') && PAIN_RE.test(t)) issues.push(`${l.field} pain word ${t.match(PAIN_RE)?.[0]}`)
    if ((l.role === 'build' || l.role === 'close') && t.includes('?')) issues.push(`${l.field} question in build/close`)
    if (POETRY_RE.test(t)) issues.push(`${l.field} ad poetry ${t.match(POETRY_RE)?.[0]}`)
    if (PUNCT_RE.test(t)) issues.push(`${l.field} punctuation ${t.match(PUNCT_RE)?.[0]}`)
    if (EMOJI_RE.test(t)) issues.push(`${l.field} emoji`)
    if (GENDER_RE.test(t)) issues.push(`NOTE ${l.field} participle-like ${t.match(GENDER_RE)?.[0]}`)
    if (OPEN_BAN.test(t)) issues.push(`${l.field} banned opener`)
    const reg = findRegisterErrors(t)
    if (reg.length) issues.push(`${l.field} register ${reg.join(',')}`)
    const qa = kaleduDeterministicQa(
      [isTitle ? { title: t, role: l.role } : { body: t, role: l.role }],
      { theme: kit.theme, allowed: [], productTruth: false },
    )
    for (const f of qa) issues.push(`${l.field} QA ${f.details.join(' | ')}`)
  }
  if (bangs > 1) issues.push(`too many ! (${bangs})`)
  // opening word variety within the kit
  const openers = lines.map((l) => l.text.split(/\s+/)[0].toLowerCase())
  const dup = openers.filter((o, i) => openers.indexOf(o) !== i)
  if (dup.length) issues.push(`NOTE repeated openers: ${[...new Set(dup)].join(', ')}`)
  console.log(`#${kit.id} ${issues.length ? '\n  ' + issues.join('\n  ') : 'OK'}`)
}
