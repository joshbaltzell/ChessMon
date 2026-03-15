import { eq, desc, ne, and } from 'drizzle-orm'
import { bots, botTactics, levelTests, gameRecords, trainingLog } from '../db/schema.js'
import type { DrizzleDb } from '../db/connection.js'
import type { StockfishPool } from '../engine/stockfish-pool.js'
import { simulateGame } from '../engine/game-simulator.js'
import { botToPlayParameters, systemBotPlayParameters } from '../models/bot-intelligence.js'
import { calculateEloChange } from '../models/elo.js'
import {
  LEVEL_CONFIGS, BONUS_POINTS_ON_FAILURE, XP_PER_LEVEL_TEST,
} from '../models/progression.js'
import { trainBotFromGame } from '../ml/training-pipeline.js'
import { loadModel } from '../ml/model-store.js'
import { generateEmotionResponse } from '../models/personality.js'
import { getBestOpeningBook } from '../engine/opening-book.js'
import type { MoveSelectorContext } from '../engine/move-selector.js'
import { ALIGNMENT_ATTACK_MAP, ALIGNMENT_STYLE_MAP, type GameResult } from '../types/index.js'

interface LevelTestOpponent {
  type: 'system' | 'player'
  level?: number
  botId?: number
  name: string
  elo: number
}

interface LevelTestGameResult {
  opponentName: string
  result: GameResult
  botPlayedWhite: boolean
  moveCount: number
  gameRecordId: number
}

export class LevelTestService {
  constructor(
    private db: DrizzleDb,
    private pool: StockfishPool,
  ) {}

