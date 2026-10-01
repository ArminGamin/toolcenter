const PERSONAL_REJECT_KEYWORDS = [
  // cities (+ common LT genitive / glued stems)
  'kaunas', 'vilnius', 'kedainiai', 'kedainiu', 'panevezys', 'panevezio', 'klaipeda',
  'klaipedos', 'siauliai', 'siauliu', 'marijampole', 'marijampoles', 'utena', 'utenos',
  'anyksciai', 'anyksciu', 'birzai', 'birzu', 'visaginas', 'visagino', 'elektrenai',
  'elektrenu', 'gargzdai', 'gargzdu', 'jieznas', 'jonava', 'jonavos', 'jurbarkas',
  'jurbarko', 'kursenai', 'kursenu', 'kupiskis', 'kupiskio', 'mazeikiai', 'mazeikiu',
  'palemonas', 'panemune', 'raseiniai', 'raseiniu', 'romainiai', 'silute', 'silutes',
  'trakai', 'traku', 'ukmerge', 'ukmerges', 'varena', 'varenos', 'vieksniai',
  'zaliakalnis', 'alksnenai', 'alytus', 'alytaus', 'birstonas', 'birstono',
  'druskininkai', 'druskininku', 'ignalina', 'ignalinos', 'kaisiadorys', 'kaisiadoriu',
  'kalvarija', 'kalvarijos', 'kazluruda', 'kelme', 'kelmes', 'kretinga', 'kretingos',
  'lazdijai', 'lazdiju', 'moletai', 'moletu', 'naujojiakmene', 'neringa', 'neringos',
  'pagegiai', 'pagegiu', 'pakruojis', 'pakruojo', 'palanga', 'palangos', 'pasvalys',
  'pasvalio', 'plunge', 'plunges', 'prienai', 'prienu', 'radviliskis', 'radviliskio',
  'rietavas', 'rietavo', 'rokiskis', 'rokiskio', 'skuodas', 'skuodo', 'taurage',
  'taurages', 'telsiai', 'telsiu', 'truskava', 'vilkaviskis', 'vilkaviskio', 'zarasai',
  'zarasu', 'vilniaus', 'kauno', 'senamiestis', 'senamiescio', 'senamiesti', 'oldtown',
  'naujamiestis', 'naujamiescio', 'dainava', 'dainavos', 'vilijampole', 'vilijampoles',
  'petrasiunai', 'petrasiunu', 'aleksotas', 'aleksoto', 'silainiai', 'silainiu', 'eiguliai',
  'eiguliu', 'sanciai', 'sanciu', 'panemunes', 'antakalnis', 'antakalnio', 'fabijoniskes',
  'fabijoniskiu', 'grigiskes', 'grigiskiu', 'justiniskes', 'justiniskiu', 'karoliniskes',
  'karoliniskiu', 'lazdynai', 'lazdynu', 'naujininkai', 'naujininku', 'naujojivilnia',
  'vilnia', 'paneriai', 'paneriu', 'pasilaiciai', 'pasilaiciu', 'pilaite', 'pilaites',
  'seskine', 'seskines', 'snipiskes', 'snipiskiu', 'verkiai', 'verkiu', 'vilkpede',
  'vilkpedes', 'virsuliskes', 'virsuliskiu', 'zirmunai', 'zirmunu', 'zverynas', 'zveryno',
  'valakampiai', 'valakampiu', 'sauletekis', 'sauletekio', 'melnrage', 'melnrages',
  'giruliai', 'giruliu', 'smiltyne', 'smiltynes', 'rajonas', 'rajonai', 'rajono',
  'seniunija', 'seniunijos', 'municipality', 'municipalities', 'county', 'counties',
  // institutions / orgs
  'centras', 'bendruomene', 'asociacija', 'draugija', 'fondas', 'parama', 'globa',
  'namai', 'parapija', 'katedra', 'bazilika', 'vienuolynas', 'darzelis', 'mokykla',
  'kolegija', 'universitetas', 'ligonine', 'klinika', 'poliklinika', 'komitetas',
  'taryba', 'ministerija', 'savivaldybe', 'administracija', 'inspekcija', 'departamentas',
  'seimas', 'teismas', 'prokuratura', 'imone', 'verslas', 'parduotuve', 'prekyba',
  'paslaugos', 'logistika', 'transportas', 'gamyba', 'korporacija', 'ofisas', 'biuras',
  'organizacija', 'klubas', 'klubai', 'klubo', 'club', 'clubs', 'basketball', 'football',
  'futbolas', 'futbolo', 'krepsinis', 'krepsinio', 'sajunga', 'partija', 'judejimas',
  'pagalba', 'remimas', 'labdara', 'burelis', 'studija', 'studio', 'studios', 'studijos',
  'agentura', 'tinklas', 'grupe', 'komanda', 'baznycia', 'baznycios', 'church', 'churches',
  'mokyklos', 'rastine', 'rastines', 'programma', 'programa', 'programos', 'program',
  'programs', 'lietuva', 'lietuvos', 'lithuania', 'legailiai', 'legalija', 'legalus',
  'legalu', 'legal', 'dokumentai', 'dokumentas', 'dokumenta', 'documents', 'document',
  'storytelling', 'vadokliu', 'vadokliai',
  // bookstores / archives / photo / souvenirs
  'knygynas', 'knygynai', 'knygos', 'knyga', 'bookstore', 'bookshop', 'archyvas',
  'archyvai', 'archvizija', 'archive', 'archives', 'fotografas', 'fotografija',
  'fotograf', 'photography', 'photographer', 'souvenirs', 'souvenir', 'suvenyrai',
  'suvenyras', 'suvenirai', 'suveniras',
  // construction / real estate
  'statyba', 'namas', 'butas', 'pastatas', 'renovacija', 'remontas', 'projektas',
  'architektas', 'rangovas', 'plyta', 'betonas', 'stogas', 'siena', 'langas', 'durys',
  'grindys', 'fasadas', 'inzinerija', 'infrastruktura', 'bustas', 'nekilnojamasis',
  'turtas', 'pletra', 'vystytojas', 'statytojas', 'apdaila', 'santechnika', 'elektra',
  'sildymas', 'vedinimas',
  // business
  'uab', 'turgus', 'konsultacija', 'tiekimas', 'pardavimas', 'klientas', 'partneris',
  'individuali',
  // roles / titles
  'direktorius', 'direktore', 'vadovas', 'vadove', 'vadybininkas', 'buhalteris',
  'advokatas', 'teisininkas', 'notaras', 'antstolis', 'inspektorius', 'gydytojas',
  'chirurgas', 'psichologas', 'psichologe', 'psichologes', 'psichologai', 'psichologija',
  'psychologist', 'psychologists', 'psychology', 'terapeutas', 'destytojas', 'profesorius',
  'mokytojas', 'mokytoja', 'mokytojos', 'mokytoju', 'mokytojai', 'teacher', 'teachers',
  'aukletojas', 'treneris', 'konsultantas', 'analitikas', 'programuotojas',
  'inzinierius', 'dizaineris', 'menininkas', 'vairuotojas', 'mechanikas',
  'virejas', 'padavejas', 'valytojas', 'sargas', 'apsauga', 'prezidentas', 'prezidente',
  'prezidentai', 'president', 'presidents', 'pirmininkas', 'pirmininke', 'pirmininkai',
  // events / collectives
  'renginys', 'koncertas', 'festivalis', 'muge', 'forumas', 'konferencija', 'seminaras',
  'susitikimas', 'ekskursija', 'stovykla', 'grupinis', 'kolektyvas', 'burys', 'skyrius',
  'posedis', 'susirinkimas', 'svente', 'paroda', 'varzybos', 'turnyras', 'cempionatas',
  'olimpiada', 'konkursas', 'konkursai', 'konkurs', 'giveaway', 'giveaways',
  // government
  'vicemeras', 'meras', 'tarnyba', 'vrk', 'policija', 'priesgaisrine', 'ugniagesiai',
  'gelbetojai', 'kariuomene', 'krastoapsauga', 'muitininkai', 'pasienieciai',
  'prezidentura',
  // education
  'gimnazija', 'gimnazijos', 'licejus', 'progimnazija', 'progimnazijos', 'koledzas',
  'akademija', 'institutas', 'fakultetas', 'studijos', 'studentas', 'alumnus', 'alumni',
  'abiturientas', 'paskaita', 'egzaminas', 'diplomas', 'bakalauras', 'magistras',
  'doktorantas',
  // school / teacher / training — stems below catch most case/gender forms
  'mokyklu', 'mokykloj', 'mokykline', 'mokyklinis', 'mokyklinei', 'mokyklines', 'mokyklinio',
  'school', 'schools', 'schooling',
  'mokymai', 'mokymas', 'mokymo', 'mokymu', 'mokymams', 'mokymuose', 'mokymosi', 'mokymasis',
  'training', 'trainings', 'trainer', 'trainers',
  // loans / finance orgs
  'paskola', 'paskolos', 'paskolu', 'paskolai', 'paskoloms', 'paskoline', 'paskolinis',
  'loan', 'loans', 'lender', 'lenders', 'lending',
  'kreditas', 'kreditai', 'kredito', 'kreditine', 'kreditinis', 'skola', 'skolos', 'skolu',
  // family / parenting orgs
  'mama', 'mamos', 'mamoms', 'mamute', 'mamutes', 'mamyte', 'mamytes', 'mamyt',
  'tevai', 'tevu', 'tevas', 'tevo', 'tevams', 'tevelis', 'teveliai', 'motina', 'motinos',
  'parents', 'parent', 'parenting', 'mother', 'mothers', 'motherhood', 'father', 'fathers',
  'fatherhood', 'family', 'families',
  // websites / portals
  'svetaine', 'svetaines', 'svetainiu', 'svetaineje', 'svetainemis',
  'website', 'websites', 'webpage', 'homepage', 'homepages',
  // charity / caritas
  'caritas', 'caritai', 'carito', 'caritoji', 'charity', 'charities', 'charitable',
  // museums
  'muziejus', 'muziejai', 'muziejaus', 'muzieju', 'muziejuje', 'muziejinis',
  'museum', 'museums', 'museo',
  // privacy / private orgs
  'private', 'privatumas', 'privatu', 'privatumo', 'privatuma', 'privatume', 'privacy',
  'privatini', 'privatus', 'privati', 'privatios', 'privatiai', 'privatization',
  // rentals
  'nuoma', 'nuomos', 'nuomu', 'nuomai', 'nuomoms', 'nuomine', 'nuominis',
  'nuomininkas', 'nuomininke', 'nuomininkai', 'nuomininkes', 'nuomininku',
  'nuomotojas', 'nuomotoja', 'nuomotojai', 'nuomotojos',
  'rental', 'rentals', 'renting', 'renter', 'renters', 'landlord', 'landlords',
  // guardianship / care (globa already above)
  'globos', 'globojimas', 'globoja', 'globojamas', 'globojama', 'globojami', 'globejas',
  'globeja', 'globojimas', 'caregiver', 'caregivers', 'guardianship', 'guardian', 'guardians',
  // crisis / helplines — never scrape (Vilties linija + common typo vlties)
  'vilties', 'viltieslinija', 'vlties', 'vltieslinija', 'helpline', 'helplines', 'crisisline',
  // culture / cultural centres (sveksnoskultura@, kulturosnamai@…)
  'kultura', 'kulturos', 'kulturai', 'kulturu', 'kulturoje', 'kulturinis', 'kulturine',
  'kulturines', 'kulturinio', 'kulturiniai', 'kulturnamis', 'kulturosnamai', 'kulturosnamo',
  'culture', 'cultural', 'cultures',
  // LT ethnographic regions + “region” (zemaitijosregionas@, dzukija…@)
  'zemaitija', 'zemaitijos', 'zemaitijai', 'zemaitiju', 'zemaitijoje', 'samogitia', 'samogitian',
  'aukstaitija', 'aukstaitijos', 'aukstaitijai', 'aukstaitiju', 'aukstaitijoje',
  'dzukija', 'dzukijos', 'dzukijai', 'dzukiju', 'dzukijoje',
  'suvalkija', 'suvalkijos', 'suvalkijai', 'suvalkiju', 'suvalkijoje',
  'regionas', 'regionai', 'regiono', 'regionui', 'regionams', 'regionuose', 'regioninis',
  'regionine', 'regionines', 'regioninio', 'regioniniai', 'regional', 'region', 'regions',
  // fake / placeholder
  'johnsmith', 'johndoe', 'jsmith', 'mikesmithee', 'testuser', 'user123', 'placeholder',
  'example', 'sample', 'dummy', 'fakeuser', 'testmail',
]

