import type { FastifyInstance } from 'fastify'
import { CardService } from '../../services/card.service.js'
import { TrainingService } from '../../services/training.service.js'
import { BotService } from '../../services/bot.service.js'
import { LadderService } from '../../services/ladder.service.js'
import { getDb } from '../../db/connection.js'
import type { StockfishPool } from '../../engine/stockfish-pool.js'
import { ConcurrencyLimiter } from '../../engine/concurrency-limiter.js'
import { botIdParamSchema, playCardSchema, parseOrThrow } from '../schemas/validation.js'

const sparLimiter = new ConcurrencyLimiter(8)

export function createCardRoutes(pool: StockfishPool) {
  return async function cardRoutes(app: FastifyInstance) {
    const db = getDb()
    const cardService = new CardService(db)
    const trainingService = new TrainingService(db, pool)
    const botService = new BotService(db)
    const ladderService = new LadderService(db)

    // Helper: verify bot ownership
    function verifyOwnership(botId: number, playerId: number) {
      const bot = botService.getById(botId)
      if (!bot) throw Object.assign(new Error('Bot not found'), { statusCode: 404, code: 'BOT_NOT_FOUND' })
      if (bot.playerId !== playerId) throw Object.assign(new Error('Not your bot'), { statusCode: 403, code: 'NOT_OWNER' })
      return bot
    }

    // GET /bots/:id/hand — get current hand state (auto-draws if none exists)
    app.get('/bots/:id/hand', { onRequest: [app.authenticate] }, async (request, reply) => {
      const { id: botId } = parseOrThrow(botIdParamSchema, request.params)
      const { playerId } = request.user
      verifyOwnership(botId, playerId)

      return cardService.getHandState(botId)
    })

    // POST /bots/:id/hand/draw — draw a new hand (new round)
    app.post('/bots/:id/hand/draw', { onRequest: [app.authenticate] }, async (request, reply) => {
      const { id: botId } = parseOrThrow(botIdParamSchema, request.params)
      const { playerId } = request.user
      verifyOwnership(botId, playerId)

      return cardService.drawHand(botId)
    })

    // POST /bots/:id/hand/new-round — refresh hand (preserves energy)
    app.post('/bots/:id/hand/new-round', { onRequest: [app.authenticate] }, async (request, reply) => {
      const { id: botId } = parseOrThrow(botIdParamSchema, request.params)
      const { playerId } = request.user
      verifyOwnership(botId, playerId)
      return cardService.refreshHand(botId)
    })

    // POST /bots/:id/hand/play — play a card from hand
    app.post('/bots/:id/hand/play', { onRequest: [app.authenticate] }, async (request, reply) => {
      const { id: botId } = parseOrThrow(botIdParamSchema, request.params)
      const { playerId } = request.user
      verifyOwnership(botId, playerId)

      const body = parseOrThrow(playCardSchema, request.body)

      try {
        // Play the card (removes from hand, deducts energy)
        const { card, hand } = cardService.playCard(botId, body.card_id)

        // Execute the card's effect based on its type
        let effect: any = null

        switch (card.key) {
          case 'spar': {
            const oppLevel = body.opponent_level || 1
            effect = await sparLimiter.run(() =>
              trainingService.cardSpar(botId, oppLevel, 1)
            )
            // Check if this was a ladder opponent and bot won
            checkLadderDefeat(botId, oppLevel, effect)
            break
          }
          case 'power_spar': {
            const oppLevel = body.opponent_level || 1
            effect = await sparLimiter.run(() =>
              trainingService.cardSpar(botId, oppLevel, 4) // 4x XP multiplier
            )
            // Check if this was a ladder opponent and bot won
            checkLadderDefeat(botId, oppLevel, effect)
            break
          }
          case 'drill': {
            if (!body.tactic_key) {
              return reply.status(400).send({ error: 'tactic_key required for Drill card', code: 'MISSING_TACTIC' })
            }
            effect = await trainingService.cardDrill(botId, body.tactic_key, 15)
            break
          }
          case 'deep_drill': {
            if (!body.tactic_key) {
              return reply.status(400).send({ error: 'tactic_key required for Deep Drill card', code: 'MISSING_TACTIC' })
            }
            effect = await trainingService.cardDrill(botId, body.tactic_key, 30)
            break
          }
          case 'study': {
            // Study opens the tactic shop — effect is client-side.
            // The actual purchase is done via existing purchase endpoint.
            effect = { action: 'open_shop' }
            break
          }
          case 'analyze': {
            // Analyze opens bot brain — effect is client-side
            effect = { action: 'open_brain' }
            break
          }
          case 'challenge': {
            // Challenge opens play vs bot — effect is client-side
            effect = { action: 'open_play' }
            break
          }
          case 'focus': {
            // Energy already added in playCard
            effect = { action: 'energy_gained', message: '+1 Energy!' }
            break
          }
          case 'rest': {
            // Hand already refreshed in playCard
            effect = { action: 'hand_refreshed', message: 'New hand drawn!' }
            break
          }
          case 'scout': {
            const scoutInfo = ladderService.getScoutInfo(botId)
            if (scoutInfo) {
              effect = {
                action: 'scout_info',
                name: scoutInfo.name,
                level: scoutInfo.level,
                weakness: scoutInfo.weakness,
                scoutText: scoutInfo.scoutText,
                playStyleHint: scoutInfo.playStyleHint,
              }
            } else {
              effect = {
                action: 'scout_info',
                message: 'No opponent to scout right now.',
              }
            }
            break
          }
          default:
            effect = { action: 'unknown' }
        }

        return { card, hand, effect }
      } catch (err: any) {
        if (err.message.includes('Not enough energy') || err.message.includes('Card not found') || err.message.includes('No hand found')) {
          return reply.status(400).send({ error: err.message, code: 'CARD_ERROR' })
        }
        throw err
      }
    })

    // GET /catalog/cards — get all card definitions
    app.get('/catalog/cards', async () => {
      return cardService.getCardDefinitions()
    })

    // GET /bots/:id/ladder — get ladder state
    app.get('/bots/:id/ladder', { onRequest: [app.authenticate] }, async (request, reply) => {
      const { id: botId } = parseOrThrow(botIdParamSchema, request.params)
      const { playerId } = request.user
      verifyOwnership(botId, playerId)
      return ladderService.getLadderState(botId)
    })

    // POST /bots/:id/boss-fight — free fight against next ladder opponent
    app.post('/bots/:id/boss-fight', { onRequest: [app.authenticate] }, async (request, reply) => {
      const { id: botId } = parseOrThrow(botIdParamSchema, request.params)
      const { playerId } = request.user
      verifyOwnership(botId, playerId)

      // Get next undefeated ladder opponent
      const nextOppLevel = ladderService.getNextOpponentLevel(botId)
      if (nextOppLevel === null) {
        return reply.status(400).send({ error: 'No ladder opponent to fight. Ladder may be complete.', code: 'NO_OPPONENT' })
      }

      try {
        // Run game (1x XP, free — no energy)
        const result = await sparLimiter.run(() =>
          trainingService.cardSpar(botId, nextOppLevel, 1)
        )

        // Check if bot won
        const botWon = (result.game.result === '1-0' && result.game.botPlayedWhite) ||
                       (result.game.result === '0-1' && !result.game.botPlayedWhite)

        if (botWon) {
          // Mark ladder opponent as defeated
          const ladder = ladderService.getLadderState(botId)
          if (ladder) {
            const opponent = ladder.opponents.find(o => !o.defeated && o.level === nextOppLevel)
            if (opponent) {
              ladderService.defeatOpponent(botId, opponent.index, result.game.id)
            }
          }
        } else {
          // Boss loss: +3 energy consolation
          cardService.addEnergy(botId, 3)
        }

        // Get advice for losses
        const bossLossAdvice = botWon ? null : ladderService.getBossLossAdvice(botId)

        return {
          ...result,
          bossFight: true,
          botWon,
          bossLossAdvice,
          ladderState: ladderService.getLadderState(botId),
        }
      } catch (err: any) {
        throw err
      }
    })

    // Helper: check if spar defeated a ladder opponent
    function checkLadderDefeat(botId: number, oppLevel: number, effect: any) {
      if (!effect?.game) return
      const result = effect.game.result
      const botWon = (result === '1-0' && effect.game.botPlayedWhite) || (result === '0-1' && !effect.game.botPlayedWhite)
      if (!botWon) return

      const ladder = ladderService.getLadderState(botId)
      if (!ladder) return

      // Find the next undefeated opponent matching this level
      const opponent = ladder.opponents.find(o => !o.defeated && o.level === oppLevel)
      if (opponent) {
        ladderService.defeatOpponent(botId, opponent.index, effect.game?.id || 0)
      }
    }
  }
}
