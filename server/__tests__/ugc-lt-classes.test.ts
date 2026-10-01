import { describe, expect, it } from 'vitest'
import {
  applyUniversalLtClassRepairs,
  captionSlideDumpScore,
  collectUniversalClassStoryIssues,
  detectPostGenderFlip,
  isCaptionSlideDump,
} from '../ugc-lt-classes.js'

describe('applyUniversalLtClassRepairs', () => {
  it('fixes conj_2sg valgoi', () => {
    expect(applyUniversalLtClassRepairs('ką valgoi po treniruotės?')).toContain('valgai')
  })

  it('fixes verb_sense pasitaikyti in adapt context', () => {
    expect(applyUniversalLtClassRepairs('Lengva pasitaikyti naujoje aplinkoje.')).toContain('prisitaikyti')
  })

  it('fixes pasitaiko to prisitaiko (not infinitive) in adapt context', () => {
    expect(applyUniversalLtClassRepairs('Kartais pasitaiko naujoje aplinkoje.')).toContain('prisitaiko')
    expect(applyUniversalLtClassRepairs('Kartais pasitaiko naujoje aplinkoje.')).not.toContain('prisitaikyti')
  })

  it('leaves pasitaiko alone outside adapt context', () => {
    expect(applyUniversalLtClassRepairs('Kartais taip pasitaiko.')).toBe('Kartais taip pasitaiko.')
  })

  it('fixes agr_number angliavandeniai with case preserved', () => {
    expect(applyUniversalLtClassRepairs('Greitas angliavandenis suteikia energiją.')).toContain(
      'Greiti angliavandeniai',
    )
    expect(applyUniversalLtClassRepairs('... nes greitas angliavandenis kenkia.')).toContain(
      'greiti angliavandeniai',
    )
    expect(applyUniversalLtClassRepairs('... nes greitas angliavandenis kenkia.')).not.toMatch(
      /\bGreiti angliavandeniai\b/,
    )
  })

  it('adds comma before kas', () => {
    expect(applyUniversalLtClassRepairs('lengva pamiršti kas svarbu tau')).toContain('pamiršti, kas')
  })

  it('does not comma-break lengva kaip idiom', () => {
    expect(applyUniversalLtClassRepairs('lengva kaip pyragas')).toBe('lengva kaip pyragas')
  })

  it('does not turn Jauti statements into questions', () => {
    expect(applyUniversalLtClassRepairs('Jauti nuovargį.')).toBe('Jauti nuovargį.')
  })

  it('adds ? to colon-interrogative title', () => {
    expect(applyUniversalLtClassRepairs('Kelionės: ar pasikeičia tavo įprotis')).toMatch(/\?$/)
  })

  it('does not add ? to colon ar-or choice titles', () => {
    expect(applyUniversalLtClassRepairs('Pasirinkimas: arbata ar kava skanesnė.')).toBe(
      'Pasirinkimas: arbata ar kava skanesnė.',
    )
  })
})

describe('collectUniversalClassStoryIssues', () => {
  it('flags gender_flip', () => {
    const issues = collectUniversalClassStoryIssues([
      { role: 'hook', title: 'Test?', body: 'Tu esi linkęs keisti.' },
      { role: 'build', body: 'Planuodama iš anksto lengviau.' },
    ])
    expect(issues.some((i) => i.code === 'gender_flip')).toBe(true)
  })

  it('flags early_pitch on build slide', () => {
    const issues = collectUniversalClassStoryIssues([
      { role: 'hook', title: 'Ar valgai?', body: 'Hook body.' },
      { role: 'build', body: 'Tavo knyga padės suderinti planą.' },
      { role: 'close', body: 'Aiškus planas keičia kasdienybę.' },
    ])
    expect(issues.some((i) => i.code === 'early_pitch')).toBe(true)
  })

  it('flags conj_2sg in slide', () => {
    const issues = collectUniversalClassStoryIssues([
      { role: 'hook', title: 'Maistas: ką valgoi po treniruotės?', body: 'Body.' },
    ])
    expect(issues.some((i) => i.code === 'conj_2sg')).toBe(true)
  })

  it('flags verb_sense for pasitaiko in adapt context', () => {
    const issues = collectUniversalClassStoryIssues([
      { role: 'build', body: 'Kartais pasitaiko naujoje aplinkoje.' },
    ])
    expect(issues.some((i) => i.code === 'verb_sense')).toBe(true)
  })
})

describe('caption dump', () => {
  it('detects caption that pastes slide bodies', () => {
    const slides = [
      { title: 'Hook?', body: 'Naujoje aplinkoje lengva pamiršti, kas svarbu tau.' },
      { body: 'Suprask, kad įpročiai gali kisti net nepajutęs.' },
    ]
    const caption = `📌 Skaityk lėtai:

Hook?

Naujoje aplinkoje lengva pamiršti, kas svarbu tau.

Suprask, kad įpročiai gali kisti net nepajutęs.

Sužinok, ko tau iš tikrųjų trūksta - apsilankyk tavoknyga.com ir pradėk 5 min. testą! 🤩

•
•
•
#tavoknyga #maistas #lithuania #disciplina #lietuva`
    expect(captionSlideDumpScore(caption, slides)).toBeGreaterThanOrEqual(0.5)
    expect(isCaptionSlideDump(caption, slides)).toBe(true)
  })
})

describe('detectPostGenderFlip', () => {
  it('returns false for consistent masculine', () => {
    expect(
      detectPostGenderFlip([
        { body: 'Tu esi linkęs keisti.' },
        { body: 'Nepajutęs pokyčių, lengviau klysti.' },
      ]),
    ).toBe(false)
  })
})
