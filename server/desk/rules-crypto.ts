import { isSourceStale, sourceStaleReason } from '../markets-health.js'
import type { LeadAccount, VenueBias } from '../markets-venues.js'
import type { DeskPlaybook, DeskRule } from './types.js'
import { leadLeanPct } from './helpers.js'

export function evaluateStrictRules(input: {
  side: 'long' | 'short' | 'flat'
  play: string
  biases: VenueBias[]
  pct: number | null
  accounts: LeadAccount[]
  symbol: string
  edgeScore: number
  playbook: DeskPlaybook
  hasDelistRisk: boolean
  placeByExpired: boolean
}): { rules: DeskRule[]; armed: boolean } {
  const { side, play, biases, pct, accounts, symbol, edgeScore, playbook, hasDelistRisk, placeByExpired } =
    input

  if (side === 'flat' || play === 'STAND_DOWN' || play === 'CONFLICT' || play === 'RISK_OFF' || play === 'NO_CHASE') {
    return {
      rules: [
        {
          id: 'flat',
          label: 'No directional ticket',
          pass: true,
          required: true,
          note: 'Printer locked — cash is the position',
        },
      ],
      armed: false,
    }
  }

  // Fades are never “armed” under strict laws
  if (play === 'FADE_CROWD' || play === 'SQUEEZE_WATCH') {
    return {
      rules: [
        {
          id: 'no-fade',
          label: 'No fade / squeeze as funded now',
          pass: false,
          required: true,
          note: 'Strict mode bans mean-revert guesses as money prints',
        },
      ],
      armed: false,
    }
  }

  const addLong = biases.filter((b) => b.lean === 'add_long')
  const addShort = biases.filter((b) => b.lean === 'add_short')
  const crowdedLong = biases.filter((b) => b.lean === 'crowded_long')
  const crowdedShort = biases.filter((b) => b.lean === 'crowded_short')
  const bn = biases.find((b) => b.venue === 'binance')
  const taker = bn?.takerBuySell
  const funding = bn?.funding
  const adds = side === 'long' ? addLong : addShort
  const oppose = side === 'long' ? addShort : addLong
  const hasTop = adds.some((b) => b.venue === 'binance' || b.venue === 'okx')
  const leads = leadLeanPct(accounts, symbol, side)

  // Fail closed: missing taker cannot pass
  const takerOk =
    taker != null && Number.isFinite(taker) && (side === 'long' ? taker >= 1.15 : taker <= 0.85)
  const tapeOk =
    pct != null && (side === 'long' ? pct >= 1.2 : pct <= -1.2)
  const fundingOk =
    funding != null &&
    (side === 'long' ? funding <= 0.00015 : funding >= 0.00025)
  const confirmOk = takerOk && (tapeOk || fundingOk)

  const notCrowdedAgainst =
    side === 'long' ? crowdedLong.length < 2 : crowdedShort.length < 2

  // Confirmation only: no fills → waived; fills present → must agree (cannot arm alone — flow-play gates primary)
  const leadsOk = leads.n === 0 || leads.pct >= 55

  const venueFresh = !isSourceStale('multi_venue') && !isSourceStale('binance_flow')
  const venueFreshNote =
    sourceStaleReason('multi_venue') ||
    sourceStaleReason('binance_flow') ||
    'venue sources fresh'

  const rules: DeskRule[] = [
    {
      id: 'flow-play',
      label: 'Only FLOW_LONG / FLOW_SHORT',
      pass: play === 'FLOW_LONG' || play === 'FLOW_SHORT',
      required: true,
      note: play,
    },
    {
      id: 'multi-venue',
      label: '≥2 venues adding same way (+ top cohort)',
      pass: adds.length >= 2 && hasTop,
      required: true,
      note: `${adds.length} adds · top=${hasTop ? 'yes' : 'no'}`,
    },
    {
      id: 'no-oppose',
      label: 'Zero opposing venue adds',
      pass: oppose.length === 0,
      required: true,
      note: oppose.length ? oppose.map((b) => b.venue).join(',') : 'clean',
    },
    {
      id: 'taker',
      label: 'Taker confirms aggression',
      pass: takerOk,
      required: true,
      note: taker == null ? 'taker n/a — fail closed' : `buy/sell ${taker.toFixed(3)}`,
    },
    {
      id: 'confirm',
      label: 'Tape OR funding confirms with taker',
      pass: confirmOk,
      required: true,
      note: `tape ${pct ?? 'n/a'}% · fund ${funding != null ? (funding * 100).toFixed(4) + '%' : 'n/a'}`,
    },
    {
      id: 'edge',
      // BEHAVIOR CHANGE: dropped heuristic odds≥55 from arm gate — edge score only
      label: 'Edge ≥ 68',
      pass: edgeScore >= 68,
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
      id: 'stop-risk',
      label: 'Stop risk ≤ 1.25% of price',
      pass: playbook.riskPct != null && playbook.riskPct <= 1.25,
      required: true,
      note: playbook.riskPct != null ? `${playbook.riskPct.toFixed(2)}%` : 'n/a — fail closed',
    },
    {
      id: 'crowd',
      label: 'Not trading into crowding against you',
      pass: notCrowdedAgainst,
      required: true,
      note:
        side === 'long'
          ? `crowdedLong=${crowdedLong.length}`
          : `crowdedShort=${crowdedShort.length}`,
    },
    {
      id: 'leads',
      label: 'Lead fills lean with trade (confirmation only)',
      pass: leadsOk,
      required: true,
      note: leads.note,
    },
    {
      id: 'data-fresh',
      label: 'Venue flow sources fresh',
      pass: venueFresh,
      required: true,
      note: venueFresh
        ? 'fresh'
        : `FLOW law blocked: ${venueFreshNote}`,
    },
    {
      id: 'place-by',
      label: 'Place-by clock not expired',
      pass: !placeByExpired,
      required: true,
      note: placeByExpired ? 'clock expired — re-validate before entry' : 'clock live',
    },
    {
      id: 'delist',
      label: 'No delist/removal risk live',
      pass: !hasDelistRisk,
      required: true,
      note: hasDelistRisk ? 'delist on board' : 'clear',
    },
    {
      id: 'size',
      label: 'Hard stop · ≤0.75% equity · scale T1',
      pass: playbook.side !== 'flat' && Boolean(playbook.stop),
      required: true,
      note: playbook.sizeHint,
    },
  ]

  const armed = rules.filter((r) => r.required).every((r) => r.pass)
  return { rules, armed }
}
