import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../index.js'
import { checkAutoBan } from './banlist.js'

const router = Router()

const reportSchema = z.object({
  youtubeId: z.string().min(1).max(100),
  channelName: z.string().min(1).max(200),
  reason: z.string().max(500).optional(),
  evidence: z.string().url().optional(),
  visitorId: z.string().min(1).max(100).optional()
})

// POST /api/report - Report a channel as AI slop
router.post('/', async (req, res) => {
  try {
    const data = reportSchema.parse(req.body)

    // Find or create channel
    let channel = await prisma.channel.findUnique({
      where: { youtubeId: data.youtubeId }
    })

    if (channel) {
      // Update existing channel
      channel = await prisma.channel.update({
        where: { id: channel.id },
        data: {
          reportCount: { increment: 1 },
          score: { increment: 1 }, // Each report adds to score
          name: data.channelName // Update name in case it changed
        }
      })
    } else {
      // Create new channel
      channel = await prisma.channel.create({
        data: {
          youtubeId: data.youtubeId,
          name: data.channelName,
          reportCount: 1,
          score: 1
        }
      })
    }

    // Create report record
    await prisma.report.create({
      data: {
        channelId: channel.id,
        userId: data.visitorId,
        reason: data.reason,
        evidence: data.evidence
      }
    })

    // Check if should be auto-banned
    await checkAutoBan(channel.id)

    // Refresh channel data
    const updatedChannel = await prisma.channel.findUnique({
      where: { id: channel.id }
    })

    res.json({
      success: true,
      channel: {
        youtubeId: updatedChannel!.youtubeId,
        name: updatedChannel!.name,
        reportCount: updatedChannel!.reportCount,
        score: updatedChannel!.score,
        isBanned: updatedChannel!.isBanned
      },
      message: updatedChannel!.isBanned
        ? 'Channel has been banned'
        : `Channel reported (${updatedChannel!.reportCount} reports, score: ${updatedChannel!.score})`
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.issues })
    }
    console.error('Error reporting channel:', error)
    res.status(500).json({ error: 'Failed to report channel' })
  }
})

export default router
