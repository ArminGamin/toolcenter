/**
 * Idea families the Kalėdų Kampelis copy keeps circling back to ("tinka žmogui", "nebūtina
 * brangi", "kai žinai, ko ieškai"). One slide per family after the hook; a second one reads
 * like the story going in circles. Leaf module — no imports, safe to use from the catalog.
 */
export const KALEDU_IDEA_FAMILIES: Array<{ key: string; re: RegExp }> = [
  {
    key: 'fits_person',
    re: /tink\p{L}*\s+(?:būtent\s+)?(?:tam\s+)?žmog|tiktų\s+(?:būtent\s+)?(?:tam\s+)?žmog|tiks\s+žmog|pagal\s+žmog|nuo\s+žmogaus|kam\s+(?:ją\s+)?(?:renkiesi|perki)|kam\s+dovana/iu,
  },
  {
    key: 'price',
    re: /brang|kain[aąos]|kainuo|biudžet|didel\p{L}*\s+sum/iu,
  },
  {
    key: 'knowing_what',
    re: /kai\s+žinai|kai\s+turi\s+aiškią\s+idėją/iu,
  },
]

export function ideaFamilies(text: string): string[] {
  return KALEDU_IDEA_FAMILIES.filter((family) => family.re.test(String(text || ''))).map((family) => family.key)
}

/** True when the candidate brings an idea family the prior text already used. */
export function repeatsIdeaFamily(candidate: string, priorText: string): boolean {
  const used = new Set(ideaFamilies(priorText))
  return ideaFamilies(candidate).some((family) => used.has(family))
}
