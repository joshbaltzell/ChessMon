import type { FastifyInstance } from 'fastify'
import { BotService } from '../../services/bot.service.js'
import { DashboardService } from '../../services/dashboard.service.js'
import { getDb } from '../../db/connection.js'
import { createBotSchema, leaderboardQuerySchema, botIdParamSchema, parseOrThrow } from '../schemas/validation.js'

export async function botRoutes(app: FastifyInstance) {
  const db = getDb()
  const botService = new BotService(db)
  const dashboardService = new DashboardService(db)

  app.post('/bots', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { playerId } = request.user
    const body = parseOrThrow(createBotSchema, request.body)

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

  app.get('/bots/:id/dashboard', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id: botId } = parseOrThrow(botIdParamSchema, request.params)
    const { playerId } = request.user

    const bot = botService.getById(botId)
    if (!bot) return reply.status(404).send({ error: 'Bot not found', code: 'BOT_NOT_FOUND' })
    if (bot.playerId !== playerId) return reply.status(403).send({ error: 'Not your bot', code: 'NOT_OWNER' })

    return dashboardService.getBotDashboard(botId)
  })

  app.get('/bots/:id', async (request) => {
    const { id } = parseOrThrow(botIdParamSchema, request.params)
    const bot = botService.getById(id)
    if (!bot) {
      throw { statusCode: 404, message: 'Bot not found' }
    }
    const tactics = botService.getTactics(bot.id)
    return { bot: { ...bot, tactics, mlWeightsBlob: undefined } }
  })

  app.get('/bots/leaderboard', async (request) => {
    const { limit, offset } = parseOrThrow(leaderboardQuerySchema, request.query)
    const bots = botService.getLeaderboard(limit, offset)
    return { bots }
  })
}
