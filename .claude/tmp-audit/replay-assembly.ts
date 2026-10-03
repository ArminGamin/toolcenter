import fs from 'node:fs'
import path from 'node:path'
import { CHRISTMAS_BUSINESS_PROFILE_ID, runWithBusinessProfile } from '../../server/business-profiles.ts'
import { roleTextToUgcFields, collectUsedPhrases, hasRepetition, slidesFromItems } from '../../server/ugc-story/slide-assembly.ts'
import { fitSlideText } from '../../server/ugc-story/fallbacks.ts'
import { isGibberishLtCopy, hasFormalRegister, assertShipableLtSlide } from '../../server/ugc-lt-normalize.ts'
import { isDuplicateSlideCopy, isParaphraseSlideCopy } from '../../server/ugc-story/similarity.ts'
import { isSeasonalUgcTheme, isSeasonFillerRepeat } from '../../server/ugc-season-context.ts'
import { isShipableHookBody } from '../../server/ugc-hook-templates.ts'
import { ensureHookBodyQuestions } from '../../server/ugc-story/repairs.ts'

const posts = process.argv.slice(2)
runWithBusinessProfile(CHRISTMAS_BUSINESS_PROFILE_ID, () => {
  for (const post of posts) {
    const dir = `D:/ugc-batch-vision/audit/${post}`
    const req = JSON.parse(fs.readFileSync(`${dir}/00-request.json`, 'utf8'))
    const plan = JSON.parse(fs.readFileSync(`${dir}/00b-plan.json`, 'utf8'))
    const topic = req.topic
    const themeText = `${req.theme || ''} ${topic} ${req.themeHook} ${req.themeBody}`
    const seasonal = isSeasonalUgcTheme(themeText)
    const prior: Array<{ role: string; text: string }> = []
    console.log(`\n######## ${post}  seasonal=${seasonal}`)
    const files = fs.readdirSync(dir).filter((f) => /^03-raw-items-s\d+\.json$/.test(f)).sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))
    for (const f of files) {
      const start = Number(f.match(/s(\d+)/)![1])
      const raw = JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8'))
      const items = raw.items
      const roles = raw.roles
      const built: any[] = []
      const ltState = { mesOpenerCount: 0 }
      items.forEach((item: any, i: number) => {
        const role = roles[i]
        const priorForFit = [...prior.map((p) => ({ text: p.text })), ...built.map((s) => ({ title: s.title, body: s.body }))]
        const text = fitSlideText(item.text, 2, role, topic, priorForFit, built.length)
        const fields = roleTextToUgcFields(role, text, item.title, item.cta, plan.defaultCta, { mesOpenerCount: 0 }, topic, plan.hookStyle)
        const blob = `${fields.title} ${fields.body}`
        let shipErr = ''
        try { assertShipableLtSlide({ title: fields.title, body: fields.body, role }) } catch (e: any) { shipErr = e.message }
        const priorForDup = priorForFit
        const priorPara = [...prior.map((p) => ({ title: '', body: p.text })), ...built.map((s) => ({ title: s.title, body: s.body }))]
        console.log(`-- slide ${start + i} ${role}`)
        console.log(`   raw  : ${JSON.stringify(item.title)} | ${JSON.stringify(item.text)}`)
        console.log(`   fit  : ${JSON.stringify(text)}`)
        console.log(`   field: ${JSON.stringify(fields.title)} | ${JSON.stringify(fields.body)}`)
        if (role === 'hook') console.log(`   hookBodyShipable(raw body)=${isShipableHookBody(ensureHookBodyQuestions(item.text.split('\n').join(' ')))}`)
        console.log(`   gibberish=${isGibberishLtCopy(blob)} formal=${hasFormalRegister(blob)} seasonRepeat=${isSeasonFillerRepeat(blob, prior.map((p) => p.text), seasonal)} shipErr=${shipErr} dup=${isDuplicateSlideCopy(fields.title, fields.body, priorForDup)} para=${(role === 'build' || role === 'context') && isParaphraseSlideCopy(fields.title, fields.body, priorPara)}`)
        built.push({ title: fields.title, body: fields.body })
      })
      // full replay of the real function for the chunk
      const real = slidesFromItems(items, roles, roles.map(() => 2), topic, plan.defaultCta, prior, ltState as any, plan.hookStyle, start, true, seasonal, { hook: req.themeHook, body: req.themeBody })
      console.log('   REAL slidesFromItems:')
      for (const s of real.slides) console.log(`     ${s.id} ${s.role}: ${JSON.stringify(s.title)} | ${JSON.stringify(s.body)}`)
      for (const s of real.slides) prior.push({ role: s.role || 'build', text: [s.title, s.body].filter(Boolean).join('\n') })
    }
  }
})
