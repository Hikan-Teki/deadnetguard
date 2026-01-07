import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { prisma } from '../index.js'
import crypto from 'crypto'

const router = Router()

// Simple password hash (for production, use bcrypt)
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password + process.env.ADMIN_SALT || 'dng-salt-2026').digest('hex')
}

// Admin auth middleware (simple session-based)
const adminSessions = new Map<string, { username: string; expiresAt: Date }>()

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '')

  if (!token) {
    return res.status(401).json({ error: 'No token provided' })
  }

  const session = adminSessions.get(token)
  if (!session || session.expiresAt < new Date()) {
    adminSessions.delete(token)
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  next()
}

// POST /api/admin/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = z.object({
      username: z.string().min(1),
      password: z.string().min(1)
    }).parse(req.body)

    const admin = await prisma.admin.findUnique({
      where: { username }
    })

    if (!admin || admin.password !== hashPassword(password)) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    // Generate session token
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    adminSessions.set(token, { username, expiresAt })

    res.json({ token, expiresAt })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request' })
    }
    res.status(500).json({ error: 'Login failed' })
  }
})

// POST /api/admin/logout
router.post('/logout', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (token) {
    adminSessions.delete(token)
  }
  res.json({ success: true })
})

// GET /api/admin/verify - Verify token is valid
router.get('/verify', requireAdmin, (_req, res) => {
  res.json({ valid: true })
})

// POST /api/admin/ban/:channelId - Manually ban a channel
router.post('/ban/:channelId', requireAdmin, async (req, res) => {
  try {
    const channel = await prisma.channel.update({
      where: { id: req.params.channelId },
      data: { isBanned: true }
    })

    res.json({
      success: true,
      channel: {
        id: channel.id,
        youtubeId: channel.youtubeId,
        name: channel.name,
        isBanned: channel.isBanned
      }
    })
  } catch (error) {
    res.status(500).json({ error: 'Failed to ban channel' })
  }
})

// POST /api/admin/unban/:channelId - Manually unban a channel
router.post('/unban/:channelId', requireAdmin, async (req, res) => {
  try {
    const channel = await prisma.channel.update({
      where: { id: req.params.channelId },
      data: { isBanned: false }
    })

    res.json({
      success: true,
      channel: {
        id: channel.id,
        youtubeId: channel.youtubeId,
        name: channel.name,
        isBanned: channel.isBanned
      }
    })
  } catch (error) {
    res.status(500).json({ error: 'Failed to unban channel' })
  }
})

// DELETE /api/admin/channel/:channelId - Delete a channel completely
router.delete('/channel/:channelId', requireAdmin, async (req, res) => {
  try {
    await prisma.channel.delete({
      where: { id: req.params.channelId }
    })

    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete channel' })
  }
})

// GET /api/admin/channels - Get all channels (for admin panel)
router.get('/channels', requireAdmin, async (req, res) => {
  try {
    const { filter } = req.query as { filter?: string }

    const where = filter === 'banned' ? { isBanned: true } :
                  filter === 'pending' ? { isBanned: false, reportCount: { gte: 1 } } :
                  {}

    const channels = await prisma.channel.findMany({
      where,
      orderBy: [
        { isBanned: 'desc' },
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
        isBanned: ch.isBanned,
        reports: ch._count.reports,
        votes: ch._count.votes,
        createdAt: ch.createdAt,
        updatedAt: ch.updatedAt
      }))
    })
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch channels' })
  }
})

// GET /api/admin/reports/:channelId - Get reports for a channel
router.get('/reports/:channelId', requireAdmin, async (req, res) => {
  try {
    const reports = await prisma.report.findMany({
      where: { channelId: req.params.channelId },
      orderBy: { createdAt: 'desc' }
    })

    res.json({ reports })
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch reports' })
  }
})

// POST /api/admin/setup - Create initial admin (only works if no admins exist)
router.post('/setup', async (req, res) => {
  try {
    const adminCount = await prisma.admin.count()

    if (adminCount > 0) {
      return res.status(400).json({ error: 'Admin already exists' })
    }

    const { username, password } = z.object({
      username: z.string().min(3),
      password: z.string().min(8)
    }).parse(req.body)

    await prisma.admin.create({
      data: {
        username,
        password: hashPassword(password)
      }
    })

    res.json({ success: true, message: 'Admin created' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.issues })
    }
    res.status(500).json({ error: 'Setup failed' })
  }
})

export default router
