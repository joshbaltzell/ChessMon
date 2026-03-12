import type { FastifyInstance } from 'fastify'
import { TrainingService } from '../../services/training.service.js'
import { BotService } from '../../services/bot.service.js'
import { getDb } from '../../db/connection.js'
import type { StockfishPool } from '../../engine/stockfish-pool.js'
import { ConcurrencyLimiter } from '../../engine/concurrency-limiter.js'
import { botIdParamSchema, sparSchema, tacticKeySchema, parseOrThrow } from '../schemas/validation.js'
import { rateLimitHeavy } from '../plugins/rate-limiter.js'

// Limit concurrent game simulations to prevent Stockfish pool saturation
const sparLimiter = new ConcurrencyLimiter(8)

export function createTrainingRoutes(pool: StockfishPool) {
  return async function trainingRoutes(app: FastifyInstance) {
    const db = getDb()
    const trainingService = new TrainingService(db, pool)
    const botService = new BotService(db)

    app.post('/bots/:id/train/spar', { onRequest: [app.authenticate, rateLimitHeavy] }, async (request, reply) => {
      const { id: botId } = parseOrThrow(botIdParamSchema, request.params)
      const { playerId } = request.user
      const body = parseOrThrow(sparSchema, request.body)

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

      const bot = botService.getById(botId)
      if (!bot) return reply.status(404).send({ error: 'Bot not found', code: 'BOT_NOT_FOUND' })
      if (bot.playerId !== playerId) return reply.status(403).send({ error: 'Not your bot', code: 'NOT_OWNER' })

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

      const bot = botService.getById(botId)
      if (!bot) return reply.status(404).send({ error: 'Bot not found', code: 'BOT_NOT_FOUND' })
      if (bot.playerId !== playerId) return reply.status(403).send({ error: 'Not your bot', code: 'NOT_OWNER' })

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

    // Get training log
    app.get('/bots/:id/training-log', { onRequest: [app.authenticate] }, async (request, reply) => {
      const { id: botId } = parseOrThrow(botIdParamSchema, request.params)
      const { playerId } = request.user

      const bot = botService.getById(botId)
      if (!bot) return reply.status(404).send({ error: 'Bot not found', code: 'BOT_NOT_FOUND' })
      if (bot.playerId !== playerId) return reply.status(403).send({ error: 'Not your bot', code: 'NOT_OWNER' })

      return trainingService.getTrainingLog(botId)
    })
  }
}
