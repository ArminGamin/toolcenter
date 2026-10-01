import {
  abortGroupPoster,
  clearGroupPosterLog,
  clearGroupPosterRun,
  continueGroupPosterLogin,
  deleteGroupPosterProfile,
  getGroupPosterLog,
  getGroupPosterState,
  loadCaptionsFromPath,
  loadGroupPosterProfile,
  pauseGroupPoster,
  refreshGroupPosterGroups,
  joinGroupPosterGroups,
  scanGroupPosterBuySell,
  resumeGroupPoster,
  saveCaptionsText,
  saveGroupPosterProfile,
  saveGroupPosterSettings,
  showGroupPosterBrowser,
  startGroupPoster,
  blacklistGroupPosterGroups,
  unblacklistGroupPosterGroup,
  clearGroupPosterWarmProgress,
  clearGroupPosterLoginSession,
  type GroupPosterSettings,
} from '../group-poster.js'
import {
  abortFriendDms,
  clearFriendDmLog,
  clearFriendDmRun,
  clearFriendDmSent,
  continueFriendDmLogin,
  getFriendDmState,
  pauseFriendDms,
  refreshFriendDmFriends,
  resumeFriendDms,
  saveFriendDmMessages,
  saveFriendDmSettings,
  showFriendDmBrowser,
  startFriendDms,
  type FriendDmSettings,
} from '../group-poster-dms.js'
import {
  abortProfileShare,
  clearProfileShareLog,
  clearProfileShareRun,
  clearProfileShareSent,
  continueProfileShareLogin,
  getProfileShareState,
  pauseProfileShare,
  resumeProfileShare,
  saveProfileShareSettings,
  showProfileShareBrowser,
  startProfileShare,
  type ProfileShareSettings,
} from '../group-poster-share.js'
import type { Connect } from 'vite'
import { readJsonBody, sendJson } from '../middleware/http.js'

