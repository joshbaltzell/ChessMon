import type { FastifyInstance } from 'fastify'
import { ChallengeService } from '../../services/challenge.service.js'
import { BotService } from '../../services/bot.service.js'
import { getDb } from '../../db/connection.js'
import type { StockfishPool } from '../../engine/stockfish-pool.js'
import { ConcurrencyLimiter } from '../../engine/concurrency-limiter.js'
import { botIdParamSchema, parseOrThrow } from '../schemas/validation.js'
import { rateLimitHeavy } from '../plugins/rate-limiter.js'
import { createOwnershipVerifier } from '../helpers/ownership.js'
import { z } from 'zod'

const challengeBodySchema = z.object({
  opponent_bot_id: z.number().int().positive(),
})

const challengeLimiter = new ConcurrencyLimiter(4)

export function createChallengeRoutes(pool: StockfishPool) {
  return async function challengeRoutes(app: FastifyInstance) {
    const db = getDb()
    const challengeService = new ChallengeService(db, pool)
    const botService = new BotService(db)
    const verifyOwnership = createOwnershipVerifier(botService)

    app.post('/bots/:id/challenge', { onRequest: [app.authenticate, rateLimitHeavy] }, async (request, reply) => {
      const { id: botId } = parseOrThrow(botIdParamSchema, request.params)
      const { opponent_bot_id: opponentBotId } = parseOrThrow(challengeBodySchema, request.body)
      const { playerId } = request.user

      verifyOwnership(botId, playerId)

      try {
        const result = await challengeLimiter.run(() =>
          challengeService.challenge(botId, opponentBotId)
        )
        return result
      } catch (err: any) {
        if (err.statusCode) throw err
        throw Object.assign(new Error(err.message || 'Challenge failed'), { statusCode: 500, code: 'CHALLENGE_ERROR' })
      }
    })
  }
}
