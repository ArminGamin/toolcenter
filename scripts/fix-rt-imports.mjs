import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const files = [
  'chain.ts',
  'find-process.ts',
  'find-run.ts',
  'run-orchestrator.ts',
  'send-run.ts',
  '../outreach.ts',
]

const rtFns = [
  'syncOutreachRuntime',
  'liveFindEpoch',
  'liveFindChild',
  'liveSendAbort',
  'liveSendEpoch',
  'liveSendPaused',
  'childProcessRunning',
  'releaseFindSpawnLock',
  'recoverStaleFindSpawnLock',
  'publishSendControls',
  'recoverZombieSendLoop',
  'repairActiveSendProfileIfStale',
  'pullOutreachRuntime',
  'noteLiveLead',
  'reviveFindIfLive',
  'filterPersonalRejectEmails',
  'persistRun',
  'touchRun',
  'resetSessionToIdle',
  'idleRun',
  'gOutreach',
]

for (const file of files) {
  const p = path.join(root, 'server', 'outreach', file)
  let s = fs.readFileSync(p, 'utf8')
  s = s.replace(/import \* as rt from '\.\/runtime\.js'\n?/g, '')
  s = s.replace(/import \* as rt from '\.\/outreach\/runtime\.js'\n?/g, '')
  if (!s.includes('import { rt')) {
    s = s.replace(/^(import .+\n)+/m, (m) => `${m}import { rt } from './runtime.js'\n`)
  }
  if (file === '../outreach.ts') {
    s = s.replace(/import \{\s*initOutreachSession,\s*\} from '\.\/outreach\/runtime\.js'\n/, '')
    s = s.replace(/import \{ rt \} from '\.\/runtime\.js'\n/, '')
    s = s.replace(
      /import \{\s*initOutreachSession,\s*\} from '\.\/outreach\/runtime\.js'\nimport \* as rt from '\.\/outreach\/runtime\.js'\n/,
      "import { initOutreachSession, rt } from './outreach/runtime.js'\n",
    )
    if (!s.includes("import { initOutreachSession, rt }")) {
      s = s.replace(
        "import {\n  initOutreachSession,\n} from './outreach/runtime.js'\nimport * as rt from './outreach/runtime.js'\n",
        "import { initOutreachSession, rt } from './outreach/runtime.js'\n",
      )
    }
  }
  for (const fn of rtFns) {
    s = s.replace(new RegExp(`rt\\.${fn}\\(`, 'g'), `${fn}(`)
    s = s.replace(new RegExp(`rt\\.${fn}\\b`, 'g'), fn)
  }
  // CHAIN_MAX_EMPTY_FILLS is not on rt object as mutable - import from runtime
  s = s.replace(/rt\.CHAIN_MAX_EMPTY_FILLS/g, 'CHAIN_MAX_EMPTY_FILLS')
  if (file !== '../outreach.ts' && !s.includes('CHAIN_MAX_EMPTY_FILLS') && s.includes('CHAIN_MAX_EMPTY_FILLS')) {
    // chain needs import
  }
  fs.writeFileSync(p, s)
  console.log('fixed', file)
}

// chain.ts - add runtime fn imports
const chainPath = path.join(root, 'server', 'outreach', 'chain.ts')
let chain = fs.readFileSync(chainPath, 'utf8')
if (!chain.includes('CHAIN_MAX_EMPTY_FILLS')) {
  chain = chain.replace(
    "import { rt } from './runtime.js'\n",
    "import { rt, CHAIN_MAX_EMPTY_FILLS, syncOutreachRuntime, persistRun, idleRun, touchRun } from './runtime.js'\n",
  )
} else {
  chain = chain.replace(
    "import { rt } from './runtime.js'\n",
    "import { rt, syncOutreachRuntime, persistRun, idleRun, touchRun } from './runtime.js'\n",
  )
}
fs.writeFileSync(chainPath, chain)

// outreach.ts - add function imports
const outreachPath = path.join(root, 'server', 'outreach.ts')
let outreach = fs.readFileSync(outreachPath, 'utf8')
outreach = outreach.replace(
  "import { initOutreachSession, rt } from './outreach/runtime.js'\n",
  "import { initOutreachSession, rt, pullOutreachRuntime, touchRun, resetSessionToIdle, childProcessRunning, liveFindChild } from './outreach/runtime.js'\n",
)
fs.writeFileSync(outreachPath, outreach)

console.log('done imports')
