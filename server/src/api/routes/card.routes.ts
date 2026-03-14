import type { FastifyInstance } from 'fastify'
import { CardService } from '../../services/card.service.js'
import { BotService } from '../../services/bot.service.js'
import { LadderService } from '../../services/ladder.service.js'
import { getDb } from '../../db/connection.js'
import type { StockfishPool } from '../../engine/stockfish-pool.js'
import { botIdParamSchema, playCardSchema, parseOrThrow } from '../schemas/validation.js'

export function createCardRoutes(pool: StockfishPool) {
  return async function cardRoutes(app: FastifyInstance) {
    const db = getDb()
    const cardService = new CardService(db)
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
        const { card, hand } = cardService.playCard(botId, body.card_id)

        let effect: any = null

        switch (card.category) {
          case 'preparation': {
            // Buff queued — return confirmation
            effect = {
              action: 'buff_queued',
              buffName: card.name,
              message: `${card.icon} ${card.name} queued for next fight!`,
              activeBuffs: hand.activeBuffs,
            }
            break
          }
          case 'powerup': {
            // Powerup queued — return confirmation
            effect = {
              action: 'powerup_queued',
              powerupName: card.name,
              message: `${card.icon} ${card.name} armed for next fight!`,
              activePowerups: hand.activePowerups,
            }
            break
          }
          case 'utility': {
            // Handle utility cards immediately
            switch (card.key) {
              case 'focus':
                effect = { action: 'energy_gained', message: '+1 Energy!' }
                break
              case 'rest':
                effect = { action: 'hand_refreshed', message: 'New hand drawn!' }
                break
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
              case 'haste':
                effect = {
                  action: 'haste_applied',
                  message: 'Next spar cooldown reduced by 60s!',
                  reduction: card.effect?.reduction || 60,
                }
                break
              default:
                effect = { action: 'unknown' }
            }
            break
          }
          default:
            effect = { action: 'unknown' }
        }

        return { card, hand, effect }
      } catch (err: any) {
        if (err.statusCode) {
          return reply.status(err.statusCode).send({ error: err.message, code: err.code || 'CARD_ERROR' })
        }
        if (err.message?.includes('Not enough energy') || err.message?.includes('Card not found') || err.message?.includes('No hand found')) {
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

      // Consume buffs/powerups for this fight
      const { buffs, powerups } = cardService.consumeBuffsForFight(botId)

      // Get next undefeated ladder opponent
      const nextOppLevel = ladderService.getNextOpponentLevel(botId)
      if (nextOppLevel === null) {
        return reply.status(400).send({ error: 'No ladder opponent to fight. Ladder may be complete.', code: 'NO_OPPONENT' })
      }

      try {
        // Import training service lazily to avoid circular deps
        const { TrainingService } = await import('../../services/training.service.js')
        const trainingService = new TrainingService(db, pool)

        // Run game with buffs/powerups applied
        const result = await trainingService.cardSpar(botId, nextOppLevel, 1, { buffs, powerups })

        // Check if bot won
        const botWon = (result.game.result === '1-0' && result.game.botPlayedWhite) ||
                       (result.game.result === '0-1' && !result.game.botPlayedWhite)

        if (botWon) {
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

        const bossLossAdvice = botWon ? null : ladderService.getBossLossAdvice(botId)

        return {
          ...result,
          bossFight: true,
          botWon,
          bossLossAdvice,
          ladderState: ladderService.getLadderState(botId),
          buffsApplied: buffs.length,
          powerupsApplied: powerups.length,
        }
      } catch (err: any) {
        throw err
      }
    })
  }
}
