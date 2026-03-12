import { eq, and } from 'drizzle-orm'
import { bots, botTactics, trainingLog, gameRecords } from '../db/schema.js'
import type { DrizzleDb } from '../db/connection.js'
import type { StockfishPool } from '../engine/stockfish-pool.js'
import { simulateGame } from '../engine/game-simulator.js'
import { botToPlayParameters, systemBotPlayParameters } from '../models/bot-intelligence.js'
import { calculateEloChange } from '../models/elo.js'
import { SPAR_COST, PURCHASE_TACTIC_COST, DRILL_COST, XP_PER_SPAR } from '../models/progression.js'
import { trainBotFromGame } from '../ml/training-pipeline.js'
import { loadModel } from '../ml/model-store.js'
import { generateEmotionResponse } from '../models/personality.js'
import type { MoveSelectorContext } from '../engine/move-selector.js'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const tacticsData = require('../data/tactics.json') as { tactics: Array<{ key: string; name: string; description: string; category: string; minLevel: number; cost: number }> }

const ALIGNMENT_ATTACK_MAP: Record<string, number> = { aggressive: 0, balanced: 1, defensive: 2 }
const ALIGNMENT_STYLE_MAP: Record<string, number> = { chaotic: 0, positional: 1, sacrificial: 2 }

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
      opponentElo = (level * 100) + 300
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

    // Load ML model for the bot if available
    const mlModel = await loadModel(this.db, botId)

    const botContext: MoveSelectorContext = {
      mlModel,
      botColor: undefined, // Set below after coin flip
      botAttributes: {
        aggression: bot.aggression,
        positional: bot.positional,
        tactical: bot.tactical,
        endgame: bot.endgame,
        creativity: bot.creativity,
      },
      alignmentAttack: ALIGNMENT_ATTACK_MAP[bot.alignmentAttack] ?? 1,
      alignmentStyle: ALIGNMENT_STYLE_MAP[bot.alignmentStyle] ?? 1,
    }

    // Randomly assign colors
    const botIsWhite = Math.random() < 0.5
    const botColor = botIsWhite ? 'w' as const : 'b' as const
    botContext.botColor = botColor

    const whiteParams = botIsWhite ? botParams : opponentParams
    const blackParams = botIsWhite ? opponentParams : botParams

    const gameResult = await simulateGame(whiteParams, blackParams, this.pool, {
      whiteContext: botIsWhite ? botContext : undefined,
      blackContext: botIsWhite ? undefined : botContext,
    })

    // ML Training: learn from the game
    const mlTrainingResult = await trainBotFromGame(
      this.db,
      botId,
      gameResult.positions,
      gameResult.result,
      botColor,
      {
        aggression: bot.aggression,
        positional: bot.positional,
        tactical: bot.tactical,
        endgame: bot.endgame,
        creativity: bot.creativity,
        alignmentAttack: bot.alignmentAttack,
        alignmentStyle: bot.alignmentStyle,
      },
    )

    // Calculate Elo change
    const eloChange = calculateEloChange(bot.elo, opponentElo, gameResult.result, botIsWhite)
    const newElo = Math.max(100, bot.elo + eloChange)

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
        elo: newElo,
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
        mlTraining: {
          samplesUsed: mlTrainingResult.samplesUsed,
          finalLoss: mlTrainingResult.epochLosses[mlTrainingResult.epochLosses.length - 1] ?? null,
        },
      }),
    }).run()

    // Generate emotion/personality response
    const botWon = (gameResult.result === '1-0' && botIsWhite) || (gameResult.result === '0-1' && !botIsWhite)
    const botLost = (gameResult.result === '1-0' && !botIsWhite) || (gameResult.result === '0-1' && botIsWhite)
    const emotion = generateEmotionResponse(
      botWon ? 'win' : botLost ? 'loss' : 'draw',
      'spar',
      bot.alignmentAttack,
      bot.alignmentStyle,
      bot.level,
      gameResult.moveCount,
    )

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
      newElo,
      xpGained: XP_PER_SPAR,
      trainingPointsRemaining: bot.trainingPointsRemaining - SPAR_COST,
      mlTraining: {
        samplesUsed: mlTrainingResult.samplesUsed,
        finalLoss: mlTrainingResult.epochLosses[mlTrainingResult.epochLosses.length - 1] ?? null,
        improved: mlTrainingResult.epochLosses.length >= 2 &&
          mlTrainingResult.epochLosses[mlTrainingResult.epochLosses.length - 1] <
          mlTrainingResult.epochLosses[0],
      },
      emotion,
    }
  }

  async purchaseTactic(botId: number, tacticKey: string) {
    const bot = this.db.select().from(bots).where(eq(bots.id, botId)).get()
    if (!bot) throw new Error('Bot not found')
    if (bot.trainingPointsRemaining < PURCHASE_TACTIC_COST) {
      throw new Error(`Not enough training points. Need ${PURCHASE_TACTIC_COST}, have ${bot.trainingPointsRemaining}`)
    }

    // Validate tactic exists
    const tactic = tacticsData.tactics.find(t => t.key === tacticKey)
    if (!tactic) throw new Error('Unknown tactic')
    if (bot.level < tactic.minLevel) {
      throw new Error(`Requires level ${tactic.minLevel}, bot is level ${bot.level}`)
    }

    // Check if already owned
    const existing = this.db.select().from(botTactics)
      .where(and(eq(botTactics.botId, botId), eq(botTactics.tacticKey, tacticKey)))
      .get()
    if (existing) throw new Error('Already owns this tactic')

    // Purchase
    this.db.insert(botTactics).values({
      botId,
      tacticKey,
      proficiency: 20,
    }).run()

    this.db.update(bots)
      .set({ trainingPointsRemaining: bot.trainingPointsRemaining - PURCHASE_TACTIC_COST })
      .where(eq(bots.id, botId))
      .run()

    this.db.insert(trainingLog).values({
      botId,
      level: bot.level,
      actionType: 'purchase_tactic',
      detailsJson: JSON.stringify({ tacticKey, tacticName: tactic.name }),
      resultJson: JSON.stringify({ proficiency: 20 }),
    }).run()

    const emotion = generateEmotionResponse(
      null, 'tactic_learned',
      bot.alignmentAttack, bot.alignmentStyle, bot.level,
    )

    return {
      tactic: { key: tacticKey, name: tactic.name, proficiency: 20 },
      trainingPointsRemaining: bot.trainingPointsRemaining - PURCHASE_TACTIC_COST,
      emotion,
    }
  }

  async drill(botId: number, tacticKey: string) {
    const bot = this.db.select().from(bots).where(eq(bots.id, botId)).get()
    if (!bot) throw new Error('Bot not found')
    if (bot.trainingPointsRemaining < DRILL_COST) {
      throw new Error(`Not enough training points. Need ${DRILL_COST}, have ${bot.trainingPointsRemaining}`)
    }

    // Must own the tactic
    const owned = this.db.select().from(botTactics)
      .where(and(eq(botTactics.botId, botId), eq(botTactics.tacticKey, tacticKey)))
      .get()
    if (!owned) throw new Error('Bot does not own this tactic')

    // Increase proficiency (cap at 100)
    const newProficiency = Math.min(100, owned.proficiency + 15)
    this.db.update(botTactics)
      .set({ proficiency: newProficiency })
      .where(eq(botTactics.id, owned.id))
      .run()

    this.db.update(bots)
      .set({ trainingPointsRemaining: bot.trainingPointsRemaining - DRILL_COST })
      .where(eq(bots.id, botId))
      .run()

    this.db.insert(trainingLog).values({
      botId,
      level: bot.level,
      actionType: 'drill',
      detailsJson: JSON.stringify({ tacticKey }),
      resultJson: JSON.stringify({ oldProficiency: owned.proficiency, newProficiency }),
    }).run()

    const emotion = generateEmotionResponse(
      null, 'drill',
      bot.alignmentAttack, bot.alignmentStyle, bot.level,
    )

    return {
      tactic: { key: tacticKey, proficiency: newProficiency },
      trainingPointsRemaining: bot.trainingPointsRemaining - DRILL_COST,
      emotion,
    }
  }

  getTrainingLog(botId: number) {
    return this.db.select().from(trainingLog)
      .where(eq(trainingLog.botId, botId))
      .all()
      .map(entry => ({
        ...entry,
        details: JSON.parse(entry.detailsJson),
        result: JSON.parse(entry.resultJson),
      }))
  }
}
