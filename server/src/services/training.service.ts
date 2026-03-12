import { eq, sql } from 'drizzle-orm'
import { bots, trainingLog, gameRecords } from '../db/schema.js'
import type { DrizzleDb } from '../db/connection.js'
import type { StockfishPool } from '../engine/stockfish-pool.js'
import { simulateGame } from '../engine/game-simulator.js'
import { botToPlayParameters, systemBotPlayParameters } from '../models/bot-intelligence.js'
import { calculateEloChange } from '../models/elo.js'
import { SPAR_COST, XP_PER_SPAR } from '../models/progression.js'

export class TrainingService {
  constructor(
    private db: DrizzleDb,
    private pool: StockfishPool,
  ) {}

  async spar(botId: number, opponentType: 'system' | 'player', opponentLevel?: number, opponentBotId?: number) {
    const bot = this.db.select().from(bots).where(eq(bots.id, botId)).get()
    if (!bot) throw new Error('Bot not found')
    if (bot.trainingPointsRemaining < SPAR_COST) {
      throw new Error(`Not enough training points. Need ${SPAR_COST}, have ${bot.trainingPointsRemaining}`)
    }

    let opponentParams
    let opponentElo: number
    let opponentDescription: string

    if (opponentType === 'system') {
      const level = opponentLevel || bot.level + 1
      opponentParams = systemBotPlayParameters(level)
      opponentElo = (level * 100) + 300 // Approximate Elo
      opponentDescription = `System Bot Level ${level}`
    } else if (opponentType === 'player' && opponentBotId) {
      const opponentBot = this.db.select().from(bots).where(eq(bots.id, opponentBotId)).get()
      if (!opponentBot) throw new Error('Opponent bot not found')
      opponentParams = botToPlayParameters(opponentBot)
      opponentElo = opponentBot.elo
      opponentDescription = `Player Bot: ${opponentBot.name}`
    } else {
      throw new Error('Invalid opponent specification')
    }

    const botParams = botToPlayParameters(bot)

    // Randomly assign colors
    const botIsWhite = Math.random() < 0.5
    const whiteParams = botIsWhite ? botParams : opponentParams
    const blackParams = botIsWhite ? opponentParams : botParams

    const gameResult = await simulateGame(whiteParams, blackParams, this.pool)

    // Calculate Elo change
    const eloChange = calculateEloChange(bot.elo, opponentElo, gameResult.result, botIsWhite)

    // Store game record
    const gameRecord = this.db.insert(gameRecords).values({
      whiteBotId: botIsWhite ? botId : (opponentBotId || null),
      blackBotId: botIsWhite ? (opponentBotId || null) : botId,
      whiteSystemLevel: botIsWhite ? null : (opponentType === 'system' ? (opponentLevel || bot.level + 1) : null),
      blackSystemLevel: botIsWhite ? (opponentType === 'system' ? (opponentLevel || bot.level + 1) : null) : null,
      pgn: gameResult.pgn,
      result: gameResult.result,
      moveCount: gameResult.moveCount,
      context: 'training',
    }).returning().get()

    // Update bot stats
    this.db.update(bots)
      .set({
        elo: Math.max(100, bot.elo + eloChange),
        gamesPlayed: bot.gamesPlayed + 1,
        xp: bot.xp + XP_PER_SPAR,
        trainingPointsRemaining: bot.trainingPointsRemaining - SPAR_COST,
      })
      .where(eq(bots.id, botId))
      .run()

    // Log the training action
    this.db.insert(trainingLog).values({
      botId,
      level: bot.level,
      actionType: 'spar',
      detailsJson: JSON.stringify({
        opponent: opponentDescription,
        opponentElo,
        botIsWhite,
      }),
      resultJson: JSON.stringify({
        result: gameResult.result,
        eloChange,
        moveCount: gameResult.moveCount,
        gameRecordId: gameRecord.id,
      }),
    }).run()

    return {
      game: {
        id: gameRecord.id,
        result: gameResult.result,
        moveCount: gameResult.moveCount,
        pgn: gameResult.pgn,
        botPlayedWhite: botIsWhite,
        opponent: opponentDescription,
      },
      eloChange,
      newElo: Math.max(100, bot.elo + eloChange),
      xpGained: XP_PER_SPAR,
      trainingPointsRemaining: bot.trainingPointsRemaining - SPAR_COST,
    }
  }
}
