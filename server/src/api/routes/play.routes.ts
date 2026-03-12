import type { FastifyInstance } from 'fastify'
import { PlayService } from '../../services/play.service.js'
import { BotService } from '../../services/bot.service.js'
import { getDb } from '../../db/connection.js'
import type { StockfishPool } from '../../engine/stockfish-pool.js'

export function createPlayRoutes(pool: StockfishPool) {
  return async function playRoutes(app: FastifyInstance) {
    const db = getDb()
    const playService = new PlayService(db, pool)
    const botService = new BotService(db)

    // Start a new human vs bot game
    app.post('/bots/:id/play/new', { onRequest: [app.authenticate] }, async (request, reply) => {
      const { id } = request.params as { id: string }
      const botId = parseInt(id, 10)
      const { playerId } = request.user

      const bot = botService.getById(botId)
      if (!bot) return reply.status(404).send({ error: 'Bot not found', code: 'BOT_NOT_FOUND' })
      if (bot.playerId !== playerId) return reply.status(403).send({ error: 'Not your bot', code: 'NOT_OWNER' })

      const { player_color } = request.body as { player_color?: 'w' | 'b' }
      const color = player_color === 'b' ? 'b' : 'w'

      try {
        return await playService.newGame(botId, color)
      } catch (err: any) {
        return reply.status(400).send({ error: err.message, code: 'PLAY_ERROR' })
      }
    })

    // Make a move in an active game
    app.post('/bots/:id/play/:sessionId/move', { onRequest: [app.authenticate] }, async (request, reply) => {
      const { id, sessionId } = request.params as { id: string; sessionId: string }
      const botId = parseInt(id, 10)
      const { playerId } = request.user

      const bot = botService.getById(botId)
      if (!bot) return reply.status(404).send({ error: 'Bot not found', code: 'BOT_NOT_FOUND' })
      if (bot.playerId !== playerId) return reply.status(403).send({ error: 'Not your bot', code: 'NOT_OWNER' })

      const session = playService.getSession(sessionId)
      if (!session || session.botId !== botId) {
        return reply.status(404).send({ error: 'Session not found', code: 'SESSION_NOT_FOUND' })
      }

      const { move } = request.body as { move: string }
      if (!move) return reply.status(400).send({ error: 'move required', code: 'MISSING_FIELD' })

      try {
        return await playService.makePlayerMove(sessionId, move)
      } catch (err: any) {
        if (err.message.includes('Invalid move') || err.message.includes('Not your turn') || err.message.includes('not active')) {
          return reply.status(400).send({ error: err.message, code: 'INVALID_MOVE' })
        }
        throw err
      }
    })

    // Resign
    app.post('/bots/:id/play/:sessionId/resign', { onRequest: [app.authenticate] }, async (request, reply) => {
      const { id, sessionId } = request.params as { id: string; sessionId: string }
      const botId = parseInt(id, 10)
      const { playerId } = request.user

      const bot = botService.getById(botId)
      if (!bot) return reply.status(404).send({ error: 'Bot not found', code: 'BOT_NOT_FOUND' })
      if (bot.playerId !== playerId) return reply.status(403).send({ error: 'Not your bot', code: 'NOT_OWNER' })

      const session = playService.getSession(sessionId)
      if (!session || session.botId !== botId) {
        return reply.status(404).send({ error: 'Session not found', code: 'SESSION_NOT_FOUND' })
      }

      try {
        return await playService.resign(sessionId)
      } catch (err: any) {
        return reply.status(400).send({ error: err.message, code: 'RESIGN_ERROR' })
      }
    })
  }
}
