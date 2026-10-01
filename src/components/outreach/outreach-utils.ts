export type StageTab = 'find' | 'leads' | 'clean' | 'approve' | 'send'

export const STAGES: StageTab[] = ['find', 'leads', 'clean', 'approve', 'send']

export function statusLabel(status: string) {
  const map: Record<string, string> = {
    idle: 'Idle',
    running: 'Running',
    waiting: 'Waiting for you',
    sending: 'Sending',
    paused: 'Paused',
    done: 'Done',
    error: 'Error',
  }
  return map[status] || status
}

export function statusTone(status: string) {
  if (status === 'sending' || status === 'running') return 'text-phosphor'
  if (status === 'waiting' || status === 'paused') return 'text-brass'
  if (status === 'error') return 'text-ember'
  if (status === 'done') return 'text-phosphor'
  return 'text-mist'
}
