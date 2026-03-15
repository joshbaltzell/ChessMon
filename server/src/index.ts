import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import fastifyStatic from '@fastify/static'
import { config } from './config.js'
import { initializeDb } from './db/connection.js'
import { authPlugin } from './api/plugins/auth-plugin.js'
import { registerRoutes } from './api/index.js'
import { StockfishPool } from './engine/stockfish-pool.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

async function main() {
  const app = Fastify({ logger: true })

  // Register plugins
  await app.register(cors, { origin: true })
  await app.register(authPlugin)

  // Serve chess.js ESM build for browser use (from root dist, not public/)
  // Must register before @fastify/static so this explicit route takes priority
  const chessJsPath = join(__dirname, '..', '..', 'dist', 'esm', 'chess.js')
  app.get('/js/chess.js', async (_request, reply) => {
    const js = readFileSync(chessJsPath, 'utf-8')
    reply.type('application/javascript').send(js)
  })

  // Serve static files from public/ directory (CSS, JS, HTML, etc.)
  await app.register(fastifyStatic, {
    root: join(__dirname, 'public'),
    prefix: '/',
  })

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
