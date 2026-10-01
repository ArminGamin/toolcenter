export type LogLevel = 'info' | 'noise' | 'warn' | 'critical'

export type LogEntry = {
  text: string
  level: LogLevel
  toolId: string
  at: string
}

/** Line color by severity. */
export function logLevelClass(level: LogLevel | string | undefined): string {
  switch (level) {
    case 'critical':
      return 'text-ember'
    case 'warn':
      return 'text-brass'
    case 'noise':
      return 'text-fog'
    default:
      return 'text-mist'
  }
}

export function logLevelLabel(level: LogLevel): string {
  switch (level) {
    case 'critical':
      return 'critical'
    case 'warn':
      return 'warn'
    case 'noise':
      return 'noise'
    default:
      return 'info'
  }
}
