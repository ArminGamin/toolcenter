/**
 * UGC second-pass LLM semantic QA — OFF by default.
 * Writer = Ollama. Judge = TypeScript shipable gates (not another LLM).
 * Opt-in: UGC_QA_ENABLED=true with UGC_QA_PROVIDER=ollama|gemini.
 */

import { geminiGenerateJson, isGeminiConfigured, resolveGeminiModel } from './gemini-client.js'
import { isOllamaConfigured, ollamaGenerateJson } from './ollama-client.js'
import { loadVault } from './cc-services.js'
import {
  loadPostMakerEnv,
  resolveUgcOllamaKeepAliveActive,
  resolveUgcOllamaModel,
  resolveUgcOllamaNumCtxBatch,
  resolveUgcOllamaNumGpu,
} from './ugc-env-bridge.js'

export type UgcQaProvider = 'ollama' | 'gemini' | 'skipped'

export type UgcQaPassMeta = {
  provider: UgcQaProvider
  model: string
  ok: boolean
  error?: string
  rejects?: Array<{ slide: number; code: string; reason: string }>
}

function envRaw(key: string): string {
  const vault = loadVault()
  const pm = loadPostMakerEnv()
  return String(vault[key] || pm[key] || process.env[key] || '').trim()
}

/**
 * Semantic QA is opt-in. Structural safety checks still run for every post;
 * set UGC_QA_ENABLED=true to add the slower, stricter LLM judge.
 */
export function isUgcQaEnabled(): boolean {
  const raw = envRaw('UGC_QA_ENABLED').toLowerCase()
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on'
}

/** off | ollama | gemini — Ollama is used when semantic QA is explicitly enabled. */
export function resolveUgcQaProvider(): 'ollama' | 'gemini' | 'off' {
  if (!isUgcQaEnabled()) return 'off'
  const raw = envRaw('UGC_QA_PROVIDER').toLowerCase()
  if (raw === 'gemini') return 'gemini'
  if (raw === 'ollama') return 'ollama'
  if (raw === 'off' || raw === 'false' || raw === '0' || raw === 'none') return 'off'
  return 'ollama'
}

export const UGC_QA_JUDGE_SYSTEM = `Tu esi griežtas lt-LT UGC SEMANTINIS TEISĖJAS (ne copywriteris).
Tikrink prasmę, ne tik gramatiką. Grąžink TIK JSON su slides + rejects.
Close cta NEKEISK. Body be emoji/URL/CTA. Title tik hook.`

export function assertUgcSemanticQaReady(): void {
  const provider = resolveUgcQaProvider()
  if (provider === 'off') return
  if (provider === 'gemini' && !isGeminiConfigured()) {
    throw new Error(
      'UGC_QA_PROVIDER=gemini but GEMINI_API_KEY is missing — set the key, or switch to UGC_QA_PROVIDER=ollama (default)',
    )
  }
}

export const UGC_QA_GRAMMAR_APPENDIX = `PAPILDOMOS TAISYKLĖS (tiksliai taikyk):
2. LINKSNIAI — ruošti/sukelti/sukurti/pasirinkti + GALININKAS: ✗ sukelia streso → ✓ sukelia stresą | ✗ ruošti maisto → ✓ ruošti maistą
13. Klaustukas tik tikram klausimui — teiginys su „?" DRAUDŽIAMAS: ✗ Netinkamas maistas gali sugadinti popietę? → ✓ …popietę.
20. ✗ dažnoje virtuvėje → ✓ dažnai virtuvėje
21. Suderinta laikų eiga: ✗ sukelia streso ir paskatino → ✓ sukelia stresą ir paskatina`

/** Semantic judge rubric — hard reject codes (not soft polish alone). */
export const UGC_LT_SEMANTIC_QA_PROMPT = `Tu esi griežtas lt-LT UGC SEMANTINIS TEISĖJAS (ne tas pats modelis, kuris rašė).
Perskaityk KIEKVIENĄ skaidrę. Gramatika OK NEPAKANKA — sakinys privalo turėti prasmę.

ATMESTI (rejects[].code) jei matai:
- circular_claim: priežastis = pasekmė tuo pačiu kamienu (✗ „Stresas sukelia stresą"; ✗ „Alkį lemia alkis")
- empty_logic: tuščia / tautologinė mintis be naujos informacijos
- testimonial_register: pirmo asmens sėkmė / atsiliepimas (✗ „Man pavyko…"; ✗ „gavau aiškumo")
- early_brand: „Tavo knyga" / tavoknyga / „naudojant Tavo knyga" NE close skaidrėje
- hook_register_break: hook ne 2-ojo asmens gidas (testimonial / aš / man)

TAISYK:
- Ištaisyk, jei gali, išlaikydamas roles ir skaidrių skaičių.
- Close cta NEKEISK.
- Body be emoji/URL/CTA. Title tik hook.

Grąžink TIK JSON:
{"slides":[...],"rejects":[{"slide":1,"code":"circular_claim","reason":"..."}]}
rejects = [] reiškia PASS.`

export type QaGenerateJsonOpts = {
  signal?: AbortSignal
  temperature?: number
  numPredict?: number
  /** @deprecated ignored — Ollama QA uses its own budget path. */
  consumeOllamaBudget?: () => boolean
}

export async function qaGenerateJson(
  prompt: string,
  opts: QaGenerateJsonOpts = {},
): Promise<{ raw: string; meta: UgcQaPassMeta }> {
  const provider = resolveUgcQaProvider()
  const temperature = opts.temperature ?? 0.2
  const numPredict = opts.numPredict ?? 2048

  if (provider === 'off') {
    return {
      raw: '',
      meta: { provider: 'skipped', model: '', ok: true },
    }
  }

  if (provider === 'gemini') {
    const model = resolveGeminiModel()
    if (!isGeminiConfigured()) {
      return {
        raw: '',
        meta: { provider: 'gemini', model, ok: false, error: 'GEMINI_NOT_CONFIGURED' },
      }
    }
    try {
      const raw = await geminiGenerateJson(prompt, {
        temperature,
        maxOutputTokens: numPredict,
      })
      const text = String(raw ?? '').trim()
      if (!text) throw new Error('Gemini QA returned empty body')
      return { raw: text, meta: { provider: 'gemini', model, ok: true } }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      return { raw: '', meta: { provider: 'gemini', model, ok: false, error } }
    }
  }

  const model = resolveUgcOllamaModel()
  if (!(await isOllamaConfigured())) {
    return {
      raw: '',
      meta: { provider: 'ollama', model, ok: false, error: 'OLLAMA_NOT_REACHABLE' },
    }
  }

  try {
    const raw = await ollamaGenerateJson(prompt, {
      model,
      system: UGC_QA_JUDGE_SYSTEM,
      temperature,
      numPredict,
      numCtx: resolveUgcOllamaNumCtxBatch(),
      numGpu: resolveUgcOllamaNumGpu(),
      keepAlive: resolveUgcOllamaKeepAliveActive(),
      useJsonFormat: true,
      signal: opts.signal,
      timeoutMs: 120_000,
    })
    const text = String(raw ?? '').trim()
    if (!text) throw new Error('Ollama QA returned empty body')
    return { raw: text, meta: { provider: 'ollama', model, ok: true } }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    return { raw: '', meta: { provider: 'ollama', model, ok: false, error } }
  }
}