  async startLevelTest(botId: number): Promise<{
    testId: number
    level: number
    passed: boolean
    wins: number
    losses: number
    draws: number
    winsRequired: number
    games: LevelTestGameResult[]
    eloChange: number
    newElo: number
    xpGained: number
    bonusPoints: number
    leveledUp: boolean
    newLevel: number
    emotion: ReturnType<typeof generateEmotionResponse>
  }> {
    const bot = this.db.select().from(bots).where(eq(bots.id, botId)).get()
    if (!bot) throw new Error('Bot not found')

    const nextLevel = bot.level + 1
    if (nextLevel > 20) throw new Error('Already at max level')

    const config = LEVEL_CONFIGS[nextLevel]
    if (!config) throw new Error(`No config for level ${nextLevel}`)

    // Select opponents
    const opponents = this.selectOpponents(bot.id, nextLevel, config)

    // Load ML model and opening book
    const mlModel = await loadModel(this.db, botId)
    const botTacticsOwned = this.db.select().from(botTactics).where(eq(botTactics.botId, botId)).all()
    const openingBook = getBestOpeningBook(botTacticsOwned)

    const botParams = botToPlayParameters(bot, openingBook)
    const botContext: MoveSelectorContext = {
      mlModel,
      botColor: undefined,
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

    // Play all test games in parallel — each gets its own context copy
    const gamePromises = opponents.map(async (opponent) => {
      const opponentParams = opponent.type === 'system'
        ? systemBotPlayParameters(opponent.level!)
        : botToPlayParameters(
            this.db.select().from(bots).where(eq(bots.id, opponent.botId!)).get()!
          )

      const botIsWhite = Math.random() < 0.5
      const botColor = botIsWhite ? 'w' as const : 'b' as const

      // Each parallel game needs its own context (botColor differs)
      const gameContext: MoveSelectorContext = {
        mlModel: botContext.mlModel,
        botColor,
        botAttributes: botContext.botAttributes,
        alignmentAttack: botContext.alignmentAttack,
        alignmentStyle: botContext.alignmentStyle,
      }

      const gameResult = await simulateGame(
        botIsWhite ? botParams : opponentParams,
        botIsWhite ? opponentParams : botParams,
        this.pool,
        {
          whiteContext: botIsWhite ? gameContext : undefined,
          blackContext: botIsWhite ? undefined : gameContext,
        },
      )

      return { opponent, gameResult, botIsWhite, botColor }
    })

    const completedGames = await Promise.all(gamePromises)

    // Process results sequentially (ML training mutates model, DB writes are serialized)
    const games: LevelTestGameResult[] = []
    let wins = 0
    let losses = 0
    let draws = 0
    let totalEloChange = 0

    for (const { opponent, gameResult, botIsWhite, botColor } of completedGames) {
      // ML training from each game (sequential — model mutation)
      await trainBotFromGame(
        this.db, botId, gameResult.positions, gameResult.result, botColor,
        {
          aggression: bot.aggression, positional: bot.positional,
          tactical: bot.tactical, endgame: bot.endgame,
          creativity: bot.creativity,
          alignmentAttack: bot.alignmentAttack, alignmentStyle: bot.alignmentStyle,
        },
      )

      const eloChange = calculateEloChange(bot.elo + totalEloChange, opponent.elo, gameResult.result, botIsWhite)
      totalEloChange += eloChange

      const botWon = (gameResult.result === '1-0' && botIsWhite) || (gameResult.result === '0-1' && !botIsWhite)
      const botLost = (gameResult.result === '1-0' && !botIsWhite) || (gameResult.result === '0-1' && botIsWhite)
      if (botWon) wins++
      else if (botLost) losses++
      else draws++

      const gameRecord = this.db.insert(gameRecords).values({
        whiteBotId: botIsWhite ? botId : (opponent.botId || null),
        blackBotId: botIsWhite ? (opponent.botId || null) : botId,
        whiteSystemLevel: botIsWhite ? null : (opponent.type === 'system' ? opponent.level! : null),
        blackSystemLevel: botIsWhite ? (opponent.type === 'system' ? opponent.level! : null) : null,
        pgn: gameResult.pgn,
        result: gameResult.result,
        moveCount: gameResult.moveCount,
        context: 'level_test',
      }).returning().get()

      games.push({
        opponentName: opponent.name,
        result: gameResult.result,
        botPlayedWhite: botIsWhite,
        moveCount: gameResult.moveCount,
        gameRecordId: gameRecord.id,
      })
    }

    // Determine pass/fail
    // Level 20 special: need draws+ against ceiling bot
    const passed = nextLevel === 20
      ? (wins + draws) >= config.winsRequired
      : wins >= config.winsRequired

    // Calculate level up
    const leveledUp = passed
    const newLevel = leveledUp ? nextLevel : bot.level
    const bonusPoints = passed ? 0 : BONUS_POINTS_ON_FAILURE
    const newElo = Math.max(100, bot.elo + totalEloChange)

    // ASCII tier upgrade on level up
    const newAsciiTier = leveledUp
      ? (newLevel <= 4 ? 1 : newLevel <= 8 ? 2 : newLevel <= 12 ? 3 : newLevel <= 16 ? 4 : 5)
      : bot.asciiTier

    // Store level test record
    const testRecord = this.db.insert(levelTests).values({
      botId,
      level: nextLevel,
      opponentsJson: JSON.stringify(opponents.map(o => ({ type: o.type, name: o.name, elo: o.elo }))),
      resultsJson: JSON.stringify({ wins, losses, draws, winsRequired: config.winsRequired }),
      gameIdsJson: JSON.stringify(games.map(g => g.gameRecordId)),
      passed: passed ? 1 : 0,
    }).returning().get()

    // Update bot
    const newTrainingPoints = leveledUp
      ? (LEVEL_CONFIGS[newLevel]?.trainingPoints ?? bot.trainingPointsRemaining)
      : bot.trainingPointsRemaining + bonusPoints

    this.db.update(bots)
      .set({
        level: newLevel,
        elo: newElo,
        gamesPlayed: bot.gamesPlayed + games.length,
        xp: bot.xp + XP_PER_LEVEL_TEST,
        trainingPointsRemaining: newTrainingPoints,
        asciiTier: newAsciiTier,
      })
      .where(eq(bots.id, botId))
      .run()

    // Log
    this.db.insert(trainingLog).values({
      botId,
      level: bot.level,
      actionType: 'spar', // level test is logged as a special spar
      detailsJson: JSON.stringify({
        type: 'level_test',
        targetLevel: nextLevel,
        opponents: opponents.map(o => o.name),
      }),
      resultJson: JSON.stringify({
        passed,
        wins, losses, draws,
        winsRequired: config.winsRequired,
        eloChange: totalEloChange,
        testId: testRecord.id,
      }),
    }).run()

    // Emotion
    const emotion = generateEmotionResponse(
      passed ? 'win' : 'loss',
      leveledUp ? 'level_up' : 'level_test',
      bot.alignmentAttack,
      bot.alignmentStyle,
      newLevel,
    )

    return {
      testId: testRecord.id,
      level: nextLevel,
      passed,
      wins, losses, draws,
      winsRequired: config.winsRequired,
      games,
      eloChange: totalEloChange,
      newElo,
      xpGained: XP_PER_LEVEL_TEST,
      bonusPoints,
      leveledUp,
      newLevel,
      emotion,
    }
  }

  getTestById(testId: number) {
    return this.db.select().from(levelTests).where(eq(levelTests.id, testId)).get()
  }

  getTestsForBot(botId: number) {
    return this.db.select().from(levelTests)
      .where(eq(levelTests.botId, botId))
      .orderBy(desc(levelTests.createdAt))
      .all()
  }

  private selectOpponents(botId: number, targetLevel: number, config: typeof LEVEL_CONFIGS[1]): LevelTestOpponent[] {
    const opponents: LevelTestOpponent[] = []

    // Add system bot opponents
    for (let i = 0; i < config.systemBotCount; i++) {
      const sysLevel = Math.max(1, targetLevel - 1 + i) // spread around target level
      opponents.push({
        type: 'system',
        level: Math.min(sysLevel, 20),
        name: `System Bot Level ${Math.min(sysLevel, 20)}`,
        elo: Math.min(sysLevel, 20) * 100 + 300,
      })
    }

    // Add player bot opponents (from the leaderboard near the target elo)
    if (config.playerBotCount > 0) {
      const targetElo = config.eloTarget
      const playerBots = this.db.select()
        .from(bots)
        .where(ne(bots.id, botId))
        .orderBy(desc(bots.elo))
        .limit(50)
        .all()

      // Sort by closeness to target elo
      const sorted = playerBots
        .map(b => ({ ...b, eloDiff: Math.abs(b.elo - targetElo) }))
        .sort((a, b) => a.eloDiff - b.eloDiff)

      const selected = sorted.slice(0, config.playerBotCount)

      for (const pb of selected) {
        opponents.push({
          type: 'player',
          botId: pb.id,
          name: pb.name,
          elo: pb.elo,
        })
      }

      // If not enough player bots, fill with system bots
      const shortfall = config.playerBotCount - selected.length
      for (let i = 0; i < shortfall; i++) {
        opponents.push({
          type: 'system',
          level: targetLevel,
          name: `System Bot Level ${targetLevel} (fill)`,
          elo: targetLevel * 100 + 300,
        })
      }
    }

    return opponents
  }
}
