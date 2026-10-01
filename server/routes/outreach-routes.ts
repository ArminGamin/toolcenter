import {
  abortOutreach,
  approveOutreach,
  deleteOutreachSendProfile,
  dryRunClean,
  cleanOutreachFound,
  getOutreachLog,
  getOutreachSettings,
  getOutreachState,
  listOutreachSendProfiles,
  loadOutreachSendProfile,
  loadPromoHtmlIntoSettings,
  pauseOutreachSend,
  resetRejectedSet,
  resetSentSet,
  clearOutreachLog,
  clearOutreachRun,
  clearScrapeCache,
  clearProfileDatabases,
  freshLaunchSession,
  getLeadFinderExportFiles,
  getOutreachCandidateAudit,
  restartOutreachFinder,
  exportOutreachFoundLeads,
  freshStartOutreach,
  resumeOutreachSend,
  saveOutreachSendProfile,
  saveOutreachSettings,
  syncOutreachQuotasFromResend,
  setOutreachProfileQuota,
  startOutreachRun,
  startOutreachSend,
  startOutreachLiveSend,
  testOutreachSend,
  type CleanSettings,
  type OutreachSettings,
} from '../outreach.js'
import type { Connect } from 'vite'
import { readJsonBody, sendJson } from '../middleware/http.js'

