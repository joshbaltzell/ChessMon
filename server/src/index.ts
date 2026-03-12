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
  const pool = new StockfishPool(config.stockfishPoolSize)
  app.log.info(`Initializing Stockfish pool with ${config.stockfishPoolSize} workers...`)
  await pool.initialize()
  app.log.info('Stockfish pool ready')

  // Register routes
  await registerRoutes(app, pool)

  // Global error handler
  app.setErrorHandler((error, request, reply) => {
    app.log.error(error)
    const statusCode = (error as Record<string, unknown>).statusCode as number || 500
    reply.status(statusCode).send({
      error: statusCode === 500 ? 'Internal server error' : (error as Error).message,
      code: 'SERVER_ERROR',
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
