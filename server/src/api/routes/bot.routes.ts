import type { FastifyInstance } from 'fastify'
import { BotService } from '../../services/bot.service.js'
import { getDb } from '../../db/connection.js'

export async function botRoutes(app: FastifyInstance) {
  const botService = new BotService(getDb())

  app.post('/bots', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { playerId } = request.user
    const body = request.body as any

    const input = {
      playerId,
      name: body.name,
      aggression: body.aggression,
      positional: body.positional,
      tactical: body.tactical,
      endgame: body.endgame,
      creativity: body.creativity,
      alignmentAttack: body.alignment_attack,
      alignmentStyle: body.alignment_style,
    }

    const validationError = botService.validateAttributes(input)
    if (validationError) {
      return reply.status(400).send({ error: validationError, code: 'INVALID_ATTRIBUTES' })
    }

    try {
      const bot = botService.create(input)
      return { bot }
    } catch (err: any) {
      if (err.message.includes('bots (maximum)')) {
        return reply.status(409).send({ error: err.message, code: 'MAX_BOTS' })
      }
      if (err.message === 'Bot name already taken') {
        return reply.status(409).send({ error: err.message, code: 'NAME_TAKEN' })
      }
      throw err
    }
  })

  app.get('/bots/mine', { onRequest: [app.authenticate] }, async (request) => {
    const playerBots = botService.getByPlayerId(request.user.playerId)
    return { bots: playerBots }
  })

  app.get('/bots/:id', async (request) => {
    const { id } = request.params as { id: string }
    const bot = botService.getById(parseInt(id, 10))
    if (!bot) {
      throw { statusCode: 404, message: 'Bot not found' }
    }
    const tactics = botService.getTactics(bot.id)
    return { bot: { ...bot, tactics, mlWeightsBlob: undefined } }
  })

  app.get('/bots/leaderboard', async (request) => {
    const query = request.query as { limit?: string; offset?: string }
    const limit = Math.min(parseInt(query.limit || '20', 10), 100)
    const offset = parseInt(query.offset || '0', 10)
    const bots = botService.getLeaderboard(limit, offset)
    return { bots }
  })
}
