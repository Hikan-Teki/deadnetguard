/**
 * DeadNetGuard - Background Service Worker
 * Handles storage, stats, and API communication
 */

import type { BannedChannel, Stats, Settings } from '@/types'

// API configuration
const API_BASE_URL = 'https://api.deadnetguard.com'

// Sync interval (1 hour in minutes for chrome.alarms)
const SYNC_INTERVAL_MINUTES = 60

// Default values
const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  showOverlay: true,
  syncEnabled: true,
  lastSyncAt: null,
}

const DEFAULT_STATS: Stats = {
  blockedToday: 0,
  blockedTotal: 0,
  lastBlockedChannel: null,
}

/**
 * Initialize extension on install
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[DeadNetGuard] Extension installed:', details.reason)

  if (details.reason === 'install') {
    // Set default values
    await chrome.storage.local.set({
      settings: DEFAULT_SETTINGS,
      personalBlocklist: [],
      communityBlocklist: [],
      stats: DEFAULT_STATS,
    })

    console.log('[DeadNetGuard] Default settings initialized')

    // Fetch community blocklist on install
    await fetchCommunityBlocklist()
  }

  // Setup alarms for daily reset and periodic sync
  setupDailyReset()
  setupPeriodicSync()
})

// Also run sync on startup
chrome.runtime.onStartup.addListener(async () => {
  console.log('[DeadNetGuard] Extension startup')
  await fetchCommunityBlocklist()
})

/**
 * Handle messages from content script and popup
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender, sendResponse)
  return true // Keep channel open for async responses
})

async function handleMessage(
  message: { type: string; [key: string]: unknown },
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void
) {
  try {
    switch (message.type) {
      case 'CONTENT_SCRIPT_READY':
        console.log('[DeadNetGuard] Content script ready on tab')
        sendResponse({ success: true })
        break

      case 'UPDATE_STATS':
        await updateStats(
          message.blocked as number,
          message.channelName as string
        )
        sendResponse({ success: true })
        break

      case 'GET_SETTINGS':
        const result = await chrome.storage.local.get(['settings', 'stats'])
        sendResponse({
          success: true,
          settings: result.settings || DEFAULT_SETTINGS,
          stats: result.stats || DEFAULT_STATS,
        })
        break

      case 'ADD_TO_BLOCKLIST':
        await addToBlocklist(message.channel as BannedChannel)
        sendResponse({ success: true })
        break

      case 'REMOVE_FROM_BLOCKLIST':
        await removeFromBlocklist(message.channelId as string)
        sendResponse({ success: true })
        break

      case 'SYNC_COMMUNITY_LIST':
        const list = await fetchCommunityBlocklist()
        sendResponse({ success: true, count: list.length })
        break

      case 'REPORT_CHANNEL':
        const reportResult = await reportChannelToAPI(
          message.youtubeId as string,
          message.channelName as string
        )
        sendResponse(reportResult)
        break

      case 'GET_BLOCKLIST':
        const blocklistResult = await chrome.storage.local.get(['personalBlocklist', 'communityBlocklist'])
        sendResponse({
          success: true,
          personal: blocklistResult.personalBlocklist || [],
          community: blocklistResult.communityBlocklist || []
        })
        break

      default:
        sendResponse({ success: false, error: 'Unknown message type' })
    }
  } catch (error) {
    console.error('[DeadNetGuard] Message handler error:', error)
    sendResponse({ success: false, error: String(error) })
  }
}

/**
 * Update blocked stats
 */
async function updateStats(blocked: number, channelName: string) {
  const result = await chrome.storage.local.get('stats') as { stats?: Stats }
  const stats: Stats = result.stats ?? { ...DEFAULT_STATS }

  stats.blockedToday += blocked
  stats.blockedTotal += blocked
  stats.lastBlockedChannel = channelName

  await chrome.storage.local.set({ stats })

  // Update badge
  chrome.action.setBadgeText({ text: stats.blockedToday.toString() })
  chrome.action.setBadgeBackgroundColor({ color: '#DC2626' })
}

