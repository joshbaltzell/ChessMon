import Fastify from 'fastify'
import cors from '@fastify/cors'
import { config } from './config.js'
import { initializeDb } from './db/connection.js'
import { authPlugin } from './api/plugins/auth-plugin.js'
import { registerRoutes } from './api/index.js'
import { StockfishPool } from './engine/stockfish-pool.js'

async function main() {
  const app = Fastify({ logger: true })

  // Register plugins
  await app.register(cors, { origin: true })
  await app.register(authPlugin)

  // Initialize database
  initializeDb()
  app.log.info('Database initialized')

  // Initialize Stockfish pool
  const pool = new StockfishPool(config.stockfishPoolSize, {
    requestTimeoutMs: config.stockfishRequestTimeoutMs,
  })
  app.log.info(`Initializing Stockfish pool with ${config.stockfishPoolSize} workers...`)
  await pool.initialize()
  app.log.info('Stockfish pool ready')

  // Health/stats endpoint
  app.get('/api/v1/health', async () => ({
    status: 'ok',
    stockfish: pool.getStats(),
  }))

  // Register routes
  await registerRoutes(app, pool)

  // Global error handler
  app.setErrorHandler((error, request, reply) => {
    const errObj = error as Record<string, unknown>
    const statusCode = (errObj.statusCode as number) || 500
    const code = (errObj.code as string) || 'SERVER_ERROR'

    // Don't log 4xx as errors, only unexpected 5xx
    if (statusCode >= 500) {
      app.log.error(error)
    } else {
      app.log.warn({ statusCode, code, message: (error as Error).message, url: request.url })
    }

    // Validation errors from Zod (thrown by parseOrThrow)
    if (code === 'VALIDATION_ERROR') {
      return reply.status(400).send({
        error: (error as Error).message,
        code: 'VALIDATION_ERROR',
      })
    }

    reply.status(statusCode).send({
      error: statusCode === 500 ? 'Internal server error' : (error as Error).message,
      code,
    })
  })

  // 404 handler
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: `Route ${request.method} ${request.url} not found`,
      code: 'NOT_FOUND',
    })
  })

  // Graceful shutdown
  const shutdown = async () => {
    app.log.info('Shutting down...')
    await pool.shutdown()
    await app.close()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  // Start server
  await app.listen({ port: config.port, host: config.host })
  app.log.info(`ChessMon server running at http://${config.host}:${config.port}`)
}

main().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
