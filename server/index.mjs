import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from './config.mjs'
import healthRouter from './routes/health.mjs'
import creatorsRouter from './routes/creators.mjs'
import briefsRouter, { handleBriefBuilder } from './routes/briefs.mjs'
import authRouter from './routes/auth.mjs'
import engagementsRouter from './routes/engagements.mjs'
import studioRouter from './routes/studio.mjs'
import {
  jsonSyntaxErrorHandler,
  notFoundHandler,
  globalErrorHandler,
} from './middleware/errorHandler.mjs'

// Strip credentials from a mongodb:// connection string before logging
function redactMongoUri(uri) {
  try {
    return uri.replace(/\/\/[^@/]+@/, '//***:***@')
  } catch {
    return '<mongo-uri>'
  }
}

const app = express()

// 1. CORS configuration
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true)
      // Localhost origins and the configured allowlist are always trusted
      if (
        config.corsOrigins.includes(origin) ||
        origin.startsWith('http://localhost:') ||
        origin.startsWith('http://127.0.0.1:')
      ) {
        return callback(null, true)
      }
      // Outside development, reject origins that are not explicitly allowed
      if (config.nodeEnv !== 'development') {
        return callback(new Error(`Origin ${origin} not allowed by CORS`))
      }
      callback(null, true)
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-User-Email', 'X-User-Id', 'X-User-Name', 'X-Account-Type'],
  })
)

// 2. Body parsing middleware
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// 3. Catch invalid JSON syntax in request bodies
app.use(jsonSyntaxErrorHandler)

// 4. API Routes
app.use('/api', healthRouter)
app.use('/api/auth', authRouter)
app.use('/api/creators', creatorsRouter)
app.use('/api/briefs', briefsRouter)
app.post('/api/brief-builder', handleBriefBuilder)
app.use('/api/engagements', engagementsRouter)
app.use('/api/studio', studioRouter)

// 5. 404 Catch-All Handler
app.use(notFoundHandler)

// 6. Global Error Handler
app.use(globalErrorHandler)

// Database connection & Server initialization
export async function startServer(port = config.port) {
  if (config.mongoUri) {
    try {
      await mongoose.connect(config.mongoUri, {
        serverSelectionTimeoutMS: 5000,
      })
      console.log('[Genra API] Connected to MongoDB at', redactMongoUri(config.mongoUri))
    } catch {
      console.log('[Genra API] MongoDB unavailable; using deterministic memory fallback')
    }
  } else {
    console.log('[Genra API] No MONGODB_URI provided; using deterministic memory fallback')
  }

  return new Promise((resolve, reject) => {
    const server = app.listen(port, '0.0.0.0', () => {
      console.log(`[Genra API] Server listening on port ${port} (${config.nodeEnv})`)
      resolve(server)
    })

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`[Genra API] Port ${port} is already in use.`)
      } else {
        console.error(`[Genra API] Server error:`, err.message)
      }
      reject(err)
    })

    // Graceful shutdown handling
    const shutdown = async () => {
      console.log('\n[Genra API] Shutting down server...')
      server.close(() => {
        if (mongoose.connection.readyState === 1) {
          mongoose.connection.close(false).then(() => {
            console.log('[Genra API] MongoDB connection closed.')
            process.exit(0)
          })
        } else {
          process.exit(0)
        }
      })
    }

    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
  })
}

// Check if file is being executed directly
const currentFilePath = fileURLToPath(import.meta.url)
const executedFilePath = process.argv[1] ? path.resolve(process.argv[1]) : ''

if (executedFilePath === currentFilePath) {
  startServer().catch((err) => {
    console.error('[Genra API] Failed to start:', err.message)
    process.exit(1)
  })
}

export default app
