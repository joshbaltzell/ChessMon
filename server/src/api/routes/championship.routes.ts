import type { FastifyInstance } from 'fastify'
import { ChampionshipService } from '../../services/championship.service.js'
import { BotService } from '../../services/bot.service.js'
import { getDb } from '../../db/connection.js'
import type { StockfishPool } from '../../engine/stockfish-pool.js'
import { ConcurrencyLimiter } from '../../engine/concurrency-limiter.js'
import { botIdParamSchema, parseOrThrow } from '../schemas/validation.js'
import { rateLimitHeavy } from '../plugins/rate-limiter.js'

const champLimiter = new ConcurrencyLimiter(4) // limit concurrent championship games

export function createChampionshipRoutes(pool: StockfishPool) {
  return async function championshipRoutes(app: FastifyInstance) {
    const db = getDb()
    const championshipService = new ChampionshipService(db, pool)
    const botService = new BotService(db)

    // POST /bots/:id/championship/start
    app.post('/bots/:id/championship/start', { onRequest: [app.authenticate, rateLimitHeavy] }, async (request, reply) => {
      const { id: botId } = parseOrThrow(botIdParamSchema, request.params)
      const { playerId } = request.user

      const bot = botService.getById(botId)
      if (!bot) return reply.status(404).send({ error: 'Bot not found', code: 'BOT_NOT_FOUND' })
      if (bot.playerId !== playerId) return reply.status(403).send({ error: 'Not your bot', code: 'NOT_OWNER' })

      try {
        const result = championshipService.startBout(botId)
        return result
      } catch (err: any) {
        if (err.message.includes('Ladder is not complete')) {
          return reply.status(400).send({ error: err.message, code: 'LADDER_INCOMPLETE' })
        }
        if (err.message.includes('already active')) {
          return reply.status(400).send({ error: err.message, code: 'BOUT_ACTIVE' })
        }
        throw err
      }
    })

    // POST /bots/:id/championship/play-round
    app.post('/bots/:id/championship/play-round', { onRequest: [app.authenticate, rateLimitHeavy] }, async (request, reply) => {
      const { id: botId } = parseOrThrow(botIdParamSchema, request.params)
      const { playerId } = request.user

      const bot = botService.getById(botId)
      if (!bot) return reply.status(404).send({ error: 'Bot not found', code: 'BOT_NOT_FOUND' })
      if (bot.playerId !== playerId) return reply.status(403).send({ error: 'Not your bot', code: 'NOT_OWNER' })

      try {
        const result = await champLimiter.run(() =>
          championshipService.playRound(botId)
        )
        return result
      } catch (err: any) {
        if (err.message.includes('No active championship bout')) {
          return reply.status(400).send({ error: err.message, code: 'NO_ACTIVE_BOUT' })
        }
        throw err
      }
    })
  }
}
