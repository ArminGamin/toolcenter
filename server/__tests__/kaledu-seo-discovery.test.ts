import { afterEach, describe, expect, it, vi } from 'vitest'
import { waitForGiftDeployment } from '../kaledu-seo-discovery.js'

afterEach(() => vi.restoreAllMocks())
describe('Kalėdų Kampelis deployment readiness', () => {
  const site = 'https://www.kaledukampelis.com'
  const article = `${site}/straipsniai/dovanos-kolegai`
  it('waits through a 404 until both the article and sitemap are deployed', async () => {
    let checks = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url) === article) return new Response('page', { status: ++checks === 1 ? 404 : 200 })
      return new Response(`<urlset><url><loc>${article}</loc></url></urlset>`)
    })
    await expect(waitForGiftDeployment(site, [`${site}/straipsniai`, article], undefined, 500, 1)).resolves.toBeUndefined()
    expect(checks).toBe(2)
  })
  it('does not treat a live page with an old sitemap as deployment success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<urlset></urlset>'))
    await expect(waitForGiftDeployment(site, [article], undefined, 20, 1)).rejects.toThrow('deployment is not live yet')
  })
  it('stops readiness requests when the run is aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetch = vi.spyOn(globalThis, 'fetch')
    await expect(waitForGiftDeployment(site, [article], controller.signal)).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })
})
