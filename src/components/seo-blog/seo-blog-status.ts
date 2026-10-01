import type { SeoBlogStatus } from '../../lib/seoBlog'

export function statusTone(status: SeoBlogStatus) {
  if (status === 'running') return 'text-teal'
  if (status === 'done') return 'text-emerald-300'
  if (status === 'error') return 'text-rose-300'
  return 'text-fog'
}