export function attachGroupPosterRoutes(middlewares: Connect.Server) {
  middlewares.use('/api/group-poster', async (req, res) => {
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
          sendJson(res, 200, getGroupPosterState())
          return
        }
        if (action === 'poll') {
          sendJson(res, 200, getGroupPosterState({ light: true }))
          return
        }
        if (action === 'log') {
          const limit = Math.min(200, Math.max(20, Number(url.searchParams.get('limit') || 80) || 80))
          sendJson(res, 200, { ok: true, log: getGroupPosterLog(limit) })
          return
        }
        if (action === 'dm-state' || action === 'dm-poll') {
          sendJson(res, 200, getFriendDmState({ light: action === 'dm-poll' }))
          return
        }
        if (action === 'share-state' || action === 'share-poll') {
          sendJson(res, 200, getProfileShareState())
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
        if (action === 'dm-settings') {
          sendJson(res, 200, saveFriendDmSettings(parsed as Partial<FriendDmSettings>))
          return
        }
        if (action === 'dm-save-messages') {
          sendJson(
            res,
            200,
            saveFriendDmMessages(typeof parsed.text === 'string' ? parsed.text : ''),
          )
          return
        }
        if (action === 'dm-refresh-friends') {
          sendJson(res, 200, refreshFriendDmFriends())
          return
        }
        if (action === 'dm-start') {
          sendJson(res, 200, startFriendDms(parsed as Partial<FriendDmSettings>))
          return
        }
        if (action === 'dm-pause') {
          sendJson(res, 200, pauseFriendDms())
          return
        }
        if (action === 'dm-resume') {
          sendJson(res, 200, resumeFriendDms())
          return
        }
        if (action === 'dm-abort') {
          sendJson(res, 200, abortFriendDms())
          return
        }
        if (action === 'dm-continue-login') {
          sendJson(res, 200, continueFriendDmLogin())
          return
        }
        if (action === 'dm-show-browser') {
          sendJson(res, 200, showFriendDmBrowser())
          return
        }
        if (action === 'dm-clear-sent') {
          sendJson(res, 200, clearFriendDmSent())
          return
        }
        if (action === 'dm-clear-log') {
          sendJson(res, 200, clearFriendDmLog())
          return
        }
        if (action === 'dm-clear-run') {
          sendJson(res, 200, clearFriendDmRun())
          return
        }
        if (action === 'share-settings') {
          sendJson(res, 200, saveProfileShareSettings(parsed as Partial<ProfileShareSettings>))
          return
        }
        if (action === 'share-start') {
          sendJson(res, 200, startProfileShare(parsed as Partial<ProfileShareSettings>))
          return
        }
        if (action === 'share-pause') {
          sendJson(res, 200, pauseProfileShare())
          return
        }
        if (action === 'share-resume') {
          sendJson(res, 200, resumeProfileShare())
          return
        }
        if (action === 'share-abort') {
          sendJson(res, 200, abortProfileShare())
          return
        }
        if (action === 'share-continue-login') {
          sendJson(res, 200, continueProfileShareLogin())
          return
        }
        if (action === 'share-show-browser') {
          sendJson(res, 200, showProfileShareBrowser())
          return
        }
        if (action === 'share-clear-sent') {
          sendJson(res, 200, clearProfileShareSent())
          return
        }
        if (action === 'share-clear-log') {
          sendJson(res, 200, clearProfileShareLog())
          return
        }
        if (action === 'share-clear-run') {
          sendJson(res, 200, clearProfileShareRun())
          return
        }
        if (action === 'settings') {
          sendJson(
            res,
            200,
            saveGroupPosterSettings(parsed as Partial<GroupPosterSettings> & { loginPassword?: string }),
          )
          return
        }
        if (action === 'save-captions') {
          sendJson(
            res,
            200,
            saveCaptionsText(typeof parsed.captions === 'string' ? parsed.captions : ''),
          )
          return
        }
        if (action === 'load-captions-file') {
          const result = loadCaptionsFromPath(typeof parsed.path === 'string' ? parsed.path : '')
          sendJson(res, result.ok ? 200 : 400, result)
          return
        }
        if (action === 'start') {
          const result = startGroupPoster(parsed.settings as Partial<GroupPosterSettings> | undefined)
          sendJson(res, result.ok ? 200 : 400, result)
          return
        }
        if (action === 'refresh-groups') {
          const result = refreshGroupPosterGroups()
          sendJson(res, result.ok ? 200 : 400, result)
          return
        }
        if (action === 'join-groups') {
          const result = joinGroupPosterGroups()
          sendJson(res, result.ok ? 200 : 400, result)
          return
        }
        if (action === 'scan-buy-sell') {
          const result = scanGroupPosterBuySell()
          sendJson(res, result.ok ? 200 : 400, result)
          return
        }
        if (action === 'continue-login') {
          sendJson(res, 200, continueGroupPosterLogin())
          return
        }
        if (action === 'clear-login') {
          sendJson(res, 200, clearGroupPosterLoginSession())
          return
        }
        if (action === 'show-browser' || action === 'showBrowser') {
          sendJson(res, 200, showGroupPosterBrowser())
          return
        }
        if (action === 'pause') {
          sendJson(res, 200, pauseGroupPoster())
          return
        }
        if (action === 'resume') {
          sendJson(res, 200, resumeGroupPoster())
          return
        }
        if (action === 'abort') {
          sendJson(res, 200, abortGroupPoster())
          return
        }
        if (action === 'clear-log') {
          sendJson(res, 200, clearGroupPosterLog())
          return
        }
        if (action === 'clear-run') {
          if (parsed.scope === 'dm' || parsed.dm === true) {
            sendJson(res, 200, clearFriendDmRun())
            return
          }
          sendJson(res, 200, clearGroupPosterRun())
          return
        }
        if (action === 'clear-warm' || action === 'clear-progress') {
          sendJson(res, 200, clearGroupPosterWarmProgress())
          return
        }
        if (action === 'blacklist' || action === 'blacklist-add') {
          const ids = Array.isArray(parsed.ids)
            ? parsed.ids.filter((x): x is string => typeof x === 'string')
            : typeof parsed.id === 'string'
              ? [parsed.id]
              : []
          const result = blacklistGroupPosterGroups(ids)
          sendJson(res, result.ok ? 200 : 400, result)
          return
        }
        if (action === 'unblacklist' || action === 'blacklist-remove') {
          sendJson(
            res,
            200,
            unblacklistGroupPosterGroup(typeof parsed.id === 'string' ? parsed.id : ''),
          )
          return
        }
        if (action === 'profile-save' || action === 'save-profile') {
          const result = saveGroupPosterProfile(typeof parsed.name === 'string' ? parsed.name : '')
          sendJson(res, result.ok ? 200 : 400, result)
          return
        }
        if (action === 'profile-load' || action === 'load-profile') {
          const result = loadGroupPosterProfile(typeof parsed.name === 'string' ? parsed.name : '')
          sendJson(res, result.ok ? 200 : 400, result)
          return
        }
        if (action === 'profile-delete' || action === 'delete-profile') {
          const result = deleteGroupPosterProfile(typeof parsed.name === 'string' ? parsed.name : '')
          sendJson(res, result.ok ? 200 : 400, result)
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
