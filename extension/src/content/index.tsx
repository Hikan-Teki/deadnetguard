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
    'ytd-reel-item-renderer', // Shorts shelf on homepage
    'ytd-grid-video-renderer', // Channel page grid
  ].join(', '),

  // Shorts player page (vertical scroll)
  SHORTS_PLAYER: 'ytd-reel-video-renderer',

  // Elements within video cards - Updated for 2024+ YouTube
  CHANNEL_NAME: 'ytd-channel-name #text, ytd-channel-name yt-formatted-string, #channel-name #text, #channel-name a, a.yt-simple-endpoint[href*="/@"]',
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
 * Check if current page is YouTube Shorts player
 */
function isOnShortsPage(): boolean {
  return window.location.pathname.startsWith('/shorts/')
}

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

  // Also scan Shorts if on Shorts page
  if (isOnShortsPage()) {
    scanAndFilterShorts()
  }

  // Watch for new content (infinite scroll, navigation)
  observeDOMChanges()

  // Watch for URL changes (SPA navigation to/from Shorts)
  observeUrlChanges()

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
 * Scan and filter Shorts on Shorts player page
 */
function scanAndFilterShorts() {
  if (!settings.enabled || !isOnShortsPage()) return

  // Find all Shorts video renderers
  const shortsVideos = document.querySelectorAll<HTMLElement>(SELECTORS.SHORTS_PLAYER)

  shortsVideos.forEach((shortVideo) => {
    if (processedElements.has(shortVideo)) return
    processedElements.add(shortVideo)

    const channelName = getShortsChannelName(shortVideo)
    if (!channelName) return

    if (isChannelBlocked(channelName)) {
      blockShort(shortVideo, channelName)
    } else {
      addShortsBlockButton(shortVideo, channelName)
    }
  })
}

/**
 * Extract channel name from Shorts player
 */
function getShortsChannelName(shortVideo: HTMLElement): string | null {
  // Shorts-specific selectors - try from most specific to least
  const selectors = [
    // New Shorts UI (2024+) - exact class from user testing
    'a.yt-core-attributed-string__link--call-to-action-color',
    'a.yt-core-attributed-string__link[href*="/@"]',
    '.yt-core-attributed-string a[href*="/@"]',
    // Shorts player channel name selectors
    'ytd-channel-name #text',
    'ytd-channel-name yt-formatted-string a',
    'ytd-channel-name yt-formatted-string',
    '#channel-name yt-formatted-string',
    '#channel-name a',
    '.ytd-reel-player-overlay-renderer #text',
    'a.yt-simple-endpoint[href*="/@"]',
    // Shorts overlay info
    '#overlay yt-formatted-string a',
    '.reel-player-overlay-actions a[href*="/@"]',
    'yt-reel-channel-bar-view-model a',
  ]

  for (const selector of selectors) {
    const el = shortVideo.querySelector(selector)
    let text = el?.textContent?.trim()
    if (text && text.length > 0 && text.length < 100) {
      // Remove @ prefix if present
      if (text.startsWith('@')) {
        text = text.substring(1)
      }
      // Skip common non-channel text
      if (!text.match(/^\d+[KMB]?$/) && !text.includes('Subscribe') && !text.includes('Abone')) {
        return text
      }
    }
  }

  return null
}

/**
 * Block a Short - auto skip to next
 */
function blockShort(_shortVideo: HTMLElement, channelName: string) {
  blockedCount++

  // Show brief notification
  showShortsBlockedToast(channelName)

  // Auto-skip to next Short
  setTimeout(() => {
    skipToNextShort()
  }, 300)

  chrome.runtime.sendMessage({
    type: 'UPDATE_STATS',
    blocked: 1,
    channelName,
  })
}

/**
 * Skip to next Short using various methods
 */
function skipToNextShort() {
  // Method 1: Click YouTube's down/next navigation button
  const navButtons = [
    document.querySelector('#navigation-button-down button'),
    document.querySelector('[aria-label*="Next"]'),
    document.querySelector('[aria-label*="Sonraki"]'),
    document.querySelector('ytd-shorts [id*="down"] button'),
  ]

  for (const btn of navButtons) {
    if (btn) {
      (btn as HTMLElement).click()
      return
    }
  }

  // Method 2: Simulate Down Arrow key press
  const event = new KeyboardEvent('keydown', {
    key: 'ArrowDown',
    code: 'ArrowDown',
    keyCode: 40,
    which: 40,
    bubbles: true,
  })
  document.dispatchEvent(event)

  // Method 3: Try scrolling the shorts container
  setTimeout(() => {
    const containers = [
      document.querySelector('ytd-shorts'),
      document.querySelector('#shorts-container'),
      document.querySelector('ytd-reel-video-renderer')?.parentElement,
    ]

    for (const container of containers) {
      if (container) {
        container.scrollBy({ top: window.innerHeight, behavior: 'smooth' })
      }
    }
  }, 100)
}

/**
 * Show a brief toast notification when Short is blocked
 */
function showShortsBlockedToast(channelName: string) {
  // Remove existing toast
  document.querySelector('.deadnetguard-shorts-toast')?.remove()

  const toast = document.createElement('div')
  toast.className = 'deadnetguard-shorts-toast'
  toast.innerHTML = `🛡️ Blocked: ${channelName}`

  document.body.appendChild(toast)

  // Auto remove after 2 seconds
  setTimeout(() => toast.remove(), 2000)
}

