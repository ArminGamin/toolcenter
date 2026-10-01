import type { Connect } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import { publishUgcSlideshowToDiscord } from '../discord-publisher.js'
import { readJsonBody, sendJson } from '../middleware/http.js'
import {
  loadUgcDiscordSettings,
  resolveDiscordCredentials,
  saveUgcDiscordSettings,
} from '../ugc-discord-settings.js'
import { serializeError } from '../ugc-error-detail.js'
import {
  generateLtDiscordDescription,
  generateUgcSlideCopy,
  generateUgcSlideshowCopy,
  validateUgcSlideshowQuality,
  llmErrorMessage,
  releaseUgcOllamaAfterBatch,
  warmUgcOllamaModel,
} from '../ugc-slides.js'
import { saveUgcBatchToDisk } from '../ugc-batch-export.js'
import {
  consumeUgcImage,
  getUgcImagePoolStatus,
  imageContentType,
  pickBatchUgcImages,
  resolveNewImagePath,
} from '../ugc-image-pool.js'
import {
  getUgcThemePoolStatus,
  pickBatchUgcThemes,
  resetUsedUgcThemes,
} from '../ugc-theme-pool.js'
import { getUgcOllamaStatus } from '../ugc-ollama-status.js'
import {
  attachUgcAuditExport,
  getUgcAuditStatus,
  logUgcAuditClientEvent,
  resetUgcAuditSession,
  validateUgcExportPost,
  visionPcLog,
} from '../ugc-batch-audit.js'
import {
  abortUgcBatchRun,
  clearUgcBatchRun,
  forceKillUgcBatchRun,
  getUgcBatchRun,
  initUgcBatchRunFromDisk,
  saveUgcBatchRunPost,
  startUgcBatchRun,
} from '../ugc-batch-run.js'

initUgcBatchRunFromDisk()

