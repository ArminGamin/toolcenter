import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { runWithBusinessProfile } from '../business-profiles.js'
import { buildBatchPostCaption } from '../ugc-caption-format.js'
import { scanCaption, validateUgcExportPost } from '../ugc-batch-audit.js'
import { saveUgcBatchPostToDisk } from '../ugc-batch-export.js'
import { KALEDU_UNIVERSAL_DESCRIPTION } from '../../src/lib/ugc-universal-description.js'

const generatedInput = {
  themeHook: 'Ar dovanų paieška užtrunka?',
  themeBody: 'Rasti dovaną lengviau, kai žinai, kas patinka žmogui.',
  slides: [{ title: 'Ar dovanų paieška užtrunka?', body: 'Dovaną rinkis pagal žmogaus pomėgius.', role: 'hook' }],
  defaultCta: 'Rask dovaną Kalėdų Kampelyje - kaledukampelis.com 🎁',
}

describe('universal description through batch caption and export', () => {
  it('skips caption construction and formatting and reuses the exact text for every post', () => {
    runWithBusinessProfile('christmas-gifts', () => {
      for (const seed of [1, 2]) {
        const caption = buildBatchPostCaption({
          ...generatedInput,
          seed,
          universalDescription: KALEDU_UNIVERSAL_DESCRIPTION,
          get slides() { throw new Error('Caption generation must be skipped') },
        })
        expect(caption).toBe(KALEDU_UNIVERSAL_DESCRIPTION)
        const saved = saveUgcBatchPostToDisk(process.env.UGC_VISION_ROOT, undefined, {
          postIndex: seed, caption, meta: { caption_source: 'universal' }, slides: [],
        })
        expect(saved.ok).toBe(true)
        if (!saved.ok) throw new Error(saved.message)
        expect(fs.readFileSync(path.join(saved.batchDir, `Post ${String(seed).padStart(2, '0')}`, 'caption.txt'), 'utf8'))
          .toBe(KALEDU_UNIVERSAL_DESCRIPTION + '\n')
      }
    })
  })

  it('keeps generated caption rules and slide gates while accepting custom Christmas formatting', () => {
    runWithBusinessProfile('christmas-gifts', () => {
      expect(scanCaption(KALEDU_UNIVERSAL_DESCRIPTION, generatedInput.slides, 'universal').issues).toEqual([])
      expect(scanCaption(KALEDU_UNIVERSAL_DESCRIPTION, generatedInput.slides).issues).toContain('missing_pin_opener')
      expect(scanCaption('  ', [], 'universal').issues).toContain('empty_universal_description')
      expect(validateUgcExportPost({ caption: KALEDU_UNIVERSAL_DESCRIPTION, meta: { caption_source: 'universal' } }).issues)
        .toContain('story_slides:missing')
      expect(buildBatchPostCaption(generatedInput)).toMatch(/^📌/)
    })
    runWithBusinessProfile('tavo-knyga', () => {
      expect(scanCaption(KALEDU_UNIVERSAL_DESCRIPTION, [], 'universal').issues).toContain('missing_pin_opener')
      expect(buildBatchPostCaption({ ...generatedInput, universalDescription: KALEDU_UNIVERSAL_DESCRIPTION }))
        .not.toBe(KALEDU_UNIVERSAL_DESCRIPTION)
    })
  })
})
