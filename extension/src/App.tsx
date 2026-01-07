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

type Tab = 'stats' | 'blocklist' | 'settings'

function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [stats, setStats] = useState<Stats>(DEFAULT_STATS)
  const [personalBlocklist, setPersonalBlocklist] = useState<BannedChannel[]>([])
  const [communityBlocklist, setCommunityBlocklist] = useState<BannedChannel[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('stats')
  const [syncing, setSyncing] = useState(false)

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
      setPersonalBlocklist(result.personalBlocklist ?? [])
      setCommunityBlocklist(result.communityBlocklist ?? [])
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

  async function removeFromBlocklist(channelId: string) {
    const updated = personalBlocklist.filter(c => c.youtubeId !== channelId)
    setPersonalBlocklist(updated)
    await chrome.storage.local.set({ personalBlocklist: updated })

    // Notify content scripts
    const tabs = await chrome.tabs.query({ url: '*://www.youtube.com/*' })
    tabs.forEach((tab) => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'REFRESH_BLOCKLIST' })
      }
    })
  }

  async function syncCommunityList() {
    setSyncing(true)
    try {
      const response = await chrome.runtime.sendMessage({ type: 'SYNC_COMMUNITY_LIST' })
      if (response.success) {
        await loadData()
      }
    } catch (error) {
      console.error('Sync failed:', error)
    } finally {
      setSyncing(false)
    }
  }

  async function clearAllBlocked() {
    if (!confirm('Are you sure? This will clear your entire personal blocklist.')) return
    setPersonalBlocklist([])
    await chrome.storage.local.set({ personalBlocklist: [] })

    const tabs = await chrome.tabs.query({ url: '*://www.youtube.com/*' })
    tabs.forEach((tab) => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'REFRESH_BLOCKLIST' })
      }
    })
  }

  if (isLoading) {
    return (
      <div className="dng-popup">
        <div className="dng-loading">
          <span className="dng-glitch">LOADING...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="dng-popup">
      {/* Header */}
      <header className="dng-header">
        <div className="dng-logo">
          <img src="/icons/icon48.png" alt="DNG" />
          <div className="dng-title">
            <h1>DEAD<span>NET</span>GUARD</h1>
            <p>// AI SLOP DESTROYER</p>
          </div>
        </div>
        <button
          className={`dng-power ${settings.enabled ? 'active' : ''}`}
          onClick={toggleExtension}
          title={settings.enabled ? 'DEACTIVATE' : 'ACTIVATE'}
        >
          {settings.enabled ? 'ON' : 'OFF'}
        </button>
      </header>

      {/* Kill Count */}
      <div className="dng-killcount">
        <div className="dng-stat main">
          <span className="value">{stats.blockedToday}</span>
          <span className="label">KILLED TODAY</span>
        </div>
        <div className="dng-stat">
          <span className="value">{stats.blockedTotal}</span>
          <span className="label">TOTAL KILLS</span>
        </div>
        <div className="dng-stat">
          <span className="value">{personalBlocklist.length + communityBlocklist.length}</span>
          <span className="label">TARGETS</span>
        </div>
      </div>

      {/* Tabs */}
      <nav className="dng-tabs">
        <button
          className={activeTab === 'stats' ? 'active' : ''}
          onClick={() => setActiveTab('stats')}
        >
          STATUS
        </button>
        <button
          className={activeTab === 'blocklist' ? 'active' : ''}
          onClick={() => setActiveTab('blocklist')}
        >
          BLOCKLIST
        </button>
        <button
          className={activeTab === 'settings' ? 'active' : ''}
          onClick={() => setActiveTab('settings')}
        >
          CONFIG
        </button>
      </nav>

      {/* Content */}
      <div className="dng-content">
        {activeTab === 'stats' && (
          <div className="dng-stats-tab">
            {stats.lastBlockedChannel && (
              <div className="dng-last-kill">
                <span className="label">&gt; LAST KILL:</span>
                <span className="channel">{stats.lastBlockedChannel}</span>
              </div>
            )}
            <div className="dng-mission">
              <p>THE DEAD INTERNET IS REAL.</p>
              <p>AI SLOP IS POLLUTION.</p>
              <p className="highlight">WE ARE THE CLEANUP CREW.</p>
            </div>
            <button className="dng-btn sync" onClick={syncCommunityList} disabled={syncing}>
              {syncing ? 'SYNCING...' : 'SYNC COMMUNITY LIST'}
            </button>
          </div>
        )}

        {activeTab === 'blocklist' && (
          <div className="dng-blocklist-tab">
            <div className="dng-blocklist-header">
              <span>YOUR KILLS ({personalBlocklist.length})</span>
              {personalBlocklist.length > 0 && (
                <button className="dng-clear" onClick={clearAllBlocked}>CLEAR ALL</button>
              )}
            </div>
            <div className="dng-blocklist">
              {personalBlocklist.length === 0 ? (
                <div className="dng-empty">
                  <p>NO PERSONAL KILLS YET</p>
                  <p className="sub">Go to YouTube and start blocking AI slop</p>
                </div>
              ) : (
                personalBlocklist.map((channel) => (
                  <div key={channel.youtubeId} className="dng-channel">
                    <span className="name">{channel.name}</span>
                    <button
                      className="remove"
                      onClick={() => removeFromBlocklist(channel.youtubeId)}
                      title="Unblock"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="dng-community-count">
              <span>+ {communityBlocklist.length} COMMUNITY TARGETS</span>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="dng-settings-tab">
            <div className="dng-setting">
              <div className="info">
                <span className="name">OVERLAY MODE</span>
                <span className="desc">Show "BLOCKED" overlay vs hide completely</span>
              </div>
              <button
                className={`toggle ${settings.showOverlay ? 'on' : ''}`}
                onClick={async () => {
                  const newSettings = { ...settings, showOverlay: !settings.showOverlay }
                  setSettings(newSettings)
                  await chrome.storage.local.set({ settings: newSettings })
                }}
              >
                {settings.showOverlay ? 'ON' : 'OFF'}
              </button>
            </div>
            <div className="dng-setting">
              <div className="info">
                <span className="name">AUTO-SYNC</span>
                <span className="desc">Sync community blocklist hourly</span>
              </div>
              <button
                className={`toggle ${settings.syncEnabled ? 'on' : ''}`}
                onClick={async () => {
                  const newSettings = { ...settings, syncEnabled: !settings.syncEnabled }
                  setSettings(newSettings)
                  await chrome.storage.local.set({ settings: newSettings })
                }}
              >
                {settings.syncEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="dng-footer">
        <span>v1.0.0</span>
        <a href="https://deadnetguard.com" target="_blank" rel="noopener noreferrer">
          deadnetguard.com
        </a>
        <a href="https://github.com/Hikan-Teki/deadnetguard" target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
      </footer>

      {/* Status bar */}
      <div className={`dng-status-bar ${settings.enabled ? 'active' : 'inactive'}`}>
        {settings.enabled ? '// PROTECTION ACTIVE' : '// PROTECTION DISABLED'}
      </div>
    </div>
  )
}

export default App