/**
 * Stem hits (substring on compact local). Catches glued gender/case/plural forms
 * without listing every LT ending. Keep stems ≥5 chars to limit name false-positives.
 * Sync with REJECT_STEMS in personal_email_rules.py.
 */
const PERSONAL_REJECT_STEMS = [
  'mokyk', // mokykla, mokyklos, mokyklinis…
  'mokyt', // mokytojas, mokytoja, mokytojos…
  'mokym', // mokymas, mokymai, mokymosi…
  'paskol', // paskola, paskolos, paskoline…
  'kredit', // kreditas, kreditai…
  'svetain', // svetaine, svetaines…
  'carit', // caritas, caritai…
  'charit', // charity, charities…
  'psicholog', // psichologas, psichologe, psichologija…
  'psycholog', // psychologist, psychology…
  'muziej', // muziejus, muziejai…
  'museum', // museum, museums…
  'privat', // privatumas, private, privacy…
  'privac', // privacy, privati / privacios-style locals
  'privacy',
  'nuominink', // nuomininkas / -e / -ai…
  'nuomotoj', // nuomotojas / -a…
  'rental',
  'renting',
  'globoj', // globojimas, globoja…
  'globej', // globejas / globeja…
  'guardian',
  'training',
  'trainer',
  'teacher',
  'school',
  'parent',
  'mother',
  'father',
  'lending',
  'lender',
  'vilties', // Vilties linija crisis helpline
  'vlties', // common misspelling in locals (vlties.linija@)
  'helpline',
  'crisisline',
  'kultur', // kultura, kulturos, kulturnamis, sveksnoskultura…
  'culture',
  'cultural',
  'zemaitij', // žemaitija / žemaitijos…
  'aukstaitij', // aukštaitija…
  'dzukij', // dzūkija…
  'suvalkij', // suvalkija…
  'samogit', // samogitia (EN for žemaitija)
  'region', // regionas, regionai, regional…
]

