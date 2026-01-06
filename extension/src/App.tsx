import { useEffect, useState } from 'react'
import type { Settings, Stats, BannedChannel } from '@/types'

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

function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [stats, setStats] = useState<Stats>(DEFAULT_STATS)
  const [blocklistCount, setBlocklistCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  // Load data on mount
  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const result = await chrome.storage.local.get([
        'settings',
        'stats',
        'personalBlocklist',
        'communityBlocklist',
      ]) as {
        settings?: Settings
        stats?: Stats
        personalBlocklist?: BannedChannel[]
        communityBlocklist?: BannedChannel[]
      }

      setSettings(result.settings ?? DEFAULT_SETTINGS)
      setStats(result.stats ?? DEFAULT_STATS)

      const personal = result.personalBlocklist ?? []
      const community = result.communityBlocklist ?? []
      setBlocklistCount(personal.length + community.length)
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  async function toggleExtension() {
    const newEnabled = !settings.enabled
    const newSettings = { ...settings, enabled: newEnabled }

    setSettings(newSettings)
    await chrome.storage.local.set({ settings: newSettings })

    // Notify content scripts
    const tabs = await chrome.tabs.query({ url: '*://www.youtube.com/*' })
    tabs.forEach((tab) => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'TOGGLE_EXTENSION',
          enabled: newEnabled,
        })
      }
    })
  }

  async function toggleOverlay() {
    const newSettings = { ...settings, showOverlay: !settings.showOverlay }
    setSettings(newSettings)
    await chrome.storage.local.set({ settings: newSettings })
  }

  if (isLoading) {
    return (
      <div className="w-80 p-4 bg-gray-900 text-white flex items-center justify-center">
        <div className="animate-pulse">Loading...</div>
      </div>
    )
  }

  return (
    <div className="w-80 bg-gray-900 text-white">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
              <svg
                className="w-5 h-5"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-2h2v2h-2zm0-4V7h2v6h-2z" />
              </svg>
            </div>
            <div>
              <h1 className="font-bold text-lg">DeadNetGuard</h1>
              <p className="text-xs text-gray-400">AI Slop Blocker</p>
            </div>
          </div>

          {/* Power toggle */}
          <button
            onClick={toggleExtension}
            className={`w-12 h-6 rounded-full transition-colors ${
              settings.enabled ? 'bg-green-500' : 'bg-gray-600'
            }`}
          >
            <div
              className={`w-5 h-5 bg-white rounded-full transition-transform ${
                settings.enabled ? 'translate-x-6' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="p-4 grid grid-cols-3 gap-3 border-b border-gray-700">
        <div className="text-center">
          <div className="text-2xl font-bold text-red-400">
            {stats.blockedToday}
          </div>
          <div className="text-xs text-gray-400">Blocked Today</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-orange-400">
            {stats.blockedTotal}
          </div>
          <div className="text-xs text-gray-400">Total Blocked</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-400">
            {blocklistCount}
          </div>
          <div className="text-xs text-gray-400">In Blocklist</div>
        </div>
      </div>

      {/* Last blocked */}
      {stats.lastBlockedChannel && (
        <div className="px-4 py-3 border-b border-gray-700 bg-gray-800/50">
          <div className="text-xs text-gray-400 mb-1">Last blocked:</div>
          <div className="text-sm font-medium truncate">
            {stats.lastBlockedChannel}
          </div>
        </div>
      )}

      {/* Settings */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Show overlay</div>
            <div className="text-xs text-gray-400">
              Show "Blocked" vs completely hide
            </div>
          </div>
          <button
            onClick={toggleOverlay}
            className={`w-10 h-5 rounded-full transition-colors ${
              settings.showOverlay ? 'bg-blue-500' : 'bg-gray-600'
            }`}
          >
            <div
              className={`w-4 h-4 bg-white rounded-full transition-transform ${
                settings.showOverlay ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-700 bg-gray-800/30">
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>v1.0.0</span>
          <a
            href="https://github.com/deadnetguard"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors"
          >
            GitHub
          </a>
        </div>
      </div>

      {/* Status indicator */}
      <div
        className={`h-1 ${settings.enabled ? 'bg-green-500' : 'bg-gray-600'}`}
      />
    </div>
  )
}

export default App
