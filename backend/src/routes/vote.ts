import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../index.js'
import { checkAutoBan } from './banlist.js'

const router = Router()

const voteSchema = z.object({
  channelId: z.string().min(1), // Internal channel ID
  visitorId: z.string().min(1).max(100),
  value: z.number().int().min(-1).max(1).refine(v => v !== 0, 'Vote must be 1 or -1')
})

// POST /api/vote - Vote on a reported channel
router.post('/', async (req, res) => {
  try {
    const data = voteSchema.parse(req.body)

    // Check if channel exists
    const channel = await prisma.channel.findUnique({
      where: { id: data.channelId }
    })

    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' })
    }

    // Check for existing vote
    const existingVote = await prisma.vote.findUnique({
      where: {
        channelId_visitorId: {
          channelId: data.channelId,
          visitorId: data.visitorId
        }
      }
    })

    let scoreDelta = data.value

    if (existingVote) {
      if (existingVote.value === data.value) {
        return res.status(400).json({ error: 'Already voted' })
      }

      // Changing vote: delta is 2x (remove old vote + add new)
      scoreDelta = data.value * 2

      await prisma.vote.update({
        where: { id: existingVote.id },
        data: { value: data.value }
      })
    } else {
      await prisma.vote.create({
        data: {
          channelId: data.channelId,
          visitorId: data.visitorId,
          value: data.value
        }
      })
    }

    // Update channel score
    const updatedChannel = await prisma.channel.update({
      where: { id: data.channelId },
      data: {
        score: { increment: scoreDelta }
      }
    })

    // Check if should be auto-banned
    await checkAutoBan(data.channelId)

    res.json({
      success: true,
      channel: {
        id: updatedChannel.id,
        score: updatedChannel.score,
        isBanned: updatedChannel.isBanned
      }
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.issues })
    }
    console.error('Error voting:', error)
    res.status(500).json({ error: 'Failed to vote' })
  }
})

// GET /api/vote/:channelId/:visitorId - Get user's vote for a channel
router.get('/:channelId/:visitorId', async (req, res) => {
  try {
    const { channelId, visitorId } = req.params

    const vote = await prisma.vote.findUnique({
      where: {
        channelId_visitorId: { channelId, visitorId }
      }
    })

    res.json({
      voted: !!vote,
      value: vote?.value || 0
    })
  } catch (error) {
    console.error('Error fetching vote:', error)
    res.status(500).json({ error: 'Failed to fetch vote' })
  }
})

export default router
