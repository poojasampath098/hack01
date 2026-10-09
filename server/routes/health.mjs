import { Router } from 'express'
import mongoose from 'mongoose'
import { config } from '../config.mjs'

const router = Router()

router.get('/health', (_req, res) => {
  const isMongoConnected = mongoose.connection.readyState === 1
  const mode = isMongoConnected
    ? 'mongodb-connected'
    : (config.mongoUri ? 'memory-fallback' : 'memory-mode')

  res.json({
    ok: true,
    service: 'genra-api',
    status: 'healthy',
    mode,
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    database: {
      status: isMongoConnected ? 'connected' : 'disconnected',
      readyState: mongoose.connection.readyState,
    },
    version: '1.0.0',
  })
})

export default router
