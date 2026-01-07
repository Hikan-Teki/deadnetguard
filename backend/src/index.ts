import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { PrismaClient } from '@prisma/client'
import banlistRoutes from './routes/banlist.js'
import reportRoutes from './routes/report.js'
import voteRoutes from './routes/vote.js'
import adminRoutes from './routes/admin.js'
import statsRoutes from './routes/stats.js'

const app = express()
const PORT = process.env.PORT || 3001

// Trust proxy for rate limiting behind nginx
app.set('trust proxy', 1)

export const prisma = new PrismaClient()

// Allowed extension ID (set via env or leave empty to allow all extensions during dev)
const ALLOWED_EXTENSION_ID = process.env.EXTENSION_ID || ''

// Rate limiters - skip validation since we're behind nginx proxy
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false }
})

const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 requests per window (for report/vote)
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false }
})

const loginLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 login attempts per hour
  message: { error: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false }
})

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Needed for extension compatibility
}))

// CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true)

    // Allow chrome extensions
    if (origin.startsWith('chrome-extension://')) {
      // If EXTENSION_ID is set, only allow that specific extension
      if (ALLOWED_EXTENSION_ID) {
        const extensionId = origin.replace('chrome-extension://', '')
        if (extensionId === ALLOWED_EXTENSION_ID) {
          return callback(null, true)
        }
        return callback(new Error('Extension not allowed'))
      }
      // In development, allow all extensions
      return callback(null, true)
    }

    // Allow specific domains
    const allowedOrigins = [
      'https://deadnetguard.com',
      'https://www.deadnetguard.com',
      'https://api.deadnetguard.com',
    ]

    // Allow localhost in development
    if (process.env.NODE_ENV !== 'production') {
      allowedOrigins.push('http://localhost:5173', 'http://localhost:3000', 'http://localhost:3001')
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true)
    }

    callback(new Error('Not allowed by CORS'))
  },
  credentials: true
}))

// Body parser with size limit
app.use(express.json({ limit: '10kb' }))
app.use(express.urlencoded({ extended: true, limit: '10kb' }))

// Apply general rate limit to all routes
app.use(generalLimiter)

// Health check (no rate limit)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// API Routes with specific rate limits
app.use('/api/banlist', banlistRoutes)
app.use('/api/report', strictLimiter, reportRoutes)
app.use('/api/vote', strictLimiter, voteRoutes)
app.use('/api/admin/login', loginLimiter)
app.use('/api/admin', adminRoutes)
app.use('/api/stats', statsRoutes)

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// Error handler - don't expose internal errors
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // Log error internally but don't expose details
  if (process.env.NODE_ENV !== 'production') {
    console.error('Error:', err.message)
  }

  // CORS errors
  if (err.message === 'Not allowed by CORS' || err.message === 'Extension not allowed') {
    return res.status(403).json({ error: 'Forbidden' })
  }

  res.status(500).json({ error: 'Internal server error' })
})

// Start server
async function main() {
  try {
    await prisma.$connect()
    console.log('Database connected')

    app.listen(PORT, () => {
      console.log(`DeadNetGuard API running on port ${PORT}`)
      if (process.env.NODE_ENV === 'production') {
        console.log('Running in production mode')
      }
    })
  } catch (error) {
    console.error('Failed to start server:', error)
    process.exit(1)
  }
}

main()

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully')
  await prisma.$disconnect()
  process.exit(0)
})

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully')
  await prisma.$disconnect()
  process.exit(0)
})
