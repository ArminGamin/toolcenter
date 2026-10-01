import type { OutreachRun, OutreachSettings } from './types.js'

type StartRunBody = {
  settings?: Partial<OutreachSettings>
  pasteList?: string
  chainAdvance?: boolean
  resumeInterrupted?: boolean
}

type StartRunResult = Promise<{ ok: boolean; message: string; run: OutreachRun }>
type SendResult = Promise<{ ok: boolean; message: string; run: OutreachRun }>
type ProfileResult = { ok: boolean; message: string; settings?: OutreachSettings }

let startOutreachRunImpl: ((body?: StartRunBody) => StartRunResult) | null = null
let startOutreachSendImpl: (() => SendResult) | null = null
let loadOutreachSendProfileImpl: ((name: string) => ProfileResult) | null = null

export function registerOutreachDelegates(impl: {
  startOutreachRun: (body?: StartRunBody) => StartRunResult
  startOutreachSend: () => SendResult
  loadOutreachSendProfile: (name: string) => ProfileResult
}) {
  startOutreachRunImpl = impl.startOutreachRun
  startOutreachSendImpl = impl.startOutreachSend
  loadOutreachSendProfileImpl = impl.loadOutreachSendProfile
}

export function delegateStartOutreachRun(body?: StartRunBody) {
  if (!startOutreachRunImpl) throw new Error('Outreach delegates not registered')
  return startOutreachRunImpl(body)
}

export function delegateStartOutreachSend() {
  if (!startOutreachSendImpl) throw new Error('Outreach delegates not registered')
  return startOutreachSendImpl()
}

export function delegateLoadOutreachSendProfile(name: string) {
  if (!loadOutreachSendProfileImpl) throw new Error('Outreach delegates not registered')
  return loadOutreachSendProfileImpl(name)
}
