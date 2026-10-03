export const KALEDU_UNIVERSAL_DESCRIPTION = `🎅 Kalėdų Kampelis – viskas, ko reikia jaukioms šventėms! Dekoracijos, dovanų idėjos ir nuotaika visiems namams ✨
🛒 Užsuk į kaledukampelis.com (nuoroda profilyje)
💬 Parašyk komentaruose, kokia tavo mėgstamiausia kalėdinė tradicija!

#kaledukampelis
#kaledos
#dekoracijos
#dovanos
#christmas
#christmasdecor
#jaukumas
#lithuania`

export function resolveUniversalUgcDescription(
  profileId: string,
  description?: string,
  generateAutomatically = false,
): string | undefined {
  return profileId === 'christmas-gifts' && !generateAutomatically && description?.trim()
    ? description
    : undefined
}

export const KALEDU_UNIVERSAL_DESCRIPTION_2 = `🎄 Kalėdų nuotaika prasideda čia! Papuošk namus, rask idealias dovanas ir sukurk šventinę atmosferą ✨
🛍️ Visa tai rasi kaledukampelis.com (nuoroda profilyje)
💬 O tu jau pradėjai ruoštis šventėms? Papasakok komentaruose!

#kaledukampelis
#kaledos
#kaledinenuotaika
#namudekoras
#dovanuidejos
#christmasvibes
#christmasdecor
#lithuania`

export const KALEDU_UNIVERSAL_DESCRIPTION_3 = `✨ Šventės arčiau, nei atrodo! Kalėdų Kampelis padės sukurti jaukiausius namus ir rasti dovanas, kurios nudžiugins 🎁
👉 Aplankyk kaledukampelis.com (nuoroda profilyje)
💬 Kokią dovaną šiemet labiausiai norėtum gauti? Rašyk komentaruose!

#kaledukampelis
#kaledos
#kaledudekoracijos
#dovanos
#sventes
#christmas
#christmasgifts
#lithuania`

/** Number of description slots; each post picks one of the filled ones at random. */
export const UNIVERSAL_DESCRIPTION_SLOTS = 3

export const KALEDU_UNIVERSAL_DESCRIPTIONS = [
  KALEDU_UNIVERSAL_DESCRIPTION,
  KALEDU_UNIVERSAL_DESCRIPTION_2,
  KALEDU_UNIVERSAL_DESCRIPTION_3,
]

/**
 * Always returns exactly three slots. Older drafts only had one description:
 * it keeps slot 1 and the two new defaults fill the rest.
 */
export function normalizeUniversalDescriptions(list?: unknown, legacy?: string): string[] {
  if (Array.isArray(list) && list.length) {
    const slots = list.slice(0, UNIVERSAL_DESCRIPTION_SLOTS).map((v) => (typeof v === 'string' ? v : ''))
    while (slots.length < UNIVERSAL_DESCRIPTION_SLOTS) slots.push('')
    return slots
  }
  return [legacy ?? KALEDU_UNIVERSAL_DESCRIPTION, KALEDU_UNIVERSAL_DESCRIPTION_2, KALEDU_UNIVERSAL_DESCRIPTION_3]
}

/** Filled descriptions to rotate between, or undefined when captions should be generated. */
export function resolveUniversalUgcDescriptions(
  profileId: string,
  descriptions?: string[],
  generateAutomatically = false,
): string[] | undefined {
  if (profileId !== 'christmas-gifts' || generateAutomatically) return undefined
  const filled = (descriptions || []).filter((d) => typeof d === 'string' && d.trim())
  return filled.length ? filled : undefined
}

/** Random description for a post, avoiding the one the previous post used when possible. */
export function pickUniversalDescription(
  descriptions: string[],
  previous?: string,
  random: () => number = Math.random,
): string {
  const pool = descriptions.length > 1 ? descriptions.filter((d) => d !== previous) : descriptions
  const choices = pool.length ? pool : descriptions
  return choices[Math.floor(random() * choices.length) % choices.length]
}
