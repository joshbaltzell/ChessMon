import type { FastifyInstance } from 'fastify'
import { PilotService } from '../../services/pilot.service.js'
import { BotService } from '../../services/bot.service.js'
import { getDb } from '../../db/connection.js'
import type { StockfishPool } from '../../engine/stockfish-pool.js'
import { botIdParamSchema, playSessionParamSchema, moveSchema, parseOrThrow } from '../schemas/validation.js'
import { z } from 'zod'

const pilotNewSchema = z.object({
  player_color: z.enum(['w', 'b']).default('w'),
  opponent_level: z.number().int().min(1).max(20).default(1),
})

const pilotMoveSchema = z.object({
  move: z.string().min(2).max(10),
  opponent_level: z.number().int().min(1).max(20),
})

export function createPilotRoutes(pool: StockfishPool) {
  return async function pilotRoutes(app: FastifyInstance) {
    const db = getDb()
    const pilotService = new PilotService(db, pool)
    const botService = new BotService(db)

    function verifyOwnership(botId: number, playerId: number) {
      const bot = botService.getById(botId)
      if (!bot) throw Object.assign(new Error('Bot not found'), { statusCode: 404, code: 'BOT_NOT_FOUND' })
      if (bot.playerId !== playerId) throw Object.assign(new Error('Not your bot'), { statusCode: 403, code: 'NOT_OWNER' })
      return bot
    }

    // POST /bots/:id/pilot/new — start a pilot game
    app.post('/bots/:id/pilot/new', { onRequest: [app.authenticate] }, async (request, reply) => {
      const { id: botId } = parseOrThrow(botIdParamSchema, request.params)
      const { playerId } = request.user
      verifyOwnership(botId, playerId)

      const { player_color, opponent_level } = parseOrThrow(pilotNewSchema, request.body ?? {})

      try {
        return await pilotService.startPilotGame(botId, opponent_level, player_color)
      } catch (err: any) {
        return reply.status(400).send({ error: err.message, code: 'PILOT_ERROR' })
      }
    })

    // POST /bots/:id/pilot/:sessionId/move — make a move in pilot mode
    app.post('/bots/:id/pilot/:sessionId/move', { onRequest: [app.authenticate] }, async (request, reply) => {
      const { id: botId, sessionId } = parseOrThrow(playSessionParamSchema, request.params)
      const { playerId } = request.user
      verifyOwnership(botId, playerId)

      const { move, opponent_level } = parseOrThrow(pilotMoveSchema, request.body)

      try {
        return await pilotService.makePilotMove(sessionId, move, opponent_level)
      } catch (err: any) {
        if (err.message?.includes('Invalid move') || err.message?.includes('Not your turn') || err.message?.includes('not active')) {
          return reply.status(400).send({ error: err.message, code: 'INVALID_MOVE' })
        }
        throw err
      }
    })

    // POST /bots/:id/pilot/:sessionId/resign — resign pilot game
    app.post('/bots/:id/pilot/:sessionId/resign', { onRequest: [app.authenticate] }, async (request, reply) => {
      const { id: botId, sessionId } = parseOrThrow(playSessionParamSchema, request.params)
      const { playerId } = request.user
      verifyOwnership(botId, playerId)

      const body = z.object({ opponent_level: z.number().int().min(1).max(20).default(1) })
        .safeParse(request.body ?? {})
      const opponentLevel = body.success ? body.data.opponent_level : 1

      try {
        return await pilotService.resignPilot(sessionId, opponentLevel)
      } catch (err: any) {
        return reply.status(400).send({ error: err.message, code: 'RESIGN_ERROR' })
      }
    })
  }
}
