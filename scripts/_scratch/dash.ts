import { stripLtEmDashes, normalizeLtUgcMultiline } from '../../server/ugc-lt/normalize-copy.js'
const cases = [
  'Užpildyk testą — gauk knygą.',
  'Močiutės vakaras – ritualas.',
  'Ritualai su šviesa – jaukumo kelias.',
  'Šventiška nuotaika – visai šalia.',
  'Nuspręsti, kas svarbiausia – didelis žingsnis į priekį.',
  'Kalėdiniai megztiniai – kasmetinė tradicija?',
  'Šeimos portretas – tai daugiau nei tik atminimas.',
  'Dabar jau net nesusiduri su paieškos procesu – tiesiog bėgi į priekį.',
  'Vilnonis pledas „Žiemos šiluma“ - puiki dovana jaukiam vakarui.',
  'Dovanok tai, kas svarbiausia – laiką kartu.',
  'Kaina 2 - 3 eurai.',
  'Tik tiek – ir viskas.',
  'Kai žinai, ko nori – rinktis lengva.',
]
for (const c of cases) console.log(c, '\n  =>', stripLtEmDashes(c), '\n  N>', normalizeLtUgcMultiline(c))
