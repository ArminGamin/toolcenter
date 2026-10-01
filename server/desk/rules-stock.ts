import { isSourceStale, sourceStaleReason } from '../markets-health.js'
import {
  optionsAgreesWithSide,
  optionsFlowActionable,
  type PublicOptionsFlow,
} from '../markets-options.js'
import type { DeskPlaybook, DeskRule } from './types.js'

export async function fetchYahooAtr(yahoo: string): Promise<{ atr: number; last: number } | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahoo)}?interval=1d&range=1mo`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0 ToolsAI-ControlCenter' },
        signal: AbortSignal.timeout(8000),
      },
    )
    if (!res.ok) return null
    const data = (await res.json()) as {
      chart?: {
        result?: Array<{
          meta?: { regularMarketPrice?: number }
          indicators?: { quote?: Array<{ high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[] }> }
        }>
      }
    }
    const result = data.chart?.result?.[0]
    const q = result?.indicators?.quote?.[0]
    if (!q?.high || !q.low || !q.close) return null
    const trs: number[] = []
    for (let i = 1; i < q.close.length; i++) {
      const high = q.high[i]
      const low = q.low[i]
      const prev = q.close[i - 1]
      if (high == null || low == null || prev == null) continue
      trs.push(Math.max(high - low, Math.abs(high - prev), Math.abs(low - prev)))
    }
    const slice = trs.slice(-14)
    if (!slice.length) return null
    const atr = slice.reduce((a, b) => a + b, 0) / slice.length
    const last = result?.meta?.regularMarketPrice ?? q.close[q.close.length - 1]
    if (typeof last !== 'number' || !Number.isFinite(last)) return null
    return { atr, last }
  } catch {
    return null
  }
}

export function evaluateStockStrictRules(input: {
  side: 'long' | 'short' | 'flat'
  play: string
  pct: number | null
  edgeScore: number
  playbook: DeskPlaybook
  hasInsiderBuy: boolean
  hasInsiderSell: boolean
  hasRiskFiling: boolean
  options: PublicOptionsFlow | null
  /** Form 4 age in days from transaction date; null if unknown */
  form4AgeDays: number | null
  placeByExpired: boolean
}): { rules: DeskRule[]; armed: boolean } {
  const {
    side,
    play,
    pct,
    edgeScore,
    playbook,
    hasInsiderBuy,
    hasInsiderSell,
    hasRiskFiling,
    options,
    form4AgeDays,
    placeByExpired,
  } = input

  if (side === 'flat' || play === 'STAND_DOWN' || play === 'RISK_OFF' || play === 'RULES_LOCK') {
    return {
      rules: [
        {
          id: 'flat',
          label: 'No directional equity ticket',
          pass: true,
          required: true,
          note: 'Printer locked — cash',
        },
      ],
      armed: false,
    }
  }

  const isOptionsFlow = play === 'OPTIONS_FLOW_LONG' || play === 'OPTIONS_FLOW_SHORT'
  const isMomentum = play === 'MOMENTUM_LONG' || play === 'MOMENTUM_SHORT'
  // BEHAVIOR CHANGE: INSIDER_BUY removed as independent arm path (confirmation only)
  const allowedPlay = isOptionsFlow || isMomentum
  const tapeFloor = isOptionsFlow ? -1.2 : 2.5
  const tapeOk =
    pct != null &&
    (side === 'long' ? pct >= tapeFloor : pct <= (isOptionsFlow ? 1.2 : -2.5))
  const noRisk = !hasRiskFiling
  const noSellAgainst = side !== 'long' || !hasInsiderSell
  const optionsThesisOk =
    !isOptionsFlow ||
    (optionsFlowActionable(options) && optionsAgreesWithSide(options, side))
  const optionsAgreeOk =
    !isMomentum ||
    options == null ||
    options.lean === 'n/a' ||
    options.lean === 'balanced' ||
    optionsAgreesWithSide(options, side)

  // Form 4 age: >3 calendar days from transaction → reject as fresh confirmation
  const form4Fresh =
    !hasInsiderBuy || form4AgeDays == null || form4AgeDays <= 3

  const optionsFresh = !isOptionsFlow || !isSourceStale('yahoo_options')
  const optionsFreshNote = sourceStaleReason('yahoo_options') || 'Yahoo options fresh'

  const rules: DeskRule[] = [
    {
      id: 'play',
      label: 'Allowed stock play (options/momentum only)',
      pass: allowedPlay,
      required: true,
      note: play === 'INSIDER_BUY' ? 'INSIDER_BUY cannot arm alone' : play,
    },
    {
      id: 'tape',
      label: 'Tape threshold for play',
      pass: tapeOk,
      required: true,
      note: pct == null ? 'n/a — fail closed' : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`,
    },
    {
      id: 'options-flow',
      label: 'Public options lean (if OPTIONS_FLOW)',
      pass: optionsThesisOk,
      required: true,
      note: options?.note || 'no options data — fail closed for OPTIONS_FLOW',
    },
    {
      id: 'options-fresh',
      label: 'Yahoo options source fresh',
      pass: optionsFresh,
      required: isOptionsFlow,
      note: optionsFresh
        ? 'fresh'
        : `OPTIONS_FLOW law blocked: ${optionsFreshNote}`,
    },
    {
      id: 'options-agree',
      label: 'Options not fighting momentum',
      pass: optionsAgreeOk,
      required: isMomentum && options != null && options.lean !== 'n/a' && options.lean !== 'balanced',
      note:
        options == null || options.lean === 'n/a'
          ? 'options n/a'
          : optionsAgreesWithSide(options, side)
            ? `options agree (${options.lean})`
            : `options oppose (${options.lean})`,
    },
    {
      id: 'form4-age',
      label: 'Form 4 confirmation age ≤3 days (if used)',
      pass: form4Fresh,
      required: hasInsiderBuy && form4AgeDays != null,
      note:
        form4AgeDays == null
          ? hasInsiderBuy
            ? 'Form 4 age unknown — fail closed when buy cited'
            : 'n/a'
          : `Form 4 age ${form4AgeDays}d`,
    },
    {
      id: 'no-sell',
      label: 'No opposing Form 4 sell cluster',
      pass: noSellAgainst,
      required: true,
      note: hasInsiderSell ? 'sell Form 4 present' : 'clear',
    },
    {
      id: 'risk-filing',
      label: 'No bankruptcy / halt / probe filing',
      pass: noRisk,
      required: true,
      note: hasRiskFiling ? 'risk language' : 'clear',
    },
    {
      id: 'edge',
      // BEHAVIOR CHANGE: dropped heuristic odds≥55 from arm gate
      label: 'Edge ≥ 65',
      pass: edgeScore >= 65,
      required: true,
      note: `edge ${edgeScore}`,
    },
    {
      id: 'rr',
      label: 'R:R ≥ 1.5',
      pass: (playbook.rr ?? 0) >= 1.5,
      required: true,
      note: playbook.rr != null ? `${playbook.rr.toFixed(2)}x` : 'n/a — fail closed',
    },
    {
      id: 'stop',
      label: 'Stop risk ≤ 2% of price',
      pass: playbook.riskPct != null && playbook.riskPct <= 2,
      required: true,
      note: playbook.riskPct != null ? `${playbook.riskPct.toFixed(2)}%` : 'n/a — fail closed',
    },
    {
      id: 'place-by',
      label: 'Place-by clock not expired',
      pass: !placeByExpired,
      required: true,
      note: placeByExpired ? 'clock expired' : 'clock live',
    },
  ]

  return { rules, armed: rules.every((r) => !r.required || r.pass) }
}

