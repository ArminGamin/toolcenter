import { generateUgcBatchStory } from '../server/ugc-story-engine.js'

async function main() {
  try {
    const r = await generateUgcBatchStory({
      topic: 'Vakarienės planavimas',
      themeHook: 'Kodėl visada valgai tą patį?',
      themeBody: 'Be plano impulsyviai perki ir švaistai.',
      slideCount: 4,
      cta: 'Pradėk 5 min. testą',
      seed: 1,
    })
    console.log(
      'OK',
      r.slides.length,
      JSON.stringify(
        r.slides.map((s) => ({ role: s.role, title: s.title?.slice(0, 40), body: s.body?.slice(0, 60), cta: s.cta })),
        null,
        2,
      ),
    )
  } catch (e) {
    console.error('FAIL', e instanceof Error ? e.message : e)
    process.exit(1)
  }
}

main()
