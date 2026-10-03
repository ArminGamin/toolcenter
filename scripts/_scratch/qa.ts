import { kaleduDeterministicQa } from '../../server/ugc-kaledu-final-qa.js'
const lines = [
  'Jautiesi kaip užstrigęs tarp tūkstančių variantų?',
  'Kiekvienais metais ji užsuka į tą patį fotelį.',
  'Didžiulis dovanotojų sąrašas, o laiko vis mažiau.',
  'Šiemet nustebink šiluma ir ramybe su „Auksinis vakaras“ Saulėlydžio lempa.',
  'Kiekvienas rytas turi būti malonus, ne stresas.',
  'Kai žinai, kuo mama džiaugiasi kasdien, dovanos paieška tampa daug paprastesnė.',
  'Rinkis aromaterapijos žvakę „Žvakių vakaras“. Ji kvepia kedru, gintaru ir cinamonu.',
]
for (const body of lines) console.log(body, '=>', JSON.stringify(kaleduDeterministicQa([{ body, role: 'build' }], { theme: '', allowed: [] }).map(f=>f.details)))
