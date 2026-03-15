import type { FastifyInstance } from 'fastify'
import { TrainingService } from '../../services/training.service.js'
import { BotService } from '../../services/bot.service.js'
import { getDb } from '../../db/connection.js'
import type { StockfishPool } from '../../engine/stockfish-pool.js'
import { ConcurrencyLimiter } from '../../engine/concurrency-limiter.js'
import { botIdParamSchema, sparSchema, tacticKeySchema, parseOrThrow } from '../schemas/validation.js'
import { rateLimitHeavy } from '../plugins/rate-limiter.js'
import { config } from '../../config.js'
import { createOwnershipVerifier } from '../helpers/ownership.js'
import { getOpeningDetail } from '../../engine/opening-book.js'
import { botTactics } from '../../db/schema.js'
import { eq, and } from 'drizzle-orm'

// Limit concurrent game simulations to prevent Stockfish pool saturation
const sparLimiter = new ConcurrencyLimiter(8)

export function createTrainingRoutes(pool: StockfishPool) {
  return async function trainingRoutes(app: FastifyInstance) {
    const db = getDb()
    const trainingService = new TrainingService(db, pool)
    const botService = new BotService(db)

    const verifyOwnership = createOwnershipVerifier(botService)

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

    // Opening Explorer: get opening book positions for an owned tactic
    app.get('/bots/:id/openings/:tacticKey', { onRequest: [app.authenticate] }, async (request, reply) => {
      const { id: botId } = parseOrThrow(botIdParamSchema, request.params)
      const { tacticKey } = request.params as { id: string; tacticKey: string }
      const { playerId } = request.user

      verifyOwnership(botId, playerId)

      // Check bot owns this tactic
      const tactic = db.select().from(botTactics)
        .where(and(eq(botTactics.botId, botId), eq(botTactics.tacticKey, tacticKey)))
        .get()

      if (!tactic) {
        throw Object.assign(new Error('Bot does not own this tactic'), { statusCode: 404, code: 'TACTIC_NOT_OWNED' })
      }

      // Look up opening data
      const opening = getOpeningDetail(tacticKey)
      if (!opening) {
        throw Object.assign(new Error('This tactic is not an opening'), { statusCode: 404, code: 'NOT_AN_OPENING' })
      }

      return {
        ...opening,
        proficiency: tactic.proficiency,
      }
    })
  }
}
