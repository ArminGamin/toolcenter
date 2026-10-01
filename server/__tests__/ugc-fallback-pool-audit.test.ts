import { describe, expect, it } from 'vitest'
import {
  assertShipableLtSlide,
  collectSlideIssues,
  UGC_GENERIC_FILLER_PATTERNS,
  textHasEngagementBait,
} from '../ugc-lt-normalize.js'
import {
  UGC_FALLBACK_BUILD_BODIES,
  UGC_FALLBACK_CONTEXT_BODIES,
  getFallbackCloseBodyCandidates,
} from '../ugc-story-engine.js'
import { UGC_HOOK_BODY_BRIDGES } from '../ugc-hook-templates.js'

describe('fallback pool audit', () => {
  const supportCases = [
    ...UGC_FALLBACK_BUILD_BODIES.map((body) => ['build', body] as const),
    ...UGC_FALLBACK_CONTEXT_BODIES.map((body) => ['context', body] as const),
  ]

  it.each(supportCases)('%s line passes ship gates', (role, body) => {
    expect(UGC_GENERIC_FILLER_PATTERNS.some((re) => re.test(body))).toBe(false)
    expect(textHasEngagementBait(body)).toBe(false)
    assertShipableLtSlide({ body, role })
    expect(
      collectSlideIssues({ body, role }).filter(
        (issue) =>
          issue.code === 'grammar_defect' ||
          issue.code === 'masculine_participle' ||
          issue.code === 'declarative_question_mark' ||
          issue.code === 'engagement_bait',
      ),
    ).toHaveLength(0)
  })

  it.each(UGC_HOOK_BODY_BRIDGES)('hook body bridge passes ship gates: %s', (bridge) => {
    expect(textHasEngagementBait(bridge)).toBe(false)
    assertShipableLtSlide({ body: bridge, role: 'hook' })
  })

  it.each(getFallbackCloseBodyCandidates('meal prep'))('close candidate passes ship gates', (body) => {
    assertShipableLtSlide({ body, role: 'close' })
  })
})