export function attachOutreachRoutes(middlewares: Connect.Server) {
  middlewares.use('/api/outreach', async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1')
      const action = url.searchParams.get('action') || ''

      if (req.method === 'GET') {
        if (action === 'state' || action === '') {
          sendJson(res, 200, getOutreachState())
          return
        }
        if (action === 'poll') {
          sendJson(res, 200, getOutreachState({ light: true }))
          return
        }
        if (action === 'log') {
          const filter = (url.searchParams.get('filter') || 'all') as 'all' | 'error' | 'decision'
          const limit = Math.min(200, Math.max(20, Number(url.searchParams.get('limit') || 80) || 80))
          sendJson(res, 200, { ok: true, log: getOutreachLog(filter, limit) })
          return
        }
        if (action === 'settings') {
          sendJson(res, 200, { ok: true, settings: getOutreachSettings() })
          return
        }
        if (action === 'send-profiles') {
          sendJson(res, 200, listOutreachSendProfiles())
          return
        }
        if (action === 'sync-quotas') {
          const result = await syncOutreachQuotasFromResend({
            profile: url.searchParams.get('profile') || undefined,
            force: url.searchParams.get('force') === '1',
          })
          sendJson(res, result.ok ? 200 : 400, { ...result, state: getOutreachState({ light: true }) })
          return
        }
        if (action === 'lead-exports') {
          sendJson(res, 200, getLeadFinderExportFiles())
          return
        }
        if (action === 'candidate-audit') {
          sendJson(res, 200, getOutreachCandidateAudit(Number(url.searchParams.get('limit') || 2000)))
          return
        }
        sendJson(res, 400, { ok: false, message: 'Unknown GET action' })
        return
      }

      if (req.method === 'POST') {
        const parsed = await readJsonBody(req)
        if (action === 'restart-find') {
          const result = await restartOutreachFinder()
          sendJson(res, result.ok ? 200 : 400, result)
          return
        }
        if (action === 'settings') {
          sendJson(res, 200, saveOutreachSettings(parsed as Partial<OutreachSettings>))
          return
        }
        if (action === 'send-profile-save') {
          sendJson(
            res,
            200,
            saveOutreachSendProfile(typeof parsed.name === 'string' ? parsed.name : ''),
          )
          return
        }
        if (action === 'send-profile-load') {
          const result = loadOutreachSendProfile(typeof parsed.name === 'string' ? parsed.name : '')
          sendJson(res, result.ok ? 200 : 400, result)
          return
        }
        if (action === 'send-profile-delete') {
          const result = deleteOutreachSendProfile(typeof parsed.name === 'string' ? parsed.name : '')
          sendJson(res, result.ok ? 200 : 400, result)
          return
        }
        if (action === 'set-quota') {
          const result = setOutreachProfileQuota(
            typeof parsed.profile === 'string' ? parsed.profile : '',
            Number(parsed.sent),
            { manual: parsed.manual !== false },
          )
          sendJson(res, result.ok ? 200 : 400, { ...result, state: getOutreachState({ light: true }) })
          return
        }
        if (action === 'start') {
          const result = await startOutreachRun({
            settings: parsed.settings as Partial<OutreachSettings> | undefined,
            pasteList: typeof parsed.pasteList === 'string' ? parsed.pasteList : undefined,
            importFilePath: typeof parsed.importFilePath === 'string' ? parsed.importFilePath : undefined,
          })
          sendJson(res, result.ok ? 200 : 400, result)
          return
        }
        if (action === 'export-leads') {
          sendJson(res, 200, exportOutreachFoundLeads())
          return
        }
        if (action === 'approve') {
          const result = approveOutreach({
            selected: Array.isArray(parsed.selected) ? (parsed.selected as string[]) : undefined,
            keep: Array.isArray(parsed.keep) ? (parsed.keep as string[]) : undefined,
            drop: Array.isArray(parsed.drop) ? (parsed.drop as string[]) : undefined,
          })
          sendJson(res, result.ok ? 200 : 400, result)
          return
        }
        if (action === 'send') {
          const result = await startOutreachSend()
          sendJson(res, result.ok ? 200 : 400, result)
          return
        }
        if (action === 'send-live') {
          const selected = Array.isArray(parsed.selected)
            ? parsed.selected.filter((e): e is string => typeof e === 'string')
            : undefined
          const result = await startOutreachLiveSend(selected)
          sendJson(res, result.ok ? 200 : 400, result)
          return
        }
        if (action === 'test-send') {
          const result = await testOutreachSend()
          sendJson(res, result.ok ? 200 : 400, result)
          return
        }
        if (action === 'load-promo') {
          sendJson(res, 200, loadPromoHtmlIntoSettings())
          return
        }
        if (action === 'pause') {
          sendJson(res, 200, pauseOutreachSend())
          return
        }
        if (action === 'resume') {
          sendJson(res, 200, resumeOutreachSend())
          return
        }
        if (action === 'abort') {
          sendJson(res, 200, abortOutreach())
          return
        }
        if (action === 'fresh-start') {
          const result = await freshStartOutreach()
          sendJson(res, result.ok ? 200 : 400, result)
          return
        }
        if (action === 'clean') {
          const text = typeof parsed.text === 'string' ? parsed.text : ''
          sendJson(
            res,
            200,
            dryRunClean(text, parsed.clean as Partial<CleanSettings> | undefined),
          )
          return
        }
        if (action === 'clean-found') {
          sendJson(res, 200, cleanOutreachFound())
          return
        }
        if (action === 'reset-sent') {
          sendJson(res, 200, resetSentSet())
          return
        }
        if (action === 'reset-rejected') {
          sendJson(res, 200, resetRejectedSet())
          return
        }
        if (action === 'clear-log') {
          sendJson(res, 200, clearOutreachLog())
          return
        }
        if (action === 'clear-run') {
          sendJson(res, 200, clearOutreachRun())
          return
        }
        if (action === 'fresh-launch') {
          sendJson(res, 200, freshLaunchSession())
          return
        }
        if (action === 'clear-scrape-cache') {
          sendJson(res, 200, clearScrapeCache())
          return
        }
        if (action === 'clear-profile-db') {
          const scope = parsed.scope === 'all' ? 'all' : 'active'
          sendJson(res, 200, clearProfileDatabases(scope))
          return
        }
        sendJson(res, 400, { ok: false, message: 'Unknown POST action' })
        return
      }

      sendJson(res, 405, { ok: false, message: 'GET or POST only' })
    } catch (err) {
      sendJson(res, 500, {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  })
}
