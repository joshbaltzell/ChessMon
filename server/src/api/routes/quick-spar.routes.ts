import type { FastifyInstance } from 'fastify'
import { TrainingService } from '../../services/training.service.js'
import { BotService } from '../../services/bot.service.js'
import { getDb } from '../../db/connection.js'
import type { StockfishPool } from '../../engine/stockfish-pool.js'
import { ConcurrencyLimiter } from '../../engine/concurrency-limiter.js'
import { botIdParamSchema, parseOrThrow } from '../schemas/validation.js'
import { rateLimitQuickSpar } from '../plugins/rate-limiter.js'
import { config } from '../../config.js'

const sparLimiter = new ConcurrencyLimiter(config.MAX_CONCURRENT_SPARS ?? 8)

export function createQuickSparRoutes(pool: StockfishPool) {
  return async function quickSparRoutes(app: FastifyInstance) {
    const db = getDb()
    const trainingService = new TrainingService(db, pool)
    const botService = new BotService(db)

    // POST /bots/:id/quick-spar
    // Free quick spar — no energy cost, grants XP + energy + loot
    app.post('/bots/:id/quick-spar', { onRequest: [app.authenticate, rateLimitQuickSpar] }, async (request, reply) => {
      const { id: botId } = parseOrThrow(botIdParamSchema, request.params)
      const { playerId } = request.user

      // Verify ownership
      const bot = botService.getById(botId)
      if (!bot) {
        return reply.status(404).send({ error: 'Bot not found', code: 'BOT_NOT_FOUND' })
      }
      if (bot.playerId !== playerId) {
        return reply.status(403).send({ error: 'Not your bot', code: 'NOT_OWNER' })
      }

      try {
        const result = await sparLimiter.run(() =>
          trainingService.quickSpar(botId)
        )
        return result
      } catch (err: any) {
        throw err
      }
    })
  }
}
