/**
 * Gift recipient detected from the post theme („Dovana seseriai…“). Stock fallback lines say
 * „žmogus / tam žmogui“; personalising them keeps a repaired slide on the post's subject
 * instead of drifting into generic shopping advice. Leaf module — no imports.
 */

export type KaleduRecipient = {
  key: string
  gender: 'm' | 'f' | 'pl'
  nom: string
  gen: string
  dat: string
  acc: string
  /** Matches the recipient in a theme or slide. */
  re: RegExp
}

export const KALEDU_RECIPIENTS: KaleduRecipient[] = [
  { key: 'mama', gender: 'f', nom: 'mama', gen: 'mamos', dat: 'mamai', acc: 'mamą', re: /(?<!\p{L})mam(?:a|ai|os|ą|yt\p{L}*)(?!\p{L})/iu },
  { key: 'tėtis', gender: 'm', nom: 'tėtis', gen: 'tėčio', dat: 'tėčiui', acc: 'tėtį', re: /(?<!\p{L})(?:tėt(?:is|į)|tėč(?:io|iui))(?!\p{L})/iu },
  { key: 'sesuo', gender: 'f', nom: 'sesuo', gen: 'sesers', dat: 'seseriai', acc: 'seserį', re: /(?<!\p{L})(?:sesuo|seser\p{L}*|sesei|sesės|sesę)(?!\p{L})/iu },
  { key: 'brolis', gender: 'm', nom: 'brolis', gen: 'brolio', dat: 'broliui', acc: 'brolį', re: /(?<!\p{L})brol(?:is|io|iui|į)(?!\p{L})/iu },
  { key: 'močiutė', gender: 'f', nom: 'močiutė', gen: 'močiutės', dat: 'močiutei', acc: 'močiutę', re: /(?<!\p{L})močiut\p{L}*/iu },
  { key: 'senelis', gender: 'm', nom: 'senelis', gen: 'senelio', dat: 'seneliui', acc: 'senelį', re: /(?<!\p{L})senel(?:is|io|iui|į)(?!\p{L})/iu },
  { key: 'vaikas', gender: 'm', nom: 'vaikas', gen: 'vaiko', dat: 'vaikui', acc: 'vaiką', re: /(?<!\p{L})(?:vaik(?:as|o|ui|ą|ams|ų)|mažyl\p{L}*)(?!\p{L})/iu },
  { key: 'paauglys', gender: 'm', nom: 'paauglys', gen: 'paauglio', dat: 'paaugliui', acc: 'paauglį', re: /(?<!\p{L})paaugl\p{L}*/iu },
  { key: 'draugė', gender: 'f', nom: 'draugė', gen: 'draugės', dat: 'draugei', acc: 'draugę', re: /(?<!\p{L})draug(?:ė|ei|ės|ę)(?!\p{L})/iu },
  { key: 'draugas', gender: 'm', nom: 'draugas', gen: 'draugo', dat: 'draugui', acc: 'draugą', re: /(?<!\p{L})draug(?:as|o|ui|ą)(?!\p{L})/iu },
  { key: 'kolega', gender: 'm', nom: 'kolega', gen: 'kolegos', dat: 'kolegai', acc: 'kolegą', re: /(?<!\p{L})koleg\p{L}*|slaptas\p{L}*\s+senel/iu },
  { key: 'vyras', gender: 'm', nom: 'vyras', gen: 'vyro', dat: 'vyrui', acc: 'vyrą', re: /(?<!\p{L})vyr(?:as|o|ui|ą)(?!\p{L})/iu },
  { key: 'moteris', gender: 'f', nom: 'moteris', gen: 'moters', dat: 'moteriai', acc: 'moterį', re: /(?<!\p{L})moter(?:is|s|iai|į)(?!\p{L})/iu },
  { key: 'tėvai', gender: 'pl', nom: 'tėvai', gen: 'tėvų', dat: 'tėvams', acc: 'tėvus', re: /(?<!\p{L})tėv(?:ai|ų|ams|us)(?!\p{L})/iu },
  { key: 'pora', gender: 'f', nom: 'pora', gen: 'poros', dat: 'porai', acc: 'porą', re: /(?<!(?:\d|trys|tris|dvi|kelios|keturios|penkios)\s{0,2})(?<!\p{L})por(?:a|ai|os|ą)(?!\p{L})(?!\s+(?:dien|minuč|valand|savaič|kart|met|žodž|(?:\p{L}+\s+){0,2}kojin))/iu },
  { key: 'šeima', gender: 'f', nom: 'šeima', gen: 'šeimos', dat: 'šeimai', acc: 'šeimą', re: /(?<!\p{L})šeim(?:a|ai|os|ą|oje)(?!\p{L})/iu },
  { key: 'pažįstamas', gender: 'm', nom: 'naujas pažįstamas', gen: 'naujo pažįstamo', dat: 'naujam pažįstamam', acc: 'naują pažįstamą', re: /(?<!\p{L})pažįstam\p{L}*/iu },
]

