import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { TrainingService } from '../../services/training.service.js'
import { BotService } from '../../services/bot.service.js'
import { CardService } from '../../services/card.service.js'
import { getDb } from '../../db/connection.js'
import { bots } from '../../db/schema.js'
import type { StockfishPool } from '../../engine/stockfish-pool.js'
import { ConcurrencyLimiter } from '../../engine/concurrency-limiter.js'
import { botIdParamSchema, parseOrThrow } from '../schemas/validation.js'
import { rateLimitQuickSpar } from '../plugins/rate-limiter.js'
import { config } from '../../config.js'
import { createOwnershipVerifier } from '../helpers/ownership.js'

const sparLimiter = new ConcurrencyLimiter(config.MAX_CONCURRENT_SPARS ?? 8)

const BASE_TIMER_SECONDS = 300 // 5 minutes
const MIN_TIMER_SECONDS = 120  // 2 minutes (floor)
const STREAK_REDUCTION = 30    // 30s off at streak >= 3

export function createQuickSparRoutes(pool: StockfishPool) {
  return async function quickSparRoutes(app: FastifyInstance) {
    const db = getDb()
    const trainingService = new TrainingService(db, pool)
    const botService = new BotService(db)

    const verifyOwnership = createOwnershipVerifier(botService)

    // GET /bots/:id/spar-timer — get current spar timer state
    app.get('/bots/:id/spar-timer', { onRequest: [app.authenticate] }, async (request, reply) => {
      const { id: botId } = parseOrThrow(botIdParamSchema, request.params)
      const { playerId } = request.user
      const bot = verifyOwnership(botId, playerId)

      const now = Date.now()
      const nextSparAt = bot.nextFreeSparAt ? new Date(bot.nextFreeSparAt).getTime() : 0
      const ready = now >= nextSparAt
      const remainingMs = ready ? 0 : nextSparAt - now
      const timerSeconds = bot.sparTimerSeconds ?? BASE_TIMER_SECONDS

      // Check win streak for display
      const cardService = new CardService(db)
      const streak = cardService.getWinStreak(botId)

      return {
        ready,
        remainingMs,
        remainingSeconds: Math.ceil(remainingMs / 1000),
        timerSeconds,
        streak,
      }
    })

    // POST /bots/:id/quick-spar
    // Free quick spar — timer-gated, grants XP + energy + loot
    app.post('/bots/:id/quick-spar', { onRequest: [app.authenticate, rateLimitQuickSpar] }, async (request, reply) => {
      const { id: botId } = parseOrThrow(botIdParamSchema, request.params)
      const { playerId } = request.user
      const bot = verifyOwnership(botId, playerId)

      // Timer gate: check if spar is allowed
      const now = Date.now()
      const nextSparAt = bot.nextFreeSparAt ? new Date(bot.nextFreeSparAt).getTime() : 0
      if (now < nextSparAt) {
        const remainingMs = nextSparAt - now
        return reply.status(429).send({
          error: 'Spar timer not ready',
          code: 'SPAR_TIMER',
          remainingMs,
          remainingSeconds: Math.ceil(remainingMs / 1000),
        })
      }

      try {
        const result = await sparLimiter.run(() =>
          trainingService.quickSpar(botId)
        )

        // Calculate next timer based on streak
        const cardService = new CardService(db)
        const streak = cardService.getWinStreak(botId)
        let timerSeconds = bot.sparTimerSeconds ?? BASE_TIMER_SECONDS
        if (streak >= 3) {
          timerSeconds = Math.max(MIN_TIMER_SECONDS, timerSeconds - STREAK_REDUCTION)
        }

        // Set next spar time
        const nextSpar = new Date(Date.now() + timerSeconds * 1000)
        db.update(bots)
          .set({
            nextFreeSparAt: nextSpar,
            sparTimerSeconds: timerSeconds,
          })
          .where(eq(bots.id, botId))
          .run()

        return {
          ...result,
          nextSparIn: timerSeconds,
          nextSparAt: nextSpar.toISOString(),
        }
      } catch (err: any) {
        throw err
      }
    })

    // POST /bots/:id/reduce-spar-timer — reduce timer (called by Haste card)
    app.post('/bots/:id/reduce-spar-timer', { onRequest: [app.authenticate] }, async (request, reply) => {
      const { id: botId } = parseOrThrow(botIdParamSchema, request.params)
      const { playerId } = request.user
      const bot = verifyOwnership(botId, playerId)

      const reduction = 60 // 60 seconds
      const currentNextSpar = bot.nextFreeSparAt ? new Date(bot.nextFreeSparAt).getTime() : 0
      const now = Date.now()

      if (currentNextSpar <= now) {
        return { ready: true, remainingMs: 0, remainingSeconds: 0 }
      }

      const newNextSpar = new Date(Math.max(now, currentNextSpar - reduction * 1000))
      db.update(bots)
        .set({ nextFreeSparAt: newNextSpar })
        .where(eq(bots.id, botId))
        .run()

      const remainingMs = Math.max(0, newNextSpar.getTime() - now)
      return {
        ready: remainingMs === 0,
        remainingMs,
        remainingSeconds: Math.ceil(remainingMs / 1000),
        reduced: reduction,
      }
    })
  }
}
