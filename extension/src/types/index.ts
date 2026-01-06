// Channel that's been reported/banned
export interface BannedChannel {
  id: string
  youtubeId: string
  name: string
  reportCount: number
  addedAt: number
}

// Video element found on YouTube page
export interface YouTubeVideo {
  element: HTMLElement
  title: string
  channelName: string
  channelId?: string
  videoId?: string
}

// Extension settings
export interface Settings {
  enabled: boolean
  showOverlay: boolean // Show "Blocked" overlay vs completely hide
  syncEnabled: boolean
  lastSyncAt: number | null
}

// Stats for popup display
export interface Stats {
  blockedToday: number
  blockedTotal: number
  lastBlockedChannel: string | null
}

// Storage structure
export interface StorageData {
  settings: Settings
  personalBlocklist: BannedChannel[]
  communityBlocklist: BannedChannel[]
  stats: Stats
}

// Message types for communication between scripts
export type MessageType =
  | { type: 'GET_BLOCKLIST' }
  | { type: 'ADD_TO_BLOCKLIST'; channel: BannedChannel }
  | { type: 'REMOVE_FROM_BLOCKLIST'; channelId: string }
  | { type: 'UPDATE_STATS'; blocked: number }
  | { type: 'TOGGLE_EXTENSION'; enabled: boolean }
  | { type: 'GET_SETTINGS' }
  | { type: 'CONTENT_SCRIPT_READY' }

export type MessageResponse<T = unknown> = {
  success: boolean
  data?: T
  error?: string
}
