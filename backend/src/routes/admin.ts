import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { prisma } from '../index.js'
import bcrypt from 'bcrypt'
import crypto from 'crypto'

const router = Router()

// Bcrypt cost factor (10-12 recommended for production)
const BCRYPT_ROUNDS = 12

// Hash password with bcrypt
async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

// Verify password with bcrypt
async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

// Admin auth middleware - uses database sessions
async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '')

  if (!token) {
    return res.status(401).json({ error: 'No token provided' })
  }

  try {
    const session = await prisma.adminSession.findUnique({
      where: { token }
    })

    if (!session || session.expiresAt < new Date()) {
      // Clean up expired session
      if (session) {
        await prisma.adminSession.delete({ where: { id: session.id } })
      }
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    // Attach admin info to request
    ;(req as any).adminUsername = session.username
    next()
  } catch (error) {
    return res.status(401).json({ error: 'Session verification failed' })
  }
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

    if (!admin) {
      // Use same error message to prevent username enumeration
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const isValid = await verifyPassword(password, admin.password)
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    // Generate secure session token
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    // Store session in database
    await prisma.adminSession.create({
      data: {
        token,
        username,
        expiresAt
      }
    })

    // Clean up old expired sessions periodically
    await prisma.adminSession.deleteMany({
      where: { expiresAt: { lt: new Date() } }
    })

    res.json({ token, expiresAt })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request' })
    }
    console.error('Login error:', error)
    res.status(500).json({ error: 'Login failed' })
  }
})

// POST /api/admin/logout
router.post('/logout', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (token) {
    try {
      await prisma.adminSession.delete({ where: { token } })
    } catch {
      // Session might not exist, ignore
    }
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
// Protected with transaction to prevent race condition
router.post('/setup', async (req, res) => {
  try {
    const { username, password } = z.object({
      username: z.string().min(3).max(50),
      password: z.string().min(8).max(100)
    }).parse(req.body)

    // Use transaction with serializable isolation to prevent race condition
    const result = await prisma.$transaction(async (tx) => {
      const adminCount = await tx.admin.count()

      if (adminCount > 0) {
        throw new Error('ADMIN_EXISTS')
      }

      const hashedPassword = await hashPassword(password)

      return tx.admin.create({
        data: {
          username,
          password: hashedPassword
        }
      })
    })

    res.json({ success: true, message: 'Admin created' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request' })
    }
    if ((error as Error).message === 'ADMIN_EXISTS') {
      return res.status(400).json({ error: 'Admin already exists' })
    }
    console.error('Setup error:', error)
    res.status(500).json({ error: 'Setup failed' })
  }
})

// POST /api/admin/change-password - Change admin password
router.post('/change-password', requireAdmin, async (req, res) => {
  try {
    const { currentPassword, newPassword } = z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8).max(100)
    }).parse(req.body)

    const username = (req as any).adminUsername
    const admin = await prisma.admin.findUnique({ where: { username } })

    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' })
    }

    const isValid = await verifyPassword(currentPassword, admin.password)
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' })
    }

    const hashedPassword = await hashPassword(newPassword)
    await prisma.admin.update({
      where: { username },
      data: { password: hashedPassword }
    })

    // Invalidate all sessions for this admin
    await prisma.adminSession.deleteMany({ where: { username } })

    res.json({ success: true, message: 'Password changed. Please login again.' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request' })
    }
    res.status(500).json({ error: 'Failed to change password' })
  }
})

export default router