const PERSONAL_REJECT_SHORT_TOKENS = new Set(['ab', 'mb', 'uab', 'vsi', 'ii', 'foto', 'nspn', 'vu', 'bc', 'fc'])

/** Exact locals — keep in sync with EXTRA_ROLE_LOCALS in personal_email_rules.py */
const PERSONAL_REJECT_ROLE_LOCALS = new Set([
  'info', 'support', 'admin', 'help', 'kontaktai', 'klientai', 'partneriai', 'biuras',
  'registracija', 'prisijungimai', 'nariai', 'valdyba', 'pirmininkas', 'pirmininke',
  'pirmininkai', 'office', 'sales', 'service', 'noreply', 'no-reply', 'donotreply',
  'mailer-daemon', 'webmaster', 'postmaster', 'billing', 'payment', 'accounts', 'hr',
  'jobs', 'career', 'careers', 'marketing', 'press', 'media', 'team', 'hello', 'bendra',
  'contact', 'legal', 'rastine', 'finance', 'demo', 'test', 'sample', 'example', 'fake',
  'dummy', 'user', 'username', 'nspn', 'vu',
])

const LT_FOLD: Record<string, string> = {
  ą: 'a', č: 'c', ę: 'e', ė: 'e', į: 'i', š: 's', ų: 'u', ū: 'u', ž: 'z',
}

