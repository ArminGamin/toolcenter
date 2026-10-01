import { describe, expect, it } from 'vitest'
import { finalizeHookTitle, ensureHookQuestionMark, isInterrogativeHookTitle } from '../ugc-hook-templates.js'
import {
  normalizeLtUgcMultiline,
  isGibberishLtCopy,
  isShipableLtSlide,
  assertShipableLtSlide,
} from '../ugc-lt-normalize.js'
import { buildBatchTemplateCaption, UGC_CAPTION_CTA } from '../ugc-caption-format.js'

/** Audit hooks that shipped without "?" — finalize must restore it. */
const AUDIT_HOOKS_MISSING_Q = [
  'Ar kepenys kenčia nuo vasaros karščio',
  'Ar jauti vasaros karštis savo kūne',
  'Ar tavo rezultatai vis nepastovi',
  'Ar insulinrezistencija stabdo pažangą',
  'Ar trūgsta energijos po pietų',
  'Ar jauti, kad mityba vis tiek neveikia',
  'Ar stengiame planuoti, bet niekas nesikeičia',
  'Ar anglies hidratų perteklius trukdo',
  'Kodėl savaitės planas vis stringa',
]

const AUDIT_INVENTED: Array<{ raw: string; mustNotMatch: RegExp }> = [
  { raw: 'Norisi pasimėgauti skaniais patiekalimis.', mustNotMatch: /patiekalimis/i },
  { raw: 'Jaučiuosi varginantis po pietų.', mustNotMatch: /varginantis|jaučiuosi/i },
  { raw: 'Dabar aš ruošiasi vakarienei.', mustNotMatch: /aš ruošiasi/i },
  { raw: 'Tai leidžia kepenims atpalaiduoti.', mustNotMatch: /atpalaiduoti/i },
  { raw: 'Tau trūgsta baltymų.', mustNotMatch: /trūgsta/i },
  { raw: 'Besimauginantis organizmas greitai pavargsta.', mustNotMatch: /besimaugin/i },
  { raw: 'Kai jauti vasaros karštis, reikia vandens.', mustNotMatch: /karštis,/i },
  { raw: 'Su įtūmiu ritmu norėtumis poilsio, bet režinas nelūžta.', mustNotMatch: /įtūmi|norėtumis|režinas/i },
  { raw: 'Jausi ramesnis po plano.', mustNotMatch: /Jausi ramesnis/i },
  { raw: 'Savaitė sunksta nuo nuovokio. Aišus planas padeda.', mustNotMatch: /sunksta|nuovokio|Aišus/i },
  { raw: 'Insulinrezistencija ir medžiukų trūkumas tebetruksminga.', mustNotMatch: /Insulinrezistencija|medžiuk|tebetruksm/i },
  { raw: 'Tai gali daryti įtakos svoriui.', mustNotMatch: /įtakos/i },
  { raw: 'Tavo rezultatai vis nepastovi.', mustNotMatch: /nepastovi\./i },
  { raw: 'Išleidžiamos pinigai be plano.', mustNotMatch: /Išleidžiamos pinigai/i },
  { raw: 'Stengiame laikytis plano.', mustNotMatch: /Stengiame/i },
  { raw: 'Per daug anglies hidratų vakare.', mustNotMatch: /anglies hidrat/i },
  { raw: 'Tai atsiliepia savijauta.', mustNotMatch: /savijauta\./i },
  { raw: 'Nori jaustis gyvesnis ir produktyvus.', mustNotMatch: /gyvesnis ir produktyvus/i },
]

const WE_FORMS = [
  'Mes pasiūlysime tau meniu.',
  'Mes pritaikome planą tau.',
  'Kai ruošiamės valgyti, pamirštame vandenį.',
  'Užsisklendiname virtuvėje ir Galime eksperimentuoti.',
]

