import fs from 'node:fs'
import {
  findAgreementErrors,
  findPersonNumberErrors,
  findIncompleteClause,
  findVlkkCalques,
  findCaseGovernmentErrors,
  findVerbConstructionErrors,
  findRegisterErrors,
  findNativeSemanticHits,
  findSentenceFragments,
  findValidWordWrongContext,
  findMissingQuestionMarks,
} from '../../server/ugc-kaledu-final-qa.ts'
import { collectSlideIssues, assertShipableLtSlide } from '../../server/ugc-lt/slide-checks.ts'
import { kaleduConcreteProductNouns } from '../../server/ugc-kaledu-catalog.ts'
import { collectLtCaseAgreementIssues } from '../../server/ugc-lt-case-check.ts'
import { textHasFiniteVerbCue } from '../../server/ugc-lt/gibberish.ts'

const file = process.argv[2]
const kits = JSON.parse(fs.readFileSync(file, 'utf8'))

const EXTRA_STEMS = /\b(arbat|kav[aoąųuė]|mieg|žaidim|telefon|pakavim|pakuot|lent[aoąųeėo]|rinkin|sod[aoąųeu]|viski|gaubl|takel|sijon|džempe|kardigan|golf|pled|žvak|girliand|lemp|kalendor|krepš|pinigin)/iu
const PUNCT = /[—–:;…"„“”«»]|\s-\s|\.\.\./u
const EMOJI = /\p{Extended_Pictographic}/u
const RECO = /\b(rinkis|gali rinktis|siūlau|puiki dovana|tinka dovanai|galima padovanoti|(šis|ši|šią|šio|šiai) (dovan|daikt))/iu
const PAIN = /(stres|panik|paskutin\p{L}* minut|laiko (mažai|mažiau|neliko)|sąrašas ilgėja|atidedi|atidėlioji|chaos|dilem|galvos skausm|vis dar nežinai|vis dar be dovanos|nežinai, ką|Kalėdos (artėja|arti|rytoj|čia pat)|tas jausmas|vėl tas|jautiesi kaip)/iu
const BADPERSON = /\b(jūs|jums|jus|jūsų|mes|mums|mus|mūsų|aš|man|mane|mano)\b/iu
const POETRY = /(magij|siel[aoąų]|nepakartojam|nepamirštam|tobul|ramybės oaz|ypating\p{L}* akcent|šilumos kupin|sušildo širdį|užpildo namus|kelion|patirt)/iu
const GENDERED = /\b(pavarg[eęu]s\p{L}*|įstrig\p{L}*|ieškodam\p{L}*|rinkęs|rinkusi|pažinęs|pažinusi|pasiruoš[eęu]s\p{L}*|laiming[ai]s?|tikras|tikra|užsiėm\p{L}*|pasimet\p{L}*)\b/iu
const BANNED_START = /^(Kiekvienais metais|Svarbiausia ne kaina)/u

let problems = 0
const report = (id: number, where: string, line: string, msg: string) => {
  problems++
  console.log(`[${id}] ${where}: ${msg}\n     ${line}`)
}

for (const kit of kits) {
  const lines: Array<{ where: string; text: string; role: string; field: 'title' | 'body' }> = []
  kit.hooks.forEach((h: any, i: number) => {
    lines.push({ where: `hook${i}.title`, text: h.title, role: 'hook', field: 'title' })
    lines.push({ where: `hook${i}.body`, text: h.body, role: 'hook', field: 'body' })
  })
  kit.context.forEach((t: string, i: number) => lines.push({ where: `context${i}`, text: t, role: 'context', field: 'body' }))
  kit.build.forEach((t: string, i: number) => lines.push({ where: `build${i}`, text: t, role: 'build', field: 'body' }))
  kit.close.forEach((t: string, i: number) => lines.push({ where: `close${i}`, text: t, role: 'close', field: 'body' }))
  let bangs = 0
  for (const { where, text, role, field } of lines) {
    bangs += (text.match(/!/g) || []).length
    if (field === 'title' && text.length > 55) report(kit.id, where, text, `title too long ${text.length}`)
    if (field === 'body' && text.length > 160) report(kit.id, where, text, `body too long ${text.length}`)
    const sentences = text.split(/(?<=[.?!])\s+/u).filter(Boolean)
    if (sentences.length > 2) report(kit.id, where, text, 'more than 2 sentences')
    if (field === 'title' && /\.$/u.test(text)) report(kit.id, where, text, 'title ends with period')
    if (PUNCT.test(text)) report(kit.id, where, text, 'forbidden punctuation')
    if (/-/u.test(text)) report(kit.id, where, text, 'hyphen')
    if (EMOJI.test(text)) report(kit.id, where, text, 'emoji')
    if (RECO.test(text)) report(kit.id, where, text, 'recommendation cue')
    if ((role === 'build' || role === 'close') && PAIN.test(text)) report(kit.id, where, text, 'pain word in build/close')
    if ((role === 'build' || role === 'close') && /\?/u.test(text)) report(kit.id, where, text, '? in build/close')
    if (BADPERSON.test(text)) report(kit.id, where, text, 'wrong person')
    if (POETRY.test(text)) report(kit.id, where, text, 'ad poetry')
    if (GENDERED.test(text)) report(kit.id, where, text, 'gendered form')
    if (BANNED_START.test(text)) report(kit.id, where, text, 'banned opening')
    if (/\btas žmogus\b/iu.test(text)) report(kit.id, where, text, 'tas žmogus')
    if (EXTRA_STEMS.test(text)) report(kit.id, where, text, `forbidden stem ${text.match(EXTRA_STEMS)?.[0]}`)
    const nouns = kaleduConcreteProductNouns(text)
    if (nouns.length) report(kit.id, where, text, `concrete product nouns ${JSON.stringify(nouns)}`)
    if (role === 'close' && sentences.length === 1 && !textHasFiniteVerbCue(text)) report(kit.id, where, text, 'close single sentence without verb cue')
    try { assertShipableLtSlide(field === 'title' ? { title: text, body: 'Tai yra tekstas.', role } : { title: 'Antraštė yra', body: text, role }) } catch (e) { report(kit.id, where, text, `assertShipable: ${(e as Error).message}`) }
    const checks: Array<[string, unknown]> = [
      ['agreement', findAgreementErrors(text)],
      ['personNumber', findPersonNumberErrors(text)],
      ['incomplete', findIncompleteClause(text, role, field)],
      ['calques', findVlkkCalques(text)],
      ['caseGov', findCaseGovernmentErrors(text)],
      ['verbConstr', findVerbConstructionErrors(text)],
      ['register', findRegisterErrors(text)],
      ['semantic', findNativeSemanticHits(text)],
      ['fragments', findSentenceFragments(text)],
      ['wrongContext', findValidWordWrongContext(text)],
      ['missingQ', findMissingQuestionMarks(text)],
      ['caseAgreement', collectLtCaseAgreementIssues(text)],
      ['slideIssues', collectSlideIssues(field === 'title' ? { title: text, body: '', role } : { title: '', body: text, role })],
    ]
    for (const [name, val] of checks) {
      if (val == null) continue
      if (Array.isArray(val) && val.length === 0) continue
      report(kit.id, where, text, `${name}: ${JSON.stringify(val)}`)
    }
  }
  if (bangs > 1) report(kit.id, 'kit', '', `too many ! (${bangs})`)
}
console.log(`problems: ${problems}`)
