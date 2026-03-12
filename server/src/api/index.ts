import type { FastifyInstance } from 'fastify'
import { authRoutes } from './routes/auth.routes.js'
import { botRoutes } from './routes/bot.routes.js'
import { createTrainingRoutes } from './routes/training.routes.js'
import { createLevelTestRoutes } from './routes/level-test.routes.js'
import { catalogRoutes } from './routes/catalog.routes.js'
import type { StockfishPool } from '../engine/stockfish-pool.js'

export async function registerRoutes(app: FastifyInstance, pool: StockfishPool) {
  app.register(authRoutes, { prefix: '/api/v1' })
  app.register(botRoutes, { prefix: '/api/v1' })
  app.register(createTrainingRoutes(pool), { prefix: '/api/v1' })
  app.register(createLevelTestRoutes(pool), { prefix: '/api/v1' })
  app.register(catalogRoutes, { prefix: '/api/v1' })
}
