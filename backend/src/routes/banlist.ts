import { Router } from 'express'
import { prisma } from '../index.js'

const router = Router()

// Threshold for community ban (requires this many reports with positive score)
const BAN_THRESHOLD_REPORTS = 5
const BAN_THRESHOLD_SCORE = 3

// GET /api/banlist - Get all banned channels
router.get('/', async (_req, res) => {
  try {
    const channels = await prisma.channel.findMany({
      where: { isBanned: true },
      select: {
        youtubeId: true,
        name: true
      }
    })

    res.json({
      version: Date.now(),
      count: channels.length,
      channels
    })
  } catch (error) {
    console.error('Error fetching banlist:', error)
    res.status(500).json({ error: 'Failed to fetch banlist' })
  }
})

// GET /api/banlist/version - Check if banlist has been updated
router.get('/version', async (_req, res) => {
  try {
    const latest = await prisma.channel.findFirst({
      where: { isBanned: true },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true }
    })

    res.json({
      version: latest?.updatedAt?.getTime() || 0
    })
  } catch (error) {
    console.error('Error fetching version:', error)
    res.status(500).json({ error: 'Failed to fetch version' })
  }
})

// GET /api/banlist/pending - Get channels pending review (for admin)
router.get('/pending', async (_req, res) => {
  try {
    const channels = await prisma.channel.findMany({
      where: {
        isBanned: false,
        reportCount: { gte: 1 }
      },
      orderBy: [
        { score: 'desc' },
        { reportCount: 'desc' }
      ],
      include: {
        _count: {
          select: { reports: true, votes: true }
        }
      }
    })

    res.json({
      count: channels.length,
      channels: channels.map(ch => ({
        id: ch.id,
        youtubeId: ch.youtubeId,
        name: ch.name,
        reportCount: ch.reportCount,
        score: ch.score,
        reports: ch._count.reports,
        votes: ch._count.votes,
        createdAt: ch.createdAt
      }))
    })
  } catch (error) {
    console.error('Error fetching pending:', error)
    res.status(500).json({ error: 'Failed to fetch pending channels' })
  }
})

// Internal: Check if channel should be auto-banned
export async function checkAutoBan(channelId: string) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId }
  })

  if (!channel) return

  // Auto-ban if meets threshold
  if (channel.reportCount >= BAN_THRESHOLD_REPORTS && channel.score >= BAN_THRESHOLD_SCORE) {
    await prisma.channel.update({
      where: { id: channelId },
      data: { isBanned: true }
    })
    console.log(`Channel ${channel.name} auto-banned (reports: ${channel.reportCount}, score: ${channel.score})`)
  }
}

export default router
