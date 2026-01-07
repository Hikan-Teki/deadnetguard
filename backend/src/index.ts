import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { PrismaClient } from '@prisma/client'
import banlistRoutes from './routes/banlist.js'
import reportRoutes from './routes/report.js'
import voteRoutes from './routes/vote.js'
import adminRoutes from './routes/admin.js'
import statsRoutes from './routes/stats.js'

const app = express()
const PORT = process.env.PORT || 3001

export const prisma = new PrismaClient()

// Middleware
app.use(helmet())
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true)

    // Allow chrome extensions
    if (origin.startsWith('chrome-extension://')) return callback(null, true)

    // Allow specific domains
    const allowedOrigins = [
      'https://deadnetguard.com',
      'https://api.deadnetguard.com',
      'http://localhost:5173',
      'http://localhost:3000',
      'http://localhost:3001'
    ]

    if (allowedOrigins.includes(origin)) {
      return callback(null, true)
    }

    callback(new Error('Not allowed by CORS'))
  },
  credentials: true
}))
app.use(express.json())

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// API Routes
app.use('/api/banlist', banlistRoutes)
app.use('/api/report', reportRoutes)
app.use('/api/vote', voteRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/stats', statsRoutes)

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err.message)
  res.status(500).json({ error: 'Internal server error' })
})

// Start server
async function main() {
  try {
    await prisma.$connect()
    console.log('Database connected')

    app.listen(PORT, () => {
      console.log(`DeadNetGuard API running on port ${PORT}`)
    })
  } catch (error) {
    console.error('Failed to start server:', error)
    process.exit(1)
  }
}

main()

// Graceful shutdown
process.on('SIGTERM', async () => {
  await prisma.$disconnect()
  process.exit(0)
})
