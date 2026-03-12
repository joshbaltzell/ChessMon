import type { FastifyInstance } from 'fastify'
import { LevelTestService } from '../../services/level-test.service.js'
import { BotService } from '../../services/bot.service.js'
import { getDb } from '../../db/connection.js'
import type { StockfishPool } from '../../engine/stockfish-pool.js'

export function createLevelTestRoutes(pool: StockfishPool) {
  return async function levelTestRoutes(app: FastifyInstance) {
    const db = getDb()
    const levelTestService = new LevelTestService(db, pool)
    const botService = new BotService(db)

    // Start a level test
    app.post('/bots/:id/level-test', { onRequest: [app.authenticate] }, async (request, reply) => {
      const { id } = request.params as { id: string }
      const botId = parseInt(id, 10)
      const { playerId } = request.user

      const bot = botService.getById(botId)
      if (!bot) {
        return reply.status(404).send({ error: 'Bot not found', code: 'BOT_NOT_FOUND' })
      }
      if (bot.playerId !== playerId) {
        return reply.status(403).send({ error: 'Not your bot', code: 'NOT_OWNER' })
      }
      if (bot.level >= 20) {
        return reply.status(400).send({ error: 'Already at max level', code: 'MAX_LEVEL' })
      }

      try {
        const result = await levelTestService.startLevelTest(botId)
        return result
      } catch (err: any) {
        return reply.status(400).send({ error: err.message, code: 'LEVEL_TEST_ERROR' })
      }
    })

    // Get a specific level test result
    app.get('/bots/:id/level-test/:testId', { onRequest: [app.authenticate] }, async (request, reply) => {
      const { id, testId } = request.params as { id: string; testId: string }
      const botId = parseInt(id, 10)
      const { playerId } = request.user

      const bot = botService.getById(botId)
      if (!bot) {
        return reply.status(404).send({ error: 'Bot not found', code: 'BOT_NOT_FOUND' })
      }
      if (bot.playerId !== playerId) {
        return reply.status(403).send({ error: 'Not your bot', code: 'NOT_OWNER' })
      }

      const test = levelTestService.getTestById(parseInt(testId, 10))
      if (!test || test.botId !== botId) {
        return reply.status(404).send({ error: 'Test not found', code: 'TEST_NOT_FOUND' })
      }

      return {
        ...test,
        opponents: JSON.parse(test.opponentsJson),
        results: JSON.parse(test.resultsJson),
        gameIds: JSON.parse(test.gameIdsJson),
      }
    })

    // Get all level tests for a bot
    app.get('/bots/:id/level-tests', { onRequest: [app.authenticate] }, async (request, reply) => {
      const { id } = request.params as { id: string }
      const botId = parseInt(id, 10)
      const { playerId } = request.user

      const bot = botService.getById(botId)
      if (!bot) {
        return reply.status(404).send({ error: 'Bot not found', code: 'BOT_NOT_FOUND' })
      }
      if (bot.playerId !== playerId) {
        return reply.status(403).send({ error: 'Not your bot', code: 'NOT_OWNER' })
      }

      const tests = levelTestService.getTestsForBot(botId)
      return tests.map(t => ({
        ...t,
        opponents: JSON.parse(t.opponentsJson),
        results: JSON.parse(t.resultsJson),
        gameIds: JSON.parse(t.gameIdsJson),
      }))
    })
  }
}