export function detectKaleduRecipient(themeText: string): KaleduRecipient | null {
  const text = String(themeText || '')
  // „Slaptasis Senelis“ is the office gift game, not a grandfather.
  const probe = text.replace(/slapt\p{L}*\s+senel\p{L}*/giu, 'kolegai')
  // The earliest mention wins: the theme title comes first („…megztiniai porai…“), the hook
  // and body after it may mention someone else in passing.
  let best: { r: KaleduRecipient; at: number } | null = null
  for (const r of KALEDU_RECIPIENTS) {
    const at = probe.search(r.re)
    if (at >= 0 && (!best || at < best.at)) best = { r, at }
  }
  return best?.r || null
}

/** Every recipient a text mentions (for drift checks). */
export function mentionedKaleduRecipients(text: string): string[] {
  const probe = String(text || '').replace(/slapt\p{L}*\s+senel\p{L}*/giu, 'kolegai')
  return KALEDU_RECIPIENTS.filter((r) => r.re.test(probe)).map((r) => r.key)
}

function cap(word: string): string {
  return word.charAt(0).toLocaleUpperCase('lt-LT') + word.slice(1)
}

/**
 * „Pagalvok, kaip tas žmogus leidžia laisvą vakarą.“ → „Pagalvok, kaip sesuo leidžia laisvą vakarą.“
 * Only lines that talk about „žmogus“ change; returns null when nothing changed.
 */
export function personalizeForRecipient(line: string, r: KaleduRecipient): string | null {
  if (!/žmog/iu.test(line)) return null
  let out = line
    .replace(/(^|[.!?…]\s+)Tokiam žmogui/gu, (_m, pre: string) => `${pre}${cap(r.dat)}`)
    .replace(/(?<!\p{L})tokiam žmogui(?!\p{L})/gu, r.dat)
    .replace(/(?<!\p{L})tas žmogus(?!\p{L})/gu, r.nom)
    .replace(/(?<!\p{L})tam žmogui(?!\p{L})/gu, r.dat)
    .replace(/(?<!\p{L})to žmogaus(?!\p{L})/gu, r.gen)
    .replace(/(?<!\p{L})tą žmogų(?!\p{L})/gu, r.acc)
    .replace(/(?<!\p{L})žmogus(?!\p{L})/gu, r.nom)
    .replace(/(?<!\p{L})žmogui(?!\p{L})/gu, r.dat)
    .replace(/(?<!\p{L})žmogaus(?!\p{L})/gu, r.gen)
    .replace(/(?<!\p{L})žmogų(?!\p{L})/gu, r.acc)
  if (r.gender === 'pl') {
    out = out
      .replace(/(?<!\p{L})pats sau(?!\p{L})/gu, 'patys sau')
      .replace(/(?<!\p{L})jis(?!\p{L})/gu, 'jie')
      .replace(/(?<!\p{L})Jis(?!\p{L})/gu, 'Jie')
  }
  if (r.gender === 'f') {
    out = out
      .replace(/(?<!\p{L})pats sau(?!\p{L})/gu, 'pati sau')
      .replace(/(?<!\p{L})jis(?!\p{L})/gu, 'ji')
      .replace(/(?<!\p{L})Jis(?!\p{L})/gu, 'Ji')
  }
  return out === line ? null : out
}

/** Theme-personalised variants first, then the stock lines (still validated by the caller). */
export function recipientFirstPool(lines: readonly string[], themeText: string): string[] {
  const r = detectKaleduRecipient(themeText)
  if (!r) return [...lines]
  const personal = lines.map((line) => personalizeForRecipient(line, r)).filter((line): line is string => Boolean(line))
  return [...personal, ...lines]
}
