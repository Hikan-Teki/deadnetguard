import { Router } from 'express'
import { prisma } from '../index.js'

const router = Router()

// GET /api/stats - Public statistics
router.get('/', async (_req, res) => {
  try {
    const [
      totalChannels,
      bannedChannels,
      totalReports,
      totalVotes,
      recentBans
    ] = await Promise.all([
      prisma.channel.count(),
      prisma.channel.count({ where: { isBanned: true } }),
      prisma.report.count(),
      prisma.vote.count(),
      prisma.channel.findMany({
        where: { isBanned: true },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: { name: true, updatedAt: true }
      })
    ])

    res.json({
      totalChannels,
      bannedChannels,
      pendingChannels: totalChannels - bannedChannels,
      totalReports,
      totalVotes,
      recentBans: recentBans.map(ch => ({
        name: ch.name,
        bannedAt: ch.updatedAt
      }))
    })
  } catch (error) {
    console.error('Error fetching stats:', error)
    res.status(500).json({ error: 'Failed to fetch stats' })
  }
})

export default router
