import { describe, expect, it } from 'vitest'
import { collectStoryIssues, normalizeSentenceKey } from '../ugc-lt-normalize.js'
import { repairStoryOrderAndRepeats } from '../ugc-story-engine.js'

describe('debug shipped post-01 repeat pattern', () => {
  const slides = [
    {
      role: 'hook',
      title: 'Ar žinai, kodėl planavimas dažnai nepavyksta?',
      body: 'Netinkamas planas gali tapti didžiausia kliūtimi.',
    },
    {
      role: 'context',
      body: 'Dažnas susiduria su tuo, kad tikslai pasensta vos po kelių savaičių. Planavimo procesas dažnai pamiršta individualius pokyčius bei aplinkybes.',
    },
    {
      role: 'build',
      body: 'Supranti, kad tikslų pasiekimas reikalauja lanksčios strategijos? Tavo knyga padės sukurti individualizuotą planą per penkias minutes.',
    },
    {
      role: 'build',
      body: 'Planavimo procesas pamiršta individualius pokyčius bei aplinkybes. Tu gali prisitaikyti prie kintančių situacijų.',
    },
    {
      role: 'build',
      body: 'Šis procesas leidžia atskleisti paslaptį, kaip įvertinti savo stipriąsias puses. Tu galėsi lengvai koreguoti kryptį.',
    },
    {
      role: 'close',
      body: 'Dažnai susiduri su tuo, kad tikslų realizacija sustoja jau po kelių dienų. Štai kodėl svarbu turėti individualizuotą ir lankstų veiklos planą.',
    },
  ]

  it('strips near-duplicate sentences across slides (shipped post-01 pattern)', () => {
    const s2 = 'Planavimo procesas dažnai pamiršta individualius pokyčius bei aplinkybes.'
    const s4 = 'Planavimo procesas pamiršta individualius pokyčius bei aplinkybes.'
    expect(normalizeSentenceKey(s2)).not.toBe(normalizeSentenceKey(s4))
    const repaired = repairStoryOrderAndRepeats(
      slides.map((s, i) => ({ id: `s${i + 1}`, title: s.title || '', body: s.body, role: s.role })),
      'quiz',
    )
    expect(repaired[3]?.body).not.toMatch(/Planavimo procesas pamiršta individualius pokyčius/i)
    expect(collectStoryIssues(repaired, 'quiz').map((i) => i.code)).not.toContain('duplicate_sentence')
  })
})
