/**
 * DeadNetGuard - Content Script
 * Runs on YouTube pages to filter AI slop content
 */

import './content.css'
import type { BannedChannel, Settings } from '@/types'

// YouTube DOM Selectors
const SELECTORS = {
  // Video cards on different YouTube pages
  VIDEO_CARDS: [
    'ytd-rich-item-renderer', // Home page
    'ytd-video-renderer', // Search results
    'ytd-compact-video-renderer', // Sidebar recommendations
    'ytd-reel-item-renderer', // Shorts
    'ytd-grid-video-renderer', // Channel page grid
  ].join(', '),

  // Elements within video cards
  CHANNEL_NAME: '#channel-name a, ytd-channel-name a, #text.ytd-channel-name',
  VIDEO_TITLE: '#video-title, #video-title-link',
  THUMBNAIL: 'ytd-thumbnail, #thumbnail',
}

// State
let blockedChannels: Set<string> = new Set()
let settings: Settings = {
  enabled: true,
  showOverlay: true,
  syncEnabled: true,
  lastSyncAt: null,
}
let processedElements = new WeakSet<HTMLElement>()
let blockedCount = 0

/**
 * Initialize the content script
 */
async function init() {
  console.log('[DeadNetGuard] Initializing...')

  // Load settings and blocklist from storage
  await loadData()

  if (!settings.enabled) {
    console.log('[DeadNetGuard] Extension is disabled')
    return
  }

  // Initial scan
  scanAndFilterVideos()

  // Watch for new content (infinite scroll, navigation)
  observeDOMChanges()

  // Listen for messages from popup/background
  chrome.runtime.onMessage.addListener(handleMessage)

  // Notify background script that content script is ready
  chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY' })

  console.log('[DeadNetGuard] Ready! Blocking', blockedChannels.size, 'channels')
}

/**
 * Load blocklist and settings from storage
 */
async function loadData() {
  try {
    const result = await chrome.storage.local.get([
      'settings',
      'personalBlocklist',
      'communityBlocklist',
    ]) as {
      settings?: Settings
      personalBlocklist?: BannedChannel[]
      communityBlocklist?: BannedChannel[]
    }

    if (result.settings) {
      settings = result.settings
    }

    // Combine personal and community blocklists
    blockedChannels = new Set<string>()

    const personal = result.personalBlocklist ?? []
    const community = result.communityBlocklist ?? []

    personal.forEach((c) => blockedChannels.add(c.name.toLowerCase()))
    community.forEach((c) => blockedChannels.add(c.name.toLowerCase()))

    // Also add YouTube channel IDs if available
    personal.forEach((c) => c.youtubeId && blockedChannels.add(c.youtubeId))
    community.forEach((c) => c.youtubeId && blockedChannels.add(c.youtubeId))
  } catch (error) {
    console.error('[DeadNetGuard] Failed to load data:', error)
  }
}

/**
 * Scan page and filter blocked videos
 */
function scanAndFilterVideos() {
  if (!settings.enabled) return

  const videoCards = document.querySelectorAll<HTMLElement>(SELECTORS.VIDEO_CARDS)

  videoCards.forEach((card) => {
    if (processedElements.has(card)) return
    processedElements.add(card)

    const channelName = getChannelName(card)
    if (!channelName) return

    // Check if channel is blocked
    if (isChannelBlocked(channelName)) {
      blockVideoCard(card, channelName)
    } else {
      // Add quick block button for non-blocked videos
      addBlockButton(card, channelName)
    }
  })
}

/**
 * Extract channel name from video card
 */
function getChannelName(card: HTMLElement): string | null {
  const channelEl = card.querySelector(SELECTORS.CHANNEL_NAME)
  if (channelEl) {
    return channelEl.textContent?.trim() || null
  }
  return null
}

/**
 * Check if channel name matches blocklist
 */
function isChannelBlocked(channelName: string): boolean {
  const normalized = channelName.toLowerCase()
  return blockedChannels.has(normalized)
}

/**
 * Apply blocking UI to a video card
 */
