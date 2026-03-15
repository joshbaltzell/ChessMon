import { eq, or, and, desc } from 'drizzle-orm'
import { bots, botTactics, trainingLog, gameRecords, levelTests, championshipBouts } from '../db/schema.js'
import type { DrizzleDb } from '../db/connection.js'
import { getAsciiArt, getAvailableSkins, getDesignPacks } from '../models/cosmetics.js'
import { generateEmotionResponse, getBotCatchphrase } from '../models/personality.js'
import { LEVEL_CONFIGS, XP_PER_SPAR } from '../models/progression.js'
import { getBestOpeningBook } from '../engine/opening-book.js'
import { loadModel } from '../ml/model-store.js'
import { probeStyle, type StyleProfile } from '../ml/style-probe.js'
import { CardService } from './card.service.js'
import { LadderService } from './ladder.service.js'
import { processAbsence, type AbsenceReport } from './auto-fight.service.js'
import { DailyQuestService } from './daily-quest.service.js'
import { AchievementService } from './achievement.service.js'
import { ALIGNMENT_ATTACK_MAP, ALIGNMENT_STYLE_MAP } from '../types/index.js'

export class DashboardService {
  private cardService: CardService
  private ladderService: LadderService
  private dailyQuestService: DailyQuestService
  private achievementService: AchievementService

  constructor(private db: DrizzleDb) {
    this.cardService = new CardService(db)
    this.ladderService = new LadderService(db)
    this.dailyQuestService = new DailyQuestService(db)
    this.achievementService = new AchievementService(db)
  }

  async getBotDashboard(botId: number) {
    const bot = this.db.select().from(bots).where(eq(bots.id, botId)).get()
    if (!bot) throw new Error('Bot not found')

    const tactics = this.db.select().from(botTactics).where(eq(botTactics.botId, botId)).all()
    const recentGames = this.db.select().from(gameRecords)
      .where(or(eq(gameRecords.whiteBotId, botId), eq(gameRecords.blackBotId, botId)))
      .orderBy(desc(gameRecords.createdAt))
      .limit(5)
      .all()

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
    const botGames = this.db.select().from(gameRecords)
      .where(or(eq(gameRecords.whiteBotId, botId), eq(gameRecords.blackBotId, botId)))
      .all()
    let wins = 0, losses = 0, draws = 0
    for (const game of botGames) {
      const isWhite = game.whiteBotId === botId
      if (game.result === '1-0') isWhite ? wins++ : losses++
      else if (game.result === '0-1') isWhite ? losses++ : wins++
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

    const handState = this.getHandStateWith(this.cardService, botId)
    const ladderState = this.getLadderState(botId)
    const streak = this.cardService.getWinStreak(botId)
    const championship = this.getChampionshipState(botId)

    // Process autonomous fights while away
    let overnightReport: AbsenceReport | null = null
    try {
      overnightReport = processAbsence(this.db, botId)
    } catch { /* non-critical */ }

    // Daily quests and streak
    const dailyQuests = this.dailyQuestService.getDailyQuests(botId)
    const streakInfo = this.dailyQuestService.getStreakInfo(botId)

    const contextCues = this.generateContextCues(bot, handState, ladderState)

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
        pgn: g.pgn,
        recap: g.recapJson ? JSON.parse(g.recapJson) : null,
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
      hand: handState,
      ladder: ladderState,
      streak,
      championship,
      contextCues,
      overnightReport,
      dailyQuests,
      streakInfo,
      achievements: this.achievementService.getAllWithStatus(botId),
      newAchievements: this.checkAchievements(botId),
    }
  }

  private checkAchievements(botId: number): string[] {
    try {
      const stats = this.achievementService.buildStats(botId)
      return this.achievementService.checkAndAward(botId, stats)
    } catch {
      return []
    }
  }

  private getLadderState(botId: number) {
    try {
      return this.ladderService.getLadderState(botId)
    } catch {
      return null
    }
  }

  private getChampionshipState(botId: number) {
    try {
      const activeBout = this.db.select().from(championshipBouts)
        .where(and(
          eq(championshipBouts.botId, botId),
          eq(championshipBouts.status, 'active'),
        ))
        .get() ?? null
      if (!activeBout) return null
      return {
        id: activeBout.id,
        targetLevel: activeBout.targetLevel,
        gamesPlayed: activeBout.gamesPlayed,
        gamesWon: activeBout.gamesWon,
        currentRound: activeBout.currentRound,
        status: activeBout.status,
      }
    } catch {
      return null
    }
  }

  private generateContextCues(
    bot: any,
    handState: any,
    ladderState: any,
  ): { type: string; text: string } | null {
    // If hand has cards and energy >= minimum card cost, suggest playing a card
    if (handState && handState.cards && handState.cards.length > 0) {
      const minCost = Math.min(...handState.cards.map((c: any) => c.energy))
      if (handState.energy >= minCost && minCost > 0) {
        return { type: 'energy_ready', text: 'Energy charged! Time for a card play?' }
      }
    }

    // If bot elo >= 80% of next ladder opponent elo, suggest boss fight
    if (ladderState && !ladderState.allDefeated) {
      const nextOpp = ladderState.opponents.find((o: any) => !o.defeated)
      if (nextOpp && bot.elo >= nextOpp.elo * 0.8) {
        return { type: 'boss_ready', text: `Almost ready for ${nextOpp.name}...` }
      }
    }

    return null
  }

  private getHandStateWith(cardService: CardService, botId: number) {
    try {
      return cardService.getHandState(botId)
    } catch {
      return null
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
