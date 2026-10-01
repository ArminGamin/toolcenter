export const KALEDU_UNIVERSAL_DESCRIPTION = `🎅 Kalėdų kampelis - viskas, ko reikia jaukioms šventėms! Dekoracijos, dovanų idėjos ir nuotaika visiems namams ✨
🛒 Užsuk į kaledukampelis.com (nuoroda bio)
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