function blockVideoCard(card: HTMLElement, channelName: string) {
  // Skip if already blocked
  if (card.classList.contains('deadnetguard-blocked')) return

  blockedCount++

  if (settings.showOverlay) {
    // Show overlay mode
    card.classList.add('deadnetguard-blocked')

    const overlay = document.createElement('div')
    overlay.className = 'deadnetguard-overlay'
    overlay.innerHTML = `
      <svg class="deadnetguard-overlay-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-2h2v2h-2zm0-4V7h2v6h-2z"/>
      </svg>
      <span class="deadnetguard-overlay-text">AI Slop Blocked</span>
      <span class="deadnetguard-overlay-subtext">${channelName}</span>
    `

    // Click overlay to unblock temporarily
    overlay.addEventListener('click', (e) => {
      e.stopPropagation()
      card.classList.remove('deadnetguard-blocked')
      overlay.remove()
    })

    const thumbnail = card.querySelector(SELECTORS.THUMBNAIL)
    if (thumbnail) {
      ;(thumbnail as HTMLElement).style.position = 'relative'
      thumbnail.appendChild(overlay)
    }
  } else {
    // Hide mode
    card.classList.add('deadnetguard-hidden')
  }

  // Update stats
  chrome.runtime.sendMessage({
    type: 'UPDATE_STATS',
    blocked: 1,
    channelName,
  })
}

/**
 * Add quick block button to video card
 */
function addBlockButton(card: HTMLElement, channelName: string) {
  // Skip if button already exists
  if (card.querySelector('.deadnetguard-block-btn')) return

  const btn = document.createElement('button')
  btn.className = 'deadnetguard-block-btn'
  btn.textContent = '🛡️ Block'
  btn.title = `Block ${channelName}`

  btn.addEventListener('click', async (e) => {
    e.preventDefault()
    e.stopPropagation()

    // Add to personal blocklist
    const channel: BannedChannel = {
      id: crypto.randomUUID(),
      youtubeId: channelName.toLowerCase().replace(/\s+/g, ''),
      name: channelName,
      reportCount: 1,
      addedAt: Date.now(),
    }

    // Save to storage
    const result = await chrome.storage.local.get('personalBlocklist') as {
      personalBlocklist?: BannedChannel[]
    }
    const personalBlocklist = result.personalBlocklist ?? []
    personalBlocklist.push(channel)
    await chrome.storage.local.set({ personalBlocklist })

    // Update local state
    blockedChannels.add(channelName.toLowerCase())

    // Apply block UI with animation
    card.classList.add('deadnetguard-removing')
    setTimeout(() => {
      blockVideoCard(card, channelName)
      card.classList.remove('deadnetguard-removing')
    }, 300)
  })

  const thumbnail = card.querySelector(SELECTORS.THUMBNAIL)
  if (thumbnail) {
    ;(thumbnail as HTMLElement).style.position = 'relative'
    thumbnail.appendChild(btn)
  }
}

/**
 * Watch for DOM changes (infinite scroll, SPA navigation)
 */
function observeDOMChanges() {
  const observer = new MutationObserver((mutations) => {
    let shouldScan = false

    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        shouldScan = true
        break
      }
    }

    if (shouldScan) {
      // Debounce scanning
      requestIdleCallback(() => scanAndFilterVideos(), { timeout: 500 })
    }
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })
}

/**
 * Handle messages from popup/background script
 */
function handleMessage(
  message: { type: string; [key: string]: unknown },
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void
) {
  switch (message.type) {
    case 'TOGGLE_EXTENSION':
      settings.enabled = message.enabled as boolean
      if (settings.enabled) {
        scanAndFilterVideos()
      } else {
        // Remove all blocks
        document.querySelectorAll('.deadnetguard-blocked').forEach((el) => {
          el.classList.remove('deadnetguard-blocked')
        })
        document.querySelectorAll('.deadnetguard-hidden').forEach((el) => {
          el.classList.remove('deadnetguard-hidden')
        })
        document.querySelectorAll('.deadnetguard-overlay').forEach((el) => {
          el.remove()
        })
      }
      sendResponse({ success: true })
      break

    case 'REFRESH_BLOCKLIST':
      loadData().then(() => {
        processedElements = new WeakSet()
        scanAndFilterVideos()
        sendResponse({ success: true, count: blockedCount })
      })
      return true // Keep channel open for async response

    case 'GET_BLOCKED_COUNT':
      sendResponse({ success: true, count: blockedCount })
      break

    default:
      sendResponse({ success: false, error: 'Unknown message type' })
  }
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
