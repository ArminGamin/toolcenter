import { describe, expect, it } from 'vitest'
import {
  countWords,
  normalizeOneShotText,
  resolveOneShotCaptions,
  discordCaptionForNote,
  validateOneShotCaption,
  validateOneShotText,
} from '../one-shot-copy-skill.js'
import { countOneShotThemes, listOneShotCategories } from '../one-shot-theme-pool.js'

describe('one-shot copy gates', () => {
  it('rejects hashtags and accepts a notes paragraph', () => {
    expect(validateOneShotText('too short')).toMatch(/Too short/)
    expect(validateOneShotText(`${'word '.repeat(100)} #growth`)).toMatch(/Hashtag/)
    const ok = normalizeOneShotText(
      'I am striving for freedom. The desire for success is fueled by the need for freedom. I must be able to live how I imagine myself in the future. All my hopes and dreams will become reality once I break through the threshold that is the current boundaries of my current situation. You have to be crazy, you have to be insane to believe you are going to accomplish more than anyone has ever expected. You need people to look at you and call you crazy because you need to be crazy to achieve greatness. But it is not about them, it is about you. No one will take you to where you want to be other than yourself.',
    )
    expect(countWords(ok)).toBeGreaterThanOrEqual(90)
    expect(validateOneShotText(ok)).toBeNull()
  })

  it('strips em dashes into commas', () => {
    const cleaned = normalizeOneShotText(
      `${'word '.repeat(40)}Comfort is the enemy — not failure.${' word'.repeat(50)}`,
    )
    expect(cleaned).not.toMatch(/[—–\u2014\u2013]/)
    expect(cleaned).toContain('enemy, not failure')
  })

  it('accepts conceptual TikTok descriptions', () => {
    expect(validateOneShotCaption('Achluophobia')).toBeNull()
    expect(validateOneShotCaption('Mortality Salience')).toBeNull()
    expect(validateOneShotCaption('Unburdened Receptivity')).toBeNull()
    expect(validateOneShotCaption('Do not be afraid')).toMatch(/sentence/)
  })

  it('picks the short term that names the note', () => {
    const fear = resolveOneShotCaptions(
      'Do not be afraid. Use fear to your advantage, for once you take that leap there is no going back. Fear will eat you alive, do not let it consume you, let it fuel you to keep pushing. I would rather fear living in mediocrity knowing I chose not to act than fear taking action at all.',
      { captions: ['Peniaphobia', 'Achluophobia'] },
    )
    expect(fear.caption).toBe('Achluophobia')
    expect(fear.captions.length).toBeGreaterThanOrEqual(2)

    const death = resolveOneShotCaptions(
      'If you died right now, would you be content with how your life played out? Something that I think about frequently is how limited time we have on this planet. Our time here is so precious and short, that it could end at any minute. What is the point in procrastinating?',
      { captions: ['Reticence'] },
    )
    expect(death.caption).toBe('Mortality Salience')

    const privateWork = resolveOneShotCaptions(
      'The less you share the more you gain. Keeping your head down and focused keeps what is yours, yours. You have no requirement to let others in on your craft. No one will understand your full idea.',
      {},
    )
    expect(privateWork.caption).toBe('Reticence')
  })

  it('never uses the note paragraph as the Discord caption', () => {
    const note =
      "The quiet after the casseroles stop is a strange thing. I've been waiting for it to hit me like a wave, but instead it's been a gentle trickle of numbness. People go back to their lives and you are left alone with your grief. I miss the noise of their presence."
    const sent = discordCaptionForNote(note, note)
    expect(validateOneShotCaption(sent)).toBeNull()
    expect(sent.split(/\s+/).length).toBeLessThanOrEqual(4)
    expect(sent).toBe('Grief')
  })
})

describe('one-shot theme pool', () => {
  it('loads a wide category set', () => {
    expect(listOneShotCategories().length).toBeGreaterThanOrEqual(100)
    expect(countOneShotThemes()).toBeGreaterThanOrEqual(1700)
  })
})
