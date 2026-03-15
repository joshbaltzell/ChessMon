import { eq, and, sql } from 'drizzle-orm'
import { botAchievements, bots, botTactics, gameRecords, ladderProgress, playSessions, cardHands } from '../db/schema.js'
import type { DrizzleDb } from '../db/connection.js'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const achievementsData = require('../data/achievements.json') as {
  achievements: Array<{
    key: string
    name: string
    description: string
    category: string
    icon: string
    condition: { type: string; threshold: number }
  }>
}

const ACHIEVEMENTS = achievementsData.achievements

export interface AchievementStats {
  gamesPlayed: number
  wins: number
  winStreak: number
  level: number
  elo: number
  openingsOwned: number
  maxProficiency: number
  bossesDefeated: number
  pilotWins: number
  pvpWins: number
  dailyStreak: number
}

export interface AchievementWithStatus {
  key: string
  name: string
  description: string
  category: string
  icon: string
  unlocked: boolean
  unlockedAt: Date | null
}

export class AchievementService {
  constructor(private db: DrizzleDb) {}

  /** Check all achievements and award any newly earned ones. Returns newly unlocked keys. */
  checkAndAward(botId: number, stats: AchievementStats): string[] {
    const existing = this.getUnlockedKeys(botId)
    const newlyUnlocked: string[] = []

    for (const achievement of ACHIEVEMENTS) {
      if (existing.has(achievement.key)) continue
      if (this.meetsCondition(achievement.condition, stats)) {
        try {
          this.db.insert(botAchievements).values({
            botId,
            achievementKey: achievement.key,
          }).run()
          newlyUnlocked.push(achievement.key)
        } catch {
          // Unique constraint violation — already unlocked (race condition)
        }
      }
    }
    return newlyUnlocked
  }

  /** Build stats from bot state + aggregated queries */
  buildStats(botId: number): AchievementStats {
    const bot = this.db.select().from(bots).where(eq(bots.id, botId)).get()
    if (!bot) return this.emptyStats()

    // Count wins from game records where this bot played
    const winCount = this.db.select({ count: sql<number>`count(*)` }).from(gameRecords)
      .where(sql`(white_bot_id = ${botId} AND result = '1-0') OR (black_bot_id = ${botId} AND result = '0-1')`)
      .get()

    // Count openings owned (tactics that correspond to openings)
    const OPENING_KEYS = ['italian_game', 'sicilian_defense', 'french_defense', 'queens_gambit', 'kings_indian', 'london_system']
    const ownedTactics = this.db.select().from(botTactics).where(eq(botTactics.botId, botId)).all()
    const openingsOwned = ownedTactics.filter(t => OPENING_KEYS.includes(t.tacticKey)).length
    const maxProficiency = ownedTactics.length > 0 ? Math.max(...ownedTactics.map(t => t.proficiency)) : 0

    // Count bosses defeated (completed ladder opponents)
    const bossesDefeated = this.db.select({ count: sql<number>`count(*)` }).from(ladderProgress)
      .where(and(eq(ladderProgress.botId, botId), eq(ladderProgress.defeated, 1)))
      .get()

    // Count pilot wins
    const pilotWins = this.db.select({ count: sql<number>`count(*)` }).from(playSessions)
      .where(and(
        eq(playSessions.botId, botId),
        eq(playSessions.status, 'complete'),
        sql`(
          (player_color = 'w' AND result = '1-0') OR
          (player_color = 'b' AND result = '0-1')
        )`,
      ))
      .get()

    // Count PvP wins
    const pvpWins = this.db.select({ count: sql<number>`count(*)` }).from(gameRecords)
      .where(and(
        eq(gameRecords.context, 'pvp'),
        sql`(
          (white_bot_id = ${botId} AND result = '1-0') OR
          (black_bot_id = ${botId} AND result = '0-1')
        )`,
      ))
      .get()

    // Win streak from card hands
    const hand = this.db.select().from(cardHands).where(eq(cardHands.botId, botId)).get()

    return {
      gamesPlayed: bot.gamesPlayed,
      wins: winCount?.count ?? 0,
      winStreak: hand?.winStreak ?? 0,
      level: bot.level,
      elo: bot.elo,
      openingsOwned,
      maxProficiency,
      bossesDefeated: bossesDefeated?.count ?? 0,
      pilotWins: pilotWins?.count ?? 0,
      pvpWins: pvpWins?.count ?? 0,
      dailyStreak: bot.dailyCheckInStreak,
    }
  }

  getUnlockedKeys(botId: number): Set<string> {
    const rows = this.db.select().from(botAchievements)
      .where(eq(botAchievements.botId, botId))
      .all()
    return new Set(rows.map(r => r.achievementKey))
  }

  getAllWithStatus(botId: number): AchievementWithStatus[] {
    const unlocked = this.db.select().from(botAchievements)
      .where(eq(botAchievements.botId, botId))
      .all()
    const unlockedMap = new Map(unlocked.map(u => [u.achievementKey, u.unlockedAt]))

    return ACHIEVEMENTS.map(a => ({
      key: a.key,
      name: a.name,
      description: a.description,
      category: a.category,
      icon: a.icon,
      unlocked: unlockedMap.has(a.key),
      unlockedAt: unlockedMap.get(a.key) ?? null,
    }))
  }

  private meetsCondition(condition: { type: string; threshold: number }, stats: AchievementStats): boolean {
    switch (condition.type) {
      case 'games_played': return stats.gamesPlayed >= condition.threshold
      case 'wins': return stats.wins >= condition.threshold
      case 'win_streak': return stats.winStreak >= condition.threshold
      case 'level': return stats.level >= condition.threshold
      case 'elo': return stats.elo >= condition.threshold
      case 'openings_owned': return stats.openingsOwned >= condition.threshold
      case 'max_proficiency': return stats.maxProficiency >= condition.threshold
      case 'bosses_defeated': return stats.bossesDefeated >= condition.threshold
      case 'pilot_wins': return stats.pilotWins >= condition.threshold
      case 'pvp_wins': return stats.pvpWins >= condition.threshold
      case 'daily_streak': return stats.dailyStreak >= condition.threshold
      default: return false
    }
  }

  private emptyStats(): AchievementStats {
    return {
      gamesPlayed: 0, wins: 0, winStreak: 0, level: 0, elo: 0,
      openingsOwned: 0, maxProficiency: 0, bossesDefeated: 0,
      pilotWins: 0, pvpWins: 0, dailyStreak: 0,
    }
  }
}
