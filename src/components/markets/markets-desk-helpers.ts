import type { DeskDirective, DeskSignal, NewsItem } from '../../lib/markets'

export type NewsKindFilter = 'all' | 'insider' | 'sec' | 'fed' | 'exchange' | 'rss'

export function newsKindOf(item: NewsItem): NewsKindFilter | 'other' {
  const cats = item.categories || []
  const blob = `${item.title} ${item.source} ${cats.join(' ')}`.toLowerCase()
  if (
    cats.includes('Form4') ||
    cats.includes('verified-insider') ||
    blob.includes('form 4') ||
    blob.includes('form4') ||
    (blob.includes('insider') && blob.includes('sec'))
  ) {
    return 'insider'
  }
  if (blob.includes('sec') || blob.includes('8-k') || blob.includes('edgar')) return 'sec'
  if (blob.includes('fed') || blob.includes('federal reserve') || blob.includes('fomc')) return 'fed'
  if (
    blob.includes('binance') ||
    blob.includes('coinbase') ||
    blob.includes('okx') ||
    blob.includes('bybit') ||
    blob.includes('kraken') ||
    blob.includes('listing') ||
    blob.includes('delist')
  ) {
    return 'exchange'
  }
  if (
    blob.includes('the block') ||
    blob.includes('cointelegraph') ||
    blob.includes('decrypt') ||
    blob.includes('bitcoin magazine') ||
    blob.includes('cryptocompare')
  ) {
    return 'rss'
  }
  return 'other'
}

export function isInsiderNews(item: NewsItem): boolean {
  return newsKindOf(item) === 'insider'
}

const STAND_DOWN_PLAYS = new Set(['STAND_DOWN', 'RULES_LOCK'])

/** Simple mode: actionable tickets only - armed, hard risk, or top watch candidates. */
export function deskSignalsForView(
  signals: DeskSignal[],
  view: 'simple' | 'advanced',
): DeskSignal[] {
  if (view === 'advanced') return signals

  const deduped = dedupeDeskSignals(signals)
  const actionable = deduped.filter((s) => isActionableDeskSignal(s))

  if (actionable.length > 0) return actionable

  // Printer fully locked: one summary line beats six identical stand-down cards.
  if (deduped.length > 0) {
    return [pickBestIdleSummary(deduped)]
  }
  return deduped
}

function dedupeDeskSignals(signals: DeskSignal[]): DeskSignal[] {
  const seen = new Set<string>()
  return signals.filter((s) => {
    const dir = resolveDirective(s)
    const key = [
      dir.verb,
      dir.label,
      s.blockReason ?? '',
      s.symbol?.toUpperCase() ?? '',
    ].join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function isActionableDeskSignal(s: DeskSignal): boolean {
  if (s.printerArmed) return true
  const play = (s.play || '').toUpperCase()
  if (play === 'RISK_OFF' || play === 'DELIST') return true
  if (s.urgency === 'avoid' && play !== 'STAND_DOWN' && play !== 'RULES_LOCK') return true
  if (s.urgency === 'now') return true
  if (STAND_DOWN_PLAYS.has(play)) return false
  if (play === 'CONFLICT' || play === 'NO_CHASE' || play === 'FADE_CROWD') return true
  return s.urgency === 'watch' && typeof s.edgeScore === 'number' && s.edgeScore >= 62
}

function pickBestIdleSummary(signals: DeskSignal[]): DeskSignal {
  const ranked = [...signals].sort((a, b) => {
    const armed = Number(b.printerArmed) - Number(a.printerArmed)
    if (armed !== 0) return armed
    const edge = (b.edgeScore ?? 0) - (a.edgeScore ?? 0)
    if (edge !== 0) return edge
    return (a.rank ?? 999) - (b.rank ?? 999)
  })
  return ranked[0]
}

export function resolveDirective(s: DeskSignal): DeskDirective {
  if (s.directive) return s.directive
  const sym = (s.symbol || '').toUpperCase()
  const play = (s.play || '').toUpperCase()
  if (s.urgency === 'avoid' || play.includes('RISK') || play.includes('NO_CHASE')) {
    return {
      verb: "DON'T BUY",
      label: sym ? `DON'T BUY ${sym}` : "DON'T BUY - stay flat",
      tone: 'avoid',
    }
  }
  if (s.printerArmed && s.playbook?.side === 'long') {
    return { verb: 'BUY', label: sym ? `BUY ${sym}` : 'BUY', tone: 'buy' }
  }
  if (s.printerArmed && s.playbook?.side === 'short') {
    return { verb: 'SELL', label: sym ? `SELL ${sym}` : 'SELL', tone: 'sell' }
  }
  const failed = (s.rules || []).filter((r) => r.required && !r.pass).length
  return {
    verb: 'WATCH',
    label:
      failed > 0
        ? `WATCH - ${failed} law${failed === 1 ? '' : 's'} failed`
        : 'WATCH - wait for all laws green',
    tone: 'watch',
  }
}

export function directiveToneClass(tone: DeskDirective['tone']): string {
  if (tone === 'buy') return 'border-phosphor/50 bg-phosphor/15 text-phosphor'
  if (tone === 'sell') return 'border-ember/50 bg-ember/15 text-ember'
  if (tone === 'avoid') return 'border-ember/45 bg-ember/12 text-ember'
  // WATCH = brass/amber (compact, not a gold wall)
  return 'border-brass/40 bg-brass/10 text-brass'
}
