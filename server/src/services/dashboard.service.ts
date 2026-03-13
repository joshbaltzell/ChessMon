import { eq, desc } from 'drizzle-orm'
import { bots, botTactics, trainingLog, gameRecords, levelTests } from '../db/schema.js'
import type { DrizzleDb } from '../db/connection.js'
import { getAsciiArt, getAvailableSkins, getDesignPacks } from '../models/cosmetics.js'
import { generateEmotionResponse, getBotCatchphrase } from '../models/personality.js'
import { LEVEL_CONFIGS, XP_PER_SPAR } from '../models/progression.js'
import { getBestOpeningBook } from '../engine/opening-book.js'
import { loadModel } from '../ml/model-store.js'
import { probeStyle, type StyleProfile } from '../ml/style-probe.js'

const ALIGNMENT_ATTACK_MAP: Record<string, number> = { aggressive: 0, balanced: 1, defensive: 2 }
const ALIGNMENT_STYLE_MAP: Record<string, number> = { chaotic: 0, positional: 1, sacrificial: 2 }

export class DashboardService {
  constructor(private db: DrizzleDb) {}

  async getBotDashboard(botId: number) {
    const bot = this.db.select().from(bots).where(eq(bots.id, botId)).get()
    if (!bot) throw new Error('Bot not found')

    const tactics = this.db.select().from(botTactics).where(eq(botTactics.botId, botId)).all()
    const recentGames = this.db.select().from(gameRecords)
      .where(eq(gameRecords.whiteBotId, botId))
      .orderBy(desc(gameRecords.createdAt))
      .limit(5)
      .all()
      .concat(
        this.db.select().from(gameRecords)
          .where(eq(gameRecords.blackBotId, botId))
          .orderBy(desc(gameRecords.createdAt))
          .limit(5)
          .all()
      )
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
      .slice(0, 5)

    const recentLog = this.db.select().from(trainingLog)
      .where(eq(trainingLog.botId, botId))
      .orderBy(desc(trainingLog.createdAt))
      .limit(10)
      .all()
      .map(entry => ({
        id: entry.id,
        level: entry.level,
        actionType: entry.actionType,
        details: JSON.parse(entry.detailsJson),
        result: JSON.parse(entry.resultJson),
      }))

    const latestLevelTest = this.db.select().from(levelTests)
      .where(eq(levelTests.botId, botId))
      .orderBy(desc(levelTests.createdAt))
      .limit(1)
      .get()

    // Current level config
    const levelConfig = LEVEL_CONFIGS[bot.level]
    const nextLevelConfig = LEVEL_CONFIGS[bot.level + 1]

    // XP to next level (simplified: 100 XP per level)
    const xpForNextLevel = bot.level * 100
    const xpProgress = Math.min(100, Math.round((bot.xp / xpForNextLevel) * 100))

    // Mood based on recent performance
    const lastGame = recentGames[0]
    let lastOutcome: 'win' | 'loss' | 'draw' | null = null
    if (lastGame) {
      const wasWhite = lastGame.whiteBotId === botId
      if (lastGame.result === '1-0') lastOutcome = wasWhite ? 'win' : 'loss'
      else if (lastGame.result === '0-1') lastOutcome = wasWhite ? 'loss' : 'win'
      else lastOutcome = 'draw'
    }

    const emotion = generateEmotionResponse(
      lastOutcome,
      lastOutcome ? 'spar' : 'idle',
      bot.alignmentAttack,
      bot.alignmentStyle,
      bot.level,
      lastGame?.moveCount,
    )

    // Opening book
    const openingBook = getBestOpeningBook(tactics)

    // Win/loss record
    const allGames = this.db.select().from(gameRecords).all()
    let wins = 0, losses = 0, draws = 0
    for (const game of allGames) {
      const isWhite = game.whiteBotId === botId
      const isBlack = game.blackBotId === botId
      if (!isWhite && !isBlack) continue
      if (game.result === '1-0') isWhite ? wins++ : losses++
      else if (game.result === '0-1') isBlack ? wins++ : losses++
      else draws++
    }

    // ASCII art
    const asciiArt = getAsciiArt(bot.asciiTier, emotion.mood, bot.alignmentAttack)
    const catchphrase = getBotCatchphrase(bot.alignmentAttack, bot.alignmentStyle)

    // Available cosmetics
    const skins = getAvailableSkins(bot.level, bot.gamesPlayed)
    const designPacks = getDesignPacks(bot.level, bot.gamesPlayed)

    // Style profile from ML model (if trained)
    let learnedStyle: StyleProfile | null = null
    try {
      const mlModel = await loadModel(this.db, botId)
      if (mlModel) {
        learnedStyle = probeStyle(
          mlModel,
          { aggression: bot.aggression, positional: bot.positional, tactical: bot.tactical, endgame: bot.endgame, creativity: bot.creativity },
          ALIGNMENT_ATTACK_MAP[bot.alignmentAttack] ?? 1,
          ALIGNMENT_STYLE_MAP[bot.alignmentStyle] ?? 1,
        )
      }
    } catch { /* ML probe failed, non-critical */ }

    return {
      identity: {
        id: bot.id,
        name: bot.name,
        catchphrase,
        alignmentAttack: bot.alignmentAttack,
        alignmentStyle: bot.alignmentStyle,
      },
      stats: {
        level: bot.level,
        elo: bot.elo,
        xp: bot.xp,
        xpForNextLevel,
        xpProgress,
        gamesPlayed: bot.gamesPlayed,
        record: { wins, losses, draws },
        winRate: bot.gamesPlayed > 0 ? Math.round((wins / bot.gamesPlayed) * 100) : 0,
      },
      attributes: {
        aggression: bot.aggression,
        positional: bot.positional,
        tactical: bot.tactical,
        endgame: bot.endgame,
        creativity: bot.creativity,
        dominant: getDominantAttribute(bot),
      },
      training: {
        pointsRemaining: bot.trainingPointsRemaining,
        pointsTotal: levelConfig?.trainingPoints ?? 0,
        recentLog,
      },
      tactics: tactics.map(t => ({
        key: t.tacticKey,
        proficiency: t.proficiency,
        isOpening: openingBook?.key === t.tacticKey,
      })),
      appearance: {
        asciiTier: bot.asciiTier,
        asciiArt,
        skinId: bot.skinId,
        availableSkins: skins,
        availableDesignPacks: designPacks,
      },
      mood: emotion,
      recentGames: recentGames.map(g => ({
        id: g.id,
        result: g.result,
        moveCount: g.moveCount,
        context: g.context,
        wasWhite: g.whiteBotId === botId,
      })),
      levelTest: latestLevelTest ? {
        level: latestLevelTest.level,
        passed: latestLevelTest.passed === 1,
        results: JSON.parse(latestLevelTest.resultsJson),
      } : null,
      learnedStyle: learnedStyle ? {
        aggressiveness: learnedStyle.aggressiveness,
        positionality: learnedStyle.positionality,
        tacticalSharpness: learnedStyle.tacticalSharpness,
        endgameGrip: learnedStyle.endgameGrip,
        unpredictability: learnedStyle.unpredictability,
        gamesAnalyzed: bot.gamesPlayed,
      } : null,
      nextChallenge: nextLevelConfig ? {
        targetLevel: bot.level + 1,
        targetElo: nextLevelConfig.eloTarget,
        testGames: nextLevelConfig.testGames,
        winsRequired: nextLevelConfig.winsRequired,
      } : { message: 'Maximum level reached!' },
    }
  }
}

function getDominantAttribute(bot: { aggression: number; positional: number; tactical: number; endgame: number; creativity: number }): string {
  const attrs = [
    { name: 'aggression', value: bot.aggression },
    { name: 'positional', value: bot.positional },
    { name: 'tactical', value: bot.tactical },
    { name: 'endgame', value: bot.endgame },
    { name: 'creativity', value: bot.creativity },
  ]
  attrs.sort((a, b) => b.value - a.value)
  if (attrs[0].value === attrs[1].value) return 'balanced'
  return attrs[0].name
}
