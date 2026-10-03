import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { UGC_OLLAMA_SYSTEM_PROMPT } from '../server/ugc-lt-normalize.ts'

const dir = dirname(fileURLToPath(import.meta.url))
const body = `# ugc-lt-gpu — SYSTEM = full literacy rules for the slide-writing AI.
# Keep in sync with UGC_OLLAMA_SYSTEM_PROMPT in server/ugc-lt-normalize.ts
# Rebuild: ollama create ugc-lt-gpu -f ollama/Modelfile.ugc-lt-gpu
FROM jobautomation/OpenEuroLLM-Lithuanian:latest

SYSTEM """
${UGC_OLLAMA_SYSTEM_PROMPT}
"""

PARAMETER num_gpu 44
PARAMETER num_ctx 4096
PARAMETER temperature 0.4
PARAMETER top_p 0.85
PARAMETER repeat_penalty 1.2
`
writeFileSync(join(dir, 'Modelfile.ugc-lt-gpu'), body, 'utf8')
console.log('synced Modelfile.ugc-lt-gpu', body.length, 'chars')
