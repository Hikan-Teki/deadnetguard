import { create } from 'zustand'
import type { Settings, Stats, BannedChannel } from '@/types'

interface ExtensionState {
  // State
  settings: Settings
  personalBlocklist: BannedChannel[]
  communityBlocklist: BannedChannel[]
  stats: Stats
  isLoading: boolean

  // Actions
  setSettings: (settings: Partial<Settings>) => void
  toggleExtension: () => void
  addToBlocklist: (channel: BannedChannel) => void
  removeFromBlocklist: (channelId: string) => void
  setCommunityBlocklist: (list: BannedChannel[]) => void
  updateStats: (stats: Partial<Stats>) => void
  incrementBlocked: (channelName: string) => void
  loadFromStorage: () => Promise<void>
  saveToStorage: () => Promise<void>
}

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

export const useExtensionStore = create<ExtensionState>((set, get) => ({
  // Initial state
  settings: DEFAULT_SETTINGS,
  personalBlocklist: [],
  communityBlocklist: [],
  stats: DEFAULT_STATS,
  isLoading: true,

  // Actions
  setSettings: (newSettings) => {
    set((state) => ({
      settings: { ...state.settings, ...newSettings },
    }))
    get().saveToStorage()
  },

  toggleExtension: () => {
    set((state) => ({
      settings: { ...state.settings, enabled: !state.settings.enabled },
    }))
    get().saveToStorage()
  },

  addToBlocklist: (channel) => {
    set((state) => ({
      personalBlocklist: [...state.personalBlocklist, channel],
    }))
    get().saveToStorage()
  },

  removeFromBlocklist: (channelId) => {
    set((state) => ({
      personalBlocklist: state.personalBlocklist.filter(
        (c) => c.youtubeId !== channelId
      ),
    }))
    get().saveToStorage()
  },

  setCommunityBlocklist: (list) => {
    set({ communityBlocklist: list })
    get().saveToStorage()
  },

  updateStats: (newStats) => {
    set((state) => ({
      stats: { ...state.stats, ...newStats },
    }))
    get().saveToStorage()
  },

  incrementBlocked: (channelName) => {
    set((state) => ({
      stats: {
        ...state.stats,
        blockedToday: state.stats.blockedToday + 1,
        blockedTotal: state.stats.blockedTotal + 1,
        lastBlockedChannel: channelName,
      },
    }))
    get().saveToStorage()
  },

  loadFromStorage: async () => {
    try {
      const result = await chrome.storage.local.get([
        'settings',
        'personalBlocklist',
        'communityBlocklist',
        'stats',
      ]) as {
        settings?: Settings
        personalBlocklist?: BannedChannel[]
        communityBlocklist?: BannedChannel[]
        stats?: Stats
      }

      set({
        settings: result.settings ?? DEFAULT_SETTINGS,
        personalBlocklist: result.personalBlocklist ?? [],
        communityBlocklist: result.communityBlocklist ?? [],
        stats: result.stats ?? DEFAULT_STATS,
        isLoading: false,
      })
    } catch (error) {
      console.error('Failed to load from storage:', error)
      set({ isLoading: false })
    }
  },

  saveToStorage: async () => {
    const { settings, personalBlocklist, communityBlocklist, stats } = get()
    try {
      await chrome.storage.local.set({
        settings,
        personalBlocklist,
        communityBlocklist,
        stats,
      })
    } catch (error) {
      console.error('Failed to save to storage:', error)
    }
  },
}))

// Helper to get combined blocklist
export const getBlockedChannelIds = (state: ExtensionState): Set<string> => {
  const ids = new Set<string>()
  state.personalBlocklist.forEach((c) => ids.add(c.youtubeId))
  state.communityBlocklist.forEach((c) => ids.add(c.youtubeId))
  return ids
}
