import { loadPortfolioConfig, riskContributionFromPlaybook } from '../markets-portfolio.js'
import type { DeskDirective, DeskRule, DeskSignal } from './types.js'

export function buildDirective(opts: {
  printerArmed: boolean
  side: 'long' | 'short' | 'flat'
  urgency: DeskSignal['urgency']
  play: string
  symbol?: string
  rules?: DeskRule[]
}): DeskDirective {
  const sym = (opts.symbol || '').toUpperCase()
  const play = opts.play.toUpperCase()
  if (
    opts.urgency === 'avoid' ||
    play.includes('RISK_OFF') ||
    play.includes('DELIST') ||
    play.includes('AVOID') ||
    play.includes('NO_CHASE') ||
    play.includes('CONFLICT')
  ) {
    const dontBuy =
      opts.side !== 'short' &&
      (opts.side === 'long' ||
        play.includes('NO_CHASE') ||
        play.includes('FADE') ||
        play.includes('LONG') ||
        play.includes('CROWDED'))
    if (dontBuy) {
      return {
        verb: "DON'T BUY",
        label: sym ? `DON'T BUY ${sym}` : "DON'T BUY — stay flat",
        tone: 'avoid',
      }
    }
    return {
      verb: 'AVOID',
      label: sym ? `AVOID ${sym} — stay flat` : 'AVOID — stay flat',
      tone: 'avoid',
    }
  }
  if (opts.printerArmed && opts.side === 'long') {
    return { verb: 'BUY', label: sym ? `BUY ${sym}` : 'BUY', tone: 'buy' }
  }
  if (opts.printerArmed && opts.side === 'short') {
    return { verb: 'SELL', label: sym ? `SELL ${sym}` : 'SELL', tone: 'sell' }
  }
  const failed = (opts.rules || []).filter((r) => r.required && !r.pass)
  if (failed.length > 0 || play.includes('RULES_LOCK') || play.includes('STAND_DOWN')) {
    return {
      verb: 'WATCH',
      label:
        failed.length > 0
          ? `WATCH — ${failed.length} law${failed.length === 1 ? '' : 's'} failed`
          : sym
            ? `WATCH · ${sym} — interesting, not armed`
            : 'WATCH — wait for all laws green',
      tone: 'watch',
    }
  }
  return {
    verb: 'WATCH',
    label: sym ? `WATCH · ${sym}` : 'WATCH — no armed ticket',
    tone: 'watch',
  }
}

export function plainSummaryFor(signal: DeskSignal): string {
  const directive = signal.directive?.verb || 'WATCH'
  const primaryPasses = (signal.rules || [])
    .filter(
      (rule) =>
        rule.required &&
        rule.pass &&
        !/confirmation only|lead fills lean/i.test(`${rule.label} ${rule.note}`),
    )
    .map((rule) => rule.label)
    .slice(0, 2)
  const context = (signal.factors || [])
    .filter((factor) => factor.confirmationOnly || factor.tier === 'confirmation')
    .map((factor) => factor.label.replace(/\s*\(confirmation only\)/i, ''))
  const primary =
    primaryPasses.length > 0
      ? primaryPasses.join(' + ').toLowerCase()
      : 'no arm-capable law has passed'
  const contextText =
    context.length > 0
      ? `${context.slice(0, 3).join(', ')} context did not drive this call.`
      : 'No confirmation-only factor drove this call.'
  return `${directive} — ${signal.printerArmed ? `driven by ${primary}` : `not armed: ${primary}`}. ${contextText}`
}

export function blockReasonFor(signal: DeskSignal): string | null {
  if (signal.printerArmed) return null
  const failed = (signal.rules || []).filter((rule) => rule.required && !rule.pass)
  if (failed.length) {
    const first = failed[0]
    return `${first.label}: ${first.note}`
  }
  return signal.action || 'No arm-capable setup is active.'
}

export function ticketRiskLabel(signal: DeskSignal, cfg: ReturnType<typeof loadPortfolioConfig>): string {
  if (signal.playbook.side === 'flat') {
    return cfg.accountEquityUsd == null
      ? 'Risk unit: no active ticket — set account size for $ when a ticket arms.'
      : `Risking $0 of $${Math.round(cfg.accountEquityUsd).toLocaleString()} — ticket is not armed.`
  }
  const riskPct = riskContributionFromPlaybook(signal.playbook)
  if (cfg.accountEquityUsd == null) {
    return `Risk unit: ${riskPct.toFixed(2)}% of equity if this arms — set account size for $.`
  }
  const dollars = Math.round((riskPct / 100) * cfg.accountEquityUsd)
  return `Risking ~$${dollars.toLocaleString()} of $${Math.round(cfg.accountEquityUsd).toLocaleString()} (${riskPct.toFixed(2)}%) if this arms.`
}
