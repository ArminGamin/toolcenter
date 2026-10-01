import { setTimeout as pause } from 'node:timers/promises'

export async function waitForGiftDeployment(siteUrl: string, urls: string[], signal?: AbortSignal, timeoutMs = 180_000, intervalMs = 5_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    signal?.throwIfAborted()
    try {
      const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000)
      const pages = await Promise.all(urls.map(async (url) => (await fetch(url, { signal: requestSignal, cache: 'no-store' })).ok))
      const sitemap = await fetch(`${siteUrl}/sitemap.xml`, { signal: requestSignal, cache: 'no-store' })
      const xml = sitemap.ok ? await sitemap.text() : ''
      if (pages.every(Boolean) && urls.filter((url) => url !== `${siteUrl}/straipsniai`).every((url) => xml.includes(`<loc>${url}</loc>`))) return
    } catch { signal?.throwIfAborted() }
    await pause(Math.min(intervalMs, Math.max(0, deadline - Date.now())), undefined, { signal })
  }
  throw new Error('Vercel deployment is not live yet. Articles are pushed; search notification can be retried after deployment.')
}
