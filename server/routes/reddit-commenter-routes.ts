import {
  abortRedditCommenter,
  approveAllPending,
  approveQueueItem,
  blacklistSubreddits,
  clearQueue,
  clearRedditCommenterLog,
  clearRedditCommenterRun,
  continueRedditCommenterLogin,
  clearRedditCommenterLoginSession,
  getRedditCommenterLog,
  getRedditCommenterState,
  pauseRedditCommenter,
  refreshRedditSubreddits,
  resumeRedditCommenter,
  joinRedditSubreddits,
  saveRedditCommenterSettings,
  showRedditCommenterBrowser,
  skipQueueItem,
  startRedditPost,
  startRedditScan,
  startRedditScanAndPost,
  unblacklistSubreddit,
  updateQueueComment,
  type RedditCommenterSettings,
} from '../reddit-commenter.js'
import type { Connect } from 'vite'
import { readJsonBody, sendJson } from '../middleware/http.js'

export function attachRedditCommenterRoutes(middlewares: Connect.Server) {
  middlewares.use('/api/reddit-commenter', async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    try {
      const incoming = (req as { originalUrl?: string }).originalUrl || req.url || '/'
      const url = new URL(incoming, 'http://127.0.0.1')
      let action = url.searchParams.get('action') || ''

      if (req.method === 'GET') {
        if (action === 'state' || action === '') {
          sendJson(res, 200, getRedditCommenterState())
          return
        }
        if (action === 'poll') {
          sendJson(res, 200, getRedditCommenterState({ light: true }))
          return
        }
        if (action === 'log') {
          const limit = Math.min(200, Math.max(20, Number(url.searchParams.get('limit') || 80) || 80))
          sendJson(res, 200, { ok: true, log: getRedditCommenterLog(limit) })
          return
        }
        sendJson(res, 400, { ok: false, message: 'Unknown GET action' })
        return
      }

      if (req.method === 'POST') {
        const parsed = await readJsonBody(req)
        if (!action && typeof parsed.action === 'string') {
          action = parsed.action
        }
        if (action === 'settings') {
          sendJson(
            res,
            200,
            saveRedditCommenterSettings(parsed as Partial<RedditCommenterSettings> & { loginPassword?: string }),
          )
          return
        }
        if (action === 'join-subreddits') {
          const scope = parsed.scope === 'all' ? 'all' : 'selected'
          sendJson(
            res,
            200,
            joinRedditSubreddits(
              scope,
              parsed.settings as Partial<RedditCommenterSettings> & { loginPassword?: string } | undefined,
            ),
          )
          return
        }
        if (action === 'refresh-subreddits') {
          sendJson(
            res,
            200,
            refreshRedditSubreddits(parsed.settings as Partial<RedditCommenterSettings> & { loginPassword?: string } | undefined),
          )
          return
        }
        if (action === 'scan') {
          sendJson(res, 200, startRedditScan(parsed.settings as Partial<RedditCommenterSettings> | undefined))
          return
        }
        if (action === 'post') {
          sendJson(res, 200, startRedditPost(parsed.settings as Partial<RedditCommenterSettings> | undefined))
          return
        }
        if (action === 'scan-and-post') {
          sendJson(res, 200, startRedditScanAndPost(parsed.settings as Partial<RedditCommenterSettings> | undefined))
          return
        }
        if (action === 'continue-login') {
          sendJson(res, 200, continueRedditCommenterLogin())
          return
        }
        if (action === 'clear-login') {
          sendJson(res, 200, clearRedditCommenterLoginSession())
          return
        }
        if (action === 'show-browser') {
          sendJson(res, 200, showRedditCommenterBrowser())
          return
        }
        if (action === 'pause') {
          sendJson(res, 200, pauseRedditCommenter())
          return
        }
        if (action === 'resume') {
          sendJson(res, 200, resumeRedditCommenter())
          return
        }
        if (action === 'abort') {
          sendJson(res, 200, abortRedditCommenter())
          return
        }
        if (action === 'clear-log') {
          sendJson(res, 200, clearRedditCommenterLog())
          return
        }
        if (action === 'clear-run') {
          sendJson(res, 200, clearRedditCommenterRun())
          return
        }
        if (action === 'approve') {
          sendJson(res, 200, approveQueueItem(typeof parsed.id === 'string' ? parsed.id : ''))
          return
        }
        if (action === 'approve-all') {
          sendJson(res, 200, approveAllPending())
          return
        }
        if (action === 'skip') {
          sendJson(res, 200, skipQueueItem(typeof parsed.id === 'string' ? parsed.id : ''))
          return
        }
        if (action === 'update-comment') {
          sendJson(
            res,
            200,
            updateQueueComment(
              typeof parsed.id === 'string' ? parsed.id : '',
              typeof parsed.comment === 'string' ? parsed.comment : '',
            ),
          )
          return
        }
        if (action === 'clear-queue') {
          sendJson(res, 200, clearQueue(Boolean(parsed.clearPosted)))
          return
        }
        if (action === 'blacklist') {
          const ids = Array.isArray(parsed.ids)
            ? parsed.ids.filter((x): x is string => typeof x === 'string')
            : typeof parsed.id === 'string'
              ? [parsed.id]
              : []
          sendJson(res, 200, blacklistSubreddits(ids))
          return
        }
        if (action === 'unblacklist') {
          sendJson(res, 200, unblacklistSubreddit(typeof parsed.id === 'string' ? parsed.id : ''))
          return
        }
        sendJson(res, 400, {
          ok: false,
          message: `Unknown POST action${action ? `: ${action}` : ''}`,
        })
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
