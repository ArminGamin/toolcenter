import fs from 'node:fs'
import { runWithBusinessProfile, CHRISTMAS_BUSINESS_PROFILE_ID } from './server/business-profiles.js'
import { kaleduInventedProductMentions } from './server/ugc-kaledu-catalog.js'
import { kaleduDeterministicQa } from './server/ugc-kaledu-final-qa.js'
import { assertShipableLtSlide, UGC_KALEDU_DIET_LEAK_RE } from './server/ugc-lt-normalize.js'
import { KALEDU_PAIN_RESTART_RE, collectKaleduArcIssues } from './server/ugc-story/arc-guard.js'
import { mentionedKaleduRecipients } from './server/ugc-lt/recipient.js'
import { isInvalidHookTitle } from './server/ugc-hook-templates.js'

const kits = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const input = JSON.parse(fs.readFileSync('output/ugc-review/kit-input-themes.json', 'utf8'))
const arr = Array.isArray(input) ? input : input.themes || Object.values(input)

const STEMS = 'pled antklod žvak puodel termos gertuv difuzor kvepal pinigin ausin rankšluost kosmetik knyg kalendor laikrod šalik pirštin kepur megztin chalat pižam kojin šlepet lemp žibint girliand žaisliuk žaisl lėl dėlion konstruktor kilim užvalkal patalyn auskar apyrank vyn šampan šokolad saldain sausain projektor drėkintuv masažuokl dėkl užrašin sąsiuvin dienorašt album rėmel vaz arbatinuk krepš krem muil bateri įkrovikl purškikl plakikl pakabuk šildykl rož arbat kav mieg žaidim telefon pakavim pakuot lent rinkin sod viskis gaubl takel sijon džempe kardigan golf'.split(' ')

runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, () => {
for (const kit of kits) {
  const src = arr.find((t: any) => t.id === kit.id)
  if (!src || src.theme !== kit.theme) console.log(`THEME MISMATCH ${kit.id}: ${JSON.stringify(src?.theme)} vs ${JSON.stringify(kit.theme)}`)
  const themeText = [src?.theme, src?.hook, src?.body].join(' ')
  const lines: Array<{ role: string; field: string; text: string }> = []
  kit.hooks.forEach((h: any) => { lines.push({ role: 'hook', field: 'title', text: h.title }); lines.push({ role: 'hook', field: 'body', text: h.body }) })
  for (const r of ['context', 'build', 'close']) for (const t of kit[r]) lines.push({ role: r, field: 'body', text: t })
  for (const l of lines) {
    const issues: string[] = []
    const t = l.text
    if (/[–—:;…"“”„!]|\s-\s|\.\.\./u.test(t)) issues.push('punct')
    if (l.field === 'title' && t.length > 55) issues.push(`title len ${t.length}`)
    if (l.field === 'title' && /\.$/.test(t)) issues.push('title period')
    if (l.field === 'body' && t.length > 160) issues.push(`body len ${t.length}`)
    if ((l.role === 'build' || l.role === 'close') && /\?/.test(t)) issues.push('question late')
    const low = t.toLocaleLowerCase('lt-LT')
    for (const w of low.split(/[^\p{L}]+/u)) for (const s of STEMS) if (w.startsWith(s)) issues.push(`stem ${s} in ${w}`)
    if (/(?<!\p{L})(jūs|mes|aš|mūsų|man|mane)(?!\p{L})/iu.test(t)) issues.push('person')
    if (UGC_KALEDU_DIET_LEAK_RE.test(t)) issues.push('diet')
    if ((l.role === 'build' || l.role === 'close') && KALEDU_PAIN_RESTART_RE.test(t)) issues.push('pain')
    const inv = kaleduInventedProductMentions(t, [])
    if (inv.length) issues.push(`invented ${inv.join(',')}`)
    const qa = kaleduDeterministicQa([{ body: t, role: l.role } as any], { theme: '', allowed: [] } as any)
    if (qa.length) issues.push(`qa ${JSON.stringify(qa.map((f: any) => [f.code, f.message || f.detail || '']))}`)
    if (l.field === 'title') {
      try { if (isInvalidHookTitle(t)) issues.push('invalid hook title') } catch (e) { issues.push('hooktitle err ' + e) }
    }
    try { assertShipableLtSlide(l.field === 'title' ? { title: t, body: kit.hooks[0].body, role: l.role } as any : { body: t, role: l.role } as any) } catch (e: any) { issues.push(`ship ${e.message}`) }
    const named = mentionedKaleduRecipients(t)
    const themeR = mentionedKaleduRecipients(themeText)
    const foreign = named.filter((k) => !themeR.includes(k))
    if (foreign.length) issues.push(`recipient foreign ${foreign}`)
    if (!themeR.length && l.role === 'hook' && named.length) issues.push(`hook names ${named}`)
    if (issues.length) console.log(`#${kit.id} [${l.role}/${l.field}] ${t}\n   -> ${issues.join(' | ')}`)
  }
  // Full story combos
  for (const h of kit.hooks) for (const c of kit.context) for (const cl of kit.close) {
    const slides = [
      { role: 'hook', title: h.title, body: h.body },
      { role: 'context', body: c },
      { role: 'build', body: kit.build[0] },
      { role: 'build', body: kit.build[1] },
      { role: 'build', body: kit.build[2] },
      { role: 'close', body: cl },
    ]
    const arc = collectKaleduArcIssues(slides as any, themeText)
    if (arc.length) console.log(`#${kit.id} ARC ${JSON.stringify(arc.map((a) => [a.code, a.slide, a.message]))}`)
  }
}
})
console.log('checked')