export function attachUgcSlidesRoutes(middlewares: Connect.Server) {
  middlewares.use('/api/ugc-slides', async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    try {
      const url = new URL(req.url || '/', 'http://local')
      const action = url.searchParams.get('action') || ''

      if (req.method === 'GET' && action === 'discord-settings') {
        sendJson(res, 200, { ok: true, settings: loadUgcDiscordSettings() })
        return
      }

      if (req.method === 'GET' && action === 'theme-pool-status') {
        const category = url.searchParams.get('category') || undefined
        sendJson(res, 200, { ok: true, status: getUgcThemePoolStatus(category) })
        return
      }

      if (req.method === 'GET' && action === 'image-pool-status') {
        sendJson(res, 200, { ok: true, status: getUgcImagePoolStatus() })
        return
      }

      if (req.method === 'GET' && action === 'ollama-status') {
        const status = await getUgcOllamaStatus()
        sendJson(res, 200, { ok: true, status })
        return
      }

      if (req.method === 'POST' && action === 'ollama-warm') {
        await warmUgcOllamaModel()
        sendJson(res, 200, { ok: true })
        return
      }

      if (req.method === 'POST' && action === 'ollama-unload') {
        await releaseUgcOllamaAfterBatch()
        sendJson(res, 200, { ok: true })
        return
      }

      if (req.method === 'GET' && action === 'serve-image') {
        const file = url.searchParams.get('file') || ''
        const imagePath = resolveNewImagePath(file)
        if (!imagePath) {
          sendJson(res, 404, { ok: false, message: 'Image not found' })
          return
        }
        res.statusCode = 200
        res.setHeader('Content-Type', imageContentType(file))
        res.setHeader('Cache-Control', 'no-store')
        fs.createReadStream(imagePath).pipe(res)
        return
      }

      if (req.method === 'GET' && action === 'serve-product') {
        const slug = url.searchParams.get('slug') || ''
        const variant = url.searchParams.get('variant') || ''
        const { resolveProductVisuals } = await import('../ugc-kaledu-visuals.js')
        const visuals = resolveProductVisuals(slug)
        const asset = (variant && visuals.find((row) => row.variantId === variant && row.productId === slug)) || visuals.find((row) => row.productId === slug)
        if (!asset || asset.productId !== slug) {
          sendJson(res, 404, { ok: false, message: 'Product image not found' })
          return
        }
        const imagePath = path.join(
          (await import('../profile-brand.js')).CHRISTMAS_PRODUCTS_DIR,
          path.basename(asset.src),
        )
        res.statusCode = 200
        res.setHeader('Content-Type', imageContentType(imagePath))
        res.setHeader('Cache-Control', 'no-store')
        fs.createReadStream(imagePath).pipe(res)
        return
      }

      if (req.method === 'POST' && action === 'pick-images') {
        const parsed = await readJsonBody(req)
        const count = typeof parsed.count === 'number' ? parsed.count : Number(parsed.count)
        const testMode = parsed.testMode === true
        const result = pickBatchUgcImages(count, { testMode })
        sendJson(res, result.ok ? 200 : 400, result)
        return
      }

      if (req.method === 'POST' && action === 'consume-image') {
        const parsed = await readJsonBody(req)
        const filename = typeof parsed.filename === 'string' ? parsed.filename : ''
        const result = consumeUgcImage(filename)
        sendJson(res, result.ok ? 200 : 400, result)
        return
      }

      if (req.method === 'POST' && action === 'pick-themes') {
        const parsed = await readJsonBody(req)
        const count = typeof parsed.count === 'number' ? parsed.count : Number(parsed.count)
        const category = typeof parsed.category === 'string' ? parsed.category : undefined
        const testMode = parsed.testMode === true
        const result = pickBatchUgcThemes(count, category, { testMode })
        sendJson(res, result.ok ? 200 : 400, result)
        return
      }

      if (req.method === 'POST' && action === 'reset-used-themes') {
        const result = resetUsedUgcThemes()
        sendJson(res, 200, { ok: true, message: result.message, status: getUgcThemePoolStatus() })
        return
      }

      if (req.method === 'POST' && action === 'validate-export') {
        const parsed = await readJsonBody(req)
        const caption = typeof parsed.caption === 'string' ? parsed.caption : ''
        const meta =
          parsed.meta && typeof parsed.meta === 'object' && !Array.isArray(parsed.meta)
            ? (parsed.meta as Record<string, unknown>)
            : {}
        const validation = validateUgcExportPost({ caption, meta })
        sendJson(res, validation.ok ? 200 : 400, validation)
        return
      }

      if (req.method === 'POST' && action === 'validate-quality') {
        const parsed = await readJsonBody(req)
        const slides = Array.isArray(parsed.slides) ? parsed.slides : []
        const result = validateUgcSlideshowQuality({
          slides: slides.filter((slide): slide is Record<string, unknown> => Boolean(slide && typeof slide === 'object')).map((slide) => ({
            title: typeof slide.title === 'string' ? slide.title : '',
            body: typeof slide.body === 'string' ? slide.body : '',
            cta: typeof slide.cta === 'string' ? slide.cta : '',
            role: typeof slide.role === 'string' ? slide.role : undefined,
          })),
          description: typeof parsed.description === 'string' ? parsed.description : '',
          theme: typeof parsed.theme === 'string' ? parsed.theme : '',
        })
        sendJson(res, result.ok ? 200 : 400, result)
        return
      }

      if (req.method === 'GET' && action === 'batch-run-status') {
        sendJson(res, 200, { ok: true, run: getUgcBatchRun() })
        return
      }

      if (req.method === 'POST' && action === 'batch-run-start') {
        const parsed = await readJsonBody(req)
        const count = typeof parsed.count === 'number' ? parsed.count : Number(parsed.count)
        const slideMin = typeof parsed.slideMin === 'number' ? parsed.slideMin : Number(parsed.slideMin)
        const slideMax = typeof parsed.slideMax === 'number' ? parsed.slideMax : Number(parsed.slideMax)
        const category = typeof parsed.category === 'string' ? parsed.category : 'Random theme'
        const testMode = parsed.testMode === true
        const outputFolder = typeof parsed.outputFolder === 'string' ? parsed.outputFolder : ''
        const defaultCta = typeof parsed.defaultCta === 'string' ? parsed.defaultCta : undefined
        const useFolderImages = parsed.useFolderImages !== false
        const result = startUgcBatchRun({
          count,
          slideMin,
          slideMax,
          category,
          testMode,
          outputFolder,
          defaultCta,
          universalDescription: typeof parsed.universalDescription === 'string' ? parsed.universalDescription : undefined,
          useFolderImages,
        })
        sendJson(res, result.ok ? 200 : 400, result)
        return
      }

      if (req.method === 'POST' && action === 'batch-run-abort') {
        sendJson(res, 200, abortUgcBatchRun())
        return
      }

      if (req.method === 'POST' && action === 'batch-run-clear') {
        sendJson(res, 200, clearUgcBatchRun())
        return
      }

      if (req.method === 'POST' && action === 'batch-run-force-kill') {
        sendJson(res, 200, forceKillUgcBatchRun())
        return
      }

      if (req.method === 'POST' && action === 'batch-run-save-post') {
        const parsed = await readJsonBody(req)
        const postIndex =
          typeof parsed.postIndex === 'number' ? parsed.postIndex : Number(parsed.postIndex)
        const caption = typeof parsed.caption === 'string' ? parsed.caption : ''
        const meta =
          parsed.meta && typeof parsed.meta === 'object' && !Array.isArray(parsed.meta)
            ? (parsed.meta as Record<string, unknown>)
            : {}
        const slidesRaw = Array.isArray(parsed.slides) ? parsed.slides : []
        const slides = slidesRaw
          .map((slide, i) => {
            if (!slide || typeof slide !== 'object') return null
            const filename =
              typeof (slide as { filename?: unknown }).filename === 'string'
                ? (slide as { filename: string }).filename
                : `slide_${String(i + 1).padStart(2, '0')}.png`
            const data =
              typeof (slide as { data?: unknown }).data === 'string'
                ? (slide as { data: string }).data
                : ''
            if (!data) return null
            return { filename, data }
          })
          .filter(Boolean) as import('../ugc-batch-export.js').SaveBatchSlide[]
        const result = saveUgcBatchRunPost({ postIndex, caption, meta, slides })
        sendJson(res, result.ok ? 200 : 400, result)
        return
      }

      if (req.method === 'POST' && action === 'save-batch') {
        const parsed = await readJsonBody(req)
        const outputRoot = typeof parsed.outputRoot === 'string' ? parsed.outputRoot : undefined
        const postsRaw = Array.isArray(parsed.posts) ? parsed.posts : []
        const posts = postsRaw
          .map((row) => {
            if (!row || typeof row !== 'object') return null
            const postIndex =
              typeof (row as { postIndex?: unknown }).postIndex === 'number'
                ? (row as { postIndex: number }).postIndex
                : Number((row as { postIndex?: unknown }).postIndex)
            const caption =
              typeof (row as { caption?: unknown }).caption === 'string'
                ? (row as { caption: string }).caption
                : ''
            const meta =
              (row as { meta?: unknown }).meta &&
              typeof (row as { meta?: unknown }).meta === 'object'
                ? ((row as { meta: Record<string, unknown> }).meta as Record<string, unknown>)
                : {}
            const slidesRaw = Array.isArray((row as { slides?: unknown }).slides)
              ? (row as { slides: unknown[] }).slides
              : []
            const slides = slidesRaw
              .map((slide, i) => {
                if (!slide || typeof slide !== 'object') return null
                const filename =
                  typeof (slide as { filename?: unknown }).filename === 'string'
                    ? (slide as { filename: string }).filename
                    : `slide_${String(i + 1).padStart(2, '0')}.png`
                const data =
                  typeof (slide as { data?: unknown }).data === 'string'
                    ? (slide as { data: string }).data
                    : ''
                if (!data) return null
                return { filename, data }
              })
              .filter(Boolean) as { filename: string; data: string }[]
            if (!Number.isFinite(postIndex) || !slides.length) return null
            return { postIndex, caption, meta, slides }
          })
          .filter(Boolean) as import('../ugc-batch-export.js').SaveBatchPost[]
        const invalidPosts = posts
          .map((post) => ({
            postIndex: post.postIndex,
            auditId:
              typeof post.meta?.auditId === 'string'
                ? post.meta.auditId
                : typeof post.meta?.audit_id === 'string'
                  ? post.meta.audit_id
                  : undefined,
            validation: validateUgcExportPost({ caption: post.caption, meta: post.meta }),
          }))
          .filter((post) => !post.validation.ok)
        if (invalidPosts.length) {
          const message = `Pre-export quality gate blocked ${invalidPosts.length} post(s): ${invalidPosts
            .map((post) => `Post ${post.postIndex} [${post.validation.issues.join(', ')}]`)
            .join('; ')}`
          visionPcLog('pre_export_gate_fail', { invalidPosts })
          for (const post of invalidPosts) {
            attachUgcAuditExport(post.auditId, { ok: false, error: message })
          }
          sendJson(res, 400, { ok: false, message, invalidPosts })
          return
        }
        const result = saveUgcBatchToDisk(outputRoot, posts)
        visionPcLog('save_batch', {
          ok: result.ok,
          batchDir: result.ok ? result.batchDir : undefined,
          message: result.ok ? undefined : result.message,
          postCount: posts.length,
          outputRoot: outputRoot || null,
        })
        for (const post of posts) {
          const auditId =
            typeof post.meta?.auditId === 'string'
              ? post.meta.auditId
              : typeof post.meta?.audit_id === 'string'
                ? post.meta.audit_id
                : undefined
          if (auditId) {
            attachUgcAuditExport(auditId, {
              caption: post.caption,
              meta: post.meta,
              batchDir: result.ok ? result.batchDir : undefined,
              ok: result.ok,
              error: result.ok ? undefined : result.message,
            })
          }
        }
        sendJson(res, result.ok ? 200 : 400, result)
        return
      }

      if (req.method === 'POST' && action === 'discord-settings') {
        const parsed = await readJsonBody(req)
        const result = saveUgcDiscordSettings({
          guildId: typeof parsed.guildId === 'string' ? parsed.guildId : '',
          categoryId: typeof parsed.categoryId === 'string' ? parsed.categoryId : '',
        })
        sendJson(res, result.ok ? 200 : 400, {
          ok: result.ok,
          message: result.message,
          settings: loadUgcDiscordSettings(),
        })
        return
      }

      if (req.method === 'POST' && action === 'generate-description-lt') {
        const parsed = await readJsonBody(req)
        const slides = Array.isArray(parsed.slides) ? parsed.slides : []
        const result = await generateLtDiscordDescription({
          angle: typeof parsed.angle === 'string' ? parsed.angle : undefined,
          brief: typeof parsed.brief === 'string' ? parsed.brief : undefined,
          cta: typeof parsed.cta === 'string' ? parsed.cta : undefined,
          slides: slides as Array<{ title?: string; body?: string; role?: string; cta?: string }>,
          batchCaption: parsed.batchCaption === true,
          arcName: typeof parsed.arcName === 'string' ? parsed.arcName : undefined,
          hookStyle: typeof parsed.hookStyle === 'string' ? parsed.hookStyle : undefined,
          storyArc: typeof parsed.storyArc === 'string' ? parsed.storyArc : undefined,
          seed: typeof parsed.seed === 'number' ? parsed.seed : Number(parsed.seed) || undefined,
        })
        sendJson(res, result.ok ? 200 : 400, result)
        return
      }

      if (req.method === 'POST' && action === 'publish-discord') {
        const parsed = await readJsonBody(req)
        const caption = typeof parsed.caption === 'string' ? parsed.caption.trim() : ''
        const creds = resolveDiscordCredentials({
          guildId: typeof parsed.guildId === 'string' ? parsed.guildId : undefined,
          categoryId: typeof parsed.categoryId === 'string' ? parsed.categoryId : undefined,
        })
        const slidesRaw = Array.isArray(parsed.slides) ? parsed.slides : []
        const slides: { filename: string; data: Buffer }[] = []
        for (let i = 0; i < slidesRaw.length; i++) {
          const row = slidesRaw[i]
          if (!row || typeof row !== 'object') continue
          const filename =
            typeof (row as { filename?: unknown }).filename === 'string'
              ? (row as { filename: string }).filename
              : `slide_${String(i + 1).padStart(2, '0')}.png`
          const b64 =
            typeof (row as { data?: unknown }).data === 'string'
              ? (row as { data: string }).data
              : ''
          if (!b64) continue
          slides.push({ filename, data: Buffer.from(b64, 'base64') })
        }

        const result = await publishUgcSlideshowToDiscord({
          token: creds.token,
          guildId: creds.guildId,
          categoryId: creds.categoryId || undefined,
          caption,
          slides,
        })
        sendJson(res, result.ok ? 200 : 400, result)
        return
      }

      if (req.method === 'POST' && action === 'generate-copy') {
        const parsed = await readJsonBody(req)
        const result = await generateUgcSlideCopy({
          angle: typeof parsed.angle === 'string' ? parsed.angle : undefined,
          brief: typeof parsed.brief === 'string' ? parsed.brief : undefined,
          cta: typeof parsed.cta === 'string' ? parsed.cta : undefined,
        })
        sendJson(res, result.ok ? 200 : 400, result)
        return
      }

      if (req.method === 'GET' && action === 'audit-status') {
        sendJson(res, 200, { ok: true, audit: getUgcAuditStatus() })
        return
      }

      if (req.method === 'POST' && action === 'reset-audit') {
        const parsed = await readJsonBody(req)
        const target =
          typeof parsed.target === 'number'
            ? parsed.target
            : Number(parsed.target) || undefined
        const note = typeof parsed.note === 'string' ? parsed.note : undefined
        const archivePrevious = parsed.archivePrevious !== false
        const audit = resetUgcAuditSession({ target, note, archivePrevious })
        sendJson(res, 200, { ok: true, audit })
        return
      }

      if (req.method === 'POST' && action === 'vision-log') {
        const parsed = await readJsonBody(req)
        const event = typeof parsed.event === 'string' ? parsed.event : 'client_event'
        const auditId = typeof parsed.auditId === 'string' ? parsed.auditId : undefined
        const detail =
          parsed.detail && typeof parsed.detail === 'object' && !Array.isArray(parsed.detail)
            ? (parsed.detail as Record<string, unknown>)
            : {}
        logUgcAuditClientEvent(auditId, event, detail)
        sendJson(res, 200, { ok: true })
        return
      }

      if (req.method === 'POST' && action === 'generate-slideshow') {
        const parsed = await readJsonBody(req)
        const result = await generateUgcSlideshowCopy({
          angle: typeof parsed.angle === 'string' ? parsed.angle : undefined,
          brief: typeof parsed.brief === 'string' ? parsed.brief : undefined,
          cta: typeof parsed.cta === 'string' ? parsed.cta : undefined,
          slideCount: typeof parsed.slideCount === 'number' ? parsed.slideCount : Number(parsed.slideCount),
          batchStory: parsed.batchStory === true,
          seed: typeof parsed.seed === 'number' ? parsed.seed : Number(parsed.seed) || undefined,
          skipWarm: parsed.skipWarm === true,
          theme: typeof parsed.theme === 'string' ? parsed.theme : undefined,
          category: typeof parsed.category === 'string' ? parsed.category : undefined,
        })
        sendJson(res, result.ok ? 200 : 400, result)
        return
      }

      sendJson(res, 405, { ok: false, message: 'Unsupported ugc-slides action' })
    } catch (err) {
      const msg = llmErrorMessage(err)
      sendJson(res, 500, {
        ok: false,
        error: msg,
        message: msg,
        errorDetail: serializeError(err),
      })
    }
  })
}
