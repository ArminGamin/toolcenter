import { syncUgcModelfile, resolveDefaultModelfilePath, writeUgcModelDigestFile } from '../server/ugc-modelfile-sync.js'

const target = resolveDefaultModelfilePath()
syncUgcModelfile(target)
const digest = writeUgcModelDigestFile(target)
console.log(`Synced ${target} from UGC_OLLAMA_SYSTEM_PROMPT`)
console.log(`Wrote digest systemHash=${digest.systemHash.slice(0, 12)}…`)
console.log('Next: ollama create ugc-lt-gpu -f ollama/Modelfile.ugc-lt-gpu && restart Control Center')
