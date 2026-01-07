export interface BlockedChannel {
  youtubeId: string
  name: string
  blockedAt: number
  source: 'local' | 'community'
}

export interface StorageData {
  blockedChannels: BlockedChannel[]
  communityBanlist: BlockedChannel[]
  communityVersion: number
  lastSync: number
  enabled: boolean
  stats: {
    blockedToday: number
    blockedTotal: number
    lastResetDate: string
  }
}

const DEFAULT_DATA: StorageData = {
  blockedChannels: [],
  communityBanlist: [],
  communityVersion: 0,
  lastSync: 0,
  enabled: true,
  stats: {
    blockedToday: 0,
    blockedTotal: 0,
    lastResetDate: new Date().toDateString()
  }
}

// Get all storage data
export async function getStorage(): Promise<StorageData> {
  const keys = Object.keys(DEFAULT_DATA)
  const data = await chrome.storage.local.get(keys)
  return { ...DEFAULT_DATA, ...data } as StorageData
}

// Save storage data
export async function setStorage(data: Partial<StorageData>): Promise<void> {
  await chrome.storage.local.set(data)
}

// Add channel to local blocklist
export async function blockChannel(youtubeId: string, name: string): Promise<void> {
  const data = await getStorage()

  // Check if already blocked
  if (data.blockedChannels.some(ch => ch.youtubeId === youtubeId)) {
    return
  }

  data.blockedChannels.push({
    youtubeId,
    name,
    blockedAt: Date.now(),
    source: 'local'
  })

  await setStorage({ blockedChannels: data.blockedChannels })
}

// Remove channel from local blocklist
export async function unblockChannel(youtubeId: string): Promise<void> {
  const data = await getStorage()
  data.blockedChannels = data.blockedChannels.filter(ch => ch.youtubeId !== youtubeId)
  await setStorage({ blockedChannels: data.blockedChannels })
}

// Check if channel is blocked (either local or community)
export async function isChannelBlocked(youtubeId: string, channelName?: string): Promise<boolean> {
  const data = await getStorage()

  // Check by YouTube ID
  const blockedById = data.blockedChannels.some(ch => ch.youtubeId === youtubeId) ||
                      data.communityBanlist.some(ch => ch.youtubeId === youtubeId)

  if (blockedById) return true

  // Also check by channel name (for cases where we don't have the ID)
  if (channelName) {
    const blockedByName = data.blockedChannels.some(ch => ch.name === channelName) ||
                          data.communityBanlist.some(ch => ch.name === channelName)
    if (blockedByName) return true
  }

  return false
}

// Get all blocked channels (combined local + community)
export async function getAllBlockedChannels(): Promise<BlockedChannel[]> {
  const data = await getStorage()
  const combined = [...data.blockedChannels]

  // Add community channels that aren't already in local
  for (const ch of data.communityBanlist) {
    if (!combined.some(c => c.youtubeId === ch.youtubeId)) {
      combined.push(ch)
    }
  }

  return combined
}

// Update community banlist
export async function updateCommunityBanlist(channels: { youtubeId: string; name: string }[], version: number): Promise<void> {
  const banlist: BlockedChannel[] = channels.map(ch => ({
    ...ch,
    blockedAt: Date.now(),
    source: 'community' as const
  }))

  await setStorage({
    communityBanlist: banlist,
    communityVersion: version,
    lastSync: Date.now()
  })
}

// Increment blocked stats
export async function incrementBlockedStats(): Promise<void> {
  const data = await getStorage()
  const today = new Date().toDateString()

  if (data.stats.lastResetDate !== today) {
    data.stats.blockedToday = 0
    data.stats.lastResetDate = today
  }

  data.stats.blockedToday++
  data.stats.blockedTotal++

  await setStorage({ stats: data.stats })
}

// Toggle extension enabled state
export async function toggleEnabled(): Promise<boolean> {
  const data = await getStorage()
  const newState = !data.enabled
  await setStorage({ enabled: newState })
  return newState
}