/** Match SEC/news titles to equity via ticker, company label, or tick: tags */
export function newsMatchesEquity(
  n: { title: string; source: string; categories?: string[] },
  sym: string,
  label: string,
): boolean {
  const title = n.title.toUpperCase()
  const symU = sym.toUpperCase()
  const cats = (n.categories || []).map((c) => c.toUpperCase())
  if (cats.some((c) => c === `TICK:${symU}` || c === symU)) return true
  if (
    title.includes(` ${symU} `) ||
    title.includes(`(${symU})`) ||
    title.startsWith(`${symU} `) ||
    title.endsWith(` ${symU}`) ||
    title.includes(`· ${symU}`) ||
    title.includes(`- ${symU}`)
  ) {
    return true
  }
  const company = label
    .toUpperCase()
    .replace(/\b(INC|CORP|LTD|LLC|CO|CLASS [A-Z]|ORDINARY SHARES)\b\.?/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (company.length >= 4 && title.includes(company)) return true
  // NVIDIA CORP style in Form 4 titles
  const first = company.split(' ')[0]
  if (first && first.length >= 4 && title.includes(first) && (cats.includes('FORM4') || n.source.toLowerCase().includes('form 4') || n.source.toLowerCase().includes('sec'))) {
    return true
  }
  return false
}

function isForm4Item(n: { title: string; source: string; categories?: string[] }): boolean {
  const t = `${n.title} ${n.source} ${(n.categories || []).join(' ')}`.toLowerCase()
  return t.includes('form 4') || t.includes('form4') || (n.categories || []).includes('Form4')
}

export function isForm4Buy(n: { title: string; source: string; categories?: string[] }): boolean {
  if (!isForm4Item(n)) return false
  const cats = n.categories || []
  if (cats.includes('form4-sell')) return false
  if (cats.includes('form4-buy')) return true
  const t = n.title.toLowerCase()
  if (t.includes('sale') || t.includes('sell') || t.includes('disposed') || t.includes('disposition')) {
    return false
  }
  return (
    t.includes('purchase') ||
    t.includes('open-market purchase') ||
    (t.includes('buy') && !t.includes('buyback'))
  )
}

export function isForm4Sell(n: { title: string; source: string; categories?: string[] }): boolean {
  if (!isForm4Item(n)) return false
  const cats = n.categories || []
  if (cats.includes('form4-buy')) return false
  if (cats.includes('form4-sell')) return true
  const t = n.title.toLowerCase()
  return (
    t.includes('sale') ||
    t.includes('open-market sale') ||
    t.includes('sell') ||
    t.includes('disposed') ||
    t.includes('disposition')
  )
}
