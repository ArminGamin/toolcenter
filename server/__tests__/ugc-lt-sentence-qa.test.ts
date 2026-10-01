import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { repairNativeSemantic } from '../ugc-kaledu-final-qa.js'
import {
  applySentenceIntentPunctuation,
  classifySentenceIntent,
  findLithuanianCoherenceIssues,
  productContextGap,
  semanticRepairEscalates,
  type LtCopyReason,
} from '../ugc-lt-sentence-qa.js'

type CorpusRow = {
  input: string
  reason: LtCopyReason
  expect: 'fail' | 'pass'
  valid: string[]
}

const corpusDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'lt-copy-corpus')

describe('lithuanian sentence coherence corpus', () => {
  const files = readdirSync(corpusDir).filter((name) => name.endsWith('.json'))
  for (const file of files) {
    const rows = JSON.parse(readFileSync(path.join(corpusDir, file), 'utf8')) as CorpusRow[]
    for (const row of rows) {
      it(`${file}: ${row.input}`, () => {
        const issues = findLithuanianCoherenceIssues(row.input).filter((issue) => issue.repairType === 'full_sentence' || issue.reason === 'missing_question_mark')
        if (row.expect === 'pass') {
          expect(issues.filter((issue) => issue.reason === row.reason)).toEqual([])
          const repaired = repairNativeSemantic(row.input).text
          expect(repaired === row.input || row.valid.includes(repaired)).toBe(true)
          return
        }
        expect(issues.map((issue) => issue.reason)).toContain(row.reason)
        const repaired = repairNativeSemantic(row.input)
        expect(row.valid).toContain(repaired.text)
        expect(findLithuanianCoherenceIssues(repaired.text).filter((issue) => issue.reason === row.reason)).toEqual([])
      })
    }
  }
})

describe('sentence intent', () => {
  it('does not treat Žinai, kad as a direct question', () => {
    expect(classifySentenceIntent('Žinai, kad praktiška dovana dažnai praverčia.').intent).toBe('statement')
  })

  it('asks the reader when the clause is a real question', () => {
    expect(applySentenceIntentPunctuation('Daug laiko praleidi kelyje').text).toBe('Daug laiko praleidi kelyje?')
    expect(applySentenceIntentPunctuation('Dar neišsirinkai dovanos').text).toBe('Dar neišsirinkai dovanos?')
    expect(applySentenceIntentPunctuation('Praktiška dovana gali praversti kiekvieną dieną').text).toBe(
      'Praktiška dovana gali praversti kiekvieną dieną.',
    )
  })

  it('flags a thermos that appears with no setup', () => {
    expect(productContextGap('Termosas ilgai išlaiko šilumą.', 'Kalėdos būna įtemptos.')).toBe(true)
    expect(productContextGap('Termosas padeda gėrimą ilgiau išlaikyti karštą.', 'Kava greitai atšąla kelyje.')).toBe(false)
  })

  it('escalates after too many structural repairs', () => {
    expect(semanticRepairEscalates(3, 0)).toBe(true)
    expect(semanticRepairEscalates(1, 2)).toBe(true)
    expect(semanticRepairEscalates(1, 0)).toBe(false)
  })
})
