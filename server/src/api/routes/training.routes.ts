import type { FastifyInstance } from 'fastify'
import { TrainingService } from '../../services/training.service.js'
import { BotService } from '../../services/bot.service.js'
import { getDb } from '../../db/connection.js'
import type { StockfishPool } from '../../engine/stockfish-pool.js'
import { ConcurrencyLimiter } from '../../engine/concurrency-limiter.js'
import { botIdParamSchema, sparSchema, tacticKeySchema, parseOrThrow } from '../schemas/validation.js'
import { rateLimitHeavy } from '../plugins/rate-limiter.js'
import { config } from '../../config.js'

// Limit concurrent game simulations to prevent Stockfish pool saturation
const sparLimiter = new ConcurrencyLimiter(8)

export function createTrainingRoutes(pool: StockfishPool) {
  return async function trainingRoutes(app: FastifyInstance) {
    const db = getDb()
    const trainingService = new TrainingService(db, pool)
    const botService = new BotService(db)

    // Helper: verify bot ownership
    function verifyOwnership(botId: number, playerId: number) {
      const bot = botService.getById(botId)
      if (!bot) throw Object.assign(new Error('Bot not found'), { statusCode: 404, code: 'BOT_NOT_FOUND' })
      if (bot.playerId !== playerId) throw Object.assign(new Error('Not your bot'), { statusCode: 403, code: 'NOT_OWNER' })
      return bot
    }

    app.post('/bots/:id/train/spar', { onRequest: [app.authenticate, rateLimitHeavy] }, async (request, reply) => {
      const { id: botId } = parseOrThrow(botIdParamSchema, request.params)
      const { playerId } = request.user
      const body = parseOrThrow(sparSchema, request.body)

      verifyOwnership(botId, playerId)

      try {
        const result = await sparLimiter.run(() =>
          trainingService.spar(
            botId,
            body.opponent,
            body.opponent_level,
            body.opponent_bot_id,
          )
        )
        return result
      } catch (err: any) {
        if (err.message.includes('Not enough training points')) {
          return reply.status(400).send({ error: err.message, code: 'INSUFFICIENT_POINTS' })
        }
        throw err
      }
    })

    // Purchase a tactic
    app.post('/bots/:id/train/purchase', { onRequest: [app.authenticate] }, async (request, reply) => {
      const { id: botId } = parseOrThrow(botIdParamSchema, request.params)
      const { playerId } = request.user
      const { tactic_key } = parseOrThrow(tacticKeySchema, request.body)

      verifyOwnership(botId, playerId)

      try {
        return await trainingService.purchaseTactic(botId, tactic_key)
      } catch (err: any) {
        if (err.message.includes('Not enough training points')) {
          return reply.status(400).send({ error: err.message, code: 'INSUFFICIENT_POINTS' })
        }
        if (err.message.includes('Already owns') || err.message.includes('Unknown tactic') || err.message.includes('Requires level')) {
          return reply.status(400).send({ error: err.message, code: 'INVALID_PURCHASE' })
        }
        throw err
      }
    })

    // Drill a tactic to increase proficiency
    app.post('/bots/:id/train/drill', { onRequest: [app.authenticate] }, async (request, reply) => {
      const { id: botId } = parseOrThrow(botIdParamSchema, request.params)
      const { playerId } = request.user
      const { tactic_key } = parseOrThrow(tacticKeySchema, request.body)

      verifyOwnership(botId, playerId)

      try {
        return await trainingService.drill(botId, tactic_key)
      } catch (err: any) {
        if (err.message.includes('Not enough training points')) {
          return reply.status(400).send({ error: err.message, code: 'INSUFFICIENT_POINTS' })
        }
        if (err.message.includes('does not own')) {
          return reply.status(400).send({ error: err.message, code: 'TACTIC_NOT_OWNED' })
        }
        throw err
      }
    })

    // Dev-only: spar without training point cost (for ML learning curve testing)
    if (config.devMode) {
      app.post('/bots/:id/train/dev-spar', { onRequest: [app.authenticate] }, async (request, reply) => {
        const { id: botId } = parseOrThrow(botIdParamSchema, request.params)
        const { playerId } = request.user
        const body = parseOrThrow(sparSchema, request.body)

        verifyOwnership(botId, playerId)

        try {
          const result = await sparLimiter.run(() =>
            trainingService.devSpar(botId, body.opponent_level)
          )
          return result
        } catch (err: any) {
          throw err
        }
      })
    }

    // Get training log
    app.get('/bots/:id/training-log', { onRequest: [app.authenticate] }, async (request, reply) => {
      const { id: botId } = parseOrThrow(botIdParamSchema, request.params)
      const { playerId } = request.user

      verifyOwnership(botId, playerId)

      return trainingService.getTrainingLog(botId)
    })
  }
}
