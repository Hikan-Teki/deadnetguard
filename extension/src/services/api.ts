const API_URL = 'https://api.deadnetguard.com'

export interface Channel {
  youtubeId: string
  name: string
}

export interface BanlistResponse {
  version: number
  count: number
  channels: Channel[]
}

export interface ReportResponse {
  success: boolean
  channel: {
    youtubeId: string
    name: string
    reportCount: number
    score: number
    isBanned: boolean
  }
  message: string
}

export interface StatsResponse {
  totalChannels: number
  bannedChannels: number
  pendingChannels: number
  totalReports: number
  totalVotes: number
}

// Get community banlist
export async function fetchBanlist(): Promise<BanlistResponse> {
  const res = await fetch(`${API_URL}/api/banlist`)
  if (!res.ok) throw new Error('Failed to fetch banlist')
  return res.json()
}

// Get banlist version (for checking updates)
export async function fetchBanlistVersion(): Promise<number> {
  const res = await fetch(`${API_URL}/api/banlist/version`)
  if (!res.ok) throw new Error('Failed to fetch version')
  const data = await res.json()
  return data.version
}

// Report a channel as AI slop
export async function reportChannel(youtubeId: string, channelName: string, reason?: string): Promise<ReportResponse> {
  const res = await fetch(`${API_URL}/api/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      youtubeId,
      channelName,
      reason,
      visitorId: await getVisitorId()
    })
  })
  if (!res.ok) throw new Error('Failed to report channel')
  return res.json()
}

// Vote on a channel (1 = AI slop, -1 = not AI slop)
export async function voteChannel(channelId: string, value: 1 | -1): Promise<void> {
  const res = await fetch(`${API_URL}/api/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channelId,
      visitorId: await getVisitorId(),
      value
    })
  })
  if (!res.ok) throw new Error('Failed to vote')
}

// Get stats
export async function fetchStats(): Promise<StatsResponse> {
  const res = await fetch(`${API_URL}/api/stats`)
  if (!res.ok) throw new Error('Failed to fetch stats')
  return res.json()
}

// Generate a persistent visitor ID for voting (anonymous)
async function getVisitorId(): Promise<string> {
  const stored = await chrome.storage.local.get('visitorId') as { visitorId?: string }
  if (stored.visitorId) return stored.visitorId

  const id = crypto.randomUUID()
  await chrome.storage.local.set({ visitorId: id })
  return id
}