describe('audit fortress — hook question marks', () => {
  it('does not treat declarative titles with stray ? as interrogative', () => {
    expect(isInterrogativeHookTitle('Netinkamas maistas gali sugadinti popietę?')).toBe(false)
    expect(ensureHookQuestionMark('Netinkamas maistas gali sugadinti popietę?')).toBe(
      'Netinkamas maistas gali sugadinti popietę?',
    )
    expect(isInterrogativeHookTitle('Maisto rinkinys: ar tai lengva?')).toBe(true)
  })

  it.each(AUDIT_HOOKS_MISSING_Q)('finalize restores ? for: %s', (raw) => {
    for (const style of ['Bold claim', 'Contrarian', 'Story opener', 'Question'] as const) {
      const t = finalizeHookTitle(raw, style, raw, 1)
      expect(t.endsWith('?'), `${style}: ${t}`).toBe(true)
      expect(isInterrogativeHookTitle(t)).toBe(true)
    }
    expect(ensureHookQuestionMark(raw).endsWith('?')).toBe(true)
  })

  it('shipable rejects Ar title without ?', () => {
    expect(() =>
      assertShipableLtSlide({
        title: 'Ar kepenys kenčia nuo vasaros karščio',
        body: 'Karštis verčia planuoti lengvesnius patiekalus kiekvieną dieną.',
        role: 'hook',
      }),
    ).toThrow(/missing "\?"/i)
  })
})

describe('audit fortress — phrase bank', () => {
  it.each(AUDIT_INVENTED)('normalizes: $raw', ({ raw, mustNotMatch }) => {
    const out = normalizeLtUgcMultiline(raw)
    expect(out).not.toMatch(mustNotMatch)
    expect(isGibberishLtCopy(out)).toBe(false)
    expect(
      isShipableLtSlide({
        title: '',
        body: out.includes('.') ? out : `${out} Planas tai išsprendžia.`,
        role: 'build',
      }),
    ).toBe(true)
  })
})

describe('audit fortress — we-forms', () => {
  it.each(WE_FORMS)('rewrites or rejects: %s', (raw) => {
    const out = normalizeLtUgcMultiline(raw)
    if (/\b(pasiūlysime|pritaikome|ruošiamės|užsisklendiname|pamirštame|galime eksperimentuoti)\b/i.test(out)) {
      expect(isGibberishLtCopy(out)).toBe(true)
    } else {
      expect(out).not.toMatch(/\b(pasiūlysime|Mes pritaikome|ruošiamės)\b/i)
    }
  })
})

describe('audit fortress — captions', () => {
  it('varies P1 across themes and keeps structure', () => {
    const themes = [
      {
        theme: 'zero waste',
        themeHook: 'Mažiau maisto švaistymo.',
        slides: [{ title: 'Ar maisto švaistymas vėl auga vasarą?', body: 'Planas padeda.' }],
      },
      {
        theme: 'weight goals',
        themeHook: 'Svorio tikslas stringa.',
        slides: [{ title: 'Kodėl svorio tikslas vis stringa?', body: 'Ritmas svarbu.' }],
      },
      {
        theme: 'summer energy',
        themeHook: 'Energija krenta.',
        slides: [{ title: 'Ar energija krenta po pietų?', body: 'Vanduo padeda.' }],
      },
    ]
    const p1s = themes.map((t, i) => {
      const built = buildBatchTemplateCaption({
        themeHook: t.themeHook,
        themeBody: 'Dažniausiai padeda viena paprasta taisyklė apie ritmą.',
        slides: t.slides,
        defaultCta: 'x',
        seed: i,
        theme: t.theme,
        category: 'audit',
      })
      const paras = built.description.split(/\n\n/)
      expect(paras).toHaveLength(4)
      expect(paras[3]).toBe(UGC_CAPTION_CTA)
      expect(built.description).not.toMatch(/—|–/)
      expect(paras[0]).toMatch(/\?/)
      expect(paras[1].length).toBeGreaterThanOrEqual(40)
      return paras[0]
    })
    expect(new Set(p1s).size).toBe(3)
  })
})