/**
 * Add block button to Shorts - positioned in the right action bar
 */
function addShortsBlockButton(shortVideo: HTMLElement, _initialChannelName: string) {
  if (shortVideo.querySelector('.deadnetguard-shorts-block-btn')) return

  const btn = document.createElement('button')
  btn.className = 'deadnetguard-shorts-block-btn'
  btn.innerHTML = '🛡️'
  btn.title = 'Block this channel'

  btn.addEventListener('click', async (e) => {
    e.preventDefault()
    e.stopPropagation()

    // Get CURRENT channel name (not the one from when button was created)
    const currentChannelName = getShortsChannelName(shortVideo)
    if (!currentChannelName) {
      console.log('[DeadNetGuard] Could not find current channel name')
      return
    }

    const youtubeId = currentChannelName.toLowerCase().replace(/\s+/g, '')

    const channel: BannedChannel = {
      id: crypto.randomUUID(),
      youtubeId,
      name: currentChannelName,
      reportCount: 1,
      addedAt: Date.now(),
    }

    const result = await chrome.storage.local.get('personalBlocklist') as {
      personalBlocklist?: BannedChannel[]
    }
    const personalBlocklist = result.personalBlocklist ?? []
    personalBlocklist.push(channel)
    await chrome.storage.local.set({ personalBlocklist })

    blockedChannels.add(currentChannelName.toLowerCase())
    blockShort(shortVideo, currentChannelName)

    // Also report to API for community blocklist
    chrome.runtime.sendMessage({
      type: 'REPORT_CHANNEL',
      youtubeId,
      channelName: currentChannelName
    })
  })

  // Find the right-side action buttons (like, dislike, comment, share)
  const actionSelectors = [
    '#actions ytd-reel-player-overlay-renderer',
    '#actions',
    'ytd-reel-player-overlay-renderer #actions',
    '[id="actions"]',
    'ytd-shorts-player-controls',
  ]

  let actionsContainer: HTMLElement | null = null
  for (const selector of actionSelectors) {
    const el = shortVideo.querySelector(selector) as HTMLElement
    if (el) {
      actionsContainer = el
      break
    }
  }

  if (actionsContainer) {
    // Insert at the top of actions (before like button)
    actionsContainer.insertBefore(btn, actionsContainer.firstChild)
  } else {
    // Fallback: position fixed on right side
    shortVideo.style.position = 'relative'
    shortVideo.appendChild(btn)
  }
}

/**
 * Watch for URL changes (YouTube is SPA)
 */
function observeUrlChanges() {
  let lastUrl = window.location.href

  // Check URL periodically (pushState doesn't trigger events reliably)
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href

      // Reset processed elements on navigation
      processedElements = new WeakSet()

      // Re-scan after navigation with delay for content to load
      setTimeout(() => {
        if (isOnShortsPage()) {
          scanAndFilterShorts()
          // Scan again after more time for async content
          setTimeout(() => scanAndFilterShorts(), 1000)
        } else {
          scanAndFilterVideos()
        }
      }, 500)
    }
  }, 500)
}

/**
 * Extract channel name from video card
 */
function getChannelName(card: HTMLElement): string | null {
  // Try multiple selectors - Updated for 2024+ YouTube with yt-lockup-view-model
  const selectors = [
    // New YouTube structure (2024+)
    'a.yt-core-attributed-string__link',
    '.yt-content-metadata-view-model__metadata-text',
    '.yt-content-metadata-view-model__metadata-row a',
    // Legacy selectors
    'ytd-channel-name #text',
    'ytd-channel-name yt-formatted-string',
    '#channel-name #text',
    '#channel-name a',
    'a.yt-simple-endpoint[href*="/@"]',
  ]

  for (const selector of selectors) {
    const el = card.querySelector(selector)
    const text = el?.textContent?.trim()
    if (text && text.length > 0 && text.length < 100) {
      // Skip if it looks like a video title or view count
      if (!text.includes('görüntüleme') && !text.includes('views') && !text.match(/^\d+:\d+$/)) {
        return text
      }
    }
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

    const youtubeId = channelName.toLowerCase().replace(/\s+/g, '')

    // Add to personal blocklist
    const channel: BannedChannel = {
      id: crypto.randomUUID(),
      youtubeId,
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

    // Also report to API for community blocklist
    chrome.runtime.sendMessage({
      type: 'REPORT_CHANNEL',
      youtubeId,
      channelName
    })
  })

  // Try multiple selectors to find the thumbnail container
  const thumbnailSelectors = [
    'ytd-thumbnail',
    '#thumbnail',
    'a#thumbnail',
    '.ytd-thumbnail',
    'yt-thumbnail-view-model',
    '[class*="thumbnail"]',
  ]

  let thumbnailContainer: HTMLElement | null = null
  for (const selector of thumbnailSelectors) {
    const el = card.querySelector(selector) as HTMLElement
    if (el) {
      thumbnailContainer = el
      break
    }
  }

  if (thumbnailContainer) {
    thumbnailContainer.style.position = 'relative'
    thumbnailContainer.appendChild(btn)
  } else {
    // Fallback: add to card itself
    card.style.position = 'relative'
    card.appendChild(btn)
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
      requestIdleCallback(() => {
        scanAndFilterVideos()
        if (isOnShortsPage()) {
          scanAndFilterShorts()
        }
      }, { timeout: 500 })
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