function foldAscii(text: string): string {
  let out = ''
  for (const ch of text.toLowerCase()) {
    out += LT_FOLD[ch] ?? ch
  }
  // Strip leftover combining marks if any
  return out.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export function isPlaceholderContact(email: string): boolean {
  return new Set(['pavarde', 'vardaspavarde', 'jusuemail', 'jusuelpastas'])
    .has(foldAscii(email.split('@')[0] || '').replace(/[._+-]/g, ''))
}

export function personalRejectReason(email: string): string | null {
  const [localRaw, domainRaw] = email.toLowerCase().split('@')
  if (!localRaw || !domainRaw) return 'invalid'
  const local = foldAscii(localRaw)
  const domain = foldAscii(domainRaw)
  if (isPlaceholderContact(email)) return 'placeholder-contact'
  if (domain === 'mail.gmail.com' || domain.endsWith('.mail.gmail.com')) return 'mail-gmail-alias'
  if (domain === 'takas.lt' || domain === 'zebra.lt') return 'legacy-provider'

  if (PERSONAL_REJECT_ROLE_LOCALS.has(local)) return `role-local:${local}`

  const tokens = local.split(/[._\-+0-9]+/).filter(Boolean)
  for (const tok of tokens) {
    if (PERSONAL_REJECT_SHORT_TOKENS.has(tok) || PERSONAL_REJECT_ROLE_LOCALS.has(tok)) {
      return `keyword:${tok}`
    }
    // Glued club suffixes: kpbc@, xyzfc@
    if (tok.length >= 4 && (tok.endsWith('bc') || tok.endsWith('fc'))) {
      return `keyword:${tok.slice(-2)}`
    }
  }

  const digits = [...local].filter((c) => c >= '0' && c <= '9').length
  if (/^[\d._+-]+$/.test(local) && digits >= 6) return 'numeric-local'
  if (/^\d{6,}([._+-]\d+)*$/.test(local)) return 'numeric-local'
  if (local.length >= 8 && digits / local.length >= 0.55) return 'numeric-heavy'
  if (/^[a-z0-9]{2,8}\+[a-z0-9]{6,}$/i.test(local) || (local.includes('+') && local.length >= 14)) {
    return 'plus-alias-spam'
  }
  if (/[_-]{2,}/.test(local)) return 'junk-separators'
  if (local.startsWith('www.') || local.startsWith('http.') || local.startsWith('https.')
    || local.startsWith('www') || local.startsWith('http')) {
    return 'link-like-local'
  }
  const letters = [...local].filter((c) => /[a-z]/i.test(c))
  if (letters.length >= 10 && digits === 0) {
    const vowels = letters.filter((c) => 'aeiouy'.includes(c)).length
    const vowelRatio = vowels / letters.length
    const rareLatin = letters.filter((c) => 'qxw'.includes(c)).length
    if (vowelRatio < 0.22 || (vowelRatio < 0.28 && rareLatin >= 1)) return 'random-local'
  }
  if (local.length >= 14) {
    if (letters.length) {
      const vowels = letters.filter((c) => 'aeiouy'.includes(c)).length
      if (vowels / letters.length < 0.22 && digits >= 2) return 'random-local'
    }
  }
  if (local.length <= 3 && !/^[a-z]{3}$/.test(local)) return 'short-junk'

  // Token hits first (centras@, jonas.vilnius@, info@…).
  for (const tok of tokens) {
    if (PERSONAL_REJECT_KEYWORDS.includes(tok)) return `keyword:${tok}`
  }
  // Substring for clear org/city/role/fake — NOT for ambiguous short stems
  // that appear inside real names (meras⊂kameras, siena, namas, …).
  const TOKEN_ONLY_STEMS = new Set([
    'namas', 'butas', 'siena', 'langas', 'durys', 'stogas', 'plyta', 'grindys',
    'fasadas', 'turtas', 'pletra', 'elektra', 'betonas', 'meras', 'muge', 'burys', 'vrk',
  ])
  const compact = local.replace(/[._\-+]/g, '')
  for (const kw of PERSONAL_REJECT_KEYWORDS) {
    if (kw.length < 5) continue
    if (TOKEN_ONLY_STEMS.has(kw)) continue
    if (compact.includes(kw) || local.includes(kw)) return `keyword:${kw}`
  }
  for (const stem of PERSONAL_REJECT_STEMS) {
    if (stem.length < 5) continue
    if (compact.includes(stem) || local.includes(stem)) return `keyword:${stem}`
  }
  return null
}