/**
 * Add channel to personal blocklist
 */
async function addToBlocklist(channel: BannedChannel) {
  const result = await chrome.storage.local.get('personalBlocklist') as { personalBlocklist?: BannedChannel[] }
  const personalBlocklist = result.personalBlocklist ?? []

  // Check if already exists
  if (!personalBlocklist.some((c) => c.youtubeId === channel.youtubeId)) {
    personalBlocklist.push(channel)
    await chrome.storage.local.set({ personalBlocklist })
  }

  // Notify all YouTube tabs to refresh
  notifyContentScripts('REFRESH_BLOCKLIST')
}

/**
 * Remove channel from personal blocklist
 */
async function removeFromBlocklist(channelId: string) {
  const result = await chrome.storage.local.get('personalBlocklist') as { personalBlocklist?: BannedChannel[] }
  const personalBlocklist = result.personalBlocklist ?? []

  const filtered = personalBlocklist.filter((c) => c.youtubeId !== channelId)
  await chrome.storage.local.set({ personalBlocklist: filtered })

  // Notify all YouTube tabs to refresh
  notifyContentScripts('REFRESH_BLOCKLIST')
}

/**
 * Fetch community blocklist from API
 */
async function fetchCommunityBlocklist(): Promise<BannedChannel[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/banlist`)
    if (!response.ok) throw new Error('Failed to fetch')

    const data = await response.json()
    const communityBlocklist: BannedChannel[] = data.channels || []

    const settingsResult = await chrome.storage.local.get('settings') as { settings?: Settings }
    await chrome.storage.local.set({
      communityBlocklist,
      settings: {
        ...(settingsResult.settings ?? DEFAULT_SETTINGS),
        lastSyncAt: Date.now(),
      },
    })

    // Notify content scripts
    notifyContentScripts('REFRESH_BLOCKLIST')

    return communityBlocklist
  } catch (error) {
    console.error('[DeadNetGuard] Failed to fetch community blocklist:', error)
    // Return cached list if available
    const result = await chrome.storage.local.get('communityBlocklist') as { communityBlocklist?: BannedChannel[] }
    return result.communityBlocklist ?? []
  }
}

/**
 * Send message to all YouTube tabs
 */
async function notifyContentScripts(type: string) {
  const tabs = await chrome.tabs.query({ url: '*://www.youtube.com/*' })
  tabs.forEach((tab) => {
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, { type }).catch(() => {
        // Tab might not have content script yet
      })
    }
  })
}

/**
 * Reset daily stats at midnight
 */
function setupDailyReset() {
  // Check every hour
  chrome.alarms.create('dailyReset', { periodInMinutes: 60 })

  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'dailyReset') {
      const now = new Date()
      if (now.getHours() === 0) {
        const result = await chrome.storage.local.get('stats') as { stats?: Stats }
        const stats: Stats = result.stats ?? { ...DEFAULT_STATS }
        stats.blockedToday = 0
        await chrome.storage.local.set({ stats })
        chrome.action.setBadgeText({ text: '' })
      }
    }
  })
}

/**
 * Report channel to API
 */
async function reportChannelToAPI(youtubeId: string, channelName: string): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        youtubeId,
        channelName
      })
    })

    if (!response.ok) {
      throw new Error('Failed to report channel')
    }

    const data = await response.json()
    console.log('[DeadNetGuard] Channel reported:', data)

    return { success: true, message: data.message }
  } catch (error) {
    console.error('[DeadNetGuard] Failed to report channel:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * Setup periodic sync of community blocklist
 */
function setupPeriodicSync() {
  // Sync every hour
  chrome.alarms.create('syncCommunityList', { periodInMinutes: SYNC_INTERVAL_MINUTES })

  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'syncCommunityList') {
      console.log('[DeadNetGuard] Periodic sync triggered')
      await fetchCommunityBlocklist()
    }
  })
}

console.log('[DeadNetGuard] Background service worker loaded')
